import { NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { timingSafeEqual } from 'node:crypto';
import { adminDb } from '@/lib/firebaseAdmin';
import {
  getOwnerData,
  hashTransferCode,
  verifyBearerToken,
} from '@/lib/cardServer';

export const runtime = 'nodejs';

const TRANSFER_CODE_PATTERN =
  /^[A-HJ-NP-Z2-9]{4}(?:-[A-HJ-NP-Z2-9]{4}){3}$/;

function errorResponse(error: unknown) {
  const code =
    error instanceof Error
      ? error.message
      : 'CARD_TRANSFER_ACCEPT_FAILED';

  const status =
    code === 'AUTH_REQUIRED'
      ? 401
      : code === 'CARD_NOT_FOUND'
        ? 404
        : code === 'CARD_DELETED'
          ? 409
          : code === 'TRANSFER_NOT_PENDING'
            ? 409
            : code === 'INVALID_TRANSFER_CODE'
              ? 403
              : code === 'INVALID_CARD_ID'
                ? 400
                : 400;

  return NextResponse.json(
    {
      ok: false,
      error: code,
    },
    { status },
  );
}

function normalizeTransferCode(
  value: unknown,
) {
  if (typeof value !== 'string') {
    throw new Error('INVALID_TRANSFER_CODE');
  }

  const compactCode = value
    .trim()
    .replace(/[\s-]+/g, '')
    .toUpperCase();

  if (
    !/^[A-HJ-NP-Z2-9]{16}$/.test(
      compactCode,
    )
  ) {
    throw new Error('INVALID_TRANSFER_CODE');
  }

  const code = [
    compactCode.slice(0, 4),
    compactCode.slice(4, 8),
    compactCode.slice(8, 12),
    compactCode.slice(12, 16),
  ].join('-');

  if (!TRANSFER_CODE_PATTERN.test(code)) {
    throw new Error('INVALID_TRANSFER_CODE');
  }

  return code;
}

function isSameHash(
  expectedHash: string,
  actualHash: string,
) {
  if (
    !/^[a-f0-9]{64}$/.test(expectedHash) ||
    !/^[a-f0-9]{64}$/.test(actualHash)
  ) {
    return false;
  }

  return timingSafeEqual(
    Buffer.from(expectedHash, 'hex'),
    Buffer.from(actualHash, 'hex'),
  );
}

export async function POST(request: Request) {
  try {
    const user = await verifyBearerToken(request);
    const body = await request.json();

    if (
      !body ||
      typeof body !== 'object' ||
      Array.isArray(body) ||
      typeof body.cardId !== 'string'
    ) {
      throw new Error('INVALID_CARD_ID');
    }

    const cardId = body.cardId.trim();

    if (!/^card_[a-f0-9]{24}$/.test(cardId)) {
      throw new Error('INVALID_CARD_ID');
    }

    const code = normalizeTransferCode(
      body.code,
    );

    const cardRef = adminDb
      .collection('cards')
      .doc(cardId);

    const ownerRef = adminDb
      .collection('cardOwners')
      .doc(cardId);

    const now = new Date().toISOString();

    const result = await adminDb.runTransaction(
      async (transaction) => {
        const [
          cardSnapshot,
          ownerSnapshot,
        ] = await Promise.all([
          transaction.get(cardRef),
          transaction.get(ownerRef),
        ]);

        if (
          !cardSnapshot.exists ||
          !ownerSnapshot.exists
        ) {
          throw new Error('CARD_NOT_FOUND');
        }

        const card =
          cardSnapshot.data() as Record<
            string,
            unknown
          >;

        const ownerRaw =
          ownerSnapshot.data() as Record<
            string,
            unknown
          >;

        getOwnerData(ownerRaw);

        if (card.status !== 'active') {
          throw new Error('CARD_DELETED');
        }

        const rawTransfer =
          ownerRaw.transfer;

        if (
          !rawTransfer ||
          typeof rawTransfer !== 'object' ||
          Array.isArray(rawTransfer)
        ) {
          throw new Error('TRANSFER_NOT_PENDING');
        }

        const transfer =
          rawTransfer as Record<
            string,
            unknown
          >;

        if (
          transfer.status !== 'pending' ||
          typeof transfer.codeHash !== 'string' ||
          typeof transfer.codeSalt !== 'string'
        ) {
          throw new Error('TRANSFER_NOT_PENDING');
        }

        const actualHash = hashTransferCode(
          code,
          transfer.codeSalt,
        );

        if (
          !isSameHash(
            transfer.codeHash,
            actualHash,
          )
        ) {
          throw new Error(
            'INVALID_TRANSFER_CODE',
          );
        }

        transaction.update(cardRef, {
          transferStatus: 'none',
          updatedAt: now,
        });

        transaction.update(ownerRef, {
          ownerUid: user.uid,
          updatedAt: now,
          transfer: FieldValue.delete(),
        });

        return {
          cardId,
          status: 'active' as const,
          ownerUid: user.uid,
        };
      },
    );

    return NextResponse.json({
      ok: true,
      result,
    });
  } catch (error) {
    console.error(
      'Card transfer accept API error:',
      error,
    );

    return errorResponse(error);
  }
}