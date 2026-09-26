'use client';

import React, { useMemo, useState } from 'react';
import CardGenerator from './CardGenerator';
import SupportCardGenerator from './SupportCardGenerator';
import { EMOTION_PRESETS } from './emotionPresets';
import type { EmotionAxisKey, EmotionPreset } from './emotionPresets';
import { COORDINATE_PRESETS } from './coordinatePresets';
import type { Archetype, CardColor, CoordinatePreset, Season, StatKey } from './coordinatePresets';
import type { ColorType } from './colorTypes';
import CoordinateRadialMap from './CoordinateRadialMap';

export type { Archetype, CardColor, CoordinatePreset, Season, StatKey } from './coordinatePresets';
export { COORDINATE_PRESETS };

export interface EntryRecord {
  id: string;
  presetId: string;
  cardType: 'coordinate' | 'emotion';
  profileUrl: string;
  userName: string;
  imageDataUrl: string;
  passwordHash: string;
  firstUser: string;
  ownerToken?: string;
  customEffectName?: string;
  customSkills?: [string, string, string, string];
  skillDescriptions?: [string, string, string, string];
  skillVoices?: [string, string, string, string];
  flavorText?: string;
  color?: CardColor;
  colorHex?: string;
  colorType?: ColorType;
  showProfileUrl?: boolean;
  season?: Season;
  archetype?: Archetype;
  hp?: number;
  ap?: number;
  createdAt: string;
  updatedAt?: string;
}

interface EntryHubProps {
  onBackToMenu?: () => void;
  onGoToDeckBuilder?: () => void;
  onStartCharacterRegistration?: (preset?: CoordinatePreset) => void;
  onStartSupportRegistration?: (preset?: EmotionPreset) => void;
}

const ENTRIES_KEY = 'reality_world_entries';

type LibraryMode = 'coordinate' | 'emotion';
type SupportMode = 'feeling' | 'performance';

type EmotionAxisConfig = {
  label: string;
  icon: string;
  x: number;
  y: number;
};

const EMOTION_AXIS_CONFIG: Record<EmotionAxisKey, EmotionAxisConfig> = {
  challenge: { label: '挑戦', icon: '🔥', x: 50, y: 8 },
  philosophy: { label: '哲学', icon: '◇', x: 88, y: 36 },
  compassion: { label: '慈愛', icon: '♡', x: 70, y: 89 },
  temptation: { label: '誘惑', icon: '✦', x: 30, y: 89 },
  freedom: { label: '自由', icon: '🪽', x: 12, y: 36 },
};

const EMOTION_AXIS_ORDER: EmotionAxisKey[] = [
  'challenge',
  'philosophy',
  'compassion',
  'temptation',
  'freedom',
];

const EMOTION_AXIS_RING_VALUES = [20, 40, 60, 80, 100];

function getEmotionMapPosition(emotion: EmotionPreset): { x: number; y: number } {
  const total = EMOTION_AXIS_ORDER.reduce(
    (sum, axis) => sum + Math.max(0, Number(emotion.emotionAxes[axis] ?? 0)),
    0,
  );

  if (total <= 0) return { x: 50, y: 49 };

  const weighted = EMOTION_AXIS_ORDER.reduce(
    (point, axis) => {
      const weight = Math.max(0, Number(emotion.emotionAxes[axis] ?? 0));
      const vertex = EMOTION_AXIS_CONFIG[axis];
      return {
        x: point.x + vertex.x * weight,
        y: point.y + vertex.y * weight,
      };
    },
    { x: 0, y: 0 },
  );

  const seed = emotion.id.split('').reduce((sum, char) => sum + char.charCodeAt(0), 0);
  const jitterX = ((seed % 5) - 2) * 0.8;
  const jitterY = (((seed * 7) % 5) - 2) * 0.65;

  return {
    x: Math.min(92, Math.max(8, weighted.x / total + jitterX)),
    y: Math.min(91, Math.max(9, weighted.y / total + jitterY)),
  };
}

function getSeparatedEmotionMapPositions(): Record<string, { x: number; y: number }> {
  const positions = EMOTION_PRESETS.map((emotion) => ({
    id: emotion.id,
    ...getEmotionMapPosition(emotion),
  }));

  const vertexClearance = 10;
  const minimumDistance = 5.6;

  for (let iteration = 0; iteration < 10; iteration += 1) {
    for (const point of positions) {
      for (const axis of EMOTION_AXIS_ORDER) {
        const vertex = EMOTION_AXIS_CONFIG[axis];
        const dx = point.x - vertex.x;
        const dy = point.y - vertex.y;
        const distance = Math.hypot(dx, dy);

        if (distance > 0 && distance < vertexClearance) {
          const push = (vertexClearance - distance) / distance;
          point.x += dx * push * 0.7;
          point.y += dy * push * 0.7;
        }
      }
    }

    for (let i = 0; i < positions.length; i += 1) {
      for (let j = i + 1; j < positions.length; j += 1) {
        const a = positions[i];
        const b = positions[j];
        let dx = a.x - b.x;
        let dy = a.y - b.y;
        let distance = Math.hypot(dx, dy);

        if (distance === 0) {
          const seed = a.id.length * 17 + b.id.length * 31 + i + j;
          dx = ((seed % 3) - 1) * 0.01;
          dy = (((seed * 7) % 3) - 1) * 0.01;
          distance = Math.hypot(dx, dy) || 0.01;
        }

        if (distance < minimumDistance) {
          const push = ((minimumDistance - distance) / distance) * 0.45;
          a.x += dx * push;
          a.y += dy * push;
          b.x -= dx * push;
          b.y -= dy * push;
        }
      }
    }

    for (const point of positions) {
      point.x = Math.min(93, Math.max(7, point.x));
      point.y = Math.min(93, Math.max(7, point.y));
    }
  }

  return Object.fromEntries(positions.map((point) => [point.id, { x: point.x, y: point.y }]));
}

const emotionMapPositions = getSeparatedEmotionMapPositions();

function getStoredEntries(): EntryRecord[] {
  if (typeof window === 'undefined') return [];
  try {
    const saved = localStorage.getItem(ENTRIES_KEY);
    return saved ? (JSON.parse(saved) as EntryRecord[]) : [];
  } catch {
    return [];
  }
}

function EmotionMap({
  emotions,
  selectedEmotionId,
  onSelect,
  isRegistered,
}: {
  emotions: EmotionPreset[];
  selectedEmotionId: string | null;
  onSelect: (emotion: EmotionPreset) => void;
  isRegistered: (emotionId: string) => boolean;
}) {
  return (
    <div className="relative mx-auto w-full max-w-[560px] aspect-square overflow-hidden rounded-3xl border border-purple-100 bg-[radial-gradient(circle_at_center,rgba(168,85,247,0.16),transparent_48%),linear-gradient(135deg,rgba(99,102,241,0.04),rgba(236,72,153,0.08))]">
      <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full" aria-hidden="true">
        {EMOTION_AXIS_RING_VALUES.map((value) => {
          const points = EMOTION_AXIS_ORDER.map((axis) => {
            const vertex = EMOTION_AXIS_CONFIG[axis];
            return [
              50 + (vertex.x - 50) * (value / 100),
              49 + (vertex.y - 49) * (value / 100),
            ].join(',');
          }).join(' ');
          return (
            <polygon
              key={value}
              points={points}
              fill="none"
              stroke="rgba(124,58,237,0.12)"
              strokeWidth="0.55"
            />
          );
        })}
        {EMOTION_AXIS_ORDER.map((axis) => {
          const vertex = EMOTION_AXIS_CONFIG[axis];
          return (
            <line
              key={axis}
              x1="50"
              y1="49"
              x2={vertex.x}
              y2={vertex.y}
              stroke="rgba(124,58,237,0.16)"
              strokeWidth="0.55"
            />
          );
        })}
        <polygon
          points={EMOTION_AXIS_ORDER.map((axis) => `${EMOTION_AXIS_CONFIG[axis].x},${EMOTION_AXIS_CONFIG[axis].y}`).join(' ')}
          fill="rgba(139,92,246,0.04)"
          stroke="rgba(124,58,237,0.26)"
          strokeWidth="1"
        />
      </svg>

      {EMOTION_AXIS_ORDER.map((axis) => {
        const vertex = EMOTION_AXIS_CONFIG[axis];
        return (
          <div
            key={axis}
            className="absolute -translate-x-1/2 -translate-y-1/2 whitespace-nowrap text-center"
            style={{ left: `${vertex.x}%`, top: `${vertex.y}%` }}
          >
            <div className="text-xl leading-none">{vertex.icon}</div>
            <div className="mt-1 text-[11px] font-black text-purple-950">{vertex.label}</div>
          </div>
        );
      })}

      {emotions.map((emotion) => {
        const position = emotionMapPositions[emotion.id] || getEmotionMapPosition(emotion);
        const registered = isRegistered(emotion.id);
        const selected = emotion.id === selectedEmotionId;
        return (
          <button
            key={emotion.id}
            type="button"
            onClick={() => onSelect(emotion)}
            aria-label={`${emotion.emotionPhrase}｜${emotion.name}`}
            title={`${emotion.emotionPhrase}｜${emotion.name}`}
            className={`absolute h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 transition focus:outline-none focus:ring-2 focus:ring-offset-1 ${
              registered
                ? selected
                  ? 'z-30 scale-150 border-white bg-gray-500 ring-2 ring-gray-300'
                  : 'z-10 border-gray-100 bg-gray-400 hover:bg-gray-500'
                : selected
                  ? 'z-30 scale-150 border-white bg-purple-700 shadow-[0_0_0_4px_rgba(124,58,237,0.20),0_0_18px_rgba(124,58,237,0.75)]'
                  : 'z-10 border-purple-100 bg-purple-500 shadow-[0_0_10px_rgba(124,58,237,0.45)] hover:scale-150 hover:bg-fuchsia-500'
            }`}
            style={{ left: `${position.x}%`, top: `${position.y}%` }}
          />
        );
      })}

      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full border border-white/80 bg-white/90 px-3 py-1 text-[9px] font-black text-gray-600 shadow-sm backdrop-blur">
        点をタップして詳細を見る
      </div>
    </div>
  );
}

export default function EntryHub({
  onBackToMenu,
  onGoToDeckBuilder,
  onStartCharacterRegistration,
  onStartSupportRegistration,
}: EntryHubProps) {
  const [libraryMode, setLibraryMode] = useState<LibraryMode>('coordinate');
  const [supportMode, setSupportMode] = useState<SupportMode>('feeling');
  const [entries, setEntries] = useState<EntryRecord[]>(getStoredEntries);
  const [selectedEmotionId, setSelectedEmotionId] = useState<string | null>(null);
  const [showPerformanceFilter, setShowPerformanceFilter] = useState(false);
  const [showEntryList, setShowEntryList] = useState(false);
  const [showRegistrationInfo, setShowRegistrationInfo] = useState(false);
  const [showEmotionDetail, setShowEmotionDetail] = useState(false);
  const [emoTargetFilter, setEmoTargetFilter] = useState('ALL');
  const [emoStatFilter, setEmoStatFilter] = useState('ALL');
  const [emoDurationFilter, setEmoDurationFilter] = useState('ALL');
const [activeGenerator, setActiveGenerator] = useState<{
  type: 'coordinate' | 'emotion';
  preset: CoordinatePreset | EmotionPreset;
  openSaved?: boolean;
} | null>(null);

  const reloadEntries = () => setEntries(getStoredEntries());

  const totalPossibleSlots = COORDINATE_PRESETS.length + EMOTION_PRESETS.length;

  const filledPresetCount = useMemo(
    () =>
      [...COORDINATE_PRESETS, ...EMOTION_PRESETS].filter(
        (preset) => entries.filter((entry) => entry.presetId === preset.id).length >= 1,
      ).length,
    [entries],
  );

  const countAtLeastTwo = useMemo(
    () =>
      [...COORDINATE_PRESETS, ...EMOTION_PRESETS].filter(
        (preset) => entries.filter((entry) => entry.presetId === preset.id).length >= 2,
      ).length,
    [entries],
  );

  const countAtLeastOneRate = filledPresetCount / Math.max(1, totalPossibleSlots);
  const countAtLeastTwoRate = countAtLeastTwo / Math.max(1, totalPossibleSlots);
  const maxEntryLimit =
    countAtLeastOneRate >= 0.9 && countAtLeastTwoRate >= 0.5
      ? 3
      : countAtLeastOneRate >= 0.5
        ? 2
        : 1;

  const characterEntries = entries.filter((entry) => entry.cardType === 'coordinate');
  const supportEntries = entries.filter((entry) => entry.cardType === 'emotion');
  const selectedEmotion = selectedEmotionId
    ? EMOTION_PRESETS.find((emotion) => emotion.id === selectedEmotionId) ?? null
    : null;

  const getEntryCount = (presetId: string) =>
    entries.filter((entry) => entry.presetId === presetId).length;

  const filteredEmotions = useMemo(
    () =>
      EMOTION_PRESETS.filter((emotion) => {
        const matchTarget = emoTargetFilter === 'ALL' || emotion.target === emoTargetFilter;
        const matchStat = emoStatFilter === 'ALL' || emotion.effectCategory === emoStatFilter;
        const matchDuration = emoDurationFilter === 'ALL' || emotion.duration === emoDurationFilter;
        return matchTarget && matchStat && matchDuration;
      }),
    [emoTargetFilter, emoStatFilter, emoDurationFilter],
  );

  const handleEmotionSelect = (emotion: EmotionPreset) => {
    setSelectedEmotionId(emotion.id);
    setShowEmotionDetail(true);
  };

  const handleRegisteredGeneratorClose = () => {
    reloadEntries();
    setActiveGenerator(null);
  };

if (activeGenerator) {
  if (activeGenerator.type === 'coordinate') {
    return (
      <CardGenerator
        selectedCoordinate={activeGenerator.preset as CoordinatePreset}
        onBackToHub={handleRegisteredGeneratorClose}
        openSaved={activeGenerator.openSaved}
      />
    );
  }

  return (
    <SupportCardGenerator
      selectedEmotion={activeGenerator.preset as EmotionPreset}
      onBackToHub={handleRegisteredGeneratorClose}
      openSaved={activeGenerator.openSaved}
    />
  );
}

  return (
    <div className="w-full max-w-6xl mx-auto p-4 sm:p-6 space-y-5 text-gray-900">
      <section className="rounded-3xl border border-gray-200 bg-white shadow-sm overflow-hidden">
        <div className="p-5 sm:p-6 bg-gradient-to-br from-indigo-950 via-indigo-900 to-purple-900 text-white">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="text-[10px] font-black tracking-[0.2em] text-indigo-200">CARD LIBRARY</div>
              <h1 className="mt-1 text-2xl sm:text-3xl font-black">カードライブラリ</h1>
              <p className="mt-2 max-w-2xl text-xs leading-relaxed text-indigo-100">
                登録したカードを確認したり、新しく参加するコーデ・エモーションを選べます。
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {onGoToDeckBuilder && (
                <button
                  type="button"
                  onClick={onGoToDeckBuilder}
                  className="rounded-xl bg-white px-4 py-2.5 text-xs font-black text-indigo-900 shadow-sm transition hover:bg-indigo-50"
                >
                  チームを編成する
                </button>
              )}
              {onBackToMenu && (
                <button
                  type="button"
                  onClick={onBackToMenu}
                  className="rounded-xl border border-white/20 bg-white/10 px-4 py-2.5 text-xs font-black text-white transition hover:bg-white/20"
                >
                  ← メニューへ
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-200 bg-gray-50 px-4 py-3">
          <div className="text-xs font-black text-gray-700">
            登録状況：
            <span className="text-indigo-700">キャラ {characterEntries.length} / 1</span>
            <span className="mx-1 text-gray-400">・</span>
            <span className="text-purple-700">サポート {supportEntries.length} / 1</span>
          </div>
          <button
            type="button"
            onClick={() => setShowRegistrationInfo(true)}
            className="text-[10px] font-black text-gray-500 underline underline-offset-2 hover:text-gray-800"
          >
            登録について
          </button>
        </div>
      </section>

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => setLibraryMode('coordinate')}
          className={`rounded-2xl border px-4 py-4 text-left transition ${
            libraryMode === 'coordinate'
              ? 'border-indigo-900 bg-indigo-900 text-white shadow-sm'
              : 'border-gray-200 bg-white text-gray-800 hover:bg-indigo-50'
          }`}
        >
          <div className="text-sm font-black">👤 キャラカード</div>
          <div className="mt-1 text-[10px] font-bold opacity-75">コーデマップからコーデを選ぶ</div>
        </button>

        <button
          type="button"
          onClick={() => setLibraryMode('emotion')}
          className={`rounded-2xl border px-4 py-4 text-left transition ${
            libraryMode === 'emotion'
              ? 'border-purple-900 bg-purple-900 text-white shadow-sm'
              : 'border-gray-200 bg-white text-gray-800 hover:bg-purple-50'
          }`}
        >
          <div className="text-sm font-black">✨ サポートカード</div>
          <div className="mt-1 text-[10px] font-bold opacity-75">想い・性能から探す</div>
        </button>
      </div>

      {libraryMode === 'coordinate' ? (
        <section className="rounded-3xl border border-gray-200 bg-white shadow-sm overflow-hidden">
          <div className="border-b border-gray-200 px-5 py-5 sm:px-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <div className="text-[9px] font-black tracking-[0.18em] text-indigo-500">CHARACTER CARDS</div>
                <h2 className="mt-1 text-xl font-black">コーデマップからコーデを選ぶ</h2>
                <p className="mt-1 text-[10px] leading-relaxed text-gray-600">
                  気になるコーデをタップすると、その性能と登録済みカードを確認できます。
                </p>
              </div>
              {onStartCharacterRegistration && (
                <button
                  type="button"
                  onClick={() => onStartCharacterRegistration()}
                  className="shrink-0 rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-black text-white transition hover:bg-indigo-700"
                >
                  ＋ キャラカードを登録
                </button>
              )}
            </div>
          </div>

          <div className="p-4 sm:p-6">
            <CoordinateRadialMap
              coordinates={COORDINATE_PRESETS}
              entries={entries}
              maxEntryLimit={maxEntryLimit}
              mode="entry"
              onEntry={(coordinate) => {
                setActiveGenerator({ type: 'coordinate', preset: coordinate });
              }}
            />
          </div>
        </section>
      ) : (
        <section className="rounded-3xl border border-gray-200 bg-white shadow-sm overflow-hidden">
          <div className="border-b border-gray-200 px-5 py-5 sm:px-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
              <div>
                <div className="text-[9px] font-black tracking-[0.18em] text-purple-500">SUPPORT CARDS</div>
                <h2 className="mt-1 text-xl font-black">エモーションマップ</h2>
                <p className="mt-1 text-[10px] leading-relaxed text-gray-600">
                  「どんな想い？」から探すか、「どんな効果？」から探すかを切り替えられます。
                </p>
              </div>
              {onStartSupportRegistration && (
                <button
                  type="button"
                  onClick={() => onStartSupportRegistration()}
                  className="shrink-0 rounded-xl bg-purple-600 px-4 py-2.5 text-xs font-black text-white transition hover:bg-purple-700"
                >
                  ＋ サポートカードを登録
                </button>
              )}
            </div>

            <div className="mt-4 inline-flex rounded-full border border-purple-200 bg-purple-50 p-1" role="group" aria-label="エモーション探索モード">
              <button
                type="button"
                onClick={() => setSupportMode('feeling')}
                className={`rounded-full px-4 py-2 text-[10px] font-black transition ${
                  supportMode === 'feeling' ? 'bg-purple-800 text-white shadow-sm' : 'text-purple-700 hover:bg-white'
                }`}
              >
                想いから
              </button>
              <button
                type="button"
                onClick={() => setSupportMode('performance')}
                className={`rounded-full px-4 py-2 text-[10px] font-black transition ${
                  supportMode === 'performance' ? 'bg-purple-800 text-white shadow-sm' : 'text-purple-700 hover:bg-white'
                }`}
              >
                性能から
              </button>
            </div>
          </div>

          {supportMode === 'feeling' ? (
            <div className="p-4 sm:p-6">
              <EmotionMap
                emotions={EMOTION_PRESETS}
                selectedEmotionId={selectedEmotionId}
                onSelect={handleEmotionSelect}
                isRegistered={(emotionId) => getEntryCount(emotionId) > 0}
              />
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[9px] font-bold text-gray-500">
                <span>● 未登録　<span className="text-gray-400">● 登録済み</span></span>
                <span>{EMOTION_PRESETS.length}種のエモーション</span>
              </div>
            </div>
          ) : (
            <div className="p-4 sm:p-6 space-y-4">
              <div className="rounded-2xl border border-purple-100 bg-purple-50/50 p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="text-[9px] font-black tracking-[0.16em] text-purple-500">PERFORMANCE SEARCH</div>
                    <div className="mt-1 text-sm font-black text-purple-950">効果条件からサポートカードを探す</div>
                    <div className="mt-1 text-[10px] font-bold text-gray-600">
                      {emoTargetFilter === 'ALL' && emoStatFilter === 'ALL' && emoDurationFilter === 'ALL'
                        ? 'すべての条件で表示中'
                        : `対象：${emoTargetFilter === 'ALL' ? 'すべて' : emoTargetFilter} / 効果：${emoStatFilter === 'ALL' ? 'すべて' : emoStatFilter} / 持続：${emoDurationFilter === 'ALL' ? 'すべて' : emoDurationFilter}`}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowPerformanceFilter(true)}
                    className="shrink-0 rounded-xl border border-purple-200 bg-white px-4 py-2.5 text-[10px] font-black text-purple-800 shadow-sm hover:bg-purple-50"
                  >
                    条件を設定
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                {filteredEmotions.map((emotion) => {
                  const count = getEntryCount(emotion.id);
                  const full = count >= maxEntryLimit;
                  return (
                    <button
                      key={emotion.id}
                      type="button"
                      onClick={() => handleEmotionSelect(emotion)}
                      className="w-full rounded-2xl border border-gray-200 bg-white p-4 text-left shadow-sm transition hover:border-purple-300 hover:bg-purple-50/30"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <div className="flex flex-wrap gap-1.5">
                            <span className="rounded-lg bg-purple-100 px-2 py-1 text-[9px] font-black text-purple-800">{emotion.target}</span>
                            <span className="rounded-lg bg-purple-100 px-2 py-1 text-[9px] font-black text-purple-800">{emotion.effectCategory}</span>
                            <span className="rounded-lg bg-purple-100 px-2 py-1 text-[9px] font-black text-purple-800">{emotion.duration}</span>
                          </div>
                          <div className="mt-2 font-black text-gray-900">{emotion.name}</div>
                          <div className="mt-1 text-[10px] leading-relaxed text-gray-600">{emotion.statEffect}{emotion.effectAmount ? ` / ${emotion.effectAmount}` : ''}</div>
                        </div>
                        <span className={`shrink-0 rounded-full px-2.5 py-1 text-[9px] font-black ${full ? 'bg-gray-100 text-gray-400' : 'bg-purple-100 text-purple-700'}`}>
                          {count} / {maxEntryLimit}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </section>
      )}

      {characterEntries.length + supportEntries.length > 0 && (
        <button
          type="button"
          onClick={() => setShowEntryList(true)}
          className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-xs font-black text-gray-700 shadow-sm hover:bg-gray-50"
        >
          登録済みカードを見る
        </button>
      )}

      {showEmotionDetail && selectedEmotion && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-lg max-h-[88vh] overflow-y-auto rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl">
            <div className="sticky top-0 z-10 border-b border-gray-200 bg-white/95 px-5 py-4 backdrop-blur">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[9px] font-black tracking-[0.16em] text-purple-500">EMOTION DETAILS</div>
                  <h3 className="mt-1 text-lg font-black text-gray-900">{selectedEmotion.name}</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setShowEmotionDetail(false)}
                  className="rounded-full bg-gray-100 px-3 py-1.5 text-[10px] font-black text-gray-600 hover:bg-gray-200"
                >
                  閉じる
                </button>
              </div>
            </div>

            <div className="space-y-4 p-5">
              <div className="rounded-2xl border border-purple-100 bg-purple-50/60 p-4">
                <div className="text-[9px] font-black text-purple-500">性能</div>
                <div className="mt-1 text-sm font-black text-purple-950">{selectedEmotion.statEffect}{selectedEmotion.effectAmount ? ` / ${selectedEmotion.effectAmount}` : ''}</div>
                <div className="mt-1 text-[10px] font-bold text-gray-500">{selectedEmotion.target} / {selectedEmotion.duration} / {selectedEmotion.effectCategory}</div>
              </div>

              <div className="rounded-2xl border border-gray-200 bg-white p-4">
                <div className="text-[9px] font-black text-gray-400">想い</div>
                <div className="mt-1 font-serif text-base font-black leading-relaxed text-gray-900">{selectedEmotion.emotionPhrase}</div>
              </div>

              <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[9px] font-black text-gray-500">登録状況</span>
                  <span className={`rounded-full px-2.5 py-1 text-[9px] font-black ${getEntryCount(selectedEmotion.id) >= maxEntryLimit ? 'bg-gray-200 text-gray-500' : 'bg-purple-100 text-purple-700'}`}>
                    {getEntryCount(selectedEmotion.id)} / {maxEntryLimit}
                  </span>
                </div>
                {getEntryCount(selectedEmotion.id) > 0 && (
                  <div className="mt-3 space-y-2">
                    {supportEntries
                      .filter((entry) => entry.presetId === selectedEmotion.id)
                      .map((entry) => (
                        <div key={entry.id} className="flex items-center gap-2 rounded-xl bg-white p-2.5 border border-gray-200">
                          {entry.imageDataUrl ? <img src={entry.imageDataUrl} alt="" className="h-9 w-9 rounded-lg object-cover border border-gray-200" /> : <div className="h-9 w-9 rounded-lg bg-gray-100" />}
                          <div className="min-w-0">
                            <div className="truncate text-[10px] font-black text-gray-900">{entry.userName}</div>
                            <div className="truncate text-[9px] font-bold text-purple-700">{entry.customEffectName || selectedEmotion.name}</div>
                          </div>
                        </div>
                      ))}
                  </div>
                )}
              </div>

              <button
                type="button"
                disabled={getEntryCount(selectedEmotion.id) >= maxEntryLimit || !onStartSupportRegistration}
                onClick={() => {
                  if (getEntryCount(selectedEmotion.id) >= maxEntryLimit || !onStartSupportRegistration) return;
                  setShowEmotionDetail(false);
                  onStartSupportRegistration(selectedEmotion);
                }}
                className={`w-full rounded-2xl py-3 text-xs font-black text-white transition ${
                  getEntryCount(selectedEmotion.id) >= maxEntryLimit
                    ? 'cursor-not-allowed bg-gray-300'
                    : 'bg-purple-700 hover:bg-purple-800'
                }`}
              >
                {getEntryCount(selectedEmotion.id) >= maxEntryLimit ? 'このエモーションは満員です' : 'このエモーションで登録する'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showPerformanceFilter && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-md rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl">
            <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
              <div>
                <div className="text-[9px] font-black tracking-[0.16em] text-purple-500">PERFORMANCE FILTER</div>
                <h3 className="mt-1 text-base font-black">性能条件を設定</h3>
              </div>
              <button type="button" onClick={() => setShowPerformanceFilter(false)} className="rounded-full bg-gray-100 px-3 py-1.5 text-[10px] font-black text-gray-600">閉じる</button>
            </div>
            <div className="space-y-3 p-5">
              <label className="block text-[10px] font-black text-gray-600">
                対象
                <select value={emoTargetFilter} onChange={(e) => setEmoTargetFilter(e.target.value)} className="mt-1 w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-xs font-bold">
                  <option value="ALL">すべて</option>
                  <option value="自分">自分</option>
                  <option value="相手">相手</option>
                  <option value="自分・相手">自分・相手</option>
                </select>
              </label>
              <label className="block text-[10px] font-black text-gray-600">
                効果
                <select value={emoStatFilter} onChange={(e) => setEmoStatFilter(e.target.value)} className="mt-1 w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-xs font-bold">
                  <option value="ALL">すべて</option>
                  {Array.from(new Set(EMOTION_PRESETS.map((emotion) => emotion.effectCategory))).map((category) => (
                    <option key={category} value={category}>{category}</option>
                  ))}
                </select>
              </label>
              <label className="block text-[10px] font-black text-gray-600">
                持続
                <select value={emoDurationFilter} onChange={(e) => setEmoDurationFilter(e.target.value)} className="mt-1 w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-xs font-bold">
                  <option value="ALL">すべて</option>
                  <option value="一時">一時</option>
                  <option value="永続">永続</option>
                </select>
              </label>
              <button type="button" onClick={() => setShowPerformanceFilter(false)} className="mt-2 w-full rounded-2xl bg-purple-700 py-3 text-xs font-black text-white">この条件で探す</button>
            </div>
          </div>
        </div>
      )}

      {showEntryList && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-2xl max-h-[88vh] overflow-y-auto rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-200 bg-white/95 px-5 py-4 backdrop-blur">
              <div>
                <div className="text-[9px] font-black tracking-[0.16em] text-gray-400">REGISTERED CARDS</div>
                <h3 className="mt-1 text-base font-black">登録済みカード</h3>
              </div>
              <button type="button" onClick={() => setShowEntryList(false)} className="rounded-full bg-gray-100 px-3 py-1.5 text-[10px] font-black text-gray-600">閉じる</button>
            </div>
            <div className="space-y-3 p-5">
              {entries.map((entry) => {
                const emotion = entry.cardType === 'emotion' ? EMOTION_PRESETS.find((item) => item.id === entry.presetId) : null;
                const coordinate = entry.cardType === 'coordinate' ? COORDINATE_PRESETS.find((item) => item.id === entry.presetId) : null;
                return (
                  <article key={entry.id} className="rounded-2xl border border-gray-200 bg-gray-50 p-3">
                    <div className="flex items-center gap-3">
<div className="mt-2">
  <button
    type="button"
    onClick={() => {
      const preset =
        entry.cardType === 'coordinate'
          ? coordinate
          : emotion;

      if (!preset) return;

      setShowEntryList(false);
      setActiveGenerator({
        type: entry.cardType,
        preset,
        openSaved: true,
      });
    }}
    className={`w-full rounded-xl px-3 py-2 text-[10px] font-black text-white ${
      entry.cardType === 'coordinate'
        ? 'bg-indigo-600 hover:bg-indigo-700'
        : 'bg-purple-600 hover:bg-purple-700'
    }`}
  >
    編集・削除
  </button>
</div>
                      {entry.imageDataUrl ? <img src={entry.imageDataUrl} alt="" className="h-12 w-12 rounded-xl object-cover border border-gray-200" /> : <div className="h-12 w-12 rounded-xl bg-gray-200" />}
                      <div className="min-w-0 flex-1">
                        <div className="text-[9px] font-black text-gray-400">{entry.cardType === 'coordinate' ? 'キャラカード' : 'サポートカード'}</div>
                        <div className="truncate text-sm font-black text-gray-900">{entry.userName}</div>
                        <div className="mt-0.5 truncate text-[10px] font-bold text-gray-500">
                          {coordinate?.name || emotion?.name || entry.presetId}
                        </div>
                      </div>
                    </div>
                    {entry.cardType === 'emotion' && (
                      <div className="mt-2 rounded-xl bg-white p-2.5 text-[10px] text-gray-600">
                        <div className="font-black text-purple-700">効果名：{entry.customEffectName || emotion?.name || '未設定'}</div>
                        {entry.flavorText && <div className="mt-1">💬 {entry.flavorText}</div>}
                      </div>
                    )}
                    {entry.cardType === 'coordinate' && (
                      <div className="mt-2 rounded-xl bg-white p-2.5 text-[10px] text-gray-600">
                        <div className="font-black text-indigo-700">コーデ：{coordinate?.name || entry.presetId}</div>
                        {entry.flavorText && <div className="mt-1">💬 {entry.flavorText}</div>}
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {showRegistrationInfo && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-md rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl">
            <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
              <div>
                <div className="text-[9px] font-black tracking-[0.16em] text-gray-400">REGISTRATION</div>
                <h3 className="mt-1 text-base font-black">カード登録について</h3>
              </div>
              <button type="button" onClick={() => setShowRegistrationInfo(false)} className="rounded-full bg-gray-100 px-3 py-1.5 text-[10px] font-black text-gray-600">閉じる</button>
            </div>
            <div className="space-y-4 p-5 text-[11px] leading-relaxed text-gray-600">
              <div className="rounded-2xl bg-indigo-50 p-3">
                <div className="font-black text-indigo-900">キャラカード</div>
                <div className="mt-1">1ユーザーにつき1枚の登録を想定しています。コーデごとに登録枠があります。</div>
              </div>
              <div className="rounded-2xl bg-purple-50 p-3">
                <div className="font-black text-purple-900">サポートカード</div>
                <div className="mt-1">1ユーザーにつき1枚の登録を想定しています。エモーションごとに登録枠があります。</div>
              </div>
              <div className="rounded-2xl border border-gray-200 bg-gray-50 p-3">
                <div className="font-black text-gray-800">現在のエントリー上限</div>
                <div className="mt-1 text-xl font-black text-gray-900">{maxEntryLimit}人 / 枠</div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
