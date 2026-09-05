'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { db, ensureAnonymousAuth } from '@/lib/firebase';
import {
  doc,
  getDoc,
  onSnapshot,
  runTransaction,
  updateDoc,
  setDoc,
} from 'firebase/firestore';
import {
  AvatarCard,
  SupportCard,
  Deck,
  Archetype,
} from '@/types/card';
import { CHARACTER_SAMPLE_CARDS } from './characterSampleCards';
import { COORDINATE_PRESETS } from './EntryHub';
import { createVirtualSupportCards, VIRTUAL_SUPPORT_PREFIX } from './supportSampleCards';
import { EMOTION_PRESETS, type EmotionPreset } from './emotionPresets';

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

  if (preset.code === 'y') {
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
};

// CardGeneratorが現在保存している追加情報も読み込めるようにする。
type EntryRecordWithSkills = {
  id: string;
  cardType: 'coordinate' | 'emotion';
  presetId?: string;
  profileUrl?: string;
  userName?: string;
  imageDataUrl?: string;
  color?: string;
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
    seasonAbilityText: `${archetype}（${role}）`,
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
    Math.min(Math.max(baseStats.hp, 0), max),
    Math.min(Math.max(baseStats.intellect, 0), max),
    Math.min(Math.max(baseStats.dexterity, 0), max),
    Math.min(Math.max(baseStats.charm, 0), max),
  ];
  const currentValues = [
    Math.min(Math.max(currentStats.hp, 0), max),
    Math.min(Math.max(currentStats.intellect, 0), max),
    Math.min(Math.max(currentStats.dexterity, 0), max),
    Math.min(Math.max(currentStats.charm, 0), max),
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
      .then(() => {
        if (!cancelled) setAuthReady(true);
      })
      .catch((error) => {
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
  const [classResult, setClassResult] = useState<{
    completedYear: number;
    myScore: number;
    opponentScore: number;
    myTotal: number;
    opponentTotal: number;
  } | null>(null);
  const [readyHost, setReadyHost] = useState(false);
  const [readyGuest, setReadyGuest] = useState(false);
  // 相手の手札・山札枚数。オンラインではFirebaseから同期し、CPU戦ではCPUのローカル状態を表示する。
  const [opponentHandCount, setOpponentHandCount] = useState(0);
  const [opponentDeckCount, setOpponentDeckCount] = useState(0);
  const lastActionRef = useRef<string>('');
  const lastSkillActionRef = useRef<string>('');
  const lastObservedBattlePhaseRef = useRef<string>('');
  const lastObservedYearRef = useRef<number>(1);
  const initializedRef = useRef(false);

  const addLog = (message: string) => setLog((prev) => [...prev,message,]);

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
        seasonAbilityText: `${battleCard.archetype}（${battleCard.favoredSeason}が得意）`,
        skills: buildSkills(sample.customSkills, preset),
        statBoost: {},
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

      const cards: AvatarCard[] = [...CHARACTER_SAMPLE_CARDS];
      for (const entry of entries.filter((e) => e.cardType === 'coordinate')) {
        const archetype = (entry.archetype as Archetype) || 'マッスル型';
        const fallback = cards.find((c) => c.id === entry.id);
        cards.push({
          id: entry.id,
          profileUrl: entry.profileUrl || '',
          userName: entry.userName || 'キャラ',
          imageDataUrl: entry.imageDataUrl || fallback?.imageDataUrl || '',
          color: (entry.color as '赤' | '青' | '黄') || '赤',
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
          seasonAbilityText: `${battleCard.archetype}（${battleCard.favoredSeason}が得意）`,
          skills: buildSkills(names, preset),
          statBoost: {},
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

        await updateDoc(myPlayerRef, {
          uid: currentUser.uid,
          role: playerRole,
          joined: true,

          // Player固有データ
          avatars: loaded,
   
          // 実戦用サポートデッキ状態
          // 初期手札4枚、残り14枚をPlayerへ保存する。
          deck: initialSupportState.deck,
          hand: initialSupportState.hand,

          // 初期状態
          usedSkills: {},

          handCount: initialSupportState.hand.length,
          deckCount: initialSupportState.deck.length,

          lastSeenAt: Date.now(),
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
  // 現行：
  //   rooms/{roomId}.hostLastSeenAt / guestLastSeenAt
  //
  // 今回：
  //   rooms/{roomId}/players/{playerRole}.lastSeenAt
  //
  // Room本体の所有権情報は変更せず、
  // 「現在このプレイヤーが生きている」という情報だけ
  // Playerへ移す。
  // =========================================================

  useEffect(() => {
    if (!roomId || !authReady || !myPlayerRef) return;

    const writeHeartbeat = () => {
      void updateDoc(myPlayerRef, {
        lastSeenAt: Date.now(),
        joined: true,
      }).catch(() => undefined);
    };

    writeHeartbeat();

    const timer = window.setInterval(
      writeHeartbeat,
      10000,
    );

    return () => {
      window.clearInterval(timer);
    };
  }, [
    roomId,
    authReady,
    myPlayerRef,
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
    const opponentRef = doc(
      db,
      'rooms',
      roomId,
      'players',
      opponentRole,
    );

    let currentRoomData: Record<string, any> | null = null;
    let currentMyPlayerData: Record<string, any> | null = null;
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
            })),
          );
        }

        const playerHand = currentMyPlayerData.hand;

        if (Array.isArray(playerHand)) {
          setMyHand(playerHand as SupportCard[]);
        }

        const playerDeck = currentMyPlayerData.deck;

        if (Array.isArray(playerDeck)) {
          setMyDeck(playerDeck as SupportCard[]);
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
        // 旧Skill状態
        // ===================================================

        const used =
          playerRole === 'host'
            ? data.hostUsedSkills
            : data.guestUsedSkills;

        if (
          used &&
          typeof used === 'object'
        ) {
          setUsedSkillsByClass(used);
        }

        // ===================================================
        // 相手の技によるスコア・干渉
        //
        // lastSkill はまだRoom直下。
        // これは②-BでsubmitBattleActionへ移行する。
        // 今回は既存処理を維持する。
        // ===================================================

        const lastSkill =
          data.lastSkill;

        if (
          lastSkill?.actionId &&
          lastSkill.actionId !==
            lastSkillActionRef.current &&
          lastSkill.player !== playerRole
        ) {
          lastSkillActionRef.current =
            lastSkill.actionId;

          if (
            lastSkill.year ===
            activeIndex + 1
          ) {
            const incomingDebuffs =
              (lastSkill.debuffs || {}) as Partial<
                Record<StatKey, number>
              >;

            if (
              Object.keys(incomingDebuffs).length > 0
            ) {
              setMyAvatars((prev) =>
                prev.map((avatar, index) =>
                  index === activeIndex &&
                  !avatar.debuffImmune
                    ? {
                        ...avatar,
                        currentDebuff: {
                          hp:
                            avatar.currentDebuff.hp +
                            Number(
                              incomingDebuffs.hp || 0,
                            ),
                          intellect:
                            avatar.currentDebuff.intellect +
                            Number(
                              incomingDebuffs.intellect ||
                                0,
                            ),
                          dexterity:
                            avatar.currentDebuff.dexterity +
                            Number(
                              incomingDebuffs.dexterity ||
                                0,
                            ),
                          charm:
                            avatar.currentDebuff.charm +
                            Number(
                              incomingDebuffs.charm ||
                                0,
                            ),
                        },
                      }
                    : avatar,
                ),
              );
            }
          }

          addLog(
            '相手が「' +
              (lastSkill.skillName || '技') +
              '」を発動しました。',
          );
        }

        // ===================================================
        // 相手アクション
        //
        // ここも②-BでsubmitBattleActionへ移行する。
        // ===================================================

        const opponentAction =
          data[
            playerRole === 'host'
              ? 'guestAction'
              : 'hostAction'
          ];

        if (
          opponentAction?.actionId &&
          opponentAction.actionId !==
            lastActionRef.current
        ) {
          lastActionRef.current =
            opponentAction.actionId;

          handleIncomingAction(
            opponentAction,
          );
        }

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
              `現在対戦相手がいません。あなたとして待機中です。合言葉は「${roomId}」です。`,
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

          const pendingAction =
            currentOpponentPlayerData.pendingAction;

          if (
            pendingAction?.actionId &&
            pendingAction.actionId !== lastActionRef.current
          ) {
            lastActionRef.current =
              pendingAction.actionId;

            handleIncomingAction(
              pendingAction,
            );
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
      unsubscribeOpponentPlayer();
    };
  }, [
    roomId,
    playerRole,
    opponentRole,
    authReady,
    isOnline,
  ]);

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

        hostUsedSkills: {},
        guestUsedSkills: {},

        hostAction: null,
        guestAction: null,

        rematchHost: false,
        rematchGuest: false,

        exitHost: false,
        exitGuest: false,

        readyHost: false,
        readyGuest: false,

        // 旧構造との互換用。
        // 新Player構造ではPlayer側を正とする。
        hostHandCount: 0,
        guestHandCount: 0,
        hostDeckCount: 0,
        guestDeckCount: 0,
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
  // 画面上は常に「自分＝左」「相手＝右」。
  // 表示上の累計値はクラス別スコアの合計を正とする。CPU戦でも常に即時反映される。
  const myTotalScore = myClassScores.reduce((sum, score) => sum + score, 0);
  const opponentTotalScore = oppClassScores.reduce((sum, score) => sum + score, 0);
  const mySideActiveAvatar = myActiveAvatar;
  const opponentSideActiveAvatar = oppActiveAvatar;
  const mySideActiveClassScore = currentMyClassScore;
  const opponentSideActiveClassScore = currentOppClassScore;

  // ===== 実効ステータス =====
  const getEffectiveStats = (avatar: BattleAvatar) => ({
    hp: Math.max(0, avatar.stats.hp * (avatar.statBoost?.hp || 1) - avatar.currentDebuff.hp),
    intellect: Math.max(0, avatar.stats.intellect * (avatar.statBoost?.intellect || 1) - avatar.currentDebuff.intellect),
    dexterity: Math.max(0, avatar.stats.dexterity * (avatar.statBoost?.dexterity || 1) - avatar.currentDebuff.dexterity),
    charm: Math.max(0, avatar.stats.charm * (avatar.statBoost?.charm || 1) - avatar.currentDebuff.charm),
  });

  // ===== ターン開始時の自動ドロー =====
  const previousTurnRef = useRef<string>('');
  useEffect(() => {
    if (battlePhase !== 'battle' || !myTurn) return;
    const key = `${currentYear}-${turnIndex}-${playerRole}`;
    if (previousTurnRef.current === key) return;
    previousTurnRef.current = key;

    if (myHand.length < MAX_HAND && myDeck.length > 0) {
      setMyHand((prev) => [...prev, myDeck[0]]);
      setMyDeck((prev) => prev.slice(1));
      addLog('サポートカードを1枚ドローしました。');
    }
  }, [battlePhase, myTurn, currentYear, turnIndex, playerRole, myHand.length, myDeck]);

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
) => {
  if (!isOnline || !roomId || !authReady) return false;

  try {
    const currentUser = await ensureAnonymousAuth();

    const actionId =
      action.actionId ||
      `${currentUser.uid}-${Date.now()}`;
    
    const playerRef = doc(
      db,
      'rooms',
      roomId,
      'players',
      playerRole,
    );

    await setDoc(
      playerRef,
      {
        pendingAction: {
          ...action,
          actionId,
          uid: currentUser.uid,
          playerRole,
          submittedAt: Date.now(),
        },
      },
      {
        merge: true,
      },
     );

    return true;
  } catch (error) {
    console.error(
      'Battle Action送信エラー:',
      error,
    );

    addLog('⚠️ アクションの送信に失敗しました。');

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

      const nextHand =
        options?.hand ??
        myHand;

      const nextDeck =
        options?.deck ??
        myDeck;

      const nextUsedSkills =
        options?.usedSkills ??
        usedSkillsByClass;

      await setDoc(
        playerRef,
        {
          avatars:
            nextAvatars,

          hand:
            nextHand,

          deck:
            nextDeck,

          handCount:
            nextHand.length,

          deckCount:
            nextDeck.length,

          usedSkills:
            nextUsedSkills,
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
  // ===== 相手のアクション処理 =====
  const handleIncomingAction = (
    action: BattleActionPayload & {
      playerRole?: PlayerRole;
    },
  ) => {
    if (!action?.type) return;

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
      // サポートカード効果を受信側でも再現
      // =====================================================
      //
      // 送信側・CPU側と同じ
      // applyEmotionToPair() を使用する。
      //
      // Firebaseには計算済み結果を送らず、
      // supportCardId からカードを特定して、
      // 双方で同じ公式エモーション定義を使って計算する。
      // =====================================================

      const opponentPreset =
        getEmotionPresetForCard(
          opponentSupportCard,
        );

      const applied =
        applyEmotionToPair(
          opponentSupportCard,
          opponentAvatar,
          myAvatar,
        );

      // -----------------------------------------------------
      // 相手（カード使用者）側
      // -----------------------------------------------------

      const nextOppAvatars =
        oppAvatars.map(
          (avatar, index) =>
            index === avatarIndex
              ? applied.actor
              : avatar,
        );

      // -----------------------------------------------------
      // 自分（カード効果対象側）
      // -----------------------------------------------------

      const nextMyAvatars =
        myAvatars.map(
          (avatar, index) =>
            index === avatarIndex
              ? applied.target
              : avatar,
        );

      // -----------------------------------------------------
      // スコア効果
      // -----------------------------------------------------

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
    // Action使用者（相手）の状態をPlayerへ正式保存
    // =====================================================
    
    if (isOnline && roomId) {
      const actorRole =
        action.playerRole === 'host'
          ? 'host'
          : 'guest';

      const actorPlayerRef =
        doc(
          db,
          'rooms',
          roomId,
          'players',
          actorRole,
        );
    
      void updateDoc(
        actorPlayerRef,
        {
          avatars:
            nextOppAvatars,
        },
      ).catch((error) => {
        console.error(
          '相手サポート後のAvatar保存エラー:',
          error,
        );
      });
    }

      // =====================================================
      // 自分側に反映されたサポート効果を正式保存
      // =====================================================

      void saveMyPlayerBattleState(
        nextMyAvatars,
      );

      // =====================================================
      // スコア反映
      // =====================================================

      if (gainedScore !== 0) {
        setOppClassScores(
          (prev) => {
            const next =
              [...prev];

            next[avatarIndex] =
              (next[avatarIndex] || 0) +
              gainedScore;

            return next;
          },
        );

        if (
          playerRole === 'host'
        ) {
          setGuestTotalScore(
            (prev) =>
              prev + gainedScore,
          );
        } else {
          setHostTotalScore(
            (prev) =>
              prev + gainedScore,
          );
        }
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

        void runTransaction(
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

            // -----------------------------------------------
            // 同じActionを二重処理しない
            // -----------------------------------------------

            if (
              roomData.lastProcessedActionId ===
              action.actionId
            ) {
              return;
            }

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

                lastProcessedActionId:
                  action.actionId,

                // サポートカードでは
                // ターンを進めない
                turnIndex:
                  roomData.turnIndex ?? 0,

                currentYear:
                  roomData.currentYear ??
                  action.year,

                battlePhase:
                  roomData.battlePhase ??
                  'battle',
              },
            );
          },
        ).catch((error) => {
          console.error(
            '相手のサポート結果同期エラー:',
            error,
          );
        });
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
        const opponentMin =
          Math.min(
            ...Object.values(
              effective,
            ),
          );

        const myMin =
          Math.min(
            ...Object.values(
              opponentEffective,
            ),
          );

        gainedScore =
          Math.max(
            0,
            opponentMin - myMin,
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
      // 技を使用した相手Playerの状態を正式保存
      // =====================================================
      
      const actorRole =
        action.playerRole === 'host'
          ? 'host'
          : 'guest';
      
      const targetRole =
        actorRole === 'host'
          ? 'guest'
          : 'host';
      
      if (isOnline && roomId) {
        // ---------------------------------------------------
        // 技を使用した側
        // ---------------------------------------------------
      
        const actorPlayerRef =
          doc(
            db,
            'rooms',
            roomId,
            'players',
            actorRole,
          );
      
        void updateDoc(
          actorPlayerRef,
          {
            avatars:
              nextOpponentAvatars,
          },
        ).catch((error) => {
          console.error(
            '相手の技後のAvatar保存エラー:',
            error,
          );
        });

        // ---------------------------------------------------
        // 技を受けた側
        // ---------------------------------------------------
      
        const targetPlayerRef =
          doc(
            db,
            'rooms',
            roomId,
            'players',
            targetRole,
          );
      
        void updateDoc(
          targetPlayerRef,
          {
            avatars:
              nextMyAvatars,
          },
        ).catch((error) => {
          console.error(
            '技を受けた側のAvatar保存エラー:',
            error,
          );
        });
      }
      // =====================================================
      // 自分が受けた影響をPlayer状態へ保存
      // =====================================================

      void saveMyPlayerBattleState(
        nextMyAvatars,
      );

      setOppClassScores((prev) => {
        const next = [...prev];

        next[avatarIndex] =
          (next[avatarIndex] || 0) +
          gainedScore;

        return next;
      });

      // 表示用合計スコア
      if (playerRole === 'host') {
        setGuestTotalScore(
          (prev) =>
            prev + gainedScore,
        );
      } else {
        setHostTotalScore(
          (prev) =>
            prev + gainedScore,
        );
      }

      // 相手の技使用済み状態も更新
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

      addLog(
        `相手が「${skill.name}」を使用しました。 +${gainedScore}スコア`,
      );

      // =====================================================
      // 相手の技処理完了後、オンライン対戦ではターンを進める
      // =====================================================
      //
      // サポートカード使用ではターン終了しない。
      // 技の使用が完了した場合のみ、次のターンへ進む。
      // =====================================================

      // =====================================================
      // Firebaseの正式なスコア・ターン状態を更新
      // =====================================================
      //
      // 相手のActionを受信した側が、
      // Firestore上の正式な試合結果を更新する。
      //
      // turnIndex は Action送信時の値を基準に判定する。
      // =====================================================

      if (isOnline && roomId) {
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

        const usedField =
          actorRole === 'host'
            ? 'hostUsedSkills'
            : 'guestUsedSkills';

        const isLastTurn =
          action.turnIndex >= 7;

        const nextYear =
          isLastTurn && action.year < 3
            ? action.year + 1
            : action.year;

        const nextPhase =
          isLastTurn
            ? action.year < 3
              ? 'setup'
              : 'finished'
            : 'battle';

        void runTransaction(
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

            // ------------------------------------------------
            // 同じActionを二重処理しない
            // ------------------------------------------------

            const processedActionId =
              roomData.lastProcessedActionId;

            if (
              processedActionId ===
              action.actionId
            ) {
              return;
            }

            // ------------------------------------------------
            // クラス別スコア
            // ------------------------------------------------

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

            // ------------------------------------------------
            // 合計スコア
            // ------------------------------------------------

            const nextTotal =
              Number(
                roomData[totalField] ||
                  0,
              ) + gainedScore;

            // ------------------------------------------------
            // 使用済み技
            // ------------------------------------------------

            const roomUsedSkills =
              roomData[usedField] &&
              typeof roomData[
                usedField
              ] === 'object'
                ? {
                    ...roomData[
                      usedField
                    ],
                  }
                : {};

            const yearKey =
              String(action.year);

            const usedForYear =
              Array.isArray(
                roomUsedSkills[
                  yearKey
                ],
              )
                ? [
                    ...roomUsedSkills[
                      yearKey
                    ],
                  ]
                : [];

            if (
              skill.maxUsesPerClass > 0 &&
              !usedForYear.includes(
                skill.id,
              )
            ) {
              usedForYear.push(
                skill.id,
              );
            }

            roomUsedSkills[
              yearKey
            ] = usedForYear;

            // ------------------------------------------------
            // Firestore更新
            // ------------------------------------------------

            transaction.update(
              roomRef,
              {
                [scoreField]: scores,

                [totalField]:
                  nextTotal,

                [usedField]:
                  roomUsedSkills,

                lastProcessedActionId:
                  action.actionId,

                currentYear:
                  nextYear,

                turnIndex:
                  isLastTurn
                    ? 0
                    : action.turnIndex + 1,

                battlePhase:
                  nextPhase,

                firstPlayer:
                  isLastTurn
                    ? null
                    : roomData.firstPlayer ??
                      null,

                startSeasonIdx:
                  isLastTurn
                    ? null
                    : roomData.startSeasonIdx ??
                      null,
              },
            );
          },
        ).catch((error) => {
          console.error(
            '相手の技結果同期エラー:',
            error,
          );
        });
      }

      return;
    }
  };

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
        `コイントス結果：${result === 'host' ? 'あなた' : 'CPU'}が先手です。\n春から${ROLE_NAMES[currentYear - 1]}戦を開始します。`,
      );
      addLog(`🪙 コイントス結果：${result === 'host' ? 'あなた' : 'CPU'}が先手です。`);
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
      setPreparationMessage(`🪙 コイントス結果：${result === playerRole ? 'あなた' : '相手'}が先手です。春から${ROLE_NAMES[currentYear - 1]}戦を開始します。`);
      addLog(`🪙 コイントス結果：${result === playerRole ? 'あなた' : '相手'}が先手です。`);
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
    setPreparationMessage('このデッキでの準備が完了しました。両者のデッキ確定後、ホストがコイントスを行います。');
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

  const continueAfterClassResult = () => {
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

  // ===== 技の発動・スコア集計・相手への干渉 =====
  // コーデ25種のプリセットに定義された技効果を、そのままゲーム処理へ反映します。
  const handleUseSkill = async (skill: Skill) => {
    if (!myTurn || battlePhase !== 'battle') return;

    const usedKey = `${currentYear}`;
    const usedForClass = usedSkillsByClass[usedKey] || [];
    if (skill.maxUsesPerClass > 0 && usedForClass.includes(skill.id)) {
      addLog(`「${skill.name}」はこのクラスでは使用済みです。`);
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
        setOppAvatars(nextOppAvatars);
      }
    } else if (skill.rule === 'y_total_score') {
      gainedScore = Object.values(effective).reduce((sum, value) => sum + value, 0) * 5;
    } else if (skill.rule === 'y_response_score') {
      const myMin = Math.min(...Object.values(effective));
      const opponentMin = Math.min(...Object.values(opponentEffective));
      gainedScore = Math.max(0, myMin - opponentMin) * 20;
    } else if (skill.rule === 'y_burst') {
      const chosen = window.prompt('2倍にするステータスを選択してください。\n体力 / 知略 / 器用 / 特技', '体力');
      const map: Record<string, StatKey> = { 体力: 'hp', 知略: 'intellect', 器用: 'dexterity', 特技: 'charm' };
      selectedBoostStat = chosen ? map[chosen.trim()] || null : null;
      if (!selectedBoostStat) {
        addLog('技の発動をキャンセルしました。');
        return;
      }
      gainedScore = 100;
      nextMyAvatars = myAvatars.map((avatar, index) =>
        index === activeIndex
          ? { ...avatar, statBoost: { ...(avatar.statBoost || {}), [selectedBoostStat!]: 2 } }
          : avatar,
      );
      setMyAvatars(nextMyAvatars);
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
        setOppAvatars(nextOppAvatars);
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
        skill.maxUsesPerClass > 0 && !usedForClass.includes(skill.id)
          ? [...usedForClass, skill.id]
          : usedForClass,
    };

    const next = getNextTurnState();

    // ===== CPU対戦：Firebaseを使わずローカル状態だけを更新 =====
    if (!isOnline) {
      const nextScores = [...myClassScores];
      nextScores[activeIndex] = (nextScores[activeIndex] || 0) + gainedScore;
      setMyClassScores(nextScores);
      if (playerRole === 'host') setHostTotalScore((prev) => prev + gainedScore);
      else setGuestTotalScore((prev) => prev + gainedScore);
      setMyAvatars(nextMyAvatars);
      setOppAvatars(nextOppAvatars);
      setUsedSkillsByClass(nextUsed);
      addLog(`「${skill.name}」発動！ +${gainedScore}スコア`);
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
    //
    // 先にAction送信を成功させ、
    // 成功した場合は使用者自身にも即時反映する。
    //
    // 相手側は pendingAction を受信して
    // 同じルール計算を行う。
    // =====================================================

    const actionSubmitted =
      await submitBattleAction({
        actionId:
          `${Date.now()}-${Math.random().toString(36).slice(2)}`,

        type: 'USE_SKILL',

        year: currentYear,
        turnIndex,

        avatarIndex: activeIndex,

        skillId: skill.id,

        selectedBoostStat:
        selectedBoostStat ?? undefined,
     });

    if (!actionSubmitted) {
      addLog(
        `「${skill.name}」の送信に失敗しました。`,
      );
      return;
    }

    // -----------------------------------------------------
    // 使用者側にも即時反映
    // -----------------------------------------------------

    const nextScores =
      [...myClassScores];

    nextScores[activeIndex] =
      (nextScores[activeIndex] || 0) +
      gainedScore;

    setMyClassScores(
      nextScores,
    );

    if (playerRole === 'host') {
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

    setMyAvatars(
      nextMyAvatars,
    );

    setOppAvatars(
      nextOppAvatars,
    );

    setUsedSkillsByClass(
      nextUsed,
    );

    // =====================================================
    // 使用者自身の正式状態をPlayerへ保存
    // =====================================================

    await saveMyPlayerBattleState(
      nextMyAvatars,
      {
        usedSkills:
          nextUsed,
      },
    );

    addLog(
      `「${skill.name}」発動！ +${gainedScore}スコア`,
    );

    if (
      Object.keys(debuffs).length > 0 &&
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

  const applyEmotionStatDelta = (avatar: BattleAvatar, delta: Partial<Record<StatKey, number>>): BattleAvatar => ({
    ...avatar,
    stats: {
      hp: Math.max(0, avatar.stats.hp + Number(delta.hp || 0)),
      intellect: Math.max(0, avatar.stats.intellect + Number(delta.intellect || 0)),
      dexterity: Math.max(0, avatar.stats.dexterity + Number(delta.dexterity || 0)),
      charm: Math.max(0, avatar.stats.charm + Number(delta.charm || 0)),
    },
  });

  const applyEmotionToPair = (
    card: SupportCard,
    actor: BattleAvatar,
    target: BattleAvatar,
  ) => {
    const preset = getEmotionPresetForCard(card);
    if (!preset) return { actor, target, scoreDelta: 0, extraDraw: 0 };

    const amount = parseEmotionAmount(preset.effectAmount);
    const statMap: Partial<Record<EmotionPreset['effectCategory'], StatKey>> = {
      '体力': 'hp',
      '知略': 'intellect',
      '器用': 'dexterity',
      '特技': 'charm',
    };
    let nextActor = actor;
    let nextTarget = target;
    let scoreDelta = 0;
    let extraDraw = 0;

    if (preset.effectCategory === '全ステータス') {
      const delta = amount;
      const all = { hp: delta, intellect: delta, dexterity: delta, charm: delta };
      if (preset.target === '自分') nextActor = applyEmotionStatDelta(nextActor, all);
      if (preset.target === '相手') nextTarget = applyEmotionStatDelta(nextTarget, all);
    } else if (statMap[preset.effectCategory]) {
      const stat = statMap[preset.effectCategory]!;
      const delta = { [stat]: amount } as Partial<Record<StatKey, number>>;
      if (preset.target === '自分') nextActor = applyEmotionStatDelta(nextActor, delta);
      if (preset.target === '相手') nextTarget = applyEmotionStatDelta(nextTarget, delta);
    } else if (preset.effectCategory === 'スコア') {
      scoreDelta = preset.target === '相手' ? -Math.abs(amount) : Math.abs(amount);
    } else if (preset.effectCategory === 'ドロー') {
      extraDraw = amount || 1;
    } else if (preset.effectCategory === 'ステータスコピー・平均化') {
      if (preset.name === '手鏡') {
        const highest = Math.max(...Object.values(target.stats));
        const key = (Object.keys(target.stats) as StatKey[]).find((k) => target.stats[k] === highest) || 'hp';
        nextActor = applyEmotionStatDelta(nextActor, { [key]: highest - nextActor.stats[key] });
      } else if (preset.name === '押し売り') {
        const lowest = Math.min(...Object.values(actor.stats));
        const key = (Object.keys(actor.stats) as StatKey[]).find((k) => actor.stats[k] === lowest) || 'hp';
        nextTarget = applyEmotionStatDelta(nextTarget, { [key]: lowest - nextTarget.stats[key] });
      } else if (preset.name === '平穏な空気') {
        const average = Math.round(Object.values(actor.stats).reduce((sum, value) => sum + value, 0) / 4);
        nextActor = {
          ...nextActor,
          stats: { hp: average, intellect: average, dexterity: average, charm: average },
        };
      } else if (preset.name === 'トンボがけ') {
        const average = Math.round(Object.values(actor.stats).reduce((sum, value) => sum + value, 0) / 4);
        nextTarget = {
          ...nextTarget,
          stats: { hp: average, intellect: average, dexterity: average, charm: average },
        };
      }
    }

    return { actor: nextActor, target: nextTarget, scoreDelta, extraDraw };
  };

  // ===== CPUサポートカード選択 =====
  // CPUは「必ず使う」ではなく、手札と状況を見て1枚だけ先に使います。
  // 1) 体力・知略・器用・特技の減少系は、相手の該当値が高いほど優先。
  // 2) 自分の上昇系は、自分の該当値が低いほど優先。
  // 3) ドロー系は手札が少ないときに優先。
  // 4) 候補がなければ、手札からランダムに1枚を選択。
  const chooseCpuSupport = (hand: SupportCard[], cpuAvatar: BattleAvatar, playerAvatar: BattleAvatar) => {
    if (!hand.length) return null;
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

  const applyCpuSupport = (card: SupportCard, cpuAvatar: BattleAvatar, playerAvatar: BattleAvatar) => {
    const applied = applyEmotionToPair(card, cpuAvatar, playerAvatar);
    return {
      cpuAvatar: applied.actor,
      playerAvatar: applied.target,
      extraDraw: applied.extraDraw,
      scoreDelta: applied.scoreDelta,
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
      // CPUの手番は「ドロー → サポート使用 → 技」の順。
      // プレイヤー側と同じく、手札上限7枚を守りながら山札から1枚引きます。
      if (cpuHand.length < MAX_HAND && cpuDeck.length > 0) {
        const drawnCard = cpuDeck[0];
        setCpuHand((prev) => [...prev, drawnCard].slice(0, MAX_HAND));
        setCpuDeck((prev) => prev.slice(1));
        addLog('CPUがサポートカードを1枚ドローしました。');
      }

      // ドロー直後の手札を判断材料にするため、現在の手札＋ドローしたカードを渡します。
      const cpuHandForDecision = cpuHand.length < MAX_HAND && cpuDeck.length > 0
        ? [...cpuHand, cpuDeck[0]]
        : cpuHand;
      let workingCpu = oppActiveAvatar;
      let workingPlayer = myActiveAvatar;
      let cpuSupportScoreDelta = 0;
      const supportChoice = chooseCpuSupport(cpuHandForDecision, workingCpu, workingPlayer);
      if (supportChoice) {
        const applied = applyCpuSupport(supportChoice.card, workingCpu, workingPlayer);
        workingCpu = applied.cpuAvatar;
        workingPlayer = applied.playerAvatar;
        setCpuHand((prev) => prev.filter((_, index) => index !== supportChoice.index));
        addLog(`CPUがサポート「${supportChoice.card.name}」を使用しました。`);
        setOppAvatars((prev) => prev.map((avatar, index) => index === activeIndex ? workingCpu : avatar));
        setMyAvatars((prev) => prev.map((avatar, index) => index === activeIndex ? workingPlayer : avatar));
        if (applied.extraDraw > 0) {
          setCpuHand((prev) => {
            const next = [...prev];
            let deckIndex = 0;
            while (deckIndex < applied.extraDraw && cpuDeck.length > 0 && next.length < MAX_HAND) {
              next.push(cpuDeck[deckIndex]);
              deckIndex += 1;
            }
            return next;
          });
          setCpuDeck((prev) => prev.slice(applied.extraDraw));
        }
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
  const handleUseSupportCard = async (card: SupportCard, index: number) => {
    if (!myTurn || battlePhase !== 'battle') return;

    const applied = applyEmotionToPair(card, myActiveAvatar, oppActiveAvatar);
    setMyHand((prev) => prev.filter((_, i) => i !== index));
    setMyAvatars((prev) => prev.map((avatar, avatarIndex) => avatarIndex === activeIndex ? applied.actor : avatar));
    setOppAvatars((prev) => prev.map((avatar, avatarIndex) => avatarIndex === activeIndex ? applied.target : avatar));

    if (applied.scoreDelta !== 0) {
      setMyClassScores((prev) => {
        const next = [...prev];
        next[activeIndex] = Math.max(0, (next[activeIndex] || 0) + applied.scoreDelta);
        return next;
      });
      if (playerRole === 'host') {
        setHostTotalScore((prev) => Math.max(0, prev + applied.scoreDelta));
      } else {
        setGuestTotalScore((prev) => Math.max(0, prev + applied.scoreDelta));
      }
    }

    if (applied.extraDraw > 0) {
      setMyHand((prev) => {
        const next = [...prev];
        let drawIndex = 0;
        while (drawIndex < applied.extraDraw && next.length < MAX_HAND && myDeck[drawIndex]) {
          next.push(myDeck[drawIndex]);
          drawIndex += 1;
        }
        return next;
      });
      setMyDeck((prev) => prev.slice(applied.extraDraw));
    }

    const preset = getEmotionPresetForCard(card);
    addLog(`サポート「${card.name}」を使用しました。${preset?.description ? ` ${preset.description}` : ''}`);

    if (isOnline) {
      await submitBattleAction({
        type: 'PLAY_SUPPORT',
    
        // 現在の対戦状態
        year: currentYear,
        turnIndex,
    
        // 現在出場しているキャラクター
        avatarIndex: activeIndex,
    
        // 使用するカードそのものを識別する情報
        supportCardId: card.id,
      });
    }
  };

  // ===== クラス間の準備をホストがリセット =====
  const resetForNextClass = async () => {
    if (!isHost || battlePhase !== 'setup' || currentYear > 3) return;

    await updateDoc(doc(db, 'rooms', roomId), {
      firstPlayer: null,
      startSeasonIdx: null,
      turnIndex: 0,
      battlePhase: 'setup',
      hostAction: null,
      guestAction: null,
    });
    addLog(`${currentYear}年目（${ROLE_NAMES[currentYear - 1]}戦）の準備を開始します。`);
  };

  // ===== 勝敗後の再戦・退出選択 =====
  // 先に選んだ側は待機、後から選んだ側は「新しいゲームを始めます」と案内します。
  const chooseRematch = async (choice: 'rematch' | 'exit') => {
    if (rematchChoice || (isOnline && !authReady)) return;

    // CPU対戦はFirebaseを使わず、この画面内で新しい準備フェイズを開始します。
    if (!isOnline) {
      if (choice === 'exit') {
        setWaitingMessage('CPU対戦を終了しました。');
        setBattlePhase('waiting');
        return;
      }
      setRematchChoice('rematch');
      setBattlePhase('setup');
      setCurrentYear(1);
      setTurnIndex(0);
      setFirstPlayer(null);
      setStartSeasonIdx(null);
      setDeckConfirmed(false);
      setMyClassScores([0, 0, 0]);
      setOppClassScores([0, 0, 0]);
      setHostTotalScore(0);
      setGuestTotalScore(0);
      setUsedSkillsByClass({});
      setCpuUsedSkillsByClass({});
      setPreparationMessage('新しいゲームを始めます。\n先手・後手を決めるコイントスを行ってください。');
      buildCpuDeck();
      return;
    }

    const roomRef = doc(db, 'rooms', roomId);

    try {
      const result = await runTransaction(db, async (transaction) => {
        const snapshot = await transaction.get(roomRef);
        if (!snapshot.exists()) throw new Error('ステージが終了しています。');
        const data = snapshot.data();
        const otherRole: PlayerRole = playerRole === 'host' ? 'guest' : 'host';
        const otherChoice = choice === 'rematch'
          ? Boolean(data[otherRole === 'host' ? 'rematchHost' : 'rematchGuest'])
          : Boolean(data[otherRole === 'host' ? 'exitHost' : 'exitGuest']);

        const field = choice === 'rematch'
          ? playerRole === 'host' ? 'rematchHost' : 'rematchGuest'
          : playerRole === 'host' ? 'exitHost' : 'exitGuest';

        if (choice === 'exit' && otherChoice) {
          transaction.delete(roomRef);
          return { bothExited: true, otherChoice: true };
        }

        transaction.update(roomRef, { [field]: true });
        return { bothExited: false, otherChoice };
      });

      setRematchChoice(choice);

      if (choice === 'exit') {
        if (result.bothExited) {
          setWaitingMessage('両者が退出を選択しました。このステージでのゲームは終了しました。合言葉は解放されました。');
          setBattlePhase('waiting');
        } else {
          addLog('退出するを選択しました。');
        }
        return;
      }

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

  // ===== 両者再戦なら最初から =====
  // CPU戦にはroomIdがないため、このFirebase監視は完全にスキップする。
  useEffect(() => {
    if (!isOnline || battlePhase !== 'finished' || !isHost || !roomId) return;

    const roomRef = doc(db, 'rooms', roomId);
    const unsubscribe = onSnapshot(roomRef, (snapshot) => {
      const data = snapshot.data();
      if (!data || !data.rematchHost || !data.rematchGuest) return;

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
        hostUsedSkills: {},
        guestUsedSkills: {},
        rematchHost: false,
        rematchGuest: false,
        exitHost: false,
        exitGuest: false,
        readyHost: false,
        readyGuest: false,
        hostAction: null,
        guestAction: null,
      });
    });

    return () => unsubscribe();
  }, [battlePhase, isHost, roomId]);

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

  const getDeckStatTendency = (avatars: BattleAvatar[]) => {
    if (!avatars.length) return '未設定';

    const totals = STAT_KEYS.map((key) =>
      avatars.reduce((sum, avatar) => sum + Number(avatar.baseStats?.[key] || avatar.card.stats[key] || 0), 0),
    );

    const ranked = STAT_KEYS
      .map((key, index) => ({ key, total: totals[index] }))
      .sort((a, b) => b.total - a.total);

    const top = ranked.slice(0, 2).map((item) => `${STAT_LABELS[item.key]}${item.total}`).join('・');
    return `傾向：${top}`;
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
      const field = playerRole === 'host' ? 'hostAvatars' : 'guestAvatars';
      const readyField = playerRole === 'host' ? 'readyHost' : 'readyGuest';
      await updateDoc(doc(db, 'rooms', roomId), {
        [field]: loaded,
        [playerRole === 'host' ? 'hostDeckId' : 'guestDeckId']: deckId,
        [readyField]: false,
      });
      setPreparationMessage('デッキを変更しました。もう一度「このデッキではじめる」を押してください。');
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
                <div className="text-[10px] opacity-60">あなた</div>
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
              <span className="rounded-full bg-white/80 px-3 py-1 text-xs font-black">
                あなた
              </span>
              {battlePhase === 'battle' && (
                <span
                  className={`rounded-full px-3 py-1 text-xs font-black ${
                    myTurn ? 'bg-amber-300' : 'bg-slate-900 text-white'
                  }`}
                >
                  {myTurn ? 'あなたのターン' : '相手のターン'}
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
                <div className="text-sm font-black text-indigo-700">あなた</div>
                <div className="mt-1 text-3xl font-black">{classResult.myScore}<span className="text-sm">スコア</span></div>
              </div>
              <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4">
                <div className="text-sm font-black text-rose-700">相手</div>
                <div className="mt-1 text-3xl font-black">{classResult.opponentScore}<span className="text-sm">スコア</span></div>
              </div>
            </div>
            <div className="mt-4 text-xl font-black">
              {classResult.myScore > classResult.opponentScore ? 'このクラスはあなたの勝利！' : classResult.myScore < classResult.opponentScore ? 'このクラスは相手の勝利。' : 'このクラスは引き分け。'}
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
                                  <div className="truncate text-[9px] font-bold opacity-60">
                                    {avatar.card.archetype}
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

                    <div className="mt-2 text-[10px] font-black text-slate-600">
                      {getDeckStatTendency(myAvatars)}
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
                  {firstPlayer === playerRole ? 'あなた' : '相手'} が先手
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
                <div className="rounded-full bg-slate-950/80 px-3 py-1.5 text-white">あなた</div>
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
                <div className="rounded-3xl border border-indigo-300/70 bg-white/85 p-3 shadow-lg">
                  <div className="text-center text-xs font-black text-indigo-700">
                    自分　{mySideActiveAvatar.roleName}
                  </div>

                  <div className="mt-2 flex flex-col items-center gap-3 sm:flex-row sm:items-start">
                    <div className="min-w-0 flex-1">
                      <img
                        src={mySideActiveAvatar.card.imageDataUrl}
                        alt=""
                        className="mx-auto h-52 w-full max-w-[180px] rounded-2xl bg-white object-contain p-2 shadow-md sm:h-56"
                      />
                      <h3 className="mt-2 text-center text-xl font-black">
                        {mySideActiveAvatar.card.userName}
                      </h3>
                      <div className="mt-1 text-center text-sm font-bold opacity-70">
                        {mySideActiveAvatar.card.archetype}
                      </div>
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
                <div className="rounded-3xl border border-rose-300/60 bg-white/80 p-3 shadow-lg">
                  <div className="text-center text-xs font-black text-rose-700">
                    相手　{opponentSideActiveAvatar.roleName}
                  </div>

                  <div className="mt-2 flex flex-col items-center gap-3 sm:flex-row sm:items-start">
                    <div className="min-w-0 flex-1">
                      <img
                        src={opponentSideActiveAvatar.card.imageDataUrl}
                        alt=""
                        className="mx-auto h-52 w-full max-w-[180px] rounded-2xl bg-white object-contain p-2 shadow-md sm:h-56"
                      />
                      <h3 className="mt-2 text-center text-xl font-black">
                        {opponentSideActiveAvatar.card.userName}
                      </h3>
                      <div className="mt-1 text-center text-sm font-bold opacity-70">
                        {opponentSideActiveAvatar.card.archetype}
                      </div>
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
                {myTurn ? 'あなたの手番です' : '相手の手番'}
              </div>
            </div>

            {/* ===== ④ サポートカード ===== */}
            <section className="rounded-2xl border border-white/60 bg-white/75 p-3 shadow-lg backdrop-blur-md">
              <div className="flex items-center justify-between">
                <div className="text-sm font-black">🃏 サポートカード</div>
                <div className="text-right text-[10px] font-bold leading-relaxed opacity-60 sm:text-xs">
                  <div>あなた：手札 {myHand.length}/{MAX_HAND}　山札 {myDeck.length}</div>
                  <div>相手：手札 {isOnline ? opponentHandCount : cpuHand.length}/{MAX_HAND}　山札 {isOnline ? opponentDeckCount : cpuDeck.length}</div>
                </div>
              </div>
              <div className="mt-2 grid grid-cols-1 gap-2 min-[420px]:grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 pb-1">
                {myHand.length === 0 ? (
                  <div className="py-4 text-xs font-bold opacity-40">手札がありません。</div>
                ) : (
                  myHand.map((card, index) => (
                    <button
                      key={`${card.id}_${index}`}
                      disabled={!myTurn}
                      onClick={() => void handleUseSupportCard(card, index)}
                      className={`min-w-0 w-full rounded-xl border bg-white p-3 text-left shadow ${
                        myTurn ? 'hover:border-indigo-400' : 'cursor-not-allowed opacity-50'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        {getSupportImage(card) ? (
                          <img
                            src={getSupportImage(card)}
                            alt=""
                            className="h-12 w-10 shrink-0 rounded-lg bg-white object-contain p-0.5"
                          />
                        ) : null}
                        <div className="min-w-0">
                          <div className="text-xs font-black leading-tight">{card.name}</div>
                          <div className="mt-1 whitespace-normal break-words text-[11px] leading-relaxed opacity-70">
                            {card.description}
                          </div>
                        </div>
                      </div>
                    </button>
                  ))
                )}
              </div>
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
                    (skill.maxUsesPerClass > 0 && usedThisClass.includes(skill.id));
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
                <div>タイプ：{modalAvatar.card.archetype}</div>
                <div>得意季節：{modalAvatar.card.favoredSeason}</div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
