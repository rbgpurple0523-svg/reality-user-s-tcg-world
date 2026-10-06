'use client';

import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { playBgm, playSe, stopBgm } from '@/components/audio';
import { db, ensureAnonymousAuth } from '@/lib/firebase';
import {
  doc,
  getDoc,
  onSnapshot,
  runTransaction,
  updateDoc,
  setDoc,
  deleteField,
} from 'firebase/firestore';
import {
  AvatarCard,
  SupportCard,
  Deck,
  Archetype,
} from '@/types/card';
import { CHARACTER_SAMPLE_CARDS } from './characterSampleCards';
import { COORDINATE_PRESETS } from './coordinatePresets';
import {
  createVirtualSupportCards,
  getVirtualSupportImageDataUrl,
  VIRTUAL_SUPPORT_PREFIX,
} from './supportSampleCards';
import {
  EMOTION_PRESETS,
  getEmotionPerformanceBadges,
  type EmotionPreset,
} from './emotionPresets';

import BattleEffectLayer, {
  isBattlePreResultEffectPlaying,
  playSkillPreResultEffect,
  playSupportPreResultEffect,
} from './battle/BattleEffectLayer';
import VerticalScoreGauge from './battle/VerticalScoreGauge';
import BattleCardReveal from './battle/BattleCardReveal';
import BattleDeckPile from './battle/BattleDeckPile';
import {
  getCharacterSkillBattleEffect,
  getSupportBattleEffect,
} from './battle/battleEffectResolver';


// ===== 対戦の基本設定 =====
type Season = '春' | '夏' | '秋' | '冬';
type RoleName = '先鋒' | '中堅' | '大将';
type PlayerRole = 'host' | 'guest';
type SkillRule =
  | 'primary_score'
  | 'product_score'
  | 'difference_score'
  | 'combo_score_and_debuff'
  | 'total_score'
  | 'response_score'
  | 'burst'
  | 'crash';

type StatKey = 'hp' | 'intellect' | 'dexterity' | 'charm';
type SkillType = 'score' | 'debuff_clear' | 'draw_score' | 'debuff_attack';

const SEASONS: Season[] = ['春', '夏', '秋', '冬'];
const ROLE_NAMES: RoleName[] = ['先鋒', '中堅', '大将'];
const MAX_HAND = 7;
const BATTLE_DECK_SIZE = 18;
const INITIAL_HAND_SIZE = 4;

const STAT_KEYS: StatKey[] = ['hp', 'intellect', 'dexterity', 'charm'];
const STAT_LABELS: Record<StatKey, string> = {
  hp: '情熱',
  intellect: '知性',
  dexterity: '技能',
  charm: '愛嬌',
};

const COLOR_TYPE_LABELS: Record<'赤' | '青' | '黄', string> = {
  青: 'マゼンタ系',
  赤: 'シアン系',
  黄: 'イエロー系',
};

type Skill = {
  id: string;
  name: string;
  description: string;
  maxUsesPerClass: number;
  type: SkillType;
  rule: SkillRule;
  primaryStat?: StatKey;
  secondaryStat?: StatKey;
  tertiaryStat?: StatKey;
  quaternaryStat?: StatKey;
};

const LEGACY_SKILLS: Skill[] = [
  {
    id: 'skill_1',
    name: 'ボディビル',
    description: '情熱×10でスコアを獲得する。',
    maxUsesPerClass: 0,
    type: 'score',
    rule: 'primary_score',
    primaryStat: 'hp',
  },
  {
    id: 'skill_2',
    name: 'やる気元気',
    description: '自分のデバフを解除し、このキャラへのデバフを無効化する。',
    maxUsesPerClass: 0,
    type: 'debuff_clear',
    rule: 'primary_score',
  },
  {
    id: 'skill_3',
    name: '計画性',
    description: '智略を基準にスコアを獲得する。',
    maxUsesPerClass: 0,
    type: 'score',
    rule: 'primary_score',
    primaryStat: 'intellect',
  },
  {
    id: 'skill_4',
    name: 'タックル&寝技',
    description: '相手の情熱を自分の愛嬌分だけ下げる。',
    maxUsesPerClass: 1,
    type: 'debuff_attack',
    rule: 'combo_score_and_debuff',
    primaryStat: 'hp',
    secondaryStat: 'charm',
  },
];

function getPresetForCard(
  card: AvatarCard & {
    presetId?: string;
    coordinateCode?: string;
    code?: string;
  },
) {
  const presetId = card.presetId;
  const code = card.coordinateCode || card.code;

  return COORDINATE_PRESETS.find(
    (preset) =>
      (presetId && preset.id === presetId) ||
      (code && preset.code === code),
  );
}

function getStatRankFromPreset(
  preset: (typeof COORDINATE_PRESETS)[number],
): StatKey[] {
  return STAT_KEYS.slice().sort(
    (a, b) => preset.stats[b] - preset.stats[a],
  );
}

function getLowEffectiveStatRank(
  stats: Record<StatKey, number>,
  tieRank: StatKey[],
): StatKey[] {
  const tieOrder = new Map(
    tieRank.map((stat, index) => [stat, index]),
  );

  return STAT_KEYS.slice().sort((a, b) => {
    const valueDiff = stats[a] - stats[b];

    if (valueDiff !== 0) {
      return valueDiff;
    }

    return (
      (tieOrder.get(a) ?? STAT_KEYS.indexOf(a)) -
      (tieOrder.get(b) ?? STAT_KEYS.indexOf(b))
    );
  });
}

function buildPresetSkills(
  preset: (typeof COORDINATE_PRESETS)[number],
  customNames?: string[],
): Skill[] {
  const names = customNames?.length
    ? customNames
    : preset.defaultSkills;

  const isNeutralPreset =
    preset.battleEffects[0] === 'skill-total';

  if (isNeutralPreset) {
    return [
      {
        id: 'skill_1',
        name: names[0] || preset.defaultSkills[0],
        description: preset.skillDescriptions[0],
        maxUsesPerClass: 0,
        type: 'score',
        rule: 'total_score',
      },
      {
        id: 'skill_2',
        name: names[1] || preset.defaultSkills[1],
        description: preset.skillDescriptions[1],
        maxUsesPerClass: 0,
        type: 'score',
        rule: 'response_score',
      },
      {
        id: 'skill_3',
        name: names[2] || preset.defaultSkills[2],
        description: preset.skillDescriptions[2],
        maxUsesPerClass: 2,
        type: 'score',
        rule: 'burst',
      },
      {
        id: 'skill_4',
        name: names[3] || preset.defaultSkills[3],
        description: preset.skillDescriptions[3],
        maxUsesPerClass: 1,
        type: 'debuff_attack',
        rule: 'crash',
      },
    ];
  }

  const rank = getStatRankFromPreset(preset);

  return [
    {
      id: 'skill_1',
      name: names[0] || preset.defaultSkills[0],
      description: preset.skillDescriptions[0],
      maxUsesPerClass: 0,
      type: 'score',
      rule: 'primary_score',
      primaryStat: rank[0],
    },
    {
      id: 'skill_2',
      name: names[1] || preset.defaultSkills[1],
      description: preset.skillDescriptions[1],
      maxUsesPerClass: 0,
      type: 'score',
      rule: 'product_score',
      primaryStat: rank[1],
      secondaryStat: rank[2],
    },
    {
      id: 'skill_3',
      name: names[2] || preset.defaultSkills[2],
      description: preset.skillDescriptions[2],
      maxUsesPerClass: 0,
      type: 'score',
      rule: 'difference_score',
      primaryStat: rank[0],
    },
    {
      id: 'skill_4',
      name: names[3] || preset.defaultSkills[3],
      description: preset.skillDescriptions[3],
      maxUsesPerClass: 1,
      type: 'debuff_attack',
      rule: 'combo_score_and_debuff',
      primaryStat: rank[0],
      secondaryStat: rank[2],
      tertiaryStat: rank[3],
    },
  ];
}

function buildSkills(
  names: string[] | undefined,
  preset?: (typeof COORDINATE_PRESETS)[number],
): Skill[] {
  if (preset) {
    return buildPresetSkills(preset, names);
  }

  return LEGACY_SKILLS.map((skill, index) => ({
    ...skill,
    id: `skill_${index + 1}`,
    name: names?.[index]?.trim() || skill.name,
  }));
}

// ===== Firebaseへ保存する戦闘キャラクター =====
type SupportAvatarEffectState = {
  id: string;
  sourcePresetId: string;
  statDelta?: Partial<Record<StatKey, number>>;
  statOverride?: Partial<Record<StatKey, number>>;
  skillSealIndex?: number;
  expiresAtTurnOrdinal: number | null;
};

type SupportControlEffectState = {
  id: string;
  sourcePresetId: string;
  duration: '一時' | '永続';
  kind: 'limit' | 'free' | 'extra_draw';
  maxUsesPerTurn?: number;
  extraDrawPerTurn?: number;
  expiresAtTurnOrdinal: number | null;
};

type BattleAvatar = {
  card: AvatarCard;
  roleName: RoleName;
  stats: AvatarCard['stats'];
  baseStats: AvatarCard['stats'];
  currentDebuff: AvatarCard['stats'];
  debuffImmune: boolean;
  seasonAbilityText: string;
  skills: Skill[];
  statBoost?: Partial<Record<StatKey, number>>;
  supportEffects?: SupportAvatarEffectState[];
  supportControlEffects?: SupportControlEffectState[];
};

type BattleDeckSnapshot = {
  version: 1;
  deckId: string | null;
  deckName: string;
  characters: [
    {
      role: 'vanguard';
      cardId: string;
      presetId?: string;
    },
    {
      role: 'center';
      cardId: string;
      presetId?: string;
    },
    {
      role: 'general';
      cardId: string;
      presetId?: string;
    },
  ];
  supportCards: Array<{
    cardId: string;
    presetId?: string;
  }>;
  createdAt: string;
};

const getBattleTurnOrdinal = (
  year: number,
  turnIndex: number,
) =>
  Math.max(
    0,
    (year - 1) * 8 + turnIndex,
  );

const isSupportEffectActive = (
  effect: { expiresAtTurnOrdinal: number | null },
  turnOrdinal: number,
) =>
  effect.expiresAtTurnOrdinal === null ||
  turnOrdinal < effect.expiresAtTurnOrdinal;

const getSupportEffectExpiration = (
  preset: EmotionPreset,
  turnOrdinal: number,
  _appliesToOpponent: boolean,
) => {
  if (preset.duration !== '一時') {
    return null;
  }

  const classEndTurnOrdinal =
    (Math.floor(turnOrdinal / 8) + 1) * 8;

  return Math.min(
    turnOrdinal + 2,
    classEndTurnOrdinal,
  );
};

const clearSupportEffectsFromAvatars = (
  avatars: BattleAvatar[],
): BattleAvatar[] =>
  avatars.map((avatar) => ({
    ...avatar,
    supportEffects: [],
    supportControlEffects: [],
  }));

const getSupportUsageLimitFromEffects = (
  effects: SupportControlEffectState[] | undefined,
  turnOrdinal: number,
) => {
  const active = (effects || []).filter(
    (effect) =>
      isSupportEffectActive(
        effect,
        turnOrdinal,
      ),
  );

  if (
    active.some(
      (effect) =>
        effect.duration === '一時' &&
        effect.kind === 'free',
    )
  ) {
    return Infinity;
  }

  const temporaryLimits = active
    .filter(
      (effect) =>
        effect.duration === '一時' &&
        effect.kind === 'limit' &&
        typeof effect.maxUsesPerTurn === 'number',
    )
    .map(
      (effect) =>
        effect.maxUsesPerTurn as number,
    );

  if (temporaryLimits.length) {
    return Math.min(...temporaryLimits);
  }

  if (
    active.some(
      (effect) =>
        effect.duration === '永続' &&
        effect.kind === 'free',
    )
  ) {
    return Infinity;
  }

  const permanentLimits = active
    .filter(
      (effect) =>
        effect.duration === '永続' &&
        effect.kind === 'limit' &&
        typeof effect.maxUsesPerTurn === 'number',
    )
    .map(
      (effect) =>
        effect.maxUsesPerTurn as number,
    );

  if (permanentLimits.length) {
    return Math.min(...permanentLimits);
  }

  return Infinity;
};

const getAdditionalDrawFromEffects = (
  effects: SupportControlEffectState[] | undefined,
  turnOrdinal: number,
) =>
  (effects || [])
    .filter(
      (effect) =>
        isSupportEffectActive(
          effect,
          turnOrdinal,
        ) &&
        effect.kind === 'extra_draw',
    )
    .reduce(
      (sum, effect) =>
        sum +
        Number(
          effect.extraDrawPerTurn || 0,
        ),
      0,
    );

const hasSkillSeal = (
  avatar: BattleAvatar,
  skillIndex: number,
  turnOrdinal: number,
) =>
  (avatar.supportEffects || []).some(
    (effect) =>
      effect.skillSealIndex === skillIndex &&
      isSupportEffectActive(
        effect,
        turnOrdinal,
      ),
  );

const getSupportUseCountFromUsedSkills = (
  usedSkills: Record<string, string[]> | undefined,
  year: number,
  turnIndex: number,
) => {
  const list =
    usedSkills?.[String(year)] || [];

  const marker =
    `__support_${turnIndex}:`;

  const entry = list.find(
    (value) =>
      value.startsWith(marker),
  );

  if (!entry) {
    return 0;
  }

  const count = Number(
    entry.slice(marker.length),
  );

  return Number.isFinite(count)
    ? count
    : 0;
};

const setSupportUseCountInUsedSkills = (
  usedSkills: Record<string, string[]>,
  year: number,
  turnIndex: number,
  count: number,
) => {
  const key = String(year);
  const marker =
    `__support_${turnIndex}:`;

  const current =
    usedSkills[key] || [];

  const filtered =
    current.filter(
      (value) =>
        !value.startsWith(marker),
    );

  return {
    ...usedSkills,
    [key]: [
      ...filtered,
      `${marker}${count}`,
    ],
  };
};

const createSupportEffectId = (
  presetId: string,
) =>
  `${presetId}_${Date.now()}_${Math.random()
    .toString(36)
    .slice(2)}`;

type EntryRecordWithSkills = {
  id: string;
  cardType: 'coordinate' | 'emotion';
  presetId?: string;
  profileUrl?: string;
  userName?: string;
  imageDataUrl?: string;
  color?: string;
  colorHex?: string;
  colorType?: string;
  flavorText?: string;
  archetype?: string;
  hp?: number;
  ap?: number;
  customSkills?: string[];
  skillDescriptions?: string[];
  customEffectName?: string;
  effect?: string;
  description?: string;
  passwordHash?: string;
  createdAt?: string;
};

type GameBoardProps = {
  roomId?: string;
  isHost?: boolean;
  onEditDeck?: (deckId: string) => void;
};

const createDefaultAvatar = (
  id: string,
  name: string,
  role: RoleName,
  archetype: Archetype,
  color: '赤' | '青' | '黄',
): BattleAvatar => {
  const stats =
    archetype === 'マッスル型'
      ? {
          hp: 80,
          intellect: 20,
          dexterity: 20,
          charm: 20,
        }
      : archetype === '頭脳型'
        ? {
            hp: 20,
            intellect: 80,
            dexterity: 20,
            charm: 20,
          }
        : archetype === '職人型'
          ? {
              hp: 20,
              intellect: 20,
              dexterity: 80,
              charm: 20,
            }
          : {
              hp: 20,
              intellect: 20,
              dexterity: 20,
              charm: 80,
            };

  return {
    card: {
      id,
      profileUrl: '',
      userName: name,
      imageDataUrl: `https://placehold.co/400x520?text=${encodeURIComponent(
        name,
      )}`,
      color,
      archetype,
      favoredSeason:
        archetype === 'マッスル型'
          ? '春'
          : archetype === '頭脳型'
            ? '秋'
            : archetype === '職人型'
              ? '冬'
              : '夏',
      stats,
      passwordHash: '',
      createdAt: '',
      updatedAt: '',
    },
    roleName: role,
    stats: { ...stats },
    baseStats: { ...stats },
    currentDebuff: {
      hp: 0,
      intellect: 0,
      dexterity: 0,
      charm: 0,
    },
    debuffImmune: false,
    seasonAbilityText: `${role}戦`,
    skills: buildSkills([
      'ボディビル',
      'やる気元気',
      '計画性',
      'タックル&寝技',
    ]),
    statBoost: {},
  };
};

const DEFAULT_MY_AVATARS: BattleAvatar[] = [
  createDefaultAvatar(
    'my_1',
    'タロウ',
    '先鋒',
    'マッスル型',
    '赤',
  ),
  createDefaultAvatar(
    'my_2',
    'ジロウ',
    '中堅',
    '頭脳型',
    '青',
  ),
  createDefaultAvatar(
    'my_3',
    'サブロウ',
    '大将',
    '職人型',
    '黄',
  ),
];

const DEFAULT_OPP_AVATARS: BattleAvatar[] = [
  createDefaultAvatar(
    'opp_1',
    'ライバルA',
    '先鋒',
    '職人型',
    '青',
  ),
  createDefaultAvatar(
    'opp_2',
    'ライバルB',
    '中堅',
    'ディーバ型',
    '赤',
  ),
  createDefaultAvatar(
    'opp_3',
    'ライバルC',
    '大将',
    'マッスル型',
    '黄',
  ),
];

function RadarChart({
  baseStats,
  currentStats,
  size = 250,
  showLabels = true,
  showLegend = true,
}: {
  baseStats: AvatarCard['stats'];
  currentStats: AvatarCard['stats'];
  size?: number;
  showLabels?: boolean;
  showLegend?: boolean;
}) {
  const center = size / 2;
  const r = size * 0.344;
  const max = 100;

  const values = [
    Math.max(baseStats.hp, 0),
    Math.max(baseStats.intellect, 0),
    Math.max(baseStats.dexterity, 0),
    Math.max(baseStats.charm, 0),
  ];

  const currentValues = [
    Math.max(currentStats.hp, 0),
    Math.max(currentStats.intellect, 0),
    Math.max(currentStats.dexterity, 0),
    Math.max(currentStats.charm, 0),
  ];

  const angles = [
    -Math.PI / 2,
    0,
    Math.PI / 2,
    Math.PI,
  ];

  const point = (
    value: number,
    angle: number,
    radius = r,
  ) => ({
    x:
      center +
      Math.cos(angle) *
        (value / max) *
        radius,
    y:
      center +
      Math.sin(angle) *
        (value / max) *
        radius,
  });

  const polygonPoints = (
    points: { x: number; y: number }[],
  ) =>
    points
      .map(
        (p) =>
          `${p.x},${p.y}`,
      )
      .join(' ');

  const basePoints = values.map(
    (value, index) =>
      point(value, angles[index]),
  );

  const currentPoints =
    currentValues.map(
      (value, index) =>
        point(
          value,
          angles[index],
        ),
    );

  const outerPoints =
    angles.map((angle) =>
      point(max, angle),
    );

  const midPoints =
    angles.map((angle) =>
      point(50, angle),
    );

  const labelPositions =
    angles.map((angle) =>
      point(
        max,
        angle,
        r + size * 0.072,
      ),
    );

  const labels = [
    ['情熱', currentValues[0]],
    ['知性', currentValues[1]],
    ['技能', currentValues[2]],
    ['愛嬌', currentValues[3]],
  ];

  return (
    <div className="flex shrink-0 flex-col items-center">
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="overflow-visible"
        aria-label="ステータスレーダーチャート"
      >
        <polygon
          points={polygonPoints(
            outerPoints,
          )}
          fill="none"
          stroke="currentColor"
          strokeOpacity="0.22"
        />

        <polygon
          points={polygonPoints(
            midPoints,
          )}
          fill="none"
          stroke="currentColor"
          strokeOpacity="0.13"
        />

        {angles.map((angle) => {
          const outer =
            point(max, angle);

          return (
            <line
              key={`axis-${angle}`}
              x1={center}
              y1={center}
              x2={outer.x}
              y2={outer.y}
              stroke="currentColor"
              strokeOpacity="0.14"
            />
          );
        })}

        {basePoints.map(
          (
            basePoint,
            index,
          ) => {
            const next =
              (index + 1) % 4;

            const deltaA =
              currentValues[index] -
              values[index];

            const deltaB =
              currentValues[next] -
              values[next];

            if (
              deltaA === 0 &&
              deltaB === 0
            ) {
              return null;
            }

            return (
              <polygon
                key={`gap-${index}`}
                points={polygonPoints([
                  basePoint,
                  basePoints[next],
                  currentPoints[next],
                  currentPoints[index],
                ])}
                fill={
                  deltaA + deltaB > 0
                    ? '#fecaca'
                    : '#bfdbfe'
                }
                fillOpacity="0.58"
                stroke="none"
              />
            );
          },
        )}

        <polygon
          points={polygonPoints(
            basePoints,
          )}
          fill="#94a3b8"
          fillOpacity="0.07"
          stroke="#64748b"
          strokeWidth="2"
        />

        <polygon
          points={polygonPoints(
            currentPoints,
          )}
          fill="#facc15"
          fillOpacity="0.11"
          stroke="#eab308"
          strokeWidth="3"
        />

        {showLabels &&
          labels.map(
            ([label, value], index) => {
              const position =
                labelPositions[
                  index
                ];

              const anchor =
                index === 1
                  ? 'start'
                  : index === 3
                    ? 'end'
                    : 'middle';

              const dy =
                index === 0
                  ? -2
                  : index === 2
                    ? 10
                    : 4;

              return (
                <text
                  key={label}
                  x={position.x}
                  y={position.y + dy}
                  textAnchor={
                    anchor
                  }
                  className="fill-slate-700"
                  fontSize={Math.max(
                    8,
                    size * 0.044,
                  )}
                  fontWeight="800"
                >
                  {label} {value}
                </text>
              );
            },
          )}
      </svg>

      {showLegend && (
        <div className="mt-0 flex items-center gap-3 text-[10px] font-bold opacity-70">
          <span>■ 基礎</span>
          <span className="text-yellow-700">
            ■ 現在
          </span>
        </div>
      )}
    </div>
  );
}

function OutdoorStageBackground({
  season,
}: {
  season: Season;
}) {
  const seasonClass = {
    春: 'from-sky-200 via-pink-100 to-emerald-200',
    夏: 'from-sky-300 via-cyan-100 to-amber-100',
    秋: 'from-sky-200 via-orange-100 to-amber-200',
    冬: 'from-slate-200 via-blue-100 to-white',
  }[season];

  return (
    <div
      className={`absolute inset-0 overflow-hidden bg-gradient-to-b ${seasonClass}`}
    >
      <div className="absolute inset-x-0 top-0 h-[56%] bg-white/10" />
      <div className="absolute -left-8 bottom-[24%] h-32 w-56 rotate-6 rounded-[45%] bg-emerald-800/15" />
      <div className="absolute left-[14%] bottom-[22%] h-40 w-12 -rotate-12 rounded-full bg-emerald-900/15" />
      <div className="absolute right-[12%] bottom-[20%] h-36 w-16 rotate-12 rounded-full bg-emerald-900/15" />
      <div className="absolute inset-x-0 bottom-0 h-[34%] bg-emerald-950/15" />

      {season === '春' && (
        <>
          <div className="absolute left-4 bottom-[29%] text-6xl opacity-30">
            🌸
          </div>
          <div className="absolute right-8 bottom-[26%] text-5xl opacity-25">
            🌸
          </div>
        </>
      )}

      {season === '夏' && (
        <>
          <div className="absolute inset-x-0 bottom-0 h-[26%] bg-amber-200/45" />
          <div className="absolute right-10 bottom-[30%] text-5xl opacity-25">
            ☀️
          </div>
        </>
      )}

      {season === '秋' && (
        <>
          <div className="absolute left-3 bottom-[28%] text-6xl opacity-30">
            🍁
          </div>
          <div className="absolute right-5 bottom-[25%] text-5xl opacity-30">
            🍂
          </div>
          <div className="absolute left-[38%] bottom-[22%] text-4xl opacity-25">
            〰️
          </div>
        </>
      )}

      {season === '冬' && (
        <>
          <div className="absolute inset-x-0 bottom-[18%] h-16 rounded-full bg-white/60 blur-sm" />
          <div className="absolute left-10 top-10 text-4xl opacity-30">
            ❄
          </div>
          <div className="absolute right-20 top-20 text-3xl opacity-30">
            ❄
          </div>
        </>
      )}

      <div className="absolute inset-x-0 bottom-[32%] h-px bg-white/50" />
    </div>
  );
}

export default function GameBoard({
  roomId = '',
  isHost = true,
  onEditDeck,
}: GameBoardProps) {
  const isOnline =
    Boolean(roomId);

  const [authReady, setAuthReady] =
    useState(!isOnline);

  useEffect(() => {
    if (!isOnline) {
      setAuthReady(true);
      return;
    }

    let cancelled = false;

    void ensureAnonymousAuth()
      .then((user) => {
        currentUserUidRef.current =
          user.uid;

        if (!cancelled) {
          setAuthReady(true);
        }
      })
      .catch((error) => {
        console.error(
          'Firebase Authentication 初期化エラー:',
          error,
        );

        if (!cancelled) {
          setAuthReady(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [isOnline]);

  const [playerRole] =
    useState<PlayerRole>(
      isHost ? 'host' : 'guest',
    );

  const [battlePhase, setBattlePhase] =
    useState<
      | 'setup'
      | 'battle'
      | 'finished'
      | 'waiting'
    >('setup');

  const [currentYear, setCurrentYear] =
    useState(1);

  const [turnIndex, setTurnIndex] =
    useState(0);

  const [firstPlayer, setFirstPlayer] =
    useState<PlayerRole | null>(
      null,
    );

  const [startSeasonIdx, setStartSeasonIdx] =
    useState<number | null>(
      null,
    );

  const [myAvatars, setMyAvatars] =
    useState<BattleAvatar[]>(
      DEFAULT_MY_AVATARS,
    );

  const [oppAvatars, setOppAvatars] =
    useState<BattleAvatar[]>(
      DEFAULT_OPP_AVATARS,
    );

  const [cpuSupportDeck, setCpuSupportDeck] =
    useState<SupportCard[]>([]);

  const [cpuHand, setCpuHand] =
    useState<SupportCard[]>([]);

  const [cpuDeck, setCpuDeck] =
    useState<SupportCard[]>([]);

  const [myDeckReady, setMyDeckReady] =
    useState(false);

  const [deckConfirmed, setDeckConfirmed] =
    useState(false);

  const [isCoinTossing, setIsCoinTossing] =
    useState(false);

  const [myClassScores, setMyClassScores] =
    useState<number[]>([0, 0, 0]);

  const [oppClassScores, setOppClassScores] =
    useState<number[]>([0, 0, 0]);

  const [hostTotalScore, setHostTotalScore] =
    useState(0);

  const [guestTotalScore, setGuestTotalScore] =
    useState(0);

  const [usedSkillsByClass, setUsedSkillsByClass] =
    useState<Record<string, string[]>>({});

  const [
    cpuUsedSkillsByClass,
    setCpuUsedSkillsByClass,
  ] =
    useState<Record<string, string[]>>({});

  const [myHand, setMyHand] =
    useState<SupportCard[]>([]);

  const [myDeck, setMyDeck] =
    useState<SupportCard[]>([]);

  const [isDeckSelectOpen, setIsDeckSelectOpen] =
    useState(false);

  const [
    selectedDeckPreviewId,
    setSelectedDeckPreviewId,
  ] =
    useState<string | null>(null);

  const [activeDeckId, setActiveDeckId] =
    useState<string | null>(() =>
      typeof window !== 'undefined'
        ? localStorage.getItem(
            'reality_active_deck_id',
          )
        : null,
    );

  const [log, setLog] =
    useState<string[]>([]);

  const [modalAvatar, setModalAvatar] =
    useState<BattleAvatar | null>(
      null,
    );

  const [
    rematchChoice,
    setRematchChoice,
  ] =
    useState<
      'rematch' | 'exit' | null
    >(null);

  const [waitingMessage, setWaitingMessage] =
    useState('');

  const [waitingMode, setWaitingMode] =
    useState<
      'opponent' | 'return'
    >('opponent');

  const [
    preparationMessage,
    setPreparationMessage,
  ] =
    useState('');

  const [
    showOpponentDisconnectModal,
    setShowOpponentDisconnectModal,
  ] =
    useState(false);

  const [
    opponentDisconnectMessage,
    setOpponentDisconnectMessage,
  ] =
    useState('');

  const [classResult, setClassResult] =
    useState<{
      completedYear: number;
      myScore: number;
      opponentScore: number;
      myTotal: number;
      opponentTotal: number;
    } | null>(null);

  const classTransitionInProgressRef =
    useRef(false);

  const [readyHost, setReadyHost] =
    useState(false);

  const [readyGuest, setReadyGuest] =
    useState(false);

  const [hostDeckId, setHostDeckId] =
    useState<string | null>(null);

  const [guestDeckId, setGuestDeckId] =
    useState<string | null>(null);

  const [
    classReadyYearHost,
    setClassReadyYearHost,
  ] =
    useState(0);

  const [
    classReadyYearGuest,
    setClassReadyYearGuest,
  ] =
    useState(0);

  const getBattleBgmSection = (
    year: number,
  ) =>
    year === 1
      ? 'feather'
      : year === 2
        ? 'aurora'
        : 'star';

  useEffect(() => {
    if (battlePhase === 'setup') {
      return;
    }

    if (battlePhase === 'waiting') {
      stopBgm();
      return;
    }

    if (battlePhase === 'finished') {
      playBgm('result');
      return;
    }

    playBgm(
      getBattleBgmSection(
        currentYear,
      ),
    );
  }, [
    battlePhase,
    currentYear,
  ]);

  const [
    activeCardsRevealed,
    setActiveCardsRevealed,
  ] =
    useState(false);

  const [
    battleDealAnimationKey,
    setBattleDealAnimationKey,
  ] =
    useState(0);

  const [
    battleDealAnimationActive,
    setBattleDealAnimationActive,
  ] =
    useState(false);

  const [
    selectedSupportCardIndex,
    setSelectedSupportCardIndex,
  ] =
    useState<number | null>(null);

  const [
    selectedSetupSupportCard,
    setSelectedSetupSupportCard,
  ] =
    useState<SupportCard | null>(null);

  const [
    showBattleLog,
    setShowBattleLog,
  ] =
    useState(false);

  const [
    selectedSkillDetail,
    setSelectedSkillDetail,
  ] =
    useState<Skill | null>(null);

  const [
    supportSubmittingCardIndex,
    setSupportSubmittingCardIndex,
  ] =
    useState<number | null>(null);

  const [
    revealingSupportCardIndexes,
    setRevealingSupportCardIndexes,
  ] =
    useState<number[]>([]);

  const [
    supportDealAnimationKey,
    setSupportDealAnimationKey,
  ] =
    useState(0);

  const [
    supportDealAnimationActive,
    setSupportDealAnimationActive,
  ] =
    useState(false);

  const [
    supportDealAnimationCount,
    setSupportDealAnimationCount,
  ] =
    useState(0);

  const [
    skillStatSelection,
    setSkillStatSelection,
  ] =
    useState<{
      skillId: string;
      mode: 'response' | 'burst';
    } | null>(null);

  const [
    opponentHandCount,
    setOpponentHandCount,
  ] =
    useState(0);

  const [
    opponentDeckCount,
    setOpponentDeckCount,
  ] =
    useState(0);

  const lastActionRef =
    useRef<string>('');

  const lastSkillActionRef =
    useRef<string>('');

  const lastSupportActionRef =
    useRef<string>('');

  const lastObservedBattlePhaseRef =
    useRef<string>('');

  const lastObservedYearRef =
    useRef<number>(1);

  const initializedRef =
    useRef(false);

  const rematchPlayerResetInProgressRef =
    useRef(false);

  const skillSubmitInProgressRef =
    useRef(false);

  const currentUserUidRef =
    useRef('');

  const opponentDisconnectDismissedUntilRef =
    useRef<number>(0);

  const roomCloseRedirectRef =
    useRef<number | null>(null);

  const supportSubmitInProgressRef =
    useRef(false);

  const supportDealTimerRef =
    useRef<number | null>(null);

  const supportRevealTimerRef =
    useRef<number | null>(null);

  const supportPointerStartRef =
    useRef<{
      index: number;
      y: number;
    } | null>(null);

  const supportClickSuppressRef =
    useRef(false);

  const myActiveCardAnchorRef =
    useRef<HTMLDivElement | null>(
      null,
    );

  const opponentActiveCardAnchorRef =
    useRef<HTMLDivElement | null>(
      null,
    );

  const myDisplayCardCacheRef =
    useRef<Record<string, AvatarCard>>({});

  const opponentDisplayCardCacheRef =
    useRef<Record<string, AvatarCard>>({});

  const addLog = (
    message: string,
  ) =>
    setLog((prev) => [
      message,
      ...prev,
    ]);

  type BattleVisualCard =
    AvatarCard & {
      colorHex?: string;
      colorType?: string;
      flavorText?: string;
    };

  const getBattleVisualColorHex = (
    card: AvatarCard,
  ) =>
    (card as BattleVisualCard)
      .colorHex;

  const getBattleColorTypeLabel = (
    card: AvatarCard,
  ): string => {
    const visualCard =
      card as BattleVisualCard;

    if (
      visualCard.colorType ===
        'マゼンタ系' ||
      visualCard.colorType ===
        'シアン系' ||
      visualCard.colorType ===
        'イエロー系'
    ) {
      return visualCard.colorType;
    }

    return (
      COLOR_TYPE_LABELS[
        card.color as
          | '赤'
          | '青'
          | '黄'
      ] ||
      card.color
    );
  };

  const getBattleFlavorText = (
    card: AvatarCard,
  ): string =>
    (
      (card as BattleVisualCard)
        .flavorText || ''
    ).trim();

  const getSupportBattleTarget = (
    preset:
      | EmotionPreset
      | undefined,
    actorIsLocal: boolean,
  ):
    | 'self'
    | 'opponent'
    | 'both' => {
    if (
      !preset ||
      preset.target ===
        '自分・相手'
    ) {
      return 'both';
    }

    if (
      preset.target === '自分'
    ) {
      return actorIsLocal
        ? 'self'
        : 'opponent';
    }

    return actorIsLocal
      ? 'opponent'
      : 'self';
  };

  const hydrateBattleAvatarForDisplay = (
    avatar: BattleAvatar,
    cache: Record<
      string,
      AvatarCard
    >,
  ): BattleAvatar => {
    const cachedCard =
      cache[
        avatar.card?.id
      ];

    if (!cachedCard) {
      return avatar;
    }

    const authoritativeStats =
      avatar.baseStats ||
      avatar.stats ||
      cachedCard.stats;

    return {
      ...avatar,
      card: {
        ...cachedCard,
        ...avatar.card,
        id: avatar.card.id,
        userName:
          avatar.card.userName ||
          cachedCard.userName,
        stats:
          authoritativeStats,
      },
    };
  };

  const hydrateSupportCardsForDisplay = (
    cards: SupportCard[],
  ): SupportCard[] => {
    try {
      const entriesRaw =
        localStorage.getItem(
          'reality_world_entries',
        );

      const entries:
        EntryRecordWithSkills[] =
        entriesRaw
          ? JSON.parse(
              entriesRaw,
            )
          : [];

      const pool =
        getSupportPool(
          entries,
        );

      const byId =
        new Map(
          pool.map(
            (card) => [
              card.id,
              card,
            ],
          ),
        );

      return cards.map(
        (card) => ({
          ...(byId.get(
            card.id,
          ) || {}),
          ...card,
        }),
      );
    } catch {
      return cards;
    }
  };

  const buildCpuDeck =
    () => {
      const shuffledCharacters = [
        ...CHARACTER_SAMPLE_CARDS,
      ].sort(
        () =>
          Math.random() -
          0.5,
      );

      const selectedCharacters =
        shuffledCharacters.slice(
          0,
          3,
        );

      const roleOrder: RoleName[] =
        [
          '先鋒',
          '中堅',
          '大将',
        ];

      const cpuAvatars =
        selectedCharacters.map(
          (
            sample,
            index,
          ) => {
            const preset =
              COORDINATE_PRESETS.find(
                (p) =>
                  p.id ===
                  sample.presetId,
              );

            const card =
              sample as AvatarCard & {
                presetId?: string;
                customSkills?: string[];
              };

            const stats = preset
              ? {
                  ...preset.stats,
                }
              : {
                  ...sample.stats,
                };

            const battleCard =
              preset
                ? {
                    ...card,
                    stats,
                    archetype:
                      preset.archetype,
                    favoredSeason:
                      preset.season,
                  }
                : card;

            return {
              card:
                battleCard,
              roleName:
                roleOrder[
                  index
                ],
              stats,
              baseStats: {
                ...stats,
              },
              currentDebuff:
                {
                  hp: 0,
                  intellect: 0,
                  dexterity: 0,
                  charm: 0,
                },
              debuffImmune: false,
              seasonAbilityText:
                `${battleCard.favoredSeason}が得意`,
              skills:
                buildSkills(
                  sample.customSkills,
                  preset,
                ),
              statBoost: {},
              supportEffects: [],
              supportControlEffects:
                [],
            } as BattleAvatar;
          },
        );

      const virtualSupports =
        createVirtualSupportCards(
          new Set(),
        );

      const shuffledSupports =
        [
          ...virtualSupports,
        ].sort(
          () =>
            Math.random() -
            0.5,
        );

      const selectedSupports:
        SupportCard[] = [];

      const counts =
        new Map<string, number>();

      let cursor = 0;

      while (
        selectedSupports.length <
          BATTLE_DECK_SIZE &&
        cursor <
          shuffledSupports.length *
            3
      ) {
        const card =
          shuffledSupports[
            cursor %
              shuffledSupports.length
          ];

        const count =
          counts.get(
            card.id,
          ) || 0;

        if (count < 2) {
          selectedSupports.push(
            card,
          );

          counts.set(
            card.id,
            count + 1,
          );
        }

        cursor += 1;
      }

      const shuffledDeck =
        [
          ...selectedSupports,
        ].sort(
          () =>
            Math.random() -
            0.5,
        );

      setOppAvatars(
        cpuAvatars,
      );

      setCpuSupportDeck(
        shuffledDeck,
      );

      setCpuHand(
        shuffledDeck.slice(
          0,
          INITIAL_HAND_SIZE,
        ),
      );

      setCpuDeck(
        shuffledDeck.slice(
          INITIAL_HAND_SIZE,
        ),
      );

      addLog(
        `CPUチームを構築：キャラ3人＋サポート${shuffledDeck.length}枚`,
      );
    };

  const loadDeckAndAvatars = (
    targetDeckId?: string | null,
  ): BattleAvatar[] => {
    let result =
      DEFAULT_MY_AVATARS;

    try {
      const decksRaw =
        localStorage.getItem(
          'reality_decks',
        );

      const entriesRaw =
        localStorage.getItem(
          'reality_world_entries',
        );

      const decks: Deck[] =
        decksRaw
          ? JSON.parse(
              decksRaw,
            )
          : [];

      const entries:
        EntryRecordWithSkills[] =
        entriesRaw
          ? JSON.parse(
              entriesRaw,
            )
          : [];

      const chosen =
        decks.find(
          (d) =>
            d.id ===
            targetDeckId,
        ) ||
        decks[0];

      if (!chosen) {
        return result;
      }

      localStorage.setItem(
        'reality_active_deck_id',
        chosen.id,
      );

      setActiveDeckId(
        chosen.id,
      );

      const cards: Array<
        AvatarCard & {
          colorHex?: string;
          colorType?: string;
          flavorText?: string;
          presetId?: string;
          customSkills?: string[];
        }
      > = [
        ...CHARACTER_SAMPLE_CARDS,
      ];

      for (
        const entry of entries.filter(
          (e) =>
            e.cardType ===
            'coordinate',
        )
      ) {
        const archetype =
          (entry.archetype as Archetype) ||
          'マッスル型';

        const fallback =
          cards.find(
            (c) =>
              c.id ===
              entry.id,
          );

        cards.push({
          id: entry.id,
          profileUrl:
            entry.profileUrl ||
            '',
          userName:
            entry.userName ||
            'キャラ',
          imageDataUrl:
            entry.imageDataUrl ||
            fallback?.imageDataUrl ||
            '',
          color:
            (entry.color as
              | '赤'
              | '青'
              | '黄') ||
            '赤',
          ...(entry.colorHex
            ? {
                colorHex:
                  entry.colorHex,
              }
            : {}),
          ...(entry.colorType
            ? {
                colorType:
                  entry.colorType,
              }
            : {}),
          flavorText:
            entry.flavorText ||
            '',
          archetype,
          favoredSeason:
            archetype ===
            'マッスル型'
              ? '春'
              : archetype ===
                  '頭脳型'
                ? '秋'
                : archetype ===
                    '職人型'
                  ? '冬'
                  : '夏',
          stats: {
            hp:
              entry.hp ??
              80,
            intellect:
              entry.ap ??
              20,
            dexterity: 20,
            charm: 20,
          },
          passwordHash:
            entry.passwordHash ||
            '',
          createdAt:
            entry.createdAt ||
            '',
          updatedAt:
            entry.createdAt ||
            '',
          ...(entry.customSkills
            ? ({
                customSkills:
                  entry.customSkills,
              } as never)
            : {}),
          ...(entry.presetId
            ? ({
                presetId:
                  entry.presetId,
              } as never)
            : {}),
        });
      }

      const make = (
        id: string | null,
        role: RoleName,
        _index: number,
      ) => {
        const card =
          cards.find(
            (c) =>
              c.id === id,
          );

        if (!card) {
          return null;
        }

        const entry =
          entries.find(
            (e) =>
              e.id ===
              card.id,
          );

        const enrichedCard =
          card as AvatarCard & {
            presetId?: string;
            coordinateCode?: string;
            code?: string;
            customSkills?: [
              string,
              string,
              string,
              string,
            ];
          };

        const preset =
          getPresetForCard(
            enrichedCard,
          );

        const names =
          entry?.customSkills ||
          enrichedCard.customSkills;

        const stats = preset
          ? {
              ...preset.stats,
            }
          : {
              ...card.stats,
            };

        const battleCard = preset
          ? {
              ...card,
              stats,
              archetype:
                preset.archetype,
              favoredSeason:
                preset.season,
            }
          : card;

        const avatar:
          BattleAvatar = {
          card:
            battleCard,
          roleName:
            role,
          stats,
          baseStats: {
            ...stats,
          },
          currentDebuff:
            {
              hp: 0,
              intellect: 0,
              dexterity: 0,
              charm: 0,
            },
          debuffImmune: false,
          seasonAbilityText:
            `${battleCard.favoredSeason}が得意`,
          skills:
            buildSkills(
              names,
              preset,
            ),
          statBoost: {},
          supportEffects: [],
          supportControlEffects:
            [],
        };

        myDisplayCardCacheRef.current[
          avatar.card.id
        ] = {
          ...(
            myDisplayCardCacheRef.current[
              avatar.card.id
            ] || {}
          ),
          ...avatar.card,
        };

        return avatar;
      };

      const loaded = [
        make(
          chosen.vanguardCardId,
          '先鋒',
          0,
        ),
        make(
          chosen.centerCardId,
          '中堅',
          1,
        ),
        make(
          chosen.generalCardId,
          '大将',
          2,
        ),
      ].filter(
        Boolean,
      ) as BattleAvatar[];

      if (
        loaded.length ===
        3
      ) {
        result = loaded;
        setMyAvatars(
          loaded,
        );

        addLog(
          `チーム「${chosen.name}」を読み込みました。`,
        );
      }
    } catch (error) {
      console.error(
        'チーム読み込みエラー:',
        error,
      );
    }

    return result;
  };

  const getSupportPool = (
    entries: EntryRecordWithSkills[],
  ) => {
    const emotionEntries =
      entries.filter(
        (entry) =>
          entry.cardType ===
          'emotion',
      );

    const enteredPresetIds =
      new Set(
        emotionEntries
          .map(
            (entry) =>
              entry.presetId,
          )
          .filter(
            (
              id,
            ): id is string =>
              Boolean(id),
          ),
      );

    const virtualSupports =
      createVirtualSupportCards(
        enteredPresetIds,
      ).map(
        (card) => ({
          ...card,
          presetId:
            card.id.match(
              /emo_\d{2}$/,
            )?.[0] ||
            (card.id.startsWith(
              VIRTUAL_SUPPORT_PREFIX,
            )
              ? card.id.slice(
                  VIRTUAL_SUPPORT_PREFIX.length,
                )
              : undefined),
        }),
      );

    const realSupports:
      Array<
        SupportCard &
          SupportCardDisplayMeta & {
            imageDataUrl?: string;
            presetId?: string;
          }
      > =
      emotionEntries.map(
        (entry) => {
          const name =
            entry.customEffectName ||
            entry.userName ||
            'サポート';

          return {
            id: entry.id,
            name,
            description:
              entry.effect ||
              entry.description ||
              '',
            imageDataUrl:
              entry.imageDataUrl ||
              `/support_sample/${encodeURIComponent(
                name,
              )}.jpg`,
            presetId:
              entry.presetId,
            flavorText:
              entry.flavorText ||
              '',
            colorHex:
              entry.colorHex,
            colorType:
              entry.colorType,
          };
        },
      );

    return [
      ...virtualSupports,
      ...realSupports,
    ];
  };

  const resolveSupportIdsForBattle = (
    ids: string[],
    entries: EntryRecordWithSkills[],
  ) => {
    const emotionEntries =
      entries.filter(
        (entry) =>
          entry.cardType ===
          'emotion',
      );

    const realByPreset =
      new Map<
        string,
        string[]
      >();

    emotionEntries.forEach(
      (entry) => {
        if (!entry.presetId) {
          return;
        }

        const list =
          realByPreset.get(
            entry.presetId,
          ) || [];

        list.push(
          entry.id,
        );

        realByPreset.set(
          entry.presetId,
          list,
        );
      },
    );

    const used =
      new Map<
        string,
        number
      >();

    return ids.map(
      (id) => {
        if (
          !id.startsWith(
            VIRTUAL_SUPPORT_PREFIX,
          )
        ) {
          return id;
        }

        const presetId =
          id.slice(
            VIRTUAL_SUPPORT_PREFIX.length,
          );

        const realIds =
          realByPreset.get(
            presetId,
          );

        if (
          !realIds?.length
        ) {
          return id;
        }

        const index =
          used.get(
            presetId,
          ) || 0;

        used.set(
          presetId,
          index + 1,
        );

        return realIds[
          index %
            realIds.length
        ];
      },
    );
  };

  const resetLocalSupportDeck = (
    deck?: Deck | null,
  ): {
    hand: SupportCard[];
    deck: SupportCard[];
  } => {
    try {
      const entriesRaw =
        localStorage.getItem(
          'reality_world_entries',
        );

      const entries:
        EntryRecordWithSkills[] =
        entriesRaw
          ? JSON.parse(
              entriesRaw,
            )
          : [];

      const pool =
        getSupportPool(
          entries,
        );

      const ids =
        resolveSupportIdsForBattle(
          deck?.supportCardIds ||
            [],
          entries,
        );

      const selected =
        ids
          .map(
            (id) =>
              pool.find(
                (card) =>
                  card.id ===
                  id,
              ),
          )
          .filter(
            (
              card,
            ): card is SupportCard =>
              Boolean(card),
          );

      const source =
        selected.length > 0
          ? selected
          : createVirtualSupportCards(
              new Set(),
            );

      if (
        source.length ===
        0
      ) {
        setMyHand([]);
        setMyDeck([]);

        return {
          hand: [],
          deck: [],
        };
      }

      const battleDeck =
        Array.from(
          {
            length:
              BATTLE_DECK_SIZE,
          },
          (
            _,
            index,
          ) =>
            source[
              index %
                source.length
            ],
        );

      const shuffled =
        battleDeck.sort(
          () =>
            Math.random() -
            0.5,
        );

      const initialHand =
        shuffled.slice(
          0,
          INITIAL_HAND_SIZE,
        );

      const initialDeck =
        shuffled.slice(
          INITIAL_HAND_SIZE,
        );

      setMyHand(
        initialHand,
      );

      setMyDeck(
        initialDeck,
      );

      return {
        hand:
          initialHand,
        deck:
          initialDeck,
      };
    } catch (error) {
      console.error(
        'サポートチーム初期化エラー:',
        error,
      );

      const source =
        createVirtualSupportCards(
          new Set(),
        );

      if (
        source.length ===
        0
      ) {
        setMyHand([]);
        setMyDeck([]);

        return {
          hand: [],
          deck: [],
        };
      }

      const battleDeck =
        Array.from(
          {
            length:
              BATTLE_DECK_SIZE,
          },
          (
            _,
            index,
          ) =>
            source[
              index %
                source.length
            ],
        );

      const shuffled =
        battleDeck.sort(
          () =>
            Math.random() -
            0.5,
        );

      const initialHand =
        shuffled.slice(
          0,
          INITIAL_HAND_SIZE,
        );

      const initialDeck =
        shuffled.slice(
          INITIAL_HAND_SIZE,
        );

      setMyHand(
        initialHand,
      );

      setMyDeck(
        initialDeck,
      );

      return {
        hand:
          initialHand,
        deck:
          initialDeck,
      };
    }
  };

  const myPlayerRef =
    useMemo(
      () =>
        isOnline &&
        roomId
          ? doc(
              db,
              'rooms',
              roomId,
              'players',
              playerRole,
            )
          : null,
      [
        isOnline,
        roomId,
        playerRole,
      ],
    );

  const myPresenceRef =
    useMemo(
      () =>
        isOnline &&
        roomId
          ? doc(
              db,
              'rooms',
              roomId,
              'presence',
              playerRole,
            )
          : null,
      [
        isOnline,
        roomId,
        playerRole,
      ],
    );

  const myPrivatePlayerRef =
    useMemo(
      () =>
        isOnline &&
        roomId
          ? doc(
              db,
              'rooms',
              roomId,
              'privatePlayers',
              playerRole,
            )
          : null,
      [
        isOnline,
        roomId,
        playerRole,
      ],
    );

  const opponentRole: PlayerRole =
    playerRole ===
    'host'
      ? 'guest'
      : 'host';

  const opponentPlayerRef =
    useMemo(
      () =>
        isOnline &&
        roomId
          ? doc(
              db,
              'rooms',
              roomId,
              'players',
              opponentRole,
            )
          : null,
      [
        isOnline,
        roomId,
        opponentRole,
      ],
    );

  useEffect(() => {
    const loaded =
      loadDeckAndAvatars(
        activeDeckId,
      );

    let selectedDeck:
      | Deck
      | null =
      null;

    try {
      const raw =
        localStorage.getItem(
          'reality_decks',
        );

      const decks: Deck[] =
        raw
          ? JSON.parse(raw)
          : [];

      selectedDeck =
        decks.find(
          (deck) =>
            deck.id ===
            activeDeckId,
        ) ||
        decks[0] ||
        null;
    } catch {
      selectedDeck =
        null;
    }

    const initialSupportState =
      isOnline
        ? {
            hand:
              [] as SupportCard[],
            deck:
              [] as SupportCard[],
          }
        : resetLocalSupportDeck(
            selectedDeck,
          );

    setMyDeckReady(
      Boolean(selectedDeck),
    );

    setDeckConfirmed(false);

    if (!isOnline) {
      buildCpuDeck();

      setPreparationMessage(
        'チームを確認して「このチームではじめる」を押してください。',
      );

      setOpponentHandCount(
        INITIAL_HAND_SIZE,
      );

      setOpponentDeckCount(
        Math.max(
          0,
          BATTLE_DECK_SIZE -
            INITIAL_HAND_SIZE,
        ),
      );

      return;
    }

    if (
      !myPlayerRef ||
      !authReady
    ) {
      return;
    }

    let cancelled =
      false;

    void (async () => {
      try {
        const currentUser =
          await ensureAnonymousAuth();

        if (cancelled) {
          return;
        }

        await setDoc(
          myPrivatePlayerRef!,
          {
            uid:
              currentUser.uid,
            hand:
              initialSupportState.hand,
            deck:
              initialSupportState.deck,
          },
          {
            merge: true,
          },
        );

        await updateDoc(
          myPlayerRef,
          {
            uid:
              currentUser.uid,
            role:
              playerRole,
            joined:
              true,
            avatars:
              loaded,
            hand:
              deleteField(),
            deck:
              deleteField(),
            usedSkills:
              {},
            lastProcessedIncomingActionId:
              '',
            handCount:
              initialSupportState.hand.length,
            deckCount:
              initialSupportState.deck.length,
          },
        );
      } catch (error) {
        console.error(
          '自分のPlayerデータ公開エラー:',
          error,
        );
      }
    })();

    return () => {
      cancelled =
        true;
    };
  }, [
    roomId,
    playerRole,
    authReady,
    isOnline,
    activeDeckId,
    myPlayerRef,
  ]);

  useEffect(() => {
    if (
      !roomId ||
      !authReady ||
      !myPresenceRef
    ) {
      return;
    }

    const writeHeartbeat =
      () => {
        if (
          skillSubmitInProgressRef.current
        ) {
          return;
        }

        void setDoc(
          myPresenceRef,
          {
            uid:
              currentUserUidRef.current,
            role:
              playerRole,
            lastSeenAt:
              Date.now(),
          },
          {
            merge:
              true,
          },
        ).catch(
          (error) => {
            console.warn(
              'Presenceハートビート保存エラー:',
              error,
            );
          },
        );
      };

    writeHeartbeat();

    const timer =
      window.setInterval(
        writeHeartbeat,
        10000,
      );

    return () => {
      window.clearInterval(
        timer,
      );
    };
  }, [
    roomId,
    authReady,
    myPresenceRef,
    playerRole,
  ]);

  useEffect(() => {
    if (
      !isOnline ||
      !roomId ||
      !authReady
    ) {
      return;
    }

    const opponentPresenceRef =
      doc(
        db,
        'rooms',
        roomId,
        'presence',
        opponentRole,
      );

    let opponentLastSeenAt =
      0;

    const DISCONNECT_WARNING_MS =
      30 * 1000;

    const CHECK_INTERVAL_MS =
      5 * 1000;

    const unsubscribe =
      onSnapshot(
        opponentPresenceRef,
        (snapshot) => {
          if (
            !snapshot.exists()
          ) {
            opponentLastSeenAt =
              0;
            return;
          }

          const data =
            snapshot.data() as Record<
              string,
              unknown
            >;

          opponentLastSeenAt =
            Number(
              data.lastSeenAt ||
                0,
            );

          if (
            opponentLastSeenAt >
            0
          ) {
            setShowOpponentDisconnectModal(
              false,
            );

            setOpponentDisconnectMessage(
              '',
            );

            opponentDisconnectDismissedUntilRef.current =
              0;
          }
        },
        (error) => {
          console.warn(
            '相手Player監視エラー:',
            error,
          );
        },
      );

    const timer =
      window.setInterval(
        () => {
          if (
            opponentLastSeenAt <=
            0
          ) {
            return;
          }

          const elapsed =
            Date.now() -
            opponentLastSeenAt;

          if (
            elapsed <
            DISCONNECT_WARNING_MS
          ) {
            return;
          }

          if (
            Date.now() <
            opponentDisconnectDismissedUntilRef.current
          ) {
            return;
          }

          const opponentLabel =
            opponentRole ===
            'host'
              ? 'ルーム作成者'
              : 'ゲスト';

          setOpponentDisconnectMessage(
            `${opponentLabel}との通信が30秒以上確認できません。通信切断やページ離脱の可能性があります。`,
          );

          setShowOpponentDisconnectModal(
            true,
          );
        },
        CHECK_INTERVAL_MS,
      );

    return () => {
      unsubscribe();
      window.clearInterval(
        timer,
      );
    };
  }, [
    isOnline,
    roomId,
    authReady,
    opponentRole,
  ]);

  useEffect(() => {
    if (
      !roomId ||
      !authReady ||
      !isOnline
    ) {
      return;
    }

    const roomRef =
      doc(
        db,
        'rooms',
        roomId,
      );

    const myRef =
      doc(
        db,
        'rooms',
        roomId,
        'players',
        playerRole,
      );

    const myPrivateRef =
      doc(
        db,
        'rooms',
        roomId,
        'privatePlayers',
        playerRole,
      );

    const opponentRef =
      doc(
        db,
        'rooms',
        roomId,
        'players',
        opponentRole,
      );

    let currentRoomData:
      | Record<string, any>
      | null =
      null;

    let currentMyPlayerData:
      | Record<string, any>
      | null =
      null;

    let currentMyPrivatePlayerData:
      | Record<string, any>
      | null =
      null;

    let currentOpponentPlayerData:
      | Record<string, any>
      | null =
      null;

    const applyPlayerData =
      () => {
        if (
          currentMyPlayerData
        ) {
          const avatars =
            currentMyPlayerData.avatars;

          if (
            Array.isArray(
              avatars,
            ) &&
            avatars.length ===
              3
          ) {
            for (
              const avatar of avatars as BattleAvatar[]
            ) {
              if (
                avatar?.card?.id &&
                avatar.card
                  .imageDataUrl
              ) {
                myDisplayCardCacheRef.current[
                  avatar.card.id
                ] = {
                  ...(
                    myDisplayCardCacheRef.current[
                      avatar.card.id
                    ] || {}
                  ),
                  ...avatar.card,
                };
              }
            }

            setMyAvatars(
              (
                avatars as BattleAvatar[]
              ).map(
                (avatar) =>
                  hydrateBattleAvatarForDisplay(
                    {
                      ...avatar,
                      baseStats:
                        avatar.baseStats ||
                        {
                          ...avatar
                            .card
                            .stats,
                        },
                      currentDebuff:
                        avatar.currentDebuff ||
                        {
                          hp: 0,
                          intellect: 0,
                          dexterity: 0,
                          charm: 0,
                        },
                      statBoost:
                        avatar.statBoost ||
                        {},
                      supportEffects:
                        avatar.supportEffects ||
                        [],
                      supportControlEffects:
                        avatar.supportControlEffects ||
                        [],
                    },
                    myDisplayCardCacheRef.current,
                  ),
              ),
            );
          }

          const usedSkills =
            currentMyPlayerData.usedSkills;

          if (
            usedSkills &&
            typeof usedSkills ===
              'object'
          ) {
            setUsedSkillsByClass(
              usedSkills,
            );
          }
        }

        if (
          currentOpponentPlayerData
        ) {
          const avatars =
            currentOpponentPlayerData.avatars;

          if (
            Array.isArray(
              avatars,
            ) &&
            avatars.length ===
              3
          ) {
            for (
              const avatar of avatars as BattleAvatar[]
            ) {
              if (
                avatar?.card?.id &&
                avatar.card
                  .imageDataUrl
              ) {
                opponentDisplayCardCacheRef.current[
                  avatar.card.id
                ] = {
                  ...(
                    opponentDisplayCardCacheRef.current[
                      avatar.card.id
                    ] || {}
                  ),
                  ...avatar.card,
                };
              }
            }

            setOppAvatars(
              (
                avatars as BattleAvatar[]
              ).map(
                (avatar) =>
                  hydrateBattleAvatarForDisplay(
                    {
                      ...avatar,
                      baseStats:
                        avatar.baseStats ||
                        {
                          ...avatar
                            .card
                            .stats,
                        },
                      currentDebuff:
                        avatar.currentDebuff ||
                        {
                          hp: 0,
                          intellect: 0,
                          dexterity: 0,
                          charm: 0,
                        },
                      statBoost:
                        avatar.statBoost ||
                        {},
                      supportEffects:
                        avatar.supportEffects ||
                        [],
                      supportControlEffects:
                        avatar.supportControlEffects ||
                        [],
                    },
                    opponentDisplayCardCacheRef.current,
                  ),
              ),
            );
          }

          if (
            typeof currentOpponentPlayerData.handCount ===
            'number'
          ) {
            setOpponentHandCount(
              currentOpponentPlayerData.handCount,
            );
          }

          if (
            typeof currentOpponentPlayerData.deckCount ===
            'number'
          ) {
            setOpponentDeckCount(
              currentOpponentPlayerData.deckCount,
            );
          }
        }
      };

    const unsubscribeRoom =
      onSnapshot(
        roomRef,
        async (snapshot) => {
          if (
            !snapshot.exists()
          ) {
            setWaitingMode(
              'return',
            );

            setBattlePhase(
              'waiting',
            );

            setWaitingMessage(
              'このステージは終了しました。ホーム画面へ戻ります。',
            );

            return;
          }

          const data =
            snapshot.data() as Record<
              string,
              any
            >;

          if (
            data.roomClosed ===
            true
          ) {
            const otherExited =
              playerRole ===
              'host'
                ? data.exitGuest ===
                  true
                : data.exitHost ===
                  true;

            const message =
              otherExited
                ? '相手が退出しました。この対戦は終了しました。ホームへ戻ります。'
                : 'この対戦を終了しました。ホームへ戻ります。';

            setWaitingMode(
              'return',
            );

            setBattlePhase(
              'waiting',
            );

            setWaitingMessage(
              message,
            );

            if (
              roomCloseRedirectRef.current ===
              null
            ) {
              roomCloseRedirectRef.current =
                window.setTimeout(
                  () =>
                    window.location.assign(
                      '/',
                    ),
                  1200,
                );
            }

            return;
          }

          currentRoomData =
            data;

          try {
            const currentUid =
              (
                await ensureAnonymousAuth()
              ).uid;

            const expectedUid =
              playerRole ===
              'host'
                ? data.hostUid
                : data.guestUid;

            if (
              expectedUid &&
              currentUid &&
              expectedUid !==
                currentUid
            ) {
              setBattlePhase(
                'waiting',
              );

              setWaitingMessage(
                'このルームの参加者として認証できませんでした。',
              );

              return;
            }
          } catch (error) {
            console.error(
              'Room認証確認エラー:',
              error,
            );

            setBattlePhase(
              'waiting',
            );

            setWaitingMessage(
              'Firebase認証を確認できませんでした。',
            );

            return;
          }

          const observedPhase =
            (data.battlePhase as string) ||
            'setup';

          const observedYear =
            Number(
              data.currentYear ||
                1,
            );

          const wasBattle =
            lastObservedBattlePhaseRef.current ===
            'battle';

          const completedIndex =
            observedPhase ===
            'setup'
              ? observedYear -
                2
              : observedYear -
                1;

          if (
            wasBattle &&
            (
              (
                observedPhase ===
                  'setup' &&
                observedYear >
                  lastObservedYearRef.current
              ) ||
              observedPhase ===
                'finished'
            ) &&
            completedIndex >=
              0 &&
            completedIndex <
              3
          ) {
            const hostScores =
              Array.isArray(
                data.hostClassScores,
              )
                ? data.hostClassScores
                : [
                    0,
                    0,
                    0,
                  ];

            const guestScores =
              Array.isArray(
                data.guestClassScores,
              )
                ? data.guestClassScores
                : [
                    0,
                    0,
                    0,
                  ];

            const myScores =
              playerRole ===
              'host'
                ? hostScores
                : guestScores;

            const opponentScores =
              playerRole ===
              'host'
                ? guestScores
                : hostScores;

            const myTotal =
              myScores.reduce(
                (
                  sum: number,
                  score: number,
                ) =>
                  sum + score,
                0,
              );

            const opponentTotal =
              opponentScores.reduce(
                (
                  sum: number,
                  score: number,
                ) =>
                  sum + score,
                0,
              );

            showClassResult(
              completedIndex +
                1,
              Number(
                myScores[
                  completedIndex
                ] || 0,
              ),
              Number(
                opponentScores[
                  completedIndex
                ] || 0,
              ),
              myTotal,
              opponentTotal,
            );
          }

          lastObservedBattlePhaseRef.current =
            observedPhase;

          lastObservedYearRef.current =
            observedYear;

          setBattlePhase(
            (data.battlePhase as typeof battlePhase) ||
              'setup',
          );

          setCurrentYear(
            Number(
              data.currentYear ||
                1,
            ),
          );

          setTurnIndex(
            Number(
              data.turnIndex ??
                0,
            ),
          );

          setFirstPlayer(
            (data.firstPlayer as PlayerRole) ||
              null,
          );

          setStartSeasonIdx(
            typeof data.startSeasonIdx ===
              'number'
              ? data.startSeasonIdx
              : null,
          );

          setHostTotalScore(
            Number(
              data.hostTotalScore ??
                0,
            ),
          );

          setGuestTotalScore(
            Number(
              data.guestTotalScore ??
                0,
            ),
          );

          const roomReadyHost =
            Boolean(
              data.readyHost,
            );

          const roomReadyGuest =
            Boolean(
              data.readyGuest,
            );

          setReadyHost(
            roomReadyHost,
          );

          setReadyGuest(
            roomReadyGuest,
          );

          setHostDeckId(
            typeof data.hostDeckId ===
              'string'
              ? data.hostDeckId
              : null,
          );

          setGuestDeckId(
            typeof data.guestDeckId ===
              'string'
              ? data.guestDeckId
              : null,
          );

          setClassReadyYearHost(
            Number(
              data.classReadyYearHost ??
                0,
            ),
          );

          setClassReadyYearGuest(
            Number(
              data.classReadyYearGuest ??
                0,
            ),
          );

          setDeckConfirmed(
            playerRole ===
              'host'
              ? roomReadyHost
              : roomReadyGuest,
          );

          const classScores =
            playerRole ===
            'host'
              ? data.hostClassScores
              : data.guestClassScores;

          const opponentScores =
            playerRole ===
            'host'
              ? data.guestClassScores
              : data.hostClassScores;

          if (
            Array.isArray(
              classScores,
            ) &&
            classScores.length
          ) {
            setMyClassScores(
              classScores,
            );
          }

          if (
            Array.isArray(
              opponentScores,
            ) &&
            opponentScores.length
          ) {
            setOppClassScores(
              opponentScores,
            );
          }

          if (
            data.rematchHost &&
            data.rematchGuest
          ) {
            setRematchChoice(
              null,
            );

            setWaitingMessage(
              '',
            );
          }

          if (
            data.exitHost &&
            data.exitGuest
          ) {
            setWaitingMessage(
              '両者が退出を選択しました。このステージでのゲームは終了しました。',
            );
          }

          if (
            (
              data.rematchHost &&
              data.exitGuest
            ) ||
            (
              data.rematchGuest &&
              data.exitHost
            )
          ) {
            const rematcher: PlayerRole =
              data.rematchHost
                ? 'host'
                : 'guest';

            if (
              rematcher ===
              playerRole
            ) {
              setWaitingMode(
                'opponent',
              );

              setBattlePhase(
                'waiting',
              );

              setWaitingMessage(
                `現在対戦相手がいません。${playerRole === 'host' ? 'ルーム作成者' : 'ゲスト'}として待機中です。合言葉は「${roomId}」です。`,
              );
            }
          }
        },
      );

    const unsubscribeMyPlayer =
      onSnapshot(
        myRef,
        (snapshot) => {
          if (
            !snapshot.exists()
          ) {
            return;
          }

          currentMyPlayerData =
            snapshot.data() as Record<
              string,
              any
            >;

          applyPlayerData();
        },
        (error) => {
          console.error(
            '自分のPlayer購読エラー:',
            error,
          );
        },
      );

    const unsubscribeMyPrivatePlayer =
      onSnapshot(
        myPrivateRef,
        (snapshot) => {
          if (
            !snapshot.exists()
          ) {
            currentMyPrivatePlayerData =
              null;

            return;
          }

          currentMyPrivatePlayerData =
            snapshot.data() as Record<
              string,
              any
            >;

          const privateData =
            currentMyPrivatePlayerData;

          const playerHand =
            privateData.hand;

          if (
            Array.isArray(
              playerHand,
            )
          ) {
            setMyHand(
              hydrateSupportCardsForDisplay(
                playerHand as SupportCard[],
              ),
            );
          }

          const playerDeck =
            privateData.deck;

          if (
            Array.isArray(
              playerDeck,
            )
          ) {
            setMyDeck(
              hydrateSupportCardsForDisplay(
                playerDeck as SupportCard[],
              ),
            );
          }
        },
        (error) => {
          console.error(
            '自分のPrivatePlayer購読エラー:',
            error,
          );
        },
      );

    const unsubscribeOpponentPlayer =
      onSnapshot(
        opponentRef,
        (snapshot) => {
          if (
            !snapshot.exists()
          ) {
            currentOpponentPlayerData =
              null;

            return;
          }

          currentOpponentPlayerData =
            snapshot.data() as Record<
              string,
              any
            >;

          const lastSkillAction =
            currentOpponentPlayerData.lastSkillAction;

          if (
            lastSkillAction?.actionId &&
            lastSkillAction.actionId !==
              lastSkillActionRef.current
          ) {
            lastSkillActionRef.current =
              lastSkillAction.actionId;

            const gainedScore =
              Number(
                lastSkillAction.gainedScore ||
                  0,
              );

            addLog(
              gainedScore >
                0
                ? `相手が「${lastSkillAction.skillName || '技'}」を発動しました。 +${gainedScore}スコア`
                : `相手が「${lastSkillAction.skillName || '技'}」を発動しました。`,
            );
          }

          const lastSupportAction =
            currentOpponentPlayerData.lastSupportAction;

          if (
            lastSupportAction?.actionId &&
            lastSupportAction.actionId !==
              lastSupportActionRef.current
          ) {
            lastSupportActionRef.current =
              lastSupportAction.actionId;

            const actorScoreDelta =
              Number(
                lastSupportAction.actorScoreDelta ||
                  0,
              );

            const targetScoreDelta =
              Number(
                lastSupportAction.targetScoreDelta ||
                  0,
              );

            const scoreParts: string[] =
              [];

            if (
              actorScoreDelta !==
              0
            ) {
              scoreParts.push(
                `相手 ${actorScoreDelta > 0 ? '+' : ''}${actorScoreDelta}スコア`,
              );
            }

            if (
              targetScoreDelta !==
              0
            ) {
              scoreParts.push(
                `あなた ${targetScoreDelta > 0 ? '+' : ''}${targetScoreDelta}スコア`,
              );
            }

            addLog(
              `相手がサポート「${lastSupportAction.supportName || 'サポートカード'}」を使用しました。` +
                (
                  scoreParts.length >
                  0
                    ? ` ${scoreParts.join(' / ')}`
                    : ''
                ),
            );
          }

          const pendingAction =
            currentOpponentPlayerData.pendingAction;

          const lastProcessedIncomingActionId =
            typeof currentMyPlayerData?.lastProcessedIncomingActionId ===
            'string'
              ? currentMyPlayerData
                  .lastProcessedIncomingActionId
              : '';

          if (
            pendingAction?.actionId &&
            (
              pendingAction.type ===
                'PLAY_SUPPORT' ||
              pendingAction.type ===
                'USE_SKILL'
            ) &&
            pendingAction.actionId !==
              lastActionRef.current &&
            pendingAction.actionId !==
              lastProcessedIncomingActionId
          ) {
            lastActionRef.current =
              pendingAction.actionId;

            void Promise.resolve(
              handleIncomingActionRef.current(
                pendingAction,
              ),
            ).then(
              () => {
                void updateDoc(
                  myRef,
                  {
                    lastProcessedIncomingActionId:
                      pendingAction.actionId,
                  },
                ).catch(
                  (error) => {
                    console.error(
                      '受信済みAction ID保存エラー:',
                      error,
                    );
                  },
                );
              },
            );
          }

          applyPlayerData();
        },
        (error) => {
          console.warn(
            '相手Player購読待機:',
            error,
          );
        },
      );

    return () => {
      unsubscribeRoom();
      unsubscribeMyPlayer();
      unsubscribeMyPrivatePlayer();
      unsubscribeOpponentPlayer();

      if (
        roomCloseRedirectRef.current !==
        null
      ) {
        window.clearTimeout(
          roomCloseRedirectRef.current,
        );

        roomCloseRedirectRef.current =
          null;
      }
    };
  }, [
    roomId,
    playerRole,
    opponentRole,
    authReady,
    isOnline,
  ]);

  const currentSeasonIdx =
    startSeasonIdx ===
    null
      ? 0
      : (
          startSeasonIdx +
          Math.floor(
            turnIndex / 2,
          )
        ) % 4;

  const currentSeason =
    SEASONS[
      currentSeasonIdx
    ];

  const onlineDecksConfirmed =
    !isOnline ||
    (
      readyHost &&
      readyGuest &&
      Boolean(hostDeckId) &&
      Boolean(guestDeckId)
    );

  const onlineClassPreparationConfirmed =
    !isOnline ||
    (
      classReadyYearHost ===
        currentYear &&
      classReadyYearGuest ===
        currentYear
    );

  const myTurn =
    firstPlayer !==
      null &&
    (
      (
        turnIndex % 2 ===
        0
          ? firstPlayer
          : firstPlayer ===
              'host'
            ? 'guest'
            : 'host'
      ) === playerRole
    );

  const activeIndex =
    currentYear - 1;

  const myActiveAvatar =
    myAvatars[
      activeIndex
    ] ||
    DEFAULT_MY_AVATARS[
      activeIndex
    ];

  const oppActiveAvatar =
    oppAvatars[
      activeIndex
    ] ||
    DEFAULT_OPP_AVATARS[
      activeIndex
    ];

  const currentMyClassScore =
    myClassScores[
      activeIndex
    ] || 0;

  const currentOppClassScore =
    oppClassScores[
      activeIndex
    ] || 0;

  const triggerSupportDealAnimation =
    (
      count: number,
    ) => {
      const safeCount =
        Math.max(
          0,
          Math.min(
            4,
            count,
          ),
        );

      if (!safeCount) {
        return;
      }

      if (
        supportDealTimerRef.current !==
        null
      ) {
        window.clearTimeout(
          supportDealTimerRef.current,
        );
      }

      setSupportDealAnimationKey(
        (prev) =>
          prev + 1,
      );

      setSupportDealAnimationCount(
        safeCount,
      );

      setSupportDealAnimationActive(
        true,
      );

      supportDealTimerRef.current =
        window.setTimeout(
          () => {
            setSupportDealAnimationActive(
              false,
            );

            setSupportDealAnimationCount(
              0,
            );

            supportDealTimerRef.current =
              null;
          },
          1100,
        );
    };

  const revealSupportCardIndexes =
    (
      indexes: number[],
    ) => {
      const safeIndexes =
        Array.from(
          new Set(
            indexes.filter(
              (index) =>
                index >= 0,
            ),
          ),
        );

      if (
        !safeIndexes.length
      ) {
        return;
      }

      setRevealingSupportCardIndexes(
        (prev) =>
          Array.from(
            new Set([
              ...prev,
              ...safeIndexes,
            ]),
          ),
      );

      if (
        supportRevealTimerRef.current !==
        null
      ) {
        window.clearTimeout(
          supportRevealTimerRef.current,
        );
      }

      supportRevealTimerRef.current =
        window.setTimeout(
          () => {
            setRevealingSupportCardIndexes(
              [],
            );

            supportRevealTimerRef.current =
              null;
          },
          950,
        );
    };

  const getSupportTargetPositions =
    () => {
      const positions: {
        self?: {
          x: number;
          y: number;
        };
        opponent?: {
          x: number;
          y: number;
        };
      } = {};

      const selfRect =
        myActiveCardAnchorRef.current?.getBoundingClientRect();

      if (selfRect) {
        positions.self = {
          x:
            selfRect.left +
            selfRect.width /
              2,
          y:
            selfRect.top +
            selfRect.height *
              0.55,
        };
      }

      const opponentRect =
        opponentActiveCardAnchorRef.current?.getBoundingClientRect();

      if (opponentRect) {
        positions.opponent =
          {
            x:
              opponentRect.left +
              opponentRect.width /
                2,
            y:
              opponentRect.top +
              opponentRect.height *
                0.55,
          };
      }

      return positions;
    };

  const myTotalScore =
    myClassScores.reduce(
      (
        sum,
        score,
      ) =>
        sum + score,
      0,
    );

  const opponentTotalScore =
    oppClassScores.reduce(
      (
        sum,
        score,
      ) =>
        sum + score,
      0,
    );

  const mySideActiveAvatar =
    myActiveAvatar;

  const opponentSideActiveAvatar =
    oppActiveAvatar;

  const mySideActiveClassScore =
    currentMyClassScore;

  const opponentSideActiveClassScore =
    currentOppClassScore;

  useLayoutEffect(() => {
    if (
      battlePhase !==
      'battle'
    ) {
      setBattleDealAnimationActive(
        false,
      );

      setActiveCardsRevealed(
        true,
      );

      return;
    }

    setActiveCardsRevealed(
      false,
    );

    setBattleDealAnimationActive(
      false,
    );

    setBattleDealAnimationKey(
      (prev) =>
        prev + 1,
    );

    const dealTimer =
      window.setTimeout(
        () => {
          setBattleDealAnimationActive(
            true,
          );
        },
        450,
      );

    const revealTimer =
      window.setTimeout(
        () => {
          setActiveCardsRevealed(
            true,
          );

          setBattleDealAnimationActive(
            false,
          );
        },
        1500,
      );

    const supportInitialTimer =
      window.setTimeout(
        () => {
          const handCount =
            Math.min(
              INITIAL_HAND_SIZE,
              myHand.length,
            );

          triggerSupportDealAnimation(
            handCount,
          );

          revealSupportCardIndexes(
            Array.from(
              {
                length:
                  handCount,
              },
              (
                _,
                index,
              ) =>
                index,
            ),
          );
        },
        450,
      );

    return () => {
      window.clearTimeout(
        dealTimer,
      );

      window.clearTimeout(
        revealTimer,
      );

      window.clearTimeout(
        supportInitialTimer,
      );
    };
  }, [
    battlePhase,
    currentYear,
    activeIndex,
  ]);

  const getEffectiveStats = (
    avatar: BattleAvatar,
    turnOrdinal =
      getBattleTurnOrdinal(
        currentYear,
        turnIndex,
      ),
  ) => {
    const activeSupportEffects =
      (
        avatar.supportEffects ||
        []
      ).filter(
        (effect) =>
          isSupportEffectActive(
            effect,
            turnOrdinal,
          ),
      );

    const baseStats =
      avatar.baseStats ||
      avatar.stats;

    const supportStats = {
      hp: Math.max(
        0,
        baseStats.hp,
      ),
      intellect:
        Math.max(
          0,
          baseStats.intellect,
        ),
      dexterity:
        Math.max(
          0,
          baseStats.dexterity,
        ),
      charm: Math.max(
        0,
        baseStats.charm,
      ),
    };

    for (
      const effect of activeSupportEffects
    ) {
      if (
        effect.statDelta
      ) {
        for (
          const stat of STAT_KEYS
        ) {
          supportStats[
            stat
          ] = Math.max(
            0,
            supportStats[
              stat
            ] +
              Number(
                effect
                  .statDelta[
                    stat
                  ] || 0,
              ),
          );
        }
      }

      if (
        effect.statOverride
      ) {
        for (
          const stat of STAT_KEYS
        ) {
          if (
            typeof effect
              .statOverride[
                stat
              ] ===
            'number'
          ) {
            supportStats[
              stat
            ] = Math.max(
              0,
              Number(
                effect
                  .statOverride[
                    stat
                  ],
              ),
            );
          }
        }
      }
    }

    return {
      hp: Math.max(
        0,
        supportStats.hp *
          (avatar
            .statBoost
            ?.hp || 1) -
          avatar
            .currentDebuff
            .hp,
      ),
      intellect:
        Math.max(
          0,
          supportStats.intellect *
            (avatar
              .statBoost
              ?.intellect ||
              1) -
            avatar
              .currentDebuff
              .intellect,
        ),
      dexterity:
        Math.max(
          0,
          supportStats.dexterity *
            (avatar
              .statBoost
              ?.dexterity ||
              1) -
            avatar
              .currentDebuff
              .dexterity,
        ),
      charm: Math.max(
        0,
        supportStats.charm *
          (avatar
            .statBoost
            ?.charm || 1) -
          avatar
            .currentDebuff
            .charm,
      ),
    };
  };

  const previousTurnRef =
    useRef<string>('');

  const drawInProgressRef =
    useRef<string>('');

  const submitTurnDrawAction =
    async (
      year: number,
      turn: number,
      avatarIndex: number,
    ) => {
      if (
        !isOnline ||
        !roomId ||
        !authReady
      ) {
        return null;
      }

      try {
        const currentUser =
          await ensureAnonymousAuth();

        const actionId =
          `${currentUser.uid}-draw-${year}-${turn}`;

        const idToken =
          await currentUser.getIdToken();

        const response =
          await fetch(
            '/api/battle/action',
            {
              method:
                'POST',
              headers: {
                'Content-Type':
                  'application/json',
                Authorization:
                  `Bearer ${idToken}`,
              },
              body: JSON.stringify(
                {
                  roomId,
                  actionId,
                  type:
                    'DRAW_TURN',
                  year,
                  turnIndex:
                    turn,
                  avatarIndex,
                },
              ),
            },
          );

        const responseData =
          (await response.json()) as {
            ok?: boolean;
            error?: string;
            drawCount?: number;
            hand?: SupportCard[];
            deck?: SupportCard[];
          };

        if (
          !response.ok ||
          responseData.ok !==
            true
        ) {
          throw new Error(
            responseData.error ||
              'ターンドローAPIに失敗しました。',
          );
        }

        return {
          drawCount:
            Math.max(
              0,
              Number(
                responseData.drawCount ??
                  0,
              ),
            ),
          hand:
            Array.isArray(
              responseData.hand,
            )
              ? hydrateSupportCardsForDisplay(
                  responseData.hand,
                )
              : null,
          deck:
            Array.isArray(
              responseData.deck,
            )
              ? hydrateSupportCardsForDisplay(
                  responseData.deck,
                )
              : null,
        };
      } catch (error) {
        console.error(
          'ターンドローAPI送信エラー:',
          error,
        );

        return null;
      }
    };

  useEffect(() => {
    if (
      battlePhase !==
        'battle' ||
      !myTurn
    ) {
      return;
    }

    const key =
      `${currentYear}-${turnIndex}-${playerRole}`;

    if (
      previousTurnRef.current ===
      key
    ) {
      return;
    }

    if (
      drawInProgressRef.current ===
      key
    ) {
      return;
    }

    if (
      isOnline &&
      turnIndex === 0 &&
      myHand.length === 0 &&
      myDeck.length === 0
    ) {
      return;
    }

    const turnOrdinal =
      getBattleTurnOrdinal(
        currentYear,
        turnIndex,
      );

    const drawCount =
      Math.min(
        1 +
          getAdditionalDrawFromEffects(
            myActiveAvatar.supportControlEffects,
            turnOrdinal,
          ),
        Math.max(
          0,
          MAX_HAND -
            myHand.length,
        ),
        myDeck.length,
      );

addLog(
  `🔎 DRAW DEBUG: 年${currentYear}・${turnIndex + 1}ターン / 手札${myHand.length}枚 / 山札${myDeck.length}枚 / 追加ドロー${getAdditionalDrawFromEffects(
    myActiveAvatar.supportControlEffects,
    turnOrdinal,
  )}枚 / 今回ドロー${drawCount}枚`,
);

    if (
      drawCount <= 0
    ) {
      previousTurnRef.current =
        key;
      return;
    }

    drawInProgressRef.current =
      key;

    const drawnCards =
      myDeck.slice(
        0,
        drawCount,
      );

    const nextHand =
      [
        ...myHand,
        ...drawnCards,
      ];

    const nextDeck =
      myDeck.slice(
        drawCount,
      );

    let cancelled =
      false;

    const drawCard =
      async () => {
        if (cancelled) {
          return;
        }

        if (isOnline) {
          const result =
            await submitTurnDrawAction(
              currentYear,
              turnIndex,
              activeIndex,
            );

          if (!result) {
            drawInProgressRef.current =
              '';

            return;
          }

          if (
            result.hand &&
            result.deck
          ) {
            setMyHand(
              result.hand,
            );

            setMyDeck(
              result.deck,
            );
          }

          const observedDrawCount =
            result.hand &&
            result.hand.length >=
              myHand.length
              ? Math.max(
                  0,
                  result.hand.length -
                    myHand.length,
                )
              : 0;

          const actualDrawCount =
            Math.max(
              result.drawCount,
              observedDrawCount,
            );

          if (
            actualDrawCount >
            0
          ) {
            triggerSupportDealAnimation(
              actualDrawCount,
            );

            revealSupportCardIndexes(
              Array.from(
                {
                  length:
                    actualDrawCount,
                },
                (
                  _,
                  index,
                ) =>
                  myHand.length +
                  index,
              ),
            );
          }

          previousTurnRef.current =
            key;

          drawInProgressRef.current =
            '';

          addLog(
            actualDrawCount >
              0
              ? `サポートカードを${actualDrawCount}枚ドローしました。`
              : currentYear ===
                    1 &&
                  turnIndex ===
                    0
                ? 'サポートカードはすでに開始時の手札へ反映されています。'
                : 'サポートカードをドローできませんでした。',
          );

          return;
        }

        if (cancelled) {
          return;
        }

        setMyHand(
          nextHand,
        );

        setMyDeck(
          nextDeck,
        );

        triggerSupportDealAnimation(
          drawCount,
        );

        revealSupportCardIndexes(
          Array.from(
            {
              length:
                drawCount,
            },
            (
              _,
              index,
            ) =>
              myHand.length +
              index,
          ),
        );

        previousTurnRef.current =
          key;

        drawInProgressRef.current =
          '';

        addLog(
          `サポートカードを${drawCount}枚ドローしました。`,
        );
      };

    void drawCard();

    return () => {
      cancelled =
        true;
    };
  }, [
    battlePhase,
    myTurn,
    currentYear,
    turnIndex,
    playerRole,
    myHand,
    myDeck,
    isOnline,
    myActiveAvatar.supportControlEffects,
  ]);

  useEffect(() => {
    if (
      !isOnline ||
      !roomId ||
      !authReady ||
      !myPlayerRef ||
      battlePhase !==
        'setup'
    ) {
      return;
    }

    void updateDoc(
      myPlayerRef,
      {
        handCount:
          myHand.length,
        deckCount:
          myDeck.length,
      },
    ).catch(
      () => undefined,
    );
  }, [
    isOnline,
    roomId,
    authReady,
    myPlayerRef,
    battlePhase,
    myHand.length,
    myDeck.length,
  ]);

  type SupportCardDisplayMeta = {
    flavorText?: string;
    colorHex?: string;
    colorType?: string;
  };

  type BattleActionPayload = {
    actionId?: string;

    type:
      | 'USE_SKILL'
      | 'PLAY_SUPPORT';

    playerRole?: PlayerRole;
    uid?: string;

    year: number;
    turnIndex: number;
    avatarIndex: number;

    skillId?: string;

    selectedBoostStat?: StatKey;

    supportCardId?: string;
    supportPresetId?: string;
    supportFlavorText?: string;
    supportColorHex?: string;
  };

  const submitBattleLifecycleAction =
    async (
      type:
        | 'START_BATTLE'
        | 'REMATCH_RESET',
    ) => {
      if (
        !isOnline ||
        !roomId ||
        !authReady
      ) {
        return null;
      }

      try {
        const currentUser =
          await ensureAnonymousAuth();

        const actionId =
          `${currentUser.uid}-${type}-${Date.now()}-${Math.random()
            .toString(36)
            .slice(2)}`;

        const idToken =
          await currentUser.getIdToken();

        const response =
          await fetch(
            '/api/battle/action',
            {
              method:
                'POST',
              headers: {
                'Content-Type':
                  'application/json',
                Authorization:
                  `Bearer ${idToken}`,
              },
              body: JSON.stringify(
                {
                  roomId,
                  actionId,
                  type,
                },
              ),
            },
          );

        const responseData =
          (await response.json()) as {
            ok?: boolean;
            error?: string;
            result?: {
              firstPlayer?: PlayerRole;
              currentYear?: number;
              turnIndex?: number;
              battlePhase?:
                | 'setup'
                | 'battle';
              alreadyProcessed?: boolean;
            };
          };

        if (
          !response.ok ||
          responseData.ok !==
            true
        ) {
          throw new Error(
            responseData.error ||
              'Room進行Action APIに失敗しました。',
          );
        }

        return (
          responseData.result ??
          null
        );
      } catch (error) {
        console.error(
          'Room進行Action API送信エラー:',
          error,
        );

        return null;
      }
    };

  const submitBattleAction =
    async (
      action: BattleActionPayload,
    ) => {
      if (
        !isOnline ||
        !roomId ||
        !authReady
      ) {
        return false;
      }

      try {
        const currentUser =
          await ensureAnonymousAuth();

        const actionId =
          action.actionId ||
          `${currentUser.uid}-${Date.now()}-${Math.random()
            .toString(36)
            .slice(2)}`;

        const idToken =
          await currentUser.getIdToken();

        if (
          action.type ===
          'USE_SKILL'
        ) {
          const response =
            await fetch(
              '/api/battle/action',
              {
                method:
                  'POST',
                headers: {
                  'Content-Type':
                    'application/json',
                  Authorization:
                    `Bearer ${idToken}`,
                },
                body: JSON.stringify(
                  {
                    roomId,
                    actionId,
                    type:
                      action.type,
                    year:
                      action.year,
                    turnIndex:
                      action.turnIndex,
                    avatarIndex:
                      action.avatarIndex,
                    skillId:
                      action.skillId,
                    ...(action.selectedBoostStat
                      ? {
                          selectedBoostStat:
                            action.selectedBoostStat,
                        }
                      : {}),
                  },
                ),
              },
            );

          const responseData =
            (await response.json()) as {
              ok?: boolean;
              error?: string;
            };

          if (
            !response.ok ||
            responseData.ok !==
              true
          ) {
            throw new Error(
              responseData.error ||
                'Battle Action APIに失敗しました。',
            );
          }

          return true;
        }

        if (
          action.type ===
          'PLAY_SUPPORT'
        ) {
          if (
            !action.supportCardId
          ) {
            addLog(
              '⚠️ supportCardIdがありません。',
            );

            return false;
          }

          const response =
            await fetch(
              '/api/battle/action',
              {
                method:
                  'POST',
                headers: {
                  'Content-Type':
                    'application/json',
                  Authorization:
                    `Bearer ${idToken}`,
                },
                body: JSON.stringify(
                  {
                    roomId,
                    actionId,
                    type:
                      action.type,
                    year:
                      action.year,
                    turnIndex:
                      action.turnIndex,
                    avatarIndex:
                      action.avatarIndex,
                    supportCardId:
                      action.supportCardId,
                  },
                ),
              },
            );

          const responseData =
            (await response.json()) as {
              ok?: boolean;
              error?: string;
            };

          if (
            !response.ok ||
            responseData.ok !==
              true
          ) {
            throw new Error(
              responseData.error ||
                'Battle Support Action APIに失敗しました。',
            );
          }

          return true;
        }

        addLog(
          '⚠️ 未対応のオンラインActionです。',
        );

        return false;
      } catch (error) {
        console.error(
          'Battle Action送信エラー:',
          error,
        );

        addLog(
          '⚠️ アクションの送信に失敗しました。',
        );

        return false;
      }
    };

  const handleIncomingActionRef =
    useRef<
      (
        action: BattleActionPayload & {
          playerRole?: PlayerRole;
        },
      ) => void
    >(
      async () =>
        undefined,
    );

  const handleIncomingAction =
    async (
      action: BattleActionPayload & {
        playerRole?: PlayerRole;
      },
    ) => {
      if (!action?.type) {
        return;
      }

      if (
        isOnline &&
        roomId
      ) {
        try {
          const roomSnapshot =
            await getDoc(
              doc(
                db,
                'rooms',
                roomId,
              ),
            );

          if (
            !roomSnapshot.exists()
          ) {
            return;
          }

          const roomData =
            roomSnapshot.data() as Record<
              string,
              any
            >;

          const roomYear =
            Number(
              roomData.currentYear ??
                1,
            );

          const roomTurnIndex =
            Number(
              roomData.turnIndex ??
                0,
            );

          if (
            Number(action.year) !==
              roomYear ||
            Number(action.turnIndex) !==
              roomTurnIndex
          ) {
            console.warn(
              '古い、または現在のターンと一致しないActionを無視しました。',
              {
                actionYear:
                  action.year,
                actionTurnIndex:
                  action.turnIndex,
                roomYear,
                roomTurnIndex,
              },
            );

            return;
          }
        } catch (error) {
          console.error(
            'Actionのターン検証エラー:',
            error,
          );

          return;
        }

        try {
          const roomSnapshot =
            await getDoc(
              doc(
                db,
                'rooms',
                roomId,
              ),
            );

          if (
            !roomSnapshot.exists()
          ) {
            return;
          }

          const roomData =
            roomSnapshot.data() as Record<
              string,
              any
            >;

          const currentFirstPlayer =
            roomData.firstPlayer as
              | PlayerRole
              | null;

          if (
            !currentFirstPlayer
          ) {
            return;
          }

          const expectedPlayer =
            Number(action.turnIndex) %
              2 ===
            0
              ? currentFirstPlayer
              : currentFirstPlayer ===
                  'host'
                ? 'guest'
                : 'host';

          const actionPlayer =
            action.playerRole ===
            'host'
              ? 'host'
              : 'guest';

          if (
            actionPlayer !==
            expectedPlayer
          ) {
            console.warn(
              '現在の手番ではないPlayerのActionを無視しました。',
              {
                actionPlayer,
                expectedPlayer,
                turnIndex:
                  action.turnIndex,
              },
            );

            return;
          }
        } catch (error) {
          console.error(
            'Actionの手番検証エラー:',
            error,
          );

          return;
        }

        try {
          const actionPlayerRole =
            action.playerRole ===
            'host'
              ? 'host'
              : action.playerRole ===
                  'guest'
                ? 'guest'
                : null;

          if (
            !actionPlayerRole ||
            !action.uid
          ) {
            return;
          }

          const actionPlayerSnapshot =
            await getDoc(
              doc(
                db,
                'rooms',
                roomId,
                'players',
                actionPlayerRole,
              ),
            );

          if (
            !actionPlayerSnapshot.exists()
          ) {
            return;
          }

          const actionPlayerData =
            actionPlayerSnapshot.data() as Record<
              string,
              any
            >;

          if (
            actionPlayerData.uid !==
            action.uid
          ) {
            console.warn(
              'UIDがPlayer情報と一致しないActionを無視しました。',
              {
                actionPlayerRole,
                actionUid:
                  action.uid,
                playerUid:
                  actionPlayerData.uid,
              },
            );

            return;
          }
        } catch (error) {
          console.error(
            'ActionのUID検証エラー:',
            error,
          );

          return;
        }
      }

      if (
        action.type ===
        'PLAY_SUPPORT'
      ) {
        const preset =
          action.supportPresetId
            ? EMOTION_PRESETS.find(
                (
                  emotion,
                ) =>
                  emotion.id ===
                  action.supportPresetId,
              )
            : undefined;

        const supportCard:
          SupportCard &
            SupportCardDisplayMeta =
          {
            id:
              action.supportCardId ||
              'support',
            name:
              preset?.name ||
              'サポートカード',
            description:
              preset?.description ||
              '',
            flavorText:
              action.supportFlavorText ||
              '',
            colorHex:
              action.supportColorHex,
          };

        await playSupportPreResultEffect(
          {
            effectKey:
              getSupportBattleEffect(
                preset,
              ),
            cardName:
              supportCard.name,
            imageUrl:
              getSupportImage(
                supportCard,
              ),
            targetPositions:
              getSupportTargetPositions(),
            dialogue:
              supportCard.flavorText ||
              preset?.description,
            colorHex:
              supportCard.colorHex ||
              DEFAULT_SUPPORT_COLOR_HEX,
            target:
              getSupportBattleTarget(
                preset,
                false,
              ),
          },
        );

        addLog(
          `相手がサポート「${supportCard.name}」を使用しました。` +
            (
              supportCard.flavorText
                ? `「${supportCard.flavorText}」`
                : ''
            ) +
            (
              preset?.description
                ? ` ${preset.description}`
                : ''
            ),
        );

        return;
      }

      if (
        action.type ===
        'USE_SKILL'
      ) {
        const avatarIndex =
          typeof action.avatarIndex ===
          'number'
            ? action.avatarIndex
            : activeIndex;

        const opponentAvatar =
          oppAvatars[
            avatarIndex
          ];

        if (
          !opponentAvatar ||
          !action.skillId
        ) {
          return;
        }

        const skill =
          opponentAvatar.skills.find(
            (item) =>
              item.id ===
              action.skillId,
          );

        if (!skill) {
          return;
        }

        const opponentSkillPreset =
          getPresetForCard(
            opponentAvatar.card,
          );

        const opponentSkillIndex =
          opponentAvatar.skills.findIndex(
            (item) =>
              item.id ===
              skill.id,
          );

        if (
          opponentSkillIndex >=
            0 &&
          hasSkillSeal(
            opponentAvatar,
            opponentSkillIndex,
            getBattleTurnOrdinal(
              action.year,
              action.turnIndex,
            ),
          )
        ) {
          console.warn(
            '封印中の相手技Actionを無視しました。',
            {
              skillId:
                skill.id,
              year:
                action.year,
              turnIndex:
                action.turnIndex,
            },
          );

          return;
        }

        await playSkillPreResultEffect(
          {
            effectKey:
              getCharacterSkillBattleEffect(
                opponentSkillPreset,
                opponentSkillIndex,
              ),
            characterName:
              opponentAvatar.card.userName,
            skillName:
              skill.name,
            dialogue:
              skill.description,
            colorHex:
              getBattleVisualColorHex(
                opponentAvatar.card,
              ),
            side: 'right',
          },
        );

        addLog(
          `相手が「${skill.name}」を使用しました。`,
        );
      }
    };

  useEffect(() => {
    handleIncomingActionRef.current =
      handleIncomingAction;
  });

  const decideFirstPlayer =
    async () => {
      if (
        battlePhase !==
          'setup' ||
        isCoinTossing ||
        (
          isOnline
            ? (
                !onlineDecksConfirmed ||
                !onlineClassPreparationConfirmed
              )
            : !deckConfirmed
        ) ||
        (
          isOnline &&
          !authReady
        )
      ) {
        return;
      }

      if (
        isOnline &&
        !isHost
      ) {
        return;
      }

      setIsCoinTossing(
        true,
      );

      try {
        if (!isOnline) {
          await new Promise(
            (resolve) =>
              setTimeout(
                resolve,
                650,
              ),
          );

          const result: PlayerRole =
            Math.random() <
            0.5
              ? 'host'
              : 'guest';

          setFirstPlayer(
            result,
          );

          setStartSeasonIdx(
            0,
          );

          setPreparationMessage(
            `コイントス結果：${result === 'host' ? '自分' : 'CPU'}が先手です。\n春から${roleDisplayNames[ROLE_NAMES[currentYear - 1]]}戦を開始します。`,
          );

          addLog(
            `🪙 コイントス結果：${result === 'host' ? '自分' : 'CPU'}が先手です。`,
          );

          setBattlePhase(
            'battle',
          );

          setTurnIndex(
            0,
          );

          playBgm(
            getBattleBgmSection(
              currentYear,
            ),
          );

          return;
        }

        const result =
          await submitBattleLifecycleAction(
            'START_BATTLE',
          );

        if (
          !result?.firstPlayer
        ) {
          throw new Error(
            'サーバーから先手結果を取得できませんでした。',
          );
        }

        setFirstPlayer(
          result.firstPlayer,
        );

        setStartSeasonIdx(
          0,
        );

        playBgm(
          getBattleBgmSection(
            currentYear,
          ),
        );

        setPreparationMessage(
          `🪙 コイントス結果：${result.firstPlayer === playerRole ? '自分' : '相手'}が先手です。春から${roleDisplayNames[ROLE_NAMES[currentYear - 1]]}戦を開始します。`,
        );

        addLog(
          `🪙 コイントス結果：${result.firstPlayer === playerRole ? '自分' : '相手'}が先手です。`,
        );
      } catch (error) {
        console.error(
          'コイントス結果の同期エラー:',
          error,
        );

        addLog(
          '⚠️ 先手決定に失敗しました。両者のチーム確定状態を確認してください。',
        );
      } finally {
        setIsCoinTossing(
          false,
        );
      }
    };

  const buildBattleDeckSnapshot =
    (
      deck: Deck,
    ): BattleDeckSnapshot | null => {
      try {
        const characterIds =
          [
            deck.vanguardCardId,
            deck.centerCardId,
            deck.generalCardId,
          ];

        if (
          characterIds.some(
            (
              id,
            ): id is null =>
              id === null,
          )
        ) {
          setPreparationMessage(
            '⚠️ 対戦用デッキを確定できません。キャラ3枚を確認してください。',
          );

          return null;
        }

        const entriesRaw =
          localStorage.getItem(
            'reality_world_entries',
          );

        const entries:
          EntryRecordWithSkills[] =
          entriesRaw
            ? JSON.parse(
                entriesRaw,
              )
            : [];

        const cards: Array<
          AvatarCard & {
            presetId?: string;
          }
        > = [
          ...CHARACTER_SAMPLE_CARDS,
        ];

        for (
          const entry of entries.filter(
            (item) =>
              item.cardType ===
              'coordinate',
          )
        ) {
          cards.push({
            id: entry.id,
            profileUrl:
              entry.profileUrl ||
              '',
            userName:
              entry.userName ||
              'キャラ',
            imageDataUrl:
              entry.imageDataUrl ||
              '',
            color:
              (entry.color as
                | '赤'
                | '青'
                | '黄') ||
              '赤',
            archetype:
              (entry.archetype as Archetype) ||
              'バランス型',
            favoredSeason:
              '春',
            stats: {
              hp:
                entry.hp ??
                80,
              intellect:
                entry.ap ??
                20,
              dexterity:
                20,
              charm: 20,
            },
            passwordHash:
              entry.passwordHash ||
              '',
            createdAt:
              entry.createdAt ||
              '',
            updatedAt:
              entry.createdAt ||
              '',
            presetId:
              entry.presetId,
          });
        }

        const characterCards =
          characterIds.map(
            (id) =>
              cards.find(
                (card) =>
                  card.id ===
                  id,
              ),
          );

        if (
          characterCards.some(
            (card) =>
              !card,
          )
        ) {
          setPreparationMessage(
            '⚠️ 対戦に必要なキャラカードを確認できませんでした。カードライブラリを再読み込みしてください。',
          );

          return null;
        }

        const supportPool =
          getSupportPool(
            entries,
          );

        const supportReferences =
          (
            deck.supportCardIds ||
            []
          ).map(
            (cardId) => {
              const support =
                supportPool.find(
                  (item) =>
                    item.id ===
                    cardId,
                );

              const presetId =
                (
                  support as
                    | (SupportCard & {
                        presetId?: string;
                      })
                    | undefined
                )?.presetId ||
                (
                  cardId.startsWith(
                    VIRTUAL_SUPPORT_PREFIX,
                  )
                    ? cardId.slice(
                        VIRTUAL_SUPPORT_PREFIX.length,
                      )
                    : undefined
                ) ||
                cardId.match(
                  /emo_\d{2}$/,
                )?.[0];

              return {
                cardId,
                presetId,
              };
            },
          );

        if (
          supportReferences.length !==
          BATTLE_DECK_SIZE
        ) {
          setPreparationMessage(
            '⚠️ 対戦用デッキのサポートカードが18枚ではありません。',
          );

          return null;
        }

        return {
          version: 1,
          deckId:
            deck.id ||
            null,
          deckName:
            deck.name,
          characters: [
            {
              role:
                'vanguard',
              cardId:
                characterCards[0]!
                  .id,
              presetId:
                characterCards[0]!
                  .presetId,
            },
            {
              role:
                'center',
              cardId:
                characterCards[1]!
                  .id,
              presetId:
                characterCards[1]!
                  .presetId,
            },
            {
              role:
                'general',
              cardId:
                characterCards[2]!
                  .id,
              presetId:
                characterCards[2]!
                  .presetId,
            },
          ],
          supportCards:
            supportReferences,
          createdAt:
            new Date().toISOString(),
        };
      } catch (error) {
        console.error(
          '対戦用デッキスナップショット作成エラー:',
          error,
        );

        setPreparationMessage(
          '⚠️ 対戦用デッキを確定できませんでした。カードライブラリを確認してください。',
        );

        return null;
      }
    };

  const startBattleWithDeck =
    async () => {
      if (
        battlePhase !==
          'setup' ||
        !myDeckReady ||
        deckConfirmed ||
        (
          isOnline &&
          !authReady
        )
      ) {
        return;
      }

      if (
        currentYear > 1
      ) {
        return;
      }

      if (!isOnline) {
        setDeckConfirmed(
          true,
        );

        setClassReadyYearHost(
          1,
        );

        setClassReadyYearGuest(
          1,
        );

        setPreparationMessage(
          'チームを確定しました。コイントスを行って先手・後手を決定してください。',
        );

        addLog(
          'このチームを対戦用チームとして確定しました。',
        );

        return;
      }

      const selectedDeck =
        activeDeckId
          ? loadDeckDefinition(
              activeDeckId,
            )
          : null;

      if (
        !selectedDeck ||
        !myPrivatePlayerRef
      ) {
        addLog(
          '⚠️ 対戦用チーム情報を確認できませんでした。',
        );

        return;
      }

      const snapshot =
        buildBattleDeckSnapshot(
          selectedDeck,
        );

      if (!snapshot) {
        return;
      }

      setDeckConfirmed(
        true,
      );

      await setDoc(
        myPrivatePlayerRef,
        {
          battleDeckSnapshot:
            snapshot,
        },
        {
          merge: true,
        },
      );

      const field =
        playerRole ===
        'host'
          ? 'readyHost'
          : 'readyGuest';

      await updateDoc(
        doc(
          db,
          'rooms',
          roomId,
        ),
        {
          [field]:
            true,
          [playerRole ===
          'host'
            ? 'hostDeckId'
            : 'guestDeckId']:
            activeDeckId,
          [playerRole ===
          'host'
            ? 'classReadyYearHost'
            : 'classReadyYearGuest']:
            1,
        },
      );

      setPreparationMessage(
        'このチームでの準備が完了しました。両者のチーム確定後、ルーム作成者がコイントスを行います。',
      );
    };

  const showClassResult =
    (
      completedYear: number,
      finalMyScore: number,
      finalOpponentScore: number,
      finalMyTotal: number,
      finalOpponentTotal: number,
    ) => {
      setClassResult(
        {
          completedYear,
          myScore:
            finalMyScore,
          opponentScore:
            finalOpponentScore,
          myTotal:
            finalMyTotal,
          opponentTotal:
            finalOpponentTotal,
        },
      );
    };

  const loadDeckDefinition =
    (
      deckId: string,
    ): Deck | null => {
      try {
        const raw =
          localStorage.getItem(
            'reality_decks',
          );

        const decks: Deck[] =
          raw
            ? JSON.parse(
                raw,
              )
            : [];

        return (
          decks.find(
            (deck) =>
              deck.id ===
              deckId,
          ) || null
        );
      } catch {
        return null;
      }
    };

  const prepareClassStart =
    async (
      targetYear: number,
    ) => {
      if (
        targetYear < 1 ||
        targetYear > 3
      ) {
        return;
      }

      setCurrentYear(
        targetYear,
      );

      setTurnIndex(
        0,
      );

      setFirstPlayer(
        null,
      );

      setStartSeasonIdx(
        null,
      );

setBattlePhase(
  'setup',
);

setMyAvatars((prev) =>
  clearSupportEffectsFromAvatars(prev),
);

setOppAvatars((prev) =>
  clearSupportEffectsFromAvatars(prev),
);

setMyDeckReady(
  true,
);
      setDeckConfirmed(
        targetYear > 1
          ? true
          : deckConfirmed,
      );

      const nextDeckDefinition =
        activeDeckId
          ? loadDeckDefinition(
              activeDeckId,
            )
          : null;

      if (isOnline) {
        setMyHand([]);
        setMyDeck([]);

        if (
          myPrivatePlayerRef
        ) {
          try {
            await setDoc(
              myPrivatePlayerRef,
              {
                hand: [],
                deck: [],
              },
              {
                merge: true,
              },
            );
          } catch (error) {
            console.error(
              '次クラスのサポートチーム初期化保存エラー:',
              error,
            );

            addLog(
              '⚠️ 次クラスの手札・山札初期化に失敗しました。',
            );
          }
        }

        if (
          myPlayerRef
        ) {
          await updateDoc(
            myPlayerRef,
            {
              handCount: 0,
              deckCount: 0,
              hand:
                deleteField(),
              deck:
                deleteField(),
            },
          );
        }
      } else {
        resetLocalSupportDeck(
          nextDeckDefinition,
        );
      }

      setUsedSkillsByClass(
        (prev) => {
          const next = {
            ...prev,
          };

          delete next[
            String(
              targetYear,
            )
          ];

          return next;
        },
      );

      setCpuUsedSkillsByClass(
        (prev) => {
          const next = {
            ...prev,
          };

          delete next[
            String(
              targetYear,
            )
          ];

          return next;
        },
      );

      setPreparationMessage(
        `${targetYear}年目の準備を進めています。チームは前のクラスから継続します。\n両者の準備完了後にコイントスを行います。`,
      );

      if (isOnline) {
        const classReadyField =
          playerRole ===
          'host'
            ? 'classReadyYearHost'
            : 'classReadyYearGuest';

        await updateDoc(
          doc(
            db,
            'rooms',
            roomId,
          ),
          {
            [classReadyField]:
              targetYear,
          },
        );
      } else {
        setClassReadyYearHost(
          targetYear,
        );

        setClassReadyYearGuest(
          targetYear,
        );
      }
    };

  const continueAfterClassResult =
    async () => {
      if (
        !classResult ||
        (
          isOnline &&
          !authReady
        ) ||
        classTransitionInProgressRef.current
      ) {
        return;
      }

      classTransitionInProgressRef.current =
        true;

      try {
        const completedYear =
          classResult.completedYear;

        setClassResult(
          null,
        );

        if (
          completedYear <
          3
        ) {
          await prepareClassStart(
            completedYear +
              1,
          );
        } else {
          setBattlePhase(
            'finished',
          );

          setPreparationMessage(
            '',
          );
        }
      } catch (error) {
        console.error(
          'クラス切り替え処理エラー:',
          error,
        );

        addLog(
          '⚠️ 次クラスへの切り替えに失敗しました。もう一度お試しください。',
        );
      } finally {
        classTransitionInProgressRef.current =
          false;
      }
    };

  useEffect(() => {
    if (
      !classResult ||
      classResult.completedYear >=
        3
    ) {
      return;
    }

    const timer =
      window.setTimeout(
        () => {
          if (
            !classTransitionInProgressRef.current
          ) {
            void continueAfterClassResult();
          }
        },
        1800,
      );

    return () =>
      window.clearTimeout(
        timer,
      );
  }, [
    classResult,
  ]);

  useEffect(() => {
    if (
      !isOnline ||
      !roomId ||
      !authReady ||
      battlePhase !==
        'setup' ||
      currentYear <=
        1 ||
      classResult ||
      classTransitionInProgressRef.current
    ) {
      return;
    }

    const myClassReadyYear =
      playerRole ===
      'host'
        ? classReadyYearHost
        : classReadyYearGuest;

    if (
      myClassReadyYear ===
      currentYear
    ) {
      return;
    }

    classTransitionInProgressRef.current =
      true;

    void prepareClassStart(
      currentYear,
    )
      .catch(
        (error) => {
          console.error(
            '再入室時のクラス準備エラー:',
            error,
          );

          addLog(
            '⚠️ クラス準備の同期に失敗しました。',
          );
        },
      )
      .finally(() => {
        classTransitionInProgressRef.current =
          false;
      });
  }, [
    isOnline,
    roomId,
    authReady,
    battlePhase,
    currentYear,
    classResult,
    playerRole,
    classReadyYearHost,
    classReadyYearGuest,
  ]);

  const getNextTurnState =
    () => {
      if (
        turnIndex < 7
      ) {
        return {
          currentYear,
          turnIndex:
            turnIndex + 1,
          nextPhase:
            'battle' as const,
        };
      }

      if (
        currentYear < 3
      ) {
        return {
          currentYear:
            currentYear +
            1,
          turnIndex: 0,
          nextPhase:
            'setup' as const,
        };
      }

      return {
        currentYear: 3,
        turnIndex: 7,
        nextPhase:
          'finished' as const,
      };
    };

  const getSkillCutInDialogue =
    (
      skill: Skill,
    ) =>
      `「${skill.name}！」`;

  const handleUseSkill =
    async (
      skill: Skill,
      selectedStatOverride?: StatKey,
    ) => {
      if (
        isBattlePreResultEffectPlaying()
      ) {
        return;
      }

      if (
        !myTurn ||
        battlePhase !==
          'battle'
      ) {
        return;
      }

if (
  (
    skill.rule ===
      'response_score' ||
    skill.rule ===
      'burst'
  ) &&
  !selectedStatOverride
) {
  setSkillStatSelection({
    skillId: skill.id,
    mode:
      skill.rule ===
      'response_score'
        ? 'response'
        : 'burst',
  });

  return;
}

      const usedKey =
        `${currentYear}`;

      const usedForClass =
        usedSkillsByClass[
          usedKey
        ] || [];

      if (
        skill.maxUsesPerClass >
          0 &&
        usedForClass.filter(
          (usedSkillId) =>
            usedSkillId ===
            skill.id,
        ).length >=
          skill.maxUsesPerClass
      ) {
        addLog(
          `「${skill.name}」はこのクラスでは使用済みです。`,
        );

        return;
      }

      const skillIndexForSealCheck =
        myActiveAvatar.skills.findIndex(
          (item) =>
            item.id ===
            skill.id,
        );

      if (
        skillIndexForSealCheck >=
          0 &&
        hasSkillSeal(
          myActiveAvatar,
          skillIndexForSealCheck,
          getBattleTurnOrdinal(
            currentYear,
            turnIndex,
          ),
        )
      ) {
        addLog(
          'このターンは技④が封印されています。',
        );

        return;
      }

      const skillPreset =
        getPresetForCard(
          myActiveAvatar.card,
        );

      const skillIndex =
        myActiveAvatar.skills.findIndex(
          (item) =>
            item.id ===
            skill.id,
        );

      if (
        isOnline
      ) {
        if (
          !myPlayerRef
        ) {
          addLog(
            '⚠️ 自分のPlayer情報が見つかりません。',
          );

          return;
        }

        if (
          skillSubmitInProgressRef.current
        ) {
          return;
        }

        skillSubmitInProgressRef.current =
          true;

        const skillEffectPromise =
          playSkillPreResultEffect(
            {
              effectKey:
                getCharacterSkillBattleEffect(
                  skillPreset,
                  skillIndex,
                ),
              characterName:
                myActiveAvatar.card
                  .userName,
              skillName:
                skill.name,
              dialogue:
                getSkillCutInDialogue(
                  skill,
                ),
              colorHex:
                getBattleVisualColorHex(
                  myActiveAvatar.card,
                ),
              side: 'left',
            },
          );

        try {
          const actionSubmitted =
            await submitBattleAction(
              {
                actionId:
                  `${Date.now()}-${Math.random()
                    .toString(36)
                    .slice(2)}`,
                type:
                  'USE_SKILL',
                year:
                  currentYear,
                turnIndex,
                avatarIndex:
                  activeIndex,
                skillId:
                  skill.id,
                ...(selectedStatOverride
                  ? {
                      selectedBoostStat:
                        selectedStatOverride,
                    }
                  : {}),
              },
            );

          if (
            !actionSubmitted
          ) {
            addLog(
              `「${skill.name}」の送信に失敗しました。`,
            );

            return;
          }

          playSe(
            skillIndex === 3
              ? 'skill4'
              : 'skill123',
          );

          await skillEffectPromise;

          addLog(
            `「${skill.name}」発動！`,
          );
        } finally {
          skillSubmitInProgressRef.current =
            false;
        }

        return;
      }

      const effective =
        getEffectiveStats(
          myActiveAvatar,
        );

      const opponentEffective =
        getEffectiveStats(
          oppActiveAvatar,
        );

      let gainedScore =
        0;

      let debuffAmount =
        0;

      let debuffStat:
        | StatKey
        | null =
        null;

      let debuffs:
        Partial<
          Record<
            StatKey,
            number
          >
        > =
        {};

      let nextMyAvatars =
        myAvatars;

      let nextOppAvatars =
        oppAvatars;

      let selectedBoostStat:
        | StatKey
        | null =
        null;

      const getStat =
        (
          stats: ReturnType<
            typeof getEffectiveStats
          >,
          key: StatKey,
        ) =>
          stats[key];

      const baseStats =
        myActiveAvatar.baseStats ||
        myActiveAvatar.card
          .stats;

      const opponentBaseStats =
        oppActiveAvatar.baseStats ||
        oppActiveAvatar.card
          .stats;

      if (
        skill.rule ===
        'primary_score'
      ) {
        const stat =
          skill.primaryStat ||
          'hp';

        gainedScore =
          getStat(
            effective,
            stat,
          ) * 20;
      } else if (
        skill.rule ===
        'product_score'
      ) {
        const first =
          skill.primaryStat ||
          'intellect';

        const second =
          skill.secondaryStat ||
          'dexterity';

        gainedScore =
          (
            getStat(
              effective,
              first,
            ) +
            getStat(
              effective,
              second,
            )
          ) * 15;
      } else if (
        skill.rule ===
        'difference_score'
      ) {
        const stat =
          skill.primaryStat ||
          'hp';

        gainedScore =
          Math.max(
            0,
            getStat(
              effective,
              stat,
            ) -
              getStat(
                opponentEffective,
                stat,
              ),
          ) * 40;
      } else if (
        skill.rule ===
        'combo_score_and_debuff'
      ) {
        const first =
          skill.secondaryStat ||
          'dexterity';

        const second =
          skill.tertiaryStat ||
          'charm';

        const target =
          skill.primaryStat ||
          'hp';

        gainedScore =
          (
            getStat(
              effective,
              first,
            ) +
            getStat(
              effective,
              second,
            )
          ) * 10;

        debuffStat =
          target;

        debuffAmount =
          Math.ceil(
            getStat(
              opponentEffective,
              target,
            ) * 0.5,
          );

        debuffs[
          target
        ] =
          debuffAmount;

        if (
          debuffAmount > 0 &&
          !oppActiveAvatar.debuffImmune
        ) {
          nextOppAvatars =
            oppAvatars.map(
              (
                avatar,
                index,
              ) =>
                index ===
                activeIndex
                  ? {
                      ...avatar,
                      currentDebuff:
                        {
                          ...avatar.currentDebuff,
                          [target]:
                            avatar
                              .currentDebuff[
                              target
                            ] +
                            debuffAmount,
                        },
                    }
                  : avatar,
            );
        }
      } else if (
        skill.rule ===
        'total_score'
      ) {
        gainedScore =
          Object.values(
            effective,
          ).reduce(
            (
              sum,
              value,
            ) =>
              sum +
              Number(
                value || 0,
              ),
            0,
          ) * 10;
      } else if (
        skill.rule ===
        'response_score'
      ) {
        selectedBoostStat =
          selectedStatOverride ||
          null;

        if (
          !selectedBoostStat
        ) {
          return;
        }

        gainedScore =
          Math.max(
            0,
            getStat(
              effective,
              selectedBoostStat,
            ) -
              getStat(
                opponentEffective,
                selectedBoostStat,
              ),
          ) * 40;
      } else if (
        skill.rule ===
        'burst'
      ) {
        selectedBoostStat =
          selectedStatOverride ||
          null;

        if (
          !selectedBoostStat
        ) {
          return;
        }

        const boostStat =
          selectedBoostStat;

        gainedScore =
          getStat(
            effective,
            boostStat,
          ) * 10;

        const currentBaseStats =
          myActiveAvatar.baseStats ||
          myActiveAvatar.stats;

        const nextBaseValue =
          Number(
            currentBaseStats[
              boostStat
            ] || 0,
          ) * 2;

        nextMyAvatars =
          myAvatars.map(
            (
              avatar,
              index,
            ) =>
              index ===
              activeIndex
                ? {
                    ...avatar,
                    stats:
                      {
                        ...avatar.stats,
                        [boostStat]:
                          nextBaseValue,
                      },
                    baseStats:
                      {
                        ...(
                          avatar.baseStats ||
                          avatar.stats
                        ),
                        [boostStat]:
                          nextBaseValue,
                      },
                  }
                : avatar,
          );
      } else if (
        skill.rule ===
        'crash'
      ) {
        const baseRank =
          STAT_KEYS.slice().sort(
            (
              a,
              b,
            ) =>
              Number(
                baseStats[b] ||
                  0,
              ) -
              Number(
                baseStats[a] ||
                  0,
              ),
          );

        const lowRank =
          getLowEffectiveStatRank(
            effective,
            baseRank,
          );

        const scoreLow =
          getStat(
            effective,
            lowRank[0],
          );

        const scoreSecondLow =
          getStat(
            effective,
            lowRank[1],
          );

        gainedScore =
          (
            scoreLow +
            scoreSecondLow
          ) * 10;

        Object.entries(
          opponentBaseStats,
        ).forEach(
          (
            [key, value],
          ) => {
            const stat =
              key as StatKey;

            debuffs[
              stat
            ] =
              Math.ceil(
                Number(
                  value || 0,
                ) * 0.25,
              );
          },
        );

        if (
          !oppActiveAvatar.debuffImmune
        ) {
          nextOppAvatars =
            oppAvatars.map(
              (
                avatar,
                index,
              ) =>
                index ===
                activeIndex
                  ? {
                      ...avatar,
                      currentDebuff:
                        {
                          hp:
                            avatar
                              .currentDebuff
                              .hp +
                            (
                              debuffs.hp ||
                              0
                            ),
                          intellect:
                            avatar
                              .currentDebuff
                              .intellect +
                            (
                              debuffs.intellect ||
                              0
                            ),
                          dexterity:
                            avatar
                              .currentDebuff
                              .dexterity +
                            (
                              debuffs.dexterity ||
                              0
                            ),
                          charm:
                            avatar
                              .currentDebuff
                              .charm +
                            (
                              debuffs.charm ||
                              0
                            ),
                        },
                    }
                  : avatar,
            );
        }
      } else {
        if (
          skill.type ===
          'score'
        ) {
          gainedScore =
            effective.hp *
            10;
        }

        if (
          skill.type ===
          'draw_score'
        ) {
          gainedScore =
            effective.intellect;
        }

        if (
          skill.type ===
          'debuff_attack'
        ) {
          debuffStat =
            'hp';

          debuffAmount =
            effective.charm;

          debuffs.hp =
            debuffAmount;
        }
      }

      const nextUsed = {
        ...usedSkillsByClass,
        [usedKey]:
          skill.maxUsesPerClass >
          0
            ? [
                ...usedForClass,
                skill.id,
              ]
            : usedForClass,
      };

      const next =
        getNextTurnState();

      playSe(
        skillIndex === 3
          ? 'skill4'
          : 'skill123',
      );

      await playSkillPreResultEffect(
        {
          effectKey:
            getCharacterSkillBattleEffect(
              skillPreset,
              skillIndex,
            ),
          characterName:
            myActiveAvatar.card
              .userName,
          skillName:
            skill.name,
          dialogue:
            getSkillCutInDialogue(
              skill,
            ),
          colorHex:
            getBattleVisualColorHex(
              myActiveAvatar.card,
            ),
          side: 'left',
        },
      );

      const nextScores =
        [
          ...myClassScores,
        ];

      nextScores[
        activeIndex
      ] =
        (
          nextScores[
            activeIndex
          ] || 0
        ) + gainedScore;

      setMyClassScores(
        nextScores,
      );

      if (
        playerRole ===
        'host'
      ) {
        setHostTotalScore(
          (prev) =>
            prev + gainedScore,
        );
      } else {
        setGuestTotalScore(
          (prev) =>
            prev + gainedScore,
        );
      }

      const localNextMyAvatars =
        next.currentYear !==
        currentYear
          ? clearSupportEffectsFromAvatars(
              nextMyAvatars,
            )
          : nextMyAvatars;

      const localNextOppAvatars =
        next.currentYear !==
        currentYear
          ? clearSupportEffectsFromAvatars(
              nextOppAvatars,
            )
          : nextOppAvatars;

      setMyAvatars(
        localNextMyAvatars,
      );

      setOppAvatars(
        localNextOppAvatars,
      );

      setUsedSkillsByClass(
        nextUsed,
      );

      addLog(
        `「${skill.name}」発動！`,
      );

      if (
        Object.keys(
          debuffs,
        ).length > 0 &&
        !oppActiveAvatar.debuffImmune
      ) {
        const detail =
          Object.entries(
            debuffs,
          )
            .map(
              (
                [
                  key,
                  value,
                ],
              ) =>
                `${STAT_LABELS[key as StatKey]} -${value}`,
            )
            .join(
              ' / ',
            );

        addLog(
          `相手へのデバフ：${detail}`,
        );
      }

      setCurrentYear(
        next.currentYear,
      );

      setTurnIndex(
        next.turnIndex,
      );

      setBattlePhase(
        next.nextPhase,
      );

      if (
        next.nextPhase ===
        'battle'
      ) {
      } else if (
        next.nextPhase ===
        'setup'
      ) {
        setFirstPlayer(
          null,
        );

        setStartSeasonIdx(
          null,
        );

        setMyDeckReady(
          false,
        );

        setPreparationMessage(
          next.currentYear <=
            3
            ? `${next.currentYear}年目の準備を開始します。コイントスを行ってください。`
            : '',
        );
      }

      if (
        next.currentYear !==
        currentYear
      ) {
        setUsedSkillsByClass(
          {},
        );

        setCpuUsedSkillsByClass(
          {},
        );
      }
    };

  useEffect(() => {
    setSelectedSupportCardIndex(
      null,
    );

    setSkillStatSelection(
      null,
    );
  }, [
    currentYear,
    turnIndex,
  ]);

  useEffect(() => {
    return () => {
      if (
        supportDealTimerRef.current !==
        null
      ) {
        window.clearTimeout(
          supportDealTimerRef.current,
        );
      }

      if (
        supportRevealTimerRef.current !==
        null
      ) {
        window.clearTimeout(
          supportRevealTimerRef.current,
        );
      }
    };
  }, []);

  const getEmotionPresetForCard =
    (
      card: SupportCard,
    ) => {
      const withPreset =
        card as SupportCard & {
          presetId?: string;
        };

      const presetId =
        withPreset.presetId ||
        card.id.match(
          /emo_\d{2}$/,
        )?.[0] ||
        (
          card.id.startsWith(
            VIRTUAL_SUPPORT_PREFIX,
          )
            ? card.id.slice(
                VIRTUAL_SUPPORT_PREFIX.length,
              )
            : undefined
        );

      return presetId
        ? EMOTION_PRESETS.find(
            (emotion) =>
              emotion.id ===
              presetId,
          )
        : EMOTION_PRESETS.find(
            (emotion) =>
              emotion.name ===
              card.name,
          );
    };

  const getSupportImage =
    (
      card: SupportCard,
    ) => {
      const withImage =
        card as SupportCard & {
          imageDataUrl?: string;
        };

      if (
        withImage.imageDataUrl
      ) {
        return withImage.imageDataUrl;
      }

      const preset =
        getEmotionPresetForCard(
          card,
        );

      return preset
        ? getVirtualSupportImageDataUrl(
            preset,
          )
        : undefined;
    };

  const getSupportFlavorText =
    (
      card: SupportCard,
    ) =>
      (
        card as SupportCard &
          SupportCardDisplayMeta
      ).flavorText ||
      '';

  const DEFAULT_SUPPORT_COLOR_HEX =
    '#22D3EE';

  const getSupportColorHex =
    (
      card: SupportCard,
    ) =>
      (
        card as SupportCard &
          SupportCardDisplayMeta
      ).colorHex ||
      DEFAULT_SUPPORT_COLOR_HEX;

  const getSupportDetailDescription =
    (
      preset: EmotionPreset,
    ) => {
      const targetLabel =
        preset.target ===
        '自分'
          ? '自分'
          : preset.target ===
              '相手'
            ? '相手'
            : '自分と相手';

      const durationLabel =
        preset.duration ===
        '一時'
          ? '次の自分のターンまで'
          : 'このクラス中';

      const amount =
        parseEmotionAmount(
          preset.effectAmount,
        );

      const absoluteAmount =
        Math.abs(amount);

      const direction =
        amount >= 0
          ? '増加'
          : '減少';

      if (
        preset.effectCategory ===
        '情熱'
      ) {
        return `${targetLabel}の情熱を${durationLabel}${absoluteAmount}${direction}させる。${
          preset.note?.includes(
            '0',
          )
            ? '（0は下回らない）'
            : ''
        }`;
      }

      if (
        preset.effectCategory ===
        '知性'
      ) {
        return `${targetLabel}の知性を${durationLabel}${absoluteAmount}${direction}させる。${
          preset.note?.includes(
            '0',
          )
            ? '（0は下回らない）'
            : ''
        }`;
      }

      if (
        preset.effectCategory ===
        '技能'
      ) {
        return `${targetLabel}の技能を${durationLabel}${absoluteAmount}${direction}させる。${
          preset.note?.includes(
            '0',
          )
            ? '（0は下回らない）'
            : ''
        }`;
      }

      if (
        preset.effectCategory ===
        '愛嬌'
      ) {
        return `${targetLabel}の愛嬌を${durationLabel}${absoluteAmount}${direction}させる。${
          preset.note?.includes(
            '0',
          )
            ? '（0は下回らない）'
            : ''
        }`;
      }

      if (
        preset.effectCategory ===
        '全ステータス'
      ) {
        return `${targetLabel}の全ステータスを${durationLabel}${absoluteAmount}${direction}させる。${
          preset.note?.includes(
            '0',
          )
            ? '（0は下回らない）'
            : ''
        }`;
      }

      if (
        preset.effectCategory ===
        'スコア'
      ) {
        return preset.target ===
          '自分'
          ? `使用時に自分の現在クラスのスコアを${absoluteAmount}増やす。`
          : `使用時に相手の現在クラスのスコアを${absoluteAmount}減らす。${
              preset.note?.includes(
                '0',
              )
                ? '（0は下回らない）'
                : ''
            }`;
      }

      if (
        preset.effectCategory ===
        'サポートカード使用数'
      ) {
        if (
          preset.statEffect.includes(
            '制限されない',
          )
        ) {
          return `${targetLabel}のサポートカード使用数を制限しない。${durationLabel}有効。`;
        }

        return `${targetLabel}がこのターンに使用できるサポートカードを${
          preset.effectAmount ||
          '指定枚数'
        }までに制限する。${durationLabel}有効。`;
      }

      if (
        preset.effectCategory ===
        'ドロー'
      ) {
        if (
          preset.duration ===
          '永続'
        ) {
          return `${targetLabel}は各ターン、カードを${absoluteAmount}枚追加でドローする。このクラス中有効。`;
        }

        return `${targetLabel}はカードを${absoluteAmount}枚追加でドローする。`;
      }

      if (
        preset.effectCategory ===
        'ステータスコピー・平均化'
      ) {
        return `${preset.description}${
          preset.duration ===
          '一時'
            ? '次の自分のターンまで有効。'
            : 'このクラス中有効。'
        }`;
      }

      if (
        preset.effectCategory ===
        '効果反射'
      ) {
        return `${preset.description}${
          preset.note
            ? `（${preset.note}）`
            : ''
        }`;
      }

      if (
        preset.effectCategory ===
        '技封印'
      ) {
        return `${targetLabel}の技④の使用を${durationLabel}封印する。`;
      }

      return preset.description;
    };

  const parseEmotionAmount =
    (
      value?: string,
    ) => {
      const match =
        value?.match(
          /[-+]?\d+(?:\.\d+)?/,
        );

      return match
        ? Number(
            match[0],
          )
        : 0;
    };

  const playSupportUseSe =
    (
      preset?: EmotionPreset,
    ) => {
      const isSelfStatusBoost =
        Boolean(
          preset &&
            preset.target ===
              '自分' &&
            [
              '情熱',
              '知性',
              '技能',
              '愛嬌',
              '全ステータス',
            ].includes(
              preset.effectCategory,
            ) &&
            parseEmotionAmount(
              preset.effectAmount,
            ) > 0,
        );

      playSe(
        isSelfStatusBoost
          ? 'supportStatBoost'
          : 'supportOther',
      );
    };

  const appendSupportAvatarEffect =
    (
      avatar: BattleAvatar,
      effect: SupportAvatarEffectState,
      turnOrdinal: number,
    ): BattleAvatar => ({
      ...avatar,
      supportEffects: [
        ...(
          avatar.supportEffects ||
          []
        ).filter(
          (item) =>
            isSupportEffectActive(
              item,
              turnOrdinal,
            ),
        ),
        effect,
      ],
    });

  const appendSupportControlEffect =
    (
      avatar: BattleAvatar,
      effect: SupportControlEffectState,
      turnOrdinal: number,
    ): BattleAvatar => ({
      ...avatar,
      supportControlEffects: [
        ...(
          avatar.supportControlEffects ||
          []
        ).filter(
          (item) =>
            isSupportEffectActive(
              item,
              turnOrdinal,
            ),
        ),
        effect,
      ],
    });

  const applySupportControlToAllAvatars =
    (
      avatars: BattleAvatar[],
      effect: SupportControlEffectState,
      turnOrdinal: number,
    ) =>
      avatars.map(
        (avatar) =>
          appendSupportControlEffect(
            avatar,
            effect,
            turnOrdinal,
          ),
      );

  const cloneSupportDeltaEffects =
    (
      effects:
        | SupportAvatarEffectState[]
        | undefined,
      predicate: (
        delta: number,
      ) => boolean,
      turnOrdinal: number,
    ): SupportAvatarEffectState[] =>
      (
        effects || []
      )
        .filter(
          (effect) =>
            isSupportEffectActive(
              effect,
              turnOrdinal,
            ),
        )
        .map(
          (
            effect,
          ): SupportAvatarEffectState | null => {
            const filtered: Partial<
              Record<
                StatKey,
                number
              >
            > = {};

            for (
              const stat of STAT_KEYS
            ) {
              const value =
                Number(
                  effect.statDelta?.[
                    stat
                  ] ||
                    0,
                );

              if (
                value !== 0 &&
                predicate(
                  value,
                )
              ) {
                filtered[
                  stat
                ] = value;
              }
            }

            if (
              !Object.keys(
                filtered,
              ).length
            ) {
              return null;
            }

            return {
              ...effect,
              id: `${effect.id}_reflect_${Math.random()
                .toString(36)
                .slice(2)}`,
              statDelta:
                filtered,
            };
          },
        )
        .filter(
          (
            effect,
          ): effect is SupportAvatarEffectState =>
            effect !==
            null,
        );

  const applyEmotionToPair =
    (
      card: SupportCard,
      actor: BattleAvatar,
      target: BattleAvatar,
      turnOrdinal =
        getBattleTurnOrdinal(
          currentYear,
          turnIndex,
        ),
    ) => {
      const preset =
        getEmotionPresetForCard(
          card,
        );

      if (!preset) {
        return {
          actor,
          target,
          scoreDelta: 0,
          targetScoreDelta:
            0,
          extraDraw: 0,
          actorSupportControlEffect:
            undefined as
              | SupportControlEffectState
              | undefined,
          targetSupportControlEffect:
            undefined as
              | SupportControlEffectState
              | undefined,
        };
      }

      const amount =
        parseEmotionAmount(
          preset.effectAmount,
        );

      const statMap: Partial<
        Record<
          EmotionPreset['effectCategory'],
          StatKey
        >
      > = {
        情熱:
          'hp',
        知性:
          'intellect',
        技能:
          'dexterity',
        愛嬌:
          'charm',
      };

      let nextActor:
        BattleAvatar = {
        ...actor,
        supportEffects: [
          ...(
            actor.supportEffects ||
            []
          ),
        ],
      };

      let nextTarget:
        BattleAvatar = {
        ...target,
        supportEffects: [
          ...(
            target.supportEffects ||
            []
          ),
        ],
      };

      let scoreDelta =
        0;

      let targetScoreDelta =
        0;

      let extraDraw =
        0;

      let actorSupportControlEffect:
        | SupportControlEffectState
        | undefined;

      let targetSupportControlEffect:
        | SupportControlEffectState
        | undefined;

      const addActorAvatarEffect =
        (
          effect: Omit<
            SupportAvatarEffectState,
            'id'
          >,
        ) => {
          nextActor =
            appendSupportAvatarEffect(
              nextActor,
              {
                ...effect,
                id:
                  createSupportEffectId(
                    preset.id,
                  ),
              },
              turnOrdinal,
            );
        };

      const addTargetAvatarEffect =
        (
          effect: Omit<
            SupportAvatarEffectState,
            'id'
          >,
        ) => {
          nextTarget =
            appendSupportAvatarEffect(
              nextTarget,
              {
                ...effect,
                id:
                  createSupportEffectId(
                    preset.id,
                  ),
              },
              turnOrdinal,
            );
        };

      const makeControlEffect =
        (
          kind: SupportControlEffectState['kind'],
          appliesToOpponent: boolean,
        ): SupportControlEffectState => {
          const baseEffect:
            SupportControlEffectState =
            {
              id:
                createSupportEffectId(
                  preset.id,
                ),
              sourcePresetId:
                preset.id,
              duration:
                preset.duration,
              kind,
              expiresAtTurnOrdinal:
                getSupportEffectExpiration(
                  preset,
                  turnOrdinal,
                  appliesToOpponent,
                ),
            };

          if (
            kind ===
            'limit'
          ) {
            return {
              ...baseEffect,
              maxUsesPerTurn:
                Math.max(
                  0,
                  amount ||
                    1,
                ),
            };
          }

          if (
            kind ===
            'extra_draw'
          ) {
            return {
              ...baseEffect,
              extraDrawPerTurn:
                Math.max(
                  0,
                  amount ||
                    1,
                ),
            };
          }

          return baseEffect;
        };

      if (
        preset.effectCategory ===
        '全ステータス'
      ) {
        const all = {
          hp: amount,
          intellect:
            amount,
          dexterity:
            amount,
          charm:
            amount,
        };

        if (
          preset.target ===
          '自分'
        ) {
          addActorAvatarEffect(
            {
              sourcePresetId:
                preset.id,
              statDelta:
                all,
              expiresAtTurnOrdinal:
                getSupportEffectExpiration(
                  preset,
                  turnOrdinal,
                  false,
                ),
            },
          );
        }

        if (
          preset.target ===
          '相手'
        ) {
          addTargetAvatarEffect(
            {
              sourcePresetId:
                preset.id,
              statDelta:
                all,
              expiresAtTurnOrdinal:
                getSupportEffectExpiration(
                  preset,
                  turnOrdinal,
                  true,
                ),
            },
          );
        }
      } else if (
        statMap[
          preset.effectCategory
        ]
      ) {
        const stat =
          statMap[
            preset
              .effectCategory
          ] as StatKey;

        if (
          preset.target ===
          '自分'
        ) {
          addActorAvatarEffect(
            {
              sourcePresetId:
                preset.id,
              statDelta: {
                [stat]:
                  amount,
              },
              expiresAtTurnOrdinal:
                getSupportEffectExpiration(
                  preset,
                  turnOrdinal,
                  false,
                ),
            },
          );
        }

        if (
          preset.target ===
          '相手'
        ) {
          addTargetAvatarEffect(
            {
              sourcePresetId:
                preset.id,
              statDelta: {
                [stat]:
                  amount,
              },
              expiresAtTurnOrdinal:
                getSupportEffectExpiration(
                  preset,
                  turnOrdinal,
                  true,
                ),
            },
          );
        }
      } else if (
        preset.effectCategory ===
        'スコア'
      ) {
        if (
          preset.target ===
          '自分'
        ) {
          scoreDelta =
            Math.abs(
              amount,
            );
        } else if (
          preset.target ===
          '相手'
        ) {
          targetScoreDelta =
            -Math.abs(
              amount,
            );
        }
      } else if (
        preset.effectCategory ===
        'サポートカード使用数'
      ) {
        if (
          preset.statEffect.includes(
            '制限されない',
          )
        ) {
          if (
            preset.target ===
            '自分'
          ) {
            actorSupportControlEffect =
              makeControlEffect(
                'free',
                false,
              );
          }
        } else if (
          preset.target ===
          '相手'
        ) {
          targetSupportControlEffect =
            makeControlEffect(
              'limit',
              true,
            );
        }
      } else if (
        preset.effectCategory ===
        'ドロー'
      ) {
        extraDraw =
          Math.max(
            0,
            amount ||
              1,
          );

        if (
          preset.duration ===
          '永続'
        ) {
          actorSupportControlEffect =
            makeControlEffect(
              'extra_draw',
              false,
            );
        }
      } else if (
        preset.effectCategory ===
        'ステータスコピー・平均化'
      ) {
        const actorEffective =
          getEffectiveStats(
            actor,
            turnOrdinal,
          );

        const targetEffective =
          getEffectiveStats(
            target,
            turnOrdinal,
          );

        if (
          preset.id ===
          'emo_29'
        ) {
          const highest =
            Math.max(
              ...Object.values(
                targetEffective,
              ),
            );

          const key =
            STAT_KEYS.find(
              (item) =>
                targetEffective[
                  item
                ] ===
                highest,
            ) ||
            'hp';

          addActorAvatarEffect(
            {
              sourcePresetId:
                preset.id,
              statOverride: {
                [key]:
                  highest,
              },
              expiresAtTurnOrdinal:
                getSupportEffectExpiration(
                  preset,
                  turnOrdinal,
                  false,
                ),
            },
          );
        } else if (
          preset.id ===
          'emo_30'
        ) {
          const lowest =
            Math.min(
              ...Object.values(
                actorEffective,
              ),
            );

          const key =
            STAT_KEYS.find(
              (item) =>
                actorEffective[
                  item
                ] ===
                lowest,
            ) ||
            'hp';

          addTargetAvatarEffect(
            {
              sourcePresetId:
                preset.id,
              statOverride: {
                [key]:
                  lowest,
              },
              expiresAtTurnOrdinal:
                getSupportEffectExpiration(
                  preset,
                  turnOrdinal,
                  true,
                ),
            },
          );
        } else if (
          preset.id ===
          'emo_31'
        ) {
          const average =
            Math.round(
              Object.values(
                actorEffective,
              ).reduce(
                (
                  sum,
                  value,
                ) =>
                  sum +
                  value,
                0,
              ) / 4,
            );

          addActorAvatarEffect(
            {
              sourcePresetId:
                preset.id,
              statOverride:
                {
                  hp:
                    average,
                  intellect:
                    average,
                  dexterity:
                    average,
                  charm:
                    average,
                },
              expiresAtTurnOrdinal:
                getSupportEffectExpiration(
                  preset,
                  turnOrdinal,
                  false,
                ),
            },
          );
        } else if (
          preset.id ===
          'emo_32'
        ) {
          const average =
            Math.round(
              Object.values(
                targetEffective,
              ).reduce(
                (
                  sum,
                  value,
                ) =>
                  sum +
                  value,
                0,
              ) / 4,
            );

          addTargetAvatarEffect(
            {
              sourcePresetId:
                preset.id,
              statOverride:
                {
                  hp:
                    average,
                  intellect:
                    average,
                  dexterity:
                    average,
                  charm:
                    average,
                },
              expiresAtTurnOrdinal:
                getSupportEffectExpiration(
                  preset,
                  turnOrdinal,
                  true,
                ),
            },
          );
        }
      } else if (
        preset.effectCategory ===
        '効果反射'
      ) {
        if (
          preset.id ===
          'emo_33'
        ) {
          const sourceEffects =
            cloneSupportDeltaEffects(
              nextActor.supportEffects,
              (
                delta,
              ) =>
                delta <
                0,
              turnOrdinal,
            );

          const reflectedSourceIds =
            new Set(
              sourceEffects.map(
                (
                  effect,
                ) =>
                  effect.id.split(
                    '_reflect_',
                  )[0],
              ),
            );

          nextActor = {
            ...nextActor,
            supportEffects:
              (
                nextActor.supportEffects ||
                []
              ).filter(
                (
                  effect,
                ) =>
                  !reflectedSourceIds.has(
                    effect.id,
                  ),
              ),
          };

          for (
            const effect of sourceEffects
          ) {
            nextTarget =
              appendSupportAvatarEffect(
                nextTarget,
                effect,
                turnOrdinal,
              );
          }
        } else if (
          preset.id ===
          'emo_34'
        ) {
          const sourceEffects =
            cloneSupportDeltaEffects(
              nextTarget.supportEffects,
              (
                delta,
              ) =>
                delta >
                0,
              turnOrdinal,
            );

          const reflectedSourceIds =
            new Set(
              sourceEffects.map(
                (
                  effect,
                ) =>
                  effect.id.split(
                    '_reflect_',
                  )[0],
              ),
            );

          nextTarget = {
            ...nextTarget,
            supportEffects:
              (
                nextTarget.supportEffects ||
                []
              ).filter(
                (
                  effect,
                ) =>
                  !reflectedSourceIds.has(
                    effect.id,
                  ),
              ),
          };

          for (
            const effect of sourceEffects
          ) {
            nextActor =
              appendSupportAvatarEffect(
                nextActor,
                effect,
                turnOrdinal,
              );
          }
        }
      } else if (
        preset.effectCategory ===
        '技封印'
      ) {
        if (
          preset.target ===
          '相手'
        ) {
          addTargetAvatarEffect(
            {
              sourcePresetId:
                preset.id,
              skillSealIndex:
                3,
              expiresAtTurnOrdinal:
                getSupportEffectExpiration(
                  preset,
                  turnOrdinal,
                  true,
                ),
            },
          );
        }
      }

      return {
        actor:
          nextActor,
        target:
          nextTarget,
        scoreDelta,
        targetScoreDelta,
        extraDraw,
        actorSupportControlEffect,
        targetSupportControlEffect,
      };
    };

  const chooseCpuSupport =
    (
      hand: SupportCard[],
      cpuAvatar: BattleAvatar,
      playerAvatar: BattleAvatar,
    ) => {
      if (!hand.length) {
        return null;
      }

      const cpuTurnOrdinal =
        getBattleTurnOrdinal(
          currentYear,
          turnIndex,
        );

      const supportLimit =
        getSupportUsageLimitFromEffects(
          cpuAvatar.supportControlEffects,
          cpuTurnOrdinal,
        );

      const supportUseCount =
        getSupportUseCountFromUsedSkills(
          cpuUsedSkillsByClass,
          currentYear,
          turnIndex,
        );

      const hasFreeSupportCard =
        hand.some(
          (card) => {
            const presetId =
              card.id.startsWith(
                VIRTUAL_SUPPORT_PREFIX,
              )
                ? card.id.slice(
                    VIRTUAL_SUPPORT_PREFIX.length,
                  )
                : undefined;

            const preset =
              presetId
                ? EMOTION_PRESETS.find(
                    (
                      emotion,
                    ) =>
                      emotion.id ===
                      presetId,
                  )
                : EMOTION_PRESETS.find(
                    (
                      emotion,
                    ) =>
                      emotion.name ===
                      card.name,
                  );

            return Boolean(
              preset?.effectCategory ===
                'サポートカード使用数' &&
                preset.statEffect.includes(
                  '制限されない',
                ),
            );
          },
        );

      if (
        Number.isFinite(
          supportLimit,
        ) &&
        supportUseCount >=
          supportLimit &&
        !hasFreeSupportCard
      ) {
        return null;
      }

      const scored =
        hand.map(
          (
            card,
            index,
          ) => {
            const presetId =
              card.id.startsWith(
                VIRTUAL_SUPPORT_PREFIX,
              )
                ? card.id.slice(
                    VIRTUAL_SUPPORT_PREFIX.length,
                  )
                : undefined;

            const preset =
              presetId
                ? EMOTION_PRESETS.find(
                    (
                      emotion,
                    ) =>
                      emotion.id ===
                      presetId,
                  )
                : EMOTION_PRESETS.find(
                    (
                      emotion,
                    ) =>
                      emotion.name ===
                      card.name,
                  );

            if (!preset) {
              return {
                card,
                index,
                score:
                  1 +
                  Math.random() *
                    3,
              };
            }

            let score =
              2 +
              Math.random() *
                4;

            const amount =
              Number(
                (
                  preset.effectAmount ||
                  ''
                ).replace(
                  /[^0-9.-]/g,
                  '',
                ),
              ) || 0;

            const targetStat:
              | StatKey
              | null =
              preset.effectCategory ===
              '情熱'
                ? 'hp'
                : preset.effectCategory ===
                    '知性'
                  ? 'intellect'
                  : preset.effectCategory ===
                      '技能'
                    ? 'dexterity'
                    : preset.effectCategory ===
                        '愛嬌'
                      ? 'charm'
                      : null;

            if (
              targetStat
            ) {
              if (
                preset.target ===
                '相手'
              ) {
                score +=
                  playerAvatar.stats[
                    targetStat
                  ] *
                  (
                    amount /
                    20
                  ) *
                  0.08;
              }

              if (
                preset.target ===
                '自分'
              ) {
                score +=
                  Math.max(
                    0,
                    50 -
                      cpuAvatar
                        .stats[
                        targetStat
                      ],
                  ) *
                  (
                    amount /
                    20
                  ) *
                  0.08;
              }
            }

            if (
              preset.effectCategory ===
              'ドロー'
            ) {
              score += 8;
            }

            if (
              preset.effectCategory ===
              'スコア'
            ) {
              score += 7;
            }

            if (
              preset.effectCategory ===
              '技封印'
            ) {
              score +=
                playerAvatar
                  .skills.length >
                0
                  ? 6
                  : 0;
            }

            return {
              card,
              index,
              score,
            };
          },
        );

      scored.sort(
        (a, b) =>
          b.score -
          a.score,
      );

      return scored[0];
    };

  const applyCpuSupport =
    (
      card: SupportCard,
      cpuAvatar: BattleAvatar,
      playerAvatar: BattleAvatar,
    ) => {
      const applied =
        applyEmotionToPair(
          card,
          cpuAvatar,
          playerAvatar,
        );

      return {
        cpuAvatar:
          applied.actor,
        playerAvatar:
          applied.target,
        extraDraw:
          applied.extraDraw,
        scoreDelta:
          applied.scoreDelta,
        actorSupportControlEffect:
          applied.actorSupportControlEffect,
        targetSupportControlEffect:
          applied.targetSupportControlEffect,
        targetScoreDelta:
          applied.targetScoreDelta,
      };
    };

  const cpuTurnRef =
    useRef<string>('');

  useEffect(() => {
    if (
      isOnline ||
      battlePhase !==
        'battle' ||
      myTurn
    ) {
      return;
    }

    const key =
      `cpu-${currentYear}-${turnIndex}`;

    if (
      cpuTurnRef.current ===
      key
    ) {
      return;
    }

    cpuTurnRef.current =
      key;

    const timer =
      window.setTimeout(
        () => {
          void (async () => {
            const cpuTurnOrdinal =
              getBattleTurnOrdinal(
                currentYear,
                turnIndex,
              );

            let workingCpuHand =
              [
                ...cpuHand,
              ];

            let workingCpuDeck =
              [
                ...cpuDeck,
              ];

            const cpuDrawCount =
              Math.min(
                1 +
                  getAdditionalDrawFromEffects(
                    oppActiveAvatar.supportControlEffects,
                    cpuTurnOrdinal,
                  ),
                Math.max(
                  0,
                  MAX_HAND -
                    workingCpuHand.length,
                ),
                workingCpuDeck.length,
              );

            if (
              cpuDrawCount >
              0
            ) {
              const drawnCards =
                workingCpuDeck.slice(
                  0,
                  cpuDrawCount,
                );

              workingCpuHand =
                [
                  ...workingCpuHand,
                  ...drawnCards,
                ];

              workingCpuDeck =
                workingCpuDeck.slice(
                  cpuDrawCount,
                );

              setCpuHand(
                workingCpuHand,
              );

              setCpuDeck(
                workingCpuDeck,
              );

              addLog(
                `CPUがサポートカードを${cpuDrawCount}枚ドローしました。`,
              );
            }

            const cpuHandForDecision =
              workingCpuHand;

            let workingCpu =
              oppActiveAvatar;

            let workingPlayer =
              myActiveAvatar;

            let cpuSupportScoreDelta =
              0;

            const cpuSupportUseCount =
              getSupportUseCountFromUsedSkills(
                cpuUsedSkillsByClass,
                currentYear,
                turnIndex,
              );

            const supportChoice =
              chooseCpuSupport(
                cpuHandForDecision,
                workingCpu,
                workingPlayer,
              );

            if (
              supportChoice
            ) {
              const applied =
                applyCpuSupport(
                  supportChoice.card,
                  workingCpu,
                  workingPlayer,
                );

              workingCpu =
                applied.cpuAvatar;

              workingPlayer =
                applied.playerAvatar;

              const supportPreset =
                getEmotionPresetForCard(
                  supportChoice.card,
                );

              await playSupportPreResultEffect(
                {
                  effectKey:
                    getSupportBattleEffect(
                      supportPreset,
                    ),
                  cardName:
                    supportChoice.card.name,
                  imageUrl:
                    getSupportImage(
                      supportChoice.card,
                    ),
                  targetPositions:
                    getSupportTargetPositions(),
                  dialogue:
                    supportPreset?.description,
                  colorHex:
                    undefined,
                  target:
                    getSupportBattleTarget(
                      supportPreset,
                      false,
                    ),
                },
              );

              workingCpuHand =
                workingCpuHand.filter(
                  (
                    _,
                    index,
                  ) =>
                    index !==
                    supportChoice.index,
                );

              const cpuSupportScoreParts:
                string[] =
                [];

              if (
                applied.scoreDelta !==
                0
              ) {
                cpuSupportScoreParts.push(
                  `CPU ${applied.scoreDelta > 0 ? '+' : ''}${applied.scoreDelta}スコア`,
                );
              }

              if (
                applied.targetScoreDelta !==
                0
              ) {
                cpuSupportScoreParts.push(
                  `あなた ${applied.targetScoreDelta > 0 ? '+' : ''}${applied.targetScoreDelta}スコア`,
                );
              }

              addLog(
                `CPUがサポート「${supportChoice.card.name}」を使用しました。` +
                  (
                    cpuSupportScoreParts.length >
                    0
                      ? ` ${cpuSupportScoreParts.join(' / ')}`
                      : ''
                  ),
              );

              const cpuAvatarsAfterSupport =
                applied.actorSupportControlEffect
                  ? applySupportControlToAllAvatars(
                      oppAvatars,
                      applied.actorSupportControlEffect,
                      cpuTurnOrdinal,
                    ).map(
                      (
                        avatar,
                        index,
                      ) =>
                        index ===
                        activeIndex
                          ? workingCpu
                          : avatar,
                    )
                  : oppAvatars.map(
                      (
                        avatar,
                        index,
                      ) =>
                        index ===
                        activeIndex
                          ? workingCpu
                          : avatar,
                    );

              const playerAvatarsAfterSupport =
                applied.targetSupportControlEffect
                  ? applySupportControlToAllAvatars(
                      myAvatars,
                      applied.targetSupportControlEffect,
                      cpuTurnOrdinal,
                    ).map(
                      (
                        avatar,
                        index,
                      ) =>
                        index ===
                        activeIndex
                          ? workingPlayer
                          : avatar,
                    )
                  : myAvatars.map(
                      (
                        avatar,
                        index,
                      ) =>
                        index ===
                        activeIndex
                          ? workingPlayer
                          : avatar,
                    );

              setOppAvatars(
                cpuAvatarsAfterSupport,
              );

              setMyAvatars(
                playerAvatarsAfterSupport,
              );

              workingCpu =
                cpuAvatarsAfterSupport[
                  activeIndex
                ] ||
                workingCpu;

              workingPlayer =
                playerAvatarsAfterSupport[
                  activeIndex
                ] ||
                workingPlayer;

              setCpuUsedSkillsByClass(
                setSupportUseCountInUsedSkills(
                  cpuUsedSkillsByClass,
                  currentYear,
                  turnIndex,
                  cpuSupportUseCount +
                    1,
                ),
              );

              if (
                applied.extraDraw >
                0
              ) {
                const drawCount =
                  Math.min(
                    applied.extraDraw,
                    Math.max(
                      0,
                      MAX_HAND -
                        workingCpuHand.length,
                    ),
                    workingCpuDeck.length,
                  );

                const drawnSupportCards =
                  workingCpuDeck.slice(
                    0,
                    drawCount,
                  );

                workingCpuHand =
                  [
                    ...workingCpuHand,
                    ...drawnSupportCards,
                  ];

                workingCpuDeck =
                  workingCpuDeck.slice(
                    drawCount,
                  );
              }

              setCpuHand(
                workingCpuHand,
              );

              setCpuDeck(
                workingCpuDeck,
              );

              cpuSupportScoreDelta =
                applied.scoreDelta;

              if (
                applied.scoreDelta !==
                0
              ) {
                setOppClassScores(
                  (prev) => {
                    const next =
                      [
                        ...prev,
                      ];

                    next[
                      activeIndex
                    ] =
                      Math.max(
                        0,
                        (
                          next[
                            activeIndex
                          ] || 0
                        ) +
                          applied.scoreDelta,
                      );

                    return next;
                  },
                );

                setGuestTotalScore(
                  (prev) =>
                    Math.max(
                      0,
                      prev +
                        applied.scoreDelta,
                    ),
                );
              }

              if (
                applied.targetScoreDelta !==
                0
              ) {
                setMyClassScores(
                  (prev) => {
                    const next =
                      [
                        ...prev,
                      ];

                    next[
                      activeIndex
                    ] =
                      Math.max(
                        0,
                        (
                          next[
                            activeIndex
                          ] || 0
                        ) +
                          applied.targetScoreDelta,
                      );

                    return next;
                  },
                );

                if (
                  playerRole ===
                  'host'
                ) {
                  setHostTotalScore(
                    (prev) =>
                      Math.max(
                        0,
                        prev +
                          applied.targetScoreDelta,
                      ),
                  );
                } else {
                  setGuestTotalScore(
                    (prev) =>
                      Math.max(
                        0,
                        prev +
                          applied.targetScoreDelta,
                      ),
                  );
                }
              }
            }

            const usedKey =
              `${currentYear}`;

            const usedForClass =
              cpuUsedSkillsByClass[
                usedKey
              ] || [];

            const available =
              workingCpu.skills.filter(
                (skill) =>
                  skill.maxUsesPerClass ===
                    0 ||
                  usedForClass.filter(
                    (
                      usedSkillId,
                    ) =>
                      usedSkillId ===
                      skill.id,
                  ).length <
                    skill.maxUsesPerClass,
              );

            const skill =
              available[
                available.length -
                  1
              ] ||
              workingCpu.skills[
                0
              ];

            if (!skill) {
              return;
            }

            const effective =
              getEffectiveStats(
                workingCpu,
              );

            const opponentEffective =
              getEffectiveStats(
                workingPlayer,
              );

            let gainedScore =
              0;

            let debuffs:
              Partial<
                Record<
                  StatKey,
                  number
                >
              > =
              {};

            const cpuBaseStats =
              workingCpu.baseStats ||
              workingCpu.card
                .stats;

            const playerBaseStats =
              workingPlayer.baseStats ||
              workingPlayer.card
                .stats;

            const cpuRank =
              STAT_KEYS.slice().sort(
                (
                  a,
                  b,
                ) =>
                  Number(
                    cpuBaseStats[
                      b
                    ] || 0,
                  ) -
                  Number(
                    cpuBaseStats[
                      a
                    ] || 0,
                  ),
              );

            if (
              skill.rule ===
              'primary_score'
            ) {
              gainedScore =
                effective[
                  skill.primaryStat ||
                    'hp'
                ] * 20;
            } else if (
              skill.rule ===
              'product_score'
            ) {
              gainedScore =
                (
                  effective[
                    skill.primaryStat ||
                      'intellect'
                  ] +
                  effective[
                    skill.secondaryStat ||
                      'dexterity'
                  ]
                ) * 15;
            } else if (
              skill.rule ===
              'difference_score'
            ) {
              const stat =
                skill.primaryStat ||
                'hp';

              gainedScore =
                Math.max(
                  0,
                  effective[
                    stat
                  ] -
                    opponentEffective[
                      stat
                    ],
                ) * 40;
            } else if (
              skill.rule ===
              'combo_score_and_debuff'
            ) {
              const first =
                skill.secondaryStat ||
                'dexterity';

              const second =
                skill.tertiaryStat ||
                'charm';

              const target =
                skill.primaryStat ||
                'hp';

              gainedScore =
                (
                  effective[
                    first
                  ] +
                  effective[
                    second
                  ]
                ) * 10;

              debuffs[
                target
              ] =
                Math.ceil(
                  opponentEffective[
                    target
                  ] *
                    0.5,
                );
            } else if (
              skill.rule ===
              'total_score'
            ) {
              gainedScore =
                Object.values(
                  effective,
                ).reduce(
                  (
                    sum,
                    value,
                  ) =>
                    sum +
                    Number(
                      value ||
                        0,
                    ),
                  0,
                ) * 10;
            } else if (
              skill.rule ===
              'response_score'
            ) {
              const responseStat =
                cpuRank[0] ||
                'hp';

              gainedScore =
                Math.max(
                  0,
                  effective[
                    responseStat
                  ] -
                    opponentEffective[
                      responseStat
                    ],
                ) * 40;
            } else if (
              skill.rule ===
              'burst'
            ) {
              const boostStat =
                cpuRank[0] ||
                'hp';

              gainedScore =
                effective[
                  boostStat
                ] * 10;

              const cpuCurrentBaseStats =
                workingCpu.baseStats ||
                workingCpu.stats;

              const nextBaseValue =
                Number(
                  cpuCurrentBaseStats[
                    boostStat
                  ] ||
                    0,
                ) * 2;

              workingCpu =
                {
                  ...workingCpu,
                  stats:
                    {
                      ...workingCpu.stats,
                      [boostStat]:
                        nextBaseValue,
                    },
                  baseStats:
                    {
                      ...cpuCurrentBaseStats,
                      [boostStat]:
                        nextBaseValue,
                    },
                };
            } else if (
              skill.rule ===
              'crash'
            ) {
              const cpuLowRank =
                getLowEffectiveStatRank(
                  effective,
                  cpuRank,
                );

              const low =
                cpuLowRank[0] ||
                'hp';

              const secondLow =
                cpuLowRank[1] ||
                'intellect';

              gainedScore =
                (
                  effective[
                    low
                  ] +
                  effective[
                    secondLow
                  ]
                ) * 10;

              Object.entries(
                playerBaseStats,
              ).forEach(
                (
                  [
                    key,
                    value,
                  ],
                ) => {
                  debuffs[
                    key as StatKey
                  ] =
                    Math.ceil(
                      Number(
                        value ||
                          0,
                      ) * 0.25,
                    );
                },
              );
            } else {
              gainedScore =
                effective.hp *
                10;
            }

            const cpuSkillPreset =
              getPresetForCard(
                workingCpu.card,
              );

            const cpuSkillIndex =
              workingCpu.skills.findIndex(
                (item) =>
                  item.id ===
                  skill.id,
              );

            await playSkillPreResultEffect(
              {
                effectKey:
                  getCharacterSkillBattleEffect(
                    cpuSkillPreset,
                    cpuSkillIndex,
                  ),
                characterName:
                  workingCpu.card
                    .userName,
                skillName:
                  skill.name,
                dialogue:
                  skill.description,
                colorHex:
                  getBattleVisualColorHex(
                    workingCpu.card,
                  ),
                side: 'right',
              },
            );

            setOppAvatars(
              (prev) =>
                prev.map(
                  (
                    avatar,
                    index,
                  ) =>
                    index ===
                    activeIndex
                      ? workingCpu
                      : avatar,
                ),
            );

            if (
              Object.keys(
                debuffs,
              ).length >
                0 &&
              !workingPlayer.debuffImmune
            ) {
              setMyAvatars(
                (prev) =>
                  prev.map(
                    (
                      avatar,
                      index,
                    ) =>
                      index ===
                      activeIndex
                        ? {
                            ...avatar,
                            currentDebuff:
                              {
                                hp:
                                  avatar
                                    .currentDebuff
                                    .hp +
                                  Number(
                                    debuffs.hp ||
                                      0,
                                  ),
                                intellect:
                                  avatar
                                    .currentDebuff
                                    .intellect +
                                  Number(
                                    debuffs.intellect ||
                                      0,
                                  ),
                                dexterity:
                                  avatar
                                    .currentDebuff
                                    .dexterity +
                                  Number(
                                    debuffs.dexterity ||
                                      0,
                                  ),
                                charm:
                                  avatar
                                    .currentDebuff
                                    .charm +
                                  Number(
                                    debuffs.charm ||
                                      0,
                                  ),
                              },
                          }
                        : avatar,
                  ),
              );
            }

            const nextCpuUsed =
              {
                ...cpuUsedSkillsByClass,
                [usedKey]:
                  skill.maxUsesPerClass >
                  0
                    ? [
                        ...usedForClass,
                        skill.id,
                      ]
                    : usedForClass,
              };

            setCpuUsedSkillsByClass(
              nextCpuUsed,
            );

            setOppClassScores(
              (prev) => {
                const nextScores =
                  [
                    ...prev,
                  ];

                nextScores[
                  activeIndex
                ] =
                  (
                    nextScores[
                      activeIndex
                    ] || 0
                  ) +
                  gainedScore;

                return nextScores;
              },
            );

            setGuestTotalScore(
              (prev) =>
                prev +
                gainedScore,
            );

            addLog(
              `CPU「${skill.name}」発動！ +${gainedScore}スコア`,
            );

            const next =
              getNextTurnState();

            const finalMyScore =
              next.nextPhase ===
                'setup' ||
              next.nextPhase ===
                'finished'
                ? myClassScores[
                    activeIndex
                  ] || 0
                : 0;

            const finalOpponentScore =
              next.nextPhase ===
                'setup' ||
              next.nextPhase ===
                'finished'
                ? (
                    oppClassScores[
                      activeIndex
                    ] || 0
                  ) +
                  cpuSupportScoreDelta +
                  gainedScore
                : 0;

            if (
              next.nextPhase ===
                'setup' ||
              next.nextPhase ===
                'finished'
            ) {
              const resolvedMyTotal =
                myClassScores.reduce(
                  (
                    sum,
                    score,
                  ) =>
                    sum +
                    score,
                  0,
                );

              const resolvedOpponentTotal =
                oppClassScores.reduce(
                  (
                    sum,
                    score,
                  ) =>
                    sum +
                    score,
                  0,
                );

              showClassResult(
                currentYear,
                finalMyScore,
                finalOpponentScore,
                resolvedMyTotal,
                resolvedOpponentTotal +
                  cpuSupportScoreDelta +
                  gainedScore,
              );
            }

            setCurrentYear(
              next.currentYear,
            );

            setTurnIndex(
              next.turnIndex,
            );

            setBattlePhase(
              next.nextPhase,
            );

            if (
              next.nextPhase ===
              'setup'
            ) {
              setFirstPlayer(
                null,
              );

              setStartSeasonIdx(
                null,
              );

              setMyDeckReady(
                true,
              );

              setDeckConfirmed(
                true,
              );

              setPreparationMessage(
                `${next.currentYear}年目の準備を開始します。\nコイントスを行ってください。`,
              );
            }
          })();
        },
        650,
      );

    return () =>
      window.clearTimeout(
        timer,
      );
  }, [
    isOnline,
    battlePhase,
    myTurn,
    currentYear,
    turnIndex,
    cpuUsedSkillsByClass,
    oppActiveAvatar,
    myActiveAvatar,
    activeIndex,
    cpuHand.length,
    cpuDeck,
  ]);

  const handleUseSupportCard =
    async (
      card: SupportCard,
      index: number,
    ) => {
      if (
        !myTurn ||
        battlePhase !==
          'battle'
      ) {
        return;
      }

      if (
        isBattlePreResultEffectPlaying()
      ) {
        return;
      }

      if (
        supportSubmitInProgressRef.current
      ) {
        return;
      }

      if (!myHand[index]) {
        return;
      }

      const supportTurnOrdinal =
        getBattleTurnOrdinal(
          currentYear,
          turnIndex,
        );

      const supportPreset =
        getEmotionPresetForCard(
          card,
        );

      const isFreeSupportCard =
        supportPreset?.effectCategory ===
          'サポートカード使用数' &&
        supportPreset.statEffect.includes(
          '制限されない',
        );

      const supportUseLimit =
        getSupportUsageLimitFromEffects(
          myActiveAvatar.supportControlEffects,
          supportTurnOrdinal,
        );

      const supportUseCount =
        getSupportUseCountFromUsedSkills(
          usedSkillsByClass,
          currentYear,
          turnIndex,
        );

      if (
        !isFreeSupportCard &&
        Number.isFinite(
          supportUseLimit,
        ) &&
        supportUseCount >=
          supportUseLimit
      ) {
        addLog(
          'このターンはサポートカードをこれ以上使用できません。',
        );

        return;
      }

      supportSubmitInProgressRef.current =
        true;

      setSupportSubmittingCardIndex(
        index,
      );

      try {
        if (
          isOnline
        ) {
          if (
            !myPlayerRef
          ) {
            addLog(
              '⚠️ 自分のPlayer情報が見つかりません。',
            );

            return;
          }

          const submitted =
            await submitBattleAction(
              {
                type:
                  'PLAY_SUPPORT',
                year:
                  currentYear,
                turnIndex,
                avatarIndex:
                  activeIndex,
                supportCardId:
                  card.id,
              },
            );

          if (
            !submitted
          ) {
            addLog(
              '⚠️ サポート使用Actionの送信に失敗しました。',
            );

            return;
          }

          playSupportUseSe(
            supportPreset,
          );

          await playSupportPreResultEffect(
            {
              effectKey:
                getSupportBattleEffect(
                  supportPreset,
                ),
              cardName:
                card.name,
              imageUrl:
                getSupportImage(
                  card,
                ),
              targetPositions:
                getSupportTargetPositions(),
              dialogue:
                getSupportFlavorText(
                  card,
                ) ||
                supportPreset?.description,
              colorHex:
                getSupportColorHex(
                  card,
                ),
              target:
                getSupportBattleTarget(
                  supportPreset,
                  true,
                ),
            },
          );

          setSelectedSupportCardIndex(
            null,
          );

          addLog(
            `サポート「${card.name}」を使用しました。${
              supportPreset?.description
                ? ` ${supportPreset.description}`
                : ''
            }`,
          );

          return;
        }

        const applied =
          applyEmotionToPair(
            card,
            myActiveAvatar,
            oppActiveAvatar,
          );

        let nextMyAvatars =
          myAvatars.map(
            (
              avatar,
              avatarIndex,
            ) =>
              avatarIndex ===
              activeIndex
                ? applied.actor
                : avatar,
          );

        let nextOppAvatars =
          oppAvatars.map(
            (
              avatar,
              avatarIndex,
            ) =>
              avatarIndex ===
              activeIndex
                ? applied.target
                : avatar,
          );

        if (
          applied.actorSupportControlEffect
        ) {
          nextMyAvatars =
            applySupportControlToAllAvatars(
              nextMyAvatars,
              applied.actorSupportControlEffect,
              supportTurnOrdinal,
            );
        }

        if (
          applied.targetSupportControlEffect
        ) {
          nextOppAvatars =
            applySupportControlToAllAvatars(
              nextOppAvatars,
              applied.targetSupportControlEffect,
              supportTurnOrdinal,
            );
        }

        const nextUsedSkills =
          setSupportUseCountInUsedSkills(
            usedSkillsByClass,
            currentYear,
            turnIndex,
            supportUseCount +
              1,
          );

        let nextHand =
          myHand.filter(
            (
              _,
              handIndex,
            ) =>
              handIndex !==
              index,
          );

        let nextDeck =
          [
            ...myDeck,
          ];

        if (
          applied.extraDraw >
          0
        ) {
          const drawCount =
            Math.min(
              applied.extraDraw,
              Math.max(
                0,
                MAX_HAND -
                  nextHand.length,
              ),
              nextDeck.length,
            );

          nextHand = [
            ...nextHand,
            ...nextDeck.slice(
              0,
              drawCount,
            ),
          ];

          nextDeck =
            nextDeck.slice(
              drawCount,
            );
        }

        playSupportUseSe(
          supportPreset,
        );

        await playSupportPreResultEffect(
          {
            effectKey:
              getSupportBattleEffect(
                supportPreset,
              ),
            cardName:
              card.name,
            imageUrl:
              getSupportImage(
                card,
              ),
            targetPositions:
              getSupportTargetPositions(),
            dialogue:
              getSupportFlavorText(
                card,
              ) ||
              supportPreset?.description,
            colorHex:
              getSupportColorHex(
                card,
              ),
            target:
              getSupportBattleTarget(
                supportPreset,
                true,
              ),
          },
        );

        setMyAvatars(
          nextMyAvatars,
        );

        setOppAvatars(
          nextOppAvatars,
        );

        setMyHand(
          nextHand,
        );

        setMyDeck(
          nextDeck,
        );

        const localSupportDrawCount =
          Math.max(
            0,
            nextHand.length -
              (
                myHand.length -
                1
              ),
          );

        if (
          localSupportDrawCount >
          0
        ) {
          triggerSupportDealAnimation(
            localSupportDrawCount,
          );

          revealSupportCardIndexes(
            Array.from(
              {
                length:
                  localSupportDrawCount,
              },
              (
                _,
                drawIndex,
              ) =>
                nextHand.length -
                localSupportDrawCount +
                drawIndex,
            ),
          );
        }

        setSelectedSupportCardIndex(
          null,
        );

        if (
          applied.scoreDelta !==
          0
        ) {
          setMyClassScores(
            (prev) => {
              const next =
                [
                  ...prev,
                ];

              next[
                activeIndex
              ] =
                Math.max(
                  0,
                  (
                    next[
                      activeIndex
                    ] || 0
                  ) +
                    applied.scoreDelta,
                );

              return next;
            },
          );

          if (
            playerRole ===
            'host'
          ) {
            setHostTotalScore(
              (prev) =>
                Math.max(
                  0,
                  prev +
                    applied.scoreDelta,
                ),
            );
          } else {
            setGuestTotalScore(
              (prev) =>
                Math.max(
                  0,
                  prev +
                    applied.scoreDelta,
                ),
            );
          }
        }

        const localSupportScoreParts:
          string[] =
          [];

        if (
          applied.scoreDelta !==
          0
        ) {
          localSupportScoreParts.push(
            `自分 ${applied.scoreDelta > 0 ? '+' : ''}${applied.scoreDelta}スコア`,
          );
        }

        if (
          applied.targetScoreDelta !==
          0
        ) {
          localSupportScoreParts.push(
            `相手 ${applied.targetScoreDelta > 0 ? '+' : ''}${applied.targetScoreDelta}スコア`,
          );
        }

        addLog(
          `サポート「${card.name}」を使用しました。` +
            (
              localSupportScoreParts.length >
              0
                ? ` ${localSupportScoreParts.join(' / ')}`
                : ''
            ) +
            (
              supportPreset?.description
                ? ` ${supportPreset.description}`
                : ''
            ),
        );
      } finally {
        supportSubmitInProgressRef.current =
          false;

        setSupportSubmittingCardIndex(
          null,
        );
      }
    };

  const resetLocalGameStateForRematch =
    () => {
      let selectedDeck:
        | Deck
        | null =
        null;

      try {
        const raw =
          localStorage.getItem(
            'reality_decks',
          );

        const decks: Deck[] =
          raw
            ? JSON.parse(
                raw,
              )
            : [];

        selectedDeck =
          decks.find(
            (deck) =>
              deck.id ===
              activeDeckId,
          ) ||
          decks[0] ||
          null;
      } catch {
        selectedDeck =
          null;
      }

      const loadedAvatars =
        loadDeckAndAvatars(
          selectedDeck?.id ||
            activeDeckId,
        );

      let supportState:
        | {
            hand: SupportCard[];
            deck: SupportCard[];
          }
        | null =
        null;

      if (isOnline) {
        setMyHand([]);
        setMyDeck([]);

        supportState = {
          hand: [],
          deck: [],
        };
      } else {
        supportState =
          resetLocalSupportDeck(
            selectedDeck,
          );
      }

      setMyAvatars(
        loadedAvatars,
      );

      setCurrentYear(
        1,
      );

      setTurnIndex(
        0,
      );

      setFirstPlayer(
        null,
      );

      setStartSeasonIdx(
        null,
      );

      setMyClassScores(
        [0, 0, 0],
      );

      setOppClassScores(
        [0, 0, 0],
      );

      setHostTotalScore(
        0,
      );

      setGuestTotalScore(
        0,
      );

      setUsedSkillsByClass(
        {},
      );

      setCpuUsedSkillsByClass(
        {},
      );

      setMyDeckReady(
        true,
      );

      setDeckConfirmed(
        false,
      );

      lastActionRef.current =
        '';

      lastSkillActionRef.current =
        '';

      lastSupportActionRef.current =
        '';

      lastObservedBattlePhaseRef.current =
        '';

      lastObservedYearRef.current =
        1;

      initializedRef.current =
        false;

      previousTurnRef.current =
        '';

      drawInProgressRef.current =
        '';

      cpuTurnRef.current =
        '';

      return {
        loadedAvatars,
        supportState,
      };
    };

  const deleteRoomData =
    async () => {
      if (
        !isOnline ||
        !roomId ||
        !authReady
      ) {
        return;
      }

      const currentUser =
        await ensureAnonymousAuth();

      const roomRef =
        doc(
          db,
          'rooms',
          roomId,
        );

      const hostPlayerRef =
        doc(
          db,
          'rooms',
          roomId,
          'players',
          'host',
        );

      const guestPlayerRef =
        doc(
          db,
          'rooms',
          roomId,
          'players',
          'guest',
        );

      const hostPrivatePlayerRef =
        doc(
          db,
          'rooms',
          roomId,
          'privatePlayers',
          'host',
        );

      const guestPrivatePlayerRef =
        doc(
          db,
          'rooms',
          roomId,
          'privatePlayers',
          'guest',
        );

      const hostPresenceRef =
        doc(
          db,
          'rooms',
          roomId,
          'presence',
          'host',
        );

      const guestPresenceRef =
        doc(
          db,
          'rooms',
          roomId,
          'presence',
          'guest',
        );

      await runTransaction(
        db,
        async (
          transaction,
        ) => {
          const roomSnapshot =
            await transaction.get(
              roomRef,
            );

          if (
            !roomSnapshot.exists()
          ) {
            return;
          }

          const roomData =
            roomSnapshot.data() as Record<
              string,
              unknown
            >;

          const isRoomMember =
            roomData.hostUid ===
              currentUser.uid ||
            roomData.guestUid ===
              currentUser.uid;

          if (
            !isRoomMember
          ) {
            throw new Error(
              'ROOM_CLOSE_NOT_ALLOWED',
            );
          }

          const exitField =
            playerRole ===
            'host'
              ? 'exitHost'
              : 'exitGuest';

          transaction.update(
            roomRef,
            {
              [exitField]:
                true,
              roomClosed:
                true,
            },
          );
        },
      );

      await runTransaction(
        db,
        async (
          transaction,
        ) => {
          const roomSnapshot =
            await transaction.get(
              roomRef,
            );

          if (
            !roomSnapshot.exists()
          ) {
            return;
          }

          const roomData =
            roomSnapshot.data() as Record<
              string,
              unknown
            >;

          if (
            roomData.roomClosed !==
            true
          ) {
            throw new Error(
              'ROOM_IS_NOT_CLOSED',
            );
          }

          transaction.delete(
            hostPlayerRef,
          );

          transaction.delete(
            guestPlayerRef,
          );

          transaction.delete(
            hostPrivatePlayerRef,
          );

          transaction.delete(
            guestPrivatePlayerRef,
          );

          transaction.delete(
            hostPresenceRef,
          );

          transaction.delete(
            guestPresenceRef,
          );

          transaction.delete(
            roomRef,
          );
        },
      );
    };

  const exitBecauseOpponentDisconnected =
    async () => {
      if (
        !isOnline ||
        !roomId ||
        !authReady
      ) {
        return;
      }

      try {
        await deleteRoomData();

        setShowOpponentDisconnectModal(
          false,
        );

        setWaitingMessage(
          '対戦を終了しました。ホームへ戻ります。',
        );

        setBattlePhase(
          'waiting',
        );

        if (
          roomCloseRedirectRef.current ===
          null
        ) {
          roomCloseRedirectRef.current =
            window.setTimeout(
              () =>
                window.location.assign(
                  '/',
                ),
              1200,
            );
        }
      } catch (error) {
        console.error(
          '切断時の退出処理エラー:',
          error,
        );

        addLog(
          '⚠️ 対戦終了処理に失敗しました。',
        );
      }
    };

  const chooseRematch =
    async (
      choice:
        | 'rematch'
        | 'exit',
    ) => {
      if (
        rematchChoice ||
        (
          isOnline &&
          !authReady
        )
      ) {
        return;
      }

      if (!isOnline) {
        if (
          choice ===
          'exit'
        ) {
          setRematchChoice(
            'exit',
          );

          setWaitingMode(
            'return',
          );

          setWaitingMessage(
            'CPU対戦を終了しました。',
          );

          setBattlePhase(
            'waiting',
          );

          if (
            roomCloseRedirectRef.current ===
            null
          ) {
            roomCloseRedirectRef.current =
              window.setTimeout(
                () =>
                  window.location.assign(
                    '/',
                  ),
                1200,
              );
          }

          return;
        }

        setRematchChoice(
          'rematch',
        );

        resetLocalGameStateForRematch();

        setBattlePhase(
          'setup',
        );

        setPreparationMessage(
          '新しいゲームを始めます。\n先手・後手を決めるコイントスを行ってください。',
        );

        buildCpuDeck();

        return;
      }

      const roomRef =
        doc(
          db,
          'rooms',
          roomId,
        );

      if (
        choice ===
        'exit'
      ) {
        try {
          await deleteRoomData();

          setRematchChoice(
            'exit',
          );

          setWaitingMode(
            'return',
          );

          setWaitingMessage(
            '対戦を終了しました。',
          );

          setBattlePhase(
            'waiting',
          );

          if (
            roomCloseRedirectRef.current ===
            null
          ) {
            roomCloseRedirectRef.current =
              window.setTimeout(
                () =>
                  window.location.assign(
                    '/',
                  ),
                1200,
              );
          }

          return;
        } catch (error) {
          console.error(
            '再戦終了・Room削除エラー:',
            error,
          );

          addLog(
            '⚠️ 対戦終了処理に失敗しました。',
          );

          return;
        }
      }

      try {
        const result =
          await runTransaction(
            db,
            async (
              transaction,
            ) => {
              const snapshot =
                await transaction.get(
                  roomRef,
                );

              if (
                !snapshot.exists()
              ) {
                throw new Error(
                  'ステージが終了しています。',
                );
              }

              const data =
                snapshot.data();

              const otherRole: PlayerRole =
                playerRole ===
                'host'
                  ? 'guest'
                  : 'host';

              const otherChoice =
                Boolean(
                  data[
                    otherRole ===
                    'host'
                      ? 'rematchHost'
                      : 'rematchGuest'
                  ],
                );

              const field =
                playerRole ===
                'host'
                  ? 'rematchHost'
                  : 'rematchGuest';

              transaction.update(
                roomRef,
                {
                  [field]:
                    true,
                },
              );

              return {
                otherChoice,
              };
            },
          );

        setRematchChoice(
          choice,
        );

        if (
          result.otherChoice
        ) {
          const message =
            playerRole ===
            'host'
              ? '新しいゲームを始めます。\n先手・後手を決めるコイントスを行います。'
              : '新しいゲームを始めます。\nコイントスの結果をお待ちください。';

          setPreparationMessage(
            message,
          );

          addLog(
            message.replace(
              '\n',
              ' ',
            ),
          );
        } else {
          addLog(
            'もう一回するを選択しました。相手の選択を待っています。',
          );
        }
      } catch (error) {
        console.error(
          '再戦・退出処理エラー:',
          error,
        );

        addLog(
          '⚠️ 再戦・退出処理に失敗しました。',
        );
      }
    };

  useEffect(() => {
    if (
      !isOnline ||
      battlePhase !==
        'finished' ||
      !roomId ||
      !authReady ||
      !myPlayerRef ||
      !myPrivatePlayerRef
    ) {
      return;
    }

    const roomRef =
      doc(
        db,
        'rooms',
        roomId,
      );

    const resetField =
      playerRole ===
      'host'
        ? 'rematchPlayerResetHost'
        : 'rematchPlayerResetGuest';

    const unsubscribe =
      onSnapshot(
        roomRef,
        (snapshot) => {
          const data =
            snapshot.data();

          if (!data) {
            return;
          }

          const bothRematched =
            Boolean(
              data.rematchHost,
            ) &&
            Boolean(
              data.rematchGuest,
            );

          if (
            !bothRematched
          ) {
            rematchPlayerResetInProgressRef.current =
              false;

            return;
          }

          if (
            data[
              resetField
            ] ===
            true
          ) {
            return;
          }

          if (
            rematchPlayerResetInProgressRef.current
          ) {
            return;
          }

          rematchPlayerResetInProgressRef.current =
            true;

          void (async () => {
            try {
              const {
                loadedAvatars,
              } =
                resetLocalGameStateForRematch();

              const currentUser =
                await ensureAnonymousAuth();

              await setDoc(
                myPrivatePlayerRef,
                {
                  uid:
                    currentUser.uid,
                  hand: [],
                  deck: [],
                },
                {
                  merge: true,
                },
              );

              await setDoc(
                myPlayerRef,
                {
                  uid:
                    currentUser.uid,
                  role:
                    playerRole,
                  joined:
                    true,
                  avatars:
                    loadedAvatars,
                  handCount:
                    0,
                  deckCount:
                    0,
                  usedSkills:
                    {},
                  lastProcessedIncomingActionId:
                    '',
                  pendingAction:
                    deleteField(),
                  lastSkillActionId:
                    deleteField(),
                  lastSkillAction:
                    deleteField(),
                  lastSupportActionId:
                    deleteField(),
                  lastSupportCardId:
                    deleteField(),
                  lastSupportCardCountBefore:
                    deleteField(),
                  lastSupportCardCountAfter:
                    deleteField(),
                  lastSupportActionAt:
                    deleteField(),
                  hand:
                    deleteField(),
                  deck:
                    deleteField(),
                },
                {
                  merge: true,
                },
              );

              await updateDoc(
                roomRef,
                {
                  [resetField]:
                    true,
                },
              );
            } catch (error) {
              rematchPlayerResetInProgressRef.current =
                false;

              console.error(
                '再戦時Player完全初期化エラー:',
                error,
              );

              addLog(
                '⚠️ 再戦時のPlayer初期化に失敗しました。',
              );
            }
          })();
        },
      );

    return () =>
      unsubscribe();
  }, [
    isOnline,
    battlePhase,
    roomId,
    authReady,
    playerRole,
    myPlayerRef,
    myPrivatePlayerRef,
  ]);

  useEffect(() => {
    if (
      !isOnline ||
      battlePhase !==
        'finished' ||
      !isHost ||
      !roomId ||
      !authReady
    ) {
      return;
    }

    const roomRef =
      doc(
        db,
        'rooms',
        roomId,
      );

    const unsubscribe =
      onSnapshot(
        roomRef,
        (snapshot) => {
          const data =
            snapshot.data();

          if (
            !data ||
            data.battlePhase !==
              'finished'
          ) {
            return;
          }

          if (
            !data.rematchHost ||
            !data.rematchGuest
          ) {
            return;
          }

          if (
            data.rematchPlayerResetHost !==
              true ||
            data.rematchPlayerResetGuest !==
              true
          ) {
            return;
          }

          void submitBattleLifecycleAction(
            'REMATCH_RESET',
          ).then(
            (
              result,
            ) => {
              if (
                !result
              ) {
                console.error(
                  '再戦リセットRoom更新エラー: サーバーActionに失敗しました。',
                );
              }
            },
          );
        },
      );

    return () =>
      unsubscribe();
  }, [
    isOnline,
    battlePhase,
    isHost,
    roomId,
    authReady,
  ]);

  const getDeckSupportSummary =
    (
      deck: Deck | null,
    ) => {
      if (
        !deck?.supportCardIds
          ?.length
      ) {
        return 'サポートなし';
      }

      try {
        const entriesRaw =
          localStorage.getItem(
            'reality_world_entries',
          );

        const entries:
          EntryRecordWithSkills[] =
          entriesRaw
            ? JSON.parse(
                entriesRaw,
              )
            : [];

        const pool =
          getSupportPool(
            entries,
          );

        const resolvedIds =
          resolveSupportIdsForBattle(
            deck.supportCardIds,
            entries,
          );

        const counts =
          new Map<
            string,
            number
          >();

        resolvedIds.forEach(
          (id) => {
            const card =
              pool.find(
                (item) =>
                  item.id ===
                  id,
              );

            const name =
              card?.name ||
              id;

            counts.set(
              name,
              (
                counts.get(
                  name,
                ) || 0
              ) + 1,
            );
          },
        );

        return Array.from(
          counts.entries(),
        )
          .map(
            ([
              name,
              count,
            ]) =>
              `${name}${
                count > 1
                  ? `×${count}`
                  : ''
              }`,
          )
          .join(
            ' / ',
          );
      } catch {
        return `${deck.supportCardIds.length}枚`;
      }
    };

  const getDeckPreviewData =
    (
      deck: Deck,
    ) => {
      try {
        const entriesRaw =
          localStorage.getItem(
            'reality_world_entries',
          );

        const entries:
          EntryRecordWithSkills[] =
          entriesRaw
            ? JSON.parse(
                entriesRaw,
              )
            : [];

        const cards: Array<
          AvatarCard & {
            presetId?: string;
          }
        > = [
          ...CHARACTER_SAMPLE_CARDS,
        ];

        for (
          const entry of entries.filter(
            (item) =>
              item.cardType ===
              'coordinate',
          )
        ) {
          cards.push({
            id: entry.id,
            profileUrl:
              entry.profileUrl ||
              '',
            userName:
              entry.userName ||
              'キャラ',
            imageDataUrl:
              entry.imageDataUrl ||
              '',
            color:
              (entry.color as
                | '赤'
                | '青'
                | '黄') ||
              '赤',
            archetype:
              (entry.archetype as Archetype) ||
              'バランス型',
            favoredSeason:
              '春',
            stats: {
              hp:
                entry.hp ??
                80,
              intellect:
                entry.ap ??
                20,
              dexterity:
                20,
              charm: 20,
            },
            passwordHash:
              entry.passwordHash ||
              '',
            createdAt:
              entry.createdAt ||
              '',
            updatedAt:
              entry.createdAt ||
              '',
            presetId:
              entry.presetId,
          });
        }

        const roleItems:
          Array<{
            role: RoleName;
            id: string | null;
          }> = [
          {
            role: '先鋒',
            id: deck.vanguardCardId,
          },
          {
            role: '中堅',
            id: deck.centerCardId,
          },
          {
            role: '大将',
            id: deck.generalCardId,
          },
        ];

        const characters =
          roleItems.map(
            ({
              role,
              id,
            }) => {
              const card =
                cards.find(
                  (item) =>
                    item.id ===
                    id,
                );

              const preset =
                card
                  ? getPresetForCard(
                      card,
                    )
                  : undefined;

              const stats =
                preset?.stats ||
                card?.stats;

              return {
                role,
                name:
                  card?.userName ||
                  '未選択',
                imageDataUrl:
                  card?.imageDataUrl ||
                  '',
                stats:
                  stats || {
                    hp: 0,
                    intellect: 0,
                    dexterity: 0,
                    charm: 0,
                  },
              };
            },
          );

        const pool =
          getSupportPool(
            entries,
          );

        const resolvedIds =
          resolveSupportIdsForBattle(
            deck.supportCardIds ||
              [],
            entries,
          );

const grouped =
  new Map<
    string,
    {
      id: string;
      name: string;
      count: number;
      category: string;
    }
  >();

        for (
          const id of resolvedIds
        ) {
          const card =
            pool.find(
              (item) =>
                item.id ===
                id,
            );

          const name =
            card?.name ||
            id;

          const existing =
            grouped.get(
              name,
            );

          if (existing) {
            existing.count +=
              1;
          } else {
            const preset =
              card?.presetId
                ? EMOTION_PRESETS.find(
                    (item) =>
                      item.id ===
                      card.presetId,
                  )
                : undefined;

grouped.set(
  name,
  {
    id,
    name,
    count: 1,
    category:
      preset?.effectCategory ||
      'その他',
  },
);
          }
        }

        const supportCategories =
          Array.from(
            grouped.values(),
          ).reduce<
            Record<
              string,
              number
            >
          >(
            (
              acc,
              item,
            ) => {
              acc[
                item.category
              ] =
                (
                  acc[
                    item.category
                  ] || 0
                ) +
                item.count;

              return acc;
            },
            {},
          );

        const totalStats =
          characters.reduce(
            (
              acc,
              character,
            ) => ({
              hp:
                acc.hp +
                character
                  .stats
                  .hp,
              intellect:
                acc.intellect +
                character
                  .stats
                  .intellect,
              dexterity:
                acc.dexterity +
                character
                  .stats
                  .dexterity,
              charm:
                acc.charm +
                character
                  .stats
                  .charm,
            }),
            {
              hp: 0,
              intellect: 0,
              dexterity: 0,
              charm: 0,
            },
          );

        return {
          characters,
          supports:
            Array.from(
              grouped.values(),
            ),
          supportCategories,
          totalStats,
        };
      } catch {
        return null;
      }
    };

  const handleSelectDeck =
    async (
      deckId: string,
    ) => {
      if (
        battlePhase !==
          'setup' ||
        currentYear !==
          1
      ) {
        return;
      }

      const loaded =
        loadDeckAndAvatars(
          deckId,
        );

      const selectedDeck =
        loadDeckDefinition(
          deckId,
        );

      setIsDeckSelectOpen(
        false,
      );

      if (isOnline) {
        setMyHand([]);
        setMyDeck([]);
      } else {
        resetLocalSupportDeck(
          selectedDeck,
        );
      }

      setMyDeckReady(
        Boolean(
          selectedDeck,
        ),
      );

      setDeckConfirmed(
        false,
      );

      if (
        isOnline
      ) {
        if (
          !myPlayerRef
        ) {
          addLog(
            '⚠️ プレイヤーデータを保存できません。',
          );

          return;
        }

        await updateDoc(
          myPlayerRef,
          {
            avatars:
              loaded,
            deckId,
            joined:
              true,
          },
        );

        const readyField =
          playerRole ===
          'host'
            ? 'readyHost'
            : 'readyGuest';

        await updateDoc(
          doc(
            db,
            'rooms',
            roomId,
          ),
          {
            [readyField]:
              false,
          },
        );

        setPreparationMessage(
          'チームを変更しました。もう一度「このチームではじめる」を押してください。',
        );
      } else {
        setPreparationMessage(
          `チーム「${selectedDeck?.name || '新しいチーム'}」を選択しました。`,
        );
      }
    };

  const usedThisClass =
    usedSkillsByClass[
      String(
        currentYear,
      )
    ] || [];

  const supportTurnOrdinal =
    getBattleTurnOrdinal(
      currentYear,
      turnIndex,
    );

  const supportUseLimit =
    getSupportUsageLimitFromEffects(
      myActiveAvatar.supportControlEffects,
      supportTurnOrdinal,
    );

  const supportUseCount =
    getSupportUseCountFromUsedSkills(
      usedSkillsByClass,
      currentYear,
      turnIndex,
    );

  const supportUsageLimited =
    Number.isFinite(
      supportUseLimit,
    );

  const supportUsageLimitReached =
    supportUsageLimited &&
    supportUseCount >=
      supportUseLimit;

  const hostWaitingIndexes =
    [2, 1, 0];

  const guestWaitingIndexes =
    [0, 1, 2];

  const roleDisplayNames:
    Record<
      RoleName,
      string
    > = {
    先鋒:
      'フェザークラス',
    中堅:
      'オーロラクラス',
    大将:
      'スタークラス',
  };

  const currentRoleName =
    ROLE_NAMES[
      currentYear - 1
    ];

  const currentRoleDisplayName =
    roleDisplayNames[
      currentRoleName
    ];

  const canShowCoinToss =
    deckConfirmed &&
    onlineDecksConfirmed &&
    onlineClassPreparationConfirmed;

  const selectedSupportCard =
    selectedSupportCardIndex !==
    null
      ? myHand[
          selectedSupportCardIndex
        ]
      : undefined;

  const supportDetailCard =
    selectedSupportCard ??
    selectedSetupSupportCard ??
    undefined;

  const selectedSupportPreset =
    supportDetailCard
      ? getEmotionPresetForCard(
          supportDetailCard,
        )
      : undefined;

  const selectedSupportBadges =
    selectedSupportPreset
      ? getEmotionPerformanceBadges(
          selectedSupportPreset,
        )
      : undefined;

  const selectedSupportIsFree =
    selectedSupportPreset?.effectCategory ===
      'サポートカード使用数' &&
    selectedSupportPreset.statEffect.includes(
      '制限されない',
    );

  const selectedSupportLimitReached =
    supportUsageLimitReached &&
    !selectedSupportIsFree;

  const currentSkillTurnOrdinal =
    getBattleTurnOrdinal(
      currentYear,
      turnIndex,
    );

  const isSkillUsable =
    (
      skill: Skill,
    ) => {
      const skillIndex =
        myActiveAvatar.skills.findIndex(
          (item) =>
            item.id ===
            skill.id,
        );

      return (
        myTurn &&
        !(
          skill.maxUsesPerClass >
            0 &&
          usedThisClass.filter(
            (
              skillId,
            ) =>
              skillId ===
              skill.id,
          ).length >=
            skill.maxUsesPerClass
        ) &&
        !hasSkillSeal(
          myActiveAvatar,
          skillIndex,
          currentSkillTurnOrdinal,
        )
      );
    };

  return (
    <div className="relative h-full min-h-0 w-full overflow-hidden text-slate-900">
      <BattleEffectLayer />
      <OutdoorStageBackground
        season={currentSeason}
      />

      <div className="relative z-10 mx-auto flex h-full min-h-0 w-full max-w-7xl flex-col p-2 sm:p-3 md:p-4">
        <header className="shrink-0 rounded-2xl border border-white/60 bg-white/75 p-2.5 shadow-lg backdrop-blur-md sm:p-3">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="truncate text-[9px] font-black tracking-[0.2em] text-indigo-500">
                REALITY LIVE BATTLE
              </div>

              <div className="mt-0.5 truncate text-sm font-black text-slate-950 sm:text-base">
                {currentYear}年目　{currentRoleDisplayName}
                {battlePhase ===
                  'battle' && (
                  <>
                    　／　{currentSeason}
                  </>
                )}
              </div>

              {battlePhase ===
                'battle' && (
                <div className="mt-0.5 text-[10px] font-bold text-slate-500">
                  ターン{' '}
                  {turnIndex +
                    1}{' '}
                  / 8
                </div>
              )}
            </div>

            <div className="flex shrink-0 items-center gap-2">
              {battlePhase ===
                'battle' && (
                <button
                  type="button"
                  onClick={() =>
                    setShowBattleLog(
                      true,
                    )
                  }
                  className="rounded-xl bg-white px-2.5 py-2 text-[9px] font-black text-slate-700 shadow-sm ring-1 ring-slate-200 transition hover:bg-slate-50"
                >
                  試合実況
                  <span className="ml-1 opacity-40">
                    {
                      log.length
                    }
                  </span>
                </button>
              )}
            </div>
          </div>
        </header>

        {classResult && (
          <section className="mt-2 flex min-h-0 flex-1 items-center justify-center">
            <div className="w-full max-w-md rounded-[2rem] border border-white/80 bg-white/95 p-5 text-center shadow-2xl backdrop-blur-md sm:p-6">
              <div className="text-[10px] font-black tracking-[0.22em] text-indigo-500">
                CLASS RESULT
              </div>

              <h2 className="mt-1 text-2xl font-black text-slate-950">
                {
                  roleDisplayNames[
                    ROLE_NAMES[
                      classResult.completedYear -
                        1
                    ]
                  ]
                }{' '}
                終了
              </h2>

              <div className="mt-5 grid grid-cols-2 gap-3">
                <div className="rounded-2xl border border-indigo-200 bg-indigo-50 p-4">
                  <div className="text-xs font-black text-indigo-700">
                    あなた
                  </div>

                  <div className="mt-1 text-3xl font-black text-indigo-950">
                    {
                      classResult.myScore
                    }
                    <span className="ml-1 text-sm">
                      スコア
                    </span>
                  </div>
                </div>

                <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4">
                  <div className="text-xs font-black text-rose-700">
                    相手
                  </div>

                  <div className="mt-1 text-3xl font-black text-rose-950">
                    {
                      classResult.opponentScore
                    }
                    <span className="ml-1 text-sm">
                      スコア
                    </span>
                  </div>
                </div>
              </div>

              <div className="mt-4 text-lg font-black text-slate-900">
                {classResult.myScore >
                classResult.opponentScore
                  ? 'このクラスはあなたの勝利！'
                  : classResult.myScore <
                      classResult.opponentScore
                    ? 'このクラスは相手の勝利。'
                    : 'このクラスは引き分け。'}
              </div>

              <button
                type="button"
                onClick={() =>
                  void continueAfterClassResult()
                }
                className="mt-5 w-full rounded-2xl bg-indigo-600 px-4 py-3.5 text-sm font-black text-white shadow-lg shadow-indigo-200 transition hover:bg-indigo-700"
              >
                {classResult.completedYear <
                3
                  ? '次のクラスの準備へ'
                  : '最終結果を見る'}
              </button>
            </div>
          </section>
        )}

        {battlePhase ===
          'setup' &&
          !classResult && (
            <section className="mt-2 flex min-h-0 flex-1 flex-col gap-2 overflow-hidden">
              {!canShowCoinToss ? (
                <>
                  <div className="shrink-0 rounded-2xl border border-white/70 bg-white/90 p-3 shadow-lg backdrop-blur-md">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="text-[9px] font-black tracking-[0.18em] text-indigo-500">
                          MATCH PREP
                        </div>

                        <h2 className="mt-0.5 text-lg font-black text-slate-950">
                          対戦準備
                        </h2>
                      </div>

                      {preparationMessage && (
                        <div className="max-w-[58%] text-right text-[9px] font-bold leading-relaxed text-slate-500">
                          {
                            preparationMessage
                          }
                        </div>
                      )}
                    </div>

                    <div className="mt-3 grid grid-cols-3 gap-2">
                      {myAvatars.map(
                        (
                          avatar,
                          index,
                        ) => (
                          <div
                            key={
                              avatar
                                .card
                                .id
                            }
                            className={`rounded-2xl border p-2 text-center ${
                              index ===
                              activeIndex
                                ? 'border-indigo-300 bg-indigo-50'
                                : 'border-slate-200 bg-slate-50'
                            }`}
                          >
                            <div className="text-[8px] font-black text-slate-400">
                              {
                                roleDisplayNames[
                                  avatar
                                    .roleName
                                ]
                              }
                            </div>

                            <img
                              src={
                                avatar
                                  .card
                                  .imageDataUrl
                              }
                              alt=""
                              className="mx-auto mt-1 h-16 w-12 rounded-xl bg-white object-contain p-0.5 sm:h-20 sm:w-14"
                            />

                            <div className="mt-1 truncate text-[9px] font-black text-slate-800">
                              {
                                avatar
                                  .card
                                  .userName
                              }
                            </div>
                          </div>
                        ),
                      )}
                    </div>

                    <div className="mt-2 flex items-center justify-between rounded-2xl bg-slate-50 px-3 py-2">
                      <div className="text-[10px] font-black text-slate-600">
                        サポートカード
                      </div>

                      <div className="text-base font-black text-indigo-700">
                        {activeDeckId
                          ? loadDeckDefinition(
                              activeDeckId,
                            )?.supportCardIds
                              ?.length ||
                            0
                          : 0}
                        <span className="ml-1 text-[9px] text-slate-400">
                          / 18枚
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="grid shrink-0 grid-cols-2 gap-2">
                    <div className="rounded-2xl border border-indigo-200 bg-indigo-50/90 p-3">
                      <div className="text-[9px] font-black tracking-wide text-indigo-500">
                        あなた
                      </div>

                      <div className="mt-1 text-sm font-black text-indigo-950">
                        {deckConfirmed
                          ? '準備完了'
                          : myDeckReady
                            ? '確認待ち'
                            : 'チーム未選択'}
                      </div>
                    </div>

                    <div className="rounded-2xl border border-slate-200 bg-white/90 p-3">
                      <div className="text-[9px] font-black tracking-wide text-slate-400">
                        相手
                      </div>

                      <div className="mt-1 text-sm font-black text-slate-800">
                        {isOnline
                          ? readyHost &&
                            readyGuest
                            ? '準備完了'
                            : '待機中'
                          : 'CPU 準備完了'}
                      </div>
                    </div>
                  </div>

<div className="mt-auto grid shrink-0 grid-cols-2 gap-2">
  <button
    type="button"
    onClick={() => {
      if (activeDeckId) {
        setSelectedDeckPreviewId(
          activeDeckId,
        );
      }

      setIsDeckSelectOpen(true);
    }}
    disabled={!activeDeckId}
    className="rounded-2xl bg-white px-4 py-3 text-xs font-black text-slate-700 shadow-sm ring-1 ring-slate-200 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-35"
  >
    チーム詳細・分析
  </button>

  <button
    type="button"
    onClick={() => {
      if (
        activeDeckId &&
        onEditDeck
      ) {
        onEditDeck(
          activeDeckId,
        );

        return;
      }

      setIsDeckSelectOpen(
        true,
      );
    }}
    disabled={
      currentYear !==
        1 ||
      deckConfirmed ||
      (
        isOnline &&
        (
          playerRole ===
          'host'
            ? readyHost
            : readyGuest
        )
      )
    }
    className="rounded-2xl bg-white px-4 py-3 text-xs font-black text-slate-700 shadow-sm ring-1 ring-slate-200 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-35"
  >
    チームを変更
  </button>

  <button
    type="button"
    onClick={() =>
      void startBattleWithDeck()
    }
    disabled={
      !myDeckReady ||
      deckConfirmed ||
      currentYear !==
        1
    }
    className="col-span-2 rounded-2xl bg-indigo-600 px-4 py-3 text-xs font-black text-white shadow-lg shadow-indigo-200 transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-35"
  >
    このチームではじめる
  </button>
</div>
                </>
              ) : (
                <div className="flex min-h-0 flex-1 items-center justify-center">
                  <div className="w-full max-w-md rounded-[2rem] bg-slate-950/95 p-6 text-center text-white shadow-2xl">
                    <div className="text-[10px] font-black tracking-[0.25em] text-slate-400">
                      COIN TOSS
                    </div>

                    <h2 className="mt-2 text-2xl font-black">
                      先手・後手を決めます
                    </h2>

                    <div className="mx-auto mt-6 flex h-24 w-24 items-center justify-center rounded-full border-4 border-amber-300 bg-white text-5xl text-slate-900 shadow-xl">
                      🪙
                    </div>

                    {!firstPlayer ? (
                      isOnline ? (
                        isHost ? (
                          <button
                            type="button"
                            onClick={() =>
                              void decideFirstPlayer()
                            }
                            disabled={
                              isCoinTossing
                            }
                            className="mt-6 w-full rounded-2xl bg-amber-300 px-4 py-4 text-sm font-black text-slate-950 shadow-lg transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-45"
                          >
                            {isCoinTossing
                              ? 'コイントス中…'
                              : 'コイントスを行う'}
                          </button>
                        ) : (
                          <div className="mt-6 rounded-2xl bg-white/10 px-4 py-4 text-sm font-black text-slate-200">
                            ルーム作成者がコイントスを行います。
                          </div>
                        )
                      ) : (
                        <button
                          type="button"
                          onClick={() =>
                            void decideFirstPlayer()
                          }
                          disabled={
                            isCoinTossing
                          }
                          className="mt-6 w-full rounded-2xl bg-amber-300 px-4 py-4 text-sm font-black text-slate-950 shadow-lg transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-45"
                        >
                          {isCoinTossing
                            ? 'コイントス中…'
                            : 'コイントスを行う'}
                        </button>
                      )
                    ) : (
                      <div className="mt-6 rounded-2xl bg-white/10 px-4 py-4 text-xl font-black text-amber-300">
                        {firstPlayer ===
                        playerRole
                          ? 'あなたが先手！'
                          : '相手が先手！'}
                      </div>
                    )}

                    {firstPlayer && (
                      <div className="mt-4 text-sm font-bold text-slate-300">
                        {firstPlayer ===
                        playerRole
                          ? '開始シーズンを選んで対戦へ進みます。'
                          : '相手の準備を待っています。'}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </section>
          )}

        {battlePhase ===
          'waiting' && (
          <section className="mt-2 flex min-h-0 flex-1 items-center justify-center">
            <div className="w-full max-w-md rounded-[2rem] border border-white/70 bg-white/90 p-6 text-center shadow-2xl backdrop-blur-md">
              <div className="text-5xl">
                ⏳
              </div>

              <h2 className="mt-3 text-2xl font-black">
                {waitingMode ===
                'return'
                  ? '自動的にホーム画面に戻ります'
                  : '対戦相手を待っています'}
              </h2>

              <p className="mt-3 whitespace-pre-line text-sm font-bold leading-relaxed text-slate-500">
                {
                  waitingMessage
                }
              </p>
            </div>
          </section>
        )}

        {battlePhase ===
          'battle' && (
          <section className="mt-2 flex min-h-0 flex-1 flex-col gap-2 overflow-hidden">
            <div className="shrink-0 rounded-2xl border border-white/70 bg-white/65 px-3 py-2 shadow-md backdrop-blur-md">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="text-[9px] font-black text-indigo-600">
                    あなた
                  </div>

                  <div className="mt-1 flex items-center gap-1.5">
                    {[2, 1, 0].map(
                      (index) => {
                        const avatar =
                          myAvatars[
                            index
                          ] ||
                          DEFAULT_MY_AVATARS[
                            index
                          ];

                        const active =
                          index ===
                          activeIndex;

                        return (
                          <button
                            key={`my-mini-${avatar.card.id}`}
                            type="button"
                            onClick={() =>
                              setModalAvatar(
                                avatar,
                              )
                            }
                            className={`flex h-9 w-9 items-center justify-center overflow-hidden rounded-full border-2 bg-white transition ${
                              active
                                ? 'border-amber-400 ring-2 ring-amber-200'
                                : 'border-slate-200 opacity-70'
                            }`}
                            aria-label={`${roleDisplayNames[avatar.roleName]} ${avatar.card.userName}`}
                          >
                            <img
                              src={
                                avatar
                                  .card
                                  .imageDataUrl
                              }
                              alt=""
                              className="h-full w-full object-contain"
                            />
                          </button>
                        );
                      },
                    )}
                  </div>
                </div>

                <div className="text-right">
                  <div className="text-[9px] font-black text-rose-600">
                    相手
                  </div>

                  <div className="mt-1 flex items-center justify-end gap-1.5">
                    {[0, 1, 2].map(
                      (index) => {
                        const avatar =
                          oppAvatars[
                            index
                          ] ||
                          DEFAULT_OPP_AVATARS[
                            index
                          ];

                        const active =
                          index ===
                          activeIndex;

                        return (
                          <button
                            key={`opp-mini-${avatar.card.id}`}
                            type="button"
                            onClick={() =>
                              setModalAvatar(
                                avatar,
                              )
                            }
                            className={`flex h-9 w-9 items-center justify-center overflow-hidden rounded-full border-2 bg-white transition ${
                              active
                                ? 'border-amber-400 ring-2 ring-amber-200'
                                : 'border-slate-200 opacity-70'
                            }`}
                            aria-label={`${roleDisplayNames[avatar.roleName]} ${avatar.card.userName}`}
                          >
                            <img
                              src={
                                avatar
                                  .card
                                  .imageDataUrl
                              }
                              alt=""
                              className="h-full w-full object-contain"
                            />
                          </button>
                        );
                      },
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="grid shrink-0 grid-cols-2 gap-2">
              <div className="rounded-2xl border border-indigo-300 bg-white/90 p-2.5 shadow-lg ring-1 ring-indigo-100">
                <div className="text-center text-[9px] font-black text-indigo-600">
                  あなた　{
                    currentRoleDisplayName
                  }
                </div>

                <div className="mt-1 flex items-end justify-center gap-2">
                  <div className="flex min-w-0 flex-1 -translate-y-4 flex-col items-center justify-end">
                    <div className="max-w-full -translate-y-3 truncate text-center text-xs font-black text-slate-950">
                      {
                        myActiveAvatar
                          .card
                          .userName
                      }
                    </div>

                    <div className="mt-0.5 text-center -translate-y-3 text-[10px] font-black text-indigo-700">
                      {
                        currentMyClassScore
                      }{' '}
                      スコア
                    </div>

                    <button
                      type="button"
                      onClick={() =>
                        setModalAvatar(
                          myActiveAvatar,
                        )
                      }
                      className="mt-1 block w-[92px] shrink-0"
                    >
                      <div ref={myActiveCardAnchorRef}>
                        <BattleCardReveal
                          revealed={
                            activeCardsRevealed
                          }
                          width={92}
                          height={112}
                          className="mx-auto"
                          colorHex={getBattleVisualColorHex(
                            myActiveAvatar.card,
                          )}
                        >
                          <img
                            src={
                              myActiveAvatar
                                .card
                                .imageDataUrl
                            }
                            alt=""
                            className="h-full w-full rounded-2xl bg-white object-contain p-1"
                          />
                        </BattleCardReveal>
                      </div>
                    </button>
                  </div>

                  <div className="translate-y-8">
                    <VerticalScoreGauge
                      label=""
                      score={
                        currentMyClassScore
                      }
                      side="self"
                      active={myTurn}
                      compact
                      baseHeightPx={
                        142
                      }
                    />
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() =>
                    setModalAvatar(
                      myActiveAvatar,
                    )
                  }
                  className="mx-auto mt-1 block rounded-xl p-0.5 transition hover:bg-indigo-50"
                  aria-label="自分のステータス詳細を開く"
                >
                  <RadarChart
                    baseStats={
                      myActiveAvatar.baseStats ||
                      myActiveAvatar.card
                        .stats
                    }
                    currentStats={getEffectiveStats(
                      myActiveAvatar,
                    )}
                    size={104}
                    showLabels={
                      false
                    }
                    showLegend={
                      false
                    }
                  />
                </button>
              </div>

              <div className="rounded-2xl border border-rose-300 bg-white/90 p-2.5 shadow-lg ring-1 ring-rose-100">
                <div className="text-center text-[9px] font-black text-rose-600">
                  相手　{
                    currentRoleDisplayName
                  }
                </div>

                <div className="mt-1 flex items-end justify-center gap-2">
                  <div className="flex min-w-0 flex-1 -translate-y-4 flex-col items-center justify-end">
                    <div className="max-w-full -translate-y-3 truncate text-center text-xs font-black text-slate-950">
                      {
                        oppActiveAvatar
                          .card
                          .userName
                      }
                    </div>

                    <div className="mt-0.5 text-center -translate-y-3 text-[10px] font-black text-rose-700">
                      {
                        currentOppClassScore
                      }{' '}
                      スコア
                    </div>

                    <button
                      type="button"
                      onClick={() =>
                        setModalAvatar(
                          oppActiveAvatar,
                        )
                      }
                      className="mt-1 block w-[92px] shrink-0"
                    >
                      <div ref={opponentActiveCardAnchorRef}>
                        <BattleCardReveal
                          revealed={
                            activeCardsRevealed
                          }
                          width={92}
                          height={112}
                          className="mx-auto"
                          colorHex={getBattleVisualColorHex(
                            oppActiveAvatar.card,
                          )}
                        >
                          <img
                            src={
                              oppActiveAvatar
                                .card
                                .imageDataUrl
                            }
                            alt=""
                            className="h-full w-full rounded-2xl bg-white object-contain p-1"
                          />
                        </BattleCardReveal>
                      </div>
                    </button>
                  </div>

                  <div className="translate-y-8">
                    <VerticalScoreGauge
                      label=""
                      score={
                        currentOppClassScore
                      }
                      side="opponent"
                      active={
                        !myTurn
                      }
                      compact
                      baseHeightPx={
                        142
                      }
                    />
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() =>
                    setModalAvatar(
                      oppActiveAvatar,
                    )
                  }
                  className="mx-auto mt-1 block rounded-xl p-0.5 transition hover:bg-rose-50"
                  aria-label="相手のステータス詳細を開く"
                >
                  <RadarChart
                    baseStats={
                      oppActiveAvatar.baseStats ||
                      oppActiveAvatar.card
                        .stats
                    }
                    currentStats={getEffectiveStats(
                      oppActiveAvatar,
                    )}
                    size={104}
                    showLabels={
                      false
                    }
                    showLegend={
                      false
                    }
                  />
                </button>
              </div>
            </div>

            <div className="relative min-h-0 flex-1">
              <div className="flex h-full min-h-0 flex-col gap-2">
                <section className="shrink-0 rounded-2xl border border-white/70 bg-white/85 p-2.5 shadow-lg backdrop-blur-md">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-xs font-black text-slate-950">
                      サポート手札
                    </div>

                    <div className="text-right text-[9px] font-black text-slate-500">
                      手札{' '}
                      {myHand.length}
                      /
                      {MAX_HAND}{' '}
                      山札{' '}
                      {myDeck.length}
                      {isOnline && (
                        <>
                          　／　相手{' '}
                          {
                            opponentHandCount
                          }
                          /
                          {
                            MAX_HAND
                          }
                          ・
                          {
                            opponentDeckCount
                          }
                        </>
                      )}
                    </div>
                  </div>

                  <div className="mt-0.5 flex items-center justify-between gap-2">
                    <div className="text-[8px] font-bold text-slate-400">
                      タップして内容を確認 → 使用
                    </div>

                    {supportUsageLimited && (
                      <div
                        className={`shrink-0 rounded-lg px-2 py-1 text-[9px] font-black ${
                          supportUsageLimitReached
                            ? 'border border-rose-200 bg-rose-50 text-rose-700'
                            : 'border border-amber-200 bg-amber-50 text-amber-800'
                        }`}
                      >
                        🔒
                        {
                          supportUseLimit
                        }
                        枚まで制限中
                      </div>
                    )}
                  </div>

                  <div className="mt-1.5 flex min-h-[94px] items-end justify-center overflow-x-auto px-1 pb-1 pt-2 touch-pan-x">
                    {myHand.length ===
                    0 ? (
                      <div className="py-5 text-xs font-bold text-slate-400">
                        手札がありません。
                      </div>
                    ) : (
                      myHand.map(
                        (
                          card,
                          index,
                        ) => {
                          const isSelected =
                            selectedSupportCardIndex ===
                            index;

                          const isSubmitting =
                            supportSubmittingCardIndex ===
                            index;

                          const isRevealing =
                            revealingSupportCardIndexes.includes(
                              index,
                            );

                          return (
                            <button
                              key={`${card.id}_${index}`}
                              type="button"
                              disabled={
                                supportSubmittingCardIndex !==
                                null
                              }
                              onClick={() =>
                                setSelectedSupportCardIndex(
                                  index,
                                )
                              }
                              className={`relative h-[88px] w-[60px] shrink-0 overflow-hidden rounded-xl border bg-white p-1 text-left shadow-md transition sm:h-[96px] sm:w-[66px] ${
                                index >
                                0
                                  ? '-ml-6'
                                  : ''
                              } ${
                                isSelected
                                  ? '-translate-y-2 z-20 border-indigo-500 ring-2 ring-indigo-200'
                                  : 'z-10 border-slate-200'
                              } ${
                                supportSubmittingCardIndex !==
                                null
                                  ? 'cursor-wait opacity-60'
                                  : 'cursor-pointer hover:border-indigo-400'
                              }`}
                            >
                              {isSubmitting && (
                                <div className="absolute inset-0 z-30 flex items-center justify-center rounded-xl bg-slate-950/55 text-[9px] font-black text-white">
                                  発動中…
                                </div>
                              )}

                              <BattleCardReveal
                                revealed={
                                  !isRevealing
                                }
                                width={
                                  52
                                }
                                height={
                                  72
                                }
                                className="mx-auto"
                                colorHex={
                                  getSupportColorHex(
                                    card,
                                  ) ||
                                  getBattleVisualColorHex(
                                    myActiveAvatar.card,
                                  )
                                }
                              >
                                {getSupportImage(
                                  card,
                                ) ? (
                                  <img
                                    src={getSupportImage(
                                      card,
                                    )}
                                    alt=""
                                    className="h-full w-full rounded-lg bg-white object-contain"
                                  />
                                ) : (
                                  <div className="flex h-full items-center justify-center text-xl">
                                    🃏
                                  </div>
                                )}
                              </BattleCardReveal>

                              <div className="mt-0.5 truncate text-center text-[8px] font-black text-slate-700">
                                {
                                  card.name
                                }
                              </div>
                            </button>
                          );
                        },
                      )
                    )}
                  </div>
                </section>

                <section className="min-h-0 flex-1 rounded-2xl border border-white/70 bg-white/80 p-2.5 shadow-lg backdrop-blur-md">
                  <div className="mb-1.5 flex items-center justify-between gap-2">
                    <div className="text-xs font-black text-slate-950">
                      ⚔️{' '}
                      {
                        myActiveAvatar
                          .card
                          .userName
                      }{' '}
                      のスキル
                    </div>

                    <div className="rounded-full bg-slate-100 px-2 py-1 text-[8px] font-black text-slate-500">
                      使用すると即ターン終了
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-1.5">
                    {myActiveAvatar.skills.map(
                      (
                        skill,
                        index,
                      ) => {
                        const used =
                          skill.maxUsesPerClass >
                            0 &&
                          usedThisClass.filter(
                            (
                              skillId,
                            ) =>
                              skillId ===
                              skill.id,
                          ).length >=
                            skill.maxUsesPerClass;

                        const sealed =
                          hasSkillSeal(
                            myActiveAvatar,
                            index,
                            currentSkillTurnOrdinal,
                          );

                        return (
                          <button
                            key={`${myActiveAvatar.card.id}_${skill.id}`}
                            type="button"
                            onClick={() =>
                              setSelectedSkillDetail(
                                skill,
                              )
                            }
                            className={`min-h-[54px] rounded-xl border p-2 text-left transition ${
                              used ||
                              sealed
                                ? 'border-slate-200 bg-slate-100 opacity-55'
                                : myTurn
                                  ? 'border-indigo-200 bg-indigo-50 hover:bg-indigo-100'
                                  : 'border-slate-200 bg-white'
                            }`}
                          >
                            <div className="text-[10px] font-black text-indigo-950">
                              {
                                [
                                  '①',
                                  '②',
                                  '③',
                                  '④',
                                ][
                                  index
                                ]
                              }{' '}
                              {
                                skill.name
                              }
                            </div>

                            <div className="mt-0.5 truncate text-[8px] font-bold text-slate-500">
                              {used
                                ? 'このクラスは使用済み'
                                : sealed
                                  ? '封印中'
                                  : myTurn
                                    ? 'タップして詳細'
                                    : '相手のターン'}
                            </div>
                          </button>
                        );
                      },
                    )}
                  </div>
                </section>
              </div>

              {!myTurn && (
                <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center rounded-2xl bg-white/15 backdrop-blur-[0.5px]">
                  <div className="rounded-2xl border border-slate-300/80 bg-white/90 px-5 py-3 text-sm font-black text-slate-800 shadow-lg">
                    相手のターンです
                  </div>
                </div>
              )}
            </div>
          </section>
        )}

        {battlePhase ===
          'finished' &&
          !classResult && (
            <section className="mt-2 flex min-h-0 flex-1 items-center justify-center">
              <div className="w-full max-w-lg rounded-[2rem] border border-white/80 bg-white/95 p-6 text-center shadow-2xl backdrop-blur-md">
                <div className="text-xs font-black tracking-[0.25em] text-indigo-500">
                  BATTLE FINISH
                </div>

                <h2 className="mt-2 text-4xl font-black text-slate-950">
                  {myTotalScore >
                  opponentTotalScore
                    ? 'YOU WIN!'
                    : myTotalScore <
                        opponentTotalScore
                      ? 'YOU LOSE'
                      : 'DRAW'}
                </h2>

                <div className="mt-5 grid grid-cols-2 gap-3">
                  <div className="rounded-2xl border border-indigo-200 bg-indigo-50 p-4">
                    <div className="text-xs font-black text-indigo-700">
                      あなた
                    </div>

                    <div className="mt-1 text-3xl font-black text-indigo-950">
                      {
                        myTotalScore
                      }
                      <span className="ml-1 text-sm">
                        総合スコア
                      </span>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4">
                    <div className="text-xs font-black text-rose-700">
                      相手
                    </div>

                    <div className="mt-1 text-3xl font-black text-rose-950">
                      {
                        opponentTotalScore
                      }
                      <span className="ml-1 text-sm">
                        総合スコア
                      </span>
                    </div>
                  </div>
                </div>

                <div className="mt-5 grid grid-cols-3 gap-2 text-[10px] font-black">
                  {ROLE_NAMES.map(
                    (
                      role,
                      index,
                    ) => (
                      <div
                        key={role}
                        className="rounded-2xl border border-slate-200 bg-slate-50 p-3"
                      >
                        <div className="text-[9px] text-slate-400">
                          {
                            roleDisplayNames[
                              role
                            ]
                          }
                        </div>

                        <div className="mt-1 text-sm text-slate-900">
                          {
                            myClassScores[
                              index
                            ]
                          }{' '}
                          -{' '}
                          {
                            oppClassScores[
                              index
                            ]
                          }
                        </div>
                      </div>
                    ),
                  )}
                </div>

                <div className="mt-5 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      void chooseRematch(
                        'rematch',
                      )
                    }
                    disabled={
                      !!rematchChoice
                    }
                    className="rounded-2xl bg-indigo-600 px-4 py-3.5 text-sm font-black text-white shadow-lg shadow-indigo-200 transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    もう一度遊ぶ
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      void chooseRematch(
                        'exit',
                      )
                    }
                    disabled={
                      !!rematchChoice
                    }
                    className="rounded-2xl bg-slate-100 px-4 py-3.5 text-sm font-black text-slate-800 transition hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    ホームへ戻る
                  </button>
                </div>

                {rematchChoice ===
                  'rematch' && (
                  <div className="mt-3 text-xs font-bold text-slate-400">
                    相手の選択を待っています…
                  </div>
                )}
              </div>
            </section>
          )}

        {isDeckSelectOpen &&
          battlePhase ===
            'setup' && (
            <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/60 px-4 py-6 backdrop-blur-sm">
              <div className="flex max-h-[88dvh] w-full max-w-2xl flex-col rounded-3xl bg-white p-5 shadow-2xl">
                <div className="flex shrink-0 items-center justify-between gap-3">
                  <div>
                    <div className="text-[9px] font-black tracking-[0.18em] text-indigo-500">
                      TEAM
                    </div>

                    <h3 className="mt-0.5 text-lg font-black text-slate-950">
                      チームを選ぶ
                    </h3>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setSelectedDeckPreviewId(
                        null,
                      );

                      setIsDeckSelectOpen(
                        false,
                      );
                    }}
                    className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-black text-slate-600"
                  >
                    閉じる
                  </button>
                </div>

                <div className="mt-4 min-h-0 space-y-2 overflow-y-auto pr-1">
                  {(() => {
                    try {
                      const decks: Deck[] =
                        JSON.parse(
                          localStorage.getItem(
                            'reality_decks',
                          ) ||
                            '[]',
                        );

                      if (
                        !decks.length
                      ) {
                        return (
                          <div className="py-8 text-center text-sm font-bold text-slate-400">
                            保存されたチームがありません。
                          </div>
                        );
                      }

                      return decks.map(
                        (deck) => {
                          const preview =
                            selectedDeckPreviewId ===
                            deck.id
                              ? getDeckPreviewData(
                                  deck,
                                )
                              : null;

                          return (
                            <div
                              key={
                                deck.id
                              }
                              className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50"
                            >
                              <div className="p-3">
                                <div className="flex items-center justify-between gap-3">
                                  <div className="min-w-0">
                                    <div className="truncate font-black text-slate-950">
                                      {
                                        deck.name
                                      }
                                    </div>

                                    <div className="mt-1 text-[9px] font-bold text-slate-400">
                                      キャラ3人・サポート{' '}
                                      {
                                        deck
                                          .supportCardIds
                                          ?.length ||
                                        0
                                      }
                                      枚
                                    </div>
                                  </div>

                                  <div className="flex shrink-0 gap-1.5">
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setSelectedDeckPreviewId(
                                          (
                                            prev,
                                          ) =>
                                            prev ===
                                            deck.id
                                              ? null
                                              : deck.id,
                                        )
                                      }
                                      className="rounded-xl border border-slate-200 bg-white px-2.5 py-2 text-[9px] font-black text-slate-700 shadow-sm hover:bg-slate-50"
                                    >
                                      {selectedDeckPreviewId ===
                                      deck.id
                                        ? '詳細を閉じる'
                                        : '詳細・分析'}
                                    </button>

                                    <button
                                      type="button"
                                      onClick={() =>
                                        void handleSelectDeck(
                                          deck.id,
                                        )
                                      }
                                      className="rounded-xl bg-indigo-600 px-3 py-2 text-[9px] font-black text-white shadow-sm hover:bg-indigo-700"
                                    >
                                      このチームを選ぶ
                                    </button>
                                  </div>
                                </div>
                              </div>

                              {preview && (
                                <div className="border-t border-slate-200 bg-white p-3">
                                  <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                                    <div>
                                      <div className="text-[9px] font-black tracking-[0.12em] text-indigo-500">
                                        CHARACTERS
                                      </div>

                                      <div className="mt-2 space-y-1.5">
                                        {preview.characters.map(
                                          (
                                            character,
                                          ) => (
                                            <div
                                              key={
                                                character.role
                                              }
                                              className="flex items-center gap-2 rounded-xl border border-slate-100 bg-slate-50 px-2 py-1.5"
                                            >
                                              <div className="w-14 shrink-0 text-[8px] font-black text-slate-400">
                                                {
                                                  roleDisplayNames[
                                                    character.role
                                                  ]
                                                }
                                              </div>

                                              <div className="h-10 w-8 shrink-0 overflow-hidden rounded-lg bg-white ring-1 ring-slate-200">
                                                {character.imageDataUrl ? (
                                                  <img
                                                    src={
                                                      character.imageDataUrl
                                                    }
                                                    alt=""
                                                    className="h-full w-full object-contain"
                                                  />
                                                ) : null}
                                              </div>

                                              <div className="min-w-0 flex-1 truncate text-[10px] font-black text-slate-800">
                                                {
                                                  character.name
                                                }
                                              </div>

                                              <div className="shrink-0 text-right text-[8px] font-bold text-slate-500">
                                                熱
                                                {
                                                  character
                                                    .stats
                                                    .hp
                                                }
                                                ・知
                                                {
                                                  character
                                                    .stats
                                                    .intellect
                                                }
                                                ・技
                                                {
                                                  character
                                                    .stats
                                                    .dexterity
                                                }
                                                ・愛
                                                {
                                                  character
                                                    .stats
                                                    .charm
                                                }
                                              </div>
                                            </div>
                                          ),
                                        )}
                                      </div>

                                      <div className="mt-2 rounded-xl border border-indigo-100 bg-indigo-50/70 p-2">
                                        <div className="text-[8px] font-black text-indigo-700">
                                          キャラ基礎値合計
                                        </div>

                                        <div className="mt-1 grid grid-cols-4 gap-1 text-center text-[9px] font-black text-indigo-950">
                                          <div>
                                            熱{' '}
                                            {
                                              preview
                                                .totalStats
                                                .hp
                                            }
                                          </div>

                                          <div>
                                            知{' '}
                                            {
                                              preview
                                                .totalStats
                                                .intellect
                                            }
                                          </div>

                                          <div>
                                            技{' '}
                                            {
                                              preview
                                                .totalStats
                                                .dexterity
                                            }
                                          </div>

                                          <div>
                                            愛{' '}
                                            {
                                              preview
                                                .totalStats
                                                .charm
                                            }
                                          </div>
                                        </div>
                                      </div>
                                    </div>

                                    <div>
                                      <div className="text-[9px] font-black tracking-[0.12em] text-purple-500">
                                        SUPPORT CARDS
                                      </div>

<div className="mt-2 flex flex-wrap gap-1.5">
  {preview.supports.length ? (
    preview.supports.map((support) => (
      <button
        key={support.name}
        type="button"
        onClick={() => {
          try {
            const entriesRaw =
              localStorage.getItem(
                'reality_world_entries',
              );

            const entriesRawParsed: unknown =
              entriesRaw
                ? JSON.parse(entriesRaw)
                : [];

            const entries =
              Array.isArray(entriesRawParsed)
                ? entriesRawParsed
                : [];

            const supportCard =
              getSupportPool(entries).find(
                (card) =>
                  card.name ===
                  support.name,
              );

            if (supportCard) {
              setSelectedSetupSupportCard(
                supportCard,
              );
            }
          } catch {
            // 詳細表示できない場合は何もしない
          }
        }}
        className="rounded-lg border border-purple-100 bg-purple-50 px-2 py-1 text-left text-[8px] font-black text-purple-900 transition hover:bg-purple-100"
      >
        {support.name}
        {support.count > 1
          ? ` ×${support.count}`
          : ''}
      </button>
    ))
  ) : (
    <span className="text-[9px] font-bold text-slate-400">
      サポートなし
    </span>
  )}
</div>

                                      <div className="mt-2 rounded-xl border border-purple-100 bg-purple-50/60 p-2">
                                        <div className="text-[8px] font-black text-purple-700">
                                          デッキ分析
                                        </div>

                                        <div className="mt-1 space-y-0.5 text-[8px] font-bold text-purple-950">
                                          {Object.entries(
                                            preview.supportCategories,
                                          ).map(
                                            ([
                                              category,
                                              count,
                                            ]) => (
                                              <div
                                                key={
                                                  category
                                                }
                                                className="flex items-center justify-between gap-2"
                                              >
                                                <span>
                                                  {
                                                    category
                                                  }
                                                </span>

                                                <span>
                                                  {
                                                    count
                                                  }
                                                  枚
                                                </span>
                                              </div>
                                            ),
                                          )}

                                          {!Object.keys(
                                            preview.supportCategories,
                                          ).length && (
                                            <div>
                                              サポートカードなし
                                            </div>
                                          )}
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        },
                      );
                    } catch {
                      return (
                        <div className="text-sm font-bold text-red-600">
                          チームを読み込めませんでした。
                        </div>
                      );
                    }
                  })()}
                </div>
              </div>
            </div>
          )}

{supportDetailCard && (
          <div className="fixed inset-0 z-[75] flex items-end justify-center bg-slate-950/60 px-3 py-3 backdrop-blur-sm sm:items-center sm:px-4">
            <div className="max-h-[78dvh] w-full max-w-md overflow-y-auto rounded-[2rem] bg-white p-4 shadow-2xl sm:p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-[9px] font-black tracking-[0.18em] text-purple-500">
                    SUPPORT CARD
                  </div>

                  <h3 className="mt-0.5 text-xl font-black text-slate-950">
                    {
                      supportDetailCard.name
                    }
                  </h3>
                </div>

                <button
                  type="button"
onClick={() => {
  setSelectedSupportCardIndex(
    null,
  );
  setSelectedSetupSupportCard(
    null,
  );
}}
                  className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-black text-slate-600"
                >
                  閉じる
                </button>
              </div>

              <div className="mt-4 grid grid-cols-[92px_minmax(0,1fr)] gap-4">
                <BattleCardReveal
                  revealed={
                    !revealingSupportCardIndexes.includes(
                      selectedSupportCardIndex ??
                        -1,
                    )
                  }
                  width={
                    88
                  }
                  height={
                    120
                  }
                  className="mx-auto"
                  colorHex={
                    getSupportColorHex(
                      supportDetailCard,
                    ) ||
                    getBattleVisualColorHex(
                      myActiveAvatar.card,
                    )
                  }
                >
                  {getSupportImage(
                    supportDetailCard,
                  ) ? (
                    <img
                      src={getSupportImage(
                        supportDetailCard,
                      )}
                      alt=""
                      className="h-full w-full rounded-2xl bg-white object-contain p-1"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-3xl">
                      🃏
                    </div>
                  )}
                </BattleCardReveal>

                <div className="min-w-0">
                  <div className="text-[9px] font-black text-slate-400">
                    カード情報
                  </div>

                  {selectedSupportBadges && (
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {[
                        selectedSupportBadges.target,
                        selectedSupportBadges.duration,
                        selectedSupportBadges.effect,
                      ].map(
                        (
                          badge,
                          badgeIndex,
                        ) => (
                          <span
                            key={`${badge.label}_${badgeIndex}`}
                            className="rounded-lg border border-purple-200 bg-purple-50 px-2 py-1 text-[9px] font-black text-purple-900"
                          >
                            {
                              badge.label
                            }
                          </span>
                        ),
                      )}
                    </div>
                  )}

                  {selectedSupportPreset && (
                    <div className="mt-2 text-sm font-bold leading-relaxed text-slate-800">
                      {getSupportDetailDescription(
                        selectedSupportPreset,
                      )}
                    </div>
                  )}
                </div>
              </div>

              {getSupportFlavorText(
                supportDetailCard,
              ) && (
                <div className="mt-4 rounded-2xl border border-purple-100 bg-purple-50/70 p-3">
                  <div className="text-[9px] font-black text-purple-700">
                    フレーバーテキスト
                  </div>

                  <div className="mt-1 whitespace-pre-wrap text-xs font-bold leading-relaxed text-slate-700">
                    {getSupportFlavorText(
                      supportDetailCard,
                    )}
                  </div>
                </div>
              )}

{selectedSupportCard && (
  <button
    type="button"
    disabled={
      !myTurn ||
      supportSubmittingCardIndex !==
        null ||
      selectedSupportLimitReached
    }
    onClick={() => {
      if (
        selectedSupportCardIndex ===
          null ||
        !selectedSupportCard
      ) {
        return;
      }

      const index =
        selectedSupportCardIndex;

      setSelectedSupportCardIndex(
        null,
      );

      void handleUseSupportCard(
        selectedSupportCard,
        index,
      );
    }}
    className="mt-5 w-full rounded-2xl bg-indigo-600 px-4 py-3.5 text-sm font-black text-white shadow-lg shadow-indigo-200 transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-40"
  >
    {!myTurn
      ? '自分のターンではありません'
      : selectedSupportLimitReached
        ? 'このターンの枚数制限に達しました'
        : 'このサポートカードを使用する'}
  </button>
)}
            </div>
          </div>
        )}

        {skillStatSelection && (
          <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
            <div className="w-full max-w-sm rounded-3xl bg-white p-5 shadow-2xl">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-xs font-black text-slate-400">
                    A-1コーデ
                  </div>

                  <h3 className="mt-1 text-xl font-black text-slate-950">
                    ステータスを選択
                  </h3>
                </div>

                <button
                  type="button"
                  onClick={() =>
                    setSkillStatSelection(
                      null,
                    )
                  }
                  className="rounded-xl bg-slate-100 px-3 py-2 text-sm font-black text-slate-500"
                  aria-label="ステータス選択を閉じる"
                >
                  ✕
                </button>
              </div>

              <div className="mt-3 rounded-2xl bg-slate-50 p-3 text-xs font-bold leading-relaxed text-slate-600">
                {skillStatSelection.mode ===
                'response'
                  ? '選んだステータスの「自分 − 相手」×40でスコアを計算します。'
                  : '選んだステータスを2倍にしてから、技の処理を確定します。'}
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2">
                {STAT_KEYS.map(
                  (stat) => {
                    const mine =
                      getEffectiveStats(
                        myActiveAvatar,
                      )[stat];

                    const opponent =
                      getEffectiveStats(
                        oppActiveAvatar,
                      )[stat];

                    const score =
                      Math.max(
                        0,
                        mine -
                          opponent,
                      ) *
                      40;

                    const burstValue =
                      mine * 2;

                    return (
                      <button
                        key={stat}
                        type="button"
                        onClick={() => {
                          const skill =
                            myActiveAvatar.skills.find(
                              (
                                item,
                              ) =>
                                item.id ===
                                skillStatSelection.skillId,
                            );

                          if (
                            !skill
                          ) {
                            setSkillStatSelection(
                              null,
                            );

                            return;
                          }

                          setSkillStatSelection(
                            null,
                          );

                          void handleUseSkill(
                            skill,
                            stat,
                          );
                        }}
                        className="rounded-2xl border border-indigo-200 bg-indigo-50 p-3 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-indigo-400 hover:bg-indigo-100"
                      >
                        <div className="text-sm font-black text-indigo-950">
                          {
                            STAT_LABELS[
                              stat
                            ]
                          }
                        </div>

                        <div className="mt-1 text-xs font-bold text-slate-600">
                          自分{' '}
                          {
                            mine
                          }{' '}
                          ／ 相手{' '}
                          {
                            opponent
                          }
                        </div>

                        <div className="mt-2 text-sm font-black text-indigo-700">
                          {skillStatSelection.mode ===
                          'response'
                            ? `+${score}スコア`
                            : `${mine} → ${burstValue}`}
                        </div>
                      </button>
                    );
                  },
                )}
              </div>
            </div>
          </div>
        )}

        {selectedSkillDetail && (
          <div className="fixed inset-0 z-[75] flex items-end justify-center bg-slate-950/60 px-3 py-3 backdrop-blur-sm sm:items-center sm:px-4">
            <div className="w-full max-w-md rounded-[2rem] bg-white p-5 shadow-2xl">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-[9px] font-black tracking-[0.18em] text-indigo-500">
                    SKILL
                  </div>

                  <h3 className="mt-0.5 text-xl font-black text-slate-950">
                    {
                      selectedSkillDetail.name
                    }
                  </h3>
                </div>

                <button
                  type="button"
                  onClick={() =>
                    setSelectedSkillDetail(
                      null,
                    )
                  }
                  className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-black text-slate-600"
                >
                  閉じる
                </button>
              </div>

              <div className="mt-4 rounded-2xl border border-indigo-100 bg-indigo-50/70 p-4">
                <div className="text-sm font-bold leading-relaxed text-slate-800">
                  {
                    selectedSkillDetail.description
                  }
                </div>

                <div className="mt-3 rounded-xl bg-white p-3 text-xs font-black leading-relaxed text-slate-700 ring-1 ring-indigo-100">
                  ⚠️ このスキルを使用すると、即ターン終了です。
                </div>
              </div>

              <div className="mt-3 flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 text-[10px] font-black text-slate-500">
                <span>
                  {selectedSkillDetail.maxUsesPerClass
                    ? `${usedThisClass.filter((skillId) => skillId === selectedSkillDetail.id).length}/${selectedSkillDetail.maxUsesPerClass}回使用`
                    : '回数制限なし'}
                </span>

                {hasSkillSeal(
                  myActiveAvatar,
                  myActiveAvatar.skills.findIndex(
                    (
                      item,
                    ) =>
                      item.id ===
                      selectedSkillDetail.id,
                  ),
                  currentSkillTurnOrdinal,
                ) && (
                  <span className="text-rose-600">
                    封印中
                  </span>
                )}
              </div>

              <button
                type="button"
                disabled={
                  !isSkillUsable(
                    selectedSkillDetail,
                  )
                }
                onClick={() => {
                  const skill =
                    selectedSkillDetail;

                  setSelectedSkillDetail(
                    null,
                  );

                  void handleUseSkill(
                    skill,
                  );
                }}
                className="mt-5 w-full rounded-2xl bg-indigo-600 px-4 py-3.5 text-sm font-black text-white shadow-lg shadow-indigo-200 transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {myTurn
                  ? 'このスキルを使用する'
                  : '相手のターンです'}
              </button>
            </div>
          </div>
        )}

        {modalAvatar && (
          <div className="fixed inset-0 z-[75] flex items-end justify-center bg-slate-950/60 px-3 py-3 backdrop-blur-sm sm:items-center sm:px-4">
            <div className="max-h-[86dvh] w-full max-w-lg overflow-y-auto rounded-[2rem] bg-white p-5 shadow-2xl sm:p-6">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-[9px] font-black tracking-[0.18em] text-slate-400">
                    CHARACTER STATUS
                  </div>

                  <div className="mt-0.5 text-xs font-black text-slate-500">
                    {
                      roleDisplayNames[
                        modalAvatar.roleName
                      ]
                    }
                  </div>

                  <h3 className="mt-0.5 text-2xl font-black text-slate-950">
                    {
                      modalAvatar.card
                        .userName
                    }
                  </h3>
                </div>

                <button
                  type="button"
                  onClick={() =>
                    setModalAvatar(
                      null,
                    )
                  }
                  className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-black text-slate-600"
                >
                  閉じる
                </button>
              </div>

              <div className="mt-4 grid grid-cols-[104px_minmax(0,1fr)] gap-4">
                <img
                  src={
                    modalAvatar
                      .card
                      .imageDataUrl
                  }
                  alt=""
                  className="h-36 w-[104px] rounded-2xl bg-white object-contain p-1 shadow-sm ring-1 ring-slate-200"
                />

                <div className="min-w-0">
                  <div className="text-[9px] font-black text-slate-400">
                    能力値
                  </div>

                  <div className="mt-1 grid grid-cols-2 gap-1.5 text-[10px] font-black">
                    {STAT_KEYS.map(
                      (stat) => {
                        const base =
                          Number(
                            (
                              modalAvatar.baseStats ||
                              modalAvatar.card
                                .stats
                            )[stat] ||
                              0,
                          );

                        const current =
                          Number(
                            getEffectiveStats(
                              modalAvatar,
                            )[stat] ||
                              0,
                          );

                        const diff =
                          current -
                          base;

                        return (
                          <div
                            key={stat}
                            className="rounded-xl bg-slate-50 p-2"
                          >
                            <div className="text-[8px] text-slate-400">
                              {
                                STAT_LABELS[
                                  stat
                                ]
                              }
                            </div>

                            <div className="mt-0.5 text-sm text-slate-900">
                              {
                                current
                              }

                              {diff !==
                                0 && (
                                <span
                                  className={
                                    diff >
                                    0
                                      ? 'ml-1 text-red-500'
                                      : 'ml-1 text-blue-500'
                                  }
                                >
                                  {diff >
                                  0
                                    ? `+${diff}`
                                    : diff}
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      },
                    )}
                  </div>
                </div>
              </div>

              <div className="mt-5 flex justify-center">
                <RadarChart
                  baseStats={
                    modalAvatar.baseStats ||
                    modalAvatar.card
                      .stats
                  }
                  currentStats={getEffectiveStats(
                    modalAvatar,
                  )}
                  size={220}
                />
              </div>

              <div className="mt-2 rounded-2xl bg-slate-50 p-3 text-xs font-bold leading-relaxed text-slate-600">
                <div>
                  カラータイプ：
                  {
                    getBattleColorTypeLabel(
                      modalAvatar.card,
                    )
                  }
                </div>

                <div className="mt-1">
                  好きな季節：
                  {
                    modalAvatar.card
                      .favoredSeason
                  }
                </div>

                <div className="mt-1">
                  フレーバー：
                  {
                    getBattleFlavorText(
                      modalAvatar.card,
                    ) ||
                    '未設定'
                  }
                </div>

                <div className="mt-1">
                  ステータスの差分は、サポートやスキルによる現在値の変化を示します。
                </div>
              </div>
            </div>
          </div>
        )}

        {showBattleLog && (
          <div className="fixed inset-0 z-[76] flex items-end justify-center bg-slate-950/60 px-3 py-3 backdrop-blur-sm sm:items-center sm:px-4">
            <div className="flex max-h-[82dvh] w-full max-w-lg flex-col rounded-[2rem] bg-slate-950 p-4 text-white shadow-2xl sm:p-5">
              <div className="flex shrink-0 items-center justify-between gap-3">
                <div>
                  <div className="text-[9px] font-black tracking-[0.2em] text-slate-500">
                    LIVE LOG
                  </div>

                  <h3 className="mt-0.5 text-xl font-black">
                    試合実況
                  </h3>
                </div>

                <button
                  type="button"
                  onClick={() =>
                    setShowBattleLog(
                      false,
                    )
                  }
                  className="rounded-xl bg-white/10 px-3 py-2 text-xs font-black text-white"
                >
                  閉じる
                </button>
              </div>

              <div className="mt-4 min-h-0 flex-1 space-y-1 overflow-y-auto rounded-2xl bg-white/5 p-3 text-xs leading-relaxed">
                {log.length ===
                0 ? (
                  <div className="py-8 text-center font-bold text-white/40">
                    まだ実況ログはありません。
                  </div>
                ) : (
                  log.map(
                    (
                      item,
                      index,
                    ) => (
                      <div
                        key={`${item}_${index}`}
                        className={`border-b border-white/5 pb-1.5 pt-1 ${
                          index ===
                          0
                            ? 'font-black text-white'
                            : 'text-white/65'
                        }`}
                      >
                        {
                          item
                        }
                      </div>
                    ),
                  )
                )}
              </div>
            </div>
          </div>
        )}

        {showOpponentDisconnectModal &&
          battlePhase ===
            'battle' && (
            <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
              <div className="w-full max-w-md rounded-[2rem] bg-white p-5 text-center shadow-2xl">
                <div className="text-4xl">
                  ⚠️
                </div>

                <h3 className="mt-3 text-xl font-black text-slate-950">
                  相手との接続を確認できません
                </h3>

                <p className="mt-3 text-sm font-bold leading-relaxed text-slate-600">
                  {
                    opponentDisconnectMessage
                  }
                </p>

                <p className="mt-2 text-xs font-bold text-slate-400">
                  相手が復帰すれば、そのまま対戦を続けられます。
                </p>

                <div className="mt-5 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setShowOpponentDisconnectModal(
                        false,
                      );

                      opponentDisconnectDismissedUntilRef.current =
                        Date.now() +
                        30 *
                          1000;

                      setWaitingMessage(
                        '相手の復帰を待っています。',
                      );
                    }}
                    className="rounded-2xl bg-indigo-600 px-4 py-3 text-sm font-black text-white"
                  >
                    待機する
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      void exitBecauseOpponentDisconnected()
                    }
                    className="rounded-2xl bg-slate-100 px-4 py-3 text-sm font-black text-slate-900"
                  >
                    退出する
                  </button>
                </div>
              </div>
            </div>
          )}
      </div>
    </div>
  );
}