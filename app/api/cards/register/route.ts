import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import {
  buildPublicCardFields,
  calculateMaxEntryLimit,
  getPresetStatsReference,
  makeCardId,
  makeProfileHash,
  parseCardWritePayload,
  verifyBearerToken,
} from '@/lib/cardServer';
import { COORDINATE_PRESETS } from '@/components/coordinatePresets';
import { EMOTION_PRESETS } from '@/components/emotionPresets';

export const runtime = 'nodejs';

function errorResponse(error: unknown) {
  const code =
    error instanceof Error
      ? error.message
      : 'CARD_REGISTER_FAILED';

  const status =
    code === 'AUTH_REQUIRED'
      ? 401
      : code === 'PROFILE_ALREADY_REGISTERED'
        ? 409
        : code === 'CARD_LIMIT_REACHED'
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
    const payload = parseCardWritePayload(body);

    const now = new Date().toISOString();
    const cardId = makeCardId();
    const profileHash = makeProfileHash(
      payload.normalizedProfileUrl,
    );

    const result = await adminDb.runTransaction(
      async (transaction) => {
        const cardRef = adminDb
          .collection('cards')
          .doc(cardId);

        const ownerRef = adminDb
          .collection('cardOwners')
          .doc(cardId);

        const profileRef = adminDb
          .collection('characterProfileIndex')
          .doc(profileHash);

        const allPresets = [
          ...COORDINATE_PRESETS,
          ...EMOTION_PRESETS,
        ];

        const statsRefs = allPresets.map((preset) =>
          getPresetStatsReference(preset.id),
        );

        const profileSnapshot =
          await transaction.get(profileRef);

        const statsSnapshots = [];

        for (const statsRef of statsRefs) {
          statsSnapshots.push(
            await transaction.get(statsRef),
          );
        }

        if (profileSnapshot.exists) {
          throw new Error(
            'PROFILE_ALREADY_REGISTERED',
          );
        }

        const activeCounts = statsSnapshots.map(
          (snapshot) => {
            const count = Number(
              snapshot.data()?.activeCount ?? 0,
            );

            return Number.isFinite(count) && count >= 0
              ? Math.floor(count)
              : 0;
          },
        );

        const maxEntryLimit =
          calculateMaxEntryLimit(activeCounts);

        const presetIndex = allPresets.findIndex(
          (preset) => preset.id === payload.presetId,
        );

        const currentCount =
          activeCounts[presetIndex] ?? 0;

        if (currentCount >= maxEntryLimit) {
          throw new Error('CARD_LIMIT_REACHED');
        }

        const publicCard = {
          ...buildPublicCardFields(payload),
          id: cardId,
          firstUser: payload.userName,
          transferStatus: 'none' as const,
          status: 'active' as const,
          createdAt: now,
          updatedAt: now,
        };

        transaction.create(cardRef, publicCard);

        transaction.create(ownerRef, {
          ownerUid: user.uid,
          createdAt: now,
          updatedAt: now,
        });

        transaction.create(profileRef, {
          cardId,
          createdAt: now,
        });

        const statsRef = getPresetStatsReference(
          payload.presetId,
        );

        transaction.set(
          statsRef,
          {
            activeCount: currentCount + 1,
            updatedAt: now,
          },
          { merge: true },
        );

        return publicCard;
      },
    );

    return NextResponse.json({
      ok: true,
      card: result,
    });
  } catch (error) {
    console.error(
      'Card register API error:',
      error,
    );

    return errorResponse(error);
  }
}