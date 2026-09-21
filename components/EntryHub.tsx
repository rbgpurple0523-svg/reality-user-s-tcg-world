'use client';

import React, { useMemo, useState } from 'react';
import CardGenerator from './CardGenerator';
import SupportCardGenerator from './SupportCardGenerator';
import { EMOTION_PRESETS } from './emotionPresets';
import type { EmotionPreset } from './emotionPresets';
import { COORDINATE_PRESETS } from './coordinatePresets';
import type { Archetype, CardColor, CoordinatePreset, Season } from './coordinatePresets';
import CoordinateRadialMap from './CoordinateRadialMap';

// =========================================================
// 型定義
// =========================================================
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
  onStartCharacterRegistration?: (
    preset?: CoordinatePreset,
  ) => void;
  onStartSupportRegistration?: (
    preset?: EmotionPreset,
  ) => void;
}

const ENTRIES_KEY = 'reality_world_entries';

// =========================================================
// コンポーネント
// =========================================================

export default function EntryHub({
  onBackToMenu,
  onGoToDeckBuilder,
  onStartCharacterRegistration,
  onStartSupportRegistration,
}: EntryHubProps) {
  const [
    libraryMode,
    setLibraryMode,
  ] = useState<
    'registered' | 'coordinate' | 'emotion'
  >('registered');

  const [
    registeredCardFilter,
    setRegisteredCardFilter,
  ] = useState<
    'all' | 'coordinate' | 'emotion'
  >('all');

  const [
    registeredSearchFilter,
    setRegisteredSearchFilter,
  ] = useState('');

  const [
    entries,
    setEntries,
  ] = useState<EntryRecord[]>(() => {
    if (
      typeof window ===
      'undefined'
    ) {
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



  const [
    emoTargetFilter,
    setEmoTargetFilter,
  ] = useState('ALL');

  const [
    emoStatFilter,
    setEmoStatFilter,
  ] = useState('ALL');

  const [
    emoDurationFilter,
    setEmoDurationFilter,
  ] = useState('ALL');

  const [
    activeGenerator,
    setActiveGenerator,
  ] = useState<{
    type:
      | 'coordinate'
      | 'emotion';
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

  // =========================================================
  // エントリー枠解放率
  // =========================================================

  const filledPresetCount =
    useMemo(
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

  // =========================================================
  // 登録済みカード
  // =========================================================

  const filteredRegisteredCards =
    useMemo(() => {
      const q =
        registeredSearchFilter
          .trim()
          .toLowerCase();

      return [
        ...entries,
      ]
        .filter((entry) => {
          if (
            registeredCardFilter !==
              'all' &&
            entry.cardType !==
              registeredCardFilter
          ) {
            return false;
          }

          if (!q) {
            return true;
          }

          const coordinate =
            entry.cardType ===
            'coordinate'
              ? COORDINATE_PRESETS.find(
                  (preset) =>
                    preset.id ===
                    entry.presetId,
                )
              : undefined;

          const emotion =
            entry.cardType ===
            'emotion'
              ? EMOTION_PRESETS.find(
                  (preset) =>
                    preset.id ===
                    entry.presetId,
                )
              : undefined;

          const searchable = [
            entry.userName,
            entry.profileUrl,
            coordinate?.name,
            coordinate?.code,
            coordinate?.tendency,
            emotion?.name,
            emotion?.effectCategory,
            emotion?.statEffect,
            emotion?.description,
            entry.customEffectName,
          ]
            .filter(Boolean)
            .join(' ')
            .toLowerCase();

          return searchable.includes(q);
        })
        .sort(
          (a, b) =>
            new Date(
              b.createdAt,
            ).getTime() -
            new Date(
              a.createdAt,
            ).getTime(),
        );
    }, [
      entries,
      registeredCardFilter,
      registeredSearchFilter,
    ]);

  const registeredCharacterCount =
    entries.filter(
      (entry) =>
        entry.cardType ===
        'coordinate',
    ).length;

  const registeredSupportCount =
    entries.filter(
      (entry) =>
        entry.cardType ===
        'emotion',
    ).length;

  // =========================================================
  // エモーション
  // =========================================================

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
  // 生成画面へ
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
                登録されたアバターカードを見たり、
                これから参加できる公式のコーデ・エモーション枠を探したりできます。
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

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 bg-gray-50 border-t border-gray-200">
          <div className="rounded-2xl bg-white border border-gray-200 p-4">
            <div className="text-[10px] font-bold text-gray-500">
              登録カード
            </div>
            <div className="mt-1 text-2xl font-black">
              {entries.length}
            </div>
          </div>

          <div className="rounded-2xl bg-white border border-gray-200 p-4">
            <div className="text-[10px] font-bold text-gray-500">
              キャラカード
            </div>
            <div className="mt-1 text-2xl font-black text-indigo-700">
              {registeredCharacterCount}
            </div>
          </div>

          <div className="rounded-2xl bg-white border border-gray-200 p-4">
            <div className="text-[10px] font-bold text-gray-500">
              サポートカード
            </div>
            <div className="mt-1 text-2xl font-black text-purple-700">
              {registeredSupportCount}
            </div>
          </div>

          <div className="rounded-2xl bg-white border border-gray-200 p-4">
            <div className="text-[10px] font-bold text-gray-500">
              現在のエントリー上限
            </div>
            <div className="mt-1 text-2xl font-black text-emerald-700">
              {maxEntryLimit}人
            </div>
          </div>
        </div>
      </section>

      {/* ===================================================== */}
      {/* ライブラリタブ */}
      {/* ===================================================== */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
        <button
          type="button"
          onClick={() =>
            setLibraryMode(
              'registered',
            )
          }
          className={`rounded-2xl px-4 py-4 text-sm font-black transition border ${
            libraryMode ===
            'registered'
              ? 'bg-slate-900 text-white border-slate-900 shadow-sm'
              : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
          }`}
        >
          👥 登録済みカード
          <span className="block mt-1 text-[10px] font-normal opacity-80">
            みんなのアバターを見る
          </span>
        </button>

        <button
          type="button"
          onClick={() =>
            setLibraryMode(
              'coordinate',
            )
          }
          className={`rounded-2xl px-4 py-4 text-sm font-black transition border ${
            libraryMode ===
            'coordinate'
              ? 'bg-indigo-900 text-white border-indigo-900 shadow-sm'
              : 'bg-white text-gray-700 border-gray-200 hover:bg-indigo-50'
          }`}
        >
          👤 コーデ枠
          <span className="block mt-1 text-[10px] font-normal opacity-80">
            キャラカードの性能枠
          </span>
        </button>

        <button
          type="button"
          onClick={() =>
            setLibraryMode(
              'emotion',
            )
          }
          className={`rounded-2xl px-4 py-4 text-sm font-black transition border ${
            libraryMode ===
            'emotion'
              ? 'bg-purple-900 text-white border-purple-900 shadow-sm'
              : 'bg-white text-gray-700 border-gray-200 hover:bg-purple-50'
          }`}
        >
          ✨ エモーション枠
          <span className="block mt-1 text-[10px] font-normal opacity-80">
            サポートカードの性能枠
          </span>
        </button>
      </div>

      {/* ===================================================== */}
      {/* 登録済みカード */}
      {/* ===================================================== */}
      {libraryMode ===
        'registered' && (
        <section className="bg-white rounded-3xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="p-6 border-b border-gray-200">
            <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
              <div>
                <div className="text-xs font-black tracking-[0.15em] text-slate-500">
                  REGISTERED CARDS
                </div>

                <h2 className="mt-1 text-2xl font-black">
                  登録済みカード
                </h2>

                <p className="mt-2 text-xs text-gray-500 leading-relaxed">
                  REALITYアバターが実際に登録されたカードを確認できます。
                  カードの性能そのものはここから変更できません。
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() =>
                    setRegisteredCardFilter(
                      'all',
                    )
                  }
                  className={`px-3 py-2 rounded-xl text-xs font-black border ${
                    registeredCardFilter ===
                    'all'
                      ? 'bg-slate-900 text-white border-slate-900'
                      : 'bg-white text-gray-600 border-gray-200'
                  }`}
                >
                  すべて
                </button>

                <button
                  type="button"
                  onClick={() =>
                    setRegisteredCardFilter(
                      'coordinate',
                    )
                  }
                  className={`px-3 py-2 rounded-xl text-xs font-black border ${
                    registeredCardFilter ===
                    'coordinate'
                      ? 'bg-indigo-600 text-white border-indigo-600'
                      : 'bg-white text-gray-600 border-gray-200'
                  }`}
                >
                  キャラカード
                </button>

                <button
                  type="button"
                  onClick={() =>
                    setRegisteredCardFilter(
                      'emotion',
                    )
                  }
                  className={`px-3 py-2 rounded-xl text-xs font-black border ${
                    registeredCardFilter ===
                    'emotion'
                      ? 'bg-purple-600 text-white border-purple-600'
                      : 'bg-white text-gray-600 border-gray-200'
                  }`}
                >
                  サポートカード
                </button>
              </div>
            </div>

            <div className="mt-4">
              <input
                type="text"
                value={
                  registeredSearchFilter
                }
                onChange={(e) =>
                  setRegisteredSearchFilter(
                    e.target.value,
                  )
                }
                placeholder="アバター名・コーデ・エモーションなどで検索"
                className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-gray-50 text-sm outline-none focus:border-indigo-400 focus:bg-white"
              />
            </div>
          </div>

          <div className="p-6">
            {filteredRegisteredCards.length ===
            0 ? (
              <div className="rounded-2xl border border-dashed border-gray-300 bg-gray-50 p-10 text-center">
                <div className="text-4xl">
                  🃏
                </div>

                <div className="mt-3 text-sm font-black text-gray-700">
                  まだ登録済みカードがありません
                </div>

                <div className="mt-1 text-xs text-gray-500">
                  最初のアバターカードを登録してみましょう。
                </div>

                <div className="mt-5 flex flex-wrap justify-center gap-2">
                  {onStartCharacterRegistration && (
                    <button
                      type="button"
                      onClick={() =>
                        onStartCharacterRegistration()
                      }
                      className="px-4 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black"
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
                      className="px-4 py-3 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-black"
                    >
                      ✨ サポートカードを登録
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                {filteredRegisteredCards.map(
                  (entry) => {
                    const coordinate =
                      entry.cardType ===
                      'coordinate'
                        ? COORDINATE_PRESETS.find(
                            (preset) =>
                              preset.id ===
                              entry.presetId,
                          )
                        : null;

                    const emotion =
                      entry.cardType ===
                      'emotion'
                        ? EMOTION_PRESETS.find(
                            (preset) =>
                              preset.id ===
                              entry.presetId,
                          )
                        : null;

                    return (
                      <article
                        key={entry.id}
                        className={`rounded-2xl border overflow-hidden shadow-sm ${
                          entry.cardType ===
                          'coordinate'
                            ? 'border-indigo-100 bg-indigo-50/30'
                            : 'border-purple-100 bg-purple-50/30'
                        }`}
                      >
                        <div className="aspect-[4/3] bg-gray-100 overflow-hidden">
                          {entry.imageDataUrl ? (
                            <img
                              src={
                                entry.imageDataUrl
                              }
                              alt={`${entry.userName}のカード画像`}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-5xl text-gray-300">
                              👤
                            </div>
                          )}
                        </div>

                        <div className="p-4 space-y-3">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <span
                                className={`inline-flex px-2 py-1 rounded-lg text-[10px] font-black ${
                                  entry.cardType ===
                                  'coordinate'
                                    ? 'bg-indigo-100 text-indigo-800'
                                    : 'bg-purple-100 text-purple-800'
                                }`}
                              >
                                {entry.cardType ===
                                'coordinate'
                                  ? 'キャラカード'
                                  : 'サポートカード'}
                              </span>

                              <h3 className="mt-2 text-lg font-black">
                                {entry.userName ||
                                  '名無しのアバター'}
                              </h3>
                            </div>

                            <span className="text-[10px] font-bold text-gray-400">
                              登録済み
                            </span>
                          </div>

                          {coordinate && (
                            <>
                              <div className="rounded-xl bg-white border border-indigo-100 p-3">
                                <div className="text-[10px] font-black text-indigo-500">
                                  コーデ
                                </div>

                                <div className="mt-1 text-sm font-black text-indigo-950">
                                  {coordinate.code.toUpperCase()}{' '}
                                  {coordinate.name}
                                </div>

                                <div className="mt-1 text-[10px] text-indigo-700">
                                  {
                                    coordinate.tendency
                                  }
                                </div>
                              </div>

                              <div className="grid grid-cols-2 gap-2 text-[10px]">
                                <div className="rounded-lg bg-white border p-2">
                                  体力：
                                  <b>
                                    {
                                      coordinate
                                        .stats
                                        .hp
                                    }
                                  </b>
                                </div>

                                <div className="rounded-lg bg-white border p-2">
                                  知略：
                                  <b>
                                    {
                                      coordinate
                                        .stats
                                        .intellect
                                    }
                                  </b>
                                </div>

                                <div className="rounded-lg bg-white border p-2">
                                  器用：
                                  <b>
                                    {
                                      coordinate
                                        .stats
                                        .dexterity
                                    }
                                  </b>
                                </div>

                                <div className="rounded-lg bg-white border p-2">
                                  特技：
                                  <b>
                                    {
                                      coordinate
                                        .stats
                                        .charm
                                    }
                                  </b>
                                </div>
                              </div>
                            </>
                          )}

                          {emotion && (
                            <div className="rounded-xl bg-white border border-purple-100 p-3">
                              <div className="flex flex-wrap gap-1.5">
                                <span className="px-2 py-1 rounded-lg bg-purple-100 text-purple-800 text-[10px] font-black">
                                  {
                                    emotion.target
                                  }
                                </span>

                                <span className="px-2 py-1 rounded-lg bg-purple-100 text-purple-800 text-[10px] font-black">
                                  {
                                    emotion.effectCategory
                                  }
                                </span>

                                <span className="px-2 py-1 rounded-lg bg-purple-100 text-purple-800 text-[10px] font-black">
                                  {
                                    emotion.duration
                                  }
                                </span>
                              </div>

                              <div className="mt-2 text-sm font-black text-purple-950">
                                {
                                  entry.customEffectName ||
                                  emotion.name
                                }
                              </div>

                              <div className="mt-1 text-[10px] text-purple-700">
                                {
                                  emotion.statEffect
                                }

                                {emotion.effectAmount
                                  ? ` / ${emotion.effectAmount}`
                                  : ''}
                              </div>

                              <div className="mt-2 text-[10px] text-gray-600 leading-relaxed">
                                {
                                  emotion.description
                                }
                              </div>
                            </div>
                          )}

                          {entry.profileUrl && (
                            <a
                              href={
                                entry.profileUrl
                              }
                              target="_blank"
                              rel="noreferrer"
                              className="block text-center rounded-xl border border-gray-200 bg-white hover:bg-gray-50 px-3 py-2 text-[10px] font-black text-gray-700"
                            >
                              REALITYプロフィールを見る ↗
                            </a>
                          )}
                        </div>
                      </article>
                    );
                  },
                )}
              </div>
            )}
          </div>
        </section>
      )}

      {/* ===================================================== */}
      {/* コーデ枠 */}
      {/* ===================================================== */}
      {libraryMode === 'coordinate' && (
        <section className="bg-white rounded-3xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="p-6 border-b border-gray-200">
            <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
              <div>
                <div className="text-xs font-black tracking-[0.15em] text-indigo-500">
                  CHARACTER CARDS
                </div>
                <h2 className="mt-1 text-2xl font-black">
                  キャラカード一覧
                </h2>
                <p className="mt-2 text-xs text-gray-500 leading-relaxed">
                  25種類のコーデをひとつのマップにまとめました。登録済みのアバターは各コーデ枠にアイコンで表示されます。
                  枠を選ぶと、下にコーデ性能と登録アバターの詳細が表示されます。
                </p>
              </div>

              {onStartCharacterRegistration && (
                <button
                  type="button"
                  onClick={() => onStartCharacterRegistration()}
                  className="shrink-0 px-4 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black transition"
                >
                  ＋ キャラカードを登録する
                </button>
              )}
            </div>
          </div>

          <div className="p-5 sm:p-6 space-y-5">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <div className="rounded-2xl bg-indigo-50 border border-indigo-100 p-3 text-center">
                <div className="text-[10px] text-indigo-500 font-bold">総コーデ</div>
                <div className="text-xl font-black text-indigo-900">{COORDINATE_PRESETS.length}</div>
              </div>
              <div className="rounded-2xl bg-green-50 border border-green-100 p-3 text-center">
                <div className="text-[10px] text-green-600 font-bold">登録あり</div>
                <div className="text-xl font-black text-green-900">
                  {COORDINATE_PRESETS.filter((preset) => getEntryCount(preset.id) > 0).length}
                </div>
              </div>
              <div className="rounded-2xl bg-gray-50 border border-gray-200 p-3 text-center">
                <div className="text-[10px] text-gray-500 font-bold">空きあり</div>
                <div className="text-xl font-black text-gray-900">
                  {COORDINATE_PRESETS.filter((preset) => getEntryCount(preset.id) < maxEntryLimit).length}
                </div>
              </div>
              <div className="rounded-2xl bg-purple-50 border border-purple-100 p-3 text-center">
                <div className="text-[10px] text-purple-500 font-bold">現在の上限</div>
                <div className="text-xl font-black text-purple-900">{maxEntryLimit}人</div>
              </div>
            </div>

            <CoordinateRadialMap
              coordinates={COORDINATE_PRESETS}
              entries={entries}
              maxEntryLimit={maxEntryLimit}
              mode="entry"
              onEntry={(coordinate) => {
                setActiveGenerator({
                  type: 'coordinate',
                  preset: coordinate,
                });
              }}
            />
          </div>
        </section>
      )}

      {/* ===================================================== */}
      {/* エモーション枠 */}
      {/* ===================================================== */}
      {libraryMode ===
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
                  エモーションは
                  `components/emotionPresets.ts`
                  の公式定義をそのまま表示しています。
                  ここから選んでサポートカード登録へ進みます。
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
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <div className="rounded-xl bg-purple-50 border border-purple-100 p-3 text-center">
                <div className="text-[10px] text-purple-500 font-bold">
                  総枠
                </div>

                <div className="text-xl font-black text-purple-900">
                  {
                    EMOTION_PRESETS.length
                  }
                </div>
              </div>

              <div className="rounded-xl bg-green-50 border border-green-100 p-3 text-center">
                <div className="text-[10px] text-green-600 font-bold">
                  空きあり
                </div>

                <div className="text-xl font-black text-green-900">
                  {
                    EMOTION_PRESETS.filter(
                      (preset) =>
                        getEntryCount(
                          preset.id,
                        ) <
                        maxEntryLimit,
                    ).length
                  }
                </div>
              </div>

              <div className="rounded-xl bg-red-50 border border-red-100 p-3 text-center">
                <div className="text-[10px] text-red-600 font-bold">
                  満員
                </div>

                <div className="text-xl font-black text-red-900">
                  {
                    EMOTION_PRESETS.filter(
                      (preset) =>
                        getEntryCount(
                          preset.id,
                        ) >=
                        maxEntryLimit,
                    ).length
                  }
                </div>
              </div>

              <div className="rounded-xl bg-gray-50 border border-gray-200 p-3 text-center">
                <div className="text-[10px] text-gray-500 font-bold">
                  現在の上限
                </div>

                <div className="text-xl font-black text-gray-900">
                  {maxEntryLimit}人
                </div>
              </div>
            </div>

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
                (
                  emotion,
                ) => {
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
                          <span className="text-xs font-black px-2 py-1 bg-purple-100 text-purple-800 rounded-lg">
                            {
                              emotion.target
                            }
                          </span>

                          <span className="text-xs font-black px-2 py-1 bg-purple-100 text-purple-800 rounded-lg">
                            {
                              emotion.effectCategory
                            }
                          </span>

                          <span className="text-xs font-black px-2 py-1 bg-purple-100 text-purple-800 rounded-lg">
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