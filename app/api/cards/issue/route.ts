import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import {
  getOwnerData,
  hashTransferCode,
  isOwner,
  isTransferPending,
  makeTransferCode,
  makeTransferCodeSalt,
  verifyBearerToken,
} from '@/lib/cardServer';

export const runtime = 'nodejs';

function errorResponse(error: unknown) {
  const code =
    error instanceof Error
      ? error.message
      : 'CARD_TRANSFER_ISSUE_FAILED';

  const status =
    code === 'AUTH_REQUIRED'
      ? 401
      : code === 'CARD_NOT_FOUND'
        ? 404
        : code === 'PERMISSION_DENIED'
          ? 403
          : code === 'CARD_TRANSFER_PENDING'
            ? 409
            : code === 'CARD_DELETED'
              ? 409
              : 400;

  return NextResponse.json(
    { ok: false, error: code },
    { status },
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

    const cardRef = adminDb
      .collection('cards')
      .doc(cardId);

    const ownerRef = adminDb
      .collection('cardOwners')
      .doc(cardId);

    const now = new Date().toISOString();

    const code = makeTransferCode();
    const salt = makeTransferCodeSalt();
    const codeHash = hashTransferCode(
      code,
      salt,
    );

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

        const owner = getOwnerData(
          ownerSnapshot.data() as Record<
            string,
            unknown
          >,
        );

        if (card.status !== 'active') {
          throw new Error('CARD_DELETED');
        }

        if (!isOwner(owner, user)) {
          throw new Error('PERMISSION_DENIED');
        }

        if (
          isTransferPending(owner) ||
          card.transferStatus === 'pending'
        ) {
          throw new Error('CARD_TRANSFER_PENDING');
        }

        transaction.update(cardRef, {
          transferStatus: 'pending',
          updatedAt: now,
        });

        transaction.update(ownerRef, {
          updatedAt: now,
          transfer: {
            status: 'pending',
            codeHash,
            codeSalt: salt,
            issuedAt: now,
          },
        });

        return {
          cardId,
          transferStatus: 'pending' as const,
        };
      },
    );

    return NextResponse.json({
      ok: true,
      code,
      ...result,
    });
  } catch (error) {
    console.error(
      'Card transfer issue API error:',
      error,
    );

    return errorResponse(error);
  }
}