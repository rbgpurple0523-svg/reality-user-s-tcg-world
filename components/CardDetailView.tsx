'use client';

import React from 'react';
import type { CoordinatePreset } from './coordinatePresets';
import type { EmotionPreset } from './emotionPresets';

type CharacterCardDetailProps = {
  type: 'character';
  userName: string;
  imageDataUrl: string;
  coordinate: CoordinatePreset;
  customSkills: [string, string, string, string];
  flavorText: string;
  selectedColorHex: string;
  profileUrl: string;
  showProfileUrl: boolean;
};

type SupportCardDetailProps = {
  type: 'support';
  userName: string;
  imageDataUrl: string;
  emotion: EmotionPreset;
  effectName: string;
  flavorText: string;
  selectedColorHex: string;
  profileUrl: string;
  showProfileUrl: boolean;
};

export type CardDetailViewProps =
  | CharacterCardDetailProps
  | SupportCardDetailProps;

function normalizeProfileUrl(value: string): string {
  return value
    .trim()
    .replace(/#REALITY$/i, '')
    .replace(/\/$/, '');
}

function MiniRadarChart({
  stats,
}: {
  stats: CoordinatePreset['stats'];
}) {
  const size = 96;
  const center = size / 2;
  const radius = 34;

  const values = [
    stats.hp,
    stats.intellect,
    stats.dexterity,
    stats.charm,
  ].map((value) =>
    Math.min(100, Math.max(0, value)),
  );

  const points = [
    `${center},${center - (values[0] / 100) * radius}`,
    `${center + (values[1] / 100) * radius},${center}`,
    `${center},${center + (values[2] / 100) * radius}`,
    `${center - (values[3] / 100) * radius},${center}`,
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
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      aria-label="ステータスレーダー"
    >
      <polygon
        points={outerPoints}
        fill="none"
        stroke="currentColor"
        strokeOpacity="0.18"
      />

      <polygon
        points={middlePoints}
        fill="none"
        stroke="currentColor"
        strokeOpacity="0.12"
      />

      <line
        x1={center}
        y1={center - radius}
        x2={center}
        y2={center + radius}
        stroke="currentColor"
        strokeOpacity="0.12"
      />

      <line
        x1={center - radius}
        y1={center}
        x2={center + radius}
        y2={center}
        stroke="currentColor"
        strokeOpacity="0.12"
      />

      <polygon
        points={points}
        fill="currentColor"
        fillOpacity="0.15"
        stroke="currentColor"
        strokeWidth="2"
      />
    </svg>
  );
}

function CharacterCardDetail({
  userName,
  imageDataUrl,
  coordinate,
  customSkills,
  flavorText,
  selectedColorHex,
  profileUrl,
  showProfileUrl,
}: CharacterCardDetailProps) {
  return (
    <div
      className="mx-auto w-full max-w-sm overflow-hidden rounded-[1.65rem] border-[5px] bg-white shadow-lg"
      style={{ borderColor: selectedColorHex }}
    >
      <div className="border-b border-gray-100 px-4 pb-3 pt-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[8px] font-black tracking-[0.18em] text-pink-500">
              CHARACTER CARD
            </div>

            <div className="mt-1 truncate text-xl font-black text-gray-950">
              {userName || '名前未設定'}
            </div>

            <div className="mt-1 flex items-center gap-1.5">
              <span className="rounded-md bg-gray-900 px-1.5 py-1 text-[8px] font-black text-white">
                {coordinate.code.toUpperCase()}
              </span>

              <span className="truncate text-[9px] font-black text-gray-600">
                {coordinate.name}
              </span>
            </div>
          </div>

          <div className="shrink-0 rounded-xl border border-gray-200 bg-gray-50 px-2 py-1 text-[8px] font-black text-gray-500">
            PREVIEW
          </div>
        </div>
      </div>

      <div className="grid grid-cols-[1.1fr_0.9fr] gap-3 p-3">
        <div className="overflow-hidden rounded-2xl border border-gray-200 bg-gray-50">
          {imageDataUrl ? (
            <img
              src={imageDataUrl}
              alt=""
              className="aspect-[4/5] w-full object-cover"
            />
          ) : (
            <div className="flex aspect-[4/5] items-center justify-center text-xs font-black text-gray-400">
              画像未設定
            </div>
          )}
        </div>

        <div className="flex min-w-0 flex-col items-center">
          <MiniRadarChart stats={coordinate.stats} />

          <div className="mt-1 grid w-full grid-cols-1 gap-1 text-[8px] font-black text-gray-600">
            <div className="flex items-center justify-between">
              <span>🔥 情熱</span>
              <span>{coordinate.stats.hp}</span>
            </div>

            <div className="flex items-center justify-between">
              <span>▽ 知性</span>
              <span>{coordinate.stats.intellect}</span>
            </div>

            <div className="flex items-center justify-between">
              <span>⬡ 技能</span>
              <span>{coordinate.stats.dexterity}</span>
            </div>

            <div className="flex items-center justify-between">
              <span>♥ 愛嬌</span>
              <span>{coordinate.stats.charm}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="px-3 pb-3">
        <div className="rounded-2xl border border-pink-100 bg-pink-50/60 p-3">
          <div className="text-[9px] font-black tracking-[0.12em] text-pink-600">
            SKILLS
          </div>

          <div className="mt-2 grid grid-cols-2 gap-2">
            {customSkills.map((skill, index) => (
              <div
                key={`${skill}-${index}`}
                className="rounded-xl border border-white bg-white px-2.5 py-2 shadow-sm"
              >
                <div className="text-[7px] font-black text-pink-500">
                  SKILL {index + 1}
                </div>

                <div className="mt-0.5 line-clamp-2 text-[9px] font-black text-gray-800">
                  {skill}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="border-t border-amber-100 bg-amber-50 px-4 py-3 text-center">
        <div className="text-[8px] font-black tracking-[0.12em] text-amber-700">
          FLAVOR
        </div>

        <div
          className={`mt-1 text-[10px] font-bold leading-4 ${
            flavorText.trim()
              ? 'text-amber-950'
              : 'text-amber-500'
          }`}
        >
          {flavorText.trim() || '一言未設定'}
        </div>
      </div>

      {showProfileUrl && (
        <div className="border-t border-gray-100 bg-white px-3 py-3">
          <div className="text-[8px] font-black tracking-[0.12em] text-gray-400">
            REALITY PROFILE
          </div>

          <div className="mt-1 break-all text-[9px] font-bold text-gray-700">
            {normalizeProfileUrl(profileUrl) || '未設定'}
          </div>
        </div>
      )}
    </div>
  );
}

function SupportCardDetail({
  userName,
  imageDataUrl,
  emotion,
  effectName,
  flavorText,
  selectedColorHex,
  profileUrl,
  showProfileUrl,
}: SupportCardDetailProps) {
  return (
    <div
      className="mx-auto w-full max-w-sm overflow-hidden rounded-[1.65rem] border-[5px] bg-white shadow-lg"
      style={{ borderColor: selectedColorHex }}
    >
      <div className="border-b border-gray-100 px-4 pb-3 pt-4">
        <div className="text-[8px] font-black tracking-[0.18em] text-purple-500">
          SUPPORT CARD
        </div>

        <div className="mt-1 text-xl font-black text-gray-950">
          {effectName || '効果名未設定'}
        </div>

        <div className="mt-1 text-[9px] font-bold text-gray-500">
          {emotion.statEffect}
          {emotion.effectAmount
            ? ` ${emotion.effectAmount}`
            : ''}{' '}
          / {emotion.target} / {emotion.duration}
        </div>
      </div>

      <div className="p-3">
        <div className="overflow-hidden rounded-2xl border border-gray-200 bg-gray-100">
          {imageDataUrl ? (
            <img
              src={imageDataUrl}
              alt=""
              className="aspect-[4/5] w-full object-contain"
            />
          ) : (
            <div className="flex aspect-[4/5] items-center justify-center text-xs font-black text-gray-400">
              画像未設定
            </div>
          )}
        </div>
      </div>

      <div className="px-3 pb-3">
        <div className="rounded-2xl border border-gray-200 bg-gray-50 p-3">
          <div className="text-[9px] font-black tracking-[0.12em] text-gray-500">
            EFFECT
          </div>

          <div className="mt-1 text-sm font-black text-gray-900">
            {emotion.statEffect}
            {emotion.effectAmount
              ? `（${emotion.effectAmount}）`
              : ''}
          </div>

          <div className="mt-1 text-[9px] font-bold text-gray-500">
            {emotion.target} / {emotion.duration} /{' '}
            {emotion.effectCategory}
          </div>

          <div className="mt-2 text-[10px] leading-4 text-gray-600">
            {emotion.description}
          </div>
        </div>
      </div>

      <div className="px-3 pb-3">
        <div className="rounded-2xl border border-amber-100 bg-amber-50 p-3">
          <div className="text-[9px] font-black tracking-[0.12em] text-amber-700">
            FLAVOR
          </div>

          <div
            className={`mt-1 text-[10px] font-bold leading-4 ${
              flavorText.trim()
                ? 'text-amber-950'
                : 'text-amber-500'
            }`}
          >
            {flavorText.trim() || '一言未設定'}
          </div>
        </div>
      </div>

      <div className="border-t border-gray-100 bg-white px-3 pb-3 pt-2">
        <div className="rounded-2xl border border-gray-200 bg-gray-50 p-3">
          <div className="text-[9px] font-black tracking-[0.12em] text-gray-500">
            REGISTERED USER
          </div>

          <div className="mt-1 text-sm font-black text-gray-950">
            {userName || '未設定'}
          </div>

          {showProfileUrl && (
            <>
              <div className="mt-3 text-[8px] font-black text-gray-400">
                REALITYプロフィールURL
              </div>

              <div className="mt-0.5 break-all text-[10px] font-bold text-gray-700">
                {normalizeProfileUrl(profileUrl) || '未設定'}
              </div>
            </>
          )}
        </div>
      </div>

      <div className="border-t border-gray-100 bg-white px-3 pb-4 pt-3">
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-gray-200 bg-white p-3">
          <span className="text-[9px] font-black text-gray-500">
            カラー
          </span>

          <span className="inline-flex items-center gap-1.5 text-[9px] font-black text-gray-700">
            <span
              className="h-3 w-3 rounded-full border border-gray-300"
              style={{
                backgroundColor: selectedColorHex,
              }}
            />

            {selectedColorHex.toUpperCase()}
          </span>
        </div>
      </div>
    </div>
  );
}

export default function CardDetailView(
  props: CardDetailViewProps,
) {
  if (props.type === 'character') {
    return <CharacterCardDetail {...props} />;
  }

  return <SupportCardDetail {...props} />;
}