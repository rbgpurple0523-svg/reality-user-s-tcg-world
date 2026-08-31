'use client';

import React, { useState } from 'react';
import { db, ensureAnonymousAuth } from '@/lib/firebase';
import { doc, setDoc, getDoc, updateDoc, onSnapshot, deleteDoc } from 'firebase/firestore';

interface FriendMatchSetupProps {
  // 従来の DataConnection の代わりに roomId と isHost を渡す仕様に変更
  onMatchStart: (roomId: string, isHost: boolean) => void;
  onBack: () => void;
}

export default function FriendMatchSetup({ onMatchStart, onBack }: FriendMatchSetupProps) {
  const [mode, setMode] = useState<'menu' | 'create' | 'join'>('menu');
  const [roomKey, setRoomKey] = useState<string>('');
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [showConfirmModal, setShowConfirmModal] = useState<boolean>(false);
  const [isWaitingForGuest, setIsWaitingForGuest] = useState<boolean>(false);

  // ===== 放置ステージの判定 =====
  // 両者がいなくなった古いステージは、次回同じ合言葉を使えるよう自動解放します。
  const STALE_STAGE_MS = 60 * 1000;
  const isStageStale = (data: Record<string, any>) => {
    const now = Date.now();
    const hostSeen = Number(data.hostLastSeenAt || 0);
    const guestSeen = Number(data.guestLastSeenAt || 0);
    const createdAt = Number(data.createdAt || 0);

    if (hostSeen || guestSeen) {
      const hostStale = !hostSeen || now - hostSeen > STALE_STAGE_MS;
      const guestStale = !guestSeen || now - guestSeen > STALE_STAGE_MS;
      return hostStale && guestStale;
    }

    // 旧バージョンのルームにはハートビートがないため、古いものだけ解放します。
    return createdAt > 0 && now - createdAt > STALE_STAGE_MS;
  };

  // 1. ステージ（ルーム）を作成する (ホスト)
  const handleCreateStage = async () => {
    if (!roomKey.trim()) {
      setStatusMessage('⚠️ 合言葉を入力してください。');
      return;
    }

    setIsLoading(true);
    setStatusMessage('ステージを作成中...');

    const roomId = roomKey.trim();

    try {
      const user = await ensureAnonymousAuth();
      const roomRef = doc(db, 'rooms', roomId);
      // ===== 合言葉の重複チェック =====
      const roomSnap = await getDoc(roomRef);
      if (roomSnap.exists()) {
        const existingData = roomSnap.data() as Record<string, any>;
        if (isStageStale(existingData)) {
          // ===== 誰もいなくなった古いステージを解放 =====
          await deleteDoc(roomRef);
        } else {
          setIsLoading(false);
          setStatusMessage('❌ その合言葉のステージはすでに使用されています。別の合言葉を設定してください。');
          return;
        }
      }

      // ===== 新しいステージの初期データ =====
      await setDoc(roomRef, {
        hostJoined: true,
        guestJoined: false,
        hostUid: user.uid,
        guestUid: null,
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
        exitHost: false,
        exitGuest: false,
        createdAt: Date.now(),
        hostLastSeenAt: Date.now(),
        guestLastSeenAt: 0,
      });

      setIsLoading(false);
      setIsWaitingForGuest(true);
      setStatusMessage(`🎉 ステージ「${roomKey}」を作成しました！友達の参加を待っています...`);

      // ゲストが入室したか（guestJoined が true になったか）をリアルタイム監視
      const unsubscribe = onSnapshot(roomRef, (docSnap) => {
        const data = docSnap.data();
        if (data && data.guestJoined) {
          unsubscribe();
          onMatchStart(roomId, true);
        }
      });

    } catch (err) {
      console.error('Create Room Error:', err);
      setIsLoading(false);
      setStatusMessage('❌ ステージの作成に失敗しました。ネットワーク環境を確認してください。');
    }
  };

  // 2. 確認ポップアップ
  const handleConfirmJoin = () => {
    if (!roomKey.trim()) {
      setStatusMessage('⚠️ 合言葉を入力してください。');
      return;
    }
    setShowConfirmModal(true);
  };

  // 3. 友達のステージに入る (ゲスト)
  const handleJoinStage = async () => {
    setShowConfirmModal(false);
    setIsLoading(true);
    setStatusMessage('ステージを探しています...');

    const roomId = roomKey.trim();

    try {
      const user = await ensureAnonymousAuth();
      const roomRef = doc(db, 'rooms', roomId);
      const roomSnap = await getDoc(roomRef);
      if (!roomSnap.exists()) {
        setIsLoading(false);
        setStatusMessage('❌ 一致するステージが見つかりません。合言葉を確認してください。');
        return;
      }

      const roomData = roomSnap.data() as Record<string, any>;

      // 自分で作ったステージへ同じ端末からゲスト参加することを防ぐ。
      if (roomData.hostUid && roomData.hostUid === user.uid) {
        setIsLoading(false);
        setStatusMessage('❌ 自分で作成したステージにはゲストとして参加できません。');
        return;
      }

      if (isStageStale(roomData)) {
        // ===== 誰もいなくなった古いステージを解放 =====
        await deleteDoc(roomRef);
        setIsLoading(false);
        setStatusMessage('❌ 一致するステージが見つかりません。合言葉を確認してください。');
        return;
      }

      // ===== 満員チェック =====
      if (roomData.guestJoined === true) {
        setIsLoading(false);
        setStatusMessage('❌ このステージはすでに対戦中です。');
        return;
      }

      // ===== ゲスト参加をマーク =====
      await updateDoc(roomRef, {
        guestJoined: true,
        guestUid: user.uid,
        guestRejoinedAt: Date.now(),
        guestLastSeenAt: Date.now(),
      });

      setIsLoading(false);
      onMatchStart(roomId, false);

    } catch (err) {
      console.error('Join Room Error:', err);
      setIsLoading(false);
      setStatusMessage('❌ ステージへの参加に失敗しました。');
    }
  };

  return (
    <div className="max-w-md mx-auto p-6 bg-white rounded-2xl shadow-md border border-gray-100 space-y-6">
      <div className="flex justify-between items-center border-b pb-3">
        <h2 className="text-lg font-bold text-gray-800">🎮 友達と対戦する (Firebase版)</h2>
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
            onClick={() => { setMode('create'); setStatusMessage(''); }}
            className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow transition cursor-pointer"
          >
            ➕ 友達と使うステージを作成する
          </button>
          <button
            onClick={() => { setMode('join'); setStatusMessage(''); }}
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
            <label className="block text-xs font-bold text-gray-700 mb-1">合言葉を設定（ひらがな・漢字もOK！）</label>
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
              <div className="animate-spin text-2xl inline-block">⏳</div>
              <p className="text-xs text-gray-500 font-bold">対戦相手の参加を待っています...</p>
            </div>
          )}

          <button
            onClick={() => { setMode('menu'); setIsWaitingForGuest(false); setStatusMessage(''); }}
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
            <label className="block text-xs font-bold text-gray-700 mb-1">合言葉を入力</label>
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
            onClick={() => { setMode('menu'); setStatusMessage(''); }}
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
            <h3 className="font-bold text-gray-800 text-sm">確認</h3>
            <p className="text-xs text-gray-600">
              合言葉 <span className="font-bold text-indigo-600">「{roomKey}」</span> で間違いないですか？
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