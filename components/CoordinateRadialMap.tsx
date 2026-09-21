'use client';

import React, { useMemo, useState } from 'react';
import type {
  CoordinatePreset,
  EntryRecord,
} from './EntryHub';

interface CoordinateRadialMapProps {
  coordinates: CoordinatePreset[];
  entries: EntryRecord[];
  maxEntryLimit: number;
  onSelect?: (
    coordinate: CoordinatePreset,
  ) => void;
}

type StatKey =
  | 'hp'
  | 'intellect'
  | 'dexterity'
  | 'charm';

const STAT_LABELS: Record<
  StatKey,
  string
> = {
  hp: '体力',
  intellect: '知略',
  dexterity: '器用',
  charm: '特技',
};

const STAT_SHORT: Record<
  StatKey,
  string
> = {
  hp: '体',
  intellect: '知',
  dexterity: '器',
  charm: '特',
};

/*
 * 北西境界から時計回り。
 *
 * 北側：
 * 体力＞特技
 * 体力＞器用
 * 体力＞知略
 * 知略＞体力
 * 知略＞器用
 * 知略＞特技
 *
 * という「1位・2位の近さ」が連続するように配置する。
 *
 * 実際には既存の a〜x が以下に対応する。
 */
const RADIAL_CODES = [
  // 北西 → 北 → 北東
  'f',
  'e',
  'c',
  'd',
  'b',
  'a',

  // 北東 → 東 → 南東
  'l',
  'k',
  'j',
  'i',
  'h',
  'g',

  // 南東 → 南 → 南西
  'r',
  'q',
  'p',
  'o',
  'n',
  'm',

  // 南西 → 西 → 北西
  'x',
  'w',
  'v',
  'u',
  't',
  's',
] as const;

/*
 * SVGの角度。
 *
 * 0 = 東
 * 90 = 南
 * 180 = 西
 * 270 = 北
 *
 * 225°からスタートすると、
 * 北西境界 → 北 → 北東境界
 * という配置になる。
 */
const START_ANGLE = 225;
const SLICE_ANGLE = 15;

const OUTER_RADIUS = 270;
const INNER_RADIUS = 118;

const PRIMARY_STYLES: Record<
  StatKey,
  {
    fill: string;
    stroke: string;
    text: string;
  }
> = {
  hp: {
    fill: '#fee2e2',
    stroke: '#fca5a5',
    text: '#991b1b',
  },
  intellect: {
    fill: '#dbeafe',
    stroke: '#93c5fd',
    text: '#1e40af',
  },
  dexterity: {
    fill: '#fef3c7',
    stroke: '#fcd34d',
    text: '#92400e',
  },
  charm: {
    fill: '#f3e8ff',
    stroke: '#d8b4fe',
    text: '#6b21a8',
  },
};

function polarToCartesian(
  centerX: number,
  centerY: number,
  radius: number,
  angleInDegrees: number,
) {
  const angleInRadians =
    (angleInDegrees * Math.PI) /
    180;

  return {
    x:
      centerX +
      radius *
        Math.cos(
          angleInRadians,
        ),
    y:
      centerY +
      radius *
        Math.sin(
          angleInRadians,
        ),
  };
}

function describeArc(
  centerX: number,
  centerY: number,
  innerRadius: number,
  outerRadius: number,
  startAngle: number,
  endAngle: number,
) {
  const outerStart =
    polarToCartesian(
      centerX,
      centerY,
      outerRadius,
      startAngle,
    );

  const outerEnd =
    polarToCartesian(
      centerX,
      centerY,
      outerRadius,
      endAngle,
    );

  const innerStart =
    polarToCartesian(
      centerX,
      centerY,
      innerRadius,
      startAngle,
    );

  const innerEnd =
    polarToCartesian(
      centerX,
      centerY,
      innerRadius,
      endAngle,
    );

  const largeArcFlag =
    endAngle - startAngle >
    180
      ? 1
      : 0;

  return [
    `M ${innerStart.x} ${innerStart.y}`,
    `L ${outerStart.x} ${outerStart.y}`,
    `A ${outerRadius} ${outerRadius} 0 ${largeArcFlag} 1 ${outerEnd.x} ${outerEnd.y}`,
    `L ${innerEnd.x} ${innerEnd.y}`,
    `A ${innerRadius} ${innerRadius} 0 ${largeArcFlag} 0 ${innerStart.x} ${innerStart.y}`,
    'Z',
  ].join(' ');
}

function getStatsRank(
  coordinate: CoordinatePreset,
): StatKey[] {
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

  return (
    Object.entries(
      values,
    ) as [
      StatKey,
      number,
    ][]
  )
    .sort(
      (a, b) => b[1] - a[1],
    )
    .map(
      ([key]) => key,
    );
}

function getRankText(
  coordinate: CoordinatePreset,
): string {
  return getStatsRank(
    coordinate,
  )
    .map(
      (key) => STAT_LABELS[key],
    )
    .join(' ＞ ');
}

function getShortRankText(
  coordinate: CoordinatePreset,
): string {
  return getStatsRank(
    coordinate,
  )
    .map(
      (key) => STAT_SHORT[key],
    )
    .join(' ＞ ');
}

function getPrimaryStat(
  coordinate: CoordinatePreset,
): StatKey {
  return getStatsRank(
    coordinate,
  )[0];
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

  const coordinateMap =
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
        coordinateMap.get(
          selectedCode,
        ) ??
        coordinateMap.get(
          'y',
        ) ??
        coordinates[0] ??
        null,
      [
        coordinateMap,
        selectedCode,
        coordinates,
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

  const selectCoordinate = (
    coordinate: CoordinatePreset,
  ) => {
    setSelectedCode(
      coordinate.code,
    );
  };

  const handleEntryClick = () => {
    if (
      selectedCoordinate &&
      !selectedIsFull
    ) {
      onSelect?.(
        selectedCoordinate,
      );
    }
  };

  const center = 350;

  return (
    <div className="space-y-6">
      {/* ================================================= */}
      {/* 配置図本体 */}
      {/* ================================================= */}
      <div className="rounded-3xl border border-gray-200 bg-white shadow-sm overflow-hidden">
        <div className="p-5 sm:p-6 bg-gradient-to-b from-gray-50 to-white border-b border-gray-200">
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
            <div>
              <div className="text-xs font-black tracking-[0.2em] text-indigo-500">
                COORDINATE MAP
              </div>

              <h3 className="mt-1 text-2xl font-black text-gray-900">
                25種類のコーデ配置図
              </h3>

              <p className="mt-2 text-xs text-gray-500 leading-relaxed">
                中央の「均等型」を中心に、
                4ステータスの順位による24種類を15°ずつ配置しています。
              </p>
            </div>

            <div className="text-[10px] text-gray-500 leading-relaxed sm:text-right">
              北西・北東・南東・南西が
              <br />
              ステータスの入れ替わりライン
            </div>
          </div>
        </div>

        <div className="p-2 sm:p-4 bg-gray-50">
          <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white">
            <div className="min-w-[720px] flex justify-center py-4">
              <svg
                width="700"
                height="700"
                viewBox="0 0 700 700"
                className="max-w-full h-auto"
                role="img"
                aria-label="24種類のコーデ配置図"
              >
                {/* ================================ */}
                {/* 外周リング */}
                {/* ================================ */}
                <circle
                  cx={center}
                  cy={center}
                  r={OUTER_RADIUS}
                  fill="none"
                  stroke="#e5e7eb"
                  strokeWidth="1"
                />

                <circle
                  cx={center}
                  cy={center}
                  r={INNER_RADIUS}
                  fill="white"
                  stroke="#c7d2fe"
                  strokeWidth="2"
                />

                {/* ================================ */}
                {/* 4方向のガイド */}
                {/* ================================ */}
                <text
                  x={center}
                  y={22}
                  textAnchor="middle"
                  fontSize="12"
                  fontWeight="800"
                  fill="#9ca3af"
                >
                  体力
                </text>

                <text
                  x={678}
                  y={center + 4}
                  textAnchor="end"
                  fontSize="12"
                  fontWeight="800"
                  fill="#9ca3af"
                >
                  知略
                </text>

                <text
                  x={center}
                  y={688}
                  textAnchor="middle"
                  fontSize="12"
                  fontWeight="800"
                  fill="#9ca3af"
                >
                  器用
                </text>

                <text
                  x={22}
                  y={center + 4}
                  textAnchor="start"
                  fontSize="12"
                  fontWeight="800"
                  fill="#9ca3af"
                >
                  特技
                </text>

                {/* ================================ */}
                {/* 24スライス */}
                {/* ================================ */}
                {RADIAL_CODES.map(
                  (code, index) => {
                    const coordinate =
                      coordinateMap.get(
                        code,
                      );

                    if (!coordinate) {
                      return null;
                    }

                    const startAngle =
                      START_ANGLE +
                      index *
                        SLICE_ANGLE;

                    const endAngle =
                      startAngle +
                      SLICE_ANGLE;

                    const middleAngle =
                      startAngle +
                      SLICE_ANGLE /
                        2;

                    const labelRadius =
                      (OUTER_RADIUS +
                        INNER_RADIUS) /
                      2;

                    const labelPoint =
                      polarToCartesian(
                        center,
                        center,
                        labelRadius,
                        middleAngle,
                      );

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

                    const color =
                      PRIMARY_STYLES[
                        primary
                      ];

                    const path =
                      describeArc(
                        center,
                        center,
                        INNER_RADIUS,
                        OUTER_RADIUS,
                        startAngle,
                        endAngle,
                      );

                    return (
                      <g
                        key={
                          coordinate.id
                        }
                      >
                        <path
                          d={path}
                          fill={
                            isSelected
                              ? '#eef2ff'
                              : color.fill
                          }
                          stroke={
                            isSelected
                              ? '#6366f1'
                              : color.stroke
                          }
                          strokeWidth={
                            isSelected
                              ? 3
                              : 1.5
                          }
                          className="cursor-pointer transition-opacity hover:opacity-80"
                          role="button"
                          tabIndex={0}
                          aria-label={`${coordinate.code.toUpperCase()} ${getRankText(coordinate)} / ${count}/${maxEntryLimit}人`}
                          onClick={() =>
                            selectCoordinate(
                              coordinate,
                            )
                          }
                          onKeyDown={(
                            event,
                          ) => {
                            if (
                              event.key ===
                                'Enter' ||
                              event.key ===
                                ' '
                            ) {
                              event.preventDefault();
                              selectCoordinate(
                                coordinate,
                              );
                            }
                          }}
                        />

                        {/* コード */}
                        <text
                          x={
                            labelPoint.x
                          }
                          y={
                            labelPoint.y -
                            5
                          }
                          textAnchor="middle"
                          dominantBaseline="middle"
                          fontSize="18"
                          fontWeight="900"
                          fill={
                            color.text
                          }
                          pointerEvents="none"
                        >
                          {coordinate.code.toUpperCase()}
                        </text>

                        {/* 登録数 */}
                        <text
                          x={
                            labelPoint.x
                          }
                          y={
                            labelPoint.y +
                            14
                          }
                          textAnchor="middle"
                          dominantBaseline="middle"
                          fontSize="9"
                          fontWeight="800"
                          fill="#6b7280"
                          pointerEvents="none"
                        >
                          {count}/
                          {
                            maxEntryLimit
                          }
                        </text>
                      </g>
                    );
                  },
                )}

                {/* ================================ */}
                {/* 4本の入れ替えライン */}
                {/* ================================ */}
                {[45, 135, 225, 315].map(
                  (angle) => {
                    const start =
                      polarToCartesian(
                        center,
                        center,
                        INNER_RADIUS,
                        angle,
                      );

                    const end =
                      polarToCartesian(
                        center,
                        center,
                        OUTER_RADIUS,
                        angle,
                      );

                    return (
                      <line
                        key={`axis-${angle}`}
                        x1={start.x}
                        y1={start.y}
                        x2={end.x}
                        y2={end.y}
                        stroke="#9ca3af"
                        strokeWidth="1"
                        strokeDasharray="4 4"
                        opacity="0.55"
                        pointerEvents="none"
                      />
                    );
                  },
                )}

                {/* ================================ */}
                {/* 中央：均等型 */}
                {/* ================================ */}
                {(() => {
                  const centerPreset =
                    coordinateMap.get(
                      'y',
                    );

                  if (!centerPreset) {
                    return null;
                  }

                  const count =
                    entries.filter(
                      (entry) =>
                        entry.presetId ===
                        centerPreset.id,
                    ).length;

                  const isSelected =
                    selectedCode ===
                    'y';

                  return (
                    <g
                      className="cursor-pointer"
                      role="button"
                      tabIndex={0}
                      aria-label={`Y 均等型 / ${count}/${maxEntryLimit}人`}
                      onClick={() =>
                        selectCoordinate(
                          centerPreset,
                        )
                      }
                      onKeyDown={(
                        event,
                      ) => {
                        if (
                          event.key ===
                            'Enter' ||
                          event.key ===
                            ' '
                        ) {
                          event.preventDefault();

                          selectCoordinate(
                            centerPreset,
                          );
                        }
                      }}
                    >
                      <circle
                        cx={center}
                        cy={center}
                        r={INNER_RADIUS - 5}
                        fill="#ffffff"
                        stroke={
                          isSelected
                            ? '#6366f1'
                            : '#a5b4fc'
                        }
                        strokeWidth={
                          isSelected
                            ? 5
                            : 3
                        }
                      />

                      <text
                        x={center}
                        y={center - 23}
                        textAnchor="middle"
                        fontSize="11"
                        fontWeight="900"
                        fill="#6366f1"
                        letterSpacing="2"
                      >
                        BALANCE
                      </text>

                      <text
                        x={center}
                        y={center + 19}
                        textAnchor="middle"
                        fontSize="48"
                        fontWeight="900"
                        fill="#1e1b4b"
                      >
                        均
                      </text>

                      <text
                        x={center}
                        y={center + 42}
                        textAnchor="middle"
                        fontSize="10"
                        fontWeight="800"
                        fill="#6b7280"
                      >
                        体力＝知略＝器用＝特技
                      </text>

                      <text
                        x={center}
                        y={center + 60}
                        textAnchor="middle"
                        fontSize="10"
                        fontWeight="900"
                        fill="#6366f1"
                      >
                        {count}/
                        {maxEntryLimit}人
                      </text>
                    </g>
                  );
                })()}
              </svg>
            </div>
          </div>
        </div>
      </div>

      {/* ================================================= */}
      {/* 選択中コーデ */}
      {/* ================================================= */}
      {selectedCoordinate && (
        <section className="rounded-3xl border border-indigo-200 bg-indigo-50 p-5 sm:p-6">
          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
            <div>
              <div className="text-[10px] font-black tracking-[0.18em] text-indigo-500">
                SELECTED COORDINATE
              </div>

              <div className="mt-1 flex flex-wrap items-center gap-2">
                <span className="inline-flex rounded-lg bg-indigo-100 px-3 py-1 text-sm font-black text-indigo-800">
                  {selectedCoordinate.code.toUpperCase()}
                </span>

                <h4 className="text-xl font-black text-indigo-950">
                  {selectedCoordinate.name}
                </h4>
              </div>

              <div className="mt-2 text-sm font-black text-indigo-900">
                {getRankText(
                  selectedCoordinate,
                )}
              </div>

              <div className="mt-1 text-[11px] text-indigo-700">
                傾向：{
                  selectedCoordinate.tendency
                }
              </div>
            </div>

            <div className="rounded-2xl bg-white border border-indigo-100 px-4 py-3 text-right">
              <div className="text-[10px] text-gray-500">
                エントリー状況
              </div>

              <div className="mt-1 text-xl font-black text-indigo-900">
                {selectedCount} /{' '}
                {maxEntryLimit}人
              </div>

              {selectedIsFull && (
                <div className="text-[10px] font-black text-red-600">
                  満員
                </div>
              )}
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-2">
            <div className="rounded-xl bg-white border border-indigo-100 p-3">
              <div className="text-[10px] text-gray-500">
                体力
              </div>
              <div className="text-lg font-black">
                {
                  selectedCoordinate
                    .stats.hp
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

          <div className="mt-4">
            <button
              type="button"
              disabled={
                selectedIsFull
              }
              onClick={
                handleEntryClick
              }
              className={`w-full rounded-xl px-4 py-3 text-xs font-black transition ${
                selectedIsFull
                  ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                  : 'bg-indigo-600 hover:bg-indigo-700 text-white'
              }`}
            >
              {selectedIsFull
                ? 'このコーデはエントリー満員'
                : 'このコーデでエントリーする'}
            </button>
          </div>
        </section>
      )}
    </div>
  );
}