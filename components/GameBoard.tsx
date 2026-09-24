'use client';

import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
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
  | 'y_total_score'
  | 'y_response_score'
  | 'y_burst'
  | 'y_crash';

type StatKey = 'hp' | 'intellect' | 'dexterity' | 'charm';
type SkillType = 'score' | 'debuff_clear' | 'draw_score' | 'debuff_attack';

// 季節は対戦全体で共通の固定順序
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
  { id: 'skill_1', name: 'ボディビル', description: '情熱×10でスコアを獲得する。', maxUsesPerClass: 0, type: 'score', rule: 'primary_score', primaryStat: 'hp' },
  { id: 'skill_2', name: 'やる気元気', description: '自分のデバフを解除し、このキャラへのデバフを無効化する。', maxUsesPerClass: 0, type: 'debuff_clear', rule: 'primary_score' },
  { id: 'skill_3', name: '計画性', description: '智略を基準にスコアを獲得する。', maxUsesPerClass: 0, type: 'score', rule: 'primary_score', primaryStat: 'intellect' },
  { id: 'skill_4', name: 'タックル&寝技', description: '相手の情熱を自分の愛嬌分だけ下げる。', maxUsesPerClass: 1, type: 'debuff_attack', rule: 'combo_score_and_debuff', primaryStat: 'hp', secondaryStat: 'charm' },
];

function getPresetForCard(card: AvatarCard & { presetId?: string; coordinateCode?: string; code?: string }) {
  const presetId = card.presetId;
  const code = card.coordinateCode || card.code;
  return COORDINATE_PRESETS.find((preset) =>
    (presetId && preset.id === presetId) || (code && preset.code === code),
  );
}

function buildPresetSkills(
  preset: (typeof COORDINATE_PRESETS)[number],
  customNames?: string[],
): Skill[] {
  const names = customNames?.length ? customNames : preset.defaultSkills;

  if (preset.code === 'n1') {
    return [
      { id: 'skill_1', name: names[0] || preset.defaultSkills[0], description: preset.skillDescriptions[0], maxUsesPerClass: 0, type: 'score', rule: 'y_total_score' },
      { id: 'skill_2', name: names[1] || preset.defaultSkills[1], description: preset.skillDescriptions[1], maxUsesPerClass: 0, type: 'score', rule: 'y_response_score' },
      { id: 'skill_3', name: names[2] || preset.defaultSkills[2], description: preset.skillDescriptions[2], maxUsesPerClass: 2, type: 'score', rule: 'y_burst' },
      { id: 'skill_4', name: names[3] || preset.defaultSkills[3], description: preset.skillDescriptions[3], maxUsesPerClass: 1, type: 'debuff_attack', rule: 'y_crash' },
    ];
  }

  const rank = getStatRankFromPreset(preset);
  return [
    { id: 'skill_1', name: names[0] || preset.defaultSkills[0], description: preset.skillDescriptions[0], maxUsesPerClass: 0, type: 'score', rule: 'primary_score', primaryStat: rank[0] },
    { id: 'skill_2', name: names[1] || preset.defaultSkills[1], description: preset.skillDescriptions[1], maxUsesPerClass: 0, type: 'score', rule: 'product_score', primaryStat: rank[1], secondaryStat: rank[2] },
    { id: 'skill_3', name: names[2] || preset.defaultSkills[2], description: preset.skillDescriptions[2], maxUsesPerClass: 0, type: 'score', rule: 'difference_score', primaryStat: rank[0] },
    { id: 'skill_4', name: names[3] || preset.defaultSkills[3], description: preset.skillDescriptions[3], maxUsesPerClass: 1, type: 'debuff_attack', rule: 'combo_score_and_debuff', primaryStat: rank[0], secondaryStat: rank[2], tertiaryStat: rank[3] },
  ];
}

function getStatRankFromPreset(preset: (typeof COORDINATE_PRESETS)[number]): StatKey[] {
  const sorted = STAT_KEYS.slice().sort((a, b) => preset.stats[b] - preset.stats[a]);
  return sorted;
}

function buildSkills(names: string[] | undefined, preset?: (typeof COORDINATE_PRESETS)[number]): Skill[] {
  if (preset) return buildPresetSkills(preset, names);
  return LEGACY_SKILLS.map((skill, index) => ({ ...skill, id: `skill_${index + 1}`, name: names?.[index]?.trim() || skill.name }));
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
  /** 対戦開始時の基礎ステータス。サポート/技による現在値と分離して保持する。 */
  baseStats: AvatarCard['stats'];
  currentDebuff: AvatarCard['stats'];
  debuffImmune: boolean;
  seasonAbilityText: string;
  skills: Skill[];
  statBoost?: Partial<Record<StatKey, number>>;
  supportEffects?: SupportAvatarEffectState[];
  supportControlEffects?: SupportControlEffectState[];
};

const getBattleTurnOrdinal = (year: number, turnIndex: number) =>
  Math.max(0, (year - 1) * 8 + turnIndex);

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
  const active = (effects || []).filter((effect) =>
    isSupportEffectActive(effect, turnOrdinal),
  );

  if (active.some((effect) => effect.duration === '一時' && effect.kind === 'free')) {
    return Infinity;
  }

  const temporaryLimits = active
    .filter(
      (effect) =>
        effect.duration === '一時' &&
        effect.kind === 'limit' &&
        typeof effect.maxUsesPerTurn === 'number',
    )
    .map((effect) => effect.maxUsesPerTurn as number);
  if (temporaryLimits.length) return Math.min(...temporaryLimits);

  if (active.some((effect) => effect.duration === '永続' && effect.kind === 'free')) {
    return Infinity;
  }

  const permanentLimits = active
    .filter(
      (effect) =>
        effect.duration === '永続' &&
        effect.kind === 'limit' &&
        typeof effect.maxUsesPerTurn === 'number',
    )
    .map((effect) => effect.maxUsesPerTurn as number);
  if (permanentLimits.length) return Math.min(...permanentLimits);

  return Infinity;
};

const getAdditionalDrawFromEffects = (
  effects: SupportControlEffectState[] | undefined,
  turnOrdinal: number,
) =>
  (effects || [])
    .filter((effect) =>
      isSupportEffectActive(effect, turnOrdinal) &&
      effect.kind === 'extra_draw',
    )
    .reduce((sum, effect) => sum + Number(effect.extraDrawPerTurn || 0), 0);

const hasSkillSeal = (
  avatar: BattleAvatar,
  skillIndex: number,
  turnOrdinal: number,
) =>
  (avatar.supportEffects || []).some(
    (effect) =>
      effect.skillSealIndex === skillIndex &&
      isSupportEffectActive(effect, turnOrdinal),
  );

const getSupportUseCountFromUsedSkills = (
  usedSkills: Record<string, string[]> | undefined,
  year: number,
  turnIndex: number,
) => {
  const list = usedSkills?.[String(year)] || [];
  const marker = `__support_${turnIndex}:`;
  const entry = list.find((value) => value.startsWith(marker));
  if (!entry) return 0;
  const count = Number(entry.slice(marker.length));
  return Number.isFinite(count) ? count : 0;
};

const setSupportUseCountInUsedSkills = (
  usedSkills: Record<string, string[]>,
  year: number,
  turnIndex: number,
  count: number,
) => {
  const key = String(year);
  const marker = `__support_${turnIndex}:`;
  const current = usedSkills[key] || [];
  const filtered = current.filter((value) => !value.startsWith(marker));
  return {
    ...usedSkills,
    [key]: [...filtered, `${marker}${count}`],
  };
};

const createSupportEffectId = (presetId: string) =>
  `${presetId}_${Date.now()}_${Math.random().toString(36).slice(2)}`;

// CardGeneratorが現在保存している追加情報も読み込めるようにする。
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

// ===== デフォルトアバター =====
const createDefaultAvatar = (
  id: string,
  name: string,
  role: RoleName,
  archetype: Archetype,
  color: '赤' | '青' | '黄',
): BattleAvatar => {
  const stats =
    archetype === 'マッスル型'
      ? { hp: 80, intellect: 20, dexterity: 20, charm: 20 }
      : archetype === '頭脳型'
        ? { hp: 20, intellect: 80, dexterity: 20, charm: 20 }
        : archetype === '職人型'
          ? { hp: 20, intellect: 20, dexterity: 80, charm: 20 }
          : { hp: 20, intellect: 20, dexterity: 20, charm: 80 };

  return {
    card: {
      id,
      profileUrl: '',
      userName: name,
      imageDataUrl: `https://placehold.co/400x520?text=${encodeURIComponent(name)}`,
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
    currentDebuff: { hp: 0, intellect: 0, dexterity: 0, charm: 0 },
    debuffImmune: false,
    seasonAbilityText: `${role}戦`,
    skills: buildSkills(['ボディビル', 'やる気元気', '計画性', 'タックル&寝技']),
    statBoost: {},
  };
};

const DEFAULT_MY_AVATARS: BattleAvatar[] = [
  createDefaultAvatar('my_1', 'タロウ', '先鋒', 'マッスル型', '赤'),
  createDefaultAvatar('my_2', 'ジロウ', '中堅', '頭脳型', '青'),
  createDefaultAvatar('my_3', 'サブロウ', '大将', '職人型', '黄'),
];

const DEFAULT_OPP_AVATARS: BattleAvatar[] = [
  createDefaultAvatar('opp_1', 'ライバルA', '先鋒', '職人型', '青'),
  createDefaultAvatar('opp_2', 'ライバルB', '中堅', 'ディーバ型', '赤'),
  createDefaultAvatar('opp_3', 'ライバルC', '大将', 'マッスル型', '黄'),
];

// ===== ステータスグラフ =====
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
  // キャラ情報と横並びに置いても窮屈にならないサイズ。
  // ラベルは頂点の外側へ逃がし、現在スコアと干渉しないようにする。
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

  const angles = [-Math.PI / 2, 0, Math.PI / 2, Math.PI];

  const point = (value: number, angle: number, radius = r) => ({
    x: center + Math.cos(angle) * (value / max) * radius,
    y: center + Math.sin(angle) * (value / max) * radius,
  });

  const polygonPoints = (points: { x: number; y: number }[]) =>
    points.map((p) => `${p.x},${p.y}`).join(' ');

  const basePoints = values.map((value, index) => point(value, angles[index]));
  const currentPoints = currentValues.map((value, index) => point(value, angles[index]));
  const outerPoints = angles.map((angle) => point(max, angle));
  const midPoints = angles.map((angle) => point(50, angle));

  // ラベルはレーダーの各頂点方向に十分離して配置。
  const labelPositions = angles.map((angle) => point(max, angle, r + size * 0.072));
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
          points={polygonPoints(outerPoints)}
          fill="none"
          stroke="currentColor"
          strokeOpacity="0.22"
        />
        <polygon
          points={polygonPoints(midPoints)}
          fill="none"
          stroke="currentColor"
          strokeOpacity="0.13"
        />

        {angles.map((angle) => {
          const outer = point(max, angle);
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

        {/* 基礎値との差分。増加は薄い赤、減少は薄い青。 */}
        {basePoints.map((basePoint, index) => {
          const next = (index + 1) % 4;
          const deltaA = currentValues[index] - values[index];
          const deltaB = currentValues[next] - values[next];

          if (deltaA === 0 && deltaB === 0) return null;

          return (
            <polygon
              key={`gap-${index}`}
              points={polygonPoints([
                basePoint,
                basePoints[next],
                currentPoints[next],
                currentPoints[index],
              ])}
              fill={deltaA + deltaB > 0 ? '#fecaca' : '#bfdbfe'}
              fillOpacity="0.58"
              stroke="none"
            />
          );
        })}

        {/* 基礎ステータス：灰色線 */}
        <polygon
          points={polygonPoints(basePoints)}
          fill="#94a3b8"
          fillOpacity="0.07"
          stroke="#64748b"
          strokeWidth="2"
        />

        {/* 現在ステータス：黄色線 */}
        <polygon
          points={polygonPoints(currentPoints)}
          fill="#facc15"
          fillOpacity="0.11"
          stroke="#eab308"
          strokeWidth="3"
        />

        {showLabels && labels.map(([label, value], index) => {
          const position = labelPositions[index];
          const anchor =
            index === 1 ? 'start' :
            index === 3 ? 'end' :
            'middle';

          const dy =
            index === 0 ? -2 :
            index === 2 ? 10 :
            4;

          return (
            <text
              key={label}
              x={position.x}
              y={position.y + dy}
              textAnchor={anchor}
              className="fill-slate-700"
              fontSize={Math.max(8, size * 0.044)}
              fontWeight="800"
            >
              {label} {value}
            </text>
          );
        })}
      </svg>

      {showLegend && (
        <div className="mt-0 flex items-center gap-3 text-[10px] font-bold opacity-70">
          <span>■ 基礎</span>
          <span className="text-yellow-700">■ 現在</span>
        </div>
      )}
    </div>
  );
}

// ===== 季節ごとの野外ライブ背景 =====
function OutdoorStageBackground({ season }: { season: Season }) {
  const seasonClass = {
    春: 'from-sky-200 via-pink-100 to-emerald-200',
    夏: 'from-sky-300 via-cyan-100 to-amber-100',
    秋: 'from-sky-200 via-orange-100 to-amber-200',
    冬: 'from-slate-200 via-blue-100 to-white',
  }[season];

  return (
    <div className={`absolute inset-0 overflow-hidden bg-gradient-to-b ${seasonClass}`}>
      <div className="absolute inset-x-0 top-0 h-[56%] bg-white/10" />
      <div className="absolute -left-8 bottom-[24%] h-32 w-56 rotate-6 rounded-[45%] bg-emerald-800/15" />
      <div className="absolute left-[14%] bottom-[22%] h-40 w-12 -rotate-12 rounded-full bg-emerald-900/15" />
      <div className="absolute right-[12%] bottom-[20%] h-36 w-16 rotate-12 rounded-full bg-emerald-900/15" />
      <div className="absolute inset-x-0 bottom-0 h-[34%] bg-emerald-950/15" />

      {season === '春' && (
        <>
          <div className="absolute left-4 bottom-[29%] text-6xl opacity-30">🌸</div>
          <div className="absolute right-8 bottom-[26%] text-5xl opacity-25">🌸</div>
        </>
      )}
      {season === '夏' && (
        <>
          <div className="absolute inset-x-0 bottom-0 h-[26%] bg-amber-200/45" />
          <div className="absolute right-10 bottom-[30%] text-5xl opacity-25">☀️</div>
        </>
      )}
      {season === '秋' && (
        <>
          <div className="absolute left-3 bottom-[28%] text-6xl opacity-30">🍁</div>
          <div className="absolute right-5 bottom-[25%] text-5xl opacity-30">🍂</div>
          <div className="absolute left-[38%] bottom-[22%] text-4xl opacity-25">〰️</div>
        </>
      )}
      {season === '冬' && (
        <>
          <div className="absolute inset-x-0 bottom-[18%] h-16 rounded-full bg-white/60 blur-sm" />
          <div className="absolute left-10 top-10 text-4xl opacity-30">❄</div>
          <div className="absolute right-20 top-20 text-3xl opacity-30">❄</div>
        </>
      )}

      <div className="absolute inset-x-0 bottom-[32%] h-px bg-white/50" />
    </div>
  );
}

export default function GameBoard({ roomId = '', isHost = true, onEditDeck }: GameBoardProps) {
  // ===== 対戦モード判定 =====
  // roomId がある場合だけ Firebase のオンライン対戦。
  // roomId がない場合も、オンライン対戦と同じ準備フェイズから開始します。
  const isOnline = Boolean(roomId);
  const [authReady, setAuthReady] = useState(!isOnline);

  // オンライン対戦では、Firebase Authentication のuidを取得してから
  // Firestoreの監視・書き込みを開始する。
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
  })      .catch((error) => {
        console.error('Firebase Authentication 初期化エラー:', error);
        if (!cancelled) setAuthReady(false);
      });
    return () => { cancelled = true; };
  }, [isOnline]);

  // ===== ローカル表示状態 =====
  const [playerRole] = useState<PlayerRole>(isHost ? 'host' : 'guest');
  const [battlePhase, setBattlePhase] = useState<'setup' | 'battle' | 'finished' | 'waiting'>('setup');
  const [currentYear, setCurrentYear] = useState(1);
  const [turnIndex, setTurnIndex] = useState(0);
  const [firstPlayer, setFirstPlayer] = useState<PlayerRole | null>(null);
  const [startSeasonIdx, setStartSeasonIdx] = useState<number | null>(null);
  const [myAvatars, setMyAvatars] = useState<BattleAvatar[]>(DEFAULT_MY_AVATARS);
  const [oppAvatars, setOppAvatars] = useState<BattleAvatar[]>(DEFAULT_OPP_AVATARS);
  const [cpuSupportDeck, setCpuSupportDeck] = useState<SupportCard[]>([]);
  const [cpuHand, setCpuHand] = useState<SupportCard[]>([]);
  const [cpuDeck, setCpuDeck] = useState<SupportCard[]>([]);
  const [myDeckReady, setMyDeckReady] = useState(false);

  // チームを選択しただけでは準備完了にしない。「このチームではじめる」で確定する。
  const [deckConfirmed, setDeckConfirmed] = useState(false);
  const [isCoinTossing, setIsCoinTossing] = useState(false);
  const [myClassScores, setMyClassScores] = useState<number[]>([0, 0, 0]);
  const [oppClassScores, setOppClassScores] = useState<number[]>([0, 0, 0]);
  const [hostTotalScore, setHostTotalScore] = useState(0);
  const [guestTotalScore, setGuestTotalScore] = useState(0);
  const [usedSkillsByClass, setUsedSkillsByClass] = useState<Record<string, string[]>>({});

  // CPU側の「このクラス1回」の技使用状況。自分の技使用状況とは完全に分離する。
  const [cpuUsedSkillsByClass, setCpuUsedSkillsByClass] = useState<Record<string, string[]>>({});
  const [myHand, setMyHand] = useState<SupportCard[]>([]);
  const [myDeck, setMyDeck] = useState<SupportCard[]>([]);
  const [isDeckSelectOpen, setIsDeckSelectOpen] = useState(false);
  const [activeDeckId, setActiveDeckId] = useState<string | null>(() =>
    typeof window !== 'undefined' ? localStorage.getItem('reality_active_deck_id') : null,
  );
  const [log, setLog] = useState<string[]>([]);
  const [modalAvatar, setModalAvatar] = useState<BattleAvatar | null>(null);
  const [rematchChoice, setRematchChoice] = useState<'rematch' | 'exit' | null>(null);
  const [waitingMessage, setWaitingMessage] = useState('');
  const [waitingMode, setWaitingMode] = useState<'opponent' | 'return'>('opponent');
  const [preparationMessage, setPreparationMessage] = useState('');
  const [showOpponentDisconnectModal, setShowOpponentDisconnectModal] =
    useState(false);
  const [opponentDisconnectMessage, setOpponentDisconnectMessage] =
    useState('');
  const [classResult, setClassResult] = useState<{
    completedYear: number;
    myScore: number;
    opponentScore: number;
    myTotal: number;
    opponentTotal: number;
  } | null>(null);
  const classTransitionInProgressRef = useRef(false);
  const [readyHost, setReadyHost] = useState(false);
  const [readyGuest, setReadyGuest] = useState(false);
  const [hostDeckId, setHostDeckId] = useState<string | null>(null);
  const [guestDeckId, setGuestDeckId] = useState<string | null>(null);
  const [classReadyYearHost, setClassReadyYearHost] = useState(0);
  const [classReadyYearGuest, setClassReadyYearGuest] = useState(0);

  const [activeCardsRevealed, setActiveCardsRevealed] = useState(false);
  const [battleDealAnimationKey, setBattleDealAnimationKey] = useState(0);
  const [battleDealAnimationActive, setBattleDealAnimationActive] = useState(false);
  const [selectedSupportCardIndex, setSelectedSupportCardIndex] = useState<number | null>(null);
  const [showBattleLog, setShowBattleLog] = useState(false);
  const [selectedSkillDetail, setSelectedSkillDetail] = useState<Skill | null>(null);
  const [supportSubmittingCardIndex, setSupportSubmittingCardIndex] = useState<number | null>(null);
  const [revealingSupportCardIndexes, setRevealingSupportCardIndexes] = useState<number[]>([]);
  const [supportDealAnimationKey, setSupportDealAnimationKey] = useState(0);
  const [supportDealAnimationActive, setSupportDealAnimationActive] = useState(false);
  const [supportDealAnimationCount, setSupportDealAnimationCount] = useState(0);
  const [skillStatSelection, setSkillStatSelection] = useState<{
    skillId: string;
    mode: 'response' | 'burst';
  } | null>(null);

  // 相手の手札・山札枚数。オンラインではFirebaseから同期し、CPU戦ではCPUのローカル状態を表示する。
  const [opponentHandCount, setOpponentHandCount] = useState(0);
  const [opponentDeckCount, setOpponentDeckCount] = useState(0);
  const lastActionRef = useRef<string>('');
  const lastSkillActionRef = useRef<string>('');
  const lastObservedBattlePhaseRef = useRef<string>('');
  const lastObservedYearRef = useRef<number>(1);
  const initializedRef = useRef(false);

  // 再戦時のPlayer完全初期化が同じRoom snapshotで
  // 二重実行されないようにする。
  const rematchPlayerResetInProgressRef =
    useRef(false);

// 技のAPI送信中に、同じターンの技が
// 二重送信されないようにする。
const skillSubmitInProgressRef =
  useRef(false);

const currentUserUidRef =
  useRef('');

  const opponentDisconnectDismissedUntilRef =
    useRef<number>(0);

// Room終了時のホーム遷移が
// onSnapshotの複数回発火で重複しないようにする。
const roomCloseRedirectRef =
  useRef<number | null>(null);
const supportSubmitInProgressRef = useRef(false);
const supportDealTimerRef = useRef<number | null>(null);
const supportRevealTimerRef = useRef<number | null>(null);
const supportPointerStartRef = useRef<{ index: number; y: number } | null>(null);
const supportClickSuppressRef = useRef(false);
const myActiveCardAnchorRef = useRef<HTMLDivElement | null>(null);
const opponentActiveCardAnchorRef = useRef<HTMLDivElement | null>(null);

  const addLog = (message: string) => setLog((prev) => [message, ...prev]);

type BattleVisualCard = AvatarCard & {
  colorHex?: string;
  colorType?: string;
  flavorText?: string;
};

const getBattleVisualColorHex = (card: AvatarCard) =>
  (card as BattleVisualCard).colorHex;

const getBattleColorTypeLabel = (card: AvatarCard): string => {
  const visualCard = card as BattleVisualCard;
  if (visualCard.colorType === 'マゼンタ系' || visualCard.colorType === 'シアン系' || visualCard.colorType === 'イエロー系') {
    return visualCard.colorType;
  }
  return COLOR_TYPE_LABELS[card.color as '赤' | '青' | '黄'] || card.color;
};

const getBattleFlavorText = (card: AvatarCard): string =>
  ((card as BattleVisualCard).flavorText || '').trim();

const getSupportBattleTarget = (
  preset: EmotionPreset | undefined,
  actorIsLocal: boolean,
): 'self' | 'opponent' | 'both' => {
  if (!preset || preset.target === '自分・相手') return 'both';
  if (preset.target === '自分') {
    return actorIsLocal ? 'self' : 'opponent';
  }
  return actorIsLocal ? 'opponent' : 'self';
};

  // ===== CPU用一時チームを自動構築 =====
  // 6人の正式な仮キャラから3人をランダム選出し、35種の仮サポートから
  // 18枚をランダム選択します。同一カードは最大2枚までです。
  const buildCpuDeck = () => {
    const shuffledCharacters = [...CHARACTER_SAMPLE_CARDS].sort(() => Math.random() - 0.5);
    const selectedCharacters = shuffledCharacters.slice(0, 3);
    const roleOrder: RoleName[] = ['先鋒', '中堅', '大将'];
    const cpuAvatars = selectedCharacters.map((sample, index) => {
      const preset = COORDINATE_PRESETS.find((p) => p.id === sample.presetId);
      const card = sample as AvatarCard & { presetId?: string; customSkills?: string[] };
      const stats = preset ? { ...preset.stats } : { ...sample.stats };
      const battleCard = preset
        ? { ...card, stats, archetype: preset.archetype, favoredSeason: preset.season }
        : card;
      return {
        card: battleCard,
        roleName: roleOrder[index],
        stats,
        baseStats: { ...stats },
        currentDebuff: { hp: 0, intellect: 0, dexterity: 0, charm: 0 },
        debuffImmune: false,
        seasonAbilityText: `${battleCard.favoredSeason}が得意`,
        skills: buildSkills(sample.customSkills, preset),
        statBoost: {},
        supportEffects: [],
        supportControlEffects: [],
      } as BattleAvatar;
    });

    const virtualSupports = createVirtualSupportCards(new Set());
    const shuffledSupports = [...virtualSupports].sort(() => Math.random() - 0.5);
    const selectedSupports: SupportCard[] = [];
    const counts = new Map<string, number>();
    let cursor = 0;
    while (selectedSupports.length < BATTLE_DECK_SIZE && cursor < shuffledSupports.length * 3) {
      const card = shuffledSupports[cursor % shuffledSupports.length];
      const count = counts.get(card.id) || 0;
      if (count < 2) {
        selectedSupports.push(card);
        counts.set(card.id, count + 1);
      }
      cursor += 1;
    }

    const shuffledDeck = [...selectedSupports].sort(() => Math.random() - 0.5);
    setOppAvatars(cpuAvatars);
    setCpuSupportDeck(shuffledDeck);
    setCpuHand(shuffledDeck.slice(0, INITIAL_HAND_SIZE));
    setCpuDeck(shuffledDeck.slice(INITIAL_HAND_SIZE));
    addLog(`CPUチームを構築：キャラ3人＋サポート${shuffledDeck.length}枚`);
  };

  // ===== チームから3キャラを読み込む =====
  const loadDeckAndAvatars = (targetDeckId?: string | null): BattleAvatar[] => {
    let result = DEFAULT_MY_AVATARS;
    try {
      const decksRaw = localStorage.getItem('reality_decks');
      const entriesRaw = localStorage.getItem('reality_world_entries');
      const decks: Deck[] = decksRaw ? JSON.parse(decksRaw) : [];
      const entries: EntryRecordWithSkills[] = entriesRaw ? JSON.parse(entriesRaw) : [];
      const chosen = decks.find((d) => d.id === targetDeckId) || decks[0];
      if (!chosen) return result;

      localStorage.setItem('reality_active_deck_id', chosen.id);
      setActiveDeckId(chosen.id);

      const cards: Array<AvatarCard & { colorHex?: string; colorType?: string; flavorText?: string; presetId?: string; customSkills?: string[] }> = [...CHARACTER_SAMPLE_CARDS];
      for (const entry of entries.filter((e) => e.cardType === 'coordinate')) {
        const archetype = (entry.archetype as Archetype) || 'マッスル型';
        const fallback = cards.find((c) => c.id === entry.id);
        cards.push({
          id: entry.id,
          profileUrl: entry.profileUrl || '',
          userName: entry.userName || 'キャラ',
          imageDataUrl: entry.imageDataUrl || fallback?.imageDataUrl || '',
          color: (entry.color as '赤' | '青' | '黄') || '赤',
          colorHex: entry.colorHex,
          colorType: entry.colorType,
          flavorText: entry.flavorText || '',
          archetype,
          favoredSeason:
            archetype === 'マッスル型'
              ? '春'
              : archetype === '頭脳型'
                ? '秋'
                : archetype === '職人型'
                  ? '冬'
                  : '夏',
          stats: {
            hp: entry.hp ?? 80,
            intellect: entry.ap ?? 20,
            dexterity: 20,
            charm: 20,
          },
          passwordHash: entry.passwordHash || '',
          createdAt: entry.createdAt || '',
          updatedAt: entry.createdAt || '',
          ...(entry.customSkills ? ({ customSkills: entry.customSkills } as never) : {}),
          ...(entry.presetId ? ({ presetId: entry.presetId } as never) : {}),
        });
      }

      const make = (id: string | null, role: RoleName, index: number) => {
        const card = cards.find((c) => c.id === id);
        if (!card) return null;
        const entry = entries.find((e) => e.id === card.id);
        const enrichedCard = card as AvatarCard & { presetId?: string; coordinateCode?: string; code?: string; customSkills?: [string, string, string, string] };
        const preset = getPresetForCard(enrichedCard);
        const names = entry?.customSkills || enrichedCard.customSkills;
        const stats = preset ? { ...preset.stats } : { ...card.stats };
        const battleCard = preset
          ? { ...card, stats, archetype: preset.archetype, favoredSeason: preset.season }
          : card;
        return {
          card: battleCard,
          roleName: role,
          stats,
          baseStats: { ...stats },
          currentDebuff: { hp: 0, intellect: 0, dexterity: 0, charm: 0 },
          debuffImmune: false,
          seasonAbilityText: `${battleCard.favoredSeason}が得意`,
          skills: buildSkills(names, preset),
          statBoost: {},
          supportEffects: [],
          supportControlEffects: [],
        } as BattleAvatar;
      };

      const loaded = [
        make(chosen.vanguardCardId, '先鋒', 0),
        make(chosen.centerCardId, '中堅', 1),
        make(chosen.generalCardId, '大将', 2),
      ].filter(Boolean) as BattleAvatar[];

      if (loaded.length === 3) {
        result = loaded;
        setMyAvatars(loaded);
        addLog(`チーム「${chosen.name}」を読み込みました。`);
      }
    } catch (error) {
      console.error('チーム読み込みエラー:', error);
    }
    return result;
  };

  // ===== 手札・山札の初期化 =====
  const getSupportPool = (entries: EntryRecordWithSkills[]) => {
    const emotionEntries = entries.filter((entry) => entry.cardType === 'emotion');
    const enteredPresetIds = new Set(emotionEntries.map((entry) => entry.presetId).filter((id): id is string => Boolean(id)));
    const virtualSupports = createVirtualSupportCards(enteredPresetIds).map((card) => ({
      ...card,
      presetId:
        (card.id.match(/emo_\d{2}$/)?.[0]) ||
        (card.id.startsWith(VIRTUAL_SUPPORT_PREFIX)
          ? card.id.slice(VIRTUAL_SUPPORT_PREFIX.length)
          : undefined),
    }));
    const realSupports: Array<SupportCard & SupportCardDisplayMeta & { imageDataUrl?: string; presetId?: string }> = emotionEntries.map((entry) => {
      const name = entry.customEffectName || entry.userName || 'サポート';
      return {
        id: entry.id,
        name,
        description: entry.effect || entry.description || '',
        imageDataUrl: entry.imageDataUrl || `/support_sample/${encodeURIComponent(name)}.jpg`,
        presetId: entry.presetId,
        flavorText: entry.flavorText || '',
        colorHex: entry.colorHex,
        colorType: entry.colorType,
      };
    });
    return [...virtualSupports, ...realSupports];
  };

  const resolveSupportIdsForBattle = (ids: string[], entries: EntryRecordWithSkills[]) => {
    const emotionEntries = entries.filter((entry) => entry.cardType === 'emotion');
    const realByPreset = new Map<string, string[]>();
    emotionEntries.forEach((entry) => {
      if (!entry.presetId) return;
      const list = realByPreset.get(entry.presetId) || [];
      list.push(entry.id);
      realByPreset.set(entry.presetId, list);
    });
    const used = new Map<string, number>();
    return ids.map((id) => {
      if (!id.startsWith(VIRTUAL_SUPPORT_PREFIX)) return id;
      const presetId = id.slice(VIRTUAL_SUPPORT_PREFIX.length);
      const realIds = realByPreset.get(presetId);
      if (!realIds?.length) return id;
      const index = used.get(presetId) || 0;
      used.set(presetId, index + 1);
      return realIds[index % realIds.length];
    });
  };

  const resetLocalSupportDeck = (
    deck?: Deck | null,
  ): {
    hand: SupportCard[];
    deck: SupportCard[];
  } => {
    try {
      const entriesRaw = localStorage.getItem(
        'reality_world_entries',
      );
  
      const entries: EntryRecordWithSkills[] =
        entriesRaw ? JSON.parse(entriesRaw) : [];
  
      const pool = getSupportPool(entries);
  
      const ids = resolveSupportIdsForBattle(
        deck?.supportCardIds || [],
        entries,
      );
  
      const selected = ids
        .map((id) => pool.find((card) => card.id === id))
        .filter(
          (card): card is SupportCard =>
            Boolean(card),
        );

      // 実戦チームは18枚。
      // 初期手札は4枚、山札は14枚。
      //
      // チーム構築画面で登録されたカードが18枚未満の場合は、
      // 登録カードを循環させて18枚にする。
      const source =
      selected.length > 0
          ? selected
          : createVirtualSupportCards(new Set());
  
      if (source.length === 0) {
        setMyHand([]);
        setMyDeck([]);
  
        return {
          hand: [],
          deck: [],
        };
      }
  
      const battleDeck: SupportCard[] =
        Array.from(
          { length: BATTLE_DECK_SIZE },
          (_, index) =>
            source[index % source.length],
        );

      const shuffled = battleDeck.sort(
        () => Math.random() - 0.5,
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
  
      setMyHand(initialHand);
      setMyDeck(initialDeck);
  
      return {
        hand: initialHand,
        deck: initialDeck,
      };
    } catch (error) {
      console.error(
        'サポートチーム初期化エラー:',
        error,
      );
  
      const source =
        createVirtualSupportCards(new Set());
  
      if (source.length === 0) {
        setMyHand([]);
        setMyDeck([]);
  
        return {
          hand: [],
          deck: [],
        };
      }

      const battleDeck: SupportCard[] =
        Array.from(
          { length: BATTLE_DECK_SIZE },
          (_, index) =>
            source[index % source.length],
        );
  
      const shuffled = battleDeck.sort(
        () => Math.random() - 0.5,
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
  
      setMyHand(initialHand);
      setMyDeck(initialDeck);
  
      return {
        hand: initialHand,
        deck: initialDeck,
      };
    }
  };
  // =========================================================
  // ===== Firebase Player 構造 =====
  // =========================================================
  //
  // Room:
  //   rooms/{roomId}
  //     → 試合全体の状態
  //
  // Player:
  //   rooms/{roomId}/players/host
  //   rooms/{roomId}/players/guest
  //     → 各プレイヤー固有の状態
  //
  // =========================================================

  const myPlayerRef = useMemo(
    () =>
      isOnline && roomId
        ? doc(db, 'rooms', roomId, 'players', playerRole)
        : null,
    [isOnline, roomId, playerRole],
  );

const myPresenceRef = useMemo(
  () =>
    isOnline && roomId
      ? doc(
          db,
          'rooms',
          roomId,
          'presence',
          playerRole,
        )
      : null,
  [isOnline, roomId, playerRole],
);

  const myPrivatePlayerRef = useMemo(
    () =>
      isOnline && roomId
        ? doc(db, 'rooms', roomId, 'privatePlayers', playerRole)
        : null,
    [isOnline, roomId, playerRole],
  );

  const opponentRole: PlayerRole =
    playerRole === 'host' ? 'guest' : 'host';

  const opponentPlayerRef = useMemo(
    () =>
      isOnline && roomId
        ? doc(db, 'rooms', roomId, 'players', opponentRole)
        : null,
    [isOnline, roomId, opponentRole],
  );

  // =========================================================
  // ===== 自分のアバター・チームをPlayerへ公開 =====
  // =========================================================
  //
  // 現行：
  //   rooms/{roomId}.hostAvatars / guestAvatars
  //
  // 今回：
  //   rooms/{roomId}/players/{playerRole}.avatars
  //
  // 既存のローカル状態生成はそのまま残し、
  // Firebaseへの公開先だけPlayerへ変更する。
  // =========================================================

  useEffect(() => {
    const loaded = loadDeckAndAvatars(activeDeckId);

    let selectedDeck: Deck | null = null;

    try {
      const raw = localStorage.getItem('reality_decks');
      const decks: Deck[] = raw ? JSON.parse(raw) : [];

      selectedDeck =
        decks.find((deck) => deck.id === activeDeckId) ||
        decks[0] ||
        null;
    } catch {
      selectedDeck = null;
    }

    const initialSupportState =
      resetLocalSupportDeck(selectedDeck);

    // 保存済みチームがあれば、
    // 入場直後から「このチームではじめる」を押せる状態にする。
    setMyDeckReady(Boolean(selectedDeck));
    setDeckConfirmed(false);

    // -------------------------------------------------------
    // CPU戦
    // -------------------------------------------------------

    if (!isOnline) {
      buildCpuDeck();

      setPreparationMessage(
        'チームを確認して「このチームではじめる」を押してください。',
      );

      setOpponentHandCount(INITIAL_HAND_SIZE);

      setOpponentDeckCount(
        Math.max(0, BATTLE_DECK_SIZE - INITIAL_HAND_SIZE),
      );

      return;
    }

    // -------------------------------------------------------
    // オンライン戦
    // -------------------------------------------------------

    if (!myPlayerRef || !authReady) return;

    let cancelled = false;

    void (async () => {
      try {
        const currentUser = await ensureAnonymousAuth();

        if (cancelled) return;

        await setDoc(
          myPrivatePlayerRef!,
          {
            uid: currentUser.uid,
            hand: initialSupportState.hand,
            deck: initialSupportState.deck,
          },
          {
            merge: true,
          },
        );

        await updateDoc(myPlayerRef, {
          uid: currentUser.uid,
          role: playerRole,
          joined: true,
        
          // 公開Player情報
          avatars: loaded,

          // hand / deck本体はprivatePlayersへ移動
          hand: deleteField(),
          deck: deleteField(),

          // 初期状態
          usedSkills: {},

          lastProcessedIncomingActionId: '',

          // 枚数だけ公開
          handCount: initialSupportState.hand.length,
          deckCount: initialSupportState.deck.length,

       });

      } catch (error) {
        console.error(
          '自分のPlayerデータ公開エラー:',
          error,
        );
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    roomId,
    playerRole,
    authReady,
    isOnline,
    activeDeckId,
    myPlayerRef,
  ]);

// =========================================================
// ===== ステージ在席確認（ハートビート） =====
// =========================================================
//
// 現在：
//   rooms/{roomId}/presence/{playerRole}.lastSeenAt
//
// Room本体の対戦状態・所有権情報とは分離して、
// 「現在このプレイヤーが接続している」という情報だけ
// Presenceへ保存する。
// =========================================================
useEffect(() => {
  if (
    !roomId ||
    !authReady ||
    !myPresenceRef
  ) {
    return;
  }

  const writeHeartbeat = () => {
    if (
      skillSubmitInProgressRef.current
    ) {
      return;
    }

    const lastSeenAt =
      Date.now();

void setDoc(
  myPresenceRef,
  {
    uid: currentUserUidRef.current,
    role: playerRole,
    lastSeenAt,
  },
  {
    merge: true,
  },
).catch((error) => {
  console.warn(
    'Presenceハートビート保存エラー:',
    error,
  );
});
};

  writeHeartbeat();

  const timer =
    window.setInterval(
      writeHeartbeat,
      10000,
    );

  return () => {
    window.clearInterval(timer);
  };
}, [
  roomId,
  authReady,
  myPresenceRef,
  playerRole,
]);


// =========================================================
// ===== 相手の接続監視
// =========================================================
//
// Host / Guest の両方で同じ処理を行う。
// 相手PresenceのlastSeenAtが30秒以上更新されなければ、
// 一時的な通信断・ページ離脱の可能性として警告する。
//
// 「退出する」を選択した場合のみRoomを正式終了する。
// =========================================================

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

  let opponentLastSeenAt = 0;

  const DISCONNECT_WARNING_MS = 30 * 1000;
  const CHECK_INTERVAL_MS = 5 * 1000;

  const unsubscribe = onSnapshot(
    opponentPresenceRef,
    (snapshot) => {
      if (!snapshot.exists()) {
        opponentLastSeenAt = 0;
        return;
      }

      const data =
        snapshot.data() as Record<string, unknown>;

      opponentLastSeenAt =
        Number(data.lastSeenAt || 0);

      if (opponentLastSeenAt > 0) {
        setShowOpponentDisconnectModal(false);

        setOpponentDisconnectMessage('');

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

  const timer = window.setInterval(() => {
    if (
      opponentLastSeenAt <= 0
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
      opponentRole === 'host'
        ? 'ルーム作成者'
        : 'ゲスト';

    setOpponentDisconnectMessage(
      `${opponentLabel}との通信が30秒以上確認できません。通信切断やページ離脱の可能性があります。`,
    );

    setShowOpponentDisconnectModal(true);
  }, CHECK_INTERVAL_MS);

  return () => {
    unsubscribe();
    window.clearInterval(timer);
  };
}, [
  isOnline,
  roomId,
  authReady,
  opponentRole,
]);


  // =========================================================
  // ===== Firebaseのゲーム状態を常時監視 =====
  // =========================================================
  //
  // Room購読：
  //   battlePhase
  //   currentYear
  //   turnIndex
  //   firstPlayer
  //   startSeasonIdx
  //   スコア
  //   rematch / exit
  //
  // Player購読：
  //   自分のavatars / hand / deck / usedSkills
  //   相手のavatars / hand / deck / usedSkills
  //
  // という責務分離にする。
  // =========================================================

  useEffect(() => {
    if (!roomId || !authReady || !isOnline) return;

    const roomRef = doc(db, 'rooms', roomId);
    const myRef = doc(
      db,
      'rooms',
      roomId,
      'players',
      playerRole,
    );
    
    const myPrivateRef = doc(
      db,
      'rooms',
      roomId,
      'privatePlayers',
      playerRole,
    );
    
    const opponentRef = doc(
      db,
      'rooms',
      roomId,
      'players',
      opponentRole,
    );

    let currentRoomData: Record<string, any> | null = null;
    let currentMyPlayerData: Record<string, any> | null = null;
    let currentMyPrivatePlayerData: Record<string, any> | null = null;
    let currentOpponentPlayerData: Record<string, any> | null = null;

    const applyPlayerData = () => {
      // =====================================================
      // 自分のPlayer
      // =====================================================

      if (currentMyPlayerData) {
        const avatars = currentMyPlayerData.avatars;

        if (Array.isArray(avatars) && avatars.length === 3) {
          setMyAvatars(
            (avatars as BattleAvatar[]).map((avatar) => ({
              ...avatar,
              baseStats:
                avatar.baseStats || {
                  ...avatar.card.stats,
                },
              currentDebuff:
                avatar.currentDebuff || {
                  hp: 0,
                  intellect: 0,
                  dexterity: 0,
                  charm: 0,
                },
              statBoost:
                avatar.statBoost || {},
              supportEffects:
                avatar.supportEffects || [],
              supportControlEffects:
                avatar.supportControlEffects || [],
            })),
          );
        }

        const usedSkills =
          currentMyPlayerData.usedSkills;

        if (
          usedSkills &&
          typeof usedSkills === 'object'
        ) {
          setUsedSkillsByClass(usedSkills);
        }

        if (
          typeof currentMyPlayerData.handCount === 'number'
        ) {
          // 自分の枚数はローカル状態を正とするため、
          // ここでは相手表示用の値だけを更新しない。
        }
      }

    // =====================================================
    // 相手のPlayer
    // =====================================================
    
    if (currentOpponentPlayerData) {
      const avatars =
        currentOpponentPlayerData.avatars;
    
      if (
        Array.isArray(avatars) &&
        avatars.length === 3
      ) {
        setOppAvatars(
          (avatars as BattleAvatar[]).map(
            (avatar) => ({
              ...avatar,
              baseStats:
                avatar.baseStats || {
                  ...avatar.card.stats,
                },
              currentDebuff:
                avatar.currentDebuff || {
                  hp: 0,
                  intellect: 0,
                  dexterity: 0,
                  charm: 0,
                },
              statBoost:
                avatar.statBoost || {},
            }),
          ),
        );
      }
    
      const handCount =
        currentOpponentPlayerData.handCount;
    
      const deckCount =
        currentOpponentPlayerData.deckCount;
    
      if (typeof handCount === 'number') {
        setOpponentHandCount(handCount);
      }
    
      if (typeof deckCount === 'number') {
        setOpponentDeckCount(deckCount);
      }
    }
  };

    // =======================================================
    // Room購読
    // =======================================================

    const unsubscribeRoom = onSnapshot(
      roomRef,
      async (snapshot) => {
        if (!snapshot.exists()) {
          setWaitingMode('return');
          setBattlePhase('waiting');
          setWaitingMessage(
            'このステージは終了しました。ホーム画面へ戻ります。',
          );
          return;
        }

        const data =
          snapshot.data() as Record<string, any>;


    // ===================================================
    // 明示的な退出によるRoom終了
    // ===================================================

    if (data.roomClosed === true) {
      const otherExited =
        playerRole === 'host'
          ? data.exitGuest === true
          : data.exitHost === true;

      const message = otherExited
        ? '相手が退出しました。この対戦は終了しました。ホームへ戻ります。'
        : 'この対戦を終了しました。ホームへ戻ります。';

      setWaitingMode('return');
      setBattlePhase('waiting');
      setWaitingMessage(message);

      if (
        roomCloseRedirectRef.current === null
      ) {
        roomCloseRedirectRef.current =
          window.setTimeout(() => {
            window.location.assign('/');
          }, 1200);
      }

      return;
    }


        currentRoomData = data;

        // ===================================================
        // 認証済みUIDとRoom所有権を確認
        // ===================================================

        try {
          const currentUid =
            (await ensureAnonymousAuth()).uid;

          const expectedUid =
            playerRole === 'host'
              ? data.hostUid
              : data.guestUid;

          if (
            expectedUid &&
            currentUid &&
            expectedUid !== currentUid
          ) {
            setBattlePhase('waiting');
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

          setBattlePhase('waiting');
          setWaitingMessage(
            'Firebase認証を確認できませんでした。',
          );
          return;
        }

        // ===================================================
        // Battle状態
        // ===================================================

        const observedPhase =
          (data.battlePhase as string) || 'setup';

        const observedYear =
          Number(data.currentYear || 1);

        // ===================================================
        // クラス終了リザルト
        // ===================================================

        const wasBattle =
          lastObservedBattlePhaseRef.current === 'battle';

        const completedIndex =
          observedPhase === 'setup'
            ? observedYear - 2
            : observedYear - 1;

        if (
          wasBattle &&
          (
            (
              observedPhase === 'setup' &&
              observedYear >
                lastObservedYearRef.current
            ) ||
            observedPhase === 'finished'
          ) &&
          completedIndex >= 0 &&
          completedIndex < 3
        ) {
          const hostScores =
            Array.isArray(data.hostClassScores)
              ? data.hostClassScores
              : [0, 0, 0];

          const guestScores =
            Array.isArray(data.guestClassScores)
              ? data.guestClassScores
              : [0, 0, 0];

          const myScores =
            playerRole === 'host'
              ? hostScores
              : guestScores;

          const opponentScores =
            playerRole === 'host'
              ? guestScores
              : hostScores;

          const myTotal =
            myScores.reduce(
              (sum: number, score: number) =>
                sum + score,
              0,
            );

          const opponentTotal =
            opponentScores.reduce(
              (sum: number, score: number) =>
                sum + score,
              0,
            );

          showClassResult(
            completedIndex + 1,
            Number(myScores[completedIndex] || 0),
            Number(
              opponentScores[completedIndex] || 0,
            ),
            myTotal,
            opponentTotal,
          );
        }

        lastObservedBattlePhaseRef.current =
          observedPhase;

        lastObservedYearRef.current =
          observedYear;

        // ===================================================
        // Room全体の状態
        // ===================================================

        setBattlePhase(
          (data.battlePhase as typeof battlePhase) ||
            'setup',
        );

        setCurrentYear(
          Number(data.currentYear || 1),
        );

        setTurnIndex(
          Number(data.turnIndex ?? 0),
        );

        setFirstPlayer(
          (data.firstPlayer as PlayerRole) ||
            null,
        );

        setStartSeasonIdx(
          typeof data.startSeasonIdx === 'number'
            ? data.startSeasonIdx
            : null,
        );

        setHostTotalScore(
          Number(data.hostTotalScore ?? 0),
        );

        setGuestTotalScore(
          Number(data.guestTotalScore ?? 0),
        );

        const roomReadyHost = Boolean(data.readyHost);
        const roomReadyGuest = Boolean(data.readyGuest);

        setReadyHost(roomReadyHost);
        setReadyGuest(roomReadyGuest);

        setHostDeckId(
          typeof data.hostDeckId === 'string'
            ? data.hostDeckId
            : null,
        );
        setGuestDeckId(
          typeof data.guestDeckId === 'string'
            ? data.guestDeckId
            : null,
        );

        setClassReadyYearHost(Number(data.classReadyYearHost ?? 0));
        setClassReadyYearGuest(Number(data.classReadyYearGuest ?? 0));

        setDeckConfirmed(
          playerRole === 'host'
            ? roomReadyHost
            : roomReadyGuest,
        );

        // ===================================================
        // スコア
        // ===================================================

        const classScores =
          playerRole === 'host'
            ? data.hostClassScores
            : data.guestClassScores;

        const opponentScores =
          playerRole === 'host'
            ? data.guestClassScores
            : data.hostClassScores;

        if (Array.isArray(classScores)) {
          setMyClassScores(classScores);
        }

        if (Array.isArray(opponentScores)) {
          setOppClassScores(opponentScores);
        }

// ===================================================
// 相手Player構造を正とする
// ===================================================
//
// 相手の以下の情報は、上の
// currentOpponentPlayerData 処理ですでに取得している。
//
//   currentOpponentPlayerData.avatars
//   currentOpponentPlayerData.handCount
//   currentOpponentPlayerData.deckCount
//
// そのため、ここでは旧Room構造へのフォールバックを行わない。
//
// 旧Room直下の以下のフィールドには依存しない。
//
//   guestAvatars
//   hostAvatars
//   guestHandCount
//   hostHandCount
//   guestDeckCount
//   hostDeckCount
//
// ②-Bでは Player 構造を正とする。
//
// ===================================================

// 相手Playerが存在しない場合でも、
// 旧Room構造から相手情報を復元しない。
// 相手情報は currentOpponentPlayerData 側からのみ取得する。
//
// ※ここでは状態更新を行わない。



        // ===================================================
        // 再戦・退出
        // ===================================================

        if (
          data.rematchHost &&
          data.rematchGuest
        ) {
          setRematchChoice(null);
          setWaitingMessage('');
        }

if (data.roomClosed === true) {
  const otherExited =
    playerRole === 'host'
      ? data.exitGuest === true
      : data.exitHost === true;

  const message = otherExited
    ? '相手が退出しました。この対戦は終了しました。ホームへ戻ります。'
    : 'この対戦を終了しました。ホームへ戻ります。';

  setWaitingMode('return');
  setBattlePhase('waiting');
  setWaitingMessage(message);

  window.setTimeout(() => {
    window.location.assign('/');
  }, 1200);

  return;
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
          (data.rematchHost &&
            data.exitGuest) ||
          (data.rematchGuest &&
            data.exitHost)
        ) {
          const rematcher: PlayerRole =
            data.rematchHost
              ? 'host'
              : 'guest';

          if (
            rematcher === playerRole
          ) {
            setWaitingMode('opponent');
            setBattlePhase('waiting');

            setWaitingMessage(
              `現在対戦相手がいません。${playerRole === 'host' ? 'ルーム作成者' : 'ゲスト'}として待機中です。合言葉は「${roomId}」です。`,
            );
          }
        }
      },
    );

    // =======================================================
    // 自分Player購読
    // =======================================================

    const unsubscribeMyPlayer = onSnapshot(
      myRef,
      (snapshot) => {
        if (!snapshot.exists()) {
          return;
        }

        currentMyPlayerData =
          snapshot.data() as Record<string, any>;

        applyPlayerData();
      },
      (error) => {
        console.error(
          '自分のPlayer購読エラー:',
          error,
        );
      },
    );

    // =======================================================
    // 自分PrivatePlayer購読
    // =======================================================
    //
    // hand / deck は本人だけが読む。
    // 公開Playerにはカード本体を保存しない。
    // =======================================================

    const unsubscribeMyPrivatePlayer =
      onSnapshot(
        myPrivateRef,
        (snapshot) => {
          if (!snapshot.exists()) {
            currentMyPrivatePlayerData = null;
            return;
          }

         currentMyPrivatePlayerData =
           snapshot.data() as Record<string, any>;

         // =====================================================
         // privatePlayers
         //   hand / deck
         // =====================================================

         const privateData =
           currentMyPrivatePlayerData;

         const playerHand =
           privateData.hand;

         if (Array.isArray(playerHand)) {
           setMyHand(
             playerHand as SupportCard[],
           );
         }

         const playerDeck =
           privateData.deck;

         if (Array.isArray(playerDeck)) {
           setMyDeck(
             playerDeck as SupportCard[],
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

    // =======================================================
    // 相手Player購読
    // =======================================================

    const unsubscribeOpponentPlayer =
      onSnapshot(
        opponentRef,
        (snapshot) => {
          if (!snapshot.exists()) {
            currentOpponentPlayerData = null;
            return;
          }

          currentOpponentPlayerData =
            snapshot.data() as Record<string, any>;

const lastSkillAction =
  currentOpponentPlayerData.lastSkillAction;

if (
  lastSkillAction?.actionId &&
  lastSkillAction.actionId !==
    lastSkillActionRef.current
) {
  lastSkillActionRef.current =
    lastSkillAction.actionId;

  addLog(
    `相手が「${lastSkillAction.skillName || '技'}」を発動しました。`,
  );
}

const pendingAction =
  currentOpponentPlayerData.pendingAction;

if (
  pendingAction?.actionId &&
  pendingAction.type ===
    'PLAY_SUPPORT' &&
  pendingAction.actionId !==
    lastActionRef.current
) {
  lastActionRef.current =
    pendingAction.actionId;

  void Promise.resolve(
    handleIncomingActionRef.current(
      pendingAction,
    ),
  ).then(() => {
    void updateDoc(myRef, {
      lastProcessedIncomingActionId:
        pendingAction.actionId,
    }).catch((error) => {
      console.error(
        '受信済みAction ID保存エラー:',
        error,
      );
    });
  });
}

          const lastProcessedIncomingActionId =
            typeof currentMyPlayerData?.lastProcessedIncomingActionId === 'string'
              ? currentMyPlayerData.lastProcessedIncomingActionId
              : '';

          if (
            pendingAction?.actionId &&
            pendingAction.actionId !== lastActionRef.current &&
            pendingAction.actionId !== lastProcessedIncomingActionId
          ) {
            lastActionRef.current =
              pendingAction.actionId;
          
            void Promise.resolve(
              handleIncomingActionRef.current(
                pendingAction,
              ),
            ).then(() => {
              void updateDoc(myRef, {
                lastProcessedIncomingActionId:
                  pendingAction.actionId,
              }).catch((error) => {
                console.error(
                  '受信済みAction ID保存エラー:',
                  error,
                );
              });
            });
          }

          applyPlayerData();
        },
        (error) => {
          // 相手がまだ入室していない場合など。
          // これは対戦エラーとは限らない。
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

  if (roomCloseRedirectRef.current !== null) {
    window.clearTimeout(
      roomCloseRedirectRef.current,
    );
    roomCloseRedirectRef.current = null;
  }
};

  }, 

[
    roomId,
    playerRole,
    opponentRole,
    authReady,
    isOnline,
]

);

  // =========================================================
  // ===== 初回ルーム状態の作成 =====
  // =========================================================
  //
  // Room作成自体はFriendMatchSetup側で完了している。
  //
  // ここでは既存ルームに不足している「戦闘状態」だけを
  // ホストが補完する。
  //
  // Playerドキュメントの作成はFriendMatchSetupで行うため、
  // GameBoardから勝手にRoomを再生成しない。
  // =========================================================

  useEffect(() => {
    if (!roomId || !isHost || !authReady) return;

    const roomRef = doc(db, 'rooms', roomId);

    void getDoc(roomRef).then((snapshot) => {
      if (!snapshot.exists()) return;

      const data =
        snapshot.data() as Record<string, any>;

      if (data.battlePhase) return;

      void updateDoc(roomRef, {
        battlePhase: 'setup',
        currentYear: 1,
        turnIndex: 0,
        firstPlayer: null,
        startSeasonIdx: null,

        hostTotalScore: 0,
        guestTotalScore: 0,

        hostClassScores: [0, 0, 0],
        guestClassScores: [0, 0, 0],

        rematchHost: false,
        rematchGuest: false,

        rematchPlayerResetHost: false,
        rematchPlayerResetGuest: false,

        exitHost: false,
        exitGuest: false,

        readyHost: false,
        readyGuest: false,

      });
    });
  }, [
    roomId,
    isHost,
    authReady,
  ]);


  // ===== 現在の季節・手番・出場キャラ =====
  const currentSeasonIdx = startSeasonIdx === null ? 0 : (startSeasonIdx + Math.floor(turnIndex / 2)) % 4;
  const currentSeason = SEASONS[currentSeasonIdx];
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
      classReadyYearHost === currentYear &&
      classReadyYearGuest === currentYear
    );
  const myTurn =
    firstPlayer !== null &&
    ((turnIndex % 2 === 0 ? firstPlayer : firstPlayer === 'host' ? 'guest' : 'host') === playerRole);

  const activeIndex = currentYear - 1;
  const myActiveAvatar = myAvatars[activeIndex] || DEFAULT_MY_AVATARS[activeIndex];
  const oppActiveAvatar = oppAvatars[activeIndex] || DEFAULT_OPP_AVATARS[activeIndex];

  const currentMyClassScore = myClassScores[activeIndex] || 0;
  const currentOppClassScore = oppClassScores[activeIndex] || 0;

  useLayoutEffect(() => {
    if (battlePhase !== 'battle') {
      setBattleDealAnimationActive(false);
      setActiveCardsRevealed(true);
      return;
    }

    setActiveCardsRevealed(false);
    setBattleDealAnimationActive(false);
    setBattleDealAnimationKey((prev) => prev + 1);

    const dealTimer = window.setTimeout(() => {
      setBattleDealAnimationActive(true);
    }, 450);

    const revealTimer = window.setTimeout(() => {
      setActiveCardsRevealed(true);
      setBattleDealAnimationActive(false);
    }, 1500);

    const supportInitialTimer = window.setTimeout(() => {
      const handCount = Math.min(INITIAL_HAND_SIZE, myHand.length);
      triggerSupportDealAnimation(handCount);
      revealSupportCardIndexes(Array.from({ length: handCount }, (_, index) => index));
    }, 450);

    return () => {
      window.clearTimeout(dealTimer);
      window.clearTimeout(revealTimer);
      window.clearTimeout(supportInitialTimer);
    };
  }, [battlePhase, currentYear, activeIndex]);

  const triggerSupportDealAnimation = (count: number) => {
    const safeCount = Math.max(0, Math.min(4, count));
    if (!safeCount) return;
    if (supportDealTimerRef.current !== null) {
      window.clearTimeout(supportDealTimerRef.current);
    }
    setSupportDealAnimationKey((prev) => prev + 1);
    setSupportDealAnimationCount(safeCount);
    setSupportDealAnimationActive(true);
    supportDealTimerRef.current = window.setTimeout(() => {
      setSupportDealAnimationActive(false);
      setSupportDealAnimationCount(0);
      supportDealTimerRef.current = null;
    }, 1100);
  };

  const revealSupportCardIndexes = (indexes: number[]) => {
    const safeIndexes = Array.from(new Set(indexes.filter((index) => index >= 0)));
    if (!safeIndexes.length) return;
    setRevealingSupportCardIndexes((prev) => Array.from(new Set([...prev, ...safeIndexes])));
    if (supportRevealTimerRef.current !== null) {
      window.clearTimeout(supportRevealTimerRef.current);
    }
    supportRevealTimerRef.current = window.setTimeout(() => {
      setRevealingSupportCardIndexes([]);
      supportRevealTimerRef.current = null;
    }, 950);
  };

  const getSupportTargetPositions = () => {
    const positions: {
      self?: { x: number; y: number };
      opponent?: { x: number; y: number };
    } = {};

    const selfRect = myActiveCardAnchorRef.current?.getBoundingClientRect();
    if (selfRect) {
      positions.self = {
        x: selfRect.left + selfRect.width / 2,
        y: selfRect.top + selfRect.height * 0.55,
      };
    }

    const opponentRect = opponentActiveCardAnchorRef.current?.getBoundingClientRect();
    if (opponentRect) {
      positions.opponent = {
        x: opponentRect.left + opponentRect.width / 2,
        y: opponentRect.top + opponentRect.height * 0.55,
      };
    }

    return positions;
  };
  // 画面上は常に「自分＝左」「相手＝右」。
  // 表示上の累計値はクラス別スコアの合計を正とする。CPU戦でも常に即時反映される。
  const myTotalScore = myClassScores.reduce((sum, score) => sum + score, 0);
  const opponentTotalScore = oppClassScores.reduce((sum, score) => sum + score, 0);
  const mySideActiveAvatar = myActiveAvatar;
  const opponentSideActiveAvatar = oppActiveAvatar;
  const mySideActiveClassScore = currentMyClassScore;
  const opponentSideActiveClassScore = currentOppClassScore;

  // ===== 実効ステータス =====
  const getEffectiveStats = (
    avatar: BattleAvatar,
    turnOrdinal = getBattleTurnOrdinal(currentYear, turnIndex),
  ) => {
    const activeSupportEffects = (avatar.supportEffects || []).filter((effect) =>
      isSupportEffectActive(effect, turnOrdinal),
    );

    const baseStats = avatar.baseStats || avatar.stats;
    const supportStats = {
      hp: Math.max(0, baseStats.hp),
      intellect: Math.max(0, baseStats.intellect),
      dexterity: Math.max(0, baseStats.dexterity),
      charm: Math.max(0, baseStats.charm),
    };

    for (const effect of activeSupportEffects) {
      if (effect.statDelta) {
        for (const stat of STAT_KEYS) {
          supportStats[stat] = Math.max(
            0,
            supportStats[stat] + Number(effect.statDelta[stat] || 0),
          );
        }
      }

      if (effect.statOverride) {
        for (const stat of STAT_KEYS) {
          if (typeof effect.statOverride[stat] === 'number') {
            supportStats[stat] = Math.max(0, Number(effect.statOverride[stat]));
          }
        }
      }
    }

    return {
      hp: Math.max(0, supportStats.hp * (avatar.statBoost?.hp || 1) - avatar.currentDebuff.hp),
      intellect: Math.max(0, supportStats.intellect * (avatar.statBoost?.intellect || 1) - avatar.currentDebuff.intellect),
      dexterity: Math.max(0, supportStats.dexterity * (avatar.statBoost?.dexterity || 1) - avatar.currentDebuff.dexterity),
      charm: Math.max(0, supportStats.charm * (avatar.statBoost?.charm || 1) - avatar.currentDebuff.charm),
    };
  };

// ===== ターン開始時の自動ドロー =====
const previousTurnRef = useRef<string>('');
const drawInProgressRef = useRef<string>('');

useEffect(() => {
  if (
    battlePhase !== 'battle' ||
    !myTurn
  ) {
    return;
  }

  const key =
    `${currentYear}-${turnIndex}-${playerRole}`;

  if (
    previousTurnRef.current === key
  ) {
    return;
  }

  if (
    drawInProgressRef.current === key
  ) {
    return;
  }

  // オンラインでは、クラス開始直後にprivatePlayersの初期手札・山札が
  // まだ購読できていない瞬間があります。ここでturnを消費済みにすると、
  // privatePlayer到着後に開始時ドローを再試行できなくなります。
  if (
    isOnline &&
    turnIndex === 0 &&
    myHand.length === 0 &&
    myDeck.length === 0
  ) {
    return;
  }

  const turnOrdinal = getBattleTurnOrdinal(currentYear, turnIndex);
  const drawCount = Math.min(
    1 + getAdditionalDrawFromEffects(
      myActiveAvatar.supportControlEffects,
      turnOrdinal,
    ),
    Math.max(0, MAX_HAND - myHand.length),
    myDeck.length,
  );

  if (drawCount <= 0) {
    previousTurnRef.current = key;
    return;
  }

  drawInProgressRef.current = key;

  const drawnCards = myDeck.slice(0, drawCount);
  const nextHand = [...myHand, ...drawnCards];
  const nextDeck = myDeck.slice(drawCount);

  let cancelled = false;

  const drawCard = async () => {
    if (cancelled) return;

    if (isOnline) {
      const result = await submitTurnDrawAction(
        currentYear,
        turnIndex,
        activeIndex,
      );

      if (!result) {
        drawInProgressRef.current = '';
        return;
      }

      if (result.hand && result.deck) {
        setMyHand(result.hand);
        setMyDeck(result.deck);
      }

      const observedDrawCount =
        result.hand && result.hand.length >= myHand.length
          ? Math.max(0, result.hand.length - myHand.length)
          : 0;
      const actualDrawCount = Math.max(
        result.drawCount,
        observedDrawCount,
      );

      if (actualDrawCount > 0) {
        triggerSupportDealAnimation(actualDrawCount);
        revealSupportCardIndexes(
          Array.from(
            { length: actualDrawCount },
            (_, index) => myHand.length + index,
          ),
        );
      }

      previousTurnRef.current = key;
      drawInProgressRef.current = '';
      addLog(
        actualDrawCount > 0
          ? `サポートカードを${actualDrawCount}枚ドローしました。`
          : (currentYear === 1 && turnIndex === 0
              ? 'サポートカードはすでに開始時の手札へ反映されています。'
              : 'サポートカードをドローできませんでした。'),
      );
      return;
    }

    if (cancelled) return;

    setMyHand(nextHand);
    setMyDeck(nextDeck);
    triggerSupportDealAnimation(drawCount);
    revealSupportCardIndexes(
      Array.from(
        { length: drawCount },
        (_, index) => myHand.length + index,
      ),
    );
    previousTurnRef.current = key;
    drawInProgressRef.current = '';
    addLog(`サポートカードを${drawCount}枚ドローしました。`);
  };

  void drawCard();

  return () => {
    cancelled = true;
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
  myPlayerRef,
  myPrivatePlayerRef,
  myActiveAvatar.supportControlEffects,
]);

  // ===== オンライン準備中：手札・山札枚数をPlayerへ公開 =====
  useEffect(() => {
    if (
      !isOnline ||
      !roomId ||
      !authReady ||
      !myPlayerRef ||
      battlePhase !== 'setup'
    ) {
      return;
    }
  
    void updateDoc(myPlayerRef, {
      handCount: myHand.length,
      deckCount: myDeck.length,
    }).catch(() => undefined);
  }, [
    isOnline,
    roomId,
    authReady,
    myPlayerRef,
    battlePhase,
    myHand.length,
    myDeck.length,
  ]);

// =========================================================
// ===== Battle Action送信

// =========================================================
//
// オンライン対戦では、クライアントは「結果」ではなく
// 「プレイヤーが何をしようとしているか」だけを送信する。
//
// 送信してよいもの:
//   type
//   actionId
//   skillId
//   cardId
//   cardIndex
//   year
//   turnIndex
//   avatarIndex
//   selectedBoostStat
//
// 送信しないもの:
//   gainedScore
//   scoreDelta
//   debuffAmount
//   debuffs
//   actorStats
//   targetStats
//   変更後のavatar
//
// 将来的にAction処理サーバーがこのActionを読み取り、
// 現在のFirestore状態とゲームルールから結果を計算する。
// =========================================================

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

  // 誰がActionを送ったか
  playerRole?: PlayerRole;
  uid?: string;

  // 試合状態
  year: number;
  turnIndex: number;

  // 対象キャラクター
  avatarIndex: number;

  // =====================================================
  // 技
  // =====================================================

  skillId?: string;

  selectedBoostStat?: StatKey;



  // =====================================================
  // サポートカード
  // =====================================================

  supportCardId?: string;
  supportPresetId?: string;
  supportFlavorText?: string;
  supportColorHex?: string;
};

const submitTurnDrawAction = async (
  year: number,
  turnIndex: number,
  avatarIndex: number,
) => {
  if (!isOnline || !roomId || !authReady) {
    return null;
  }

  try {
    const currentUser = await ensureAnonymousAuth();
    const actionId = `${currentUser.uid}-draw-${year}-${turnIndex}`;
    const idToken = await currentUser.getIdToken();
    const response = await fetch('/api/battle/action', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify({
        roomId,
        actionId,
        type: 'DRAW_TURN',
        year,
        turnIndex,
        avatarIndex,
      }),
    });

    const responseData = (await response.json()) as {
      ok?: boolean;
      error?: string;
      drawCount?: number;
      hand?: SupportCard[];
      deck?: SupportCard[];
    };

    if (!response.ok || responseData.ok !== true) {
      throw new Error(
        responseData.error ||
          'ターンドローAPIに失敗しました。',
      );
    }

    return {
      drawCount: Math.max(0, Number(responseData.drawCount ?? 0)),
      hand: Array.isArray(responseData.hand)
        ? responseData.hand
        : null,
      deck: Array.isArray(responseData.deck)
        ? responseData.deck
        : null,
    };
  } catch (error) {
    console.error('ターンドローAPI送信エラー:', error);
    return null;
  }
};

const submitBattleAction = async (
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

    // =====================================================
    // USE_SKILL
    // =====================================================

    if (action.type === 'USE_SKILL') {
      try {
        const idToken =
          await currentUser.getIdToken();

        const response =
          await fetch(
            '/api/battle/action',
            {
              method: 'POST',
              headers: {
                'Content-Type':
                  'application/json',
                Authorization:
                  `Bearer ${idToken}`,
              },
              body: JSON.stringify({
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
              }),
            },
          );

        const responseData =
          (await response.json()) as {
            ok?: boolean;
            error?: string;
          };

        if (
          !response.ok ||
          responseData.ok !== true
        ) {
          throw new Error(
            responseData.error ||
              'Battle Action APIに失敗しました。',
          );
        }

        return true;
      } catch (error) {
        console.error(
          'Skill Action API送信エラー:',
          error,
        );

        addLog(
          '⚠️ 技の送信に失敗しました。',
        );

        return false;
      }
    }

    // =====================================================
    // PLAY_SUPPORT
    //
    // オンラインではサーバーAPIだけがカード消費・効果計算・
    // Avatar状態・スコア・使用回数を確定する。
    // クライアントが計算したavatars / hand / deck / scoreは
    // 正式状態としてFirestoreへ書き込まない。
    // =====================================================

    if (action.type === 'PLAY_SUPPORT') {
      if (!action.supportCardId) {
        addLog('⚠️ supportCardIdがありません。');
        return false;
      }

      try {
        const idToken = await currentUser.getIdToken();
        const response = await fetch('/api/battle/action', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${idToken}`,
          },
          body: JSON.stringify({
            roomId,
            actionId,
            type: action.type,
            year: action.year,
            turnIndex: action.turnIndex,
            avatarIndex: action.avatarIndex,
            supportCardId: action.supportCardId,
            supportPresetId: action.supportPresetId,
            supportFlavorText: action.supportFlavorText,
            supportColorHex: action.supportColorHex || DEFAULT_SUPPORT_COLOR_HEX,
          }),
        });

        const responseData = (await response.json()) as {
          ok?: boolean;
          error?: string;
        };

        if (!response.ok || responseData.ok !== true) {
          throw new Error(
            responseData.error ||
              'Battle Support Action APIに失敗しました。',
          );
        }

        return true;
      } catch (error) {
        console.error('Support Action API送信エラー:', error);
        addLog('⚠️ サポートActionの送信に失敗しました。');
        return false;
      }
    }

    addLog('⚠️ 未対応のオンラインActionです。');
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

  // =========================================================
  // ===== Player戦闘状態をFirebaseへ保存
  // =========================================================
  //
  // Room：
  //   スコア・ターン・試合進行
  //
  // Player：
  //   avatars
  //   hand
  //   deck
  //   usedSkills
  //
  // を正とする。
  // =========================================================

const saveMyPlayerBattleState = async (
  nextAvatars: BattleAvatar[],
  options?: {
    hand?: SupportCard[];
    deck?: SupportCard[];
    usedSkills?: Record<
      string,
      string[]
    >;
  },
) => {
  if (
    !isOnline ||
    !roomId ||
    !authReady
  ) {
    return;
  }

  try {
    const playerRef =
      doc(
        db,
        'rooms',
        roomId,
        'players',
        playerRole,
      );

    const privatePlayerRef =
      doc(
        db,
        'rooms',
        roomId,
        'privatePlayers',
        playerRole,
      );

    const nextHand =
      options?.hand ??
      myHand;

    const nextDeck =
      options?.deck ??
      myDeck;

    const nextUsedSkills =
      options?.usedSkills ??
      usedSkillsByClass;

    // =====================================================
    // 非公開Player
    //   hand / deck
    // =====================================================

    await setDoc(
      privatePlayerRef,
      {
        hand:
          nextHand,

        deck:
          nextDeck,

        // uidは本人確認用
        uid:
          (await ensureAnonymousAuth()).uid,
      },
      {
        merge: true,
      },
    );

    // =====================================================
    // 公開Player
    //   avatars / 枚数 / usedSkills
    //
    // hand / deck 本体は保存しない。
    // =====================================================

    await setDoc(
      playerRef,
      {
        avatars:
          nextAvatars,

        handCount:
          nextHand.length,

        deckCount:
          nextDeck.length,

        usedSkills:
          nextUsedSkills,

        // 旧形式の秘密情報を公開Playerから削除
        hand:
          deleteField(),

        deck:
          deleteField(),
      },
      {
        merge: true,
      },
    );
  } catch (error) {
    console.error(
      'Player戦闘状態保存エラー:',
      error,
    );
  }
};

// =========================================================
// ===== 最新の相手Action処理を保持するRef
// =========================================================

const handleIncomingActionRef =
  useRef<
    (
      action: BattleActionPayload & {
        playerRole?: PlayerRole;
      },
    ) => void
  >(
    async () => undefined,
  );

  // ===== 相手のアクション処理 =====
  const handleIncomingAction = async (
    action: BattleActionPayload & {
      playerRole?: PlayerRole;
    },
  ) => {
    if (!action?.type) return;

    // =====================================================
    // ③-① Actionのyear / turnIndex検証
    //
    // Actionが現在のRoom状態に対するものか確認する。
    // 古いActionや別ターンのActionは処理しない。
    // =====================================================

    if (
      isOnline &&
      roomId
    ) {
      try {
        const roomRef =
          doc(
            db,
            'rooms',
            roomId,
          );

        const roomSnapshot =
          await getDoc(roomRef);

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
            roomData.currentYear ?? 1,
          );

        const roomTurnIndex =
          Number(
            roomData.turnIndex ?? 0,
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
    }
    // =====================================================
    // ③-② Action送信者が現在の手番プレイヤーか検証
    //
    // Room.firstPlayer と turnIndex から
    // 現在の手番プレイヤーを求める。
    //
    // 相手Playerから届いたActionであっても、
    // 本来の手番ではなければ処理しない。
    // =====================================================

    if (
      isOnline &&
      roomId
    ) {
      const roomRef =
        doc(
          db,
          'rooms',
          roomId,
        );

      try {
        const roomSnapshot =
          await getDoc(roomRef);

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

        if (!currentFirstPlayer) {
          return;
        }

        const expectedPlayer =
          Number(action.turnIndex) % 2 === 0
            ? currentFirstPlayer
            : currentFirstPlayer === 'host'
              ? 'guest'
              : 'host';

        const actionPlayer =
          action.playerRole === 'host'
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
    }
    // =====================================================
    // ③-③ ActionのUID / playerRole検証
    //
    // Actionに含まれるUIDと、FirestoreのPlayer.uidを照合する。
    // playerRoleの偽装も同時に防止する。
    // =====================================================

    if (
      isOnline &&
      roomId
    ) {
      try {
        const actionPlayerRole =
          action.playerRole === 'host'
            ? 'host'
            : action.playerRole === 'guest'
              ? 'guest'
              : null;

        if (!actionPlayerRole) {
          console.warn(
            'playerRoleが不正なActionを無視しました。',
          );
          return;
        }

        if (!action.uid) {
          console.warn(
            'UIDがないActionを無視しました。',
          );
          return;
        }

        const actionPlayerRef =
          doc(
            db,
            'rooms',
            roomId,
            'players',
            actionPlayerRole,
          );

        const actionPlayerSnapshot =
          await getDoc(
            actionPlayerRef,
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

    // -------------------------------------------------------
    // 相手のサポートカード使用
    // -------------------------------------------------------
    // オンラインの正式な効果・Avatar・スコアはサーバーが確定する。
    // ここでは演出とログだけを担当し、Firestoreの戦闘状態を直接変更しない。
    // -------------------------------------------------------
    if (action.type === 'PLAY_SUPPORT') {
      const preset = action.supportPresetId
        ? EMOTION_PRESETS.find((emotion) => emotion.id === action.supportPresetId)
        : undefined;

      const supportCard: SupportCard & SupportCardDisplayMeta = {
        id: action.supportCardId || 'support',
        name: preset?.name || 'サポートカード',
        description: preset?.description || '',
        flavorText: action.supportFlavorText || '',
        colorHex: action.supportColorHex,
      };

      await playSupportPreResultEffect({
        effectKey: getSupportBattleEffect(preset),
        cardName: supportCard.name,
        imageUrl: getSupportImage(supportCard),
        targetPositions: getSupportTargetPositions(),
        dialogue: supportCard.flavorText || preset?.description,
        colorHex: supportCard.colorHex || DEFAULT_SUPPORT_COLOR_HEX,
        target: getSupportBattleTarget(preset, false),
      });

      addLog(
        `相手がサポート「${supportCard.name}」を使用しました。` +
          (supportCard.flavorText ? `「${supportCard.flavorText}」` : '') +
          (preset?.description ? ` ${preset.description}` : ''),
      );

      return;
    }
    // -------------------------------------------------------
    // 相手の技使用
    // -------------------------------------------------------
    if (action.type === 'USE_SKILL') {
      const avatarIndex =
        typeof action.avatarIndex === 'number'
          ? action.avatarIndex
          : activeIndex;

      const opponentAvatar =
        oppAvatars[avatarIndex];

      const myAvatar =
        myAvatars[avatarIndex];

      if (
        !opponentAvatar ||
        !myAvatar ||
        !action.skillId
      ) {
        return;
      }

      const skill =
        opponentAvatar.skills.find(
          (item) =>
            item.id === action.skillId,
        );

      if (!skill) {
        addLog(
          '相手が技を使用しました。',
        );
        return;
      }
      // =====================================================
      // ③-④ 技の使用回数検証
      //
      // maxUsesPerClass > 0 の技は、
      // 同じクラスで一度しか使用できない。
      // 相手PlayerのusedSkillsを正とする。
      // =====================================================

      let opponentUsedSkills:
        Record<string, string[]> = {};

      if (
        isOnline &&
        opponentPlayerRef
      ) {
        try {
          const opponentPlayerSnapshot =
            await getDoc(
              opponentPlayerRef,
            );

          if (
            opponentPlayerSnapshot.exists()
          ) {
            const opponentPlayerData =
              opponentPlayerSnapshot.data() as Record<
                string,
                any
              >;

            if (
              opponentPlayerData.usedSkills &&
              typeof opponentPlayerData.usedSkills ===
                'object'
            ) {
              opponentUsedSkills =
                opponentPlayerData.usedSkills;
            }
          }
        } catch (error) {
          console.error(
            '相手Playerの使用済み技取得エラー:',
            error,
          );

          return;
        }
      }

      const usedForClass =
        Array.isArray(
          opponentUsedSkills[
            String(action.year)
          ],
        )
          ? opponentUsedSkills[
              String(action.year)
            ]
          : [];

      if (
        skill.maxUsesPerClass > 0 &&
        usedForClass.includes(
          skill.id,
        )
      ) {
        console.warn(
          'すでに使用済みの技Actionを無視しました。',
          {
            skillId:
              skill.id,
            year:
              action.year,
          },
        );

        return;
      }

      const effective =
        getEffectiveStats(
          opponentAvatar,
        );

      const opponentEffective =
        getEffectiveStats(
          myAvatar,
        );

      let gainedScore = 0;

      let debuffs:
        Partial<
          Record<StatKey, number>
        > = {};

      let nextOpponentAvatars =
        oppAvatars;

      let nextMyAvatars =
        myAvatars;

      // -----------------------------------------------------
      // 技ルールを、ローカル戦と同じ計算で実行
      // -----------------------------------------------------

      if (
        skill.rule ===
        'primary_score'
      ) {
        const stat =
          skill.primaryStat || 'hp';

        gainedScore =
          Number((opponentAvatar.baseStats || opponentAvatar.card.stats)[stat] || 0) * 20;

      } else if (
        skill.rule ===
        'product_score'
      ) {
        const first =
          skill.primaryStat || 'hp';

        const second =
          skill.secondaryStat ||
          'intellect';

        const opponentBaseStats = opponentAvatar.baseStats || opponentAvatar.card.stats;
        gainedScore =
          Number(opponentBaseStats[first] || 0) *
          Number(opponentBaseStats[second] || 0);

      } else if (
        skill.rule ===
        'difference_score'
      ) {
        const stat =
          skill.primaryStat || 'hp';

        gainedScore =
          Math.max(
            0,
            Number((opponentAvatar.baseStats || opponentAvatar.card.stats)[stat] || 0) -
              opponentEffective[stat],
          ) * 40;

      } else if (
        skill.rule ===
        'combo_score_and_debuff'
      ) {
        const first =
          skill.secondaryStat ||
          'intellect';

        const second =
          skill.tertiaryStat ||
          'charm';

        const target =
          skill.primaryStat || 'hp';

        const opponentBaseStats = opponentAvatar.baseStats || opponentAvatar.card.stats;
        gainedScore =
          (Number(opponentBaseStats[first] || 0) +
            Number(opponentBaseStats[second] || 0)) *
          10;

        debuffs[target] =
          Math.ceil(
            opponentEffective[target] * 0.5,
          );

      } else if (
        skill.rule ===
        'y_total_score'
      ) {
        const opponentBaseStats = opponentAvatar.baseStats || opponentAvatar.card.stats;
        gainedScore =
          Object.values(
            opponentBaseStats,
          ).reduce(
            (sum, value) =>
              sum + Number(value || 0),
            0,
          ) * 10;

      } else if (
        skill.rule ===
        'y_response_score'
      ) {
        const selectedResponseStat = action.selectedBoostStat || 'hp';
        gainedScore =
          Math.max(
            0,
            effective[selectedResponseStat] - opponentEffective[selectedResponseStat],
          ) * 40;

      } else if (
        skill.rule ===
        'y_burst'
      ) {
        const selectedBoostStat =
          action.selectedBoostStat;

        if (selectedBoostStat) {
          gainedScore =
            effective[selectedBoostStat] * 10;
          nextOpponentAvatars =
            oppAvatars.map(
              (avatar, index) =>
                index === avatarIndex
                  ? {
                      ...avatar,
                      statBoost: {
                        ...(
                          avatar.statBoost ||
                          {}
                        ),
                        [selectedBoostStat]: ((opponentAvatar.statBoost?.[selectedBoostStat] || 1) * 2),
                      },
                    }
                  : avatar,
            );
        }

      } else if (
        skill.rule ===
        'y_crash'
      ) {
        const opponentBaseStats = opponentAvatar.baseStats || opponentAvatar.card.stats;
        const opponentRank = STAT_KEYS.slice().sort((a, b) => Number(opponentBaseStats[b] || 0) - Number(opponentBaseStats[a] || 0));
        gainedScore = (effective[opponentRank[2] || 'dexterity'] + effective[opponentRank[3] || 'charm']) * 10;
        Object.entries(
          myAvatar.baseStats || myAvatar.card.stats,
        ).forEach(
          ([key, value]) => {
            debuffs[
              key as StatKey
            ] =
              Math.ceil(
                Number(value || 0) * 0.25,
              );
          },
        );

      } else {
        // 旧形式との互換
        if (
          skill.type === 'score'
        ) {
          gainedScore =
            effective.hp * 10;
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
          debuffs.hp =
            effective.charm;
        }
      }

      // -----------------------------------------------------
      // デバフ適用
      // -----------------------------------------------------

      if (
        Object.keys(debuffs).length >
          0 &&
        !myAvatar.debuffImmune
      ) {
        nextMyAvatars =
          myAvatars.map(
            (avatar, index) =>
              index === avatarIndex
                ? {
                    ...avatar,
                    currentDebuff: {
                      hp:
                        avatar.currentDebuff.hp +
                        Number(
                          debuffs.hp || 0,
                        ),
                      intellect:
                        avatar.currentDebuff
                          .intellect +
                        Number(
                          debuffs.intellect ||
                            0,
                        ),
                      dexterity:
                        avatar.currentDebuff
                          .dexterity +
                        Number(
                          debuffs.dexterity ||
                            0,
                        ),
                      charm:
                        avatar.currentDebuff
                          .charm +
                        Number(
                          debuffs.charm || 0,
                        ),
                    },
                  }
                : avatar,
          );
      }

// 相手の技使用演出
const opponentSkillPreset = getPresetForCard(opponentAvatar.card);
const opponentSkillIndex = opponentAvatar.skills.findIndex(
  (item) => item.id === skill.id,
);

if (
  opponentSkillIndex >= 0 &&
  hasSkillSeal(
    opponentAvatar,
    opponentSkillIndex,
    getBattleTurnOrdinal(action.year, action.turnIndex),
  )
) {
  console.warn('封印中の相手技Actionを無視しました。', {
    skillId: skill.id,
    year: action.year,
    turnIndex: action.turnIndex,
  });
  return;
}

await playSkillPreResultEffect({
  effectKey: getCharacterSkillBattleEffect(
    opponentSkillPreset,
    opponentSkillIndex,
  ),
  characterName: opponentAvatar.card.userName,
  skillName: skill.name,
  dialogue: skill.description,
  colorHex: getBattleVisualColorHex(opponentAvatar.card),
  side: 'right',
});
addLog(`相手が「${skill.name}」を使用しました。`);

      // -----------------------------------------------------
      // 状態反映
      // -----------------------------------------------------

      setOppAvatars(
        nextOpponentAvatars,
      );

      setMyAvatars(
        nextMyAvatars,
      );

      
      // =====================================================
      // 相手の使用済み技を表示用に記録
      // =====================================================

      setCpuUsedSkillsByClass(
        (prev) => {
          const yearKey =
            String(action.year);

          const current =
            prev[yearKey] || [];

          if (skill.maxUsesPerClass > 0) {
            return {
              ...prev,
              [yearKey]: [
                ...current,
                skill.id,
              ],
            };
          }

          return prev;
        },
      );

      // =====================================================
      // ログ
      // =====================================================

      addLog(
        `相手が「${skill.name}」を使用しました。 +${gainedScore}スコア`,
      );

      // =====================================================
      // 重要
      // =====================================================
      //
      // スコア・turnIndex・currentYear・battlePhaseは
      // ここでは更新しない。
      //
      // 技を使用した本人がRoomの正式状態を更新し、
      // この画面はRoomのonSnapshotで結果を受け取る。
      // =====================================================

      return;
    }
  };

// =========================================================
// 常に最新のhandleIncomingActionをRefへ保存
// =========================================================

useEffect(() => {
  handleIncomingActionRef.current =
    handleIncomingAction;
});


  // ===== 先手・後手を決定（チーム確定後のみ） =====
  const decideFirstPlayer = async () => {
    if (
      battlePhase !== 'setup' ||
      isCoinTossing ||
      (isOnline
        ? (!onlineDecksConfirmed || !onlineClassPreparationConfirmed)
        : !deckConfirmed) ||
      (isOnline && !authReady)
    ) {
      return;
    }

    if (isOnline && !isHost) return;

    setIsCoinTossing(true);

    try {
      if (!isOnline) {
        await new Promise((resolve) => setTimeout(resolve, 650));
        const result: PlayerRole = Math.random() < 0.5 ? 'host' : 'guest';

        setFirstPlayer(result);
        setStartSeasonIdx(0);
        setPreparationMessage(
          `コイントス結果：${result === 'host' ? '自分' : 'CPU'}が先手です。\n春から${ROLE_NAMES[currentYear - 1]}戦を開始します。`,
        );
        addLog(`🪙 コイントス結果：${result === 'host' ? '自分' : 'CPU'}が先手です。`);
        setBattlePhase('battle');
        setTurnIndex(0);
        return;
      }

      const roomRef = doc(db, 'rooms', roomId);
      const result = await runTransaction(db, async (transaction) => {
        const snapshot = await transaction.get(roomRef);

        if (!snapshot.exists()) {
          throw new Error('ROOM_NOT_FOUND');
        }

        const data = snapshot.data() as Record<string, unknown>;
        const roomCurrentYear = Number(data.currentYear ?? 1);

        if (data.battlePhase !== 'setup') {
          throw new Error('ROOM_NOT_IN_SETUP');
        }

        if (data.firstPlayer !== null) {
          throw new Error('FIRST_PLAYER_ALREADY_SET');
        }

        if (roomCurrentYear !== currentYear) {
          throw new Error('YEAR_MISMATCH');
        }

        if (!data.guestUid) {
          throw new Error('OPPONENT_NOT_JOINED');
        }

        if (
          data.readyHost !== true ||
          data.readyGuest !== true ||
          typeof data.hostDeckId !== 'string' ||
          !data.hostDeckId ||
          typeof data.guestDeckId !== 'string' ||
          !data.guestDeckId
        ) {
          throw new Error('BOTH_DECKS_NOT_CONFIRMED');
        }

        if (
          Number(data.classReadyYearHost ?? 0) !== roomCurrentYear ||
          Number(data.classReadyYearGuest ?? 0) !== roomCurrentYear
        ) {
          throw new Error('BOTH_CLASS_PREP_NOT_CONFIRMED');
        }

        const firstPlayer: PlayerRole = Math.random() < 0.5 ? 'host' : 'guest';

        transaction.update(roomRef, {
          firstPlayer,
          startSeasonIdx: 0,
          turnIndex: 0,
          battlePhase: 'battle',
        });

        return firstPlayer;
      });

      setFirstPlayer(result);
      setStartSeasonIdx(0);
      setPreparationMessage(
        `🪙 コイントス結果：${result === playerRole ? '自分' : '相手'}が先手です。春から${ROLE_NAMES[currentYear - 1]}戦を開始します。`,
      );
      addLog(`🪙 コイントス結果：${result === playerRole ? '自分' : '相手'}が先手です。`);
    } catch (error) {
      console.error('コイントス結果の同期エラー:', error);
      addLog('⚠️ 先手決定に失敗しました。両者のチーム確定状態を確認してください。');
    } finally {
      setIsCoinTossing(false);
    }
  };

  // ===== 選択チームを確定（ここではまだ対戦を開始しない） =====
  const startBattleWithDeck = async () => {
    if (battlePhase !== 'setup' || !myDeckReady || deckConfirmed || (isOnline && !authReady)) return;
    // 中堅戦・大将戦ではチーム変更・再確定を行わない。
    if (currentYear > 1) return;

    if (!isOnline) {
      setDeckConfirmed(true);
      setClassReadyYearHost(1);
      setClassReadyYearGuest(1);
      setPreparationMessage('チームを確定しました。コイントスを行って先手・後手を決定してください。');
      addLog('このチームを対戦用チームとして確定しました。');
      return;
    }

    setDeckConfirmed(true);
    const field = playerRole === 'host' ? 'readyHost' : 'readyGuest';
    await updateDoc(doc(db, 'rooms', roomId), {
      [field]: true,
      [playerRole === 'host' ? 'hostDeckId' : 'guestDeckId']: activeDeckId,
      [playerRole === 'host' ? 'classReadyYearHost' : 'classReadyYearGuest']: 1,
    });
    setPreparationMessage('このチームでの準備が完了しました。両者のチーム確定後、ルーム作成者がコイントスを行います。');
  };

  // 両者の準備完了後、ホストがbattleへ移行
  useEffect(() => {
    if (!isOnline || !isHost || battlePhase !== 'setup' || !firstPlayer || startSeasonIdx === null) return;
    if (!onlineDecksConfirmed) return;
    // 現在準備しているクラス番号をそのまま引き継ぐ。
    // ここを 1 固定にすると、中堅戦・大将戦の開始時に先鋒戦へ巻き戻ってしまう。
    void updateDoc(doc(db, 'rooms', roomId), {
      battlePhase: 'battle',
      currentYear,
      turnIndex: 0,
    });
  }, [isOnline, isHost, battlePhase, firstPlayer, startSeasonIdx, onlineDecksConfirmed, currentYear, roomId]);

  // ===== クラス終了リザルト =====
  const showClassResult = (
    completedYear: number,
    finalMyScore: number,
    finalOpponentScore: number,
    finalMyTotal: number,
    finalOpponentTotal: number,
  ) => {
    setClassResult({
      completedYear,
      myScore: finalMyScore,
      opponentScore: finalOpponentScore,
      myTotal: finalMyTotal,
      opponentTotal: finalOpponentTotal,
    });
  };

  const prepareClassStart = async (targetYear: number) => {
    if (targetYear < 1 || targetYear > 3) return;

    setCurrentYear(targetYear);
    setTurnIndex(0);
    setFirstPlayer(null);
    setStartSeasonIdx(null);
    setBattlePhase('setup');

    setMyDeckReady(true);
    setDeckConfirmed(targetYear > 1 ? true : deckConfirmed);

    const nextDeckDefinition =
      activeDeckId
        ? loadDeckDefinition(activeDeckId)
        : null;

    const nextSupportState =
      resetLocalSupportDeck(
        nextDeckDefinition,
      );

    if (
      isOnline &&
      myPlayerRef &&
      myPrivatePlayerRef
    ) {
      try {
        await setDoc(
          myPrivatePlayerRef,
          {
            hand: nextSupportState.hand,
            deck: nextSupportState.deck,
          },
          {
            merge: true,
          },
        );

        await updateDoc(
          myPlayerRef,
          {
            handCount:
              nextSupportState.hand.length,
            deckCount:
              nextSupportState.deck.length,
            hand: deleteField(),
            deck: deleteField(),
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

    setUsedSkillsByClass((prev) => {
      const next = { ...prev };
      delete next[String(targetYear)];
      return next;
    });
    setCpuUsedSkillsByClass((prev) => {
      const next = { ...prev };
      delete next[String(targetYear)];
      return next;
    });

    setPreparationMessage(
      `${targetYear}年目の準備を進めています。チームは前のクラスから継続します。\n両者の準備完了後にコイントスを行います。`,
    );

    if (isOnline) {
      const classReadyField =
        playerRole === 'host'
          ? 'classReadyYearHost'
          : 'classReadyYearGuest';

      await updateDoc(
        doc(db, 'rooms', roomId),
        {
          [classReadyField]: targetYear,
        },
      );
    } else {
      setClassReadyYearHost(targetYear);
      setClassReadyYearGuest(targetYear);
    }
  };

  const continueAfterClassResult = async () => {
    if (
      !classResult ||
      (isOnline && !authReady) ||
      classTransitionInProgressRef.current
    ) {
      return;
    }

    classTransitionInProgressRef.current = true;

    try {
      const completedYear =
        classResult.completedYear;

      setClassResult(null);

      if (completedYear < 3) {
        await prepareClassStart(
          completedYear + 1,
        );
      } else {
        setBattlePhase('finished');
        setPreparationMessage('');
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
      classTransitionInProgressRef.current = false;
    }
  };

  useEffect(() => {
    if (!classResult || classResult.completedYear >= 3) return;

    const timer = window.setTimeout(() => {
      if (!classTransitionInProgressRef.current) {
        void continueAfterClassResult();
      }
    }, 1800);

    return () => window.clearTimeout(timer);
  }, [classResult]);

  useEffect(() => {
    if (
      !isOnline ||
      !roomId ||
      !authReady ||
      battlePhase !== 'setup' ||
      currentYear <= 1 ||
      classResult ||
      classTransitionInProgressRef.current
    ) {
      return;
    }

    const myClassReadyYear =
      playerRole === 'host'
        ? classReadyYearHost
        : classReadyYearGuest;

    if (myClassReadyYear === currentYear) {
      return;
    }

    classTransitionInProgressRef.current = true;

    void prepareClassStart(currentYear)
      .catch((error) => {
        console.error(
          '再入室時のクラス準備エラー:',
          error,
        );
        addLog(
          '⚠️ クラス準備の同期に失敗しました。',
        );
      })
      .finally(() => {
        classTransitionInProgressRef.current = false;
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

  // ===== 技発動後の次ターンを計算 =====
  const getNextTurnState = () => {
    if (turnIndex < 7) {
      return { currentYear, turnIndex: turnIndex + 1, nextPhase: 'battle' as const };
    }

    if (currentYear < 3) {
      // オンライン対戦ではクラスごとに準備フェイズへ戻す。
      // CPU対戦でも各クラス開始時に準備フェイズへ戻り、コイントスからやり直す。
      return {
        currentYear: currentYear + 1,
        turnIndex: 0,
        nextPhase: 'setup' as const,
      };
    }

    return { currentYear: 3, turnIndex: 7, nextPhase: 'finished' as const };
  };

  const getSkillCutInDialogue = (skill: Skill) => `「${skill.name}！」`;

  // ===== 技の発動・スコア集計・相手への干渉 =====
  // コーデ25種のプリセットに定義された技効果を、そのままゲーム処理へ反映します。
  const handleUseSkill = async (skill: Skill, selectedStatOverride?: StatKey) => {
    if (isBattlePreResultEffectPlaying()) return;
    if (!myTurn || battlePhase !== 'battle') return;

    if (
      (skill.rule === 'y_response_score' || skill.rule === 'y_burst') &&
      !selectedStatOverride
    ) {
      setSkillStatSelection({
        skillId: skill.id,
        mode: skill.rule === 'y_response_score' ? 'response' : 'burst',
      });
      return;
    }

    const usedKey = `${currentYear}`;
    const usedForClass = usedSkillsByClass[usedKey] || [];
    if (skill.maxUsesPerClass > 0 && usedForClass.filter((usedSkillId) => usedSkillId === skill.id).length >= skill.maxUsesPerClass) {
      addLog(`「${skill.name}」はこのクラスでは使用済みです。`);
      return;
    }

    const skillIndexForSealCheck = myActiveAvatar.skills.findIndex(
      (item) => item.id === skill.id,
    );
    if (
      skillIndexForSealCheck >= 0 &&
      hasSkillSeal(
        myActiveAvatar,
        skillIndexForSealCheck,
        getBattleTurnOrdinal(currentYear, turnIndex),
      )
    ) {
      addLog('このターンは技④が封印されています。');
      return;
    }

    const effective = getEffectiveStats(myActiveAvatar);
    const opponentEffective = getEffectiveStats(oppActiveAvatar);
    let gainedScore = 0;
    let debuffAmount = 0;
    let debuffStat: StatKey | null = null;
    let debuffs: Partial<Record<StatKey, number>> = {};
    let nextMyAvatars = myAvatars;
    let nextOppAvatars = oppAvatars;
    let selectedBoostStat: StatKey | null = null;

    const getStat = (stats: ReturnType<typeof getEffectiveStats>, key: StatKey) => stats[key];

    const baseStats = myActiveAvatar.baseStats || myActiveAvatar.card.stats;
    const opponentBaseStats = oppActiveAvatar.baseStats || oppActiveAvatar.card.stats;

    if (skill.rule === 'primary_score') {
      const stat = skill.primaryStat || 'hp';
      gainedScore = getStat(effective, stat) * 20;
    } else if (skill.rule === 'product_score') {
      const first = skill.primaryStat || 'intellect';
      const second = skill.secondaryStat || 'dexterity';
      gainedScore = getStat(effective, first) * getStat(effective, second);
    } else if (skill.rule === 'difference_score') {
      const stat = skill.primaryStat || 'hp';
      gainedScore = Math.max(0, getStat(effective, stat) - getStat(opponentEffective, stat)) * 40;
    } else if (skill.rule === 'combo_score_and_debuff') {
      const first = skill.secondaryStat || 'dexterity';
      const second = skill.tertiaryStat || 'charm';
      const target = skill.primaryStat || 'hp';
      gainedScore = (getStat(effective, first) + getStat(effective, second)) * 10;
      debuffStat = target;
      debuffAmount = Math.ceil(getStat(opponentEffective, target) * 0.5);
      debuffs[target] = debuffAmount;
      if (debuffAmount > 0 && !oppActiveAvatar.debuffImmune) {
        nextOppAvatars = oppAvatars.map((avatar, index) =>
          index === activeIndex
            ? { ...avatar, currentDebuff: { ...avatar.currentDebuff, [target]: avatar.currentDebuff[target] + debuffAmount } }
            : avatar,
        );
      }
    } else if (skill.rule === 'y_total_score') {
      gainedScore = Object.values(effective).reduce((sum, value) => sum + Number(value || 0), 0) * 10;
    } else if (skill.rule === 'y_response_score') {
      selectedBoostStat = selectedStatOverride || null;
      if (!selectedBoostStat) return;
      gainedScore = Math.max(0, getStat(effective, selectedBoostStat) - getStat(opponentEffective, selectedBoostStat)) * 40;
    } else if (skill.rule === 'y_burst') {
      selectedBoostStat = selectedStatOverride || null;
      if (!selectedBoostStat) return;
      const boostStat = selectedBoostStat;
      gainedScore = getStat(effective, boostStat) * 10;
      const currentBaseStats = myActiveAvatar.baseStats || myActiveAvatar.stats;
      const nextBaseValue = Number(currentBaseStats[boostStat] || 0) * 2;
      nextMyAvatars = myAvatars.map((avatar, index) =>
        index === activeIndex
          ? {
              ...avatar,
              stats: { ...avatar.stats, [boostStat]: nextBaseValue },
              baseStats: { ...((avatar.baseStats || avatar.stats)), [boostStat]: nextBaseValue },
            }
          : avatar,
      );
    } else if (skill.rule === 'y_crash') {
      const baseRank = STAT_KEYS.slice().sort((a, b) => Number(baseStats[b] || 0) - Number(baseStats[a] || 0));
      const scoreThird = getStat(effective, baseRank[2]);
      const scoreFourth = getStat(effective, baseRank[3]);
      gainedScore = (scoreThird + scoreFourth) * 10;
      Object.entries(opponentBaseStats).forEach(([key, value]) => {
        const stat = key as StatKey;
        debuffs[stat] = Math.ceil(Number(value || 0) * 0.25);
      });
      if (!oppActiveAvatar.debuffImmune) {
        nextOppAvatars = oppAvatars.map((avatar, index) =>
          index === activeIndex
            ? {
                ...avatar,
                currentDebuff: {
                  hp: avatar.currentDebuff.hp + (debuffs.hp || 0),
                  intellect: avatar.currentDebuff.intellect + (debuffs.intellect || 0),
                  dexterity: avatar.currentDebuff.dexterity + (debuffs.dexterity || 0),
                  charm: avatar.currentDebuff.charm + (debuffs.charm || 0),
                },
              }
            : avatar,
        );
      }
    } else {
      // 旧形式の技データを持つカードとの互換処理。
      if (skill.type === 'score') gainedScore = effective.hp * 10;
      if (skill.type === 'draw_score') gainedScore = effective.intellect;
      if (skill.type === 'debuff_attack') {
        debuffStat = 'hp';
        debuffAmount = effective.charm;
        debuffs.hp = debuffAmount;
      }
    }

    const nextUsed = {
      ...usedSkillsByClass,
      [usedKey]:
        skill.maxUsesPerClass > 0
          ? [...usedForClass, skill.id]
          : usedForClass,
    };

    const next = getNextTurnState();

    const skillPreset = getPresetForCard(myActiveAvatar.card);
    const skillIndex = myActiveAvatar.skills.findIndex(
      (item) => item.id === skill.id,
    );

    // ===== CPU対戦：Firebaseを使わずローカル状態だけを更新 =====
    if (!isOnline) {
      await playSkillPreResultEffect({
        effectKey: getCharacterSkillBattleEffect(
          skillPreset,
          skillIndex,
        ),
        characterName: myActiveAvatar.card.userName,
        skillName: skill.name,
        dialogue: getSkillCutInDialogue(skill),
        colorHex: getBattleVisualColorHex(myActiveAvatar.card),
        side: 'left',
      });
      const nextScores = [...myClassScores];
      nextScores[activeIndex] = (nextScores[activeIndex] || 0) + gainedScore;
      setMyClassScores(nextScores);
      if (playerRole === 'host') setHostTotalScore((prev) => prev + gainedScore);
      else setGuestTotalScore((prev) => prev + gainedScore);
      const localNextMyAvatars =
        next.currentYear !== currentYear
          ? clearSupportEffectsFromAvatars(nextMyAvatars)
          : nextMyAvatars;
      const localNextOppAvatars =
        next.currentYear !== currentYear
          ? clearSupportEffectsFromAvatars(nextOppAvatars)
          : nextOppAvatars;

      setMyAvatars(localNextMyAvatars);
      setOppAvatars(localNextOppAvatars);
      setUsedSkillsByClass(nextUsed);
      addLog(`「${skill.name}」発動！`);
      if (Object.keys(debuffs).length > 0 && !oppActiveAvatar.debuffImmune) {
        const detail = Object.entries(debuffs)
          .map(([key, value]) => `${STAT_LABELS[key as StatKey]} -${value}`)
          .join(' / ');
        addLog(`相手へのデバフ：${detail}`);
      }

      setCurrentYear(next.currentYear);
      setTurnIndex(next.turnIndex);
      setBattlePhase(next.nextPhase);
      if (next.nextPhase === 'battle') {
        setFirstPlayer('host');
        setStartSeasonIdx(0);
      } else if (next.nextPhase === 'setup') {
        setFirstPlayer(null);
        setStartSeasonIdx(null);
        setMyDeckReady(false);
        setPreparationMessage(next.currentYear <= 3 ? `${next.currentYear}年目の準備を開始します。コイントスを行ってください。` : '');
      }
      if (next.currentYear !== currentYear) {
        setUsedSkillsByClass({});
        setCpuUsedSkillsByClass({});
      }
      return;
    }

    // =====================================================
    // オンライン対戦
    // =====================================================

// =====================================================
// 技の二重送信防止
// =====================================================
//
// API送信中は、同じターンの別の技送信を受け付けない。
// =====================================================

if (
  skillSubmitInProgressRef.current
) {
  return;
}

skillSubmitInProgressRef.current =
  true;

const skillEffectPromise = playSkillPreResultEffect({
  effectKey: getCharacterSkillBattleEffect(
    skillPreset,
    skillIndex,
  ),
  characterName: myActiveAvatar.card.userName,
  skillName: skill.name,
  dialogue: getSkillCutInDialogue(skill),
  colorHex: getBattleVisualColorHex(myActiveAvatar.card),
  side: 'left',
});

const actionId =
  `${Date.now()}-${Math.random()
    .toString(36)
    .slice(2)}`;

let actionSubmitted = false;

try {
  actionSubmitted =
    await submitBattleAction({
      actionId,

      type: 'USE_SKILL',

      year:
        currentYear,

      turnIndex,

      avatarIndex:
        activeIndex,

      skillId:
        skill.id,

      ...(selectedBoostStat
        ? {
            selectedBoostStat,
          }
        : {}),
    });
} finally {
  skillSubmitInProgressRef.current =
    false;
}

if (!actionSubmitted) {
  addLog(
    `「${skill.name}」の送信に失敗しました。`,
  );

  return;
}

    await skillEffectPromise;

    const onlineNextMyAvatars =
      next.currentYear !== currentYear
        ? clearSupportEffectsFromAvatars(nextMyAvatars)
        : nextMyAvatars;
    const onlineNextOppAvatars =
      next.currentYear !== currentYear
        ? clearSupportEffectsFromAvatars(nextOppAvatars)
        : nextOppAvatars;

    setMyAvatars(onlineNextMyAvatars);
    setOppAvatars(onlineNextOppAvatars);

    // =====================================================
    // ローカル表示も即時更新
    // =====================================================

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

    }

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
        false,
      );

      setPreparationMessage(
        next.currentYear <= 3
          ? `${next.currentYear}年目の準備を開始します。コイントスを行ってください。`
          : '',
      );
    }

    // =====================================================
    // クラス切り替え時は使用済み技をリセット
    // =====================================================

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

    // =====================================================
    // ログ
    // =====================================================

    addLog(
      `「${skill.name}」発動！`,
    );

    if (
      Object.keys(debuffs).length >
        0 &&
      !oppActiveAvatar.debuffImmune
    ) {
      const detail =
        Object.entries(debuffs)
          .map(
            ([key, value]) =>
              `${STAT_LABELS[
                key as StatKey
              ]} -${value}`,
          )
          .join(' / ');

      addLog(
        `相手へのデバフ：${detail}`,
      );
    }
  };

  useEffect(() => {
    setSelectedSupportCardIndex(null);
    setSkillStatSelection(null);
  }, [currentYear, turnIndex]);

  useEffect(() => {
    return () => {
      if (supportDealTimerRef.current !== null) window.clearTimeout(supportDealTimerRef.current);
      if (supportRevealTimerRef.current !== null) window.clearTimeout(supportRevealTimerRef.current);
    };
  }, []);

  // ===== サポートカードの公式エモーション効果 =====
  const getEmotionPresetForCard = (card: SupportCard) => {
    const withPreset = card as SupportCard & { presetId?: string };
    const presetId =
      withPreset.presetId ||
      (card.id.match(/emo_\d{2}$/)?.[0]) ||
      (card.id.startsWith(VIRTUAL_SUPPORT_PREFIX)
        ? card.id.slice(VIRTUAL_SUPPORT_PREFIX.length)
        : undefined);
    return presetId
      ? EMOTION_PRESETS.find((emotion) => emotion.id === presetId)
      : EMOTION_PRESETS.find((emotion) => emotion.name === card.name);
  };

  const getSupportImage = (card: SupportCard) => {
    const withImage = card as SupportCard & { imageDataUrl?: string };
    if (withImage.imageDataUrl) return withImage.imageDataUrl;
    const preset = getEmotionPresetForCard(card);
    return preset ? getVirtualSupportImageDataUrl(preset) : undefined;
  };

  const getSupportFlavorText = (card: SupportCard) =>
    (card as SupportCard & SupportCardDisplayMeta).flavorText || '';

  const DEFAULT_SUPPORT_COLOR_HEX = '#22D3EE';

  const getSupportColorHex = (card: SupportCard) =>
    (card as SupportCard & SupportCardDisplayMeta).colorHex ||
    DEFAULT_SUPPORT_COLOR_HEX;

  const getSupportDetailDescription = (preset: EmotionPreset) => {
    const targetLabel =
      preset.target === '自分'
        ? '自分'
        : preset.target === '相手'
          ? '相手'
          : '自分と相手';
    const durationLabel =
      preset.duration === '一時'
        ? '次の自分のターンまで'
        : 'このクラス中';
    const amount = parseEmotionAmount(preset.effectAmount);
    const absoluteAmount = Math.abs(amount);
    const direction = amount >= 0 ? '増加' : '減少';

    if (preset.effectCategory === '情熱') {
      return `${targetLabel}の情熱を${durationLabel}${absoluteAmount}${direction}させる。${preset.note?.includes('0') ? '（0は下回らない）' : ''}`;
    }
    if (preset.effectCategory === '知性') {
      return `${targetLabel}の知性を${durationLabel}${absoluteAmount}${direction}させる。${preset.note?.includes('0') ? '（0は下回らない）' : ''}`;
    }
    if (preset.effectCategory === '技能') {
      return `${targetLabel}の技能を${durationLabel}${absoluteAmount}${direction}させる。${preset.note?.includes('0') ? '（0は下回らない）' : ''}`;
    }
    if (preset.effectCategory === '愛嬌') {
      return `${targetLabel}の愛嬌を${durationLabel}${absoluteAmount}${direction}させる。${preset.note?.includes('0') ? '（0は下回らない）' : ''}`;
    }
    if (preset.effectCategory === '全ステータス') {
      return `${targetLabel}の全ステータスを${durationLabel}${absoluteAmount}${direction}させる。${preset.note?.includes('0') ? '（0は下回らない）' : ''}`;
    }
    if (preset.effectCategory === 'スコア') {
      return preset.target === '自分'
        ? `使用時に自分の現在クラスのスコアを${absoluteAmount}増やす。`
        : `使用時に相手の現在クラスのスコアを${absoluteAmount}減らす。${preset.note?.includes('0') ? '（0は下回らない）' : ''}`;
    }
    if (preset.effectCategory === 'サポートカード使用数') {
      if (preset.statEffect.includes('制限されない')) {
        return `${targetLabel}のサポートカード使用数を制限しない。${durationLabel}有効。`;
      }
      return `${targetLabel}がこのターンに使用できるサポートカードを${preset.effectAmount || '指定枚数'}までに制限する。${durationLabel}有効。`;
    }
    if (preset.effectCategory === 'ドロー') {
      if (preset.duration === '永続') {
        return `${targetLabel}は各ターン、カードを${absoluteAmount}枚追加でドローする。このクラス中有効。`;
      }
      return `${targetLabel}はカードを${absoluteAmount}枚追加でドローする。`;
    }
    if (preset.effectCategory === 'ステータスコピー・平均化') {
      return `${preset.description}${preset.duration === '一時' ? '次の自分のターンまで有効。' : 'このクラス中有効。'}`;
    }
    if (preset.effectCategory === '効果反射') {
      return `${preset.description}${preset.note ? `（${preset.note}）` : ''}`;
    }
    if (preset.effectCategory === '技封印') {
      return `${targetLabel}の技④の使用を${durationLabel}封印する。`;
    }
    return preset.description;
  };

  const parseEmotionAmount = (value?: string) => {
    const match = value?.match(/[-+]?\d+(?:\.\d+)?/);
    return match ? Number(match[0]) : 0;
  };

  const appendSupportAvatarEffect = (
    avatar: BattleAvatar,
    effect: SupportAvatarEffectState,
    turnOrdinal: number,
  ): BattleAvatar => ({
    ...avatar,
    supportEffects: [
      ...(avatar.supportEffects || []).filter((item) =>
        isSupportEffectActive(item, turnOrdinal),
      ),
      effect,
    ],
  });

  const appendSupportControlEffect = (
    avatar: BattleAvatar,
    effect: SupportControlEffectState,
    turnOrdinal: number,
  ): BattleAvatar => ({
    ...avatar,
    supportControlEffects: [
      ...(avatar.supportControlEffects || []).filter((item) =>
        isSupportEffectActive(item, turnOrdinal),
      ),
      effect,
    ],
  });

  const applySupportControlToAllAvatars = (
    avatars: BattleAvatar[],
    effect: SupportControlEffectState,
    turnOrdinal: number,
  ) =>
    avatars.map((avatar) =>
      appendSupportControlEffect(avatar, effect, turnOrdinal),
    );

  const cloneSupportDeltaEffects = (
    effects: SupportAvatarEffectState[] | undefined,
    predicate: (delta: number) => boolean,
    turnOrdinal: number,
  ): SupportAvatarEffectState[] =>
    (effects || [])
      .filter((effect) => isSupportEffectActive(effect, turnOrdinal))
      .map((effect): SupportAvatarEffectState | null => {
        const filtered: Partial<Record<StatKey, number>> = {};
        for (const stat of STAT_KEYS) {
          const value = Number(effect.statDelta?.[stat] || 0);
          if (value !== 0 && predicate(value)) {
            filtered[stat] = value;
          }
        }
        if (!Object.keys(filtered).length) return null;
        return {
          ...effect,
          id: `${effect.id}_reflect_${Math.random().toString(36).slice(2)}`,
          statDelta: filtered,
        };
      })
      .filter((effect): effect is SupportAvatarEffectState => effect !== null);

  const applyEmotionToPair = (
    card: SupportCard,
    actor: BattleAvatar,
    target: BattleAvatar,
    turnOrdinal = getBattleTurnOrdinal(currentYear, turnIndex),
  ) => {
    const preset = getEmotionPresetForCard(card);
    if (!preset) {
      return {
        actor,
        target,
        scoreDelta: 0,
        targetScoreDelta: 0,
        extraDraw: 0,
        actorSupportControlEffect: undefined as SupportControlEffectState | undefined,
        targetSupportControlEffect: undefined as SupportControlEffectState | undefined,
      };
    }

    const amount = parseEmotionAmount(preset.effectAmount);
    const statMap: Partial<Record<EmotionPreset['effectCategory'], StatKey>> = {
      '情熱': 'hp',
      '知性': 'intellect',
      '技能': 'dexterity',
      '愛嬌': 'charm',
    };

    let nextActor: BattleAvatar = {
      ...actor,
      supportEffects: [...(actor.supportEffects || [])],
    };
    let nextTarget: BattleAvatar = {
      ...target,
      supportEffects: [...(target.supportEffects || [])],
    };
    let scoreDelta = 0;
    let targetScoreDelta = 0;
    let extraDraw = 0;
    let actorSupportControlEffect: SupportControlEffectState | undefined;
    let targetSupportControlEffect: SupportControlEffectState | undefined;

    const addActorAvatarEffect = (
      effect: Omit<SupportAvatarEffectState, 'id'>,
    ) => {
      nextActor = appendSupportAvatarEffect(
        nextActor,
        { ...effect, id: createSupportEffectId(preset.id) },
        turnOrdinal,
      );
    };

    const addTargetAvatarEffect = (
      effect: Omit<SupportAvatarEffectState, 'id'>,
    ) => {
      nextTarget = appendSupportAvatarEffect(
        nextTarget,
        { ...effect, id: createSupportEffectId(preset.id) },
        turnOrdinal,
      );
    };

    const makeControlEffect = (
      kind: SupportControlEffectState['kind'],
      appliesToOpponent: boolean,
    ): SupportControlEffectState => {
      const baseEffect: SupportControlEffectState = {
        id: createSupportEffectId(preset.id),
        sourcePresetId: preset.id,
        duration: preset.duration,
        kind,
        expiresAtTurnOrdinal: getSupportEffectExpiration(
          preset,
          turnOrdinal,
          appliesToOpponent,
        ),
      };

      if (kind === 'limit') {
        return {
          ...baseEffect,
          maxUsesPerTurn: Math.max(0, amount || 1),
        };
      }

      if (kind === 'extra_draw') {
        return {
          ...baseEffect,
          extraDrawPerTurn: Math.max(0, amount || 1),
        };
      }

      return baseEffect;
    };

    if (preset.effectCategory === '全ステータス') {
      const all = {
        hp: amount,
        intellect: amount,
        dexterity: amount,
        charm: amount,
      };
      if (preset.target === '自分') {
        addActorAvatarEffect({
          sourcePresetId: preset.id,
          statDelta: all,
          expiresAtTurnOrdinal: getSupportEffectExpiration(preset, turnOrdinal, false),
        });
      }
      if (preset.target === '相手') {
        addTargetAvatarEffect({
          sourcePresetId: preset.id,
          statDelta: all,
          expiresAtTurnOrdinal: getSupportEffectExpiration(preset, turnOrdinal, true),
        });
      }
    } else if (statMap[preset.effectCategory]) {
      const stat = statMap[preset.effectCategory] as StatKey;
      if (preset.target === '自分') {
        addActorAvatarEffect({
          sourcePresetId: preset.id,
          statDelta: { [stat]: amount },
          expiresAtTurnOrdinal: getSupportEffectExpiration(preset, turnOrdinal, false),
        });
      }
      if (preset.target === '相手') {
        addTargetAvatarEffect({
          sourcePresetId: preset.id,
          statDelta: { [stat]: amount },
          expiresAtTurnOrdinal: getSupportEffectExpiration(preset, turnOrdinal, true),
        });
      }
    } else if (preset.effectCategory === 'スコア') {
      if (preset.target === '自分') {
        scoreDelta = Math.abs(amount);
      } else if (preset.target === '相手') {
        targetScoreDelta = -Math.abs(amount);
      }
    } else if (preset.effectCategory === 'サポートカード使用数') {
      if (preset.statEffect.includes('制限されない')) {
        if (preset.target === '自分') {
          actorSupportControlEffect = makeControlEffect('free', false);
        }
      } else if (preset.target === '相手') {
        targetSupportControlEffect = makeControlEffect('limit', true);
      }
    } else if (preset.effectCategory === 'ドロー') {
      extraDraw = Math.max(0, amount || 1);
      if (preset.duration === '永続') {
        actorSupportControlEffect = makeControlEffect('extra_draw', false);
      }
    } else if (preset.effectCategory === 'ステータスコピー・平均化') {
      const actorEffective = getEffectiveStats(actor, turnOrdinal);
      const targetEffective = getEffectiveStats(target, turnOrdinal);

      if (preset.id === 'emo_29') {
        const highest = Math.max(...Object.values(targetEffective));
        const key = STAT_KEYS.find((item) => targetEffective[item] === highest) || 'hp';
        addActorAvatarEffect({
          sourcePresetId: preset.id,
          statOverride: { [key]: highest },
          expiresAtTurnOrdinal: getSupportEffectExpiration(preset, turnOrdinal, false),
        });
      } else if (preset.id === 'emo_30') {
        const lowest = Math.min(...Object.values(actorEffective));
        const key = STAT_KEYS.find((item) => actorEffective[item] === lowest) || 'hp';
        addTargetAvatarEffect({
          sourcePresetId: preset.id,
          statOverride: { [key]: lowest },
          expiresAtTurnOrdinal: getSupportEffectExpiration(preset, turnOrdinal, true),
        });
      } else if (preset.id === 'emo_31') {
        const average = Math.round(
          Object.values(actorEffective).reduce((sum, value) => sum + value, 0) / 4,
        );
        addActorAvatarEffect({
          sourcePresetId: preset.id,
          statOverride: {
            hp: average,
            intellect: average,
            dexterity: average,
            charm: average,
          },
          expiresAtTurnOrdinal: getSupportEffectExpiration(preset, turnOrdinal, false),
        });
      } else if (preset.id === 'emo_32') {
        const average = Math.round(
          Object.values(targetEffective).reduce((sum, value) => sum + value, 0) / 4,
        );
        addTargetAvatarEffect({
          sourcePresetId: preset.id,
          statOverride: {
            hp: average,
            intellect: average,
            dexterity: average,
            charm: average,
          },
          expiresAtTurnOrdinal: getSupportEffectExpiration(preset, turnOrdinal, true),
        });
      }
    } else if (preset.effectCategory === '効果反射') {
      if (preset.id === 'emo_33') {
        const sourceEffects = cloneSupportDeltaEffects(
          nextActor.supportEffects,
          (delta) => delta < 0,
          turnOrdinal,
        );
        const reflectedSourceIds = new Set(
          sourceEffects.map((effect) => effect.id.split('_reflect_')[0]),
        );
        nextActor = {
          ...nextActor,
          supportEffects: (nextActor.supportEffects || []).filter(
            (effect) => !reflectedSourceIds.has(effect.id),
          ),
        };
        for (const effect of sourceEffects) {
          nextTarget = appendSupportAvatarEffect(nextTarget, effect, turnOrdinal);
        }
      } else if (preset.id === 'emo_34') {
        const sourceEffects = cloneSupportDeltaEffects(
          nextTarget.supportEffects,
          (delta) => delta > 0,
          turnOrdinal,
        );
        const reflectedSourceIds = new Set(
          sourceEffects.map((effect) => effect.id.split('_reflect_')[0]),
        );
        nextTarget = {
          ...nextTarget,
          supportEffects: (nextTarget.supportEffects || []).filter(
            (effect) => !reflectedSourceIds.has(effect.id),
          ),
        };
        for (const effect of sourceEffects) {
          nextActor = appendSupportAvatarEffect(nextActor, effect, turnOrdinal);
        }
      }
    } else if (preset.effectCategory === '技封印') {
      if (preset.target === '相手') {
        addTargetAvatarEffect({
          sourcePresetId: preset.id,
          skillSealIndex: 3,
          expiresAtTurnOrdinal: getSupportEffectExpiration(preset, turnOrdinal, true),
        });
      }
    }

    return {
      actor: nextActor,
      target: nextTarget,
      scoreDelta,
      targetScoreDelta,
      extraDraw,
      actorSupportControlEffect,
      targetSupportControlEffect,
    };
  };

  // ===== CPUサポートカード選択 =====
  // CPUは「必ず使う」ではなく、手札と状況を見て1枚だけ先に使います。
  // 1) 情熱・知性・技能・愛嬌の減少系は、相手の該当値が高いほど優先。
  // 2) 自分の上昇系は、自分の該当値が低いほど優先。
  // 3) ドロー系は手札が少ないときに優先。
  // 4) 候補がなければ、手札からランダムに1枚を選択。
  const chooseCpuSupport = (hand: SupportCard[], cpuAvatar: BattleAvatar, playerAvatar: BattleAvatar) => {
    if (!hand.length) return null;
    const cpuTurnOrdinal = getBattleTurnOrdinal(currentYear, turnIndex);
    const supportLimit = getSupportUsageLimitFromEffects(
      cpuAvatar.supportControlEffects,
      cpuTurnOrdinal,
    );
    const supportUseCount = getSupportUseCountFromUsedSkills(
      cpuUsedSkillsByClass,
      currentYear,
      turnIndex,
    );
    const hasFreeSupportCard = hand.some((card) => {
      const presetId = card.id.startsWith(VIRTUAL_SUPPORT_PREFIX)
        ? card.id.slice(VIRTUAL_SUPPORT_PREFIX.length)
        : undefined;
      const preset = presetId
        ? EMOTION_PRESETS.find((emotion) => emotion.id === presetId)
        : EMOTION_PRESETS.find((emotion) => emotion.name === card.name);
      return Boolean(
        preset?.effectCategory === 'サポートカード使用数' &&
          preset.statEffect.includes('制限されない'),
      );
    });
    if (
      Number.isFinite(supportLimit) &&
      supportUseCount >= supportLimit &&
      !hasFreeSupportCard
    ) return null;
    const scored = hand.map((card, index) => {
      const presetId = card.id.startsWith(VIRTUAL_SUPPORT_PREFIX)
        ? card.id.slice(VIRTUAL_SUPPORT_PREFIX.length)
        : undefined;
      const preset = presetId ? EMOTION_PRESETS.find((emotion) => emotion.id === presetId) : EMOTION_PRESETS.find((emotion) => emotion.name === card.name);
      if (!preset) return { card, index, score: 1 + Math.random() * 3 };
      let score = 2 + Math.random() * 4;
      const amount = Number((preset.effectAmount || '').replace(/[^0-9.-]/g, '')) || 0;
      const targetStat: StatKey | null =
        preset.effectCategory === '情熱' ? 'hp' :
        preset.effectCategory === '知性' ? 'intellect' :
        preset.effectCategory === '技能' ? 'dexterity' :
        preset.effectCategory === '愛嬌' ? 'charm' : null;
      if (targetStat) {
        if (preset.target === '相手') score += playerAvatar.stats[targetStat] * (amount / 20) * 0.08;
        if (preset.target === '自分') score += Math.max(0, 50 - cpuAvatar.stats[targetStat]) * (amount / 20) * 0.08;
      }
      if (preset.effectCategory === 'ドロー') score += 8;
      if (preset.effectCategory === 'スコア') score += 7;
      if (preset.effectCategory === '技封印') score += playerAvatar.skills.length > 0 ? 6 : 0;
      return { card, index, score };
    });
    scored.sort((a, b) => b.score - a.score);
    return scored[0];
  };

  const applyCpuSupport = (
    card: SupportCard,
    cpuAvatar: BattleAvatar,
    playerAvatar: BattleAvatar,
  ) => {
    const applied = applyEmotionToPair(
      card,
      cpuAvatar,
      playerAvatar,
    );
    return {
      cpuAvatar: applied.actor,
      playerAvatar: applied.target,
      extraDraw: applied.extraDraw,
      scoreDelta: applied.scoreDelta,
      actorSupportControlEffect: applied.actorSupportControlEffect,
      targetSupportControlEffect: applied.targetSupportControlEffect,
      targetScoreDelta: applied.targetScoreDelta,
    };
  };

  // ===== CPUの自動ターン =====
  // CPUは準備画面の裏で構築した3キャラ＋18枚チームを使い、
  // 自分の手番では現在キャラの固有技から1つ選んで自動発動します。
  const cpuTurnRef = useRef<string>('');
  useEffect(() => {
    if (isOnline || battlePhase !== 'battle' || myTurn) return;

    const key = `cpu-${currentYear}-${turnIndex}`;
    if (cpuTurnRef.current === key) return;
    cpuTurnRef.current = key;

    const timer = window.setTimeout(() => {
      void (async () => {
        // CPUの手番は「ドロー → サポート使用 → 技」の順。
      const cpuTurnOrdinal = getBattleTurnOrdinal(currentYear, turnIndex);
      let workingCpuHand = [...cpuHand];
      let workingCpuDeck = [...cpuDeck];

      const cpuDrawCount = Math.min(
        1 + getAdditionalDrawFromEffects(
          oppActiveAvatar.supportControlEffects,
          cpuTurnOrdinal,
        ),
        Math.max(0, MAX_HAND - workingCpuHand.length),
        workingCpuDeck.length,
      );
      if (cpuDrawCount > 0) {
        const drawnCards = workingCpuDeck.slice(0, cpuDrawCount);
        workingCpuHand = [...workingCpuHand, ...drawnCards];
        workingCpuDeck = workingCpuDeck.slice(cpuDrawCount);
        setCpuHand(workingCpuHand);
        setCpuDeck(workingCpuDeck);
        addLog(`CPUがサポートカードを${cpuDrawCount}枚ドローしました。`);
      }

      const cpuHandForDecision = workingCpuHand;
      let workingCpu = oppActiveAvatar;
      let workingPlayer = myActiveAvatar;
      let cpuSupportScoreDelta = 0;
      const cpuSupportUseCount = getSupportUseCountFromUsedSkills(
        cpuUsedSkillsByClass,
        currentYear,
        turnIndex,
      );
      const supportChoice = chooseCpuSupport(cpuHandForDecision, workingCpu, workingPlayer);
      if (supportChoice) {
        const applied = applyCpuSupport(supportChoice.card, workingCpu, workingPlayer);
        workingCpu = applied.cpuAvatar;
        workingPlayer = applied.playerAvatar;

        const supportPreset = getEmotionPresetForCard(supportChoice.card);
        await playSupportPreResultEffect({
          effectKey: getSupportBattleEffect(supportPreset),
          cardName: supportChoice.card.name,
          imageUrl: getSupportImage(supportChoice.card),
          targetPositions: getSupportTargetPositions(),
          dialogue: supportPreset?.description,
          colorHex: undefined,
          target: getSupportBattleTarget(supportPreset, false),
        });

        workingCpuHand = workingCpuHand.filter((_, index) => index !== supportChoice.index);
        addLog(`CPUがサポート「${supportChoice.card.name}」を使用しました。`);
        const cpuAvatarsAfterSupport =
          applied.actorSupportControlEffect
            ? applySupportControlToAllAvatars(
                oppAvatars,
                applied.actorSupportControlEffect,
                cpuTurnOrdinal,
              ).map((avatar, index) => index === activeIndex ? workingCpu : avatar)
            : oppAvatars.map((avatar, index) => index === activeIndex ? workingCpu : avatar);
        const playerAvatarsAfterSupport =
          applied.targetSupportControlEffect
            ? applySupportControlToAllAvatars(
                myAvatars,
                applied.targetSupportControlEffect,
                cpuTurnOrdinal,
              ).map((avatar, index) => index === activeIndex ? workingPlayer : avatar)
            : myAvatars.map((avatar, index) => index === activeIndex ? workingPlayer : avatar);
        setOppAvatars(cpuAvatarsAfterSupport);
        setMyAvatars(playerAvatarsAfterSupport);
        workingCpu = cpuAvatarsAfterSupport[activeIndex] || workingCpu;
        workingPlayer = playerAvatarsAfterSupport[activeIndex] || workingPlayer;
        setCpuUsedSkillsByClass(
          setSupportUseCountInUsedSkills(
            cpuUsedSkillsByClass,
            currentYear,
            turnIndex,
            cpuSupportUseCount + 1,
          ),
        );
        if (applied.extraDraw > 0) {
          const drawCount = Math.min(
            applied.extraDraw,
            Math.max(0, MAX_HAND - workingCpuHand.length),
            workingCpuDeck.length,
          );
          const drawnSupportCards = workingCpuDeck.slice(0, drawCount);
          workingCpuHand = [...workingCpuHand, ...drawnSupportCards];
          workingCpuDeck = workingCpuDeck.slice(drawCount);
        }

        setCpuHand(workingCpuHand);
        setCpuDeck(workingCpuDeck);
        cpuSupportScoreDelta = applied.scoreDelta;
        if (applied.scoreDelta !== 0) {
          setOppClassScores((prev) => {
            const next = [...prev];
            next[activeIndex] = Math.max(0, (next[activeIndex] || 0) + applied.scoreDelta);
            return next;
          });
          setGuestTotalScore((prev) => Math.max(0, prev + applied.scoreDelta));
        }
        if (applied.targetScoreDelta !== 0) {
          setMyClassScores((prev) => {
            const next = [...prev];
            next[activeIndex] = Math.max(0, (next[activeIndex] || 0) + applied.targetScoreDelta);
            return next;
          });
          if (playerRole === 'host') {
            setHostTotalScore((prev) => Math.max(0, prev + applied.targetScoreDelta));
          } else {
            setGuestTotalScore((prev) => Math.max(0, prev + applied.targetScoreDelta));
          }
        }
      }

      const usedKey = `${currentYear}`;
      const usedForClass = cpuUsedSkillsByClass[usedKey] || [];
      const available = workingCpu.skills.filter(
        (skill) => skill.maxUsesPerClass === 0 || usedForClass.filter((usedSkillId) => usedSkillId === skill.id).length < skill.maxUsesPerClass,
      );
      const skill = available[available.length - 1] || workingCpu.skills[0];
      if (!skill) return;

      const effective = getEffectiveStats(workingCpu);
      const opponentEffective = getEffectiveStats(workingPlayer);
      let gainedScore = 0;
      let debuffs: Partial<Record<StatKey, number>> = {};

      const cpuBaseStats = workingCpu.baseStats || workingCpu.card.stats;
      const playerBaseStats = workingPlayer.baseStats || workingPlayer.card.stats;
      const cpuRank = STAT_KEYS.slice().sort((a, b) => Number(cpuBaseStats[b] || 0) - Number(cpuBaseStats[a] || 0));
      let cpuBurstStat: StatKey | null = null;

      if (skill.rule === 'primary_score') {
        gainedScore = effective[skill.primaryStat || 'hp'] * 20;
      } else if (skill.rule === 'product_score') {
        gainedScore = effective[skill.primaryStat || 'intellect'] * effective[skill.secondaryStat || 'dexterity'];
      } else if (skill.rule === 'difference_score') {
        const stat = skill.primaryStat || 'hp';
        gainedScore = Math.max(0, effective[stat] - opponentEffective[stat]) * 40;
      } else if (skill.rule === 'combo_score_and_debuff') {
        const first = skill.secondaryStat || 'dexterity';
        const second = skill.tertiaryStat || 'charm';
        const target = skill.primaryStat || 'hp';
        gainedScore = (effective[first] + effective[second]) * 10;
        debuffs[target] = Math.ceil(opponentEffective[target] * 0.5);
      } else if (skill.rule === 'y_total_score') {
        gainedScore = Object.values(effective).reduce((sum, value) => sum + Number(value || 0), 0) * 10;
      } else if (skill.rule === 'y_response_score') {
        const responseStat = cpuRank[0] || 'hp';
        gainedScore = Math.max(0, effective[responseStat] - opponentEffective[responseStat]) * 40;
      } else if (skill.rule === 'y_burst') {
        cpuBurstStat = cpuRank[0] || 'hp';
        gainedScore = effective[cpuBurstStat] * 10;
        const cpuCurrentBaseStats = workingCpu.baseStats || workingCpu.stats;
        const nextBaseValue = Number(cpuCurrentBaseStats[cpuBurstStat] || 0) * 2;
        workingCpu = {
          ...workingCpu,
          stats: { ...workingCpu.stats, [cpuBurstStat]: nextBaseValue },
          baseStats: { ...cpuCurrentBaseStats, [cpuBurstStat]: nextBaseValue },
        };
      } else if (skill.rule === 'y_crash') {
        const third = cpuRank[2] || 'dexterity';
        const fourth = cpuRank[3] || 'charm';
        gainedScore = (effective[third] + effective[fourth]) * 10;
        Object.entries(playerBaseStats).forEach(([key, value]) => {
          debuffs[key as StatKey] = Math.ceil(Number(value || 0) * 0.25);
        });
      } else {
        gainedScore = effective.hp * 10;
      }

      const cpuSkillPreset = getPresetForCard(workingCpu.card);
      const cpuSkillIndex = workingCpu.skills.findIndex(
        (item) => item.id === skill.id,
      );

      await playSkillPreResultEffect({
        effectKey: getCharacterSkillBattleEffect(
          cpuSkillPreset,
          cpuSkillIndex,
        ),
        characterName: workingCpu.card.userName,
        skillName: skill.name,
        dialogue: skill.description,
        colorHex: getBattleVisualColorHex(workingCpu.card),
        side: 'right',
      });

      setOppAvatars((prev) =>
        prev.map((avatar, index) => (index === activeIndex ? workingCpu : avatar)),
      );

      if (Object.keys(debuffs).length > 0 && !workingPlayer.debuffImmune) {
        setMyAvatars((prev) =>
          prev.map((avatar, index) =>
            index === activeIndex
              ? {
                  ...avatar,
                  currentDebuff: {
                    hp: avatar.currentDebuff.hp + Number(debuffs.hp || 0),
                    intellect: avatar.currentDebuff.intellect + Number(debuffs.intellect || 0),
                    dexterity: avatar.currentDebuff.dexterity + Number(debuffs.dexterity || 0),
                    charm: avatar.currentDebuff.charm + Number(debuffs.charm || 0),
                  },
                }
              : avatar,
          ),
        );
      }

      const nextCpuUsed = {
        ...cpuUsedSkillsByClass,
        [usedKey]:
          skill.maxUsesPerClass > 0
            ? [...usedForClass, skill.id]
            : usedForClass,
      };
      setCpuUsedSkillsByClass(nextCpuUsed);
      setOppClassScores((prev) => {
        const nextScores = [...prev];
        nextScores[activeIndex] = (nextScores[activeIndex] || 0) + gainedScore;
        return nextScores;
      });
      setGuestTotalScore((prev) => prev + gainedScore);
      addLog(`CPU「${skill.name}」発動！ +${gainedScore}スコア`);

      const next = getNextTurnState();
      const finalMyScore = next.nextPhase === 'setup' || next.nextPhase === 'finished'
        ? myClassScores[activeIndex] || 0
        : 0;
      const finalOpponentScore = next.nextPhase === 'setup' || next.nextPhase === 'finished'
        ? (oppClassScores[activeIndex] || 0) + cpuSupportScoreDelta + gainedScore
        : 0;
      const finalMyTotal = myClassScores.reduce((sum, score) => sum + score, 0);
      const finalOpponentTotal = oppClassScores.reduce((sum, score) => sum + score, 0);

      if (next.nextPhase === 'setup' || next.nextPhase === 'finished') {
        // 最終技の得点は state 更新が非同期なので、直前値＋今回の技得点でリザルトを確定します。
        const resolvedMyTotal = myClassScores.reduce((sum, score) => sum + score, 0);
        const resolvedOpponentTotal = oppClassScores.reduce((sum, score) => sum + score, 0);
        showClassResult(
          currentYear,
          finalMyScore,
          finalOpponentScore,
          resolvedMyTotal,
          resolvedOpponentTotal + cpuSupportScoreDelta + gainedScore,
        );
      }

      setCurrentYear(next.currentYear);
      setTurnIndex(next.turnIndex);
      setBattlePhase(next.nextPhase);
      if (next.nextPhase === 'setup') {
        setFirstPlayer(null);
        setStartSeasonIdx(null);
        // 2年目・3年目は同じチームを継続使用し、チーム変更は不可。
        // チームはすでに確定済みなので、次のコイントスへそのまま進める。
        setMyDeckReady(true);
        setDeckConfirmed(true);
        setPreparationMessage(`${next.currentYear}年目の準備を開始します。\nコイントスを行ってください。`);
      }
      })();
    }, 650);

    return () => window.clearTimeout(timer);
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

// ===== サポートカード使用 =====
const handleUseSupportCard = async (
  card: SupportCard,
  index: number,
) => {
  if (
    !myTurn ||
    battlePhase !== 'battle'
  ) {
    return;
  }

  if (isBattlePreResultEffectPlaying()) return;
  if (supportSubmitInProgressRef.current) return;
  if (!myHand[index]) return;

  const supportTurnOrdinal = getBattleTurnOrdinal(currentYear, turnIndex);
  const supportPreset = getEmotionPresetForCard(card);
  const isFreeSupportCard =
    supportPreset?.effectCategory === 'サポートカード使用数' &&
    supportPreset.statEffect.includes('制限されない');
  const supportUseLimit = getSupportUsageLimitFromEffects(
    myActiveAvatar.supportControlEffects,
    supportTurnOrdinal,
  );
  const supportUseCount = getSupportUseCountFromUsedSkills(
    usedSkillsByClass,
    currentYear,
    turnIndex,
  );
  if (
    !isFreeSupportCard &&
    Number.isFinite(supportUseLimit) &&
    supportUseCount >= supportUseLimit
  ) {
    addLog('このターンはサポートカードをこれ以上使用できません。');
    return;
  }

  supportSubmitInProgressRef.current = true;
  setSupportSubmittingCardIndex(index);


  try {
    const applied =
      applyEmotionToPair(
        card,
        myActiveAvatar,
        oppActiveAvatar,
      );

    let nextMyAvatars =
      myAvatars.map(
        (avatar, avatarIndex) =>
          avatarIndex === activeIndex
            ? applied.actor
            : avatar,
      );

    let nextOppAvatars =
      oppAvatars.map(
        (avatar, avatarIndex) =>
          avatarIndex === activeIndex
            ? applied.target
            : avatar,
      );

    if (applied.actorSupportControlEffect) {
      nextMyAvatars = applySupportControlToAllAvatars(
        nextMyAvatars,
        applied.actorSupportControlEffect,
        supportTurnOrdinal,
      );
    }
    if (applied.targetSupportControlEffect) {
      nextOppAvatars = applySupportControlToAllAvatars(
        nextOppAvatars,
        applied.targetSupportControlEffect,
        supportTurnOrdinal,
      );
    }

    const nextUsedSkills = setSupportUseCountInUsedSkills(
      usedSkillsByClass,
      currentYear,
      turnIndex,
      supportUseCount + 1,
    );

    let nextHand =
      myHand.filter(
        (_, handIndex) =>
          handIndex !== index,
      );

    let nextDeck =
      [...myDeck];

    if (applied.extraDraw > 0) {
      const drawCount =
        Math.min(
          applied.extraDraw,
          Math.max(
            0,
            MAX_HAND - nextHand.length,
          ),
          nextDeck.length,
        );

      const drawnCards =
        nextDeck.slice(
          0,
          drawCount,
        );

      nextHand = [
        ...nextHand,
        ...drawnCards,
      ];

      nextDeck =
        nextDeck.slice(
          drawCount,
        );
    }

    // =====================================================
    // CPU戦：演出完了後にローカル結果を反映
    // =====================================================

    if (!isOnline) {
      await playSupportPreResultEffect({
        effectKey: getSupportBattleEffect(
          supportPreset,
        ),
        cardName: card.name,
        imageUrl: getSupportImage(card),
        targetPositions: getSupportTargetPositions(),
        dialogue: getSupportFlavorText(card) || supportPreset?.description,
        colorHex: getSupportColorHex(card),
        target: getSupportBattleTarget(
          supportPreset,
          true,
        ),
      });

      setMyAvatars(
        nextMyAvatars,
      );
      setOppAvatars(
        nextOppAvatars,
      );
      setMyHand(nextHand);
      setMyDeck(nextDeck);
      const localSupportDrawCount = Math.max(0, nextHand.length - (myHand.length - 1));
      if (localSupportDrawCount > 0) {
        triggerSupportDealAnimation(localSupportDrawCount);
        revealSupportCardIndexes(Array.from({ length: localSupportDrawCount }, (_, drawIndex) => nextHand.length - localSupportDrawCount + drawIndex));
      }
      setSelectedSupportCardIndex(null);

      if (applied.scoreDelta !== 0) {
        setMyClassScores((prev) => {
          const next = [...prev];
          next[activeIndex] = Math.max(
            0,
            (next[activeIndex] || 0) +
              applied.scoreDelta,
          );
          return next;
        });

        if (playerRole === 'host') {
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

      addLog(
        `サポート「${card.name}」を使用しました。` +
          (
            supportPreset?.description
              ? ` ${supportPreset.description}`
              : ''
          ),
      );

      return;
    }

    // =====================================================
    // オンライン戦：Transaction成功後にサポート演出
    // =====================================================

    if (!myPlayerRef) {
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
          supportPresetId:
            supportPreset?.id,
          supportFlavorText:
            getSupportFlavorText(card),
          supportColorHex:
            getSupportColorHex(card),
        },
      );

    if (!submitted) {
      addLog(
        '⚠️ サポート使用Actionの送信に失敗しました。',
      );
      return;
    }

    setUsedSkillsByClass(nextUsedSkills);

    await playSupportPreResultEffect({
      effectKey: getSupportBattleEffect(
        supportPreset,
      ),
      cardName: card.name,
      imageUrl: getSupportImage(card),
      targetPositions: getSupportTargetPositions(),
      dialogue: getSupportFlavorText(card) || supportPreset?.description,
      colorHex: getSupportColorHex(card),
      target: getSupportBattleTarget(
        supportPreset,
        true,
      ),
    });

    // オンラインの正式スコアはRoom snapshotを正とする。
    setMyAvatars(
      nextMyAvatars,
    );
    setOppAvatars(
      nextOppAvatars,
    );
    setMyHand(nextHand);
    setMyDeck(nextDeck);
    const onlineSupportDrawCount = Math.max(0, nextHand.length - (myHand.length - 1));
    if (onlineSupportDrawCount > 0) {
      triggerSupportDealAnimation(onlineSupportDrawCount);
      revealSupportCardIndexes(Array.from({ length: onlineSupportDrawCount }, (_, drawIndex) => nextHand.length - onlineSupportDrawCount + drawIndex));
    }
    setSelectedSupportCardIndex(null);

    addLog(
      `サポート「${card.name}」を使用しました。` +
        (
          supportPreset?.description
            ? ` ${supportPreset.description}`
            : ''
        ),
    );
  } finally {
    supportSubmitInProgressRef.current = false;
    setSupportSubmittingCardIndex(null);
  }
};

  // =========================================================
  // ===== 新しいゲーム開始時のローカル状態完全初期化
  // =========================================================
  //
  // 1戦目の終了後に残っている
  //
  //   avatars
  //   hand
  //   deck
  //   usedSkills
  //   デバフ
  //   statBoost
  //   Action重複防止用Ref
  //   ドロー重複防止用Ref
  //
  // をすべて新しいゲームの初期状態へ戻す。
  //
  // オンラインでは、この後で
  //   Player
  //   privatePlayer
  // へ正式保存する。
  // =========================================================

  const resetLocalGameStateForRematch = () => {
    let selectedDeck: Deck | null = null;

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
            deck.id === activeDeckId,
        ) ||
        decks[0] ||
        null;
    } catch {
      selectedDeck = null;
    }

    // -------------------------------------------------------
    // キャラ3人をチームから完全再生成
    // -------------------------------------------------------

    const loadedAvatars =
      loadDeckAndAvatars(
        selectedDeck?.id ||
          activeDeckId,
      );

    // -------------------------------------------------------
    // サポート18枚を再構築
    // 初期手札4枚 + 山札14枚
    // -------------------------------------------------------

    const supportState =
      resetLocalSupportDeck(
        selectedDeck,
      );

    // -------------------------------------------------------
    // ローカルゲーム状態
    // -------------------------------------------------------

    setMyAvatars(
      loadedAvatars,
    );

    setMyHand(
      supportState.hand,
    );

    setMyDeck(
      supportState.deck,
    );

    setCurrentYear(1);
    setTurnIndex(0);
    setFirstPlayer(null);
    setStartSeasonIdx(null);

    setMyClassScores(
      [0, 0, 0],
    );

    setOppClassScores(
      [0, 0, 0],
    );

    setHostTotalScore(0);
    setGuestTotalScore(0);

    setUsedSkillsByClass(
      {},
    );

    setCpuUsedSkillsByClass(
      {},
    );

    // 新しいゲームではチームは既存選択を継続する。
    // ただし「このチームではじめる」は再度押せる状態へ戻す。
    setMyDeckReady(
      true,
    );

    setDeckConfirmed(
      false,
    );

    // -------------------------------------------------------
    // 旧Action / ドロー状態を完全リセット
    // -------------------------------------------------------

    lastActionRef.current =
      '';

    lastSkillActionRef.current =
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

// =========================================================
// ===== 相手切断時の退出処理
// =========================================================
//
// 相手の通信が一定時間確認できない場合に
// 「退出する」を選んだときの処理。
// Host / Guest の両方で使用する。
// =========================================================

// =========================================================
// ===== Room終了・削除
// =========================================================
//
// ① Roomをclosed状態にする
// ② closedになったRoom一式を削除する
//
// 明示退出・切断時の退出で共通利用する。
// =========================================================

const deleteRoomData = async () => {
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

  // =======================================================
  // ① Roomを閉鎖状態へ変更
  // =======================================================

  await runTransaction(
    db,
    async (transaction) => {
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

      if (!isRoomMember) {
        throw new Error(
          'ROOM_CLOSE_NOT_ALLOWED',
        );
      }

      const exitField =
        playerRole === 'host'
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

  // =======================================================
  // ② 閉鎖済みRoom一式を削除
  // =======================================================

  await runTransaction(
    db,
    async (transaction) => {
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
          window.setTimeout(() => {
            window.location.assign('/');
          }, 1200);
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


  // ===== 勝敗後の再戦・退出選択 =====
  // 先に選んだ側は待機、後から選んだ側は「新しいゲームを始めます」と案内します。
  const chooseRematch = async (choice: 'rematch' | 'exit') => {
    if (rematchChoice || (isOnline && !authReady)) return;

    // CPU対戦はFirebaseを使わず、この画面内で新しい準備フェイズを開始します。
    if (!isOnline) {
      if (choice === 'exit') {
        setRematchChoice('exit');
        setWaitingMode('return');
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
            window.setTimeout(() => {
              window.location.assign('/');
            }, 1200);
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

    const roomRef = doc(db, 'rooms', roomId);

if (choice === 'exit') {
  try {
    await deleteRoomData();

    setRematchChoice('exit');
    setWaitingMode('return');

    setWaitingMessage(
      '対戦を終了しました。',
    );

    setBattlePhase('waiting');

    if (
      roomCloseRedirectRef.current ===
      null
    ) {
      roomCloseRedirectRef.current =
        window.setTimeout(() => {
          window.location.assign('/');
        }, 1200);
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
      const result = await runTransaction(db, async (transaction) => {
        const snapshot = await transaction.get(roomRef);
        if (!snapshot.exists()) throw new Error('ステージが終了しています。');
        const data = snapshot.data();
        const otherRole: PlayerRole = playerRole === 'host' ? 'guest' : 'host';
const otherChoice = Boolean(
  data[
    otherRole === 'host'
      ? 'rematchHost'
      : 'rematchGuest'
  ],
);

const field =
  playerRole === 'host'
    ? 'rematchHost'
    : 'rematchGuest';

        transaction.update(roomRef, { [field]: true });
        return { otherChoice };
      });


      setRematchChoice(choice);

      if (result.otherChoice) {
        const message = playerRole === 'host'
          ? '新しいゲームを始めます。\n先手・後手を決めるコイントスを行います。'
          : '新しいゲームを始めます。\nコイントスの結果をお待ちください。';
        setPreparationMessage(message);
        addLog(message.replace('\n', ' '));
      } else {
        addLog('もう一回するを選択しました。相手の選択を待っています。');
      }
    } catch (error) {
      console.error('再戦・退出処理エラー:', error);
      addLog('⚠️ 再戦・退出処理に失敗しました。');
    }
  };

  // =========================================================
  // ===== 両者再戦時のPlayer完全初期化
  // =========================================================
  //
  // 両者が「もう一回する」を選択したら、
  // 各クライアントが「自分自身」の
  //
  //   players/{playerRole}
  //   privatePlayers/{playerRole}
  //
  // を新しいゲーム用に初期化する。
  //
  // ホストは両者の初期化完了フラグを確認してから
  // Roomをsetupへ戻す。
  // =========================================================

  useEffect(() => {
    if (
      !isOnline ||
      battlePhase !== 'finished' ||
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
      playerRole === 'host'
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

          // 「もう一回する」がまだ両者揃っていない。
          if (!bothRematched) {
            rematchPlayerResetInProgressRef.current =
              false;

            return;
          }

          // 自分のPlayer初期化がすでに完了している。
          if (
            data[resetField] === true
          ) {
            return;
          }

          // 同一snapshotによる二重初期化防止。
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
                supportState,
              } =
                resetLocalGameStateForRematch();

              const currentUser =
                await ensureAnonymousAuth();

              // -------------------------------------------------
              // privatePlayers
              //   hand / deck
              // -------------------------------------------------

              await setDoc(
                myPrivatePlayerRef,
                {
                  uid:
                    currentUser.uid,

                  hand:
                    supportState.hand,

                  deck:
                    supportState.deck,
                },
                {
                  merge: true,
                },
              );

              // -------------------------------------------------
              // 公開Player
              //   avatars / 枚数 / usedSkills
              //
              // 1戦目のAction履歴も完全に削除する。
              // -------------------------------------------------

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
                    supportState.hand.length,

                  deckCount:
                    supportState.deck.length,

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

            
                  // 旧Player構造の秘密情報が残っていた場合も削除
                  hand:
                    deleteField(),

                  deck:
                    deleteField(),
                },
                {
                  merge: true,
                },
              );

              // -------------------------------------------------
              // 自分の初期化完了をRoomへ通知
              // -------------------------------------------------

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

  // =========================================================
  // ===== 両者のPlayer初期化完了後、ホストがRoomを再戦状態へ
  // =========================================================

  useEffect(() => {
    if (
      !isOnline ||
      battlePhase !== 'finished' ||
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
            // 両者のPlayer初期化がまだ完了していない。
            return;
          }

          void updateDoc(
            roomRef,
            {
              battlePhase:
                'setup',

              currentYear:
                1,

              turnIndex:
                0,

              firstPlayer:
                null,

              startSeasonIdx:
                null,

              hostTotalScore:
                0,

              guestTotalScore:
                0,

              hostClassScores:
                [0, 0, 0],

              guestClassScores:
                [0, 0, 0],

              rematchHost:
                false,

              rematchGuest:
                false,

              rematchPlayerResetHost:
                false,

              rematchPlayerResetGuest:
                false,

              exitHost:
                false,

              exitGuest:
                false,

              readyHost:
                false,

              readyGuest:
                false,

              classReadyYearHost:
                0,

              classReadyYearGuest:
                0,

            },
          ).catch((error) => {
            console.error(
              '再戦リセットRoom更新エラー:',
              error,
            );
          });
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

  const loadDeckDefinition = (deckId: string): Deck | null => {
    try {
      const raw = localStorage.getItem('reality_decks');
      const decks: Deck[] = raw ? JSON.parse(raw) : [];
      return decks.find((deck) => deck.id === deckId) || null;
    } catch {
      return null;
    }
  };

  // ===== 準備画面用：現在選択中チームの概要 =====
  const getDeckSupportSummary = (deck: Deck | null) => {
    if (!deck?.supportCardIds?.length) return 'サポートなし';

    try {
      const entriesRaw = localStorage.getItem('reality_world_entries');
      const entries: EntryRecordWithSkills[] = entriesRaw ? JSON.parse(entriesRaw) : [];
      const pool = getSupportPool(entries);
      const resolvedIds = resolveSupportIdsForBattle(deck.supportCardIds, entries);

      const counts = new Map<string, number>();
      resolvedIds.forEach((id) => {
        const card = pool.find((item) => item.id === id);
        const name = card?.name || id;
        counts.set(name, (counts.get(name) || 0) + 1);
      });

      return Array.from(counts.entries())
        .map(([name, count]) => `${name}${count > 1 ? `×${count}` : ''}`)
        .join(' / ');
    } catch {
      return `${deck.supportCardIds.length}枚`;
    }
  };

  // ===== チーム選択 =====
  const handleSelectDeck = async (deckId: string) => {
    if (battlePhase !== 'setup' || currentYear !== 1) return;
    const loaded = loadDeckAndAvatars(deckId);
    const selectedDeck = loadDeckDefinition(deckId);
    setIsDeckSelectOpen(false);
    resetLocalSupportDeck(selectedDeck);
    setMyDeckReady(Boolean(selectedDeck));
    setDeckConfirmed(false);

  if (isOnline) {
    if (!myPlayerRef) {
      addLog(
        '⚠️ プレイヤーデータを保存できません。',
      );
      return;
    }
  
    await updateDoc(
      myPlayerRef,
      {
        avatars: loaded,
        deckId,
        joined: true,
       },
    );
  
    const readyField =
      playerRole === 'host'
        ? 'readyHost'
        : 'readyGuest';
  
    await updateDoc(
      doc(db, 'rooms', roomId),
      {
        [readyField]: false,
      },
    );
  
    setPreparationMessage(
      'チームを変更しました。もう一度「このチームではじめる」を押してください。',
    );
    } else {
      setPreparationMessage(`チーム「${selectedDeck?.name || '新しいチーム'}」を選択しました。`);
    }
  };

  // ===== 現在の技の使用状況 =====
  const usedThisClass = usedSkillsByClass[String(currentYear)] || [];

  // ===== 待機キャラの表示順 =====
  // ホスト：大将 → 中堅 → 先鋒
  // ゲスト：先鋒 → 中堅 → 大将
  const hostWaitingIndexes = [2, 1, 0];
  const guestWaitingIndexes = [0, 1, 2];

  const roleDisplayNames: Record<RoleName, string> = {
    先鋒: 'フェザークラス',
    中堅: 'オーロラクラス',
    大将: 'スタークラス',
  };

  const currentRoleName = ROLE_NAMES[currentYear - 1];
  const currentRoleDisplayName = roleDisplayNames[currentRoleName];
  const canShowCoinToss =
    deckConfirmed &&
    onlineDecksConfirmed &&
    onlineClassPreparationConfirmed;

  const selectedSupportCard =
    selectedSupportCardIndex !== null
      ? myHand[selectedSupportCardIndex]
      : undefined;
  const selectedSupportPreset = selectedSupportCard
    ? getEmotionPresetForCard(selectedSupportCard)
    : undefined;
  const selectedSupportBadges = selectedSupportPreset
    ? getEmotionPerformanceBadges(selectedSupportPreset)
    : undefined;

  const currentSkillTurnOrdinal = getBattleTurnOrdinal(
    currentYear,
    turnIndex,
  );

  const isSkillUsable = (skill: Skill) => {
    const skillIndex = myActiveAvatar.skills.findIndex(
      (item) => item.id === skill.id,
    );
    return (
      myTurn &&
      !(
        skill.maxUsesPerClass > 0 &&
        usedThisClass.filter((skillId) => skillId === skill.id).length >= skill.maxUsesPerClass
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
      <OutdoorStageBackground season={currentSeason} />

      <div className="relative z-10 mx-auto flex h-full min-h-0 w-full max-w-7xl flex-col p-2 sm:p-3 md:p-4">
        <header className="shrink-0 rounded-2xl border border-white/60 bg-white/75 p-2.5 shadow-lg backdrop-blur-md sm:p-3">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="truncate text-[9px] font-black tracking-[0.2em] text-indigo-500">
                REALITY LIVE BATTLE
              </div>
              <div className="mt-0.5 truncate text-sm font-black text-slate-950 sm:text-base">
                {currentYear}年目　{currentRoleDisplayName}
                {battlePhase === 'battle' && <>　／　{currentSeason}</>}
              </div>
              {battlePhase === 'battle' && (
                <div className="mt-0.5 text-[10px] font-bold text-slate-500">
                  ターン {turnIndex + 1} / 8
                </div>
              )}
            </div>

            <div className="flex shrink-0 items-center gap-2">
              {battlePhase === 'battle' && (
                <button
                  type="button"
                  onClick={() => setShowBattleLog(true)}
                  className="rounded-xl bg-white px-2.5 py-2 text-[9px] font-black text-slate-700 shadow-sm ring-1 ring-slate-200 transition hover:bg-slate-50"
                >
                  試合実況
                  <span className="ml-1 opacity-40">{log.length}</span>
                </button>
              )}
              {battlePhase === 'battle' && (
                <span
                  className={`hidden rounded-full px-2.5 py-1.5 text-[9px] font-black sm:inline-flex ${
                    myTurn
                      ? 'bg-amber-300 text-amber-950'
                      : 'bg-slate-900 text-white'
                  }`}
                >
                  {myTurn ? '自分のターン' : '相手のターン'}
                </span>
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
                {roleDisplayNames[ROLE_NAMES[classResult.completedYear - 1]]} 終了
              </h2>
              <div className="mt-5 grid grid-cols-2 gap-3">
                <div className="rounded-2xl border border-indigo-200 bg-indigo-50 p-4">
                  <div className="text-xs font-black text-indigo-700">あなた</div>
                  <div className="mt-1 text-3xl font-black text-indigo-950">
                    {classResult.myScore}
                    <span className="ml-1 text-sm">スコア</span>
                  </div>
                </div>
                <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4">
                  <div className="text-xs font-black text-rose-700">相手</div>
                  <div className="mt-1 text-3xl font-black text-rose-950">
                    {classResult.opponentScore}
                    <span className="ml-1 text-sm">スコア</span>
                  </div>
                </div>
              </div>
              <div className="mt-4 text-lg font-black text-slate-900">
                {classResult.myScore > classResult.opponentScore
                  ? 'このクラスはあなたの勝利！'
                  : classResult.myScore < classResult.opponentScore
                    ? 'このクラスは相手の勝利。'
                    : 'このクラスは引き分け。'}
              </div>
              <button
                type="button"
                onClick={() => void continueAfterClassResult()}
                className="mt-5 w-full rounded-2xl bg-indigo-600 px-4 py-3.5 text-sm font-black text-white shadow-lg shadow-indigo-200 transition hover:bg-indigo-700"
              >
                {classResult.completedYear < 3
                  ? '次のクラスの準備へ'
                  : '最終結果を見る'}
              </button>
            </div>
          </section>
        )}

        {battlePhase === 'setup' && !classResult && (
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
                        {preparationMessage}
                      </div>
                    )}
                  </div>

                  <div className="mt-3 grid grid-cols-3 gap-2">
                    {myAvatars.map((avatar, index) => (
                      <div
                        key={avatar.card.id}
                        className={`rounded-2xl border p-2 text-center ${
                          index === activeIndex
                            ? 'border-indigo-300 bg-indigo-50'
                            : 'border-slate-200 bg-slate-50'
                        }`}
                      >
                        <div className="text-[8px] font-black text-slate-400">
                          {roleDisplayNames[avatar.roleName]}
                        </div>
                        <img
                          src={avatar.card.imageDataUrl}
                          alt=""
                          className="mx-auto mt-1 h-16 w-12 rounded-xl bg-white object-contain p-0.5 sm:h-20 sm:w-14"
                        />
                        <div className="mt-1 truncate text-[9px] font-black text-slate-800">
                          {avatar.card.userName}
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="mt-2 flex items-center justify-between rounded-2xl bg-slate-50 px-3 py-2">
                    <div className="text-[10px] font-black text-slate-600">
                      サポートカード
                    </div>
                    <div className="text-base font-black text-indigo-700">
                      {activeDeckId
                        ? loadDeckDefinition(activeDeckId)?.supportCardIds?.length || 0
                        : 0}
                      <span className="ml-1 text-[9px] text-slate-400">/ 18枚</span>
                    </div>
                  </div>
                </div>

                <div className="grid shrink-0 grid-cols-2 gap-2">
                  <div className="rounded-2xl border border-indigo-200 bg-indigo-50/90 p-3">
                    <div className="text-[9px] font-black tracking-wide text-indigo-500">
                      あなた
                    </div>
                    <div className="mt-1 text-sm font-black text-indigo-950">
                      {deckConfirmed ? '準備完了' : myDeckReady ? '確認待ち' : 'チーム未選択'}
                    </div>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-white/90 p-3">
                    <div className="text-[9px] font-black tracking-wide text-slate-400">
                      相手
                    </div>
                    <div className="mt-1 text-sm font-black text-slate-800">
                      {isOnline
                        ? readyHost && readyGuest
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
                      if (activeDeckId && onEditDeck) {
                        onEditDeck(activeDeckId);
                        return;
                      }
                      setIsDeckSelectOpen(true);
                    }}
                    disabled={
                      currentYear !== 1 ||
                      deckConfirmed ||
                      (isOnline &&
                        (playerRole === 'host'
                          ? readyHost
                          : readyGuest))
                    }
                    className="rounded-2xl bg-white px-4 py-3 text-xs font-black text-slate-700 shadow-sm ring-1 ring-slate-200 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-35"
                  >
                    チームを変更
                  </button>
                  <button
                    type="button"
                    onClick={() => void startBattleWithDeck()}
                    disabled={!myDeckReady || deckConfirmed || currentYear !== 1}
                    className="rounded-2xl bg-indigo-600 px-4 py-3 text-xs font-black text-white shadow-lg shadow-indigo-200 transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-35"
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
                          onClick={() => void decideFirstPlayer()}
                          disabled={isCoinTossing}
                          className="mt-6 w-full rounded-2xl bg-amber-300 px-4 py-4 text-sm font-black text-slate-950 shadow-lg transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-45"
                        >
                          {isCoinTossing ? 'コイントス中…' : 'コイントスを行う'}
                        </button>
                      ) : (
                        <div className="mt-6 rounded-2xl bg-white/10 px-4 py-4 text-sm font-black text-slate-200">
                          ルーム作成者がコイントスを行います。
                        </div>
                      )
                    ) : (
                      <button
                        type="button"
                        onClick={() => void decideFirstPlayer()}
                        disabled={isCoinTossing}
                        className="mt-6 w-full rounded-2xl bg-amber-300 px-4 py-4 text-sm font-black text-slate-950 shadow-lg transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-45"
                      >
                        {isCoinTossing ? 'コイントス中…' : 'コイントスを行う'}
                      </button>
                    )
                  ) : (
                    <div className="mt-6 rounded-2xl bg-white/10 px-4 py-4 text-xl font-black text-amber-300">
                      {firstPlayer === playerRole ? 'あなたが先手！' : '相手が先手！'}
                    </div>
                  )}

                  {firstPlayer && (
                    <div className="mt-4 text-sm font-bold text-slate-300">
                      {firstPlayer === playerRole
                        ? '開始シーズンを選んで対戦へ進みます。'
                        : '相手の準備を待っています。'}
                    </div>
                  )}
                </div>
              </div>
            )}
          </section>
        )}

        {battlePhase === 'waiting' && (
          <section className="mt-2 flex min-h-0 flex-1 items-center justify-center">
            <div className="w-full max-w-md rounded-[2rem] border border-white/70 bg-white/90 p-6 text-center shadow-2xl backdrop-blur-md">
              <div className="text-5xl">⏳</div>
              <h2 className="mt-3 text-2xl font-black">{waitingMode === 'return' ? '自動的にホーム画面に戻ります' : '対戦相手を待っています'}</h2>
              <p className="mt-3 whitespace-pre-line text-sm font-bold leading-relaxed text-slate-500">
                {waitingMessage}
              </p>
            </div>
          </section>
        )}

        {battlePhase === 'battle' && (
          <section className="mt-2 flex min-h-0 flex-1 flex-col gap-2 overflow-hidden">
            <div className="shrink-0 rounded-2xl border border-white/70 bg-white/65 px-3 py-2 shadow-md backdrop-blur-md">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="text-[9px] font-black text-indigo-600">あなた</div>
                  <div className="mt-1 flex items-center gap-1.5">
                    {[2, 1, 0].map((index) => {
                      const avatar = myAvatars[index] || DEFAULT_MY_AVATARS[index];
                      const active = index === activeIndex;
                      return (
                        <button
                          key={`my-mini-${avatar.card.id}`}
                          type="button"
                          onClick={() => setModalAvatar(avatar)}
                          className={`flex h-9 w-9 items-center justify-center overflow-hidden rounded-full border-2 bg-white transition ${
                            active
                              ? 'border-amber-400 ring-2 ring-amber-200'
                              : 'border-slate-200 opacity-70'
                          }`}
                          aria-label={`${roleDisplayNames[avatar.roleName]} ${avatar.card.userName}`}
                        >
                          <img
                            src={avatar.card.imageDataUrl}
                            alt=""
                            className="h-full w-full object-contain"
                          />
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[9px] font-black text-rose-600">相手</div>
                  <div className="mt-1 flex items-center justify-end gap-1.5">
                    {[0, 1, 2].map((index) => {
                      const avatar = oppAvatars[index] || DEFAULT_OPP_AVATARS[index];
                      const active = index === activeIndex;
                      return (
                        <button
                          key={`opp-mini-${avatar.card.id}`}
                          type="button"
                          onClick={() => setModalAvatar(avatar)}
                          className={`flex h-9 w-9 items-center justify-center overflow-hidden rounded-full border-2 bg-white transition ${
                            active
                              ? 'border-amber-400 ring-2 ring-amber-200'
                              : 'border-slate-200 opacity-70'
                          }`}
                          aria-label={`${roleDisplayNames[avatar.roleName]} ${avatar.card.userName}`}
                        >
                          <img
                            src={avatar.card.imageDataUrl}
                            alt=""
                            className="h-full w-full object-contain"
                          />
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>

            <div className="grid shrink-0 grid-cols-2 gap-2">
              <div className="rounded-2xl border border-indigo-300 bg-white/90 p-2.5 shadow-lg ring-1 ring-indigo-100">
                <div className="text-center text-[9px] font-black text-indigo-600">
                  あなた　{currentRoleDisplayName}
                </div>
                <div className="mt-1 flex items-start justify-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setModalAvatar(myActiveAvatar)}
                    className="block w-[92px] shrink-0 translate-y-1.5"
                  >
                    <div ref={myActiveCardAnchorRef}>
                      <BattleCardReveal
                        revealed={activeCardsRevealed}
                        width={92}
                        height={118}
                        className="mx-auto"
                        colorHex={getBattleVisualColorHex(myActiveAvatar.card)}
                      >
                        <img
                          src={myActiveAvatar.card.imageDataUrl}
                          alt=""
                          className="h-full w-full rounded-2xl bg-white object-contain p-1"
                        />
                      </BattleCardReveal>
                    </div>
                  </button>
                  <VerticalScoreGauge
                    label="このクラス"
                    score={currentMyClassScore}
                    side="self"
                    active={myTurn}
                    compact
                    baseHeightPx={118}
                  />
                </div>
                <div className="mt-1 truncate text-center text-xs font-black text-slate-950">
                  {myActiveAvatar.card.userName}
                </div>
                <div className="mt-0.5 text-center text-[10px] font-black text-indigo-700">
                  {currentMyClassScore} スコア
                </div>
                <button
                  type="button"
                  onClick={() => setModalAvatar(myActiveAvatar)}
                  className="mx-auto mt-1 block rounded-xl p-0.5 transition hover:bg-indigo-50"
                  aria-label="自分のステータス詳細を開く"
                >
                  <RadarChart
                    baseStats={myActiveAvatar.baseStats || myActiveAvatar.card.stats}
                    currentStats={getEffectiveStats(myActiveAvatar)}
                    size={104}
                    showLabels={false}
                    showLegend={false}
                  />
                </button>
              </div>

              <div className="rounded-2xl border border-rose-300 bg-white/90 p-2.5 shadow-lg ring-1 ring-rose-100">
                <div className="text-center text-[9px] font-black text-rose-600">
                  相手　{currentRoleDisplayName}
                </div>
                <div className="mt-1 flex items-start justify-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setModalAvatar(oppActiveAvatar)}
                    className="block w-[92px] shrink-0 translate-y-1.5"
                  >
                    <div ref={opponentActiveCardAnchorRef}>
                      <BattleCardReveal
                        revealed={activeCardsRevealed}
                        width={92}
                        height={118}
                        className="mx-auto"
                        colorHex={getBattleVisualColorHex(oppActiveAvatar.card)}
                      >
                        <img
                          src={oppActiveAvatar.card.imageDataUrl}
                          alt=""
                          className="h-full w-full rounded-2xl bg-white object-contain p-1"
                        />
                      </BattleCardReveal>
                    </div>
                  </button>
                  <VerticalScoreGauge
                    label="このクラス"
                    score={currentOppClassScore}
                    side="opponent"
                    active={!myTurn}
                    compact
                    baseHeightPx={118}
                  />
                </div>
                <div className="mt-1 truncate text-center text-xs font-black text-slate-950">
                  {oppActiveAvatar.card.userName}
                </div>
                <div className="mt-0.5 text-center text-[10px] font-black text-rose-700">
                  {currentOppClassScore} スコア
                </div>
                <button
                  type="button"
                  onClick={() => setModalAvatar(oppActiveAvatar)}
                  className="mx-auto mt-1 block rounded-xl p-0.5 transition hover:bg-rose-50"
                  aria-label="相手のステータス詳細を開く"
                >
                  <RadarChart
                    baseStats={oppActiveAvatar.baseStats || oppActiveAvatar.card.stats}
                    currentStats={getEffectiveStats(oppActiveAvatar)}
                    size={104}
                    showLabels={false}
                    showLegend={false}
                  />
                </button>
              </div>
            </div>

            <section className="shrink-0 rounded-2xl border border-white/70 bg-white/85 p-2.5 shadow-lg backdrop-blur-md">
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs font-black text-slate-950">
                  サポート手札
                </div>
                <div className="text-right text-[9px] font-black text-slate-500">
                  手札 {myHand.length}/{MAX_HAND}　山札 {myDeck.length}
                  {isOnline && (
                    <>　／　相手 {opponentHandCount}/{MAX_HAND}・{opponentDeckCount}</>
                  )}
                </div>
              </div>

              <div className="mt-0.5 text-[8px] font-bold text-slate-400">
                タップして内容を確認 → 使用
              </div>

              <div className="mt-1.5 flex min-h-[94px] items-end justify-center overflow-x-auto px-1 pb-1 pt-2 touch-pan-x">
                {myHand.length === 0 ? (
                  <div className="py-5 text-xs font-bold text-slate-400">
                    手札がありません。
                  </div>
                ) : (
                  myHand.map((card, index) => {
                    const isSelected = selectedSupportCardIndex === index;
                    const isSubmitting = supportSubmittingCardIndex === index;
                    const isRevealing = revealingSupportCardIndexes.includes(index);
                    return (
                      <button
                        key={`${card.id}_${index}`}
                        type="button"
                        disabled={supportSubmittingCardIndex !== null}
                        onClick={() => setSelectedSupportCardIndex(index)}
                        className={`relative h-[88px] w-[60px] shrink-0 overflow-hidden rounded-xl border bg-white p-1 text-left shadow-md transition sm:h-[96px] sm:w-[66px] ${
                          index > 0 ? '-ml-6' : ''
                        } ${
                          isSelected
                            ? '-translate-y-2 z-20 border-indigo-500 ring-2 ring-indigo-200'
                            : 'z-10 border-slate-200'
                        } ${
                          supportSubmittingCardIndex !== null
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
                          revealed={!isRevealing}
                          width={52}
                          height={72}
                          className="mx-auto"
                          colorHex={getSupportColorHex(card) || getBattleVisualColorHex(myActiveAvatar.card)}
                        >
                          {getSupportImage(card) ? (
                            <img
                              src={getSupportImage(card)}
                              alt=""
                              className="h-full w-full rounded-lg bg-white object-contain"
                            />
                          ) : (
                            <div className="flex h-full items-center justify-center text-xl">🃏</div>
                          )}
                        </BattleCardReveal>
                        <div className="mt-0.5 truncate text-center text-[8px] font-black text-slate-700">
                          {card.name}
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </section>

            <section className="min-h-0 flex-1 rounded-2xl border border-white/70 bg-white/80 p-2.5 shadow-lg backdrop-blur-md">
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <div className="text-xs font-black text-slate-950">
                  ⚔️ {myActiveAvatar.card.userName} のスキル
                </div>
                <div className="rounded-full bg-slate-100 px-2 py-1 text-[8px] font-black text-slate-500">
                  使用すると即ターン終了
                </div>
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                {myActiveAvatar.skills.map((skill, index) => {
                  const skillIndex = index;
                  const used =
                    skill.maxUsesPerClass > 0 &&
                    usedThisClass.filter((skillId) => skillId === skill.id).length >= skill.maxUsesPerClass;
                  const sealed = hasSkillSeal(
                    myActiveAvatar,
                    skillIndex,
                    currentSkillTurnOrdinal,
                  );
                  return (
                    <button
                      key={`${myActiveAvatar.card.id}_${skill.id}`}
                      type="button"
                      onClick={() => setSelectedSkillDetail(skill)}
                      className={`min-h-[54px] rounded-xl border p-2 text-left transition ${
                        used || sealed
                          ? 'border-slate-200 bg-slate-100 opacity-55'
                          : myTurn
                            ? 'border-indigo-200 bg-indigo-50 hover:bg-indigo-100'
                            : 'border-slate-200 bg-white'
                      }`}
                    >
                      <div className="text-[10px] font-black text-indigo-950">
                        {['①', '②', '③', '④'][index]} {skill.name}
                      </div>
                      <div className="mt-0.5 truncate text-[8px] font-bold text-slate-500">
                        {used ? 'このクラスは使用済み' : sealed ? '封印中' : myTurn ? 'タップして詳細' : '相手のターン'}
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>
          </section>
        )}

        {battlePhase === 'finished' && !classResult && (
          <section className="mt-2 flex min-h-0 flex-1 items-center justify-center">
            <div className="w-full max-w-lg rounded-[2rem] border border-white/80 bg-white/95 p-6 text-center shadow-2xl backdrop-blur-md">
              <div className="text-xs font-black tracking-[0.25em] text-indigo-500">
                BATTLE FINISH
              </div>
              <h2 className="mt-2 text-4xl font-black text-slate-950">
                {myTotalScore > opponentTotalScore
                  ? 'YOU WIN!'
                  : myTotalScore < opponentTotalScore
                    ? 'YOU LOSE'
                    : 'DRAW'}
              </h2>

              <div className="mt-5 grid grid-cols-2 gap-3">
                <div className="rounded-2xl border border-indigo-200 bg-indigo-50 p-4">
                  <div className="text-xs font-black text-indigo-700">あなた</div>
                  <div className="mt-1 text-3xl font-black text-indigo-950">
                    {myTotalScore}
                    <span className="ml-1 text-sm">総合スコア</span>
                  </div>
                </div>
                <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4">
                  <div className="text-xs font-black text-rose-700">相手</div>
                  <div className="mt-1 text-3xl font-black text-rose-950">
                    {opponentTotalScore}
                    <span className="ml-1 text-sm">総合スコア</span>
                  </div>
                </div>
              </div>

              <div className="mt-5 grid grid-cols-3 gap-2 text-[10px] font-black">
                {ROLE_NAMES.map((role, index) => (
                  <div
                    key={role}
                    className="rounded-2xl border border-slate-200 bg-slate-50 p-3"
                  >
                    <div className="text-[9px] text-slate-400">
                      {roleDisplayNames[role]}
                    </div>
                    <div className="mt-1 text-sm text-slate-900">
                      {myClassScores[index]} - {oppClassScores[index]}
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-5 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => void chooseRematch('rematch')}
                  disabled={!!rematchChoice}
                  className="rounded-2xl bg-indigo-600 px-4 py-3.5 text-sm font-black text-white shadow-lg shadow-indigo-200 transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-45"
                >
                  もう一度遊ぶ
                </button>
                <button
                  type="button"
                  onClick={() => void chooseRematch('exit')}
                  disabled={!!rematchChoice}
                  className="rounded-2xl bg-slate-100 px-4 py-3.5 text-sm font-black text-slate-800 transition hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-45"
                >
                  ホームへ戻る
                </button>
              </div>
              {rematchChoice === 'rematch' && (
                <div className="mt-3 text-xs font-bold text-slate-400">
                  相手の選択を待っています…
                </div>
              )}
            </div>
          </section>
        )}

        {isDeckSelectOpen && battlePhase === 'setup' && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/60 px-4 py-6 backdrop-blur-sm">
            <div className="flex max-h-[85dvh] w-full max-w-md flex-col rounded-3xl bg-white p-5 shadow-2xl">
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
                  onClick={() => setIsDeckSelectOpen(false)}
                  className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-black text-slate-600"
                >
                  閉じる
                </button>
              </div>
              <div className="mt-4 min-h-0 space-y-2 overflow-y-auto pr-1">
                {(() => {
                  try {
                    const decks: Deck[] = JSON.parse(
                      localStorage.getItem('reality_decks') || '[]',
                    );
                    if (!decks.length) {
                      return (
                        <div className="py-8 text-center text-sm font-bold text-slate-400">
                          保存されたチームがありません。
                        </div>
                      );
                    }
                    return decks.map((deck) => (
                      <button
                        key={deck.id}
                        type="button"
                        onClick={() => void handleSelectDeck(deck.id)}
                        className="w-full rounded-2xl border border-slate-200 bg-slate-50 p-3 text-left transition hover:border-indigo-300 hover:bg-indigo-50"
                      >
                        <div className="font-black text-slate-950">{deck.name}</div>
                        <div className="mt-1 text-[9px] font-bold text-slate-400">
                          キャラ3人・サポート {deck.supportCardIds?.length || 0}枚
                        </div>
                      </button>
                    ));
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

        {selectedSupportCard && (
          <div className="fixed inset-0 z-[75] flex items-end justify-center bg-slate-950/60 px-3 py-3 backdrop-blur-sm sm:items-center sm:px-4">
            <div className="max-h-[78dvh] w-full max-w-md overflow-y-auto rounded-[2rem] bg-white p-4 shadow-2xl sm:p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-[9px] font-black tracking-[0.18em] text-purple-500">
                    SUPPORT CARD
                  </div>
                  <h3 className="mt-0.5 text-xl font-black text-slate-950">
                    {selectedSupportCard.name}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedSupportCardIndex(null)}
                  className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-black text-slate-600"
                >
                  閉じる
                </button>
              </div>

              <div className="mt-4 grid grid-cols-[92px_minmax(0,1fr)] gap-4">
                <BattleCardReveal
                  revealed={!revealingSupportCardIndexes.includes(selectedSupportCardIndex ?? -1)}
                  width={88}
                  height={120}
                  className="mx-auto"
                  colorHex={getSupportColorHex(selectedSupportCard) || getBattleVisualColorHex(myActiveAvatar.card)}
                >
                  {getSupportImage(selectedSupportCard) ? (
                    <img
                      src={getSupportImage(selectedSupportCard)}
                      alt=""
                      className="h-full w-full rounded-2xl bg-white object-contain p-1"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-3xl">🃏</div>
                  )}
                </BattleCardReveal>

                <div className="min-w-0">
                  <div className="text-[9px] font-black text-slate-400">カード情報</div>
                  {selectedSupportBadges && (
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {[selectedSupportBadges.target, selectedSupportBadges.duration, selectedSupportBadges.effect].map(
                        (badge, badgeIndex) => (
                          <span
                            key={`${badge.label}_${badgeIndex}`}
                            className="rounded-lg border border-purple-200 bg-purple-50 px-2 py-1 text-[9px] font-black text-purple-900"
                          >
                            {badge.label}
                          </span>
                        ),
                      )}
                    </div>
                  )}
                  {selectedSupportPreset && (
                    <div className="mt-2 text-sm font-bold leading-relaxed text-slate-800">
                      {getSupportDetailDescription(selectedSupportPreset)}
                    </div>
                  )}
                </div>
              </div>

              {getSupportFlavorText(selectedSupportCard) && (
                <div className="mt-4 rounded-2xl border border-purple-100 bg-purple-50/70 p-3">
                  <div className="text-[9px] font-black text-purple-700">フレーバーテキスト</div>
                  <div className="mt-1 whitespace-pre-wrap text-xs font-bold leading-relaxed text-slate-700">
                    {getSupportFlavorText(selectedSupportCard)}
                  </div>
                </div>
              )}

              <button
                type="button"
                disabled={!myTurn || supportSubmittingCardIndex !== null}
                onClick={() => {
                  if (selectedSupportCardIndex === null || !selectedSupportCard) return;
                  const index = selectedSupportCardIndex;
                  setSelectedSupportCardIndex(null);
                  void handleUseSupportCard(selectedSupportCard, index);
                }}
                className="mt-5 w-full rounded-2xl bg-indigo-600 px-4 py-3.5 text-sm font-black text-white shadow-lg shadow-indigo-200 transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {myTurn ? 'このサポートカードを使用する' : '自分のターンではありません'}
              </button>
            </div>
          </div>
        )}

        {skillStatSelection && (
          <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
            <div className="w-full max-w-sm rounded-3xl bg-white p-5 shadow-2xl">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-xs font-black text-slate-400">N-1コーデ</div>
                  <h3 className="mt-1 text-xl font-black text-slate-950">ステータスを選択</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setSkillStatSelection(null)}
                  className="rounded-xl bg-slate-100 px-3 py-2 text-sm font-black text-slate-500"
                  aria-label="ステータス選択を閉じる"
                >
                  ✕
                </button>
              </div>

              <div className="mt-3 rounded-2xl bg-slate-50 p-3 text-xs font-bold leading-relaxed text-slate-600">
                {skillStatSelection.mode === 'response'
                  ? '選んだステータスの「自分 − 相手」×20でスコアを計算します。'
                  : '選んだステータスを2倍にしてから、技の処理を確定します。'}
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2">
                {STAT_KEYS.map((stat) => {
                  const mine = getEffectiveStats(myActiveAvatar)[stat];
                  const opponent = getEffectiveStats(oppActiveAvatar)[stat];
                  const score = Math.max(0, mine - opponent) * 20;
                  const burstValue = mine * 2;

                  return (
                    <button
                      key={stat}
                      type="button"
                      onClick={() => {
                        const skill = myActiveAvatar.skills.find(
                          (item) => item.id === skillStatSelection.skillId,
                        );
                        if (!skill) {
                          setSkillStatSelection(null);
                          return;
                        }
                        setSkillStatSelection(null);
                        void handleUseSkill(skill, stat);
                      }}
                      className="rounded-2xl border border-indigo-200 bg-indigo-50 p-3 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-indigo-400 hover:bg-indigo-100"
                    >
                      <div className="text-sm font-black text-indigo-950">
                        {STAT_LABELS[stat]}
                      </div>
                      <div className="mt-1 text-xs font-bold text-slate-600">
                        自分 {mine} ／ 相手 {opponent}
                      </div>
                      <div className="mt-2 text-sm font-black text-indigo-700">
                        {skillStatSelection.mode === 'response'
                          ? `+${score}スコア`
                          : `${mine} → ${burstValue}`}
                      </div>
                    </button>
                  );
                })}
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
                    {selectedSkillDetail.name}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedSkillDetail(null)}
                  className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-black text-slate-600"
                >
                  閉じる
                </button>
              </div>

              <div className="mt-4 rounded-2xl border border-indigo-100 bg-indigo-50/70 p-4">
                <div className="text-sm font-bold leading-relaxed text-slate-800">
                  {selectedSkillDetail.description}
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
                  myActiveAvatar.skills.findIndex((item) => item.id === selectedSkillDetail.id),
                  currentSkillTurnOrdinal,
                ) && <span className="text-rose-600">封印中</span>}
              </div>

              <button
                type="button"
                disabled={!isSkillUsable(selectedSkillDetail)}
                onClick={() => {
                  const skill = selectedSkillDetail;
                  setSelectedSkillDetail(null);
                  void handleUseSkill(skill);
                }}
                className="mt-5 w-full rounded-2xl bg-indigo-600 px-4 py-3.5 text-sm font-black text-white shadow-lg shadow-indigo-200 transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {myTurn ? 'このスキルを使用する' : '相手のターンです'}
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
                    {roleDisplayNames[modalAvatar.roleName]}
                  </div>
                  <h3 className="mt-0.5 text-2xl font-black text-slate-950">
                    {modalAvatar.card.userName}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setModalAvatar(null)}
                  className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-black text-slate-600"
                >
                  閉じる
                </button>
              </div>

              <div className="mt-4 grid grid-cols-[104px_minmax(0,1fr)] gap-4">
                <img
                  src={modalAvatar.card.imageDataUrl}
                  alt=""
                  className="h-36 w-[104px] rounded-2xl bg-white object-contain p-1 shadow-sm ring-1 ring-slate-200"
                />
                <div className="min-w-0">
                  <div className="text-[9px] font-black text-slate-400">能力値</div>
                  <div className="mt-1 grid grid-cols-2 gap-1.5 text-[10px] font-black">
                    {STAT_KEYS.map((stat) => {
                      const base = Number((modalAvatar.baseStats || modalAvatar.card.stats)[stat] || 0);
                      const current = Number(getEffectiveStats(modalAvatar)[stat] || 0);
                      const diff = current - base;
                      return (
                        <div
                          key={stat}
                          className="rounded-xl bg-slate-50 p-2"
                        >
                          <div className="text-[8px] text-slate-400">{STAT_LABELS[stat]}</div>
                          <div className="mt-0.5 text-sm text-slate-900">
                            {current}
                            {diff !== 0 && (
                              <span className={diff > 0 ? 'ml-1 text-red-500' : 'ml-1 text-blue-500'}>
                                {diff > 0 ? `+${diff}` : diff}
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="mt-5 flex justify-center">
                <RadarChart
                  baseStats={modalAvatar.baseStats || modalAvatar.card.stats}
                  currentStats={getEffectiveStats(modalAvatar)}
                  size={220}
                />
              </div>

              <div className="mt-2 rounded-2xl bg-slate-50 p-3 text-xs font-bold leading-relaxed text-slate-600">
                <div>カラータイプ：{getBattleColorTypeLabel(modalAvatar.card)}</div>
                <div className="mt-1">好きな季節：{modalAvatar.card.favoredSeason}</div>
                <div className="mt-1">フレーバー：{getBattleFlavorText(modalAvatar.card) || '未設定'}</div>
                <div className="mt-1">ステータスの差分は、サポートやスキルによる現在値の変化を示します。</div>
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
                  <h3 className="mt-0.5 text-xl font-black">試合実況</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setShowBattleLog(false)}
                  className="rounded-xl bg-white/10 px-3 py-2 text-xs font-black text-white"
                >
                  閉じる
                </button>
              </div>
              <div className="mt-4 min-h-0 flex-1 space-y-1 overflow-y-auto rounded-2xl bg-white/5 p-3 text-xs leading-relaxed">
                {log.length === 0 ? (
                  <div className="py-8 text-center font-bold text-white/40">
                    まだ実況ログはありません。
                  </div>
                ) : (
                  log.map((item, index) => (
                    <div
                      key={`${item}_${index}`}
                      className={`border-b border-white/5 pb-1.5 pt-1 ${index === 0 ? 'font-black text-white' : 'text-white/65'}`}
                    >
                      {item}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {showOpponentDisconnectModal && battlePhase === 'battle' && (
          <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
            <div className="w-full max-w-md rounded-[2rem] bg-white p-5 text-center shadow-2xl">
              <div className="text-4xl">⚠️</div>
              <h3 className="mt-3 text-xl font-black text-slate-950">
                相手との接続を確認できません
              </h3>
              <p className="mt-3 text-sm font-bold leading-relaxed text-slate-600">
                {opponentDisconnectMessage}
              </p>
              <p className="mt-2 text-xs font-bold text-slate-400">
                相手が復帰すれば、そのまま対戦を続けられます。
              </p>
              <div className="mt-5 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowOpponentDisconnectModal(false);
                    opponentDisconnectDismissedUntilRef.current =
                      Date.now() + 30 * 1000;
                    setWaitingMessage('相手の復帰を待っています。');
                  }}
                  className="rounded-2xl bg-indigo-600 px-4 py-3 text-sm font-black text-white"
                >
                  待機する
                </button>
                <button
                  type="button"
                  onClick={() => void exitBecauseOpponentDisconnected()}
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
