'use client';

import React, { useState } from 'react';
import { db, ensureAnonymousAuth } from '@/lib/firebase';
import {
  deleteField,
  doc,
  onSnapshot,
  runTransaction,
  setDoc,
} from 'firebase/firestore';

interface FriendMatchSetupProps {
  onMatchStart: (roomId: string, isHost: boolean) => void;
  onBack: () => void;
}

type PlayerRole = 'host' | 'guest';

type RoomRecord = Record<string, unknown>;
type PlayerRecord = Record<string, unknown>;

type PresenceRecord = {
  uid?: string;
  role?: PlayerRole;
  lastSeenAt?: number;
};

export default function FriendMatchSetup({
  onMatchStart,
  onBack,
}: FriendMatchSetupProps) {
  const [mode, setMode] =
    useState<'menu' | 'create' | 'join'>('menu');
  const [roomKey, setRoomKey] = useState<string>('');
  const [statusMessage, setStatusMessage] =
    useState<string>('');
  const [isLoading, setIsLoading] =
    useState<boolean>(false);
  const [showConfirmModal, setShowConfirmModal] =
    useState<boolean>(false);
  const [isWaitingForGuest, setIsWaitingForGuest] =
    useState<boolean>(false);

// ===== 放置ステージの判定 =====
const STALE_STAGE_MS = 60 * 1000;

const isStageStale = (
  roomData: RoomRecord,
  hostPresenceData: PresenceRecord | null,
  guestPresenceData: PresenceRecord | null,
) => {
  const now = Date.now();

  const hostSeen = Number(
    hostPresenceData?.lastSeenAt ?? 0,
  );

  const guestSeen = Number(
    guestPresenceData?.lastSeenAt ?? 0,
  );

  const hostStale =
    !hostSeen ||
    now - hostSeen > STALE_STAGE_MS;

  const guestStale =
    !guestSeen ||
    now - guestSeen > STALE_STAGE_MS;

  return hostStale && guestStale;
};

  const resetPlayerForNewStage = async (
    playerRef: ReturnType<typeof doc>,
    uid: string,
    role: PlayerRole,
    now: number,
  ) => {
    await setDoc(
      playerRef,
      {
        uid,
        role,
        joined: true,
        ready: false,
        createdAt: now,
        lastSeenAt: now,

        avatars: [],

        handCount: 0,
        deckCount: 0,

        usedSkills: {},

        lastProcessedIncomingActionId: '',

        pendingAction: deleteField(),

        lastSkillActionId: deleteField(),
        lastSkillAction: deleteField(),

        lastSupportActionId: deleteField(),
        lastSupportCardId: deleteField(),
        lastSupportCardCountBefore:
          deleteField(),
        lastSupportCardCountAfter:
          deleteField(),
        lastSupportActionAt:
          deleteField(),

        hand: deleteField(),
        deck: deleteField(),
      },
      {
        merge: true,
      },
    );
  };

  const resetPrivatePlayerForNewStage = async (
    privatePlayerRef: ReturnType<typeof doc>,
    uid: string,
  ) => {
    await setDoc(
      privatePlayerRef,
      {
        uid,
        hand: [],
        deck: [],
      },
      {
        merge: true,
      },
    );
  };

  // =========================================================
  // 1. ステージ作成（ホスト）
  // =========================================================

  const buildNewRoomData = (
    uid: string,
    now: number,
  ): RoomRecord => ({
    hostUid: uid,
    guestUid: null,
    hostJoined: true,
    guestJoined: false,
    battlePhase: 'setup',
    currentYear: 1,
    turnIndex: 0,
    firstPlayer: null,
    startSeasonIdx: null,
    hostTotalScore: 0,
    guestTotalScore: 0,
    hostClassScores: [0, 0, 0],
    guestClassScores: [0, 0, 0],
    hostUsedSkills: {},
    guestUsedSkills: {},
    rematchHost: false,
    rematchGuest: false,
    rematchPlayerResetHost: false,
    rematchPlayerResetGuest: false,
    exitHost: false,
    exitGuest: false,
    readyHost: false,
    readyGuest: false,
    classReadyYearHost: 0,
    classReadyYearGuest: 0,
    roomClosed: false,
    createdAt: now,
    hostLastSeenAt: now,
    guestLastSeenAt: 0,
  });

  const deleteClosedStaleRoomData = async (
    roomRef: ReturnType<typeof doc>,
    hostPlayerRef: ReturnType<typeof doc>,
    guestPlayerRef: ReturnType<typeof doc>,
    hostPrivatePlayerRef: ReturnType<typeof doc>,
    guestPrivatePlayerRef: ReturnType<typeof doc>,
    hostPresenceRef: ReturnType<typeof doc>,
    guestPresenceRef: ReturnType<typeof doc>,
  ) => {
    const deleted = await runTransaction(
      db,
      async (transaction) => {
        const roomSnap =
          await transaction.get(roomRef);

        if (!roomSnap.exists()) {
          return false;
        }

        const roomData =
          roomSnap.data() as RoomRecord;

        if (roomData.roomClosed !== true) {
          throw new Error('ROOM_NOT_CLOSED');
        }

        if (
          roomData.exitHost === true ||
          roomData.exitGuest === true
        ) {
          throw new Error('ROOM_CLOSED');
        }

        const hostPresenceSnap =
          await transaction.get(hostPresenceRef);

        const guestPresenceSnap =
          await transaction.get(guestPresenceRef);

        const hostPresenceData =
          hostPresenceSnap.exists()
            ? (hostPresenceSnap.data() as PresenceRecord)
            : null;

        const guestPresenceData =
          guestPresenceSnap.exists()
            ? (guestPresenceSnap.data() as PresenceRecord)
            : null;

        if (
          !isStageStale(
            roomData,
            hostPresenceData,
            guestPresenceData,
          )
        ) {
          throw new Error('ROOM_ALREADY_IN_USE');
        }

        transaction.delete(hostPlayerRef);
        transaction.delete(guestPlayerRef);
        transaction.delete(hostPrivatePlayerRef);
        transaction.delete(guestPrivatePlayerRef);
        transaction.delete(hostPresenceRef);
        transaction.delete(guestPresenceRef);
        transaction.delete(roomRef);

        return true;
      },
    );

    return deleted;
  };

  const createFreshRoom = async (
    roomRef: ReturnType<typeof doc>,
    hostPresenceRef: ReturnType<typeof doc>,
    uid: string,
  ) => {
    const now = Date.now();

    await runTransaction(
      db,
      async (transaction) => {
        const snapshot = await transaction.get(roomRef);

        if (snapshot.exists()) {
          throw new Error('ROOM_ALREADY_IN_USE');
        }

        transaction.set(
          roomRef,
          buildNewRoomData(uid, now),
        );

        transaction.set(
          hostPresenceRef,
          {
            uid,
            role: 'host',
            lastSeenAt: now,
          },
        );
      },
    );
  };

  const handleCreateStage = async () => {
    if (!roomKey.trim()) {
      setStatusMessage(
        '⚠️ 合言葉を入力してください。',
      );
      return;
    }

    setIsLoading(true);
    setStatusMessage('ステージを確認中...');

    const roomId = roomKey.trim();

    const roomRef = doc(db, 'rooms', roomId);

    const hostPlayerRef = doc(
      db,
      'rooms',
      roomId,
      'players',
      'host',
    );

    const guestPlayerRef = doc(
      db,
      'rooms',
      roomId,
      'players',
      'guest',
    );

    const hostPresenceRef = doc(
      db,
      'rooms',
      roomId,
      'presence',
      'host',
    );

    const guestPresenceRef = doc(
      db,
      'rooms',
      roomId,
      'presence',
      'guest',
    );

    const hostPrivatePlayerRef = doc(
      db,
      'rooms',
      roomId,
      'privatePlayers',
      'host',
    );

    const guestPrivatePlayerRef = doc(
      db,
      'rooms',
      roomId,
      'privatePlayers',
      'guest',
    );

    try {
      const currentUser = await ensureAnonymousAuth();
      const now = Date.now();

      let result:
        | {
            mode: 'created' | 'rejoined';
            guestJoined: boolean;
          };

      const stageResult = await runTransaction(
        db,
        async (transaction) => {
          const snapshot = await transaction.get(roomRef);

          if (!snapshot.exists()) {
            transaction.set(
              roomRef,
              buildNewRoomData(
                currentUser.uid,
                now,
              ),
            );

            transaction.set(
              hostPresenceRef,
              {
                uid: currentUser.uid,
                role: 'host',
                lastSeenAt: now,
              },
            );

            return {
              mode: 'created' as const,
              guestJoined: false,
            };
          }

          const roomData = snapshot.data() as RoomRecord;

          if (roomData.roomClosed === true) {
            if (
              roomData.exitHost === true ||
              roomData.exitGuest === true
            ) {
              throw new Error('ROOM_CLOSED');
            }

            const hostPresenceSnap =
              await transaction.get(hostPresenceRef);
            const guestPresenceSnap =
              await transaction.get(guestPresenceRef);

            const hostPresenceData =
              hostPresenceSnap.exists()
                ? (hostPresenceSnap.data() as PresenceRecord)
                : null;

            const guestPresenceData =
              guestPresenceSnap.exists()
                ? (guestPresenceSnap.data() as PresenceRecord)
                : null;

            if (
              !isStageStale(
                roomData,
                hostPresenceData,
                guestPresenceData,
              )
            ) {
              throw new Error('ROOM_ALREADY_IN_USE');
            }

            return {
              mode: 'closedStale' as const,
              guestJoined: false,
            };
          }

          if (roomData.hostUid === currentUser.uid) {
            transaction.update(
              roomRef,
              {
                hostJoined: true,
                hostRejoinedAt: now,
                hostLastSeenAt: now,
              },
            );

            transaction.set(
              hostPresenceRef,
              {
                uid: currentUser.uid,
                role: 'host',
                lastSeenAt: now,
              },
              { merge: true },
            );

            return {
              mode: 'rejoined' as const,
              guestJoined: Boolean(roomData.guestJoined),
            };
          }

          const hostPresenceSnap =
            await transaction.get(hostPresenceRef);
          const guestPresenceSnap =
            await transaction.get(guestPresenceRef);

          const hostPresenceData =
            hostPresenceSnap.exists()
              ? (hostPresenceSnap.data() as PresenceRecord)
              : null;

          const guestPresenceData =
            guestPresenceSnap.exists()
              ? (guestPresenceSnap.data() as PresenceRecord)
              : null;

          if (
            !isStageStale(
              roomData,
              hostPresenceData,
              guestPresenceData,
            )
          ) {
            throw new Error('ROOM_ALREADY_IN_USE');
          }

          transaction.update(
            roomRef,
            { roomClosed: true },
          );

          return {
            mode: 'staleClosed' as const,
            guestJoined: false,
          };
        },
      );

      if (
        stageResult.mode === 'staleClosed' ||
        stageResult.mode === 'closedStale'
      ) {
        setStatusMessage(
          '放置されたステージを閉鎖し、旧データを削除しています...',
        );

        await deleteClosedStaleRoomData(
          roomRef,
          hostPlayerRef,
          guestPlayerRef,
          hostPrivatePlayerRef,
          guestPrivatePlayerRef,
          hostPresenceRef,
          guestPresenceRef,
        );

        setStatusMessage(
          '旧ステージの削除が完了しました。新しいステージを作成しています...',
        );

        await createFreshRoom(
          roomRef,
          hostPresenceRef,
          currentUser.uid,
        );

        result = {
          mode: 'created',
          guestJoined: false,
        };
      } else {
        result = stageResult;
      }

      if (result.mode === 'created') {
        const freshNow = Date.now();

        await resetPlayerForNewStage(
          hostPlayerRef,
          currentUser.uid,
          'host',
          freshNow,
        );

        await resetPrivatePlayerForNewStage(
          hostPrivatePlayerRef,
          currentUser.uid,
        );
      }

      setIsLoading(false);
      setIsWaitingForGuest(true);

      setStatusMessage(
        result.mode === 'rejoined'
          ? `🎮 ステージ「${roomKey}」へ再入室しました。対戦状態を維持しています。`
          : `🎉 ステージ「${roomKey}」を作成しました！友達の参加を待っています...`,
      );

      const unsubscribe = onSnapshot(
        roomRef,
        (docSnap) => {
          const data = docSnap.data();

          if (
            data &&
            data.roomClosed === true
          ) {
            unsubscribe();
            setIsWaitingForGuest(false);
            setStatusMessage(
              'このステージは終了しました。',
            );
            return;
          }

          if (
            data &&
            data.guestJoined &&
            data.guestUid
          ) {
            unsubscribe();
            setIsWaitingForGuest(false);
            onMatchStart(roomId, true);
          }
        },
      );

      if (
        result.mode === 'rejoined' &&
        result.guestJoined
      ) {
        unsubscribe();
        setIsWaitingForGuest(false);
        onMatchStart(roomId, true);
      }
    } catch (err) {
      console.error('Create Room Error:', err);
      setIsLoading(false);

      if (err instanceof Error) {
        switch (err.message) {
          case 'ROOM_ALREADY_IN_USE':
            setStatusMessage(
              '❌ その合言葉のステージはすでに使用されています。別の合言葉を設定してください。',
            );
            return;

          case 'ROOM_CLOSED':
            setStatusMessage(
              '❌ このステージは終了処理中です。新しい合言葉を設定してください。',
            );
            return;

          case 'ROOM_NOT_FOUND':
          case 'ROOM_NOT_CLOSED':
            setStatusMessage(
              '❌ ステージの状態を確認できませんでした。もう一度お試しください。',
            );
            return;
        }
      }

      setStatusMessage(
        '❌ ステージの作成に失敗しました。ネットワーク環境を確認してください。',
      );
    }
  };

  // =========================================================
  // 2. 確認ポップアップ
  // =========================================================

  const handleConfirmJoin = () => {
    if (!roomKey.trim()) {
      setStatusMessage(
        '⚠️ 合言葉を入力してください。',
      );
      return;
    }

    setShowConfirmModal(true);
  };

  // =========================================================
  // 3. ステージ参加（ゲスト）
  // =========================================================

  const handleJoinStage = async () => {
    setShowConfirmModal(false);
    setIsLoading(true);
    setStatusMessage(
      'ステージを探しています...',
    );

    const roomId =
      roomKey.trim();

    const roomRef =
      doc(db, 'rooms', roomId);

    const guestPlayerRef =
      doc(
        db,
        'rooms',
        roomId,
        'players',
        'guest',
      );

const guestPresenceRef = doc(
  db,
  'rooms',
  roomId,
  'presence',
  'guest',
);

    const guestPrivatePlayerRef =
      doc(
        db,
        'rooms',
        roomId,
        'privatePlayers',
        'guest',
      );

    try {
      const currentUser =
        await ensureAnonymousAuth();

      const now =
        Date.now();

      const result =
        await runTransaction(
          db,
          async (transaction) => {
            const roomSnap =
              await transaction.get(
                roomRef,
              );

            if (
              !roomSnap.exists()
            ) {
              throw new Error(
                'ROOM_NOT_FOUND',
              );
            }

            const roomData =
              roomSnap.data() as RoomRecord;

            // -------------------------------------------------
            // 明示的に閉じられたRoom
            // → 元ユーザーでも再入室不可
            // -------------------------------------------------

            if (
              roomData.roomClosed ===
              true
            ) {
              throw new Error(
                'ROOM_CLOSED',
              );
            }

            // -------------------------------------------------
            // Host本人がGuestとして入ろうとしている
            // -------------------------------------------------

            if (
              roomData.hostUid &&
              roomData.hostUid ===
                currentUser.uid
            ) {
              throw new Error(
                'SELF_JOIN',
              );
            }

            // -------------------------------------------------
            // 同じGuest本人の一時離脱
            // → 対戦状態を維持して再入室
            // -------------------------------------------------

            if (
              roomData.guestUid ===
              currentUser.uid
            ) {
              transaction.update(
                roomRef,
                {
                  guestJoined:
                    true,

                  guestRejoinedAt:
                    now,

                  guestLastSeenAt:
                    now,
                },
              );


transaction.set(
  guestPresenceRef,
  {
    uid:
      currentUser.uid,

    role:
      'guest',

    lastSeenAt:
      now,
  },
  {
    merge:
      true,
  },
);

              return {
                mode:
                  'rejoined' as const,
              };
            }

            // -------------------------------------------------
            // 同じGuest以外はstale Roomへ参加不可
            // stale Roomは新しいHostによる引き継ぎを行わず、作成側で物理削除する。
            // -------------------------------------------------

            if (
              roomData.guestJoined ===
                false ||
              !roomData.guestUid
            ) {

              const hostPlayerRef =
                doc(
                  db,
                  'rooms',
                  roomId,
                  'players',
                  'host',
                );

              const guestExistingPlayerRef =
                doc(
                  db,
                  'rooms',
                  roomId,
                  'players',
                  'guest',
                );

const hostPresenceRef =
  doc(
    db,
    'rooms',
    roomId,
    'presence',
    'host',
  );

const guestPresenceRef =
  doc(
    db,
    'rooms',
    roomId,
    'presence',
    'guest',
  );

const hostPresenceSnap =
  await transaction.get(
    hostPresenceRef,
  );

const guestPresenceSnap =
  await transaction.get(
    guestPresenceRef,
  );

const hostPresenceData =
  hostPresenceSnap.exists()
    ? (
        hostPresenceSnap.data() as PresenceRecord
      )
    : null;

const guestPresenceData =
  guestPresenceSnap.exists()
    ? (
        guestPresenceSnap.data() as PresenceRecord
      )
    : null;

if (
  isStageStale(
    roomData,
    hostPresenceData,
    guestPresenceData,
  )
) {
  throw new Error(
    'ROOM_STALE',
  );
}
            }

            // -------------------------------------------------
            // すでにGuestがいる
            // -------------------------------------------------

            if (
              roomData.guestJoined ===
                true ||
              roomData.guestUid
            ) {
              throw new Error(
                'ROOM_FULL',
              );
            }

            // -------------------------------------------------
            // 新しいGuestとして参加
            // -------------------------------------------------

transaction.update(
  roomRef,
  {
    guestUid:
      currentUser.uid,

    guestJoined:
      true,

    guestRejoinedAt:
      now,

    guestLastSeenAt:
      now,
  },
);

transaction.set(
  guestPresenceRef,
  {
    uid:
      currentUser.uid,

    role:
      'guest',

    lastSeenAt:
      now,
  },
);

return {
  mode:
    'joined' as const,
};
          },
        );

      // -------------------------------------------------------
      // 新規Guest時だけPlayerを初期化。
      // 再入室時は既存状態を維持する。
      // -------------------------------------------------------

      if (
        result.mode ===
        'joined'
      ) {
        await resetPlayerForNewStage(
          guestPlayerRef,
          currentUser.uid,
          'guest',
          now,
        );

        await resetPrivatePlayerForNewStage(
          guestPrivatePlayerRef,
          currentUser.uid,
        );
      }

      setIsLoading(false);

      onMatchStart(
        roomId,
        false,
      );
    } catch (err) {
      console.error(
        'Join Room Error:',
        err,
      );

      setIsLoading(false);

      if (
        err instanceof Error
      ) {
        switch (
          err.message
        ) {
          case 'ROOM_NOT_FOUND':
            setStatusMessage(
              '❌ 一致するステージが見つかりません。合言葉を確認してください。',
            );
            return;

          case 'ROOM_CLOSED':
            setStatusMessage(
              '❌ このステージは終了しています。新しいステージを作成してください。',
            );
            return;

          case 'ROOM_STALE':
            setStatusMessage(
              '❌ このステージは60秒以上放置されたため利用できません。新しいステージを作成してください。',
            );
            return;

          case 'SELF_JOIN':
            setStatusMessage(
              '❌ 自分で作成したステージには参加できません。作成側から再入室してください。',
            );
            return;

          case 'ROOM_FULL':
            setStatusMessage(
              '❌ このステージはすでに対戦中です。',
            );
            return;
        }
      }

      setStatusMessage(
        '❌ ステージへの参加に失敗しました。',
      );
    }
  };

  return (
    <div className="flex h-full min-h-0 w-full items-center justify-center bg-gradient-to-br from-slate-50 via-white to-indigo-50 px-4 py-4 text-slate-900 sm:px-6">
      <div className="w-full max-w-md rounded-[2rem] border border-white/80 bg-white/90 p-5 shadow-2xl shadow-slate-200/60 backdrop-blur-md sm:p-6">
        <div className="flex items-center justify-between gap-3 border-b border-slate-200 pb-4">
          <div>
            <div className="text-[10px] font-black tracking-[0.22em] text-indigo-500">
              FRIEND MATCH
            </div>
            <h2 className="mt-1 text-xl font-black text-slate-950">
              友達と対戦する
            </h2>
          </div>
          <button
            type="button"
            onClick={onBack}
            disabled={isLoading}
            className="rounded-xl bg-slate-100 px-3 py-2 text-[10px] font-black text-slate-600 transition hover:bg-slate-200 disabled:opacity-40"
          >
            ← 戻る
          </button>
        </div>

        {statusMessage && (
          <div className="mt-4 rounded-2xl border border-indigo-200 bg-indigo-50 p-3 text-center text-xs font-bold leading-relaxed text-indigo-900">
            {statusMessage}
          </div>
        )}

        {mode === 'menu' && (
          <div className="mt-5 space-y-3">
            <button
              type="button"
              onClick={() => {
                setMode('create');
                setStatusMessage('');
                setRoomKey('');
              }}
              className="w-full rounded-2xl bg-indigo-600 px-4 py-4 text-left text-white shadow-lg shadow-indigo-200 transition hover:bg-indigo-700"
            >
              <div className="text-base font-black">ステージを作る</div>
              <div className="mt-1 text-[11px] font-bold text-indigo-100">
                合言葉を決めて、友達を待ちます。
              </div>
            </button>

            <button
              type="button"
              onClick={() => {
                setMode('join');
                setStatusMessage('');
                setRoomKey('');
              }}
              className="w-full rounded-2xl bg-emerald-600 px-4 py-4 text-left text-white shadow-lg shadow-emerald-200 transition hover:bg-emerald-700"
            >
              <div className="text-base font-black">ステージに入る</div>
              <div className="mt-1 text-[11px] font-bold text-emerald-100">
                友達から教えてもらった合言葉を入力します。
              </div>
            </button>
          </div>
        )}

        {mode === 'create' && (
          <div className="mt-5 space-y-4">
            {!isWaitingForGuest ? (
              <>
                <div>
                  <label className="block text-xs font-black text-slate-700">
                    合言葉を設定
                  </label>
                  <div className="mt-1 text-[10px] font-bold text-slate-400">
                    ひらがな・漢字もOK
                  </div>
                  <input
                    type="text"
                    value={roomKey}
                    onChange={(e) => setRoomKey(e.target.value)}
                    placeholder="例：ともだち"
                    disabled={isLoading}
                    className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base font-bold text-slate-900 outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100 disabled:bg-slate-50"
                  />
                </div>

                <button
                  type="button"
                  onClick={handleCreateStage}
                  disabled={isLoading}
                  className="w-full rounded-2xl bg-indigo-600 px-4 py-3.5 text-sm font-black text-white shadow-lg shadow-indigo-200 transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isLoading ? 'ステージを確認中…' : 'ステージ作成'}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setMode('menu');
                    setStatusMessage('');
                    setRoomKey('');
                  }}
                  className="w-full rounded-xl py-2 text-xs font-black text-slate-400 transition hover:text-slate-700"
                >
                  キャンセル
                </button>
              </>
            ) : (
              <div className="text-center">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-indigo-50 text-3xl">
                  ⏳
                </div>
                <div className="mt-4 text-xs font-black tracking-[0.18em] text-indigo-500">
                  WAITING
                </div>
                <h3 className="mt-1 text-2xl font-black text-slate-950">
                  相手を待っています
                </h3>
                <div className="mt-4 rounded-2xl border border-indigo-100 bg-indigo-50 p-4">
                  <div className="text-[10px] font-black text-indigo-500">合言葉</div>
                  <div className="mt-1 break-all text-2xl font-black tracking-widest text-indigo-950">
                    {roomKey}
                  </div>
                </div>
                <p className="mt-4 text-xs font-bold leading-relaxed text-slate-500">
                  この画面を開いたまま、友達に合言葉を伝えてください。<br />
                  相手が参加すると自動で対戦画面へ進みます。
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setMode('menu');
                    setIsWaitingForGuest(false);
                    setStatusMessage('');
                    setRoomKey('');
                  }}
                  className="mt-5 w-full rounded-xl py-2.5 text-xs font-black text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                >
                  ステージをやめる
                </button>
              </div>
            )}
          </div>
        )}

        {mode === 'join' && (
          <div className="mt-5 space-y-4">
            <div>
              <label className="block text-xs font-black text-slate-700">
                合言葉を入力
              </label>
              <input
                type="text"
                value={roomKey}
                onChange={(e) => setRoomKey(e.target.value)}
                placeholder="例：ともだち"
                disabled={isLoading}
                className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base font-bold text-slate-900 outline-none transition focus:border-emerald-400 focus:ring-4 focus:ring-emerald-100 disabled:bg-slate-50"
              />
            </div>

            <button
              type="button"
              onClick={handleConfirmJoin}
              disabled={isLoading}
              className="w-full rounded-2xl bg-emerald-600 px-4 py-3.5 text-sm font-black text-white shadow-lg shadow-emerald-200 transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isLoading ? 'ステージを確認中…' : 'ステージに入る'}
            </button>

            <button
              type="button"
              onClick={() => {
                setMode('menu');
                setStatusMessage('');
                setRoomKey('');
              }}
              className="w-full rounded-xl py-2 text-xs font-black text-slate-400 transition hover:text-slate-700"
            >
              キャンセル
            </button>
          </div>
        )}

        {showConfirmModal && (
          <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/60 px-4 py-6 backdrop-blur-sm">
            <div className="w-full max-w-xs rounded-3xl bg-white p-5 shadow-2xl">
              <div className="text-center">
                <div className="text-xs font-black tracking-[0.18em] text-emerald-500">
                  JOIN STAGE
                </div>
                <h3 className="mt-1 text-lg font-black text-slate-950">
                  このステージに入りますか？
                </h3>
                <p className="mt-3 text-xs font-bold leading-relaxed text-slate-500">
                  合言葉
                  <span className="mx-1 font-black text-emerald-600">
                    「{roomKey}」
                  </span>
                  で参加します。
                </p>
              </div>

              <div className="mt-5 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setShowConfirmModal(false)}
                  className="rounded-xl bg-slate-100 px-3 py-3 text-xs font-black text-slate-700 transition hover:bg-slate-200"
                >
                  いいえ
                </button>
                <button
                  type="button"
                  onClick={handleJoinStage}
                  className="rounded-xl bg-emerald-600 px-3 py-3 text-xs font-black text-white transition hover:bg-emerald-700"
                >
                  はい
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );

}