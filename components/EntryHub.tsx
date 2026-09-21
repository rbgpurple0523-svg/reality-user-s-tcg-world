'use client';

import React, { useMemo, useState } from 'react';
import CardGenerator from './CardGenerator';
import SupportCardGenerator from './SupportCardGenerator';
import { EMOTION_PRESETS } from './emotionPresets';
import type { EmotionPreset } from './emotionPresets';

// =========================================================
// 型定義
// =========================================================
export type CardColor = '赤' | '青' | '黄';
export type Archetype = 'マッスル型' | '頭脳型' | 'ディーバ型' | '職人型';
export type Season = '春' | '夏' | '秋' | '冬';

export type StatKey = 'hp' | 'intellect' | 'dexterity' | 'charm';

export interface CoordinatePreset {
  id: string;
  code: string;
  name: string;
  color: CardColor;
  archetype: Archetype;
  season: Season;
  stats: {
    hp: number;
    intellect: number;
    charm: number;
    dexterity: number;
  };
  defaultSkills: [string, string, string, string];
  skillDescriptions: [string, string, string, string];
  tendency: string;
}

export interface EntryRecord {
  id: string;
  presetId: string;
  cardType: 'coordinate' | 'emotion';
  profileUrl: string;
  userName: string;
  imageDataUrl: string;
  passwordHash: string;
  firstUser: string;

  // 既存サポートカード所有者管理用
  ownerToken?: string;

  // 既存サポートカードのユーザー編集用
  customEffectName?: string;

  customSkills?: [string, string, string, string];
  skillDescriptions?: [string, string, string, string];
  color?: CardColor;
  season?: Season;
  archetype?: Archetype;

  // 既存GameBoardとの互換性
  hp?: number;
  ap?: number;

  createdAt: string;
  updatedAt?: string;
}

interface EntryHubProps {
  onBackToMenu?: () => void;
  onGoToDeckBuilder?: () => void;
  onStartCharacterRegistration?: (
    preset?: CoordinatePreset,
  ) => void;
  onStartSupportRegistration?: (
    preset?: EmotionPreset,
  ) => void;
}

const ENTRIES_KEY = 'reality_world_entries';

// =========================================================
// コーデ25種（a〜y）
// =========================================================

const COORD_CODES = [
  'a',
  'b',
  'c',
  'd',
  'e',
  'f',
  'g',
  'h',
  'i',
  'j',
  'k',
  'l',
  'm',
  'n',
  'o',
  'p',
  'q',
  'r',
  's',
  't',
  'u',
  'v',
  'w',
  'x',
  'y',
] as const;

const STAT_LABELS: Record<StatKey, string> = {
  hp: '体力',
  intellect: '知略',
  dexterity: '器用',
  charm: '特技',
};

const STAT_RANKS: Record<string, StatKey[]> = {
  a: ['hp', 'intellect', 'dexterity', 'charm'],
  b: ['hp', 'intellect', 'charm', 'dexterity'],
  c: ['hp', 'dexterity', 'intellect', 'charm'],
  d: ['hp', 'dexterity', 'charm', 'intellect'],
  e: ['hp', 'charm', 'intellect', 'dexterity'],
  f: ['hp', 'charm', 'dexterity', 'intellect'],
  g: ['intellect', 'hp', 'dexterity', 'charm'],
  h: ['intellect', 'hp', 'charm', 'dexterity'],
  i: ['intellect', 'dexterity', 'hp', 'charm'],
  j: ['intellect', 'dexterity', 'charm', 'hp'],
  k: ['intellect', 'charm', 'hp', 'dexterity'],
  l: ['intellect', 'charm', 'dexterity', 'hp'],
  m: ['dexterity', 'hp', 'intellect', 'charm'],
  n: ['dexterity', 'hp', 'charm', 'intellect'],
  o: ['dexterity', 'intellect', 'hp', 'charm'],
  p: ['dexterity', 'intellect', 'charm', 'hp'],
  q: ['dexterity', 'charm', 'hp', 'intellect'],
  r: ['dexterity', 'charm', 'intellect', 'hp'],
  s: ['charm', 'hp', 'intellect', 'dexterity'],
  t: ['charm', 'hp', 'dexterity', 'intellect'],
  u: ['charm', 'intellect', 'hp', 'dexterity'],
  v: ['charm', 'intellect', 'dexterity', 'hp'],
  w: ['charm', 'dexterity', 'hp', 'intellect'],
  x: ['charm', 'dexterity', 'intellect', 'hp'],
  y: ['hp', 'intellect', 'dexterity', 'charm'],
};

const STATS_BY_CODE: Record<
  string,
  [number, number, number, number]
> = {
  a: [80, 60, 40, 20],
  b: [80, 60, 20, 40],
  c: [80, 40, 60, 20],
  d: [80, 40, 20, 60],
  e: [80, 20, 60, 40],
  f: [80, 20, 40, 60],
  g: [60, 80, 40, 20],
  h: [60, 80, 20, 40],
  i: [60, 40, 80, 20],
  j: [60, 40, 20, 80],
  k: [60, 20, 80, 40],
  l: [60, 20, 40, 80],
  m: [40, 80, 60, 20],
  n: [40, 80, 20, 60],
  o: [40, 60, 80, 20],
  p: [40, 60, 20, 80],
  q: [40, 20, 80, 60],
  r: [40, 20, 60, 80],
  s: [20, 80, 60, 40],
  t: [20, 80, 40, 60],
  u: [20, 60, 80, 40],
  v: [20, 60, 40, 80],
  w: [20, 40, 80, 60],
  x: [20, 40, 60, 80],
  y: [40, 40, 40, 40],
};

const ARCHETYPE_BY_PRIMARY: Record<StatKey, Archetype> = {
  hp: 'マッスル型',
  intellect: '頭脳型',
  dexterity: '職人型',
  charm: 'ディーバ型',
};

const skillNamesFor = (
  code: string,
): [string, string, string, string] => {
  if (code === 'y') {
    return [
      'オールラウンド・スコア',
      '対応ステータス・スコア',
      'オールアップ・バースト',
      'オールダウン・クラッシュ',
    ];
  }

  const rank = STAT_RANKS[code];

  return [
    `${STAT_LABELS[rank[0]]}ブースト`,
    `${STAT_LABELS[rank[2]]}×${STAT_LABELS[rank[3]]}スコア`,
    `${STAT_LABELS[rank[0]]}対抗スコア`,
    `${STAT_LABELS[rank[1]]}＋${STAT_LABELS[rank[3]]}スコア`,
  ];
};

const skillDescriptionsFor = (
  code: string,
): [string, string, string, string] => {
  if (code === 'y') {
    return [
      '総合値×5でスコアを獲得する。',
      '自分の対応ステータス−相手の最低ステータスを基準に×20でスコアを獲得する。',
      '100スコアを獲得し、任意のステータスを2倍にする（1回のみ）。',
      '総合値×2でスコアを獲得し、相手の全ステータスを25%減らす（1回のみ）。',
    ];
  }

  const rank = STAT_RANKS[code];

  return [
    `${STAT_LABELS[rank[0]]}×10でスコアを獲得する。`,
    `${STAT_LABELS[rank[2]]}×${STAT_LABELS[rank[3]]}でスコアを獲得する。`,
    `(自分の${STAT_LABELS[rank[0]]}−相手の${STAT_LABELS[rank[0]]})×20でスコアを獲得する。`,
    `(${STAT_LABELS[rank[1]]}＋${STAT_LABELS[rank[3]]})×5でスコアを獲得し、相手の${STAT_LABELS[rank[0]]}を半減する（1回のみ）。`,
  ];
};

export const COORDINATE_PRESETS: CoordinatePreset[] =
  COORD_CODES.map((code) => {
    const [hp, intellect, dexterity, charm] =
      STATS_BY_CODE[code];

    const primary = STAT_RANKS[code][0];

    return {
      id: `coord_${code}`,
      code,
      name: `コーデ ${code}`,
      color: '赤',
      archetype:
        ARCHETYPE_BY_PRIMARY[primary],
      season: '春',
      stats: {
        hp,
        intellect,
        dexterity,
        charm,
      },
      defaultSkills:
        skillNamesFor(code),
      skillDescriptions:
        skillDescriptionsFor(code),
      tendency:
        code === 'y'
          ? '体力＝知略＝器用＝特技'
          : STAT_RANKS[code]
              .map(
                (key) => STAT_LABELS[key],
              )
              .join(' ＞ '),
    };
  });

export default function EntryHub({
  onBackToMenu,
  onGoToDeckBuilder,
  onStartCharacterRegistration,
  onStartSupportRegistration,
}: EntryHubProps) {
  const [activeTab, setActiveTab] =
    useState<'coordinate' | 'emotion'>(
      'coordinate',
    );

  const [entries, setEntries] =
    useState<EntryRecord[]>(() => {
      if (typeof window === 'undefined') {
        return [];
      }

      try {
        const saved =
          localStorage.getItem(
            ENTRIES_KEY,
          );
        return saved
          ? JSON.parse(saved)
          : [];
      } catch {
        return [];
      }
    });

  const [coordSearchFilter, setCoordSearchFilter] =
    useState('');

  const [coordArchetypeFilter, setCoordArchetypeFilter] =
    useState('ALL');

  const [emoTargetFilter, setEmoTargetFilter] =
    useState('ALL');

  const [emoStatFilter, setEmoStatFilter] =
    useState('ALL');

  const [emoDurationFilter, setEmoDurationFilter] =
    useState('ALL');

  const [activeGenerator, setActiveGenerator] =
    useState<{
      type: 'coordinate' | 'emotion';
      preset:
        | CoordinatePreset
        | EmotionPreset;
    } | null>(null);

  const reloadEntries = () => {
    try {
      const saved =
        localStorage.getItem(
          ENTRIES_KEY,
        );

      setEntries(
        saved
          ? JSON.parse(saved)
          : [],
      );
    } catch {
      setEntries([]);
    }
  };

  const getEntryCount = (
    presetId: string,
  ) =>
    entries.filter(
      (entry) =>
        entry.presetId ===
        presetId,
    ).length;

  const totalPossibleSlots =
    COORDINATE_PRESETS.length +
    EMOTION_PRESETS.length;

  const filledPresetCount = useMemo(
    () =>
      [
        ...COORDINATE_PRESETS,
        ...EMOTION_PRESETS,
      ].filter(
        (preset) =>
          getEntryCount(
            preset.id,
          ) >= 1,
      ).length,
    [entries],
  );

  const fillRate =
    filledPresetCount /
    Math.max(
      1,
      totalPossibleSlots,
    );

  const countAtLeastOneRate =
    filledPresetCount /
    Math.max(
      1,
      totalPossibleSlots,
    );

  const countAtLeastTwo =
    useMemo(
      () =>
        [
          ...COORDINATE_PRESETS,
          ...EMOTION_PRESETS,
        ].filter(
          (preset) =>
            getEntryCount(
              preset.id,
            ) >= 2,
        ).length,
      [entries],
    );

  const countAtLeastTwoRate =
    countAtLeastTwo /
    Math.max(
      1,
      totalPossibleSlots,
    );

  const maxEntryLimit =
    countAtLeastOneRate >=
      0.9 &&
    countAtLeastTwoRate >=
      0.5
      ? 3
      : countAtLeastOneRate >=
          0.5
        ? 2
        : 1;

  const totalRegisteredCards =
    entries.length;

  const availableCoordinateCount =
    useMemo(
      () =>
        COORDINATE_PRESETS.filter(
          (coordinate) =>
            getEntryCount(
              coordinate.id,
            ) <
            maxEntryLimit,
        ).length,
      [entries, maxEntryLimit],
    );

  const availableEmotionCount =
    useMemo(
      () =>
        EMOTION_PRESETS.filter(
          (emotion) =>
            getEntryCount(
              emotion.id,
            ) <
            maxEntryLimit,
        ).length,
      [entries, maxEntryLimit],
    );

  const coordinateMatrix =
    useMemo(() => {
      const stats: StatKey[] = [
        'hp',
        'intellect',
        'dexterity',
        'charm',
      ];

      return stats.map(
        (primary) => ({
          primary,
          cells: stats.map(
            (secondary) => {
              if (
                primary ===
                secondary
              ) {
                return [];
              }

              return COORDINATE_PRESETS.filter(
                (coordinate) => {
                  const rank =
                    STAT_RANKS[
                      coordinate.code
                    ];

                  return (
                    rank[0] ===
                      primary &&
                    rank[1] ===
                      secondary
                  );
                },
              );
            },
          ),
        }),
      );
    }, []);

  const filteredCoordinates =
    useMemo(() => {
      const q =
        coordSearchFilter
          .trim()
          .toLowerCase();

      return COORDINATE_PRESETS.filter(
        (coordinate) => {
          const matchSearch =
            !q ||
            coordinate.code.includes(
              q,
            ) ||
            coordinate.name
              .toLowerCase()
              .includes(q) ||
            coordinate.tendency
              .toLowerCase()
              .includes(q);

          const matchArchetype =
            coordArchetypeFilter ===
              'ALL' ||
            coordinate.archetype ===
              coordArchetypeFilter;

          return (
            matchSearch &&
            matchArchetype
          );
        },
      );
    }, [
      coordSearchFilter,
      coordArchetypeFilter,
    ]);

  const filteredEmotions =
    useMemo(
      () =>
        EMOTION_PRESETS.filter(
          (emotion) => {
            const matchTarget =
              emoTargetFilter ===
                'ALL' ||
              emotion.target ===
                emoTargetFilter;

            const matchStat =
              emoStatFilter ===
                'ALL' ||
              emotion.effectCategory ===
                emoStatFilter;

            const matchDuration =
              emoDurationFilter ===
                'ALL' ||
              emotion.duration ===
                emoDurationFilter;

            return (
              matchTarget &&
              matchStat &&
              matchDuration
            );
          },
        ),
      [
        emoTargetFilter,
        emoStatFilter,
        emoDurationFilter,
      ],
    );

  // =========================================================
  // 生成画面
  // =========================================================
  if (activeGenerator) {
    if (
      activeGenerator.type ===
      'coordinate'
    ) {
      return (
        <CardGenerator
          selectedCoordinate={
            activeGenerator.preset as CoordinatePreset
          }
          onBackToHub={() => {
            reloadEntries();
            setActiveGenerator(
              null,
            );
          }}
        />
      );
    }

    return (
      <SupportCardGenerator
        selectedEmotion={
          activeGenerator.preset as EmotionPreset
        }
        onBackToHub={() => {
          reloadEntries();
          setActiveGenerator(
            null,
          );
        }}
      />
    );
  }

  return (
    <div className="w-full max-w-6xl mx-auto p-4 sm:p-6 space-y-6 text-gray-900">
      {/* ===================================================== */}
      {/* ヘッダー */}
      {/* ===================================================== */}
      <section className="bg-white rounded-3xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="p-6 sm:p-7 bg-gradient-to-br from-indigo-950 via-indigo-900 to-purple-900 text-white">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="text-xs font-black tracking-[0.2em] text-indigo-200">
                CARD LIBRARY
              </div>

              <h1 className="mt-2 text-3xl sm:text-4xl font-black">
                カード一覧
              </h1>

              <p className="mt-3 max-w-2xl text-sm leading-relaxed text-indigo-100">
                みんなが登録したアバターカードと、
                これから参加できる公式性能枠をここで確認できます。
                気になる枠を見つけたら、そのままアバターエントリーへ進めます。
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              {onGoToDeckBuilder && (
                <button
                  type="button"
                  onClick={
                    onGoToDeckBuilder
                  }
                  className="px-4 py-3 rounded-xl bg-white text-indigo-900 hover:bg-indigo-50 text-xs font-black shadow-sm transition"
                >
                  🃏 デッキを構築する
                </button>
              )}

              {onStartCharacterRegistration && (
                <button
                  type="button"
                  onClick={() =>
                    onStartCharacterRegistration()
                  }
                  className="px-4 py-3 rounded-xl bg-indigo-500 hover:bg-indigo-400 text-white text-xs font-black transition border border-indigo-300"
                >
                  👤 キャラカードを登録
                </button>
              )}

              {onStartSupportRegistration && (
                <button
                  type="button"
                  onClick={() =>
                    onStartSupportRegistration()
                  }
                  className="px-4 py-3 rounded-xl bg-purple-500 hover:bg-purple-400 text-white text-xs font-black transition border border-purple-300"
                >
                  ✨ サポートカードを登録
                </button>
              )}

              {onBackToMenu && (
                <button
                  type="button"
                  onClick={
                    onBackToMenu
                  }
                  className="px-4 py-3 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-black transition border border-white/20"
                >
                  ← メニューへ
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 p-4 bg-gray-50 border-t border-gray-200">
          <div className="rounded-2xl bg-white border border-gray-200 p-4">
            <div className="text-[10px] font-bold text-gray-500">
              登録カード数
            </div>
            <div className="mt-1 text-2xl font-black text-gray-900">
              {totalRegisteredCards}
            </div>
          </div>

          <div className="rounded-2xl bg-white border border-gray-200 p-4">
            <div className="text-[10px] font-bold text-gray-500">
              コーデ枠
            </div>
            <div className="mt-1 text-2xl font-black text-indigo-700">
              {COORDINATE_PRESETS.length}
            </div>
          </div>

          <div className="rounded-2xl bg-white border border-gray-200 p-4">
            <div className="text-[10px] font-bold text-gray-500">
              エモーション枠
            </div>
            <div className="mt-1 text-2xl font-black text-purple-700">
              {EMOTION_PRESETS.length}
            </div>
          </div>

          <div className="rounded-2xl bg-white border border-gray-200 p-4">
            <div className="text-[10px] font-bold text-gray-500">
              現在の上限
            </div>
            <div className="mt-1 text-2xl font-black text-emerald-700">
              {maxEntryLimit}人
            </div>
          </div>

          <div className="rounded-2xl bg-white border border-gray-200 p-4 col-span-2 lg:col-span-1">
            <div className="text-[10px] font-bold text-gray-500">
              参加可能枠
            </div>
            <div className="mt-1 text-sm font-black text-gray-900">
              コーデ{' '}
              {
                availableCoordinateCount
              }
              <br />
              エモーション{' '}
              {
                availableEmotionCount
              }
            </div>
          </div>
        </div>

        <div className="p-4 border-t border-gray-200">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-xs">
            <div className="p-3 rounded-xl border bg-indigo-50 border-indigo-200 text-indigo-800 font-bold text-center">
              🔓 上限1人
            </div>

            <div
              className={`p-3 rounded-xl border text-center ${
                maxEntryLimit >= 2
                  ? 'bg-indigo-50 border-indigo-200 text-indigo-800 font-bold'
                  : 'bg-gray-50 border-gray-200 text-gray-400'
              }`}
            >
              🔓 上限2人{' '}
              {maxEntryLimit >=
              2
                ? '✨解放'
                : '(50%以上で解放)'}
            </div>

            <div
              className={`p-3 rounded-xl border text-center ${
                maxEntryLimit >= 3
                  ? 'bg-purple-50 border-purple-200 text-purple-800 font-bold'
                  : 'bg-gray-50 border-gray-200 text-gray-400'
              }`}
            >
              🌟 上限3人{' '}
              {maxEntryLimit >=
              3
                ? '✨解放'
                : '(90%/50%条件で解放)'}
            </div>
          </div>

          <div className="mt-3 text-xs text-gray-500">
            現在の枠充足率：
            <span className="font-black text-indigo-700">
              {(fillRate * 100).toFixed(
                1,
              )}
              %
            </span>

            <span className="ml-3">
              1人以上：
              {filledPresetCount}/
              {totalPossibleSlots}
            </span>

            <span className="ml-3">
              2人以上：
              {countAtLeastTwo}/
              {totalPossibleSlots}
            </span>
          </div>
        </div>
      </section>

      {/* ===================================================== */}
      {/* タブ */}
      {/* ===================================================== */}
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() =>
            setActiveTab(
              'coordinate',
            )
          }
          className={`rounded-2xl px-4 py-4 text-sm font-black transition border ${
            activeTab === 'coordinate'
              ? 'bg-indigo-900 text-white border-indigo-900 shadow-sm'
              : 'bg-white text-gray-700 border-gray-200 hover:bg-indigo-50'
          }`}
        >
          👤 キャラカード
          <span className="block mt-1 text-[10px] font-normal opacity-80">
            コーデ性能
          </span>
        </button>

        <button
          type="button"
          onClick={() =>
            setActiveTab('emotion')
          }
          className={`rounded-2xl px-4 py-4 text-sm font-black transition border ${
            activeTab === 'emotion'
              ? 'bg-purple-900 text-white border-purple-900 shadow-sm'
              : 'bg-white text-gray-700 border-gray-200 hover:bg-purple-50'
          }`}
        >
          ✨ サポートカード
          <span className="block mt-1 text-[10px] font-normal opacity-80">
            エモーション性能
          </span>
        </button>
      </div>

      {/* ===================================================== */}
      {/* コーデ一覧 */}
      {/* ===================================================== */}
      {activeTab ===
        'coordinate' && (
        <section className="bg-white rounded-3xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="p-6 border-b border-gray-200">
            <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
              <div>
                <div className="text-xs font-black tracking-[0.15em] text-indigo-500">
                  CHARACTER CARDS
                </div>

                <h2 className="mt-1 text-2xl font-black">
                  コーデ一覧
                </h2>

                <p className="mt-2 text-xs text-gray-500 leading-relaxed">
                  コーデ性能は公式マスターで固定されています。
                  アバター登録時に性能値そのものを編集することはできません。
                </p>
              </div>

              {onStartCharacterRegistration && (
                <button
                  type="button"
                  onClick={() =>
                    onStartCharacterRegistration()
                  }
                  className="shrink-0 px-4 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black transition"
                >
                  ＋ キャラカードを登録する
                </button>
              )}
            </div>
          </div>

          <div className="p-6 space-y-6">
            <div className="p-4 bg-gray-50 rounded-2xl border border-gray-200 flex flex-wrap gap-3 items-center text-xs">
              <span className="font-black">
                🔍 絞り込み
              </span>

              <input
                value={
                  coordSearchFilter
                }
                onChange={(e) =>
                  setCoordSearchFilter(
                    e.target.value,
                  )
                }
                placeholder="a〜y / 傾向で検索"
                className="px-3 py-2.5 border border-gray-200 rounded-xl bg-white min-w-52 outline-none focus:border-indigo-400"
              />

              <select
                value={
                  coordArchetypeFilter
                }
                onChange={(e) =>
                  setCoordArchetypeFilter(
                    e.target.value,
                  )
                }
                className="px-3 py-2.5 border border-gray-200 rounded-xl bg-white"
              >
                <option value="ALL">
                  タイプ：すべて
                </option>
                <option value="マッスル型">
                  マッスル型
                </option>
                <option value="頭脳型">
                  頭脳型
                </option>
                <option value="ディーバ型">
                  ディーバ型
                </option>
                <option value="職人型">
                  職人型
                </option>
              </select>
            </div>

            <div className="overflow-x-auto rounded-2xl border border-gray-200">
              <div className="min-w-[760px]">
                <div className="grid grid-cols-5 bg-indigo-50 text-[10px] font-black text-indigo-900">
                  <div className="p-3">
                    1位 ＼ 2位
                  </div>

                  {(
                    [
                      'hp',
                      'intellect',
                      'dexterity',
                      'charm',
                    ] as StatKey[]
                  ).map(
                    (key) => (
                      <div
                        key={key}
                        className="p-3 text-center"
                      >
                        {
                          STAT_LABELS[
                            key
                          ]
                        }
                      </div>
                    ),
                  )}
                </div>

                {coordinateMatrix.map(
                  (row) => (
                    <div
                      key={
                        row.primary
                      }
                      className="grid grid-cols-5 border-t border-gray-200"
                    >
                      <div className="p-3 bg-gray-50 text-[10px] font-black">
                        {
                          STAT_LABELS[
                            row.primary
                          ]
                        }
                      </div>

                      {row.cells.map(
                        (
                          cell,
                          index,
                        ) => (
                          <div
                            key={`${row.primary}-${index}`}
                            className="min-h-24 border-l border-gray-200 p-1.5 space-y-1"
                          >
                            {cell.map(
                              (
                                coordinate,
                              ) => {
                                const count =
                                  getEntryCount(
                                    coordinate.id,
                                  );

                                const isFull =
                                  count >=
                                  maxEntryLimit;

                                return (
                                  <button
                                    key={
                                      coordinate.id
                                    }
                                    type="button"
                                    disabled={
                                      isFull
                                    }
                                    onClick={() => {
                                      if (
                                        !isFull
                                      ) {
                                        setActiveGenerator(
                                          {
                                            type: 'coordinate',
                                            preset:
                                              coordinate,
                                          },
                                        );
                                      }
                                    }}
                                    className={`w-full rounded-xl border px-2 py-2 text-left text-[9px] transition ${
                                      isFull
                                        ? 'border-gray-200 bg-gray-100 text-gray-400 cursor-not-allowed'
                                        : 'border-indigo-100 bg-white hover:border-indigo-400 hover:bg-indigo-50'
                                    }`}
                                  >
                                    <div className="font-black text-indigo-900">
                                      {coordinate.code.toUpperCase()}{' '}
                                      <span className="font-normal">
                                        {
                                          coordinate.tendency
                                        }
                                      </span>
                                    </div>

                                    <div className="text-gray-500 mt-0.5">
                                      {
                                        coordinate
                                          .stats
                                          .hp
                                      }
                                      /
                                      {
                                        coordinate
                                          .stats
                                          .intellect
                                      }
                                      /
                                      {
                                        coordinate
                                          .stats
                                          .dexterity
                                      }
                                      /
                                      {
                                        coordinate
                                          .stats
                                          .charm
                                      }
                                    </div>

                                    <div className="mt-1 font-bold">
                                      {count}/
                                      {
                                        maxEntryLimit
                                      }
                                      人
                                    </div>
                                  </button>
                                );
                              },
                            )}
                          </div>
                        ),
                      )}
                    </div>
                  ),
                )}

                <div className="border-t border-gray-200 p-2">
                  {(() => {
                    const y =
                      COORDINATE_PRESETS.find(
                        (
                          coordinate,
                        ) =>
                          coordinate.code ===
                          'y',
                      );

                    if (!y) {
                      return null;
                    }

                    const count =
                      getEntryCount(
                        y.id,
                      );

                    const isFull =
                      count >=
                      maxEntryLimit;

                    return (
                      <button
                        type="button"
                        disabled={
                          isFull
                        }
                        onClick={() => {
                          if (
                            !isFull
                          ) {
                            setActiveGenerator(
                              {
                                type: 'coordinate',
                                preset:
                                  y,
                              },
                            );
                          }
                        }}
                        className={`w-full rounded-xl border p-3 text-left text-xs transition ${
                          isFull
                            ? 'border-gray-200 bg-gray-100 text-gray-400 cursor-not-allowed'
                            : 'border-purple-200 bg-purple-50 hover:bg-purple-100'
                        }`}
                      >
                        <span className="font-black">
                          Y
                        </span>
                        ：体力＝知略＝器用＝特技
                        （均等型）
                        <span className="ml-2 font-bold">
                          {count}/
                          {
                            maxEntryLimit
                          }
                          人
                        </span>
                      </button>
                    );
                  })()}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredCoordinates.map(
                (coordinate) => {
                  const count =
                    getEntryCount(
                      coordinate.id,
                    );

                  const isFull =
                    count >=
                    maxEntryLimit;

                  const presetEntries =
                    entries.filter(
                      (entry) =>
                        entry.presetId ===
                        coordinate.id,
                    );

                  return (
                    <article
                      key={
                        coordinate.id
                      }
                      className="border border-gray-200 rounded-2xl p-5 bg-white shadow-sm space-y-4"
                    >
                      <div className="flex justify-between items-start gap-3">
                        <div>
                          <span className="text-xs font-black px-2.5 py-1 bg-indigo-100 text-indigo-800 rounded-lg">
                            {coordinate.code.toUpperCase()}
                          </span>

                          <h3 className="font-black text-lg mt-2">
                            {
                              coordinate.name
                            }
                          </h3>

                          <div className="text-[11px] text-indigo-700 font-bold mt-1">
                            傾向：
                            {
                              coordinate.tendency
                            }
                          </div>
                        </div>

                        <span className="text-[10px] font-black text-gray-400">
                          性能固定
                        </span>
                      </div>

                      <div className="text-[11px] bg-gray-50 p-3 rounded-xl border border-gray-200 grid grid-cols-2 gap-2">
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

                      <div className="text-[10px] bg-indigo-50/60 p-3 rounded-xl border border-indigo-100 space-y-1.5">
                        <div className="font-black text-indigo-800">
                          固定されている4技
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

                      <div className="text-xs space-y-2">
                        <div className="flex justify-between font-semibold">
                          <span>
                            エントリー状況
                          </span>

                          <span
                            className={
                              isFull
                                ? 'text-red-600'
                                : 'text-green-600'
                            }
                          >
                            {count} /{' '}
                            {
                              maxEntryLimit
                            }
                            人
                            {isFull &&
                              ' (満員)'}
                          </span>
                        </div>

                        {presetEntries.length >
                          0 && (
                          <div className="text-[11px] bg-indigo-50 p-3 rounded-xl border border-indigo-100 text-indigo-900">
                            <div>
                              👑 先駆者：
                              <span className="font-black">
                                {
                                  presetEntries[0]
                                    .userName
                                }
                              </span>{' '}
                              さん
                            </div>

                            <div className="text-gray-500 mt-0.5">
                              現在{' '}
                              {
                                presetEntries.length
                              }
                              人がエントリー
                            </div>
                          </div>
                        )}
                      </div>

                      <button
                        type="button"
                        disabled={
                          isFull
                        }
                        onClick={() => {
                          if (
                            !isFull
                          ) {
                            setActiveGenerator(
                              {
                                type: 'coordinate',
                                preset:
                                  coordinate,
                              },
                            );
                          }
                        }}
                        className={`w-full py-3 rounded-xl text-xs font-black transition ${
                          isFull
                            ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                            : 'bg-indigo-600 hover:bg-indigo-700 text-white'
                        }`}
                      >
                        {isFull
                          ? 'エントリー満員'
                          : 'このコーデからエントリーする'}
                      </button>
                    </article>
                  );
                },
              )}
            </div>
          </div>
        </section>
      )}

      {/* ===================================================== */}
      {/* エモーション一覧 */}
      {/* ===================================================== */}
      {activeTab ===
        'emotion' && (
        <section className="bg-white rounded-3xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="p-6 border-b border-gray-200">
            <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
              <div>
                <div className="text-xs font-black tracking-[0.15em] text-purple-500">
                  SUPPORT CARDS
                </div>

                <h2 className="mt-1 text-2xl font-black">
                  エモーション一覧
                </h2>

                <p className="mt-2 text-xs text-gray-500 leading-relaxed">
                  エモーションも公式に定義された効果枠から選択します。
                  対象・効果ステータス・持続性を見ながら登録できます。
                </p>
              </div>

              {onStartSupportRegistration && (
                <button
                  type="button"
                  onClick={() =>
                    onStartSupportRegistration()
                  }
                  className="shrink-0 px-4 py-3 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-black transition"
                >
                  ＋ サポートカードを登録する
                </button>
              )}
            </div>
          </div>

          <div className="p-6 space-y-6">
            <div className="p-4 bg-gray-50 rounded-2xl border border-gray-200 flex flex-wrap gap-3 items-center text-xs">
              <span className="font-black">
                🔍 3軸絞り込み
              </span>

              <select
                value={
                  emoTargetFilter
                }
                onChange={(e) =>
                  setEmoTargetFilter(
                    e.target.value,
                  )
                }
                className="px-3 py-2.5 border border-gray-200 rounded-xl bg-white"
              >
                <option value="ALL">
                  対象：すべて
                </option>
                <option value="自分">
                  自分
                </option>
                <option value="相手">
                  相手
                </option>
                <option value="自分・相手">
                  自分・相手
                </option>
              </select>

              <select
                value={
                  emoStatFilter
                }
                onChange={(e) =>
                  setEmoStatFilter(
                    e.target.value,
                  )
                }
                className="px-3 py-2.5 border border-gray-200 rounded-xl bg-white"
              >
                <option value="ALL">
                  効果：すべて
                </option>

                {Array.from(
                  new Set(
                    EMOTION_PRESETS.map(
                      (
                        emotion,
                      ) =>
                        emotion.effectCategory,
                    ),
                  ),
                ).map(
                  (category) => (
                    <option
                      key={
                        category
                      }
                      value={
                        category
                      }
                    >
                      {category}
                    </option>
                  ),
                )}
              </select>

              <select
                value={
                  emoDurationFilter
                }
                onChange={(e) =>
                  setEmoDurationFilter(
                    e.target.value,
                  )
                }
                className="px-3 py-2.5 border border-gray-200 rounded-xl bg-white"
              >
                <option value="ALL">
                  持続：すべて
                </option>
                <option value="一時">
                  一時
                </option>
                <option value="永続">
                  永続
                </option>
              </select>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredEmotions.map(
                (emotion) => {
                  const count =
                    getEntryCount(
                      emotion.id,
                    );

                  const isFull =
                    count >=
                    maxEntryLimit;

                  const presetEntries =
                    entries.filter(
                      (entry) =>
                        entry.presetId ===
                        emotion.id,
                    );

                  return (
                    <article
                      key={
                        emotion.id
                      }
                      className="border border-gray-200 rounded-2xl p-5 bg-white shadow-sm space-y-4"
                    >
                      <div>
                        <div className="flex flex-wrap gap-1.5">
                          <span className="text-xs font-bold px-2 py-1 bg-purple-100 text-purple-800 rounded">
                            {
                              emotion.target
                            }
                          </span>

                          <span className="text-xs font-bold px-2 py-1 bg-purple-100 text-purple-800 rounded">
                            {
                              emotion.effectCategory
                            }
                          </span>

                          <span className="text-xs font-bold px-2 py-1 bg-purple-100 text-purple-800 rounded">
                            {
                              emotion.duration
                            }
                          </span>
                        </div>

                        <h3 className="font-black text-lg mt-3">
                          {
                            emotion.name
                          }
                        </h3>

                        <p className="text-sm text-gray-600 leading-relaxed mt-2">
                          {
                            emotion.description
                          }
                        </p>

                        <div className="text-[11px] text-purple-800 font-semibold mt-2">
                          効果：
                          {
                            emotion.statEffect
                          }
                          {emotion.effectAmount
                            ? ` / ${emotion.effectAmount}`
                            : ''}
                        </div>

                        {emotion.note && (
                          <div className="text-[10px] text-gray-500 leading-relaxed mt-1">
                            備考：
                            {
                              emotion.note
                            }
                          </div>
                        )}
                      </div>

                      <div className="text-xs space-y-2">
                        <div className="flex justify-between font-semibold">
                          <span>
                            エントリー状況
                          </span>

                          <span
                            className={
                              isFull
                                ? 'text-red-600'
                                : 'text-green-600'
                            }
                          >
                            {count} /{' '}
                            {
                              maxEntryLimit
                            }
                            人
                            {isFull &&
                              ' (満員)'}
                          </span>
                        </div>

                        {presetEntries.length >
                          0 && (
                          <div className="text-[11px] bg-purple-50 p-3 rounded-xl border border-purple-100 text-purple-900">
                            <div>
                              👑 先駆者：
                              <span className="font-black">
                                {
                                  presetEntries[0]
                                    .userName
                                }
                              </span>{' '}
                              さん
                            </div>

                            <div className="text-gray-500 mt-0.5">
                              現在{' '}
                              {
                                presetEntries.length
                              }
                              人がエントリー
                            </div>
                          </div>
                        )}
                      </div>

                      <button
                        type="button"
                        disabled={
                          isFull
                        }
                        onClick={() => {
                          if (
                            !isFull
                          ) {
                            setActiveGenerator(
                              {
                                type: 'emotion',
                                preset:
                                  emotion,
                              },
                            );
                          }
                        }}
                        className={`w-full py-3 rounded-xl text-xs font-black transition ${
                          isFull
                            ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                            : 'bg-purple-600 hover:bg-purple-700 text-white'
                        }`}
                      >
                        {isFull
                          ? 'エントリー満員'
                          : 'このエモーションからエントリーする'}
                      </button>
                    </article>
                  );
                },
              )}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}