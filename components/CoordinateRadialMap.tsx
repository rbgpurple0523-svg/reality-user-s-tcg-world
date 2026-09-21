'use client';

import React, { useMemo, useState } from 'react';
import type { CoordinatePreset } from './coordinatePresets';
import type { EntryRecord } from './EntryHub';

type StatKey = 'hp' | 'intellect' | 'dexterity' | 'charm';

interface CoordinateRadialMapProps {
  coordinates: CoordinatePreset[];
  entries: EntryRecord[];
  maxEntryLimit: number;
  onSelect?: (coordinate: CoordinatePreset) => void;
}

const STAT_LABELS: Record<StatKey, string> = {
  hp: '体力',
  intellect: '知略',
  dexterity: '器用',
  charm: '特技',
};

const RADIAL_CODES = [
  'd', 'f', 'e', 'c', 'b', 'a',
  'h', 'g', 'n', 't', 's', 'm',
  'o', 'u', 'i', 'k', 'w', 'q',
  'x', 'r', 'v', 'p', 'l', 'j',
] as const;

const START_ANGLE = 225;
const SLICE_ANGLE = 15;
const OUTER_RADIUS = 270;
const INNER_RADIUS = 118;

const PRIMARY_STYLES: Record<StatKey, { fill: string; stroke: string; text: string }> = {
  hp: { fill: '#fee2e2', stroke: '#fca5a5', text: '#991b1b' },
  intellect: { fill: '#dbeafe', stroke: '#93c5fd', text: '#1e40af' },
  dexterity: { fill: '#fef3c7', stroke: '#fcd34d', text: '#92400e' },
  charm: { fill: '#f3e8ff', stroke: '#d8b4fe', text: '#6b21a8' },
};

function polarToCartesian(
  centerX: number,
  centerY: number,
  radius: number,
  angleInDegrees: number,
) {
  const angleInRadians = (angleInDegrees * Math.PI) / 180;
  return {
    x: centerX + radius * Math.cos(angleInRadians),
    y: centerY + radius * Math.sin(angleInRadians),
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
  const outerStart = polarToCartesian(centerX, centerY, outerRadius, startAngle);
  const outerEnd = polarToCartesian(centerX, centerY, outerRadius, endAngle);
  const innerStart = polarToCartesian(centerX, centerY, innerRadius, startAngle);
  const innerEnd = polarToCartesian(centerX, centerY, innerRadius, endAngle);
  const largeArcFlag = endAngle - startAngle > 180 ? 1 : 0;

  return [
    `M ${innerStart.x} ${innerStart.y}`,
    `L ${outerStart.x} ${outerStart.y}`,
    `A ${outerRadius} ${outerRadius} 0 ${largeArcFlag} 1 ${outerEnd.x} ${outerEnd.y}`,
    `L ${innerEnd.x} ${innerEnd.y}`,
    `A ${innerRadius} ${innerRadius} 0 ${largeArcFlag} 0 ${innerStart.x} ${innerStart.y}`,
    'Z',
  ].join(' ');
}

function getStatsRank(coordinate: CoordinatePreset): StatKey[] {
  const values: Record<StatKey, number> = {
    hp: coordinate.stats.hp,
    intellect: coordinate.stats.intellect,
    dexterity: coordinate.stats.dexterity,
    charm: coordinate.stats.charm,
  };

  return (Object.entries(values) as [StatKey, number][])
    .sort((a, b) => b[1] - a[1])
    .map(([key]) => key);
}

function getRankText(coordinate: CoordinatePreset) {
  return getStatsRank(coordinate).map((key) => STAT_LABELS[key]).join(' ＞ ');
}

function getShortRankText(coordinate: CoordinatePreset) {
  const shortLabels: Record<StatKey, string> = {
    hp: '体',
    intellect: '知',
    dexterity: '器',
    charm: '特',
  };

  return getStatsRank(coordinate)
    .map((key) => shortLabels[key])
    .join(' ＞ ');
}

function getPrimaryStat(coordinate: CoordinatePreset) {
  return getStatsRank(coordinate)[0];
}

function RadarChart({ stats }: { stats: CoordinatePreset['stats'] }) {
  const size = 220;
  const center = size / 2;
  const radius = 72;
  const max = 100;
  const values = [
    Math.min(stats.hp, max),
    Math.min(stats.intellect, max),
    Math.min(stats.dexterity, max),
    Math.min(stats.charm, max),
  ];

  const points = [
    `${center},${center - (values[0] / max) * radius}`,
    `${center + (values[1] / max) * radius},${center}`,
    `${center},${center + (values[2] / max) * radius}`,
    `${center - (values[3] / max) * radius},${center}`,
  ].join(' ');

  const outerPoints = [
    `${center},${center - radius}`,
    `${center + radius},${center}`,
    `${center},${center + radius}`,
    `${center - radius},${center}`,
  ].join(' ');

  const middleRadius = radius * 0.5;
  const middlePoints = [
    `${center},${center - middleRadius}`,
    `${center + middleRadius},${center}`,
    `${center},${center + middleRadius}`,
    `${center - middleRadius},${center}`,
  ].join(' ');

  return (
    <div className="flex flex-col items-center">
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="overflow-visible"
        aria-label="ステータスレーダーチャート"
      >
        <polygon points={outerPoints} fill="none" stroke="currentColor" strokeOpacity="0.22" />
        <polygon points={middlePoints} fill="none" stroke="currentColor" strokeOpacity="0.14" />
        <line x1={center} y1={center - radius} x2={center} y2={center + radius} stroke="currentColor" strokeOpacity="0.18" />
        <line x1={center - radius} y1={center} x2={center + radius} y2={center} stroke="currentColor" strokeOpacity="0.18" />
        <polygon points={points} fill="currentColor" fillOpacity="0.18" stroke="currentColor" strokeWidth="2" />
        <circle cx={center} cy={center} r="2.5" fill="currentColor" opacity="0.5" />

        <text x={center} y="12" textAnchor="middle" fontSize="10" fontWeight="800" fill="currentColor">体力</text>
        <text x="208" y={center + 4} textAnchor="end" fontSize="10" fontWeight="800" fill="currentColor">知略</text>
        <text x={center} y="214" textAnchor="middle" fontSize="10" fontWeight="800" fill="currentColor">器用</text>
        <text x="12" y={center + 4} textAnchor="start" fontSize="10" fontWeight="800" fill="currentColor">特技</text>
      </svg>

      <div className="mt-1 grid grid-cols-2 gap-x-6 gap-y-1 text-xs font-bold text-gray-700">
        <span>体力 {stats.hp}</span>
        <span>知略 {stats.intellect}</span>
        <span>器用 {stats.dexterity}</span>
        <span>特技 {stats.charm}</span>
      </div>
    </div>
  );
}

export default function CoordinateRadialMap({
  coordinates,
  entries,
  maxEntryLimit,
  onSelect,
}: CoordinateRadialMapProps) {
  const [selectedCode, setSelectedCode] = useState('y');

  const coordinateMap = useMemo(
    () => new Map(coordinates.map((coordinate) => [coordinate.code, coordinate])),
    [coordinates],
  );

  const selectedCoordinate = useMemo(
    () =>
      coordinateMap.get(selectedCode) ??
      coordinateMap.get('y') ??
      coordinates[0] ??
      null,
    [coordinateMap, selectedCode, coordinates],
  );

  const getEntryCount = (presetId: string) =>
    entries.filter((entry) => entry.presetId === presetId).length;

  const selectedCount = selectedCoordinate ? getEntryCount(selectedCoordinate.id) : 0;
  const selectedIsFull = selectedCount >= maxEntryLimit;

  const selectCoordinate = (coordinate: CoordinatePreset) => {
    setSelectedCode(coordinate.code);
  };

  const handleEntryClick = () => {
    if (selectedCoordinate && !selectedIsFull) {
      onSelect?.(selectedCoordinate);
    }
  };

  const center = 350;

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-gray-200 bg-white shadow-sm overflow-hidden">
        <div className="p-5 sm:p-6 bg-gradient-to-b from-gray-50 to-white border-b border-gray-200">
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
            <div>
              <div className="text-xs font-black tracking-[0.2em] text-indigo-500">COORDINATE MAP</div>
              <h3 className="mt-1 text-2xl font-black text-gray-900">25種類のコーデ配置図</h3>
              <p className="mt-2 text-xs text-gray-500 leading-relaxed">
                中央の「均等型」を中心に、4ステータスの順位による24種類を15°ずつ配置しています。
              </p>
            </div>
            <div className="text-[10px] text-gray-500 leading-relaxed sm:text-right">
              4本の境界線では、隣り合う2ステータスの順位が入れ替わります
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
                <circle cx={center} cy={center} r={OUTER_RADIUS} fill="none" stroke="#e5e7eb" strokeWidth="1" />
                <circle cx={center} cy={center} r={INNER_RADIUS} fill="white" stroke="#c7d2fe" strokeWidth="2" />

                <text x={center} y={22} textAnchor="middle" fontSize="12" fontWeight="800" fill="#9ca3af">体力</text>
                <text x={678} y={center + 4} textAnchor="end" fontSize="12" fontWeight="800" fill="#9ca3af">知略</text>
                <text x={center} y={688} textAnchor="middle" fontSize="12" fontWeight="800" fill="#9ca3af">器用</text>
                <text x={22} y={center + 4} textAnchor="start" fontSize="12" fontWeight="800" fill="#9ca3af">特技</text>

                {RADIAL_CODES.map((code, index) => {
                  const coordinate = coordinateMap.get(code);
                  if (!coordinate) return null;

                  const startAngle = START_ANGLE + index * SLICE_ANGLE;
                  const endAngle = startAngle + SLICE_ANGLE;
                  const middleAngle = startAngle + SLICE_ANGLE / 2;
                  const labelRadius = (OUTER_RADIUS + INNER_RADIUS) / 2;
                  const labelPoint = polarToCartesian(center, center, labelRadius, middleAngle);
                  const count = getEntryCount(coordinate.id);
                  const isSelected = selectedCode === coordinate.code;
                  const primary = getPrimaryStat(coordinate);
                  const color = PRIMARY_STYLES[primary];
                  const path = describeArc(center, center, INNER_RADIUS, OUTER_RADIUS, startAngle, endAngle);

                  return (
                    <g key={coordinate.id}>
                      <path
                        d={path}
                        fill={isSelected ? '#eef2ff' : color.fill}
                        stroke={isSelected ? '#6366f1' : color.stroke}
                        strokeWidth={isSelected ? 3 : 1.5}
                        className="cursor-pointer transition-opacity hover:opacity-80"
                        onClick={() => selectCoordinate(coordinate)}
                        aria-label={`${coordinate.code.toUpperCase()} ${getRankText(coordinate)} / ${count}/${maxEntryLimit}人`}
                      />

                      <text
                        x={labelPoint.x}
                        y={labelPoint.y - 5}
                        textAnchor="middle"
                        dominantBaseline="middle"
                        fontSize="18"
                        fontWeight="900"
                        fill={color.text}
                        pointerEvents="none"
                      >
                        {coordinate.code.toUpperCase()}
                      </text>

                      <text
                        x={labelPoint.x}
                        y={labelPoint.y + 14}
                        textAnchor="middle"
                        dominantBaseline="middle"
                        fontSize="9"
                        fontWeight="800"
                        fill="#6b7280"
                        pointerEvents="none"
                      >
                        {count}/{maxEntryLimit}
                      </text>
                    </g>
                  );
                })}

                {[45, 135, 225, 315].map((angle) => {
                  const start = polarToCartesian(center, center, INNER_RADIUS, angle);
                  const end = polarToCartesian(center, center, OUTER_RADIUS, angle);
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
                })}

                {(() => {
                  const centerPreset = coordinateMap.get('y');
                  if (!centerPreset) return null;

                  const count = getEntryCount(centerPreset.id);
                  const isSelected = selectedCode === 'y';

                  return (
                    <g className="cursor-pointer" onClick={() => selectCoordinate(centerPreset)}>
                      <circle
                        cx={center}
                        cy={center}
                        r={INNER_RADIUS - 5}
                        fill="#ffffff"
                        stroke={isSelected ? '#6366f1' : '#a5b4fc'}
                        strokeWidth={isSelected ? 5 : 3}
                      />
                      <text x={center} y={center - 23} textAnchor="middle" fontSize="11" fontWeight="900" fill="#6366f1" letterSpacing="2">BALANCE</text>
                      <text x={center} y={center + 19} textAnchor="middle" fontSize="48" fontWeight="900" fill="#1e1b4b">均</text>
                      <text x={center} y={center + 42} textAnchor="middle" fontSize="10" fontWeight="800" fill="#6b7280">体力＝知略＝器用＝特技</text>
                      <text x={center} y={center + 60} textAnchor="middle" fontSize="10" fontWeight="900" fill="#6366f1">{count}/{maxEntryLimit}人</text>
                    </g>
                  );
                })()}
              </svg>
            </div>
          </div>
        </div>
      </div>

      {selectedCoordinate && (
        <section className="rounded-3xl border border-indigo-200 bg-indigo-50 p-5 sm:p-6">
          <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-6">
            <div className="flex-1">
              <div className="text-[10px] font-black tracking-[0.18em] text-indigo-500">SELECTED COORDINATE</div>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <span className="inline-flex rounded-lg bg-indigo-100 px-3 py-1 text-sm font-black text-indigo-800">{selectedCoordinate.code.toUpperCase()}</span>
                <h4 className="text-xl font-black text-indigo-950">{selectedCoordinate.name}</h4>
              </div>
              <div className="mt-2 text-sm font-black text-indigo-900">{getRankText(selectedCoordinate)}</div>
              <div className="mt-1 text-[11px] text-indigo-700">略称：{getShortRankText(selectedCoordinate)}</div>
              <div className="mt-1 text-[11px] text-indigo-700">傾向：{selectedCoordinate.tendency}</div>

              <div className="mt-4 rounded-2xl border border-indigo-100 bg-white p-4">
                <div className="text-[10px] font-black tracking-[0.12em] text-indigo-500">CHARACTER IMAGE</div>
                <p className="mt-2 text-sm leading-7 text-gray-700">{selectedCoordinate.description}</p>
              </div>

              <div className="mt-4 rounded-2xl bg-white border border-indigo-100 px-4 py-3">
                <div className="text-[10px] text-gray-500">エントリー状況</div>
                <div className="mt-1 text-xl font-black text-indigo-900">{selectedCount} / {maxEntryLimit}人</div>
                {selectedIsFull && <div className="text-[10px] font-black text-red-600">満員</div>}
              </div>
            </div>

            <div className="shrink-0 rounded-2xl border border-indigo-100 bg-white p-4">
              <div className="mb-2 text-center text-[10px] font-black tracking-[0.12em] text-indigo-500">STATUS</div>
              <RadarChart stats={selectedCoordinate.stats} />
            </div>
          </div>

          <div className="mt-5">
            <button
              type="button"
              disabled={selectedIsFull}
              onClick={handleEntryClick}
              className={`w-full rounded-xl px-4 py-3 text-xs font-black transition ${
                selectedIsFull
                  ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                  : 'bg-indigo-600 hover:bg-indigo-700 text-white'
              }`}
            >
              {selectedIsFull ? 'このコーデはエントリー満員' : 'このコーデでエントリーする'}
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
