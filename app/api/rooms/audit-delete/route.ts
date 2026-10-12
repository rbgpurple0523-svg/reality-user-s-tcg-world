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

type TimestampLike = {
  toMillis?: () => number;
  seconds?: number;
  _seconds?: number;
};

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

const ROOM_CLOSED_RETENTION_MS = 60 * 1000;
const MAX_LOG_ENTRIES = 300;
const MAX_LOG_ENTRY_LENGTH = 1000;
const MAX_TOTAL_LOG_LENGTH = 80_000;

/**
 * Firestore Timestamp、Date、ミリ秒の数値を
 * ミリ秒タイムスタンプに変換する。
 *
 * 不正な値や未設定値は null を返す。
 */
const toTimestampMillis = (
  value: unknown,
): number | null => {
  if (typeof value === 'number') {
    return Number.isFinite(value) && value > 0
      ? value
      : null;
  }

  if (value instanceof Date) {
    const millis = value.getTime();

    return Number.isFinite(millis) && millis > 0
      ? millis
      : null;
  }

  if (!value || typeof value !== 'object') {
    return null;
  }

  const timestamp = value as TimestampLike;

  if (typeof timestamp.toMillis === 'function') {
    try {
      const millis = timestamp.toMillis();

      return Number.isFinite(millis) && millis > 0
        ? millis
        : null;
    } catch {
      return null;
    }
  }

  const seconds =
    typeof timestamp.seconds === 'number'
      ? timestamp.seconds
      : timestamp._seconds;

  if (
    typeof seconds === 'number' &&
    Number.isFinite(seconds) &&
    seconds > 0
  ) {
    return seconds * 1000;
  }

  return null;
};

/**
 * ルームのクローズ時刻を取得する。
 *
 * 新方式:
 *   roomClosedAt を使用する。
 *
 * 旧データ:
 *   roomClosedAt がない場合は、既存の活動時刻のうち
 *   最も新しい時刻を暫定的な基準として使用する。
 *
 * 時刻が一切確認できない場合は null を返し、
 * 安全のためクリーンアップを許可しない。
 */
const getRoomClosedAtMillis = (
  roomData: Record<string, unknown>,
  hostPresence: Record<string, unknown> | null,
  guestPresence: Record<string, unknown> | null,
): number | null => {
  const explicitClosedAt = toTimestampMillis(
    roomData.roomClosedAt,
  );

  if (explicitClosedAt !== null) {
    return explicitClosedAt;
  }

  const legacyTimestamps = [
    roomData.createdAt,
    roomData.hostLastSeenAt,
    roomData.guestLastSeenAt,
    hostPresence?.lastSeenAt,
    guestPresence?.lastSeenAt,
  ]
    .map(toTimestampMillis)
    .filter(
      (value): value is number => value !== null,
    );

  if (legacyTimestamps.length === 0) {
    return null;
  }

  return Math.max(...legacyTimestamps);
};

export async function POST(request: Request) {
  try {
    // -----------------------------------------------
    // 1. Firebase Authentication
    // -----------------------------------------------
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

    // -----------------------------------------------
    // 2. Request validation
    // -----------------------------------------------
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

    // -----------------------------------------------
    // 3. Load room and presence documents
    // -----------------------------------------------
    const roomRef = adminDb
      .collection('rooms')
      .doc(roomId);

    const [
      roomSnap,
      hostPresenceSnap,
      guestPresenceSnap,
    ] = await Promise.all([
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

    const hostPresence: Record<string, unknown> | null =
      hostPresenceSnap.exists
        ? hostPresenceSnap.data() ?? null
        : null;

    const guestPresence: Record<string, unknown> | null =
      guestPresenceSnap.exists
        ? guestPresenceSnap.data() ?? null
        : null;

    // -----------------------------------------------
    // 4. Room closure validation
    // -----------------------------------------------
    if (roomData.roomClosed !== true) {
      return NextResponse.json(
        { ok: false, error: 'ROOM_NOT_CLOSED' },
        { status: 409 },
      );
    }

    // -----------------------------------------------
    // 5. Explicit exit authorization
    //
    // 旧呼び出しとの互換性を維持する。
    // 新しい終了処理では、ルームを閉じた後に
    // 60秒経過してから stale_room_cleanup を使用する。
    // -----------------------------------------------
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
          {
            ok: false,
            error: 'EXIT_NOT_AUTHORIZED',
          },
          { status: 403 },
        );
      }
    }

    // -----------------------------------------------
    // 6. Closed-room retention validation
    //
    // exitHost / exitGuest の値は判定に使用しない。
    // 退出済みルームも、クローズ後60秒経過すれば
    // クリーンアップ候補になる。
    // -----------------------------------------------
    if (reason === 'stale_room_cleanup') {
      const closedAt = getRoomClosedAtMillis(
        roomData,
        hostPresence,
        guestPresence,
      );

      if (closedAt === null) {
        return NextResponse.json(
          {
            ok: false,
            error: 'ROOM_CLOSED_AT_UNKNOWN',
          },
          { status: 409 },
        );
      }

      const now = Date.now();
      const elapsed = now - closedAt;

      if (
        elapsed < ROOM_CLOSED_RETENTION_MS
      ) {
        return NextResponse.json(
          {
            ok: false,
            error: 'ROOM_CLEANUP_PENDING',
            retryAfterMs: Math.max(
              0,
              ROOM_CLOSED_RETENTION_MS - elapsed,
            ),
          },
          { status: 409 },
        );
      }
    }

    // -----------------------------------------------
    // 7. Save audit log before deletion
    //
    // この API 自体はルームを削除しない。
    // 呼び出し元は監査ログ保存成功後に、
    // クローズ時刻を再検証して削除処理を行う。
    // -----------------------------------------------
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
        roomClosedAt:
          toTimestampMillis(roomData.roomClosedAt) ??
          getRoomClosedAtMillis(
            roomData,
            hostPresence,
            guestPresence,
          ),
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
      {
        ok: false,
        error: 'AUDIT_DELETE_REQUEST_FAILED',
      },
      { status: 500 },
    );
  }
}