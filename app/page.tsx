'use client';

import React, { useEffect, useState } from 'react';
import CardGenerator from '@/components/CardGenerator';
import SupportCardGenerator from '@/components/SupportCardGenerator';
import DeckBuilder from '@/components/DeckBuilder';
import GameBoard from '@/components/GameBoard';
import EntryHub, {
  type CoordinatePreset,
  type EntryRecord,
} from '@/components/EntryHub';
import CoordinateRadialMap from '@/components/CoordinateRadialMap';
import { COORDINATE_PRESETS } from '@/components/coordinatePresets';
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

const INTRO_SEEN_KEY = 'reality_tcg_intro_seen';
const ENTRIES_KEY = 'reality_world_entries';

function getMaxEntryLimit(entries: EntryRecord[]): number {
  const allPresets = [...COORDINATE_PRESETS, ...EMOTION_PRESETS];
  const countEntries = (presetId: string) =>
    entries.filter((entry) => entry.presetId === presetId).length;
  const filledPresetCount = allPresets.filter((preset) => countEntries(preset.id) >= 1).length;
  const countAtLeastTwo = allPresets.filter((preset) => countEntries(preset.id) >= 2).length;
  const totalPossibleSlots = Math.max(1, allPresets.length);
  const oneRate = filledPresetCount / totalPossibleSlots;
  const twoRate = countAtLeastTwo / totalPossibleSlots;

  return oneRate >= 0.9 && twoRate >= 0.5
    ? 3
    : oneRate >= 0.5
      ? 2
      : 1;
}

function loadStoredEntries(): EntryRecord[] {
  if (typeof window === 'undefined') return [];

  try {
    const saved = localStorage.getItem(ENTRIES_KEY);
    return saved ? (JSON.parse(saved) as EntryRecord[]) : [];
  } catch {
    return [];
  }
}

function IntroVisual({ kind }: { kind: 'battle' | 'team' | 'card' }) {
  const visual = {
    battle: {
      icon: '⚔️',
      label: '3 VS 3',
      sub: 'ライブ対戦',
    },
    team: {
      icon: '🃏',
      label: '3 + 18',
      sub: 'チーム編成',
    },
    card: {
      icon: '✨',
      label: 'MY CARD',
      sub: 'オリジナルカード',
    },
  }[kind];

  return (
    <div className="relative overflow-hidden rounded-[2rem] border border-indigo-100 bg-gradient-to-br from-indigo-50 via-white to-purple-50 p-6 shadow-inner">
      <div className="absolute -right-8 -top-8 h-28 w-28 rounded-full bg-indigo-100/60" />
      <div className="absolute -bottom-10 -left-8 h-32 w-32 rounded-full bg-purple-100/50" />
      <div className="relative flex min-h-[170px] flex-col items-center justify-center text-center">
        <div className="text-6xl drop-shadow-sm">{visual.icon}</div>
        <div className="mt-3 text-2xl font-black tracking-wider text-indigo-950">{visual.label}</div>
        <div className="mt-1 text-sm font-bold text-indigo-600">{visual.sub}</div>
      </div>
    </div>
  );
}

export default function Home() {
  const [currentView, setCurrentView] = useState<CurrentView>('menu');
  const [editingDeckId, setEditingDeckId] = useState<string | null>(null);
  const [deckBuilderReturnView, setDeckBuilderReturnView] = useState<CurrentView>('menu');
  const [registrationReturnView, setRegistrationReturnView] =
    useState<RegistrationReturnView>('menu');
  const [selectedCoordinate, setSelectedCoordinate] = useState<CoordinatePreset | null>(null);
  const [selectedEmotion, setSelectedEmotion] = useState<EmotionPreset | null>(null);
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null);
  const [isHostPlayer, setIsHostPlayer] = useState<boolean>(false);
  const [pickerEntries, setPickerEntries] = useState<EntryRecord[]>([]);
  const [pickerMaxEntryLimit, setPickerMaxEntryLimit] = useState(1);
  const [showIntro, setShowIntro] = useState(true);

  useEffect(() => {
    try {
      setShowIntro(localStorage.getItem(INTRO_SEEN_KEY) !== '1');
    } catch {
      setShowIntro(false);
    }
  }, []);

  useEffect(() => {
    if (currentView === 'coordinateSelect' || currentView === 'cardRegisterSelect') {
      const storedEntries = loadStoredEntries();
      setPickerEntries(storedEntries);
      setPickerMaxEntryLimit(getMaxEntryLimit(storedEntries));
    }
  }, [currentView]);

  const handleStartGame = () => {
    try {
      localStorage.setItem(INTRO_SEEN_KEY, '1');
    } catch {
      // Ignore storage failures and continue into the app.
    }
    setShowIntro(false);
    setCurrentView('menu');
  };

  const handleStartCpuBattle = () => {
    setEditingDeckId(null);
    setDeckBuilderReturnView('menu');
    setCurrentView('gameBoard');
  };

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

  const handleStartCharacterRegistration = (preset?: CoordinatePreset) => {
    setSelectedCoordinate(preset ?? null);
    setRegistrationReturnView('entryHub');
    setCurrentView('coordinateSelect');
  };

  const handleStartSupportRegistration = (preset?: EmotionPreset) => {
    setSelectedEmotion(preset ?? null);
    setRegistrationReturnView('entryHub');
    setCurrentView('emotionSelect');
  };

  const handleSelectCoordinate = (coordinate: CoordinatePreset) => {
    setSelectedCoordinate(coordinate);
    setCurrentView('cardGen');
  };

  const handleSelectEmotion = (emotion: EmotionPreset) => {
    setSelectedEmotion(emotion);
    setCurrentView('supportGen');
  };

  const handleReturnToRegistrationEntry = () => {
    setCurrentView(registrationReturnView);
  };

  const handleMatchStart = (roomId: string, isHost: boolean) => {
    setActiveRoomId(roomId);
    setIsHostPlayer(isHost);
    setCurrentView('friendGameBoard');
  };

  const handleReturnToMenu = () => {
    setActiveRoomId(null);
    setIsHostPlayer(false);
    setEditingDeckId(null);
    setDeckBuilderReturnView('menu');
    setRegistrationReturnView('menu');
    setSelectedCoordinate(null);
    setSelectedEmotion(null);
    setCurrentView('menu');
  };

  const isFixedView =
    !showIntro &&
    (currentView === 'menu' ||
      currentView === 'cardRegisterSelect' ||
      currentView === 'coordinateSelect' ||
      currentView === 'cardGen');

  if (showIntro) {
    return (
      <main className="min-h-[100dvh] overflow-y-auto bg-white text-gray-900">
        <div className="mx-auto w-full max-w-2xl px-5 py-8 sm:px-8 sm:py-12">
          <div className="text-center">
            <div className="text-[11px] font-black tracking-[0.32em] text-indigo-500">REALITY USER'S</div>
            <h1 className="mt-1 text-4xl font-black tracking-tight text-indigo-950">TCG WORLD</h1>
            <p className="mx-auto mt-5 max-w-lg text-base font-bold leading-7 text-gray-700">
              熱い駆け引きが広がる、<br />
              3対3のライブバトルTCG！<br />
              アバターをカードにして、<br />
              この世界へ飛び込もう！
            </p>
          </div>

          <div className="mt-10 space-y-10">
            <section>
              <div className="mb-3 text-sm font-black tracking-widest text-indigo-500">STEP 1</div>
              <IntroVisual kind="battle" />
              <h2 className="mt-4 text-xl font-black">3人のキャラで挑むライブ対戦！</h2>
              <p className="mt-2 text-sm leading-6 text-gray-600">
                スキルやサポートカードを使って、相手とスコアを競おう。
              </p>
            </section>

            <section>
              <div className="mb-3 text-sm font-black tracking-widest text-indigo-500">STEP 2</div>
              <IntroVisual kind="team" />
              <h2 className="mt-4 text-xl font-black">まずはチームを編成！</h2>
              <p className="mt-2 text-sm leading-6 text-gray-600">
                3人のキャラ＋18枚のサポートカードで、自分だけのチームを作ろう。カード登録なしでもすぐに遊べます。
              </p>
            </section>

            <section>
              <div className="mb-3 text-sm font-black tracking-widest text-indigo-500">STEP 3</div>
              <IntroVisual kind="card" />
              <h2 className="mt-4 text-xl font-black">自分のオリジナルカードも作れる！</h2>
              <p className="mt-2 text-sm leading-6 text-gray-600">
                REALITYアバターや「大切な想い」をカードにして、この世界へエントリーしよう。
              </p>
            </section>
          </div>

          <div className="pb-4 pt-12 text-center">
            <div className="text-2xl font-black text-indigo-950">あなたも参加してみよう！</div>
            <button
              type="button"
              onClick={handleStartGame}
              className="mt-5 w-full rounded-2xl bg-indigo-600 px-5 py-4 text-base font-black text-white shadow-lg shadow-indigo-100 transition hover:bg-indigo-700"
            >
              ゲームをはじめる
            </button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className={`${isFixedView ? 'h-[100dvh] overflow-hidden' : 'min-h-screen'} bg-white text-gray-900 flex flex-col`}>
      <header className="shrink-0 border-b border-gray-200 bg-white px-4 py-3 shadow-sm sm:px-6">
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={handleReturnToMenu}
            className="min-w-0 text-left"
            aria-label="ホームへ戻る"
          >
            <div className="text-[9px] font-black tracking-[0.26em] text-indigo-500">REALITY USER'S</div>
            <div className="truncate text-base font-black tracking-wider text-indigo-950">TCG WORLD</div>
          </button>

          {currentView !== 'menu' && (
            <button
              type="button"
              onClick={handleReturnToMenu}
              className="shrink-0 rounded-xl bg-gray-100 px-3 py-2 text-[10px] font-black text-gray-700"
            >
              ← ホーム
            </button>
          )}
        </div>
      </header>

      <div className={`${isFixedView ? 'min-h-0' : 'flex-1'} flex flex-col`}>
        {currentView === 'menu' && (
          <div className="mx-auto flex min-h-0 w-full max-w-xl flex-1 flex-col px-4 py-5 sm:px-6 sm:py-7">
            <div className="text-center">
              <div className="text-[10px] font-black tracking-[0.25em] text-indigo-500">WELCOME</div>
              <h2 className="mt-1 text-2xl font-black text-indigo-950">REALITY USER'S TCG WORLD</h2>
            </div>

            <div className="mt-6 grid flex-1 grid-cols-1 content-center gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => setCurrentView('cardRegisterSelect')}
                className="rounded-2xl border border-indigo-200 bg-indigo-50 px-5 py-5 text-left shadow-sm transition hover:bg-indigo-100 sm:col-span-2"
              >
                <div className="text-base font-black text-indigo-950">✨ オリジナルカードを作る</div>
              </button>

              <button
                type="button"
                onClick={handleStartDeckBuilderFromMenu}
                className="rounded-2xl border border-gray-200 bg-gray-50 px-5 py-5 text-left shadow-sm transition hover:bg-gray-100"
              >
                <div className="text-base font-black text-gray-900">🃏 チームを構築する</div>
              </button>

              <button
                type="button"
                onClick={handleStartCpuBattle}
                className="rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-5 text-left shadow-sm transition hover:bg-emerald-100"
              >
                <div className="text-base font-black text-emerald-950">⚔️ CPUと対戦する</div>
              </button>

              <button
                type="button"
                onClick={() => setCurrentView('friendMatchSetup')}
                className="rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-5 text-left shadow-sm transition hover:bg-emerald-100"
              >
                <div className="text-base font-black text-emerald-950">👥 友達と対戦する</div>
              </button>

              <button
                type="button"
                onClick={() => alert('「世界のだれかと対戦する」機能は今後実装予定です！')}
                className="rounded-2xl border border-gray-200 bg-gray-50 px-5 py-5 text-left opacity-70 transition hover:bg-gray-100"
              >
                <div className="text-base font-black text-gray-700">🌍 世界のだれかと対戦する</div>
              </button>
            </div>
          </div>
        )}

        {currentView === 'cardRegisterSelect' && (
          <div className="mx-auto flex min-h-0 w-full max-w-xl flex-1 flex-col px-4 py-5 sm:px-6 sm:py-7">
            <div className="text-center">
              <div className="text-3xl">✨</div>
              <h2 className="mt-2 text-2xl font-black text-gray-950">どんなカードで参加する？</h2>
              <p className="mx-auto mt-3 max-w-md text-xs font-bold leading-5 text-gray-600">
                REALITYアバターは、ゲームの主役にも、仲間を支えるサポートにもなれます。<br />
                それぞれの役割を活かして、あなたらしいカードを作ろう！
              </p>
            </div>

            <div className="mt-6 grid flex-1 content-center gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => setCurrentView('coordinateSelect')}
                className="rounded-2xl border-2 border-gray-200 bg-white p-5 text-left shadow-sm transition hover:border-indigo-300 hover:bg-indigo-50"
              >
                <div className="flex items-center justify-between">
                  <span className="text-3xl">🧑‍🎤</span>
                  <span className="text-indigo-500">→</span>
                </div>
                <h3 className="mt-4 text-lg font-black">キャラカード</h3>
                <p className="mt-2 text-xs leading-5 text-gray-600">
                  あなたのアバター自身が、ゲームの主役になるカードです。
                </p>
                <div className="mt-3 rounded-xl bg-gray-50 p-3 text-[10px] leading-5 text-gray-600">
                  <div className="font-black text-gray-800">ゲームでは…</div>
                  <div>・スコアバトルのステージに立ちます</div>
                  <div>・個性に合わせたステータスとスキルを使います</div>
                </div>
                <div className="mt-3 text-xs font-black text-indigo-700">キャラカードを作る →</div>
              </button>

              <button
                type="button"
                onClick={() => setCurrentView('emotionSelect')}
                className="rounded-2xl border-2 border-gray-200 bg-white p-5 text-left shadow-sm transition hover:border-purple-300 hover:bg-purple-50"
              >
                <div className="flex items-center justify-between">
                  <span className="text-3xl">💫</span>
                  <span className="text-purple-500">→</span>
                </div>
                <h3 className="mt-4 text-lg font-black">サポートカード</h3>
                <p className="mt-2 text-xs leading-5 text-gray-600">
                  「想い」をカードにして、キャラを助けたり対戦に変化をもたらすカードです。
                </p>
                <div className="mt-3 rounded-xl bg-gray-50 p-3 text-[10px] leading-5 text-gray-600">
                  <div className="font-black text-gray-800">ゲームでは…</div>
                  <div>・チームに入れて対戦中に使用します</div>
                  <div>・キャラの力を引き出したり、相手に影響を与えます</div>
                </div>
                <div className="mt-3 text-xs font-black text-purple-700">サポートカードを作る →</div>
              </button>
            </div>

            <button
              type="button"
              onClick={handleReturnToMenu}
              className="mt-4 shrink-0 py-2 text-xs font-black text-gray-500 hover:text-gray-800"
            >
              ← ホームに戻る
            </button>
          </div>
        )}

        {currentView === 'coordinateSelect' && (
          <div className="mx-auto flex min-h-0 w-full max-w-xl flex-1 flex-col px-3 py-3 sm:px-5">
            <div className="shrink-0 text-center">
              <div className="text-[9px] font-black tracking-[0.22em] text-indigo-500">CHARACTER CARD</div>
              <h2 className="mt-1 text-xl font-black text-gray-950">コーデを選ぶ</h2>
              <p className="mx-auto mt-1 max-w-md text-[10px] font-bold leading-5 text-gray-600">コーデは、キャラカードの4つのステータスの得意・不得意を決める「性能タイプ」です。</p>
            </div>

            <div className="mt-2 min-h-0 flex-1 overflow-hidden rounded-3xl border border-gray-200 bg-gray-50 shadow-sm">
              <CoordinateRadialMap
                coordinates={COORDINATE_PRESETS}
                entries={pickerEntries}
                maxEntryLimit={pickerMaxEntryLimit}
                initialSelectedId={selectedCoordinate?.id ?? null}
                mode="picker"
                onSelect={handleSelectCoordinate}
              />
            </div>

            <button
              type="button"
              onClick={handleReturnToRegistrationEntry}
              className="mt-3 shrink-0 py-2 text-xs font-black text-gray-500 hover:text-gray-800"
            >
              ← 戻る
            </button>
          </div>
        )}

        {currentView === 'emotionSelect' && (
          <div className="flex-1">
            <div className="mx-auto w-full max-w-5xl px-5 py-6">
              <div className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-[9px] font-black tracking-[0.22em] text-purple-500">SUPPORT CARD</div>
                    <h2 className="mt-1 text-2xl font-black">エモーションを選ぶ</h2>
                    <p className="mt-2 text-xs text-gray-600">対象・効果・持続性など、ゲーム上の性能からエモーションを選べます。</p>
                  </div>
                  <button type="button" onClick={handleReturnToRegistrationEntry} className="rounded-xl bg-gray-100 px-3 py-2 text-[10px] font-black">← 戻る</button>
                </div>
              </div>
              <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
                {EMOTION_PRESETS.map((emotion) => (
                  <button
                    key={emotion.id}
                    type="button"
                    onClick={() => handleSelectEmotion(emotion)}
                    className="rounded-2xl border border-gray-200 bg-white p-4 text-left shadow-sm transition hover:border-purple-300 hover:bg-purple-50"
                  >
                    <div className="flex flex-wrap gap-1">
                      <span className="rounded-md bg-purple-100 px-2 py-1 text-[9px] font-black text-purple-800">{emotion.target}</span>
                      <span className="rounded-md bg-purple-100 px-2 py-1 text-[9px] font-black text-purple-800">{emotion.effectCategory}</span>
                      <span className="rounded-md bg-purple-100 px-2 py-1 text-[9px] font-black text-purple-800">{emotion.duration}</span>
                    </div>
                    <div className="mt-2 text-sm font-black">{emotion.name}</div>
                    <div className="mt-1 text-[10px] leading-5 text-gray-600">{emotion.description}</div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {currentView === 'cardGen' && (
          <CardGenerator
            selectedCoordinate={selectedCoordinate}
            onBackToHub={() => setCurrentView('cardRegisterSelect')}
            onChangeCoordinate={() => {
              setSelectedCoordinate(null);
              setCurrentView('coordinateSelect');
            }}
          />
        )}

        {currentView === 'supportGen' && (
          <SupportCardGenerator
            selectedEmotion={selectedEmotion}
            onBackToHub={() => setCurrentView('cardRegisterSelect')}
          />
        )}

        {currentView === 'entryHub' && (
          <EntryHub
            onBackToMenu={handleReturnToMenu}
            onGoToDeckBuilder={handleStartDeckBuilderFromMenu}
            onStartCharacterRegistration={handleStartCharacterRegistration}
            onStartSupportRegistration={handleStartSupportRegistration}
          />
        )}

        {currentView === 'deckBuilder' && (
          <DeckBuilder
            initialDeckId={editingDeckId}
            onGoToCpuBattle={editingDeckId ? handleReturnToMenu : handleStartCpuBattle}
            battleButtonLabel={editingDeckId ? '⚔️ 対戦へ戻る' : '⚔️ CPU対戦へ'}
          />
        )}

        {currentView === 'gameBoard' && <GameBoard onEditDeck={handleEditDeck} />}

        {currentView === 'friendMatchSetup' && (
          <FriendMatchSetup onMatchStart={handleMatchStart} onBack={handleReturnToMenu} />
        )}

        {currentView === 'friendGameBoard' && activeRoomId && (
          <GameBoard
            roomId={activeRoomId}
            isHost={isHostPlayer}
            onEditDeck={handleEditDeck}
          />
        )}
      </div>
    </main>
  );
}
