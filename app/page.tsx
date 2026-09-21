'use client';

import React, { useState } from 'react';
import CardGenerator from '@/components/CardGenerator';
import SupportCardGenerator from '@/components/SupportCardGenerator';
import DeckBuilder from '@/components/DeckBuilder';
import GameBoard from '@/components/GameBoard';
import EntryHub, {
  COORDINATE_PRESETS,
  type CoordinatePreset,
} from '@/components/EntryHub';
import { EMOTION_PRESETS, type EmotionPreset } from '@/components/emotionPresets';
import FriendMatchSetup from '@/components/FriendMatchSetup';

type CurrentView =
  | 'menu'
  | 'cardRegisterSelect'
  | 'coordinateSelect'
  | 'emotionSelect'
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
  const [deckBuilderReturnView, setDeckBuilderReturnView] =
    useState<CurrentView>('menu');

  // ===== カード登録時の選択状態 =====
  // 選択するのは公式マスターデータ上のプリセットのみ。
  const [selectedCoordinate, setSelectedCoordinate] =
    useState<CoordinatePreset | null>(null);

  const [selectedEmotion, setSelectedEmotion] =
    useState<EmotionPreset | null>(null);

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
    setDeckBuilderReturnView(
      currentView === 'friendGameBoard'
        ? 'friendGameBoard'
        : 'gameBoard',
    );
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

    setSelectedCoordinate(null);
    setSelectedEmotion(null);

    setCurrentView('menu');
  };

  // ===== キャラカード登録開始 =====
  const handleStartCharacterRegistration = () => {
    setSelectedCoordinate(null);
    setCurrentView('coordinateSelect');
  };

  // ===== サポートカード登録開始 =====
  const handleStartSupportRegistration = () => {
    setSelectedEmotion(null);
    setCurrentView('emotionSelect');
  };

  // ===== コーデ選択確定 =====
  const handleSelectCoordinate = (coordinate: CoordinatePreset) => {
    setSelectedCoordinate(coordinate);
    setCurrentView('cardGen');
  };

  // ===== エモーション選択確定 =====
  const handleSelectEmotion = (emotion: EmotionPreset) => {
    setSelectedEmotion(emotion);
    setCurrentView('supportGen');
  };

  return (
    <main className="min-h-screen bg-white text-gray-900 flex flex-col">
      {/* 共通ヘッダー */}
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex justify-between items-center shadow-sm">
        <div
          className="flex items-center space-x-3 cursor-pointer"
          onClick={handleReturnToMenu}
        >
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
        {/* ===== ホーム ===== */}
        {currentView === 'menu' && (
          <div className="max-w-2xl w-full space-y-8 text-center">
            <div className="space-y-3">
              <h2 className="text-3xl font-extrabold text-gray-900">
                REALITY TCG WORLD
              </h2>

              <p className="text-sm text-gray-600">
                あなたの分身となるアバターをカードにして、世界に参加しよう！
              </p>
            </div>

            <div className="grid grid-cols-1 gap-4 text-left">
              {/* ===== セクション1：カード登録 ===== */}
              <div className="bg-white border border-gray-200 rounded-2xl p-5 space-y-3 shadow-sm">
                <div className="flex items-center space-x-2 text-indigo-600 font-bold text-sm">
                  <span>👤</span>
                  <span>カードに自分のアバターを登録する</span>
                </div>

                <button
                  onClick={() => setCurrentView('cardRegisterSelect')}
                  className="w-full p-5 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 hover:border-indigo-300 rounded-xl transition text-left space-y-2 cursor-pointer group"
                >
                  <div className="flex items-center justify-between">
                    <div className="font-bold text-indigo-900 group-hover:text-indigo-950 text-base">
                      自分のアバターをカードにしよう
                    </div>

                    <span className="text-lg">→</span>
                  </div>

                  <div className="text-xs text-indigo-700 leading-relaxed">
                    キャラカードとサポートカードから、あなたの参加方法を選べます。
                  </div>
                </button>
              </div>

              {/* ===== セクション2：カード一覧 ===== */}
              <div className="bg-white border border-gray-200 rounded-2xl p-5 space-y-3 shadow-sm">
                <div className="flex items-center space-x-2 text-indigo-600 font-bold text-sm">
                  <span>📚</span>
                  <span>カード一覧</span>
                </div>

                <button
                  onClick={() => setCurrentView('entryHub')}
                  className="w-full p-4 bg-gray-50 hover:bg-indigo-50 border border-gray-200 hover:border-indigo-200 rounded-xl transition text-left space-y-1 cursor-pointer group"
                >
                  <div className="flex items-center justify-between">
                    <div className="font-bold text-gray-900 group-hover:text-indigo-700 text-sm">
                      みんなのカードを見てみる
                    </div>

                    <span className="text-sm">→</span>
                  </div>

                  <div className="text-xs text-gray-500">
                    ほかの人のカードや、これから登録できるコーデ・エモーションを見られます。
                  </div>
                </button>
              </div>

              {/* ===== セクション3：デッキ ===== */}
              <div className="bg-white border border-gray-200 rounded-2xl p-5 space-y-3 shadow-sm">
                <div className="flex items-center space-x-2 text-indigo-600 font-bold text-sm">
                  <span>🃏</span>
                  <span>デッキを構築する</span>
                </div>

                <button
                  onClick={() => setCurrentView('deckBuilder')}
                  className="w-full p-4 bg-gray-50 hover:bg-indigo-50 border border-gray-200 hover:border-indigo-200 rounded-xl transition text-left space-y-1 cursor-pointer"
                >
                  <div className="font-bold text-gray-900 text-sm">
                    デッキを構築する
                  </div>

                  <div className="text-xs text-gray-500">
                    作成したカードを組み合わせて戦闘用デッキを編成します。
                  </div>
                </button>
              </div>

              {/* ===== セクション4：ゲーム ===== */}
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
                    <div className="font-bold text-emerald-900 text-sm">
                      CPUと対戦する
                    </div>

                    <div className="text-xs text-emerald-700">
                      AIを相手にシングルプレイバトル
                    </div>
                  </button>

                  <button
                    onClick={() => setCurrentView('friendMatchSetup')}
                    className="p-4 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-xl transition text-left space-y-1 cursor-pointer group"
                  >
                    <div className="font-bold text-emerald-900 group-hover:text-emerald-950 text-sm">
                      友達と対戦する
                    </div>

                    <div className="text-xs text-emerald-700">
                      合言葉を使ってリアルタイム対戦
                    </div>
                  </button>

                  <button
                    onClick={() =>
                      alert('「世界のだれかと対戦する」機能は今後実装予定です！')
                    }
                    className="p-4 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-xl transition text-left space-y-1 cursor-pointer opacity-70"
                  >
                    <div className="font-bold text-gray-700 text-sm">
                      世界のだれかと対戦する
                    </div>

                    <div className="text-xs text-gray-400">
                      オンラインマッチ (予定)
                    </div>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ===== カード登録：キャラ / サポート選択 ===== */}
        {currentView === 'cardRegisterSelect' && (
          <div className="max-w-3xl w-full space-y-8">
            <div className="text-center space-y-3">
              <div className="text-4xl">✨</div>

              <h2 className="text-3xl font-extrabold text-gray-900">
                どんなカードで参加する？
              </h2>

              <p className="text-sm text-gray-600 leading-relaxed">
                REALITYアバターは、ゲームの主役にも、
                <br />
                仲間を支えるサポートにもなれます。
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {/* キャラカード */}
              <button
                onClick={handleStartCharacterRegistration}
                className="group bg-white border-2 border-gray-200 hover:border-indigo-400 hover:bg-indigo-50 rounded-2xl p-6 text-left transition shadow-sm hover:shadow-md cursor-pointer"
              >
                <div className="flex items-center justify-between mb-5">
                  <span className="text-4xl">🧑‍🎤</span>

                  <span className="text-indigo-500 text-xl group-hover:translate-x-1 transition">
                    →
                  </span>
                </div>

                <h3 className="text-xl font-extrabold text-gray-900 group-hover:text-indigo-800 mb-2">
                  キャラカード
                </h3>

                <p className="text-sm text-gray-600 leading-relaxed mb-5">
                  あなたのアバター自身が、
                  <br />
                  ゲームの主役になるカードです。
                </p>

                <div className="bg-gray-50 group-hover:bg-white rounded-xl p-4 space-y-2">
                  <div className="text-xs font-bold text-gray-800">
                    ゲームでは…
                  </div>

                  <ul className="text-xs text-gray-600 space-y-1">
                    <li>・ステータスを持って戦う</li>
                    <li>・季節によって能力が変化</li>
                    <li>・4つの技を使う</li>
                  </ul>
                </div>

                <div className="mt-5 text-sm font-bold text-indigo-700">
                  コーデを選ぶ →
                </div>
              </button>

              {/* サポートカード */}
              <button
                onClick={handleStartSupportRegistration}
                className="group bg-white border-2 border-gray-200 hover:border-emerald-400 hover:bg-emerald-50 rounded-2xl p-6 text-left transition shadow-sm hover:shadow-md cursor-pointer"
              >
                <div className="flex items-center justify-between mb-5">
                  <span className="text-4xl">💫</span>

                  <span className="text-emerald-500 text-xl group-hover:translate-x-1 transition">
                    →
                  </span>
                </div>

                <h3 className="text-xl font-extrabold text-gray-900 group-hover:text-emerald-800 mb-2">
                  サポートカード
                </h3>

                <p className="text-sm text-gray-600 leading-relaxed mb-5">
                  あなたのアバターが、
                  <br />
                  キャラを助けるサポートカードです。
                </p>

                <div className="bg-gray-50 group-hover:bg-white rounded-xl p-4 space-y-2">
                  <div className="text-xs font-bold text-gray-800">
                    ゲームでは…
                  </div>

                  <ul className="text-xs text-gray-600 space-y-1">
                    <li>・デッキに入れて使用する</li>
                    <li>・キャラの力を引き出す</li>
                    <li>・相手に影響を与えることも</li>
                  </ul>
                </div>

                <div className="mt-5 text-sm font-bold text-emerald-700">
                  エモーションを選ぶ →
                </div>
              </button>
            </div>

            <div className="text-center">
              <button
                onClick={() => setCurrentView('menu')}
                className="px-5 py-2.5 text-sm font-bold text-gray-500 hover:text-gray-800 transition cursor-pointer"
              >
                ← ホームに戻る
              </button>
            </div>
          </div>
        )}

        {/* ===== コーデ選択 ===== */}
        {currentView === 'coordinateSelect' && (
          <div className="max-w-5xl w-full space-y-6">
            <div className="text-center space-y-3">
              <div className="text-4xl">👕</div>

              <h2 className="text-3xl font-extrabold text-gray-900">
                あなたのコーデを選ぼう
              </h2>

              <p className="text-sm text-gray-600 leading-relaxed">
                コーデによって、キャラカードの個性や得意な方向が変わります。
                <br />
                あなたのアバターに合いそうなものを選んでみましょう。
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {COORDINATE_PRESETS.map((coordinate) => (
                <button
                  key={coordinate.id}
                  onClick={() => handleSelectCoordinate(coordinate)}
                  className="group bg-white border border-gray-200 hover:border-indigo-400 hover:bg-indigo-50 rounded-2xl p-5 text-left transition shadow-sm hover:shadow-md cursor-pointer"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-xs font-bold text-indigo-600 mb-1">
                        コーデ {coordinate.code.toUpperCase()}
                      </div>

                      <h3 className="font-extrabold text-gray-900 group-hover:text-indigo-800">
                        {coordinate.name}
                      </h3>
                    </div>

                    <span className="text-gray-400 group-hover:text-indigo-500 group-hover:translate-x-1 transition">
                      →
                    </span>
                  </div>

                  <div className="mt-4 rounded-xl bg-gray-50 group-hover:bg-white p-3">
                    <div className="text-xs font-bold text-gray-700 mb-1">
                      特徴
                    </div>

                    <div className="text-sm font-bold text-gray-900">
                      {coordinate.tendency}
                    </div>
                  </div>

                  <div className="mt-3 text-xs text-gray-500">
                    {coordinate.archetype}
                  </div>

                  <div className="mt-3 text-xs text-gray-600 line-clamp-2">
                    {coordinate.skillDescriptions[0]}
                  </div>

                  <div className="mt-4 text-xs font-bold text-indigo-700">
                    このコーデを見る →
                  </div>
                </button>
              ))}
            </div>

            <div className="flex justify-center gap-3">
              <button
                onClick={() => setCurrentView('cardRegisterSelect')}
                className="px-5 py-2.5 text-sm font-bold text-gray-500 hover:text-gray-800 transition cursor-pointer"
              >
                ← カードの種類を選び直す
              </button>

              <button
                onClick={() => setCurrentView('menu')}
                className="px-5 py-2.5 text-sm font-bold text-gray-500 hover:text-gray-800 transition cursor-pointer"
              >
                ホームへ
              </button>
            </div>
          </div>
        )}

        {/* ===== エモーション選択 ===== */}
        {currentView === 'emotionSelect' && (
          <div className="max-w-5xl w-full space-y-6">
            <div className="text-center space-y-3">
              <div className="text-4xl">✨</div>

              <h2 className="text-3xl font-extrabold text-gray-900">
                あなたのエモーションを選ぼう
              </h2>

              <p className="text-sm text-gray-600 leading-relaxed">
                エモーションによって、キャラをどう支えるかが変わります。
                <br />
                あなたのアバターらしい関わり方を選んでみましょう。
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {EMOTION_PRESETS.map((emotion) => (
                <button
                  key={emotion.id}
                  onClick={() => handleSelectEmotion(emotion)}
                  className="group bg-white border border-gray-200 hover:border-emerald-400 hover:bg-emerald-50 rounded-2xl p-5 text-left transition shadow-sm hover:shadow-md cursor-pointer"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-xs font-bold text-emerald-600 mb-1">
                        EMOTION
                      </div>

                      <h3 className="font-extrabold text-gray-900 group-hover:text-emerald-800">
                        {emotion.name}
                      </h3>
                    </div>

                    <span className="text-gray-400 group-hover:text-emerald-500 group-hover:translate-x-1 transition">
                      →
                    </span>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    <span className="text-[11px] font-bold bg-gray-100 text-gray-700 px-2 py-1 rounded-full">
                      {emotion.target}
                    </span>

                    <span className="text-[11px] font-bold bg-gray-100 text-gray-700 px-2 py-1 rounded-full">
                      {emotion.effectCategory}
                    </span>

                    <span className="text-[11px] font-bold bg-gray-100 text-gray-700 px-2 py-1 rounded-full">
                      {emotion.duration}
                    </span>
                  </div>

                  <div className="mt-4 rounded-xl bg-gray-50 group-hover:bg-white p-3">
                    <div className="text-xs font-bold text-gray-700 mb-1">
                      こんなサポート
                    </div>

                    <div className="text-xs text-gray-600 leading-relaxed">
                      {emotion.description}
                    </div>
                  </div>

                  <div className="mt-4 text-xs font-bold text-emerald-700">
                    このエモーションを選ぶ →
                  </div>
                </button>
              ))}
            </div>

            <div className="flex justify-center gap-3">
              <button
                onClick={() => setCurrentView('cardRegisterSelect')}
                className="px-5 py-2.5 text-sm font-bold text-gray-500 hover:text-gray-800 transition cursor-pointer"
              >
                ← カードの種類を選び直す
              </button>

              <button
                onClick={() => setCurrentView('menu')}
                className="px-5 py-2.5 text-sm font-bold text-gray-500 hover:text-gray-800 transition cursor-pointer"
              >
                ホームへ
              </button>
            </div>
          </div>
        )}

        {/* ===== キャラカード登録 ===== */}
        {currentView === 'cardGen' && (
          <CardGenerator
            selectedCoordinate={selectedCoordinate}
            onBackToHub={() => {
              setSelectedCoordinate(null);
              setCurrentView('coordinateSelect');
            }}
          />
        )}

        {/* ===== サポートカード登録 ===== */}
        {currentView === 'supportGen' && (
          <SupportCardGenerator
            selectedEmotion={selectedEmotion}
            onBackToHub={() => {
              setSelectedEmotion(null);
              setCurrentView('emotionSelect');
            }}
          />
        )}

        {/* ===== カード一覧 ===== */}
        {currentView === 'entryHub' && <EntryHub />}

        {/* ===== デッキ構築 ===== */}
        {currentView === 'deckBuilder' && (
          <DeckBuilder
            initialDeckId={editingDeckId}
            onGoToCpuBattle={
              editingDeckId
                ? handleReturnFromDeckBuilder
                : handleStartCpuBattle
            }
            battleButtonLabel={
              editingDeckId ? '⚔️ 対戦へ戻る' : '⚔️ CPU対戦へ'
            }
          />
        )}

        {/* ===== CPU対戦 ===== */}
        {currentView === 'gameBoard' && (
          <GameBoard onEditDeck={handleEditDeck} />
        )}

        {/* ===== 友達対戦：セットアップ画面 ===== */}
        {currentView === 'friendMatchSetup' && (
          <FriendMatchSetup
            onMatchStart={handleMatchStart}
            onBack={handleReturnToMenu}
          />
        )}

        {/* ===== 友達対戦：盤面画面 ===== */}
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