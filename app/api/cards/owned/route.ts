import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import { verifyBearerToken } from '@/lib/cardServer';

export const runtime = 'nodejs';

function errorResponse(error: unknown) {
  const code =
    error instanceof Error
      ? error.message
      : 'OWNED_CARDS_FAILED';

  const status =
    code === 'AUTH_REQUIRED'
      ? 401
      : 400;

  return NextResponse.json(
    { ok: false, error: code },
    { status },
  );
}

export async function GET(request: Request) {
  try {
    const user = await verifyBearerToken(request);

    const snapshot = await adminDb
      .collection('cardOwners')
      .where('ownerUid', '==', user.uid)
      .get();

    const cardIds = snapshot.docs
      .filter((doc) => {
        const data =
          doc.data() as Record<string, unknown>;

        return !data.deletedAt;
      })
      .map((doc) => doc.id);

    return NextResponse.json({
      ok: true,
      cardIds,
    });
  } catch (error) {
    console.error(
      'Owned cards API error:',
      error,
    );

    return errorResponse(error);
  }
}