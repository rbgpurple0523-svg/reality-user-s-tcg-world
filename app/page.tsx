'use client';

import React, { useState } from 'react';
import CardGenerator from '@/components/CardGenerator';
import SupportCardGenerator from '@/components/SupportCardGenerator';
import DeckBuilder from '@/components/DeckBuilder';
import GameBoard from '@/components/GameBoard';
import EntryHub from '@/components/EntryHub';
import FriendMatchSetup from '@/components/FriendMatchSetup';

type CurrentView =
  | 'menu'
  | 'cardGen'
  | 'supportGen'
  | 'entryHub'
  | 'deckBuilder'
  | 'gameBoard'
  | 'friendMatchSetup'
  | 'friendGameBoard';

export default function Home() {
  const [currentView, setCurrentView] = useState<CurrentView>('menu');
  const [editingDeckId, setEditingDeckId] = useState<string | null>(null);
  const [deckBuilderReturnView, setDeckBuilderReturnView] = useState<CurrentView>('menu');

  // ===== CPU対戦への共通遷移 =====
  // DeckBuilderからもメニューと同じ遷移先を使います。
  const handleStartCpuBattle = () => {
    setEditingDeckId(null);
    setCurrentView('gameBoard');
  };

  // ===== 対戦準備画面からデッキ編集へ =====
  // 編集対象のデッキIDを保持し、GameBoardへ戻ったときに同じ対戦画面へ復帰します。
  const handleEditDeck = (deckId: string) => {
    setEditingDeckId(deckId);
    setDeckBuilderReturnView(currentView === 'friendGameBoard' ? 'friendGameBoard' : 'gameBoard');
    setCurrentView('deckBuilder');
  };

  const handleReturnFromDeckBuilder = () => {
    setCurrentView(deckBuilderReturnView);
    setEditingDeckId(null);
  };

  // ===== Firebase対戦用のルーム情報 =====
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null);
  const [isHostPlayer, setIsHostPlayer] = useState<boolean>(false);

  // ===== マッチング完了時にGameBoardへルーム情報を渡す =====
  const handleMatchStart = (roomId: string, isHost: boolean) => {
    setActiveRoomId(roomId);
    setIsHostPlayer(isHost);
    setCurrentView('friendGameBoard');
  };

  // ===== メインメニューへ戻る =====
  const handleReturnToMenu = () => {
    setActiveRoomId(null);
    setIsHostPlayer(false);
    setEditingDeckId(null);
    setDeckBuilderReturnView('menu');
    setCurrentView('menu');
  };

  return (
    <main className="min-h-screen bg-white text-gray-900 flex flex-col">
      {/* 共通ヘッダー */}
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex justify-between items-center shadow-sm">
        <div className="flex items-center space-x-3 cursor-pointer" onClick={handleReturnToMenu}>
          <span className="text-2xl">✨</span>
          <h1 className="text-xl font-extrabold tracking-wider text-indigo-600">
            REALITY TCG WORLD
          </h1>
        </div>

        {currentView !== 'menu' && (
          <button
            onClick={handleReturnToMenu}
            className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-800 text-xs font-bold rounded-xl transition cursor-pointer border border-gray-300 shadow-sm"
          >
            🏠 メインメニューに戻る
          </button>
        )}
      </header>

      {/* メインコンテンツエリア */}
      <div className="flex-1 flex flex-col items-center justify-center p-6">
        {currentView === 'menu' && (
          <div className="max-w-2xl w-full space-y-8 text-center">
            <div className="space-y-3">
              <h2 className="text-3xl font-extrabold text-gray-900">ゲームメニュー</h2>
              <p className="text-sm text-gray-600">
                あなたの分身となるアバターを世界に登録し、デッキを組んでバトルに挑もう！
              </p>
            </div>

            <div className="grid grid-cols-1 gap-4 text-left">
              {/* セクション 1: カードに自分のアバターを登録する */}
              <div className="bg-white border border-gray-200 rounded-2xl p-5 space-y-3 shadow-sm">
                <div className="flex items-center space-x-2 text-indigo-600 font-bold text-sm">
                  <span>👤</span>
                  <span>カードに自分のアバターを登録する</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <button
                    onClick={() => setCurrentView('cardGen')}
                    className="p-4 bg-gray-50 hover:bg-indigo-50 border border-gray-200 hover:border-indigo-200 rounded-xl transition text-left space-y-1 cursor-pointer group"
                  >
                    <div className="font-bold text-gray-900 group-hover:text-indigo-700 text-sm">キャラカードとしてエントリー</div>
                    <div className="text-xs text-gray-500">自由なコーデ・4つのワザで登録する</div>
                  </button>

                  <button
                    onClick={() => setCurrentView('supportGen')}
                    className="p-4 bg-gray-50 hover:bg-indigo-50 border border-gray-200 hover:border-indigo-200 rounded-xl transition text-left space-y-1 cursor-pointer group"
                  >
                    <div className="font-bold text-gray-900 group-hover:text-indigo-700 text-sm">サポートカードとしてエントリー</div>
                    <div className="text-xs text-gray-500">エモーション・1つの効果で登録する</div>
                  </button>

                  <button
                    onClick={() => setCurrentView('entryHub')}
                    className="p-4 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-xl transition text-left space-y-1 cursor-pointer group shadow-sm sm:col-span-3"
                  >
                    <div className="font-bold text-indigo-900 group-hover:text-indigo-950 text-sm flex items-center justify-between">
                      <span>コーデ・エモーション一覧から選んでエントリーする</span>
                      <span className="text-[10px] bg-indigo-600 text-white px-2 py-0.5 rounded-full font-bold">RECOMMEND</span>
                    </div>
                    <div className="text-xs text-indigo-700">まだ誰も使っていない公式のマトリクス枠からアバターを登録する</div>
                  </button>
                </div>
              </div>

              {/* セクション 2: デッキを構築する */}
              <div className="bg-white border border-gray-200 rounded-2xl p-5 space-y-3 shadow-sm">
                <div className="flex items-center space-x-2 text-indigo-600 font-bold text-sm">
                  <span>🃏</span>
                  <span>デッキを構築する</span>
                </div>
                <button
                  onClick={() => setCurrentView('deckBuilder')}
                  className="w-full p-4 bg-gray-50 hover:bg-indigo-50 border border-gray-200 hover:border-indigo-200 rounded-xl transition text-left space-y-1 cursor-pointer"
                >
                  <div className="font-bold text-gray-900 text-sm">デッキビルダー (`DeckBuilder`)</div>
                  <div className="text-xs text-gray-500">作成したカードを組み合わせて戦闘用デッキを編成する</div>
                </button>
              </div>

              {/* セクション 3: ゲームで遊ぶ */}
              <div className="bg-white border border-gray-200 rounded-2xl p-5 space-y-3 shadow-sm">
                <div className="flex items-center space-x-2 text-emerald-600 font-bold text-sm">
                  <span>⚔️</span>
                  <span>ゲームで遊ぶ</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <button
                    onClick={handleStartCpuBattle}
                    className="p-4 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-xl transition text-left space-y-1 cursor-pointer"
                  >
                    <div className="font-bold text-emerald-900 text-sm">CPUと対戦する</div>
                    <div className="text-xs text-emerald-700">AIを相手にシングルプレイバトル</div>
                  </button>

                  <button
                    onClick={() => setCurrentView('friendMatchSetup')}
                    className="p-4 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-xl transition text-left space-y-1 cursor-pointer group"
                  >
                    <div className="font-bold text-emerald-900 group-hover:text-emerald-950 text-sm">友達と対戦する</div>
                    <div className="text-xs text-emerald-700">合言葉を使ってリアルタイム対戦</div>
                  </button>

                  <button
                    onClick={() => alert('「世界のだれかと対戦する」機能は今後実装予定です！')}
                    className="p-4 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-xl transition text-left space-y-1 cursor-pointer opacity-70"
                  >
                    <div className="font-bold text-gray-700 text-sm">世界のだれかと対戦する</div>
                    <div className="text-xs text-gray-400">オンラインマッチ (予定)</div>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 各画面の切り替え表示 */}
        {currentView === 'cardGen' && <CardGenerator />}
        {currentView === 'supportGen' && <SupportCardGenerator />}
        {currentView === 'entryHub' && <EntryHub />}
        {currentView === 'deckBuilder' && (
          <DeckBuilder
            initialDeckId={editingDeckId}
            onGoToCpuBattle={editingDeckId ? handleReturnFromDeckBuilder : handleStartCpuBattle}
            battleButtonLabel={editingDeckId ? '⚔️ 対戦へ戻る' : '⚔️ CPU対戦へ'}
          />
        )}
        {currentView === 'gameBoard' && <GameBoard onEditDeck={handleEditDeck} />}

        {/* 友達対戦：セットアップ画面 */}
        {currentView === 'friendMatchSetup' && (
          <FriendMatchSetup
            onMatchStart={handleMatchStart}
            onBack={handleReturnToMenu}
          />
        )}

        {/* 友達対戦：盤面画面 */}
        {currentView === 'friendGameBoard' && activeRoomId && (
          <GameBoard
            roomId={activeRoomId}
            isHost={isHostPlayer}
            onEditDeck={handleEditDeck}
          />
        )}
      </div>

      {/* フッター */}
      <footer className="bg-white border-t border-gray-200 py-3 text-center text-xs text-gray-500">
        REALITY TCG Project &copy; 2026
      </footer>
    </main>
  );
}
