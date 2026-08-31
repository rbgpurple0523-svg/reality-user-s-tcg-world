'use client';

import React, { useState } from 'react';
import { db, ensureAnonymousAuth } from '@/lib/firebase';
import {
  doc,
  onSnapshot,
  runTransaction,
} from 'firebase/firestore';

interface FriendMatchSetupProps {
  onMatchStart: (roomId: string, isHost: boolean) => void;
  onBack: () => void;
}

export default function FriendMatchSetup({
  onMatchStart,
  onBack,
}: FriendMatchSetupProps) {
  const [mode, setMode] = useState<'menu' | 'create' | 'join'>('menu');
  const [roomKey, setRoomKey] = useState<string>('');
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [showConfirmModal, setShowConfirmModal] = useState<boolean>(false);
  const [isWaitingForGuest, setIsWaitingForGuest] = useState<boolean>(false);

  // ===== 放置ステージの判定 =====
  const STALE_STAGE_MS = 60 * 1000;

  const isStageStale = (data: Record<string, any>) => {
    const now = Date.now();

    const hostSeen = Number(data.hostLastSeenAt || 0);
    const guestSeen = Number(data.guestLastSeenAt || 0);
    const createdAt = Number(data.createdAt || 0);

    if (hostSeen || guestSeen) {
      const hostStale =
        !hostSeen || now - hostSeen > STALE_STAGE_MS;

      const guestStale =
        !guestSeen || now - guestSeen > STALE_STAGE_MS;

      return hostStale && guestStale;
    }

    // 旧バージョンのルーム
    return createdAt > 0 && now - createdAt > STALE_STAGE_MS;
  };

  // =========================================================
  // 1. ステージ作成（ホスト）
  // =========================================================

  const handleCreateStage = async () => {
    if (!roomKey.trim()) {
      setStatusMessage('⚠️ 合言葉を入力してください。');
      return;
    }

    setIsLoading(true);
    setStatusMessage('ステージを作成中...');

    const roomId = roomKey.trim();
    const roomRef = doc(db, 'rooms', roomId);
    const hostPlayerRef = doc(db, 'rooms', roomId, 'players', 'host');

    try {
      // Firebase匿名認証
      const currentUser = await ensureAnonymousAuth();

      const now = Date.now();

      // =====================================================
      // Room + Host Player 作成をTransaction化
      //
      // 既存のRoom構造は維持しつつ、
      // プレイヤー固有データを players/host に分離する。
      // =====================================================

      await runTransaction(db, async (transaction) => {
        const roomSnap = await transaction.get(roomRef);

        if (roomSnap.exists()) {
          const existingData =
            roomSnap.data() as Record<string, any>;

          if (!isStageStale(existingData)) {
            throw new Error('ROOM_ALREADY_IN_USE');
          }

          // 古いルームを解放
          transaction.delete(roomRef);

          // 念のため旧playerドキュメントも削除対象にする。
          transaction.delete(hostPlayerRef);
          transaction.delete(
            doc(db, 'rooms', roomId, 'players', 'guest'),
          );
        }

        // ===================================================
        // Room本体
        // ===================================================

        transaction.set(roomRef, {
          // ===== Authentication =====
          hostUid: currentUser.uid,
          guestUid: null,

          // ===== 入室状態 =====
          hostJoined: true,
          guestJoined: false,

          // ===== Battle state =====
          battlePhase: 'setup',
          currentYear: 1,
          turnIndex: 0,
          firstPlayer: null,
          startSeasonIdx: null,

          // ===== Score =====
          hostTotalScore: 0,
          guestTotalScore: 0,

          hostClassScores: [0, 0, 0],
          guestClassScores: [0, 0, 0],

          // ===== Skill =====
          hostUsedSkills: {},
          guestUsedSkills: {},

          // ===== Match control =====
          rematchHost: false,
          rematchGuest: false,
          exitHost: false,
          exitGuest: false,

          // ===== Time =====
          createdAt: now,
          hostLastSeenAt: now,
          guestLastSeenAt: 0,
        });

        // ===================================================
        // Host Player
        //
        // キャラクター・デッキ等はGameBoard側で設定する。
        // ここでは「このroomのhostである」という
        // プレイヤー状態の土台だけを作る。
        // ===================================================

        transaction.set(hostPlayerRef, {
          uid: currentUser.uid,
          role: 'host',

          joined: true,
          ready: false,

          createdAt: now,
          lastSeenAt: now,

          // GameBoardで後から設定する領域
          avatars: [],
          deck: [],
          hand: [],
          usedSkills: {},
        });
      });

      setIsLoading(false);
      setIsWaitingForGuest(true);

      setStatusMessage(
        `🎉 ステージ「${roomKey}」を作成しました！友達の参加を待っています...`,
      );

      // =====================================================
      // ゲスト参加監視
      // =====================================================

      const unsubscribe = onSnapshot(roomRef, (docSnap) => {
        const data = docSnap.data();

        if (data && data.guestJoined && data.guestUid) {
          unsubscribe();
          onMatchStart(roomId, true);
        }
      });

    } catch (err) {
      console.error('Create Room Error:', err);

      if (
        err instanceof Error &&
        err.message === 'ROOM_ALREADY_IN_USE'
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
      setStatusMessage('⚠️ 合言葉を入力してください。');
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
    setStatusMessage('ステージを探しています...');

    const roomId = roomKey.trim();
    const roomRef = doc(db, 'rooms', roomId);
    const guestPlayerRef = doc(
      db,
      'rooms',
      roomId,
      'players',
      'guest',
    );

    try {
      // Firebase匿名認証
      const currentUser = await ensureAnonymousAuth();

      // =====================================================
      // ゲスト参加をTransaction化
      //
      // 「空いている場合だけguestUidを取得する」
      // 「同時にplayers/guestを作成する」
      //
      // を一つの原子的処理にする。
      // =====================================================

      await runTransaction(db, async (transaction) => {
        const roomSnap = await transaction.get(roomRef);

        if (!roomSnap.exists()) {
          throw new Error('ROOM_NOT_FOUND');
        }

        const roomData =
          roomSnap.data() as Record<string, any>;

        // 古いルームなら削除
        if (isStageStale(roomData)) {
          transaction.delete(roomRef);
          transaction.delete(guestPlayerRef);

          throw new Error('ROOM_STALE');
        }

        // ===================================================
        // 自分自身のルームには参加できない
        // ===================================================

        if (
          roomData.hostUid &&
          roomData.hostUid === currentUser.uid
        ) {
          throw new Error('SELF_JOIN');
        }

        // ===================================================
        // すでにゲストがいる場合
        // ===================================================

        if (
          roomData.guestJoined === true ||
          roomData.guestUid
        ) {
          throw new Error('ROOM_FULL');
        }

        const now = Date.now();

        // ===================================================
        // Room側のゲスト参加状態
        // ===================================================

        transaction.update(roomRef, {
          guestUid: currentUser.uid,
          guestJoined: true,
          guestRejoinedAt: now,
          guestLastSeenAt: now,
        });

        // ===================================================
        // Guest Player
        //
        // GameBoard側でキャラクター・デッキ等を設定する。
        // ===================================================

        transaction.set(guestPlayerRef, {
          uid: currentUser.uid,
          role: 'guest',

          joined: true,
          ready: false,

          createdAt: now,
          lastSeenAt: now,

          // GameBoardで後から設定する領域
          avatars: [],
          deck: [],
          hand: [],
          usedSkills: {},
        });
      });

      setIsLoading(false);

      // ゲストとして対戦開始
      onMatchStart(roomId, false);

    } catch (err) {
      console.error('Join Room Error:', err);

      setIsLoading(false);

      if (err instanceof Error) {
        switch (err.message) {
          case 'ROOM_NOT_FOUND':
          case 'ROOM_STALE':
            setStatusMessage(
              '❌ 一致するステージが見つかりません。合言葉を確認してください。',
            );
            return;

          case 'SELF_JOIN':
            setStatusMessage(
              '❌ 自分で作成したステージには参加できません。別のプレイヤーに参加してもらってください。',
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
              onChange={(e) => setRoomKey(e.target.value)}
              placeholder="例: ともだち"
              disabled={isLoading || isWaitingForGuest}
              className="w-full px-3 py-2 border rounded-xl text-sm bg-white text-gray-900 focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          {!isWaitingForGuest ? (
            <button
              onClick={handleCreateStage}
              disabled={isLoading}
              className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-sm transition cursor-pointer disabled:opacity-50"
            >
              {isLoading ? '作成中...' : 'ステージを作成'}
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
              onChange={(e) => setRoomKey(e.target.value)}
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
            {isLoading ? '検索中...' : 'ステージに入る'}
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
                onClick={() => setShowConfirmModal(false)}
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
