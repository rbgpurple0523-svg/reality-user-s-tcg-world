'use client';

import React, { useMemo, useState } from 'react';
import type {
  CoordinatePreset,
  EntryRecord,
  StatKey,
} from './EntryHub';

interface CoordinateRadialMapProps {
  coordinates: CoordinatePreset[];
  entries: EntryRecord[];
  maxEntryLimit: number;
  onSelect?: (
    coordinate: CoordinatePreset,
  ) => void;
}

const STAT_LABELS: Record<StatKey, string> = {
  hp: '体力',
  intellect: '知略',
  dexterity: '器用',
  charm: '特技',
};

const RADIAL_ORDER: string[] = [
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
];

const ANGLES: number[] = [
  240,
  255,
  270,
  285,
  300,
  315,

  330,
  345,
  0,
  15,
  30,
  45,

  60,
  75,
  90,
  105,
  120,
  135,

  150,
  165,
  180,
  195,
  210,
  225,
];

const PRIMARY_STYLES: Record<
  StatKey,
  {
    node: string;
    badge: string;
    line: string;
  }
> = {
  hp: {
    node:
      'border-red-200 bg-red-50 hover:bg-red-100',
    badge:
      'bg-red-100 text-red-800',
    line: 'bg-red-300',
  },
  intellect: {
    node:
      'border-blue-200 bg-blue-50 hover:bg-blue-100',
    badge:
      'bg-blue-100 text-blue-800',
    line: 'bg-blue-300',
  },
  dexterity: {
    node:
      'border-amber-200 bg-amber-50 hover:bg-amber-100',
    badge:
      'bg-amber-100 text-amber-800',
    line: 'bg-amber-300',
  },
  charm: {
    node:
      'border-purple-200 bg-purple-50 hover:bg-purple-100',
    badge:
      'bg-purple-100 text-purple-800',
    line: 'bg-purple-300',
  },
};

function getPrimaryStat(
  coordinate: CoordinatePreset,
): StatKey {
  const values: Record<
    StatKey,
    number
  > = {
    hp: coordinate.stats.hp,
    intellect:
      coordinate.stats.intellect,
    dexterity:
      coordinate.stats.dexterity,
    charm: coordinate.stats.charm,
  };

  const sorted = (
    Object.entries(
      values,
    ) as [StatKey, number][]
  ).sort(
    (a, b) => b[1] - a[1],
  );

  return sorted[0][0];
}

function getRankLabel(
  coordinate: CoordinatePreset,
): string {
  const pairs: [
    string,
    number,
  ][] = [
    ['体力', coordinate.stats.hp],
    [
      '知略',
      coordinate.stats.intellect,
    ],
    [
      '器用',
      coordinate.stats.dexterity,
    ],
    [
      '特技',
      coordinate.stats.charm,
    ],
  ];

  return [...pairs]
    .sort(
      (a, b) => b[1] - a[1],
    )
    .map(
      ([label]) => label,
    )
    .join(' ＞ ');
}

function getShortRankLabel(
  coordinate: CoordinatePreset,
): string {
  const pairs: [
    string,
    number,
  ][] = [
    ['体', coordinate.stats.hp],
    [
      '知',
      coordinate.stats.intellect,
    ],
    [
      '器',
      coordinate.stats.dexterity,
    ],
    [
      '特',
      coordinate.stats.charm,
    ],
  ];

  return [...pairs]
    .sort(
      (a, b) => b[1] - a[1],
    )
    .map(
      ([label]) => label,
    )
    .join(' ＞ ');
}

export default function CoordinateRadialMap({
  coordinates,
  entries,
  maxEntryLimit,
  onSelect,
}: CoordinateRadialMapProps) {
  const [
    selectedCode,
    setSelectedCode,
  ] = useState<string>('y');

  const coordinateByCode =
    useMemo(
      () =>
        new Map(
          coordinates.map(
            (coordinate) => [
              coordinate.code,
              coordinate,
            ],
          ),
        ),
      [coordinates],
    );

  const selectedCoordinate =
    useMemo(
      () =>
        coordinateByCode.get(
          selectedCode,
        ) ??
        coordinateByCode.get(
          'y',
        ) ??
        coordinates[0] ??
        null,
      [
        coordinateByCode,
        coordinates,
        selectedCode,
      ],
    );

  const selectedEntries =
    selectedCoordinate
      ? entries.filter(
          (entry) =>
            entry.presetId ===
            selectedCoordinate.id,
        )
      : [];

  const selectedCount =
    selectedEntries.length;

  const selectedIsFull =
    selectedCount >=
    maxEntryLimit;

  const handleSelect =
    (
      coordinate: CoordinatePreset,
    ) => {
      setSelectedCode(
        coordinate.code,
      );
    };

  return (
    <div className="space-y-5">
      {/* ================================================= */}
      {/* 配置図 */}
      {/* ================================================= */}
      <div className="rounded-3xl border border-gray-200 bg-gradient-to-b from-gray-50 to-white p-3 sm:p-5">
        <div className="flex items-center justify-between gap-3 px-2 pb-3">
          <div>
            <div className="text-xs font-black tracking-[0.15em] text-indigo-500">
              COORDINATE MAP
            </div>

            <h3 className="text-lg sm:text-xl font-black text-gray-900">
              コーデ配置図
            </h3>
          </div>

          <div className="text-[10px] text-gray-500 text-right">
            中央＝均等型
            <br />
            周囲＝24種類の順位型
          </div>
        </div>

        <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white">
          <div className="relative min-w-[760px] h-[680px]">
            {/* 同心円 */}
            <div className="absolute left-1/2 top-1/2 w-[560px] h-[560px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-dashed border-gray-200 pointer-events-none" />

            <div className="absolute left-1/2 top-1/2 w-[430px] h-[430px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-dashed border-gray-100 pointer-events-none" />

            {/* ================================================= */}
            {/* 放射線 */}
            {/* ================================================= */}
            {RADIAL_ORDER.map(
              (code, index) => {
                const coordinate =
                  coordinateByCode.get(
                    code,
                  );

                if (!coordinate) {
                  return null;
                }

                const primary =
                  getPrimaryStat(
                    coordinate,
                  );

                const styles =
                  PRIMARY_STYLES[
                    primary
                  ];

                return (
                  <div
                    key={`line-${coordinate.id}`}
                    className={`absolute left-1/2 top-1/2 h-px w-[300px] origin-left ${styles.line} opacity-60 pointer-events-none`}
                    style={{
                      transform:
                        `rotate(${ANGLES[index]}deg)`,
                    }}
                  />
                );
              },
            )}

            {/* ================================================= */}
            {/* 方向ラベル */}
            {/* ================================================= */}
            <div className="absolute left-1/2 top-5 -translate-x-1/2 text-[11px] font-black text-gray-400">
              体力寄り
            </div>

            <div className="absolute right-5 top-1/2 -translate-y-1/2 text-[11px] font-black text-gray-400">
              知略寄り
            </div>

            <div className="absolute left-1/2 bottom-5 -translate-x-1/2 text-[11px] font-black text-gray-400">
              器用寄り
            </div>

            <div className="absolute left-5 top-1/2 -translate-y-1/2 text-[11px] font-black text-gray-400">
              特技寄り
            </div>

            {/* ================================================= */}
            {/* 24コーデ */}
            {/* ================================================= */}
            {RADIAL_ORDER.map(
              (code, index) => {
                const coordinate =
                  coordinateByCode.get(
                    code,
                  );

                if (!coordinate) {
                  return null;
                }

                const count =
                  entries.filter(
                    (entry) =>
                      entry.presetId ===
                      coordinate.id,
                  ).length;

                const isSelected =
                  selectedCode ===
                  coordinate.code;

                const primary =
                  getPrimaryStat(
                    coordinate,
                  );

                const styles =
                  PRIMARY_STYLES[
                    primary
                  ];

                return (
                  <button
                    key={coordinate.id}
                    type="button"
                    onClick={() =>
                      handleSelect(
                        coordinate,
                      )
                    }
                    title={`${coordinate.code.toUpperCase()}：${getRankLabel(coordinate)} / ${count}/${maxEntryLimit}人`}
                    className={`absolute left-1/2 top-1/2 w-[108px] -translate-x-1/2 -translate-y-1/2 rounded-2xl border-2 px-2 py-2 text-left shadow-sm transition cursor-pointer ${styles.node} ${
                      isSelected
                        ? 'ring-4 ring-indigo-200 scale-105 z-20'
                        : 'hover:scale-105'
                    }`}
                    style={{
                      transform:
                        `translate(-50%, -50%) rotate(${ANGLES[index]}deg) translateX(300px) rotate(-${ANGLES[index]}deg)`,
                    }}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span
                        className={`inline-flex items-center rounded-lg px-2 py-0.5 text-[10px] font-black ${styles.badge}`}
                      >
                        {coordinate.code.toUpperCase()}
                      </span>

                      <span className="text-[9px] font-black text-gray-500">
                        {count}/
                        {maxEntryLimit}
                      </span>
                    </div>

                    <div className="mt-1 text-[10px] font-black text-gray-800 leading-tight">
                      {getShortRankLabel(
                        coordinate,
                      )}
                    </div>

                    <div className="mt-1 text-[8px] text-gray-500 leading-tight">
                      {coordinate.tendency.replaceAll(
                        ' ＞ ',
                        '→',
                      )}
                    </div>
                  </button>
                );
              },
            )}

            {/* ================================================= */}
            {/* 中央：均等型 */}
            {/* ================================================= */}
            {(() => {
              const center =
                coordinateByCode.get(
                  'y',
                );

              if (!center) {
                return null;
              }

              const count =
                entries.filter(
                  (entry) =>
                    entry.presetId ===
                    center.id,
                ).length;

              const isSelected =
                selectedCode === 'y';

              return (
                <button
                  type="button"
                  onClick={() =>
                    handleSelect(
                      center,
                    )
                  }
                  title={`Y：体力＝知略＝器用＝特技 / ${count}/${maxEntryLimit}人`}
                  className={`absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-30 w-[145px] h-[145px] rounded-full border-4 border-indigo-300 bg-white shadow-xl transition cursor-pointer ${
                    isSelected
                      ? 'ring-4 ring-indigo-200 scale-105'
                      : 'hover:scale-105'
                  }`}
                >
                  <div className="text-[10px] font-black tracking-[0.18em] text-indigo-500">
                    BALANCE
                  </div>

                  <div className="mt-1 text-4xl font-black text-indigo-950">
                    均
                  </div>

                  <div className="mt-1 text-[9px] font-black text-gray-500">
                    体力＝知略＝器用＝特技
                  </div>

                  <div className="mt-2 text-[10px] font-black text-indigo-700">
                    {count}/
                    {maxEntryLimit}人
                  </div>
                </button>
              );
            })()}
          </div>
        </div>
      </div>

      {/* ================================================= */}
      {/* 選択中コーデ詳細 */}
      {/* ================================================= */}
      {selectedCoordinate && (
        <section className="rounded-3xl border border-indigo-200 bg-indigo-50 p-5">
          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
            <div>
              <div className="text-[10px] font-black tracking-[0.15em] text-indigo-500">
                SELECTED COORDINATE
              </div>

              <div className="mt-1 flex items-center gap-2">
                <span className="inline-flex rounded-lg bg-indigo-100 px-2.5 py-1 text-xs font-black text-indigo-800">
                  {selectedCoordinate.code.toUpperCase()}
                </span>

                <h4 className="text-xl font-black text-indigo-950">
                  {
                    selectedCoordinate.name
                  }
                </h4>
              </div>

              <div className="mt-2 text-sm font-black text-indigo-900">
                {getRankLabel(
                  selectedCoordinate,
                )}
              </div>
            </div>

            <div className="text-left md:text-right">
              <div className="text-[10px] font-bold text-gray-500">
                エントリー状況
              </div>

              <div className="mt-1 text-xl font-black text-indigo-900">
                {selectedCount} /{' '}
                {maxEntryLimit}人
              </div>
            </div>
          </div>

          {/* ステータス */}
          <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-2">
            <div className="rounded-xl bg-white border border-indigo-100 p-3">
              <div className="text-[10px] text-gray-500">
                体力
              </div>

              <div className="text-lg font-black">
                {
                  selectedCoordinate.stats
                    .hp
                }
              </div>
            </div>

            <div className="rounded-xl bg-white border border-indigo-100 p-3">
              <div className="text-[10px] text-gray-500">
                知略
              </div>

              <div className="text-lg font-black">
                {
                  selectedCoordinate
                    .stats.intellect
                }
              </div>
            </div>

            <div className="rounded-xl bg-white border border-indigo-100 p-3">
              <div className="text-[10px] text-gray-500">
                器用
              </div>

              <div className="text-lg font-black">
                {
                  selectedCoordinate
                    .stats.dexterity
                }
              </div>
            </div>

            <div className="rounded-xl bg-white border border-indigo-100 p-3">
              <div className="text-[10px] text-gray-500">
                特技
              </div>

              <div className="text-lg font-black">
                {
                  selectedCoordinate
                    .stats.charm
                }
              </div>
            </div>
          </div>

          {/* 4技 */}
          <div className="mt-4 rounded-2xl bg-white border border-indigo-100 p-4">
            <div className="text-[10px] font-black text-indigo-600">
              固定4技
            </div>

            <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-2">
              {selectedCoordinate.defaultSkills.map(
                (
                  skill,
                  index,
                ) => (
                  <div
                    key={`${selectedCoordinate.id}-detail-${index}`}
                    className="rounded-xl bg-gray-50 border border-gray-200 p-3"
                  >
                    <div className="text-[11px] font-black">
                      技{index + 1}{' '}
                      {skill}
                    </div>

                    <div className="mt-1 text-[10px] text-gray-600 leading-relaxed">
                      {
                        selectedCoordinate
                          .skillDescriptions[
                          index
                        ]
                      }
                    </div>
                  </div>
                ),
              )}
            </div>
          </div>

          {/* 登録済みアバター */}
          {selectedEntries.length >
            0 && (
            <div className="mt-4 rounded-2xl bg-white border border-indigo-100 p-4">
              <div className="text-[10px] font-black text-gray-500">
                このコーデに登録されているアバター
              </div>

              <div className="mt-2 flex flex-wrap gap-2">
                {selectedEntries.map(
                  (entry) => (
                    <div
                      key={entry.id}
                      className="flex items-center gap-2 rounded-xl bg-indigo-50 border border-indigo-100 px-3 py-2"
                    >
                      {entry.imageDataUrl ? (
                        <img
                          src={
                            entry.imageDataUrl
                          }
                          alt=""
                          className="w-8 h-8 rounded-lg object-cover border border-indigo-100"
                        />
                      ) : (
                        <div className="w-8 h-8 rounded-lg bg-white flex items-center justify-center">
                          👤
                        </div>
                      )}

                      <span className="text-xs font-black text-indigo-900">
                        {
                          entry.userName
                        }
                      </span>
                    </div>
                  ),
                )}
              </div>
            </div>
          )}

          {/* 登録ボタン */}
          {onSelect && (
            <div className="mt-4">
              <button
                type="button"
                disabled={
                  selectedIsFull
                }
                onClick={() => {
                  if (
                    !selectedIsFull
                  ) {
                    onSelect(
                      selectedCoordinate,
                    );
                  }
                }}
                className={`w-full rounded-xl px-4 py-3 text-xs font-black transition ${
                  selectedIsFull
                    ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                    : 'bg-indigo-600 hover:bg-indigo-700 text-white'
                }`}
              >
                {selectedIsFull
                  ? 'このコーデはエントリー満員'
                  : 'このコーデでエントリーする'}
              </button>
            </div>
          )}
        </section>
      )}
    </div>
  );
}