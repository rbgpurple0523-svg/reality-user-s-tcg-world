
import { NextResponse } from 'next/server';
import {
  getApps,
  initializeApp,
  cert,
  type App,
} from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebaseAdmin';

export const runtime = 'nodejs';

type DeleteReason =
  | 'explicit_exit'
  | 'stale_room_cleanup';

const getAdminApp = (): App => {
  const apps = getApps();

  if (apps.length > 0) {
    return apps[0];
  }

  const projectId =
    process.env.FIREBASE_ADMIN_PROJECT_ID;
  const clientEmail =
    process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const privateKey =
    process.env.FIREBASE_ADMIN_PRIVATE_KEY
      ?.replace(/\\n/g, '\n');

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error(
      'Firebase Admin環境変数が不足しています。',
    );
  }

  return initializeApp({
    credential: cert({
      projectId,
      clientEmail,
      privateKey,
    }),
  });
};

const STALE_STAGE_MS = 60 * 1000;
const MAX_LOG_ENTRIES = 300;
const MAX_LOG_ENTRY_LENGTH = 1000;
const MAX_TOTAL_LOG_LENGTH = 80_000;

export async function POST(request: Request) {
  try {
    const authorization =
      request.headers.get('authorization');

    if (!authorization?.startsWith('Bearer ')) {
      return NextResponse.json(
        { ok: false, error: 'AUTH_REQUIRED' },
        { status: 401 },
      );
    }

    const idToken =
      authorization.slice('Bearer '.length).trim();

    if (!idToken) {
      return NextResponse.json(
        { ok: false, error: 'TOKEN_REQUIRED' },
        { status: 401 },
      );
    }

    const decoded = await getAuth(getAdminApp())
      .verifyIdToken(idToken, true);

    const body: unknown = await request.json();

    if (!body || typeof body !== 'object') {
      return NextResponse.json(
        { ok: false, error: 'INVALID_BODY' },
        { status: 400 },
      );
    }

    const data = body as Record<string, unknown>;
    const roomId = data.roomId;
    const reason = data.reason;
    const liveLogInput = data.liveLog;

    if (
      typeof roomId !== 'string' ||
      roomId.length < 1 ||
      roomId.length > 128 ||
      roomId.includes('/')
    ) {
      return NextResponse.json(
        { ok: false, error: 'INVALID_ROOM_ID' },
        { status: 400 },
      );
    }

    if (
      reason !== 'explicit_exit' &&
      reason !== 'stale_room_cleanup'
    ) {
      return NextResponse.json(
        { ok: false, error: 'INVALID_REASON' },
        { status: 400 },
      );
    }

    if (
      !Array.isArray(liveLogInput) ||
      liveLogInput.length > MAX_LOG_ENTRIES ||
      !liveLogInput.every(
        (entry) =>
          typeof entry === 'string' &&
          entry.length <= MAX_LOG_ENTRY_LENGTH,
      )
    ) {
      return NextResponse.json(
        { ok: false, error: 'INVALID_LIVE_LOG' },
        { status: 400 },
      );
    }

    const liveLog = liveLogInput as string[];
    const totalLogLength = liveLog.reduce(
      (total, entry) => total + entry.length,
      0,
    );

    if (totalLogLength > MAX_TOTAL_LOG_LENGTH) {
      return NextResponse.json(
        { ok: false, error: 'LIVE_LOG_TOO_LARGE' },
        { status: 413 },
      );
    }

    const roomRef = adminDb
      .collection('rooms')
      .doc(roomId);

    const [roomSnap, hostPresenceSnap, guestPresenceSnap] =
      await Promise.all([
        roomRef.get(),
        roomRef.collection('presence').doc('host').get(),
        roomRef.collection('presence').doc('guest').get(),
      ]);

    if (!roomSnap.exists) {
      return NextResponse.json(
        { ok: false, error: 'ROOM_NOT_FOUND' },
        { status: 404 },
      );
    }

    const roomData =
      roomSnap.data() as Record<string, unknown>;

    const hostPresence = hostPresenceSnap.exists
      ? hostPresenceSnap.data()
      : null;

    const guestPresence = guestPresenceSnap.exists
      ? guestPresenceSnap.data()
      : null;

    if (roomData.roomClosed !== true) {
      return NextResponse.json(
        { ok: false, error: 'ROOM_NOT_CLOSED' },
        { status: 409 },
      );
    }

    if (reason === 'explicit_exit') {
      const isHost = roomData.hostUid === decoded.uid;
      const isGuest = roomData.guestUid === decoded.uid;

      const ownExitFlag = isHost
        ? roomData.exitHost === true
        : isGuest
          ? roomData.exitGuest === true
          : false;

      if ((!isHost && !isGuest) || !ownExitFlag) {
        return NextResponse.json(
          { ok: false, error: 'EXIT_NOT_AUTHORIZED' },
          { status: 403 },
        );
      }
    } else {
      if (
        roomData.exitHost === true ||
        roomData.exitGuest === true
      ) {
        return NextResponse.json(
          { ok: false, error: 'ROOM_ALREADY_EXITED' },
          { status: 409 },
        );
      }

      const now = Date.now();
      const hostSeen = Number(hostPresence?.lastSeenAt ?? 0);
      const guestSeen = Number(guestPresence?.lastSeenAt ?? 0);

      const hostStale =
        !hostSeen || now - hostSeen > STALE_STAGE_MS;
      const guestStale =
        !guestSeen || now - guestSeen > STALE_STAGE_MS;

      if (!hostStale || !guestStale) {
        return NextResponse.json(
          { ok: false, error: 'ROOM_NOT_STALE' },
          { status: 409 },
        );
      }
    }

    // この時点のルーム状態を、独立した監査コレクションへ1件保存する。
    const auditRef = await adminDb
      .collection('auditLogs')
      .add({
        schemaVersion: 1,
        roomId,
        reason,
        actorUid: decoded.uid,
        roomSnapshot: roomData,
        liveLog,
        exitHost: roomData.exitHost === true,
        exitGuest: roomData.exitGuest === true,
        createdAt: FieldValue.serverTimestamp(),
        status: 'deletion_started',
      });

    return NextResponse.json({
      ok: true,
      auditId: auditRef.id,
    });
  } catch (error) {
    console.error('[room audit-delete]', error);

    return NextResponse.json(
      { ok: false, error: 'AUDIT_DELETE_REQUEST_FAILED' },
      { status: 500 },
    );
  }
}
