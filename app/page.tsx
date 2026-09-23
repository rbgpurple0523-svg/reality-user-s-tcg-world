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
import { EMOTION_PRESETS } from '@/components/emotionPresets';
import type { EmotionPreset } from '@/components/emotionPresets';
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

type RegistrationReturnView =
  | 'menu'
  | 'entryHub'
  | 'cardRegisterSelect';

export default function Home() {
  const [currentView, setCurrentView] =
    useState<CurrentView>('menu');

  const [editingDeckId, setEditingDeckId] =
    useState<string | null>(null);

  const [deckBuilderReturnView, setDeckBuilderReturnView] =
    useState<CurrentView>('menu');

  const [
    registrationReturnView,
    setRegistrationReturnView,
  ] = useState<RegistrationReturnView>('menu');

  const [selectedCoordinate, setSelectedCoordinate] =
    useState<CoordinatePreset | null>(null);

  const [selectedEmotion, setSelectedEmotion] =
    useState<EmotionPreset | null>(null);

  const [activeRoomId, setActiveRoomId] =
    useState<string | null>(null);

  const [isHostPlayer, setIsHostPlayer] =
    useState<boolean>(false);

  // =========================================================
  // CPU対戦
  // =========================================================
  const handleStartCpuBattle = () => {
    setEditingDeckId(null);
    setDeckBuilderReturnView('menu');
    setCurrentView('gameBoard');
  };

  // =========================================================
  // デッキ編集
  // =========================================================
  const handleEditDeck = (deckId: string) => {
    setEditingDeckId(deckId);

    setDeckBuilderReturnView(
      currentView === 'friendGameBoard'
        ? 'friendGameBoard'
        : currentView === 'entryHub'
          ? 'entryHub'
          : 'gameBoard',
    );

    setCurrentView('deckBuilder');
  };

  const handleStartDeckBuilderFromMenu = () => {
    setEditingDeckId(null);
    setDeckBuilderReturnView('menu');
    setCurrentView('deckBuilder');
  };

  const handleStartDeckBuilderFromEntryHub = () => {
    setEditingDeckId(null);
    setDeckBuilderReturnView('entryHub');
    setCurrentView('deckBuilder');
  };

  const handleReturnFromDeckBuilder = () => {
    setCurrentView(
      deckBuilderReturnView,
    );
    setEditingDeckId(null);
  };

  // =========================================================
  // カード登録フロー
  // =========================================================
  const handleOpenCardRegister = () => {
    setSelectedCoordinate(null);
    setSelectedEmotion(null);
    setRegistrationReturnView('menu');
    setCurrentView('cardRegisterSelect');
  };

  const handleStartCharacterRegistration = (
    preset?: CoordinatePreset,
  ) => {
    setSelectedCoordinate(
      preset ?? null,
    );

    setRegistrationReturnView(
      'entryHub',
    );

    setCurrentView(
      'coordinateSelect',
    );
  };

  const handleStartCharacterRegistrationFromMenu =
    () => {
      setSelectedCoordinate(null);
      setRegistrationReturnView(
        'cardRegisterSelect',
      );
      setCurrentView(
        'coordinateSelect',
      );
    };

  const handleStartSupportRegistration = (
    preset?: EmotionPreset,
  ) => {
    setSelectedEmotion(
      preset ?? null,
    );

    setRegistrationReturnView(
      'entryHub',
    );

    setCurrentView(
      'emotionSelect',
    );
  };

  const handleStartSupportRegistrationFromMenu =
    () => {
      setSelectedEmotion(null);
      setRegistrationReturnView(
        'cardRegisterSelect',
      );
      setCurrentView(
        'emotionSelect',
      );
    };

  const handleSelectCoordinate = (
    coordinate: CoordinatePreset,
  ) => {
    setSelectedCoordinate(
      coordinate,
    );

    setCurrentView(
      'cardGen',
    );
  };

  const handleSelectEmotion = (
    emotion: EmotionPreset,
  ) => {
    setSelectedEmotion(
      emotion,
    );

    setCurrentView(
      'supportGen',
    );
  };

  const handleReturnToRegistrationEntry =
    () => {
      setCurrentView(
        registrationReturnView,
      );
    };

  // =========================================================
  // 友達対戦
  // =========================================================
  const handleMatchStart = (
    roomId: string,
    isHost: boolean,
  ) => {
    setActiveRoomId(roomId);
    setIsHostPlayer(isHost);
    setCurrentView(
      'friendGameBoard',
    );
  };

  // =========================================================
  // メインメニューへ
  // =========================================================
  const handleReturnToMenu = () => {
    setActiveRoomId(null);
    setIsHostPlayer(false);
    setEditingDeckId(null);
    setDeckBuilderReturnView(
      'menu',
    );
    setRegistrationReturnView(
      'menu',
    );
    setSelectedCoordinate(null);
    setSelectedEmotion(null);
    setCurrentView('menu');
  };

  return (
    <main className="min-h-screen bg-white text-gray-900 flex flex-col">
      {/* 共通ヘッダー */}
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex justify-between items-center shadow-sm">
        <div
          className="flex items-center space-x-3 cursor-pointer"
          onClick={handleReturnToMenu}
        >
          <span className="text-2xl">
            ✨
          </span>

          <h1 className="text-xl font-extrabold tracking-wider text-indigo-600">
            REALITY USER'S TCG WORLD
          </h1>
        </div>

        {currentView !== 'menu' && (
          <button
            type="button"
            onClick={
              handleReturnToMenu
            }
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
              <h2 className="text-3xl font-extrabold text-gray-900">REALITY USER'S TCG WORLD</h2>
              <p className="text-sm text-gray-600">
                あなたのREALITYアバターをカードにして、ゲームの世界に参加しよう！
              </p>
            </div>

            <div className="grid grid-cols-1 gap-4 text-left">
{/* ホーム：カード登録 */}
<div className="bg-white border border-gray-200 rounded-2xl p-5 space-y-3 shadow-sm">
  <div className="flex items-center space-x-2 text-indigo-600 font-bold text-sm">
    <span>👤</span>
    <span>カードに自分のアバターを登録する</span>
  </div>

  <button
    type="button"
    onClick={handleOpenCardRegister}
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

{/* ホーム：カード一覧 */}
<div className="bg-white border border-gray-200 rounded-2xl p-5 space-y-3 shadow-sm">
  <div className="flex items-center space-x-2 text-indigo-600 font-bold text-sm">
    <span>📚</span>
    <span>カード一覧</span>
  </div>

  <button
    type="button"
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

              {/* デッキ */}
              <div className="bg-white border border-gray-200 rounded-2xl p-5 space-y-3 shadow-sm">
                <div className="flex items-center space-x-2 text-indigo-600 font-bold text-sm">
                  <span>🃏</span>
                  <span>
                    デッキを構築する
                  </span>
                </div>

                <button
                  type="button"
                  onClick={
                    handleStartDeckBuilderFromMenu
                  }
                  className="w-full p-4 bg-gray-50 hover:bg-indigo-50 border border-gray-200 hover:border-indigo-200 rounded-xl transition text-left space-y-1 cursor-pointer"
                >
                  <div className="font-bold text-gray-900 text-sm">
                    デッキビルダー
                  </div>

                  <div className="text-xs text-gray-500">
                    作成したカードを組み合わせて戦闘用デッキを編成する
                  </div>
                </button>
              </div>

              {/* ゲーム */}
              <div className="bg-white border border-gray-200 rounded-2xl p-5 space-y-3 shadow-sm">
                <div className="flex items-center space-x-2 text-emerald-600 font-bold text-sm">
                  <span>⚔️</span>
                  <span>
                    ゲームで遊ぶ
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <button
                    type="button"
                    onClick={
                      handleStartCpuBattle
                    }
                    className="p-4 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-xl transition text-left space-y-1 cursor-pointer"
                  >
                    <div className="font-bold text-emerald-900 text-sm">
                      CPUと対戦する
                    </div>

                    <div className="text-xs text-emerald-700">
                      CPUを相手にシングルプレイバトル
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      setCurrentView(
                        'friendMatchSetup',
                      )
                    }
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
                    type="button"
                    onClick={() =>
                      alert(
                        '「世界のだれかと対戦する」機能は今後実装予定です！',
                      )
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

        {/* ================================================= */}
        {/* カード種類選択 */}
        {/* ================================================= */}
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
                onClick={() => setCurrentView('cardGen')}
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
                    <li>・スコアバトルのステージに立ちます</li>
                    <li>・個性に合わせたステータスと</li>
                    <li>・4種の技を使って得点を競います</li>
                  </ul>
                </div>

                <div className="mt-5 text-sm font-bold text-indigo-700">
                  キャラカードを作る →
                </div>
              </button>

              {/* サポートカード */}
              <button
                onClick={() => setCurrentView('supportGen')}
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
                    <li>・デッキに入れて使用されます</li>
                    <li>・キャラの力を引き出したり</li>
                    <li>・相手に影響を与えることも</li>
                  </ul>
                </div>

                <div className="mt-5 text-sm font-bold text-emerald-700">
                  サポートカードを作る →
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


        {/* ================================================= */}
        {/* コーデ選択 */}
        {/* ================================================= */}
        {currentView ===
          'coordinateSelect' && (
          <div className="w-full max-w-6xl space-y-6">
            <div className="bg-white rounded-3xl border border-gray-200 shadow-sm p-6">
              <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                <div>
                  <div className="text-xs font-black tracking-[0.2em] text-indigo-500">
                    CHARACTER CARD
                  </div>

                  <h2 className="mt-1 text-3xl font-black">
                    コーデを選ぶ
                  </h2>

                  <p className="mt-2 text-sm text-gray-600">
                    ここで選ぶコーデが、
                    キャラカードの公式性能になります。
                  </p>
                </div>

                <button
                  type="button"
                  onClick={
                    handleReturnToRegistrationEntry
                  }
                  className="px-4 py-3 rounded-xl bg-gray-100 hover:bg-gray-200 text-xs font-black border border-gray-200"
                >
                  ← 戻る
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
              {COORDINATE_PRESETS.map(
                (
                  coordinate,
                ) => (
                  <article
                    key={
                      coordinate.id
                    }
                    className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm"
                  >
                    <div className="flex justify-between items-start gap-3">
                      <div>
                        <span className="inline-flex rounded-lg bg-indigo-100 px-2.5 py-1 text-xs font-black text-indigo-800">
                          {coordinate.code.toUpperCase()}
                        </span>

                        <h3 className="mt-2 text-lg font-black">
                          {
                            coordinate.name
                          }
                        </h3>
                      </div>

                      <span className="text-[10px] text-gray-400 font-black">
                        性能固定
                      </span>
                    </div>

                    <div className="mt-3 text-xs text-indigo-700 font-bold">
                      傾向：
                      {
                        coordinate.tendency
                      }
                    </div>

                    <div className="mt-4 grid grid-cols-2 gap-2 rounded-xl bg-gray-50 border border-gray-200 p-3 text-[11px]">
                      <div>
                        体力：
                        <b>
                          {
                            coordinate
                              .stats.hp
                          }
                        </b>
                      </div>

                      <div>
                        知略：
                        <b>
                          {
                            coordinate
                              .stats
                              .intellect
                          }
                        </b>
                      </div>

                      <div>
                        特技：
                        <b>
                          {
                            coordinate
                              .stats
                              .charm
                          }
                        </b>
                      </div>

                      <div>
                        器用：
                        <b>
                          {
                            coordinate
                              .stats
                              .dexterity
                          }
                        </b>
                      </div>
                    </div>

                    <div className="mt-4 text-[10px] rounded-xl bg-indigo-50/60 border border-indigo-100 p-3 space-y-1.5">
                      <div className="font-black text-indigo-800">
                        固定4技
                      </div>

                      {coordinate.defaultSkills.map(
                        (
                          skill,
                          index,
                        ) => (
                          <div
                            key={`${coordinate.id}-skill-${index}`}
                          >
                            <span className="font-bold">
                              技
                              {index +
                                1}{' '}
                              {skill}
                            </span>

                            <span className="text-gray-600">
                              ：
                              {
                                coordinate
                                  .skillDescriptions[
                                  index
                                ]
                              }
                            </span>
                          </div>
                        ),
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() =>
                        handleSelectCoordinate(
                          coordinate,
                        )
                      }
                      className="mt-4 w-full rounded-xl bg-indigo-600 hover:bg-indigo-700 px-4 py-3 text-xs font-black text-white transition"
                    >
                      このコーデを選ぶ
                    </button>
                  </article>
                ),
              )}
            </div>
          </div>
        )}

        {/* ================================================= */}
        {/* エモーション選択 */}
        {/* ================================================= */}
        {currentView ===
          'emotionSelect' && (
          <div className="w-full max-w-5xl space-y-6">
            <div className="bg-white rounded-3xl border border-gray-200 shadow-sm p-6">
              <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                <div>
                  <div className="text-xs font-black tracking-[0.2em] text-purple-500">
                    SUPPORT CARD
                  </div>

                  <h2 className="mt-1 text-3xl font-black">
                    エモーションを選ぶ
                  </h2>

                  <p className="mt-2 text-sm text-gray-600">
                    対象・効果ステータス・持続性から、
                    あなたのカードに合うエモーションを選択します。
                  </p>
                </div>

                <button
                  type="button"
                  onClick={
                    handleReturnToRegistrationEntry
                  }
                  className="px-4 py-3 rounded-xl bg-gray-100 hover:bg-gray-200 text-xs font-black border border-gray-200"
                >
                  ← 戻る
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {EMOTION_PRESETS.map(
                (
                  emotion,
                ) => (
                  <article
                    key={
                      emotion.id
                    }
                    className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm"
                  >
                    <div className="flex flex-wrap gap-1.5">
                      <span className="inline-flex rounded-lg bg-purple-100 px-2.5 py-1 text-xs font-black text-purple-800">
                        {
                          emotion.target
                        }
                      </span>

                      <span className="inline-flex rounded-lg bg-purple-100 px-2.5 py-1 text-xs font-black text-purple-800">
                        {
                          emotion.effectCategory
                        }
                      </span>

                      <span className="inline-flex rounded-lg bg-purple-100 px-2.5 py-1 text-xs font-black text-purple-800">
                        {
                          emotion.duration
                        }
                      </span>
                    </div>

                    <h3 className="mt-3 text-lg font-black">
                      {
                        emotion.name
                      }
                    </h3>

                    <p className="mt-2 text-sm text-gray-600 leading-relaxed">
                      {
                        emotion.description
                      }
                    </p>

                    <div className="mt-4 grid grid-cols-3 gap-2 text-[10px]">
                      <div className="rounded-xl bg-purple-50 border border-purple-100 p-2 text-center font-black text-purple-800">
                        対象
                        <br />
                        {
                          emotion.target
                        }
                      </div>

                      <div className="rounded-xl bg-purple-50 border border-purple-100 p-2 text-center font-black text-purple-800">
                        効果
                        <br />
                        {
                          emotion.effectCategory
                        }
                      </div>

                      <div className="rounded-xl bg-purple-50 border border-purple-100 p-2 text-center font-black text-purple-800">
                        持続
                        <br />
                        {
                          emotion.duration
                        }
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() =>
                        handleSelectEmotion(
                          emotion,
                        )
                      }
                      className="mt-4 w-full rounded-xl bg-purple-600 hover:bg-purple-700 px-4 py-3 text-xs font-black text-white transition"
                    >
                      このエモーションを選ぶ
                    </button>
                  </article>
                ),
              )}
            </div>
          </div>
        )}

        {/* ================================================= */}
        {/* キャラカード生成 */}
        {/* ================================================= */}
        {currentView ===
          'cardGen' && (
          <CardGenerator
            selectedCoordinate={
              selectedCoordinate
            }
            onBackToHub={() =>
              setCurrentView(
                'cardRegisterSelect',
              )
            }
          />
        )}

        {/* ================================================= */}
        {/* サポートカード生成 */}
        {/* ================================================= */}
        {currentView ===
          'supportGen' && (
          <SupportCardGenerator
            selectedEmotion={
              selectedEmotion
            }
            onBackToHub={() =>
              setCurrentView(
                'cardRegisterSelect',
              )
            }
          />
        )}

        {/* ================================================= */}
        {/* カード一覧 */}
        {/* ================================================= */}
        {currentView ===
          'entryHub' && (
          <EntryHub
            onBackToMenu={
              handleReturnToMenu
            }
            onGoToDeckBuilder={
              handleStartDeckBuilderFromEntryHub
            }
            onStartCharacterRegistration={
              handleStartCharacterRegistration
            }
            onStartSupportRegistration={
              handleStartSupportRegistration
            }
          />
        )}

        {/* ================================================= */}
        {/* デッキ構築 */}
        {/* ================================================= */}
        {currentView ===
          'deckBuilder' && (
          <DeckBuilder
            initialDeckId={
              editingDeckId
            }
            onGoToCpuBattle={
              editingDeckId
                ? handleReturnFromDeckBuilder
                : handleStartCpuBattle
            }
            battleButtonLabel={
              editingDeckId
                ? '⚔️ 対戦へ戻る'
                : '⚔️ CPU対戦へ'
            }
          />
        )}

        {/* ================================================= */}
        {/* CPU対戦 */}
        {/* ================================================= */}
        {currentView ===
          'gameBoard' && (
          <GameBoard
            onEditDeck={
              handleEditDeck
            }
          />
        )}

        {/* ================================================= */}
        {/* 友達対戦：セットアップ */}
        {/* ================================================= */}
        {currentView ===
          'friendMatchSetup' && (
          <FriendMatchSetup
            onMatchStart={
              handleMatchStart
            }
            onBack={
              handleReturnToMenu
            }
          />
        )}

        {/* ================================================= */}
        {/* 友達対戦：盤面 */}
        {/* ================================================= */}
        {currentView ===
          'friendGameBoard' &&
          activeRoomId && (
            <GameBoard
              roomId={
                activeRoomId
              }
              isHost={
                isHostPlayer
              }
              onEditDeck={
                handleEditDeck
              }
            />
          )}
      </div>

      <footer className="bg-white border-t border-gray-200 py-3 text-center text-xs text-gray-500">
        REALITY USER'S TCG Project &copy; 2026
      </footer>
    </main>
  );
}