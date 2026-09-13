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

    const roomRef = doc(
      db,
      'rooms',
      roomId,
    );

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

    try {
      const currentUser =
        await ensureAnonymousAuth();

      const now = Date.now();

      const result =
        await runTransaction(
          db,
          async (transaction) => {
            const roomSnap =
              await transaction.get(
                roomRef,
              );

            // -------------------------------------------------
            // Roomが存在しない
            // -------------------------------------------------

            if (!roomSnap.exists()) {
              transaction.set(
                roomRef,
                {
                  hostUid:
                    currentUser.uid,

                  guestUid:
                    null,

                  hostJoined:
                    true,

                  guestJoined:
                    false,

                  battlePhase:
                    'setup',

                  currentYear:
                    1,

                  turnIndex:
                    0,

                  firstPlayer:
                    null,

                  startSeasonIdx:
                    null,

                  hostTotalScore:
                    0,

                  guestTotalScore:
                    0,

                  hostClassScores:
                    [0, 0, 0],

                  guestClassScores:
                    [0, 0, 0],

                  hostUsedSkills:
                    {},

                  guestUsedSkills:
                    {},

                  rematchHost:
                    false,

                  rematchGuest:
                    false,

                  rematchPlayerResetHost:
                    false,

                  rematchPlayerResetGuest:
                    false,

                  exitHost:
                    false,

                  exitGuest:
                    false,

                  readyHost:
                    false,

                  readyGuest:
                    false,

                  roomClosed:
                    false,

                  createdAt:
                    now,

                  hostLastSeenAt:
                    now,

                  guestLastSeenAt:
                    0,
                },
              );

              return {
                mode:
                  'created' as const,
                guestJoined:
                  false,
              };
            }

            const roomData =
              roomSnap.data() as RoomRecord;

            // -------------------------------------------------
            // 明示的に閉じられたRoom
            // → 新しいHostとして再利用
            // -------------------------------------------------

            if (
              roomData.roomClosed ===
              true
            ) {
              transaction.set(
                roomRef,
                {
                  hostUid:
                    currentUser.uid,

                  guestUid:
                    null,

                  hostJoined:
                    true,

                  guestJoined:
                    false,

                  battlePhase:
                    'setup',

                  currentYear:
                    1,

                  turnIndex:
                    0,

                  firstPlayer:
                    null,

                  startSeasonIdx:
                    null,

                  hostTotalScore:
                    0,

                  guestTotalScore:
                    0,

                  hostClassScores:
                    [0, 0, 0],

                  guestClassScores:
                    [0, 0, 0],

                  hostUsedSkills:
                    {},

                  guestUsedSkills:
                    {},

                  rematchHost:
                    false,

                  rematchGuest:
                    false,

                  rematchPlayerResetHost:
                    false,

                  rematchPlayerResetGuest:
                    false,

                  exitHost:
                    false,

                  exitGuest:
                    false,

                  readyHost:
                    false,

                  readyGuest:
                    false,

                  roomClosed:
                    false,

                  createdAt:
                    now,

                  hostLastSeenAt:
                    now,

                  guestLastSeenAt:
                    0,
                },
              );

              return {
                mode:
                  'reused' as const,
                guestJoined:
                  false,
              };
            }

            // -------------------------------------------------
            // 同じHost本人の一時離脱
            // → 試合状態を維持して再入室
            // -------------------------------------------------

            if (
              roomData.hostUid ===
              currentUser.uid
            ) {
              transaction.update(
                roomRef,
                {
                  hostJoined:
                    true,

                  hostRejoinedAt:
                    now,

                  hostLastSeenAt:
                    now,
                },
              );

              return {
                mode:
                  'rejoined' as const,
                guestJoined:
                  Boolean(
                    roomData.guestJoined,
                  ),
              };
            }

            // -------------------------------------------------
            // Player情報を取得してstale判定
            // -------------------------------------------------

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

const stale =
  isStageStale(
    roomData,
    hostPresenceData,
    guestPresenceData,
  );

            if (!stale) {
              throw new Error(
                'ROOM_ALREADY_IN_USE',
              );
            }

            // -------------------------------------------------
            // stale Roomを新しいHostとして再利用
            // -------------------------------------------------

            transaction.set(
              roomRef,
              {
                hostUid:
                  currentUser.uid,

                guestUid:
                  null,

                hostJoined:
                  true,

                guestJoined:
                  false,

                battlePhase:
                  'setup',

                currentYear:
                  1,

                turnIndex:
                  0,

                firstPlayer:
                  null,

                startSeasonIdx:
                  null,

                hostTotalScore:
                  0,

                guestTotalScore:
                  0,

                hostClassScores:
                  [0, 0, 0],

                guestClassScores:
                  [0, 0, 0],

                hostUsedSkills:
                  {},

                guestUsedSkills:
                  {},

                rematchHost:
                  false,

                rematchGuest:
                  false,

                rematchPlayerResetHost:
                  false,

                rematchPlayerResetGuest:
                  false,

                exitHost:
                  false,

                exitGuest:
                  false,

                readyHost:
                  false,

                readyGuest:
                  false,

                roomClosed:
                  false,

                createdAt:
                  now,

                hostLastSeenAt:
                  now,

                guestLastSeenAt:
                  0,
              },
            );

            return {
              mode:
                'reused' as const,
              guestJoined:
                false,
            };
          },
        );

      // -------------------------------------------------------
      // 新規作成 / stale再利用時だけ
      // Host Playerを初期化
      // -------------------------------------------------------

      if (
        result.mode ===
          'created' ||
        result.mode ===
          'reused'
      ) {
        await resetPlayerForNewStage(
          hostPlayerRef,
          currentUser.uid,
          'host',
          now,
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

      // -------------------------------------------------------
      // Guest参加監視
      // -------------------------------------------------------

      const unsubscribe =
        onSnapshot(
          roomRef,
          (docSnap) => {
            const data =
              docSnap.data();

            if (
              data &&
              data.roomClosed ===
                true
            ) {
              unsubscribe();
              setIsWaitingForGuest(
                false,
              );
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
              setIsWaitingForGuest(
                false,
              );
              onMatchStart(
                roomId,
                true,
              );
            }
          },
        );

      // Host再入室時にGuestがすでにいる場合
      if (
        result.mode ===
          'rejoined' &&
        result.guestJoined
      ) {
        unsubscribe();
        setIsWaitingForGuest(
          false,
        );
        onMatchStart(
          roomId,
          true,
        );
      }
    } catch (err) {
      console.error(
        'Create Room Error:',
        err,
      );

      if (
        err instanceof Error &&
        err.message ===
          'ROOM_ALREADY_IN_USE'
      ) {
        setIsLoading(false);
        setStatusMessage(
          '❌ その合言葉のステージはすでに使用されています。別の合言葉を設定してください。',
        );
        return;
      }

      setIsLoading(false);
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

              return {
                mode:
                  'rejoined' as const,
              };
            }

            // -------------------------------------------------
            // 同じGuest以外はstale Roomへ参加不可
            // stale Roomは新しいHostが引き継ぐ。
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
              '❌ このステージは放置されているため、新しいホストによる再利用待ちです。',
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
    <div className="max-w-md mx-auto p-6 bg-white rounded-2xl shadow-md border border-gray-100 space-y-6">
      <div className="flex justify-between items-center border-b pb-3">
        <h2 className="text-lg font-bold text-gray-800">
          🎮 友達と対戦する (Firebase版)
        </h2>

        <button
          onClick={onBack}
          className="text-xs text-gray-500 hover:text-gray-700 font-bold px-2 py-1 bg-gray-100 rounded-lg cursor-pointer"
        >
          ← 戻る
        </button>
      </div>

      {statusMessage && (
        <div className="p-3 text-xs font-bold text-indigo-900 bg-indigo-50 border border-indigo-200 rounded-xl text-center">
          {statusMessage}
        </div>
      )}

      {/* メニュー選択 */}
      {mode === 'menu' && (
        <div className="space-y-3 pt-2">
          <button
            onClick={() => {
              setMode('create');
              setStatusMessage('');
            }}
            className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow transition cursor-pointer"
          >
            ➕ 友達と使うステージを作成する
          </button>

          <button
            onClick={() => {
              setMode('join');
              setStatusMessage('');
            }}
            className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl shadow transition cursor-pointer"
          >
            🔑 友達の作ったステージに入る
          </button>
        </div>
      )}

      {/* ステージ作成画面 */}
      {mode === 'create' && (
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1">
              合言葉を設定（ひらがな・漢字もOK！）
            </label>

            <input
              type="text"
              value={roomKey}
              onChange={(e) =>
                setRoomKey(e.target.value)
              }
              placeholder="例: ともだち"
              disabled={
                isLoading ||
                isWaitingForGuest
              }
              className="w-full px-3 py-2 border rounded-xl text-sm bg-white text-gray-900 focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          {!isWaitingForGuest ? (
            <button
              onClick={handleCreateStage}
              disabled={isLoading}
              className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-sm transition cursor-pointer disabled:opacity-50"
            >
              {isLoading
                ? '確認中...'
                : 'ステージを作成'}
            </button>
          ) : (
            <div className="text-center py-4 space-y-2">
              <div className="animate-spin text-2xl inline-block">
                ⏳
              </div>

              <p className="text-xs text-gray-500 font-bold">
                対戦相手の参加を待っています...
              </p>
            </div>
          )}

          <button
            onClick={() => {
              setMode('menu');
              setIsWaitingForGuest(false);
              setStatusMessage('');
            }}
            className="w-full py-1.5 text-xs text-gray-500 hover:underline font-bold cursor-pointer"
          >
            キャンセル
          </button>
        </div>
      )}

      {/* ステージ入室画面 */}
      {mode === 'join' && (
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1">
              合言葉を入力
            </label>

            <input
              type="text"
              value={roomKey}
              onChange={(e) =>
                setRoomKey(e.target.value)
              }
              placeholder="例: ともだち"
              disabled={isLoading}
              className="w-full px-3 py-2 border rounded-xl text-sm bg-white text-gray-900 focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          <button
            onClick={handleConfirmJoin}
            disabled={isLoading}
            className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-sm transition cursor-pointer disabled:opacity-50"
          >
            {isLoading
              ? '検索中...'
              : 'ステージに入る'}
          </button>

          <button
            onClick={() => {
              setMode('menu');
              setStatusMessage('');
            }}
            className="w-full py-1.5 text-xs text-gray-500 hover:underline font-bold cursor-pointer"
          >
            キャンセル
          </button>
        </div>
      )}

      {/* 確認ダイアログ */}
      {showConfirmModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl p-5 max-w-xs w-full space-y-4 text-center shadow-xl">
            <h3 className="font-bold text-gray-800 text-sm">
              確認
            </h3>

            <p className="text-xs text-gray-600">
              合言葉{' '}
              <span className="font-bold text-indigo-600">
                「{roomKey}」
              </span>{' '}
              で間違いないですか？
            </p>

            <div className="flex space-x-2 pt-2">
              <button
                onClick={() =>
                  setShowConfirmModal(false)
                }
                className="flex-1 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold text-xs rounded-xl transition cursor-pointer"
              >
                いいえ
              </button>

              <button
                onClick={handleJoinStage}
                className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl transition cursor-pointer"
              >
                はい
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}