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
  increment,
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
import { createVirtualSupportCards, VIRTUAL_SUPPORT_PREFIX } from './supportSampleCards';
import { EMOTION_PRESETS, type EmotionPreset } from './emotionPresets';

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
  hp: '体力',
  intellect: '知略',
  dexterity: '器用',
  charm: '特技',
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
  { id: 'skill_1', name: 'ボディビル', description: '体力×10でスコアを獲得する。', maxUsesPerClass: 0, type: 'score', rule: 'primary_score', primaryStat: 'hp' },
  { id: 'skill_2', name: 'やる気元気', description: '自分のデバフを解除し、このキャラへのデバフを無効化する。', maxUsesPerClass: 0, type: 'debuff_clear', rule: 'primary_score' },
  { id: 'skill_3', name: '計画性', description: '智略を基準にスコアを獲得する。', maxUsesPerClass: 0, type: 'score', rule: 'primary_score', primaryStat: 'intellect' },
  { id: 'skill_4', name: 'タックル&寝技', description: '相手の体力を自分の特技分だけ下げる。', maxUsesPerClass: 1, type: 'debuff_attack', rule: 'combo_score_and_debuff', primaryStat: 'hp', secondaryStat: 'charm' },
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

  if (preset.code === 'a1') {
    return [
      { id: 'skill_1', name: names[0] || preset.defaultSkills[0], description: preset.skillDescriptions[0], maxUsesPerClass: 0, type: 'score', rule: 'y_total_score' },
      { id: 'skill_2', name: names[1] || preset.defaultSkills[1], description: preset.skillDescriptions[1], maxUsesPerClass: 0, type: 'score', rule: 'y_response_score' },
      { id: 'skill_3', name: names[2] || preset.defaultSkills[2], description: preset.skillDescriptions[2], maxUsesPerClass: 1, type: 'score', rule: 'y_burst' },
      { id: 'skill_4', name: names[3] || preset.defaultSkills[3], description: preset.skillDescriptions[3], maxUsesPerClass: 1, type: 'debuff_attack', rule: 'y_crash' },
    ];
  }

  const rank = getStatRankFromPreset(preset);
  return [
    { id: 'skill_1', name: names[0] || preset.defaultSkills[0], description: preset.skillDescriptions[0], maxUsesPerClass: 0, type: 'score', rule: 'primary_score', primaryStat: rank[0] },
    { id: 'skill_2', name: names[1] || preset.defaultSkills[1], description: preset.skillDescriptions[1], maxUsesPerClass: 0, type: 'score', rule: 'product_score', primaryStat: rank[2], secondaryStat: rank[3] },
    { id: 'skill_3', name: names[2] || preset.defaultSkills[2], description: preset.skillDescriptions[2], maxUsesPerClass: 0, type: 'score', rule: 'difference_score', primaryStat: rank[0] },
    { id: 'skill_4', name: names[3] || preset.defaultSkills[3], description: preset.skillDescriptions[3], maxUsesPerClass: 1, type: 'debuff_attack', rule: 'combo_score_and_debuff', primaryStat: rank[0], secondaryStat: rank[1], tertiaryStat: rank[3] },
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
  kind: 'limit' | 'free' | 'extra_draw' | 'score';
  maxUsesPerTurn?: number;
  extraDrawPerTurn?: number;
  scoreDeltaPerTurn?: number;
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
  appliesToOpponent: boolean,
) => {
  if (preset.duration === '一時') {
    return turnOrdinal + 2;
  }

  if (preset.note?.includes('最大4ターン')) {
    return turnOrdinal + (appliesToOpponent ? 5 : 4);
  }

  return null;
};

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

const getSupportScoreModifierFromEffects = (
  effects: SupportControlEffectState[] | undefined,
  turnOrdinal: number,
) =>
  (effects || [])
    .filter((effect) =>
      isSupportEffectActive(effect, turnOrdinal) &&
      effect.kind === 'score',
    )
    .reduce((sum, effect) => sum + Number(effect.scoreDeltaPerTurn || 0), 0);

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
}: {
  baseStats: AvatarCard['stats'];
  currentStats: AvatarCard['stats'];
}) {
  // キャラ情報と横並びに置いても窮屈にならないサイズ。
  // ラベルは頂点の外側へ逃がし、現在スコアと干渉しないようにする。
  const size = 250;
  const center = size / 2;
  const r = 86;
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
  const labelPositions = angles.map((angle) => point(max, angle, r + 18));
  const labels = [
    ['体力', currentValues[0]],
    ['知略', currentValues[1]],
    ['器用', currentValues[2]],
    ['特技', currentValues[3]],
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

        {labels.map(([label, value], index) => {
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
              fontSize="11"
              fontWeight="800"
            >
              {label} {value}
            </text>
          );
        })}
      </svg>

      <div className="mt-0 flex items-center gap-3 text-[10px] font-bold opacity-70">
        <span>■ 基礎</span>
        <span className="text-yellow-700">■ 現在</span>
      </div>
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

  // デッキを選択しただけでは準備完了にしない。「このデッキではじめる」で確定する。
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
  const [readyHost, setReadyHost] = useState(false);
  const [readyGuest, setReadyGuest] = useState(false);

  const [activeCardsRevealed, setActiveCardsRevealed] = useState(false);
  const [battleDealAnimationKey, setBattleDealAnimationKey] = useState(0);
  const [battleDealAnimationActive, setBattleDealAnimationActive] = useState(false);
  const [selectedSupportCardIndex, setSelectedSupportCardIndex] = useState<number | null>(null);
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

  const addLog = (message: string) => setLog((prev) => [...prev, message]);

type BattleVisualCard = AvatarCard & {
  colorHex?: string;
  colorType?: string;
};

const getBattleVisualColorHex = (card: AvatarCard) =>
  (card as BattleVisualCard).colorHex;

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

  // ===== CPU用一時デッキを自動構築 =====
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
    addLog(`CPUデッキを構築：キャラ3人＋サポート${shuffledDeck.length}枚`);
  };

  // ===== デッキから3キャラを読み込む =====
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

      const cards: Array<AvatarCard & { colorHex?: string; colorType?: string }> = [...CHARACTER_SAMPLE_CARDS];
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
        addLog(`デッキ「${chosen.name}」を読み込みました。`);
      }
    } catch (error) {
      console.error('デッキ読み込みエラー:', error);
    }
    return result;
  };

  // ===== 手札・山札の初期化 =====
  const getSupportPool = (entries: EntryRecordWithSkills[]) => {
    const emotionEntries = entries.filter((entry) => entry.cardType === 'emotion');
    const enteredPresetIds = new Set(emotionEntries.map((entry) => entry.presetId).filter((id): id is string => Boolean(id)));
    const virtualSupports = createVirtualSupportCards(enteredPresetIds);
    const realSupports: SupportCard[] = emotionEntries.map((entry) => {
      const name = entry.customEffectName || entry.userName || 'サポート';
      return {
        id: entry.id,
        name,
        description: entry.effect || entry.description || '',
        imageDataUrl: entry.imageDataUrl || `/support_sample/${encodeURIComponent(name)}.jpg`,
      } as SupportCard & { imageDataUrl: string };
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

      // 実戦デッキは18枚。
      // 初期手札は4枚、山札は14枚。
      //
      // デッキ構築画面で登録されたカードが18枚未満の場合は、
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
        'サポートデッキ初期化エラー:',
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
  // ===== 自分のアバター・デッキをPlayerへ公開 =====
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

    // 保存済みデッキがあれば、
    // 入場直後から「このデッキではじめる」を押せる状態にする。
    setMyDeckReady(Boolean(selectedDeck));
    setDeckConfirmed(false);

    // -------------------------------------------------------
    // CPU戦
    // -------------------------------------------------------

    if (!isOnline) {
      buildCpuDeck();

      setPreparationMessage(
        'デッキを確認して「このデッキではじめる」を押してください。',
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
          setBattlePhase('waiting');
          setWaitingMessage(
            'このステージは終了しました。合言葉は解放されています。',
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

        setReadyHost(
          Boolean(data.readyHost),
        );

        setReadyGuest(
          Boolean(data.readyGuest),
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

    const supportStats = {
      hp: Math.max(0, avatar.stats.hp),
      intellect: Math.max(0, avatar.stats.intellect),
      dexterity: Math.max(0, avatar.stats.dexterity),
      charm: Math.max(0, avatar.stats.charm),
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
    if (isOnline && myPlayerRef && myPrivatePlayerRef) {
      try {
        await setDoc(
          myPrivatePlayerRef,
          { hand: nextHand, deck: nextDeck },
          { merge: true },
        );

        await updateDoc(myPlayerRef, {
          handCount: nextHand.length,
          deckCount: nextDeck.length,
        });

        if (cancelled) return;

        setMyHand(nextHand);
        setMyDeck(nextDeck);
        triggerSupportDealAnimation(drawCount);
        revealSupportCardIndexes(Array.from({ length: drawCount }, (_, index) => myHand.length + index));
        previousTurnRef.current = key;
        drawInProgressRef.current = '';
        addLog(`サポートカードを${drawCount}枚ドローしました。`);
      } catch (error) {
        drawInProgressRef.current = '';
        console.error('ターン開始ドロー保存エラー:', error);
      }
      return;
    }

    if (cancelled) return;

    setMyHand(nextHand);
    setMyDeck(nextDeck);
    triggerSupportDealAnimation(drawCount);
    revealSupportCardIndexes(Array.from({ length: drawCount }, (_, index) => myHand.length + index));
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

  // ===== オンライン対戦：手札・山札枚数をPlayerへ公開 =====
  useEffect(() => {
    if (
      !isOnline ||
      !roomId ||
      !authReady ||
      !myPlayerRef ||
      battlePhase === 'finished'
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
};

const submitBattleAction = async (
  action: BattleActionPayload,
  options?: {
    avatars?: BattleAvatar[];
    hand?: SupportCard[];
    deck?: SupportCard[];
    usedSkills?: Record<string, string[]>;
  },
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

    // =====================================================
    // PLAY_SUPPORT
    //
    // 手札確認
    // カード1枚消費
    // Avatar状態保存
    // 山札保存
    // pendingAction保存
    //
    // を同一Transactionで確定する。
    // =====================================================

    if (
      action.type ===
      'PLAY_SUPPORT'
    ) {
      if (
        !action.supportCardId
      ) {
        console.warn(
          'supportCardIdがないサポートActionを拒否しました。',
        );

        return false;
      }

      await runTransaction(
        db,
        async (transaction) => {
          const snapshot =
            await transaction.get(
              privatePlayerRef,
            );

          const playerSnapshot =
            await transaction.get(
              playerRef,
            );

          if (!playerSnapshot.exists()) {
            throw new Error(
              'Playerデータが存在しません。',
            );
          }

          const publicPlayerData =
            playerSnapshot.data() as Record<
              string,
              any
            >;

          const lastSupportActionId =
            typeof publicPlayerData.lastSupportActionId === 'string'
              ? publicPlayerData.lastSupportActionId
              : '';

          if (
            lastSupportActionId === actionId
          ) {
            throw new Error(
              'このSupport Actionはすでに処理済みです。',
            );
          }

          if (
            !snapshot.exists()
          ) {
            throw new Error(
              'Playerデータが存在しません。',
            );
          }

          const playerData =
            snapshot.data() as Record<
              string,
              any
            >;

          const currentHand =
            Array.isArray(
              playerData.hand,
            )
              ? [
                  ...playerData.hand,
                ]
              : [];

          const currentDeck =
            Array.isArray(playerData.deck)
              ? [...playerData.deck]
              : [];

          const actionTurnOrdinal = getBattleTurnOrdinal(
            action.year,
            action.turnIndex,
          );

          const activePlayerAvatar =
            Array.isArray(playerData.avatars)
              ? (playerData.avatars[action.avatarIndex] as BattleAvatar | undefined)
              : undefined;

          const supportUsageLimit = getSupportUsageLimitFromEffects(
            activePlayerAvatar?.supportControlEffects,
            actionTurnOrdinal,
          );

          const currentUsedSkills =
            playerData.usedSkills && typeof playerData.usedSkills === 'object'
              ? (playerData.usedSkills as Record<string, string[]>)
              : {};

          const supportUseCountBefore = getSupportUseCountFromUsedSkills(
            currentUsedSkills,
            action.year,
            action.turnIndex,
          );

          if (
            Number.isFinite(supportUsageLimit) &&
            supportUseCountBefore >= supportUsageLimit
          ) {
            throw new Error('SUPPORT_USE_LIMIT');
          }

          // =================================================
          // ③-⑤ 使用前の所持確認
          // =================================================

          const supportCardIndex =
            currentHand.findIndex(
              (
                handCard: SupportCard,
              ) =>
                handCard.id ===
                action.supportCardId,
            );

          if (
            supportCardIndex ===
            -1
          ) {
            throw new Error(
              '指定されたサポートカードが手札に存在しません。',
            );
          }

          const supportCardCountBefore =
            currentHand.filter(
              (
                handCard: SupportCard,
              ) =>
                handCard.id ===
                action.supportCardId,
            ).length;

          // =================================================
          // ③-⑥ 1枚だけ消費
          // =================================================

          const nextHand = options?.hand
            ? [...options.hand]
            : currentHand.filter(
                (_handCard, index) => index !== supportCardIndex,
              );

          const nextDeck = options?.deck
            ? [...options.deck]
            : currentDeck;

          const supportCardCountAfter =
            nextHand.filter(
              (handCard: SupportCard) =>
                handCard.id === action.supportCardId,
            ).length;

          if (options?.hand || options?.deck) {
            const currentTotalCards = currentHand.length + currentDeck.length;
            const nextTotalCards = nextHand.length + nextDeck.length;
            if (nextTotalCards !== currentTotalCards - 1 || nextDeck.length > currentDeck.length) {
              throw new Error('サポートカード消費後の手札・山札枚数が不正です。');
            }
          }

          if (
            supportCardCountAfter !==
            supportCardCountBefore - 1
          ) {
            throw new Error(
              'サポートカードの消費枚数が不正です。',
            );
          }

          // =================================================
          // 非公開Player
          //   hand / deck
          // =================================================

          transaction.set(
            privatePlayerRef,
            {
              uid:
                currentUser.uid,

              hand:
                nextHand,

              deck:
                nextDeck,
            },
            {
              merge: true,
            },
          );

          // =================================================
          // 公開Player
          //   枚数 / Avatar / Action
          // =================================================

          transaction.update(
            playerRef,
            {
              handCount:
                nextHand.length,

              deckCount:
                nextDeck.length,

              ...(options?.avatars
                ? {
                    avatars:
                      options.avatars,
                  }
                : {}),

              usedSkills: setSupportUseCountInUsedSkills(
                options?.usedSkills ?? currentUsedSkills,
                action.year,
                action.turnIndex,
                supportUseCountBefore + 1,
              ),

              lastSupportActionId:
                actionId,

              lastSupportCardId:
                action.supportCardId,

              lastSupportCardCountBefore:
                supportCardCountBefore,

              lastSupportCardCountAfter:
                supportCardCountAfter,

              lastSupportActionAt:
                Date.now(),

              pendingAction: {
                ...action,

                actionId,

                uid:
                  currentUser.uid,

                playerRole,

                submittedAt:
                  Date.now(),

                supportCardConsumed:
                  true,

                supportCardCountBefore,

                supportCardCountAfter,
              },
            },
          );
        },
      );

      return true;
    }

    // =====================================================
    // PLAY_SUPPORT以外
    //
    // 現時点ではUSE_SKILLなどは
    // 従来どおりpendingActionだけ保存する。
    // =====================================================

    await updateDoc(
      playerRef,
      {
        pendingAction: {
          ...action,

          actionId,

          uid:
            currentUser.uid,

          playerRole,

          submittedAt:
            Date.now(),
        },
      },
    );

    return true;
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
    if (action.type === 'PLAY_SUPPORT') {
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
        !myAvatar
      ) {
        return;
      }

      // =====================================================
      // 使用されたサポートカードを supportCardId から特定
      // =====================================================
      //
      // Firebaseには効果計算済みの内部状態を送らない。
      //
      // 使用したサポートカードのIDだけを共有し、
      // 受信側でも同じカード定義から効果を再現する。
      // =====================================================

      let entries: EntryRecordWithSkills[] = [];

      try {
        const entriesRaw =
          localStorage.getItem(
            'reality_world_entries',
          );

        entries =
          entriesRaw
            ? JSON.parse(entriesRaw)
            : [];
      } catch (error) {
        console.error(
          'サポートカード情報読み込みエラー:',
          error,
        );
      }

      const supportPool =
        getSupportPool(entries);

      const opponentSupportCard =
        action.supportCardId
          ? supportPool.find(
              (card) =>
                card.id ===
                action.supportCardId,
            )
          : undefined;

      // -----------------------------------------------------
      // カードが特定できなかった場合
      // -----------------------------------------------------

      if (!opponentSupportCard) {
        addLog(
          '相手がサポートカードを使用しました。',
        );

        return;
      }

    // =====================================================
    // ③-⑤ サポートActionとPlayer状態の整合性検証
    //
    // 送信側ではsubmitBattleAction()のTransactionによって
    //
    //   ① 手札に対象カードが存在する
    //   ② 対象カードを1枚だけ消費する
    //   ③ pendingActionを保存する
    //
    // を同時に確定している。
    //
    // 受信側では、その正式記録と受信Actionが
    // 一致しているか確認する。
    // =====================================================

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
          !opponentPlayerSnapshot.exists()
        ) {
          return;
        }

        const opponentPlayerData =
          opponentPlayerSnapshot.data() as Record<
            string,
            any
          >;

        const pendingAction =
          opponentPlayerData.pendingAction;

        // ---------------------------------------------------
        // Action ID一致確認
        // ---------------------------------------------------

        if (
          !pendingAction ||
          pendingAction.actionId !==
            action.actionId
        ) {
          console.warn(
            'PlayerのpendingActionと受信Actionが一致しません。',
            {
              actionId:
                action.actionId,
              pendingActionId:
                pendingAction?.actionId,
            },
          );

          return;
        }

        // ---------------------------------------------------
        // supportCardId一致確認
        // ---------------------------------------------------

        if (
          pendingAction.supportCardId !==
          action.supportCardId
        ) {
          console.warn(
            'pendingActionのsupportCardIdと受信Actionが一致しません。',
            {
              actionSupportCardId:
                action.supportCardId,
              pendingSupportCardId:
                pendingAction?.supportCardId,
            },
          );

          return;
        }

        // ---------------------------------------------------
        // カード消費済み確認
        // ---------------------------------------------------
    
        if (
          pendingAction.supportCardConsumed !==
          true
        ) {
          console.warn(
            'サポートカード消費済みフラグが確認できないActionを無視しました。',
          );
    
          return;
        }

        // ---------------------------------------------------
        // 使用前・使用後の枚数を確認
        // ---------------------------------------------------
    
        const countBefore =
          Number(
            pendingAction.supportCardCountBefore,
          );

        const countAfter =
          Number(
            pendingAction.supportCardCountAfter,
          );
    
        if (
          !Number.isInteger(
            countBefore,
          ) ||
          !Number.isInteger(
            countAfter,
          ) ||
          countBefore <= 0 ||
          countAfter !==
            countBefore - 1
        ) {
          console.warn(
            'サポートカードの消費枚数が不正なActionを無視しました。',
            {
              supportCardId:
                action.supportCardId,
              countBefore,
              countAfter,
            },
          );
    
          return;
        }

        // ---------------------------------------------------
        // Player側に記録された消費情報も確認
        // ---------------------------------------------------

        const recordedCardId =
          opponentPlayerData.lastSupportCardId;

        const recordedActionId =
          opponentPlayerData.lastSupportActionId;

        if (
          recordedCardId !==
            action.supportCardId ||
          recordedActionId !==
            action.actionId
        ) {
          console.warn(
            'サポートカード消費記録とActionが一致しません。',
            {
              actionId:
                action.actionId,
              supportCardId:
                action.supportCardId,
              recordedActionId,
              recordedCardId,
            },
          );
    
          return;
        }
      } catch (error) {
        console.error(
          'サポートAction整合性検証エラー:',
          error,
        );

        return;
      }
    }

      // =====================================================
      // サポートカード効果を受信側でも再現
      // =====================================================

      const opponentPreset =
        getEmotionPresetForCard(
          opponentSupportCard,
        );

      await playSupportPreResultEffect({
        effectKey: getSupportBattleEffect(
          opponentPreset,
        ),
        cardName: opponentSupportCard.name,
        imageUrl: getSupportImage(opponentSupportCard),
        targetPositions: getSupportTargetPositions(),
        dialogue: opponentPreset?.description,
        colorHex: undefined,
        target: getSupportBattleTarget(
          opponentPreset,
          false,
        ),
      });

      const applied =
        applyEmotionToPair(
          opponentSupportCard,
          opponentAvatar,
          myAvatar,
        );

      // -----------------------------------------------------
      // 相手（カード使用者）側
      // -----------------------------------------------------

      let nextOppAvatars =
        oppAvatars.map(
          (avatar, index) =>
            index === avatarIndex
              ? applied.actor
              : avatar,
        );

      // -----------------------------------------------------
      // 自分（カード効果対象側）
      // -----------------------------------------------------

      let nextMyAvatars =
        myAvatars.map(
          (avatar, index) =>
            index === avatarIndex
              ? applied.target
              : avatar,
        );

      const incomingSupportTurnOrdinal = getBattleTurnOrdinal(
        action.year,
        action.turnIndex,
      );

      if (applied.actorSupportControlEffect) {
        nextOppAvatars = applySupportControlToAllAvatars(
          nextOppAvatars,
          applied.actorSupportControlEffect,
          incomingSupportTurnOrdinal,
        );
      }
      if (applied.targetSupportControlEffect) {
        nextMyAvatars = applySupportControlToAllAvatars(
          nextMyAvatars,
          applied.targetSupportControlEffect,
          incomingSupportTurnOrdinal,
        );
      }

      const gainedScore =
        applied.scoreDelta;

      // =====================================================
      // 状態反映
      // =====================================================

      setMyAvatars(
        nextMyAvatars,
      );

      setOppAvatars(
        nextOppAvatars,
      );

      // =====================================================
      // サポート効果を受けた自分のAvatar状態を正式保存
      // =====================================================

      if (
        isOnline &&
        roomId
      ) {
        const myPlayerBattleRef =
          doc(
            db,
            'rooms',
            roomId,
            'players',
            playerRole,
          );

        void updateDoc(
          myPlayerBattleRef,
          {
            avatars:
              nextMyAvatars,
          },
        ).catch((error) => {
          console.error(
            'サポート効果を受けた側のAvatar保存エラー:',
            error,
          );
        });
      }

      // =====================================================
      // ログ
      // =====================================================

      addLog(
        `相手がサポート「${opponentSupportCard.name}」を使用しました。` +
          (
            opponentPreset?.description
              ? ` ${opponentPreset.description}`
              : ''
          ),
      );

      // =====================================================
      // Firestoreの正式状態を更新
      // =====================================================
      //
      // サポート使用では turnIndex を変更しない。
      // スコアはここでのみ正式に加算し、Room snapshotを通じて
      // 受信側のスコア表示・ゲージへ反映する。
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

        const actorRole =
          action.playerRole === 'host'
            ? 'host'
            : 'guest';

        const scoreField =
          actorRole === 'host'
            ? 'hostClassScores'
            : 'guestClassScores';

        const totalField =
          actorRole === 'host'
            ? 'hostTotalScore'
            : 'guestTotalScore';

        try {
          await runTransaction(
            db,
            async (transaction) => {
              const snapshot =
                await transaction.get(
                  roomRef,
                );

              if (!snapshot.exists()) {
                return;
              }

              const roomData =
                snapshot.data() as Record<
                  string,
                  any
                >;

              const scores =
                Array.isArray(
                  roomData[scoreField],
                )
                  ? [
                      ...roomData[
                        scoreField
                      ],
                    ]
                  : [0, 0, 0];

              scores[avatarIndex] =
                Number(
                  scores[avatarIndex] ||
                    0,
                ) + gainedScore;

              const nextTotal =
                Number(
                  roomData[totalField] ||
                    0,
                ) + gainedScore;

              transaction.update(
                roomRef,
                {
                  [scoreField]:
                    scores,
                  [totalField]:
                    nextTotal,
                },
              );
            },
          );
        } catch (error) {
          console.error(
            '相手のサポート結果同期エラー:',
            error,
          );
        }
      }

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
          effective[stat] * 10;

      } else if (
        skill.rule ===
        'product_score'
      ) {
        const first =
          skill.primaryStat || 'hp';

        const second =
          skill.secondaryStat ||
          'intellect';

        gainedScore =
          effective[first] *
          effective[second];

      } else if (
        skill.rule ===
        'difference_score'
      ) {
        const stat =
          skill.primaryStat || 'hp';

        gainedScore =
          Math.max(
            0,
            effective[stat] -
              opponentEffective[stat],
          ) * 20;

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

        gainedScore =
          (effective[first] +
            effective[second]) *
          5;

        debuffs[target] =
          Math.ceil(
            opponentEffective[target] / 2,
          );

      } else if (
        skill.rule ===
        'y_total_score'
      ) {
        gainedScore =
          Object.values(
            effective,
          ).reduce(
            (sum, value) =>
              sum + value,
            0,
          ) * 5;

      } else if (
        skill.rule ===
        'y_response_score'
      ) {
        const selectedResponseStat = action.selectedBoostStat || 'hp';
        gainedScore =
          Math.max(
            0,
            effective[selectedResponseStat] - opponentEffective[selectedResponseStat],
          ) * 20;

      } else if (
        skill.rule ===
        'y_burst'
      ) {
        gainedScore = 100;

        const selectedBoostStat =
          action.selectedBoostStat;

        if (selectedBoostStat) {
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
                        [selectedBoostStat]: 2,
                      },
                    }
                  : avatar,
            );
        }

      } else if (
        skill.rule ===
        'y_crash'
      ) {
        Object.entries(
          opponentEffective,
        ).forEach(
          ([key, value]) => {
            debuffs[
              key as StatKey
            ] =
              Math.ceil(
                value * 0.25,
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

const opponentSupportScoreModifier = getSupportScoreModifierFromEffects(
  opponentAvatar.supportControlEffects,
  getBattleTurnOrdinal(action.year, action.turnIndex),
);
gainedScore = Math.max(0, gainedScore + opponentSupportScoreModifier);

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

          if (
            skill.maxUsesPerClass > 0 &&
            !current.includes(skill.id)
          ) {
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


  // ===== 先手・後手を決定（デッキ確定後のみ） =====
  const decideFirstPlayer = async () => {
    if (battlePhase !== 'setup' || isCoinTossing || !deckConfirmed || (isOnline && !authReady)) return;
    // オンラインでは両者がデッキ確定してから、ホストだけがコイントスを行う。
    if (isOnline && !isHost) return;
    if (isOnline && currentYear === 1 && (!readyHost || !readyGuest)) return;

    setIsCoinTossing(true);
    await new Promise((resolve) => setTimeout(resolve, 650));
    const result: PlayerRole = Math.random() < 0.5 ? 'host' : 'guest';

    if (!isOnline) {
      setFirstPlayer(result);
      setStartSeasonIdx(0);
      setPreparationMessage(
        `コイントス結果：${result === 'host' ? '自分' : 'CPU'}が先手です。\n春から${ROLE_NAMES[currentYear - 1]}戦を開始します。`,
      );
      addLog(`🪙 コイントス結果：${result === 'host' ? '自分' : 'CPU'}が先手です。`);
      setBattlePhase('battle');
      setTurnIndex(0);
      setIsCoinTossing(false);
      return;
    }

    try {
      await updateDoc(doc(db, 'rooms', roomId), {
        firstPlayer: result,
        startSeasonIdx: 0,
        turnIndex: 0,
        battlePhase: 'battle',
      });
      setPreparationMessage(`🪙 コイントス結果：${result === playerRole ? '自分' : '相手'}が先手です。春から${ROLE_NAMES[currentYear - 1]}戦を開始します。`);
      addLog(`🪙 コイントス結果：${result === playerRole ? '自分' : '相手'}が先手です。`);
    } catch (error) {
      console.error('コイントス結果の同期エラー:', error);
      addLog('⚠️ 先手決定に失敗しました。');
    } finally {
      setIsCoinTossing(false);
    }
  };

  // ===== 選択デッキを確定（ここではまだ対戦を開始しない） =====
  const startBattleWithDeck = async () => {
    if (battlePhase !== 'setup' || !myDeckReady || deckConfirmed || (isOnline && !authReady)) return;
    // 中堅戦・大将戦ではデッキ変更・再確定を行わない。
    if (currentYear > 1) return;

    if (!isOnline) {
      setDeckConfirmed(true);
      setPreparationMessage('デッキを確定しました。コイントスを行って先手・後手を決定してください。');
      addLog('このデッキを対戦用デッキとして確定しました。');
      return;
    }

    setDeckConfirmed(true);
    const field = playerRole === 'host' ? 'readyHost' : 'readyGuest';
    await updateDoc(doc(db, 'rooms', roomId), {
      [field]: true,
      [playerRole === 'host' ? 'hostDeckId' : 'guestDeckId']: activeDeckId,
    });
    setPreparationMessage('このデッキでの準備が完了しました。両者のデッキ確定後、ルーム作成者がコイントスを行います。');
  };

  // 両者の準備完了後、ホストがbattleへ移行
  useEffect(() => {
    if (!isOnline || !isHost || battlePhase !== 'setup' || !firstPlayer || startSeasonIdx === null) return;
    if (currentYear === 1 && (!readyHost || !readyGuest)) return;
    // 現在準備しているクラス番号をそのまま引き継ぐ。
    // ここを 1 固定にすると、中堅戦・大将戦の開始時に先鋒戦へ巻き戻ってしまう。
    void updateDoc(doc(db, 'rooms', roomId), {
      battlePhase: 'battle',
      currentYear,
      turnIndex: 0,
    });
  }, [isOnline, isHost, battlePhase, firstPlayer, startSeasonIdx, readyHost, readyGuest, roomId]);

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

  const continueAfterClassResult = async () => {
    if (!classResult || (isOnline && !authReady)) return;

    const completedYear = classResult.completedYear;
    setClassResult(null);

    if (completedYear < 3) {
      // 先鋒→中堅→大将は、必ず「次の年」の準備状態から再開する。
      // CPU戦でも、先鋒戦の状態を再利用せず、コイントスをもう一度行う。
      setCurrentYear(completedYear + 1);
      setTurnIndex(0);
      setFirstPlayer(null);
      setStartSeasonIdx(null);
      setBattlePhase('setup');

      // デッキは継続使用するが、デッキ変更は許可しない。
      setMyDeckReady(true);
      setDeckConfirmed(true);

      // =====================================================
      // 次のクラスはサポートデッキを18枚から再スタート
      //
      // 初期手札4枚
      // 山札14枚
      // =====================================================

      const nextDeckDefinition =
        activeDeckId
          ? loadDeckDefinition(activeDeckId)
          : null;

      const nextSupportState =
        resetLocalSupportDeck(
          nextDeckDefinition,
        );

// -----------------------------------------------------
// オンラインでは次クラスの手札・山札を
// privatePlayersへ正式保存
// -----------------------------------------------------

if (
  isOnline &&
  myPlayerRef &&
  myPrivatePlayerRef
) {
  try {
    // =================================================
    // 非公開Player
    //   hand / deck
    // =================================================

    await setDoc(
      myPrivatePlayerRef,
      {
        hand:
          nextSupportState.hand,

        deck:
          nextSupportState.deck,
      },
      {
        merge: true,
      },
    );

    // =================================================
    // 公開Player
    //   handCount / deckCount / lastSeenAt
    // =================================================

    await updateDoc(
      myPlayerRef,
      {
        handCount:
          nextSupportState.hand.length,

        deckCount:
          nextSupportState.deck.length,

        // 旧構造の秘密情報を削除
        hand:
          deleteField(),

        deck:
          deleteField(),
      },
    );
  } catch (error) {
    console.error(
      '次クラスのサポートデッキ初期化保存エラー:',
      error,
    );

    addLog(
      '⚠️ 次クラスの手札・山札初期化に失敗しました。',
    );
  }
}

      // 新しいクラスでは「このクラス1回」の技使用状況だけリセットする。
      // 新しいクラスでは「このクラス1回」の技使用状況だけリセットする。
      setUsedSkillsByClass((prev) => {
        const next = { ...prev };
        delete next[String(completedYear + 1)];
        return next;
      });
      setCpuUsedSkillsByClass((prev) => {
        const next = { ...prev };
        delete next[String(completedYear + 1)];
        return next;
      });

      setPreparationMessage(
        `${completedYear + 1}年目の準備を開始します。デッキは前のクラスから継続します。\nコイントスを行ってください。`,
      );

      // オンライン対戦では、前クラス終了時にルーム側もすでに次クラスの setup へ
      // 移行済みだが、ここでも現在クラスの番号を明示して巻き戻しを防ぐ。
      if (isOnline) {
        void updateDoc(doc(db, 'rooms', roomId), {
          battlePhase: 'setup',
          currentYear: completedYear + 1,
          turnIndex: 0,
          firstPlayer: null,
          startSeasonIdx: null,
        });
      }
    } else {
      setBattlePhase('finished');
      setPreparationMessage('');
    }
  };

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
    if (skill.maxUsesPerClass > 0 && usedForClass.includes(skill.id)) {
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

    if (skill.rule === 'primary_score') {
      const stat = skill.primaryStat || 'hp';
      gainedScore = getStat(effective, stat) * 10;
    } else if (skill.rule === 'product_score') {
      const first = skill.primaryStat || 'hp';
      const second = skill.secondaryStat || 'intellect';
      gainedScore = getStat(effective, first) * getStat(effective, second);
    } else if (skill.rule === 'difference_score') {
      const stat = skill.primaryStat || 'hp';
      gainedScore = Math.max(0, getStat(effective, stat) - getStat(opponentEffective, stat)) * 20;
    } else if (skill.rule === 'combo_score_and_debuff') {
      const first = skill.secondaryStat || 'intellect';
      const second = skill.tertiaryStat || 'charm';
      const target = skill.primaryStat || 'hp';
      gainedScore = (getStat(effective, first) + getStat(effective, second)) * 5;
      debuffStat = target;
      debuffAmount = Math.ceil(getStat(opponentEffective, target) / 2);
      debuffs[target] = debuffAmount;
      if (debuffAmount > 0 && !oppActiveAvatar.debuffImmune) {
        nextOppAvatars = oppAvatars.map((avatar, index) =>
          index === activeIndex
            ? { ...avatar, currentDebuff: { ...avatar.currentDebuff, [target]: avatar.currentDebuff[target] + debuffAmount } }
            : avatar,
        );
      }
    } else if (skill.rule === 'y_total_score') {
      gainedScore = Object.values(effective).reduce((sum, value) => sum + value, 0) * 5;
    } else if (skill.rule === 'y_response_score') {
      selectedBoostStat = selectedStatOverride || null;
      if (!selectedBoostStat) return;
      gainedScore = Math.max(0, getStat(effective, selectedBoostStat) - getStat(opponentEffective, selectedBoostStat)) * 20;
    } else if (skill.rule === 'y_burst') {
      selectedBoostStat = selectedStatOverride || null;
      if (!selectedBoostStat) return;
      gainedScore = 100;
      nextMyAvatars = myAvatars.map((avatar, index) =>
        index === activeIndex
          ? { ...avatar, statBoost: { ...(avatar.statBoost || {}), [selectedBoostStat!]: 2 } }
          : avatar,
      );
    } else if (skill.rule === 'y_crash') {
      Object.entries(opponentEffective).forEach(([key, value]) => {
        const stat = key as StatKey;
        debuffs[stat] = Math.ceil(value * 0.25);
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

    const supportScoreModifier = getSupportScoreModifierFromEffects(
      myActiveAvatar.supportControlEffects,
      getBattleTurnOrdinal(currentYear, turnIndex),
    );
    gainedScore = Math.max(0, gainedScore + supportScoreModifier);

    const nextUsed = {
      ...usedSkillsByClass,
      [usedKey]:
        skill.maxUsesPerClass > 0 && !usedForClass.includes(skill.id)
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
      setMyAvatars(nextMyAvatars);
      setOppAvatars(nextOppAvatars);
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

    setMyAvatars(nextMyAvatars);
    setOppAvatars(nextOppAvatars);

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
    const presetId = card.id.startsWith(VIRTUAL_SUPPORT_PREFIX)
      ? card.id.slice(VIRTUAL_SUPPORT_PREFIX.length)
      : undefined;
    return presetId
      ? EMOTION_PRESETS.find((emotion) => emotion.id === presetId)
      : EMOTION_PRESETS.find((emotion) => emotion.name === card.name);
  };

  const getSupportImage = (card: SupportCard) => {
    const withImage = card as SupportCard & { imageDataUrl?: string };
    if (withImage.imageDataUrl) return withImage.imageDataUrl;
    const preset = getEmotionPresetForCard(card);
    return preset ? `/support_sample/${encodeURIComponent(preset.name)}.jpg` : undefined;
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
        extraDraw: 0,
        actorSupportControlEffect: undefined as SupportControlEffectState | undefined,
        targetSupportControlEffect: undefined as SupportControlEffectState | undefined,
      };
    }

    const amount = parseEmotionAmount(preset.effectAmount);
    const statMap: Partial<Record<EmotionPreset['effectCategory'], StatKey>> = {
      '体力': 'hp',
      '知略': 'intellect',
      '器用': 'dexterity',
      '特技': 'charm',
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
      const effect: SupportControlEffectState = {
        id: createSupportEffectId(preset.id),
        sourcePresetId: preset.id,
        duration: preset.duration,
        kind,
        expiresAtTurnOrdinal: getSupportEffectExpiration(preset, turnOrdinal, appliesToOpponent),
      };
      if (kind === 'limit') effect.maxUsesPerTurn = Math.max(0, amount || 1);
      if (kind === 'extra_draw') effect.extraDrawPerTurn = Math.max(0, amount || 1);
      if (kind === 'score') effect.scoreDeltaPerTurn = amount;
      return effect;
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
        actorSupportControlEffect = makeControlEffect('score', false);
        if (actorSupportControlEffect) {
          actorSupportControlEffect.scoreDeltaPerTurn = Math.abs(amount);
        }
      } else if (preset.target === '相手') {
        targetSupportControlEffect = makeControlEffect('score', true);
        if (targetSupportControlEffect) {
          targetSupportControlEffect.scoreDeltaPerTurn = -Math.abs(amount);
        }
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
      if (preset.name === '手鏡') {
        const highest = Math.max(...Object.values(targetEffective));
        const key = STAT_KEYS.find((item) => targetEffective[item] === highest) || 'hp';
        addActorAvatarEffect({
          sourcePresetId: preset.id,
          statOverride: { [key]: highest },
          expiresAtTurnOrdinal: getSupportEffectExpiration(preset, turnOrdinal, false),
        });
      } else if (preset.name === '押し売り') {
        const lowest = Math.min(...Object.values(actorEffective));
        const key = STAT_KEYS.find((item) => actorEffective[item] === lowest) || 'hp';
        addTargetAvatarEffect({
          sourcePresetId: preset.id,
          statOverride: { [key]: lowest },
          expiresAtTurnOrdinal: getSupportEffectExpiration(preset, turnOrdinal, true),
        });
      } else {
        const average = Math.round(
          Object.values(actorEffective).reduce((sum, value) => sum + value, 0) / 4,
        );
        const averageEffect = {
          hp: average,
          intellect: average,
          dexterity: average,
          charm: average,
        };
        if (preset.name === '平穏な空気') {
          addActorAvatarEffect({
            sourcePresetId: preset.id,
            statOverride: averageEffect,
            expiresAtTurnOrdinal: getSupportEffectExpiration(preset, turnOrdinal, false),
          });
        } else if (preset.name === 'トンボがけ') {
          addTargetAvatarEffect({
            sourcePresetId: preset.id,
            statOverride: averageEffect,
            expiresAtTurnOrdinal: getSupportEffectExpiration(preset, turnOrdinal, true),
          });
        }
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
      extraDraw,
      actorSupportControlEffect,
      targetSupportControlEffect,
    };
  };

  // ===== CPUサポートカード選択 =====
  // CPUは「必ず使う」ではなく、手札と状況を見て1枚だけ先に使います。
  // 1) 体力・知略・器用・特技の減少系は、相手の該当値が高いほど優先。
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
    if (Number.isFinite(supportLimit) && supportUseCount >= supportLimit) return null;
    const scored = hand.map((card, index) => {
      const presetId = card.id.startsWith(VIRTUAL_SUPPORT_PREFIX)
        ? card.id.slice(VIRTUAL_SUPPORT_PREFIX.length)
        : undefined;
      const preset = presetId ? EMOTION_PRESETS.find((emotion) => emotion.id === presetId) : EMOTION_PRESETS.find((emotion) => emotion.name === card.name);
      if (!preset) return { card, index, score: 1 + Math.random() * 3 };
      let score = 2 + Math.random() * 4;
      const amount = Number((preset.effectAmount || '').replace(/[^0-9.-]/g, '')) || 0;
      const targetStat: StatKey | null =
        preset.effectCategory === '体力' ? 'hp' :
        preset.effectCategory === '知略' ? 'intellect' :
        preset.effectCategory === '器用' ? 'dexterity' :
        preset.effectCategory === '特技' ? 'charm' : null;
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
    };
  };

  // ===== CPUの自動ターン =====
  // CPUは準備画面の裏で構築した3キャラ＋18枚デッキを使い、
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
      }

      const usedKey = `${currentYear}`;
      const usedForClass = cpuUsedSkillsByClass[usedKey] || [];
      const available = workingCpu.skills.filter(
        (skill) => skill.maxUsesPerClass === 0 || !usedForClass.includes(skill.id),
      );
      const skill = available[available.length - 1] || workingCpu.skills[0];
      if (!skill) return;

      const effective = getEffectiveStats(workingCpu);
      const opponentEffective = getEffectiveStats(workingPlayer);
      let gainedScore = 0;
      let debuffs: Partial<Record<StatKey, number>> = {};

      if (skill.rule === 'primary_score') {
        gainedScore = effective[skill.primaryStat || 'hp'] * 10;
      } else if (skill.rule === 'product_score') {
        gainedScore =
          effective[skill.primaryStat || 'hp'] * effective[skill.secondaryStat || 'intellect'];
      } else if (skill.rule === 'difference_score') {
        const stat = skill.primaryStat || 'hp';
        gainedScore = Math.max(0, effective[stat] - opponentEffective[stat]) * 20;
      } else if (skill.rule === 'combo_score_and_debuff') {
        const first = skill.secondaryStat || 'intellect';
        const second = skill.tertiaryStat || 'charm';
        const target = skill.primaryStat || 'hp';
        gainedScore = (effective[first] + effective[second]) * 5;
        debuffs[target] = Math.ceil(opponentEffective[target] / 2);
      } else if (skill.rule === 'y_total_score') {
        gainedScore = Object.values(effective).reduce((sum, value) => sum + value, 0) * 5;
      } else if (skill.rule === 'y_response_score') {
        const myMin = Math.min(...Object.values(effective));
        const opponentMin = Math.min(...Object.values(opponentEffective));
        gainedScore = Math.max(0, myMin - opponentMin) * 20;
      } else if (skill.rule === 'y_burst') {
        gainedScore = 100;
      } else if (skill.rule === 'y_crash') {
        Object.entries(opponentEffective).forEach(([key, value]) => {
          debuffs[key as StatKey] = Math.ceil(value * 0.25);
        });
      } else {
        gainedScore = effective.hp * 10;
      }

      gainedScore = Math.max(
        0,
        gainedScore +
          getSupportScoreModifierFromEffects(
            workingCpu.supportControlEffects,
            cpuTurnOrdinal,
          ),
      );

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
          skill.maxUsesPerClass > 0 && !usedForClass.includes(skill.id)
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
        // 2年目・3年目は同じデッキを継続使用し、デッキ変更は不可。
        // デッキはすでに確定済みなので、次のコイントスへそのまま進める。
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
    Number.isFinite(supportUseLimit) &&
    supportUseCount >= supportUseLimit
  ) {
    addLog('このターンはサポートカードをこれ以上使用できません。');
    return;
  }

  supportSubmitInProgressRef.current = true;

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

    const supportPreset =
      getEmotionPresetForCard(
        card,
      );

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
        dialogue: supportPreset?.description,
        colorHex: undefined,
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
        },
        {
          avatars:
            nextMyAvatars,
          hand:
            nextHand,
          deck:
            nextDeck,
          usedSkills:
            nextUsedSkills,
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
      dialogue: supportPreset?.description,
      colorHex: undefined,
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
    // キャラ3人をデッキから完全再生成
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

    // 新しいゲームではデッキは既存選択を継続する。
    // ただし「このデッキではじめる」は再度押せる状態へ戻す。
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

  // ===== クラス間の準備をホストがリセット =====
  const resetForNextClass = async () => {
    if (!isHost || battlePhase !== 'setup' || currentYear > 3) return;

    await updateDoc(doc(db, 'rooms', roomId), {
      firstPlayer: null,
      startSeasonIdx: null,
      turnIndex: 0,
      battlePhase: 'setup',
    });
    addLog(`${currentYear}年目（${ROLE_NAMES[currentYear - 1]}戦）の準備を開始します。`);
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
        setWaitingMessage(
          'CPU対戦を終了しました。',
        );
        setBattlePhase(
          'waiting',
        );
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

    setWaitingMessage(
      '対戦を終了しました。ホームへ戻ります。',
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

  // ===== 準備画面用：現在選択中デッキの概要 =====
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

  // ===== デッキ選択 =====
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
      'デッキを変更しました。もう一度「このデッキではじめる」を押してください。',
    );
    } else {
      setPreparationMessage(`デッキ「${selectedDeck?.name || '新しいデッキ'}」を選択しました。`);
    }
  };

  // ===== 現在の技の使用状況 =====
  const usedThisClass = usedSkillsByClass[String(currentYear)] || [];

  // ===== 待機キャラの表示順 =====
  // ホスト：大将 → 中堅 → 先鋒
  // ゲスト：先鋒 → 中堅 → 大将
  const hostWaitingIndexes = [2, 1, 0];
  const guestWaitingIndexes = [0, 1, 2];

  return (
    <div className="relative min-h-[calc(100vh-120px)] overflow-hidden text-slate-900">
      <BattleEffectLayer />
      <OutdoorStageBackground season={currentSeason} />

      <div className="relative z-10 mx-auto w-full max-w-7xl p-2 sm:p-3 md:p-5">
        {/* ===== ヘッダー：ここで完全に閉じる ===== */}
        <header className="w-full rounded-2xl border border-white/50 bg-white/65 p-2.5 shadow-lg backdrop-blur-md sm:p-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-xs font-black opacity-60">REALITY LIVE BATTLE</div>
              <div className="text-xl font-black">
                {currentYear}年目　{ROLE_NAMES[currentYear - 1]}戦
                {battlePhase === 'battle' && <>　／　{currentSeason}</>}
              </div>
            </div>

            <div className="flex items-center gap-2 rounded-xl bg-slate-950/85 px-3 py-2 text-white shadow sm:px-4">
              <div className="text-center">
                <div className="text-[10px] opacity-60">自分</div>
                <div className="text-2xl font-black">
                  {myTotalScore}<span className="text-xs">スコア</span>
                </div>
              </div>
              <div className="px-2 text-xs font-black opacity-50">VS</div>
              <div className="text-center">
                <div className="text-[10px] opacity-60">相手</div>
                <div className="text-2xl font-black">
                  {opponentTotalScore}<span className="text-xs">スコア</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
                            {battlePhase === 'battle' && (
                <span
                  className={`rounded-full px-3 py-1 text-xs font-black ${
                    myTurn ? 'bg-amber-300' : 'bg-slate-900 text-white'
                  }`}
                >
                  {myTurn ? '自分のターン' : '相手のターン'}
                </span>
              )}
            </div>
          </div>
        </header>

        {/* ===== クラス終了リザルト ===== */}
        {classResult && (
          <section className="mt-4 rounded-3xl border border-white/70 bg-white/95 p-6 text-center shadow-2xl backdrop-blur-md">
            <div className="text-xs font-black tracking-widest opacity-50">CLASS RESULT</div>
            <h2 className="mt-1 text-2xl font-black">{ROLE_NAMES[classResult.completedYear - 1]}戦 終了</h2>
            <div className="mt-5 grid grid-cols-2 gap-3">
              <div className="rounded-2xl border border-indigo-200 bg-indigo-50 p-4">
                <div className="text-sm font-black text-indigo-700">自分</div>
                <div className="mt-1 text-3xl font-black">{classResult.myScore}<span className="text-sm">スコア</span></div>
              </div>
              <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4">
                <div className="text-sm font-black text-rose-700">相手</div>
                <div className="mt-1 text-3xl font-black">{classResult.opponentScore}<span className="text-sm">スコア</span></div>
              </div>
            </div>
            <div className="mt-4 text-xl font-black">
              {classResult.myScore > classResult.opponentScore ? 'このクラスは自分の勝利！' : classResult.myScore < classResult.opponentScore ? 'このクラスは相手の勝利。' : 'このクラスは引き分け。'}
            </div>
            <div className="mt-2 text-sm font-bold opacity-60">
              累計　{classResult.myTotal}スコア　VS　{classResult.opponentTotal}スコア
            </div>
            <button
              onClick={continueAfterClassResult}
              className="mt-6 w-full rounded-xl bg-indigo-600 px-5 py-3 text-base font-black text-white shadow-lg hover:bg-indigo-700"
            >
              {classResult.completedYear < 3 ? '次のクラスの準備へ' : '最終結果を見る'}
            </button>
          </section>
        )}

        {/* ===== 準備フェイズ ===== */}
        {battlePhase === 'setup' && !classResult && (
          <section className="mt-4 rounded-3xl border border-white/60 bg-white/75 p-5 shadow-xl backdrop-blur-md">
            <div className="text-center">
              <div className="text-xs font-black tracking-widest opacity-50">PREPARATION</div>
              <h2 className="mt-1 text-3xl font-black">
                {currentYear}年目　{ROLE_NAMES[currentYear - 1]}戦の準備
              </h2>
              {preparationMessage && (
                <div className="mx-auto mt-3 max-w-2xl whitespace-pre-line rounded-2xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm font-black text-indigo-900">
                  {preparationMessage}
                </div>
              )}
            </div>

            {/* STEP 1：デッキ確定。先鋒戦前だけ変更可能。中堅・大将戦では固定。 */}
            <div className="mt-5 rounded-2xl border border-white/50 bg-white/70 p-4">
              <div className="text-xs font-black opacity-60">STEP 1</div>
              <div className="mt-1 text-lg font-black">現在選択中のデッキ</div>

              {(() => {
                const deck = activeDeckId ? loadDeckDefinition(activeDeckId) : null;
                const deckName = deck?.name || 'デッキ未選択';
                const supportSummary = getDeckSupportSummary(deck);

                return (
                  <div className="mt-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-black">{deckName}</div>
                      <div className="text-[10px] font-bold opacity-50">
                        実戦デッキ 18枚
                      </div>
                    </div>

                    <div className="mt-3 grid grid-cols-3 gap-2">
                      {ROLE_NAMES.map((role, index) => {
                        const avatar = myAvatars[index];

                        return (
                          <div
                            key={role}
                            className="min-w-0 rounded-xl bg-slate-100 p-2"
                          >
                            <div className="text-[9px] font-black opacity-50">{role}</div>

                            {avatar ? (
                              <div className="mt-1 flex items-center gap-2">
                                <img
                                  src={avatar.card.imageDataUrl}
                                  alt=""
                                  className="h-12 w-9 shrink-0 rounded-md bg-white object-contain p-0.5"
                                />
                                <div className="min-w-0">
                                  <div className="truncate text-[11px] font-black">
                                    {avatar.card.userName}
                                  </div>
                                  <div className="mt-0.5 text-[8px] font-bold opacity-55">
                                    体{avatar.baseStats.hp} 知{avatar.baseStats.intellect} 器{avatar.baseStats.dexterity} 特{avatar.baseStats.charm}
                                  </div>
                                </div>
                              </div>
                            ) : (
                              <div className="py-3 text-[10px] font-bold opacity-40">
                                未設定
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    <div className="mt-1 text-[10px] font-bold leading-relaxed text-slate-500">
                      サポート内訳：{supportSummary}
                    </div>
                  </div>
                );
              })()}

              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <button
                  onClick={() => setIsDeckSelectOpen(true)}
                  disabled={battlePhase !== 'setup' || currentYear !== 1 || (isOnline && (playerRole === 'host' ? readyHost : readyGuest))}
                  className="w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-black disabled:cursor-not-allowed disabled:opacity-40"
                >
                  デッキを変更
                </button>
                <button
                  onClick={() => void startBattleWithDeck()}
                  disabled={!myDeckReady || deckConfirmed || currentYear !== 1 || (isOnline && (playerRole === 'host' ? readyHost : readyGuest))}
                  className="w-full rounded-xl bg-emerald-600 px-4 py-3 text-sm font-black text-white shadow-lg transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  このデッキではじめる
                </button>
              </div>

              <div className="mt-2 text-xs font-bold opacity-50">
                {currentYear === 1
                  ? (isOnline
                    ? '両者のデッキ確定後にコイントスを行い、春から開始します。'
                    : 'デッキを確定するとコイントスを行い、春から開始します。')
                  : 'この対戦ではデッキ変更できません。前のクラスと同じデッキを継続使用します。'}
              </div>
            </div>

            {/* STEP 2：双方のデッキ確定後にコイントス。 */}
            <div className="mt-4 rounded-2xl bg-slate-950/90 p-4 text-white">
              <div className="text-xs font-black opacity-50">STEP 2</div>
              <div className="mt-1 text-lg font-black">🪙 先手・後手をコイントスで決定</div>
              {!firstPlayer ? (
                isOnline ? (
                  isHost && (currentYear > 1 || (readyHost && readyGuest)) ? (
                    <button onClick={() => void decideFirstPlayer()} disabled={isCoinTossing} className="mt-4 w-full rounded-xl bg-amber-400 px-5 py-3 font-black text-slate-950 disabled:opacity-50">
                      {isCoinTossing ? '🪙 コイントス中…' : '🪙 コイントスを行う'}
                    </button>
                  ) : (
                    <div className="mt-4 rounded-xl bg-white/10 p-3 text-sm font-bold">
                      {currentYear > 1 ? '前のクラスと同じデッキを使用します。コイントスで先手を決めます。' : '両者のデッキ確定後、コイントスで先手を決めます。'}
                    </div>
                  )
                ) : (
                  deckConfirmed ? (
                    <button onClick={() => void decideFirstPlayer()} disabled={isCoinTossing} className="mt-4 w-full rounded-xl bg-amber-400 px-5 py-3 font-black text-slate-950 disabled:opacity-50">
                      {isCoinTossing ? '🪙 コイントス中…' : '🪙 コイントスを行う'}
                    </button>
                  ) : (
                    <div className="mt-4 rounded-xl bg-white/10 p-3 text-sm font-bold">先にSTEP 1の「このデッキではじめる」を押してデッキを確定してください。</div>
                  )
                )
              ) : (
                <div className="mt-4 rounded-xl bg-white/10 p-3 text-lg font-black text-amber-300">
                  {firstPlayer === playerRole ? '自分' : '相手'} が先手
                </div>
              )}
            </div>

          </section>
        )}

        {/* ===== 待機中 ===== */}
        {battlePhase === 'waiting' && (
          <section className="mt-4 rounded-3xl border border-white/60 bg-white/80 p-8 text-center shadow-xl backdrop-blur-md">
            <div className="text-5xl">🎤</div>
            <h2 className="mt-3 text-2xl font-black">対戦相手を待っています</h2>
            <p className="mx-auto mt-3 max-w-lg whitespace-pre-line text-sm font-bold opacity-70">
              {waitingMessage}
            </p>
            <button
              onClick={() => window.location.reload()}
              className="mt-5 rounded-xl bg-slate-900 px-5 py-3 text-sm font-black text-white"
            >
              退出する
            </button>
          </section>
        )}

        {/* ================================================================== */}
        {/* ===== 対戦盤面：ヘッダーの直下から「待機列 → 対戦 → 手番…」 ===== */}
        {/* ================================================================== */}
        {battlePhase === 'battle' && (
          <section className="mt-4 space-y-4">
            {/* ===== ① 待機キャラ6枚：現在対戦中キャラの上 ===== */}
            <div className="rounded-3xl border border-white/60 bg-white/35 p-3 shadow-xl backdrop-blur-md">
              <div className="mb-3 grid grid-cols-2 gap-3 text-center text-xs font-black">
                <div className="rounded-full bg-indigo-700 px-3 py-1.5 text-white">自分</div>
                <div className="rounded-full bg-slate-950/80 px-3 py-1.5 text-white">相手</div>
              </div>

              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
                {/* ホスト：大将 → 中堅 → 先鋒 */}
                {hostWaitingIndexes.map((index) => {
                  const avatar = myAvatars[index] || DEFAULT_MY_AVATARS[index];
                  const active = index === activeIndex;

                  return (
                    <button
                      key={`host_${avatar.card.id}_${index}`}
                      onClick={() => setModalAvatar(avatar)}
                      className={`min-w-0 rounded-2xl border p-1.5 text-left shadow-md backdrop-blur-md transition sm:p-2 ${
                        active
                          ? 'border-amber-400 bg-white/95 ring-2 ring-amber-300'
                          : 'border-white/60 bg-white/65 hover:bg-white/85'
                      }`}
                    >
                      <div className="text-center text-[9px] font-black opacity-60 sm:text-[10px]">
                        {ROLE_NAMES[index]}
                      </div>
                      <img
                        src={avatar.card.imageDataUrl}
                        alt=""
                        className="mt-1 h-24 w-full rounded-xl bg-white object-contain p-1 sm:h-28"
                      />
                      <div className="mt-1 truncate text-center text-[9px] font-black sm:text-[11px]">
                        {avatar.card.userName}
                      </div>
                    </button>
                  );
                })}

                {/* ゲスト：先鋒 → 中堅 → 大将 */}
                {guestWaitingIndexes.map((index) => {
                  const avatar = oppAvatars[index] || DEFAULT_OPP_AVATARS[index];
                  const active = index === activeIndex;

                  return (
                    <button
                      key={`guest_${avatar.card.id}_${index}`}
                      onClick={() => setModalAvatar(avatar)}
                      className={`min-w-0 rounded-2xl border p-1.5 text-left shadow-md backdrop-blur-md transition sm:p-2 ${
                        active
                          ? 'border-rose-400 bg-white/95 ring-2 ring-rose-300'
                          : 'border-white/60 bg-white/65 hover:bg-white/85'
                      }`}
                    >
                      <div className="text-center text-[9px] font-black opacity-60 sm:text-[10px]">
                        {ROLE_NAMES[index]}
                      </div>
                      <img
                        src={avatar.card.imageDataUrl}
                        alt=""
                        className="mt-1 h-24 w-full rounded-xl bg-white object-contain p-1 sm:h-28"
                      />
                      <div className="mt-1 truncate text-center text-[9px] font-black sm:text-[11px]">
                        {avatar.card.userName}
                      </div>
                    </button>
                  );
                })}
              </div>

              <div className="mt-2 grid grid-cols-6 text-center text-[9px] font-black opacity-45 sm:text-[10px]">
                <span>大将</span>
                <span>中堅</span>
                <span>先鋒</span>
                <span>先鋒</span>
                <span>中堅</span>
                <span>大将</span>
              </div>
            </div>

            {/* ===== ② 現在対戦中の2キャラ：情報左＋レーダー右 ===== */}
            <div className="rounded-3xl border border-white/60 bg-white/35 p-3 shadow-xl backdrop-blur-md">
              <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                {/* 自分：常に左 */}
                <div className="order-2 rounded-3xl border-2 border-indigo-400/80 bg-white/90 p-3 shadow-lg ring-1 ring-indigo-200/70 lg:order-1">
                  <div className="text-center text-xs font-black text-indigo-700">
                    自分　{mySideActiveAvatar.roleName}
                  </div>

                  <div className="mt-2 flex flex-col items-center gap-3 sm:flex-row sm:items-start">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-center gap-2">
                        <div ref={myActiveCardAnchorRef} className="shrink-0">
                          <BattleCardReveal
                            revealed={activeCardsRevealed}
                            width={180}
                            height={224}
                            className="mx-auto w-full max-w-[180px] sm:h-56"
                            colorHex={getBattleVisualColorHex(mySideActiveAvatar.card)}
                          >
                            <img
                              src={mySideActiveAvatar.card.imageDataUrl}
                              alt=""
                              className="h-full w-full rounded-2xl bg-white object-contain p-2 shadow-md"
                            />
                          </BattleCardReveal>
                        </div>
                        <VerticalScoreGauge
                          label="このクラス"
                          score={mySideActiveClassScore}
                          side="self"
                          active={myTurn}
                          compact
                          baseHeightPx={224}
                        />
                      </div>
                      <h3 className="mt-2 text-center text-xl font-black">
                        {mySideActiveAvatar.card.userName}
                      </h3>
                      <div className="mt-3 rounded-xl bg-indigo-50 p-2 text-center">
                        <div className="text-[10px] font-black opacity-50">このクラスの得点</div>
                        <div className="text-xl font-black text-indigo-700">
                          {mySideActiveClassScore}スコア
                        </div>
                      </div>
                    </div>

                    <RadarChart
                      baseStats={mySideActiveAvatar.baseStats || mySideActiveAvatar.card.stats}
                      currentStats={getEffectiveStats(mySideActiveAvatar)}
                    />
                  </div>
                </div>

                {/* 相手：常に右 */}
                <div className="order-1 rounded-3xl border-2 border-rose-400/80 bg-white/90 p-3 shadow-lg ring-1 ring-rose-200/70 lg:order-2">
                  <div className="text-center text-xs font-black text-rose-700">
                    相手　{opponentSideActiveAvatar.roleName}
                  </div>

                  <div className="mt-2 flex flex-col items-center gap-3 sm:flex-row sm:items-start">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-center gap-2">
                        <div ref={opponentActiveCardAnchorRef} className="shrink-0">
                          <BattleCardReveal
                            revealed={activeCardsRevealed}
                            width={180}
                            height={224}
                            className="mx-auto w-full max-w-[180px] sm:h-56"
                            colorHex={getBattleVisualColorHex(opponentSideActiveAvatar.card)}
                          >
                            <img
                              src={opponentSideActiveAvatar.card.imageDataUrl}
                              alt=""
                              className="h-full w-full rounded-2xl bg-white object-contain p-2 shadow-md"
                            />
                          </BattleCardReveal>
                        </div>
                        <VerticalScoreGauge
                          label="このクラス"
                          score={opponentSideActiveClassScore}
                          side="opponent"
                          active={!myTurn}
                          compact
                          baseHeightPx={224}
                        />
                      </div>
                      <h3 className="mt-2 text-center text-xl font-black">
                        {opponentSideActiveAvatar.card.userName}
                      </h3>
                      <div className="mt-3 rounded-xl bg-rose-50 p-2 text-center">
                        <div className="text-[10px] font-black opacity-50">このクラスの得点</div>
                        <div className="text-xl font-black text-rose-700">
                          {opponentSideActiveClassScore}スコア
                        </div>
                      </div>
                    </div>

                    <RadarChart
                      baseStats={opponentSideActiveAvatar.baseStats || opponentSideActiveAvatar.card.stats}
                      currentStats={getEffectiveStats(opponentSideActiveAvatar)}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* ===== ③ 手番 ===== */}
            <div
              className={`rounded-2xl p-3 text-center shadow-lg transition ${
                myTurn
                  ? 'bg-emerald-900/90 text-white ring-2 ring-emerald-300/70'
                  : 'bg-slate-950/85 text-white'
              }`}
            >
              <div className={`text-xs font-black ${myTurn ? 'text-emerald-100 opacity-90' : 'opacity-60'}`}>
                {currentSeason}　／　{Math.floor(turnIndex / 2) + 1}季目　／　
                {turnIndex % 2 === 0 ? '先手' : '後手'}
              </div>
              <div className={`mt-1 text-lg font-black ${myTurn ? 'text-emerald-50' : 'text-white'}`}>
                {myTurn ? '自分のターン' : '相手のターン'}
              </div>
            </div>

            <div className="lg:hidden sticky top-1 z-30 rounded-xl border border-indigo-200 bg-white/95 p-2 shadow-md backdrop-blur">
              <div className="grid grid-cols-2 gap-2">
                <div className="flex items-center gap-2 rounded-lg bg-indigo-50 px-2 py-1.5">
                  <img src={myActiveAvatar.card.imageDataUrl} alt="" className="h-10 w-8 rounded-md bg-white object-contain" />
                  <div className="min-w-0">
                    <div className="truncate text-[10px] font-black text-indigo-800">自分</div>
                    <div className="truncate text-[10px] font-bold text-slate-700">{myActiveAvatar.card.userName}</div>
                    <div className="text-sm font-black text-indigo-700">{mySideActiveClassScore}スコア</div>
                  </div>
                </div>
                <div className="flex items-center gap-2 rounded-lg bg-rose-50 px-2 py-1.5">
                  <img src={oppActiveAvatar.card.imageDataUrl} alt="" className="h-10 w-8 rounded-md bg-white object-contain" />
                  <div className="min-w-0">
                    <div className="truncate text-[10px] font-black text-rose-700">相手</div>
                    <div className="truncate text-[10px] font-bold text-slate-700">{oppActiveAvatar.card.userName}</div>
                    <div className="text-sm font-black text-rose-700">{opponentSideActiveClassScore}スコア</div>
                  </div>
                </div>
              </div>
            </div>

            {/* ===== ④ サポートカード ===== */}
            <section className="rounded-2xl border border-white/60 bg-white/75 p-3 shadow-lg backdrop-blur-md">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm font-black">🃏 サポートカード</div>
                <div className="flex items-center gap-2">
                  <div className="text-[10px] font-bold opacity-60">手札 {myHand.length}/{MAX_HAND}</div>
                  <div className="text-[10px] font-bold opacity-60">相手 {isOnline ? opponentHandCount : cpuHand.length}/{MAX_HAND}</div>
                  <BattleDeckPile
                    label="山札"
                    count={myDeck.length}
                    animationKey={supportDealAnimationKey}
                    dealCount={supportDealAnimationActive ? supportDealAnimationCount : 0}
                    side="self"
                    compact
                  />
                </div>
              </div>

              <div className="mt-2 text-[9px] font-bold text-slate-500">
                タップ1回で確認、もう一度タップで使用。上へスワイプでも使用できます。
              </div>

              <div className="mt-3 flex gap-2 overflow-x-auto pb-2 pt-2 touch-pan-x">
                {myHand.length === 0 ? (
                  <div className="py-4 text-xs font-bold opacity-40">手札がありません。</div>
                ) : (
                  myHand.map((card, index) => {
                    const isSelected = selectedSupportCardIndex === index;
                    const isRevealing = revealingSupportCardIndexes.includes(index);
                    return (
                      <button
                        key={`${card.id}_${index}`}
                        type="button"
                        disabled={!myTurn}
                        onPointerDown={(event) => {
                          if (!myTurn) return;
                          supportPointerStartRef.current = { index, y: event.clientY };
                        }}
                        onPointerUp={(event) => {
                          if (!myTurn) return;
                          const startPoint = supportPointerStartRef.current;
                          supportPointerStartRef.current = null;
                          if (!startPoint || startPoint.index !== index) return;
                          if (event.clientY - startPoint.y <= -45) {
                            supportClickSuppressRef.current = true;
                            setSelectedSupportCardIndex(null);
                            void handleUseSupportCard(card, index);
                            window.setTimeout(() => { supportClickSuppressRef.current = false; }, 50);
                          }
                        }}
                        onPointerCancel={() => { supportPointerStartRef.current = null; }}
                        onClick={() => {
                          if (!myTurn || supportClickSuppressRef.current) return;
                          if (selectedSupportCardIndex === index) {
                            setSelectedSupportCardIndex(null);
                            void handleUseSupportCard(card, index);
                            return;
                          }
                          setSelectedSupportCardIndex(index);
                        }}
                        className={`relative w-[78px] shrink-0 rounded-xl border bg-white p-1.5 text-left shadow-md transition duration-200 sm:w-[86px] ${
                          !myTurn ? 'cursor-not-allowed opacity-50' : 'cursor-pointer hover:border-indigo-400'
                        } ${
                          isSelected ? '-translate-y-3 border-indigo-500 ring-2 ring-indigo-200' : 'border-slate-200'
                        }`}
                      >
                        <BattleCardReveal
                          revealed={!isRevealing}
                          width={66}
                          height={92}
                          className="mx-auto"
                          colorHex={getBattleVisualColorHex(myActiveAvatar.card)}
                        >
                          {getSupportImage(card) ? (
                            <img src={getSupportImage(card)} alt="" className="h-full w-full rounded-xl bg-white object-contain p-0.5" />
                          ) : (
                            <div className="flex h-full items-center justify-center text-2xl">🃏</div>
                          )}
                        </BattleCardReveal>
                        <div className="mt-1 flex items-center justify-center gap-1">
                          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-indigo-100 text-[10px]">✨</span>
                          <span className="max-w-[54px] truncate text-[9px] font-black">{card.name}</span>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>

              {selectedSupportCardIndex !== null && myHand[selectedSupportCardIndex] && (
                <div className="mt-1 rounded-2xl border border-indigo-200 bg-indigo-50/80 p-3">
                  <div className="flex items-start gap-3">
                    <BattleCardReveal
                      revealed
                      width={74}
                      height={104}
                      colorHex={getBattleVisualColorHex(myActiveAvatar.card)}
                    >
                      {getSupportImage(myHand[selectedSupportCardIndex]) ? (
                        <img src={getSupportImage(myHand[selectedSupportCardIndex])} alt="" className="h-full w-full rounded-xl bg-white object-contain p-0.5" />
                      ) : (
                        <div className="flex h-full items-center justify-center text-3xl">🃏</div>
                      )}
                    </BattleCardReveal>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-black text-indigo-950">{myHand[selectedSupportCardIndex].name}</div>
                      <div className="mt-1 text-xs font-bold leading-relaxed text-slate-700">{myHand[selectedSupportCardIndex].description}</div>
                    </div>
                  </div>
                </div>
              )}
            </section>

            {/* ===== ⑤ 現在キャラ固有の4技 ===== */}
            <div className="rounded-2xl border border-white/60 bg-white/80 p-3 shadow-lg">
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="text-sm font-black">⚔️ {myActiveAvatar.card.userName} の技</span>
                <span className="text-[10px] font-bold opacity-50">技を選ぶと即ターン終了</span>
              </div>

              <div className="grid grid-cols-2 gap-2">
                {myActiveAvatar.skills.map((skill, index) => {
                  const disabled =
                    !myTurn ||
                    (skill.maxUsesPerClass > 0 && usedThisClass.includes(skill.id)) ||
                    hasSkillSeal(
                      myActiveAvatar,
                      index,
                      getBattleTurnOrdinal(currentYear, turnIndex),
                    );
                  const skillNumber = ['①', '②', '③', '④'][index] || `${index + 1}.`;

                  return (
                    <button
                      key={`${myActiveAvatar.card.id}_${skill.id}`}
                      disabled={disabled}
                      onClick={() => void handleUseSkill(skill)}
                      className={`min-h-24 rounded-xl border p-3 text-left transition ${
                        disabled
                          ? 'cursor-not-allowed border-slate-200 bg-slate-100 opacity-45'
                          : 'border-indigo-300 bg-indigo-50 hover:-translate-y-0.5 hover:bg-indigo-100'
                      }`}
                    >
                      <div className="text-sm font-black text-indigo-900">{skillNumber} {skill.name}</div>
                      <div className="mt-1 text-xs leading-relaxed opacity-75">
                        {skill.description}
                      </div>
                      <div className="mt-2 text-[9px] font-black opacity-50">
                        {skill.maxUsesPerClass
                          ? `このクラス ${usedThisClass.includes(skill.id) ? '使用済み' : '1回'}`
                          : '回数制限なし'}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </section>
        )}

        {/* ===== ⑥ LIVE LOG：盤面の最後 ===== */}
        <section className="mt-4 rounded-2xl bg-slate-950/80 p-3 text-xs text-white shadow-lg">
          <div className="mb-2 font-black opacity-50">
            LIVE LOG
          </div>

          <div
            style={{
              maxHeight: 300,
              overflowY: 'auto',
            }}
          >
            {log.map((item, index) => (
              <div
                key={`${item}_${index}`}
                className={
                  index === 0
                    ? 'font-black'
                    : 'opacity-60'
                }
              >
                {item}
              </div>
            ))}
          </div>
        </section>

        {/* ===== 勝敗・再戦 ===== */}
        {battlePhase === 'finished' && !classResult && (
          <section className="mt-4 rounded-3xl border border-white/70 bg-white/90 p-8 text-center shadow-2xl">
            <div className="text-xs font-black tracking-widest opacity-50">BATTLE FINISH</div>
            <h2 className="mt-2 text-4xl font-black">
              {myTotalScore > opponentTotalScore
                ? 'YOU WIN!'
                : myTotalScore < opponentTotalScore
                  ? 'YOU LOSE'
                  : 'DRAW'}
            </h2>
            <div className="mt-4 text-3xl font-black">
              {myTotalScore} <span className="text-sm">スコア</span>　VS　{opponentTotalScore}{' '}
              <span className="text-sm">スコア</span>
            </div>

            <div className="mx-auto mt-5 grid max-w-md grid-cols-3 gap-2 text-xs">
              {ROLE_NAMES.map((role, index) => (
                <div key={role} className="rounded-xl bg-slate-100 p-3">
                  <div className="font-black">{role}</div>
                  <div>{myClassScores[index]} - {oppClassScores[index]}</div>
                </div>
              ))}
            </div>

            <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
              <button
                onClick={() => void chooseRematch('rematch')}
                disabled={!!rematchChoice}
                className="rounded-xl bg-indigo-600 px-6 py-3 font-black text-white disabled:opacity-50"
              >
                もう一回する
              </button>
              <button
                onClick={() => void chooseRematch('exit')}
                disabled={!!rematchChoice}
                className="rounded-xl bg-slate-200 px-6 py-3 font-black text-slate-900 disabled:opacity-50"
              >
                退出する
              </button>
            </div>
          </section>
        )}

        {/* ===== デッキ選択モーダル ===== */}
        {isDeckSelectOpen && battlePhase === 'setup' && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
            <div className="w-full max-w-md rounded-3xl bg-white p-5 shadow-2xl">
              <div className="flex items-center justify-between">
                <h3 className="font-black">出撃するデッキを選択</h3>
                <button onClick={() => setIsDeckSelectOpen(false)} className="font-black">
                  ✕
                </button>
              </div>
              <div className="mt-4 space-y-2">
                {(() => {
                  try {
                    const decks: Deck[] = JSON.parse(
                      localStorage.getItem('reality_decks') || '[]',
                    );
                    if (!decks.length) {
                      return (
                        <div className="py-6 text-center text-sm opacity-50">
                          保存されたデッキがありません。
                        </div>
                      );
                    }
                    return decks.map((deck) => (
                      <button
                        key={deck.id}
                        onClick={() => void handleSelectDeck(deck.id)}
                        className="w-full rounded-xl border bg-slate-50 p-3 text-left hover:bg-slate-100"
                      >
                        <div className="font-black">{deck.name}</div>
                        <div className="text-[10px] opacity-50">{deck.id}</div>
                      </button>
                    ));
                  } catch {
                    return (
                      <div className="text-sm text-red-600">
                        デッキを読み込めませんでした。
                      </div>
                    );
                  }
                })()}
              </div>
            </div>
          </div>
        )}

        {/* ===== A-1 技ステータス選択モーダル ===== */}
        {skillStatSelection && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
            <div className="w-full max-w-sm rounded-3xl bg-white p-5 shadow-2xl">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-xs font-black opacity-50">A-1コーデ</div>
                  <h3 className="mt-1 text-xl font-black">ステータスを選択</h3>
                </div>
                <button type="button" onClick={() => setSkillStatSelection(null)} className="font-black">✕</button>
              </div>
              <div className="mt-3 rounded-2xl bg-slate-50 p-3 text-xs font-bold text-slate-600">
                {skillStatSelection.mode === 'response' ? '選んだステータスの「自分 − 相手」×20でスコアを計算します。' : '選んだステータスを2倍にしてから、技の処理を確定します。'}
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
                        const skill = myActiveAvatar.skills.find((item) => item.id === skillStatSelection.skillId);
                        if (!skill) { setSkillStatSelection(null); return; }
                        setSkillStatSelection(null);
                        void handleUseSkill(skill, stat);
                      }}
                      className="rounded-2xl border border-indigo-200 bg-indigo-50 p-3 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-indigo-400 hover:bg-indigo-100"
                    >
                      <div className="text-sm font-black text-indigo-950">{STAT_LABELS[stat]}</div>
                      <div className="mt-1 text-xs font-bold text-slate-600">自分 {mine} ／ 相手 {opponent}</div>
                      <div className="mt-2 text-sm font-black text-indigo-700">
                        {skillStatSelection.mode === 'response' ? `+${score}スコア` : `${mine} → ${burstValue}`}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* ===== キャラ詳細モーダル ===== */}
        {modalAvatar && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
            <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl">
              <div className="flex justify-between">
                <div>
                  <div className="text-xs font-black opacity-50">{modalAvatar.roleName}</div>
                  <h3 className="text-2xl font-black">{modalAvatar.card.userName}</h3>
                </div>
                <button onClick={() => setModalAvatar(null)} className="font-black">
                  ✕
                </button>
              </div>
              <div className="mt-4 flex items-center gap-4">
                <img
                  src={modalAvatar.card.imageDataUrl}
                  alt=""
                  className="h-36 w-28 rounded-2xl bg-white object-contain p-1"
                />
                <RadarChart baseStats={modalAvatar.baseStats || modalAvatar.card.stats} currentStats={getEffectiveStats(modalAvatar)} />
              </div>
              <div className="mt-4 space-y-1 text-xs font-bold opacity-70">
                <div>カラー：{modalAvatar.card.color}</div>
                <div>得意季節：{modalAvatar.card.favoredSeason}</div>
              </div>
            </div>
          </div>
        )}
{/* ===== 相手切断警告 ===== */}
{showOpponentDisconnectModal &&
  battlePhase === 'battle' && (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-3xl bg-white p-6 text-center shadow-2xl">
        <div className="text-4xl">
          ⚠️
        </div>

        <h3 className="mt-3 text-xl font-black text-slate-900">
          相手との接続を確認できません
        </h3>

        <p className="mt-3 text-sm font-bold leading-relaxed text-slate-600">
          {opponentDisconnectMessage}
        </p>

        <p className="mt-2 text-xs font-bold text-slate-400">
          相手が復帰すれば、そのまま対戦を続けられます。
        </p>

        <div className="mt-6 grid grid-cols-2 gap-3">
          <button
            onClick={() => {
              setShowOpponentDisconnectModal(
                false,
              );

              opponentDisconnectDismissedUntilRef.current =
                Date.now() + 30 * 1000;

              setWaitingMessage(
                '相手の復帰を待っています。',
              );
            }}
            className="rounded-xl bg-indigo-600 px-4 py-3 text-sm font-black text-white shadow-lg hover:bg-indigo-700"
          >
            待機する
          </button>

          <button
            onClick={() =>
              void exitBecauseOpponentDisconnected()
            }
            className="rounded-xl bg-slate-200 px-4 py-3 text-sm font-black text-slate-900 hover:bg-slate-300"
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
