import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import {
  getOwnerData,
  isOwnerOrPasswordAuthorized,
  makeProfileHash,
  verifyBearerToken,
} from '@/lib/cardServer';

export const runtime = 'nodejs';

function errorResponse(error: unknown) {
  const code = error instanceof Error ? error.message : 'CARD_DELETE_FAILED';
  const status =
    code === 'AUTH_REQUIRED' ? 401 :
    code === 'CARD_NOT_FOUND' ? 404 :
    code === 'PERMISSION_DENIED' ? 403 :
    code === 'CARD_DELETED' ? 409 :
    400;

  return NextResponse.json({ ok: false, error: code }, { status });
}

export async function POST(request: Request) {
  try {
    const user = await verifyBearerToken(request);
    const body = await request.json();

    if (!body || typeof body !== 'object' || Array.isArray(body) || typeof body.cardId !== 'string') {
      throw new Error('INVALID_CARD_ID');
    }

    const cardId = body.cardId.trim();
    if (!/^card_[a-f0-9]{24}$/.test(cardId)) {
      throw new Error('INVALID_CARD_ID');
    }

    const password = typeof body.password === 'string' && body.password !== ''
      ? body.password
      : undefined;
    const cardRef = adminDb.collection('cards').doc(cardId);
    const ownerRef = adminDb.collection('cardOwners').doc(cardId);
    const now = new Date().toISOString();

    const result = await adminDb.runTransaction(async (transaction) => {
      const [cardSnapshot, ownerSnapshot] = await Promise.all([
        transaction.get(cardRef),
        transaction.get(ownerRef),
      ]);

      if (!cardSnapshot.exists || !ownerSnapshot.exists) {
        throw new Error('CARD_NOT_FOUND');
      }

      const card = cardSnapshot.data() as Record<string, unknown>;
      const owner = getOwnerData(ownerSnapshot.data() as Record<string, unknown>);

      if (card.status !== 'active') {
        throw new Error('CARD_DELETED');
      }

      if (!(await isOwnerOrPasswordAuthorized(owner, user, password))) {
        throw new Error('PERMISSION_DENIED');
      }

      const presetId = String(card.presetId || '');
      const statsRef = adminDb.collection('cardPresetStats').doc(presetId);
      const profileHash = makeProfileHash(String(card.profileUrl || ''));
      const profileRef = adminDb.collection('characterProfileIndex').doc(profileHash);
      const statsSnapshot = await transaction.get(statsRef);
      const rawCount = Number(statsSnapshot.data()?.activeCount ?? 0);
      const currentCount = Number.isFinite(rawCount) && rawCount >= 0 ? Math.floor(rawCount) : 0;

      transaction.update(cardRef, {
        status: 'deleted',
        updatedAt: now,
      });
      transaction.update(ownerRef, {
        updatedAt: now,
        deletedAt: now,
      });
      transaction.delete(profileRef);
      transaction.set(statsRef, {
        activeCount: Math.max(0, currentCount - 1),
        updatedAt: now,
      }, { merge: true });

      return {
        cardId,
        status: 'deleted' as const,
      };
    });

    return NextResponse.json({ ok: true, result });
  } catch (error) {
    console.error('Card delete API error:', error);
    return errorResponse(error);
  }
}
