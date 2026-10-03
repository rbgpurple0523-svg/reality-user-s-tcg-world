import { NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebaseAdmin';
import {
  buildPublicCardFields,
  getOwnerData,
  isOwner,
  makeProfileHash,
  parseCardWritePayload,
  verifyBearerToken,
} from '@/lib/cardServer';
import type { PublicCard } from '@/lib/cardServer';

export const runtime = 'nodejs';

function errorResponse(error: unknown) {
  const code =
    error instanceof Error
      ? error.message
      : 'CARD_UPDATE_FAILED';

  const status =
    code === 'AUTH_REQUIRED'
      ? 401
      : code === 'CARD_NOT_FOUND'
        ? 404
        : code === 'PERMISSION_DENIED'
          ? 403
          : code === 'PROFILE_ALREADY_REGISTERED'
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

    const payload = parseCardWritePayload(body);

    const cardRef = adminDb
      .collection('cards')
      .doc(cardId);

    const ownerRef = adminDb
      .collection('cardOwners')
      .doc(cardId);

    const newProfileRef = adminDb
      .collection('characterProfileIndex')
      .doc(
        makeProfileHash(
          payload.normalizedProfileUrl,
        ),
      );

    const now = new Date().toISOString();

    const result = await adminDb.runTransaction(
      async (transaction) => {
        const [
          cardSnapshot,
          ownerSnapshot,
          newProfileSnapshot,
        ] = await Promise.all([
          transaction.get(cardRef),
          transaction.get(ownerRef),
          transaction.get(newProfileRef),
        ]);

        if (
          !cardSnapshot.exists ||
          !ownerSnapshot.exists
        ) {
          throw new Error('CARD_NOT_FOUND');
        }

        const existing =
          cardSnapshot.data() as unknown as PublicCard;

        const owner = getOwnerData(
          ownerSnapshot.data() as Record<
            string,
            unknown
          >,
        );

        if (existing.status !== 'active') {
          throw new Error('CARD_DELETED');
        }

        if (!isOwner(owner, user)) {
          throw new Error('PERMISSION_DENIED');
        }

        if (
          existing.cardType !== payload.cardType ||
          existing.presetId !== payload.presetId
        ) {
          throw new Error(
            'CARD_TYPE_OR_PRESET_IMMUTABLE',
          );
        }

        if (newProfileSnapshot.exists) {
          const indexedCardId = String(
            newProfileSnapshot.data()?.cardId || '',
          );

          if (indexedCardId !== cardId) {
            throw new Error(
              'PROFILE_ALREADY_REGISTERED',
            );
          }
        }

        const nextCard: PublicCard = {
          ...existing,
          ...buildPublicCardFields(payload),
          id: cardId,
          firstUser: existing.firstUser,
          status: 'active',
          createdAt: existing.createdAt,
          updatedAt: now,
        };

        const oldProfileHash = makeProfileHash(
          existing.profileUrl,
        );

        const newProfileHash = makeProfileHash(
          payload.normalizedProfileUrl,
        );

        const oldProfileRef = adminDb
          .collection('characterProfileIndex')
          .doc(oldProfileHash);

        transaction.update(cardRef, nextCard);

        transaction.update(ownerRef, {
          updatedAt: now,

          // 旧仕様で保存されていた
          // passwordHash があれば削除する。
          passwordHash: FieldValue.delete(),
        });

        if (oldProfileHash !== newProfileHash) {
          transaction.delete(oldProfileRef);

          transaction.set(
            newProfileRef,
            {
              cardId,
              createdAt: existing.createdAt,
              updatedAt: now,
            },
            { merge: true },
          );
        }

        return nextCard;
      },
    );

    return NextResponse.json({
      ok: true,
      card: result,
    });
  } catch (error) {
    console.error(
      'Card update API error:',
      error,
    );

    return errorResponse(error);
  }
}