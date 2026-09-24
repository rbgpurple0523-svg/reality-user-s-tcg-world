import { NextResponse } from 'next/server';
import {
  getApps,
  initializeApp,
  cert,
  type App,
} from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import {
  FieldValue,
  type Transaction,
} from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebaseAdmin';
import { COORDINATE_PRESETS, STAT_RANKS } from '@/components/coordinatePresets';
import { EMOTION_PRESETS, type EmotionPreset } from '@/components/emotionPresets';

export const runtime = 'nodejs';

type PlayerRole = 'host' | 'guest';

type StatKey =
  | 'hp'
  | 'intellect'
  | 'dexterity'
  | 'charm';

type SkillRule =
  | 'primary_score'
  | 'product_score'
  | 'difference_score'
  | 'combo_score_and_debuff'
  | 'y_total_score'
  | 'y_response_score'
  | 'y_burst'
  | 'y_crash';

type Skill = {
  id: string;
  name: string;
  description?: string;
  rule?: SkillRule;
  type?:
    | 'score'
    | 'debuff_clear'
    | 'draw_score'
    | 'debuff_attack';
  primaryStat?: StatKey;
  secondaryStat?: StatKey;
  tertiaryStat?: StatKey;
  maxUsesPerClass: number;
};

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
  card: {
    id: string;
    userName: string;
  };

  roleName: string;

  stats: Record<StatKey, number>;

  baseStats?: Record<StatKey, number>;

  currentDebuff: Record<StatKey, number>;

  debuffImmune?: boolean;

  statBoost?: Partial<Record<StatKey, number>>;

  supportEffects?: SupportAvatarEffectState[];

  supportControlEffects?: SupportControlEffectState[];

  skills: Skill[];
};

type SupportCardState = {
  id: string;
  name?: string;
  description?: string;
  presetId?: string;
};

type BattleAction = {
  actionId?: string;
  type?: 'USE_SKILL' | 'PLAY_SUPPORT' | 'DRAW_TURN';

  playerRole?: PlayerRole;
  uid?: string;

  year?: number;
  turnIndex?: number;
  avatarIndex?: number;

  skillId?: string;
  selectedBoostStat?: StatKey;

  supportCardId?: string;
  supportPresetId?: string;

  submittedAt?: number;
};

type LastSkillAction = {
  actionId: string;
  player: PlayerRole;
  year: number;
  turnIndex: number;
  avatarIndex: number;
  skillId: string;
  skillName: string;
  gainedScore: number;
  processedAt: number;
};

type PlayerData = {
  uid?: string;
  role?: PlayerRole;

  avatars?: BattleAvatar[];

  usedSkills?: Record<string, string[]>;

  pendingAction?: BattleAction;

  lastSkillActionId?: string;

  lastSkillAction?: LastSkillAction;

  battleStateVersion?: number;
  lastDrawTurnOrdinal?: number;

  lastSupportActionId?: string;
  lastSupportAction?: {
    actionId: string;
    player: PlayerRole;
    year: number;
    turnIndex: number;
    avatarIndex: number;
    supportCardId: string;
    supportPresetId: string;
    supportName: string;
    actorScoreDelta: number;
    targetScoreDelta: number;
    processedAt: number;
  };
};

type RoomData = {
  hostUid?: string | null;
  guestUid?: string | null;

  currentYear?: number;
  turnIndex?: number;

  firstPlayer?: PlayerRole | null;
  startSeasonIdx?: number | null;

  battlePhase?:
    | 'setup'
    | 'battle'
    | 'finished';

  hostClassScores?: number[];
  guestClassScores?: number[];

  hostTotalScore?: number;
  guestTotalScore?: number;
};

type PrivatePlayerData = {
  uid?: string;
  hand?: SupportCardState[];
  deck?: SupportCardState[];
};

type BattleActionRequest = {
  roomId?: unknown;
  actionId?: unknown;
  type?: unknown;
  year?: unknown;
  turnIndex?: unknown;
  avatarIndex?: unknown;
  skillId?: unknown;
  selectedBoostStat?: unknown;
  supportCardId?: unknown;
};

const STAT_KEYS: StatKey[] = [
  'hp',
  'intellect',
  'dexterity',
  'charm',
];

const getBattleTurnOrdinal = (
  year: number,
  turnIndex: number,
) =>
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

  const currentYear =
    Math.floor(turnOrdinal / 8) + 1;
  const classEndTurnOrdinal =
    currentYear * 8;

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

const getAdditionalDrawFromEffects = (
  effects: SupportControlEffectState[] | undefined,
  turnOrdinal: number,
) =>
  (effects ?? [])
    .filter(
      (effect) =>
        isSupportEffectActive(effect, turnOrdinal) &&
        effect.kind === 'extra_draw',
    )
    .reduce(
      (sum, effect) =>
        sum + Number(effect.extraDrawPerTurn ?? 0),
      0,
    );

const isPlayerRole = (
  value: unknown,
): value is PlayerRole =>
  value === 'host' ||
  value === 'guest';

const isStatKey = (
  value: unknown,
): value is StatKey =>
  STAT_KEYS.includes(value as StatKey);

const getOpponentRole = (
  role: PlayerRole,
): PlayerRole =>
  role === 'host'
    ? 'guest'
    : 'host';

const getExpectedPlayer = (
  firstPlayer: PlayerRole,
  turnIndex: number,
): PlayerRole =>
  turnIndex % 2 === 0
    ? firstPlayer
    : firstPlayer === 'host'
      ? 'guest'
      : 'host';

const getCoordinatePresetForAvatar = (
  avatar: BattleAvatar,
) => {
  const card = avatar.card as BattleAvatar['card'] & {
    presetId?: string;
    coordinateCode?: string;
    code?: string;
  };

  const presetId = card.presetId;
  const code = card.coordinateCode || card.code;

  return COORDINATE_PRESETS.find(
    (preset) =>
      (presetId && preset.id === presetId) ||
      (code && preset.code === code),
  );
};

const getCanonicalSkill = (
  avatar: BattleAvatar,
  skillId: string,
): Skill => {
  const preset = getCoordinatePresetForAvatar(avatar);

  if (!preset) {
    throw new Error(
      'Avatarの公式コーデ性能を確認できません。',
    );
  }

  const match = /^skill_([1-4])$/.exec(skillId);
  if (!match) {
    throw new Error('Skill IDが不正です。');
  }

  const index = Number(match[1]) - 1;
  const rank = STAT_RANKS[preset.code];
  if (!rank) {
    throw new Error('公式コーデ順位が存在しません。');
  }

  const displayedSkill = avatar.skills?.find(
    (item) => item.id === skillId,
  );
  const name =
    displayedSkill?.name ||
    preset.defaultSkills[index];
  const description =
    preset.skillDescriptions[index];

  if (preset.code === 'n1') {
    const rules: SkillRule[] = [
      'y_total_score',
      'y_response_score',
      'y_burst',
      'y_crash',
    ];

    return {
      id: skillId,
      name,
      description,
      maxUsesPerClass:
        index === 2 ? 2 : index === 3 ? 1 : 0,
      type:
        index === 3
          ? 'debuff_attack'
          : 'score',
      rule: rules[index],
    };
  }

  const rules: SkillRule[] = [
    'primary_score',
    'product_score',
    'difference_score',
    'combo_score_and_debuff',
  ];

  return {
    id: skillId,
    name,
    description,
    maxUsesPerClass:
      index === 3 ? 1 : 0,
    type:
      index === 3
        ? 'debuff_attack'
        : 'score',
    rule: rules[index],
    primaryStat: index === 1 ? rank[1] : rank[0],
    secondaryStat: index === 1 || index === 3 ? rank[2] : undefined,
    tertiaryStat: index === 3 ? rank[3] : undefined,
  };
};

const getEffectiveStats = (
  avatar: BattleAvatar,
  turnOrdinal: number,
): Record<StatKey, number> => {
  const preset = getCoordinatePresetForAvatar(avatar);
  if (!preset) {
    throw new Error(
      'Avatarの公式コーデ性能を確認できません。',
    );
  }

  const sourceBaseStats = avatar.baseStats ?? preset.stats;
  const result: Record<StatKey, number> = {
    hp: Number(sourceBaseStats.hp),
    intellect: Number(sourceBaseStats.intellect),
    dexterity: Number(sourceBaseStats.dexterity),
    charm: Number(sourceBaseStats.charm),
  };

  const activeSupportEffects =
    (avatar.supportEffects ?? []).filter(
      (effect) =>
        isSupportEffectActive(
          effect,
          turnOrdinal,
        ),
    );

  for (const effect of activeSupportEffects) {
    if (effect.statDelta) {
      for (const key of STAT_KEYS) {
        result[key] = Math.max(
          0,
          result[key] +
            Number(
              effect.statDelta[key] ??
                0,
            ),
        );
      }
    }

    if (effect.statOverride) {
      for (const key of STAT_KEYS) {
        const override =
          effect.statOverride[key];
        if (typeof override === 'number') {
          result[key] = Math.max(
            0,
            override,
          );
        }
      }
    }
  }

  for (const key of STAT_KEYS) {
    const debuff = Number(
      avatar.currentDebuff?.[key] ?? 0,
    );
    const boost = Number(
      avatar.statBoost?.[key] ?? 1,
    );

    result[key] = Math.max(
      0,
      result[key] * boost - debuff,
    );
  }

  return result;
};

const sanitizeFreshBattleAvatars = (
  avatars: BattleAvatar[],
): BattleAvatar[] =>
  avatars.map((avatar) => {
    const preset = getCoordinatePresetForAvatar(avatar);
    if (!preset) {
      throw new Error(
        'Avatarの公式コーデ性能を確認できません。',
      );
    }

    return {
      ...avatar,
      stats: { ...preset.stats },
      baseStats: { ...preset.stats },
      currentDebuff: {
        hp: 0,
        intellect: 0,
        dexterity: 0,
        charm: 0,
      },
      debuffImmune: false,
      statBoost: {},
      supportEffects: [],
      supportControlEffects: [],
    };
  });

const isFreshBattleStart = (
  room: RoomData,
  actor: PlayerData,
  target: PlayerData,
): boolean =>
  room.currentYear === 1 &&
  room.turnIndex === 0 &&
  !actor.lastSkillActionId &&
  !actor.lastSupportActionId &&
  !target.lastSkillActionId &&
  !target.lastSupportActionId;

const addDebuffs = (
  avatar: BattleAvatar,
  debuffs: Partial<
    Record<StatKey, number>
  >,
): BattleAvatar => {
  if (avatar.debuffImmune) {
    return avatar;
  }

  return {
    ...avatar,

    currentDebuff: {
      hp:
        Number(
          avatar.currentDebuff?.hp ?? 0,
        ) +
        Number(
          debuffs.hp ?? 0,
        ),

      intellect:
        Number(
          avatar.currentDebuff?.intellect ?? 0,
        ) +
        Number(
          debuffs.intellect ?? 0,
        ),

      dexterity:
        Number(
          avatar.currentDebuff?.dexterity ?? 0,
        ) +
        Number(
          debuffs.dexterity ?? 0,
        ),

      charm:
        Number(
          avatar.currentDebuff?.charm ?? 0,
        ) +
        Number(
          debuffs.charm ?? 0,
        ),
    },
  };
};

const calculateSkillResult = (
  skill: Skill,
  actor: BattleAvatar,
  target: BattleAvatar,
  turnOrdinal: number,
  selectedBoostStat?: StatKey,
) => {
  const effective = getEffectiveStats(
    actor,
    turnOrdinal,
  );
  const targetEffective = getEffectiveStats(
    target,
    turnOrdinal,
  );

  let gainedScore = 0;
  const debuffs: Partial<Record<StatKey, number>> = {};
  let nextActor = actor;
  let nextTarget = target;

  const baseActorStats = actor.baseStats ?? getCoordinatePresetForAvatar(actor)?.stats ?? actor.stats;
  const baseTargetStats = target.baseStats ?? getCoordinatePresetForAvatar(target)?.stats ?? target.stats;
  const baseRank = STAT_KEYS.slice().sort((a, b) => Number(baseActorStats[b] ?? 0) - Number(baseActorStats[a] ?? 0));

  if (skill.rule === 'primary_score') {
    const stat = skill.primaryStat ?? baseRank[0] ?? 'hp';
    gainedScore = effective[stat] * 20;
  } else if (skill.rule === 'product_score') {
    const first = skill.primaryStat ?? baseRank[1] ?? 'intellect';
    const second = skill.secondaryStat ?? baseRank[2] ?? 'dexterity';
    gainedScore =
      effective[first] *
      effective[second];
  } else if (skill.rule === 'difference_score') {
    const stat = skill.primaryStat ?? baseRank[0] ?? 'hp';
    gainedScore =
      Math.max(
        0,
        effective[stat] -
          targetEffective[stat],
      ) * 40;
  } else if (
    skill.rule ===
    'combo_score_and_debuff'
  ) {
    const first = skill.secondaryStat ?? baseRank[2] ?? 'dexterity';
    const second = skill.tertiaryStat ?? baseRank[3] ?? 'charm';
    const targetStat = skill.primaryStat ?? baseRank[0] ?? 'hp';

    gainedScore =
      (effective[first] +
        effective[second]) *
      10;

    debuffs[targetStat] =
      Math.ceil(
        targetEffective[targetStat] * 0.5,
      );

    nextTarget = addDebuffs(
      target,
      debuffs,
    );
  } else if (
    skill.rule ===
    'y_total_score'
  ) {
    gainedScore =
      Object.values(effective).reduce(
        (sum, value) => sum + Number(value ?? 0),
        0,
      ) * 10;
  } else if (
    skill.rule ===
    'y_response_score'
  ) {
    if (!selectedBoostStat) {
      throw new Error(
        'N-1技②には対応ステータスが必要です。',
      );
    }

    gainedScore =
      Math.max(
        0,
        effective[selectedBoostStat] -
          targetEffective[selectedBoostStat],
      ) * 40;
  } else if (
    skill.rule === 'y_burst'
  ) {
    if (!selectedBoostStat) {
      throw new Error(
        'N-1技③には強化ステータスが必要です。',
      );
    }

    gainedScore =
      effective[selectedBoostStat] * 10;

    const nextBaseValue =
      Number(baseActorStats[selectedBoostStat] ?? 0) * 2;

    nextActor = {
      ...actor,
      stats: {
        ...actor.stats,
        [selectedBoostStat]: nextBaseValue,
      },
      baseStats: {
        ...baseActorStats,
        [selectedBoostStat]: nextBaseValue,
      },
    };
  } else if (
    skill.rule === 'y_crash'
  ) {
    const thirdStat = baseRank[2] ?? 'dexterity';
    const fourthStat = baseRank[3] ?? 'charm';
    gainedScore =
      (effective[thirdStat] + effective[fourthStat]) * 10;

    for (const key of STAT_KEYS) {
      debuffs[key] =
        Math.ceil(
          Number(baseTargetStats[key] ?? 0) * 0.25,
        );
    }

    nextTarget = addDebuffs(
      target,
      debuffs,
    );
  } else {
    throw new Error(
      'Skill ruleが不正です。',
    );
  }

  return {
    gainedScore: Math.max(0, gainedScore),
    nextActor,
    nextTarget,
  };
};

const getSupportPresetFromCard = (
  card: SupportCardState,
): EmotionPreset | undefined => {
  const presetId =
    card.presetId ||
    card.id.match(/emo_\d{2}$/)?.[0];

  if (presetId) {
    const preset = EMOTION_PRESETS.find(
      (item) => item.id === presetId,
    );
    if (preset) return preset;
  }

  return EMOTION_PRESETS.find(
    (item) =>
      item.name === card.name,
  );
};

const parseEmotionAmount = (
  value?: string,
) => {
  const match = value?.match(
    /[-+]?\d+(?:\.\d+)?/,
  );
  return match ? Number(match[0]) : 0;
};

const appendSupportAvatarEffect = (
  avatar: BattleAvatar,
  effect: SupportAvatarEffectState,
  turnOrdinal: number,
): BattleAvatar => ({
  ...avatar,
  supportEffects: [
    ...(avatar.supportEffects ?? []).filter(
      (item) =>
        isSupportEffectActive(
          item,
          turnOrdinal,
        ),
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
    ...(avatar.supportControlEffects ?? []).filter(
      (item) =>
        isSupportEffectActive(
          item,
          turnOrdinal,
        ),
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
    appendSupportControlEffect(
      avatar,
      effect,
      turnOrdinal,
    ),
  );

const cloneSupportDeltaEffects = (
  effects: SupportAvatarEffectState[] | undefined,
  predicate: (delta: number) => boolean,
  turnOrdinal: number,
  actionId: string,
): SupportAvatarEffectState[] =>
  (effects ?? [])
    .filter((effect) =>
      isSupportEffectActive(
        effect,
        turnOrdinal,
      ),
    )
    .map((effect, index): SupportAvatarEffectState | null => {
      const filtered: Partial<Record<StatKey, number>> = {};

      for (const stat of STAT_KEYS) {
        const value = Number(
          effect.statDelta?.[stat] ?? 0,
        );
        if (value !== 0 && predicate(value)) {
          filtered[stat] = value;
        }
      }

      if (!Object.keys(filtered).length) {
        return null;
      }

      return {
        ...effect,
        id: `${actionId}_reflect_${index}_${effect.id}`,
        statDelta: filtered,
      };
    })
    .filter(
      (effect): effect is SupportAvatarEffectState =>
        effect !== null,
    );

const calculateSupportEffectResult = (
  preset: EmotionPreset,
  actorAvatars: BattleAvatar[],
  targetAvatars: BattleAvatar[],
  activeIndex: number,
  turnOrdinal: number,
  actionId: string,
) => {
  const actor = actorAvatars[activeIndex];
  const target = targetAvatars[activeIndex];

  if (!actor || !target) {
    throw new Error(
      '対象Avatarが存在しません。',
    );
  }

  let nextActorAvatars: BattleAvatar[] = actorAvatars.map((avatar) => ({
    ...avatar,
    supportEffects: [...(avatar.supportEffects ?? [])],
    supportControlEffects: [
      ...(avatar.supportControlEffects ?? []),
    ],
  }));
  let nextTargetAvatars: BattleAvatar[] = targetAvatars.map((avatar) => ({
    ...avatar,
    supportEffects: [...(avatar.supportEffects ?? [])],
    supportControlEffects: [
      ...(avatar.supportControlEffects ?? []),
    ],
  }));

  const amount = parseEmotionAmount(
    preset.effectAmount,
  );

  const statMap: Partial<
    Record<EmotionPreset['effectCategory'], StatKey>
  > = {
    '情熱': 'hp',
    '知性': 'intellect',
    '技能': 'dexterity',
    '愛嬌': 'charm',
  };

  let actorScoreDelta = 0;
  let targetScoreDelta = 0;
  let extraDraw = 0;

  const appendToActor = (
    effect: Omit<SupportAvatarEffectState, 'id'>,
  ) => {
    nextActorAvatars[activeIndex] =
      appendSupportAvatarEffect(
        nextActorAvatars[activeIndex],
        {
          ...effect,
          id: `${actionId}_actor`,
        },
        turnOrdinal,
      );
  };

  const appendToTarget = (
    effect: Omit<SupportAvatarEffectState, 'id'>,
  ) => {
    nextTargetAvatars[activeIndex] =
      appendSupportAvatarEffect(
        nextTargetAvatars[activeIndex],
        {
          ...effect,
          id: `${actionId}_target`,
        },
        turnOrdinal,
      );
  };

  if (preset.effectCategory === '全ステータス') {
    const delta = {
      hp: amount,
      intellect: amount,
      dexterity: amount,
      charm: amount,
    };

    if (preset.target === '自分') {
      appendToActor({
        sourcePresetId: preset.id,
        statDelta: delta,
        expiresAtTurnOrdinal:
          getSupportEffectExpiration(
            preset,
            turnOrdinal,
            false,
          ),
      });
    }

    if (preset.target === '相手') {
      appendToTarget({
        sourcePresetId: preset.id,
        statDelta: delta,
        expiresAtTurnOrdinal:
          getSupportEffectExpiration(
            preset,
            turnOrdinal,
            true,
          ),
      });
    }
  } else if (
    statMap[preset.effectCategory]
  ) {
    const stat = statMap[
      preset.effectCategory
    ] as StatKey;

    if (preset.target === '自分') {
      appendToActor({
        sourcePresetId: preset.id,
        statDelta: { [stat]: amount },
        expiresAtTurnOrdinal:
          getSupportEffectExpiration(
            preset,
            turnOrdinal,
            false,
          ),
      });
    }

    if (preset.target === '相手') {
      appendToTarget({
        sourcePresetId: preset.id,
        statDelta: { [stat]: amount },
        expiresAtTurnOrdinal:
          getSupportEffectExpiration(
            preset,
            turnOrdinal,
            true,
          ),
      });
    }
  } else if (
    preset.effectCategory ===
    'スコア'
  ) {
    if (preset.id === 'emo_21') {
      actorScoreDelta = Math.abs(amount);
    } else if (
      preset.id === 'emo_22'
    ) {
      targetScoreDelta = -Math.abs(amount);
    } else {
      throw new Error(
        '未定義のスコアサポートです。',
      );
    }
  } else if (
    preset.effectCategory ===
    'サポートカード使用数'
  ) {
    const isFreeSupportControl =
      preset.statEffect.includes(
        '制限されない',
      );

    const baseEffect: SupportControlEffectState = {
      id: actionId,
      sourcePresetId: preset.id,
      duration: preset.duration,
      kind: isFreeSupportControl
        ? 'free'
        : 'limit',
      expiresAtTurnOrdinal:
        getSupportEffectExpiration(
          preset,
          turnOrdinal,
          preset.target === '相手',
        ),
    };

    const effect: SupportControlEffectState =
      isFreeSupportControl
        ? baseEffect
        : {
            ...baseEffect,
            maxUsesPerTurn:
              Math.max(
                0,
                amount || 1,
              ),
          };

    if (preset.target === '自分') {
      nextActorAvatars =
        applySupportControlToAllAvatars(
          nextActorAvatars,
          effect,
          turnOrdinal,
        );
    } else if (
      preset.target === '相手'
    ) {
      nextTargetAvatars =
        applySupportControlToAllAvatars(
          nextTargetAvatars,
          effect,
          turnOrdinal,
        );
    }
  } else if (
    preset.effectCategory === 'ドロー'
  ) {
    extraDraw = Math.max(
      0,
      amount || 1,
    );

    if (preset.duration === '永続') {
      const effect: SupportControlEffectState = {
        id: actionId,
        sourcePresetId: preset.id,
        duration: preset.duration,
        kind: 'extra_draw',
        extraDrawPerTurn: extraDraw,
        expiresAtTurnOrdinal: null,
      };

      nextActorAvatars =
        applySupportControlToAllAvatars(
          nextActorAvatars,
          effect,
          turnOrdinal,
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

    if (preset.id === 'emo_29') {
      const highest = Math.max(
        ...Object.values(targetEffective),
      );
      const key = STAT_KEYS.find(
        (item) =>
          targetEffective[item] === highest,
      ) || 'hp';

      appendToActor({
        sourcePresetId: preset.id,
        statOverride: { [key]: highest },
        expiresAtTurnOrdinal:
          getSupportEffectExpiration(
            preset,
            turnOrdinal,
            false,
          ),
      });
    } else if (
      preset.id === 'emo_30'
    ) {
      const lowest = Math.min(
        ...Object.values(actorEffective),
      );
      const key = STAT_KEYS.find(
        (item) =>
          actorEffective[item] === lowest,
      ) || 'hp';

      appendToTarget({
        sourcePresetId: preset.id,
        statOverride: { [key]: lowest },
        expiresAtTurnOrdinal:
          getSupportEffectExpiration(
            preset,
            turnOrdinal,
            true,
          ),
      });
    } else {
      const average = Math.round(
        Object.values(actorEffective).reduce(
          (sum, value) =>
            sum + value,
          0,
        ) / 4,
      );
      const override = {
        hp: average,
        intellect: average,
        dexterity: average,
        charm: average,
      };

      if (preset.id === 'emo_31') {
        appendToActor({
          sourcePresetId: preset.id,
          statOverride: override,
          expiresAtTurnOrdinal:
            getSupportEffectExpiration(
              preset,
              turnOrdinal,
              false,
            ),
        });
      } else if (
        preset.id === 'emo_32'
      ) {
        appendToTarget({
          sourcePresetId: preset.id,
          statOverride: override,
          expiresAtTurnOrdinal:
            getSupportEffectExpiration(
              preset,
              turnOrdinal,
              true,
            ),
        });
      }
    }
  } else if (
    preset.effectCategory ===
    '効果反射'
  ) {
    if (preset.id === 'emo_33') {
      const sourceEffects =
        cloneSupportDeltaEffects(
          actor.supportEffects,
          (delta) => delta < 0,
          turnOrdinal,
          actionId,
        );
      const sourceIds = new Set(
        sourceEffects.map((effect) =>
          effect.id.split('_reflect_')[0],
        ),
      );
      nextActorAvatars[activeIndex] = {
        ...nextActorAvatars[activeIndex],
        supportEffects: (
          nextActorAvatars[activeIndex].supportEffects ?? []
        ).filter(
          (effect) =>
            !sourceIds.has(effect.id),
        ),
      };
      for (const effect of sourceEffects) {
        nextTargetAvatars[activeIndex] =
          appendSupportAvatarEffect(
            nextTargetAvatars[activeIndex],
            effect,
            turnOrdinal,
          );
      }
    } else if (
      preset.id === 'emo_34'
    ) {
      const sourceEffects =
        cloneSupportDeltaEffects(
          target.supportEffects,
          (delta) => delta > 0,
          turnOrdinal,
          actionId,
        );
      const sourceIds = new Set(
        sourceEffects.map((effect) =>
          effect.id.split('_reflect_')[0],
        ),
      );
      nextTargetAvatars[activeIndex] = {
        ...nextTargetAvatars[activeIndex],
        supportEffects: (
          nextTargetAvatars[activeIndex].supportEffects ?? []
        ).filter(
          (effect) =>
            !sourceIds.has(effect.id),
        ),
      };
      for (const effect of sourceEffects) {
        nextActorAvatars[activeIndex] =
          appendSupportAvatarEffect(
            nextActorAvatars[activeIndex],
            effect,
            turnOrdinal,
          );
      }
    }
  } else if (
    preset.effectCategory === '技封印'
  ) {
    if (preset.id === 'emo_35') {
      appendToTarget({
        sourcePresetId: preset.id,
        skillSealIndex: 3,
        expiresAtTurnOrdinal:
          getSupportEffectExpiration(
            preset,
            turnOrdinal,
            true,
          ),
      });
    }
  } else {
    throw new Error(
      'Support effectCategoryが不正です。',
    );
  }

  return {
    actorAvatars: nextActorAvatars,
    targetAvatars: nextTargetAvatars,
    actorScoreDelta,
    targetScoreDelta,
    extraDraw,
  };
};

const getSupportUsageLimitFromEffects = (
  effects: SupportControlEffectState[] | undefined,
  turnOrdinal: number,
) => {
  const active = (effects ?? []).filter(
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
    return Math.min(
      ...temporaryLimits,
    );
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
    return Math.min(
      ...permanentLimits,
    );
  }

  return Infinity;
};

const getSupportUseCountFromUsedSkills = (
  usedSkills: Record<string, string[]> | undefined,
  year: number,
  turnIndex: number,
) => {
  const list =
    usedSkills?.[String(year)] || [];
  const marker = `__support_${turnIndex}:`;
  const entry = list.find(
    (value) =>
      value.startsWith(marker),
  );
  if (!entry) return 0;
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
  const marker = `__support_${turnIndex}:`;
  const current =
    usedSkills[key] || [];
  const filtered = current.filter(
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

const getNextTurnState = (
  currentYear: number,
  turnIndex: number,
) => {
  if (turnIndex < 7) {
    return {
      currentYear,
      turnIndex:
        turnIndex + 1,
      battlePhase:
        'battle' as const,
    };
  }

  if (currentYear < 3) {
    return {
      currentYear:
        currentYear + 1,

      turnIndex: 0,

      battlePhase:
        'setup' as const,
    };
  }

  return {
    currentYear: 3,
    turnIndex: 7,
    battlePhase:
      'finished' as const,
  };
};

const getAdminApp = (): App => {
  const apps = getApps();

  if (apps.length > 0) {
    return apps[0];
  }

  const projectId =
    process.env.FIREBASE_ADMIN_PROJECT_ID;

  const clientEmail =
    process.env.FIREBASE_ADMIN_CLIENT_EMAIL;

  const privateKey =
    process.env.FIREBASE_ADMIN_PRIVATE_KEY
      ?.replace(
        /\\n/g,
        '\n',
      );

  if (
    !projectId ||
    !clientEmail ||
    !privateKey
  ) {
    throw new Error(
      'Firebase Admin環境変数が不足しています。',
    );
  }

  return initializeApp({
    credential: cert({
      projectId,
      clientEmail,
      privateKey,
    }),
  });
};

export async function POST(
  request: Request,
) {
  try {
    const authorization =
      request.headers.get(
        'authorization',
      );

    if (
      !authorization ||
      !authorization.startsWith(
        'Bearer ',
      )
    ) {
      return NextResponse.json(
        {
          ok: false,
          error:
            'Authorizationが必要です。',
        },
        {
          status: 401,
        },
      );
    }

    const idToken =
      authorization
        .slice('Bearer '.length)
        .trim();

    if (!idToken) {
      return NextResponse.json(
        {
          ok: false,
          error:
            'ID Tokenがありません。',
        },
        {
          status: 401,
        },
      );
    }

    const adminApp =
      getAdminApp();

    const decodedToken =
      await getAuth(
        adminApp,
      ).verifyIdToken(
        idToken,
      );

    const authUid =
      decodedToken.uid;

    const body =
      (await request.json()) as BattleActionRequest;

    if (
      typeof body.roomId !==
        'string' ||
      !body.roomId
    ) {
      return NextResponse.json(
        {
          ok: false,
          error:
            'roomIdが不正です。',
        },
        {
          status: 400,
        },
      );
    }

    if (
      typeof body.actionId !==
        'string' ||
      !body.actionId
    ) {
      return NextResponse.json(
        {
          ok: false,
          error:
            'actionIdが不正です。',
        },
        {
          status: 400,
        },
      );
    }

    if (
      body.type !== 'USE_SKILL' &&
      body.type !== 'PLAY_SUPPORT' &&
      body.type !== 'DRAW_TURN'
    ) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Action typeが不正です。',
        },
        { status: 400 },
      );
    }

    if (
      typeof body.year !==
        'number' ||
      !Number.isInteger(body.year)
    ) {
      return NextResponse.json(
        {
          ok: false,
          error:
            'yearが不正です。',
        },
        {
          status: 400,
        },
      );
    }

    if (
      typeof body.turnIndex !==
        'number' ||
      !Number.isInteger(body.turnIndex)
    ) {
      return NextResponse.json(
        {
          ok: false,
          error:
            'turnIndexが不正です。',
        },
        {
          status: 400,
        },
      );
    }

    if (
      typeof body.avatarIndex !==
        'number' ||
      !Number.isInteger(
        body.avatarIndex,
      )
    ) {
      return NextResponse.json(
        {
          ok: false,
          error:
            'avatarIndexが不正です。',
        },
        {
          status: 400,
        },
      );
    }

    if (
      body.type === 'PLAY_SUPPORT' &&
      (typeof body.supportCardId !== 'string' || !body.supportCardId)
    ) {
      return NextResponse.json(
        {
          ok: false,
          error: 'supportCardIdがありません。',
        },
        { status: 400 },
      );
    }

    if (
      body.type === 'USE_SKILL' &&
      (typeof body.skillId !== 'string' || !body.skillId)
    ) {
      return NextResponse.json(
        {
          ok: false,
          error: 'skillIdがありません。',
        },
        { status: 400 },
      );
    }

    if (
      body.selectedBoostStat !==
        undefined &&
      !isStatKey(
        body.selectedBoostStat,
      )
    ) {
      return NextResponse.json(
        {
          ok: false,
          error:
            'selectedBoostStatが不正です。',
        },
        {
          status: 400,
        },
      );
    }

    const roomId =
      body.roomId;

    const actionId =
      body.actionId;

    const requestedYear =
      body.year;

    const requestedTurnIndex =
      body.turnIndex;

    const requestedAvatarIndex =
      body.avatarIndex;

    const requestedSkillId =
      body.skillId;

    const requestedSupportCardId =
      body.supportCardId;

    const requestedBoostStat =
      body.selectedBoostStat;

    const result =
      await adminDb.runTransaction(
        async (
          transaction: Transaction,
        ) => {
          const roomRef =
            adminDb
              .collection('rooms')
              .doc(roomId);

          const roomSnapshot =
            await transaction.get(
              roomRef,
            );

          if (
            !roomSnapshot.exists
          ) {
            throw new Error(
              'Roomが存在しません。',
            );
          }

          const roomData =
            roomSnapshot.data() as RoomData;

          const currentYear =
            Number(
              roomData.currentYear ?? 1,
            );

          const turnIndex =
            Number(
              roomData.turnIndex ?? 0,
            );

          if (
            roomData.battlePhase !==
            'battle'
          ) {
            throw new Error(
              '現在はBattle Phaseではありません。',
            );
          }

          if (
            !isPlayerRole(
              roomData.firstPlayer,
            )
          ) {
            throw new Error(
              'firstPlayerが不正です。',
            );
          }

          if (
            requestedYear !==
            currentYear
          ) {
            throw new Error(
              'Action yearが現在の試合状態と一致しません。',
            );
          }

          if (
            requestedTurnIndex !==
            turnIndex
          ) {
            throw new Error(
              'Action turnIndexが現在の試合状態と一致しません。',
            );
          }

          const actorRole =
            getExpectedPlayer(
              roomData.firstPlayer,
              turnIndex,
            );

          const opponentRole =
            getOpponentRole(
              actorRole,
            );

          const actorUid =
            actorRole === 'host'
              ? roomData.hostUid
              : roomData.guestUid;

          if (
            actorUid !== authUid
          ) {
            throw new Error(
              '現在の手番プレイヤーではありません。',
            );
          }

          const actorPlayerRef =
            roomRef
              .collection('players')
              .doc(actorRole);

          const opponentPlayerRef =
            roomRef
              .collection('players')
              .doc(opponentRole);

          const actorSnapshot =
            await transaction.get(
              actorPlayerRef,
            );

          const opponentSnapshot =
            await transaction.get(
              opponentPlayerRef,
            );

          if (
            !actorSnapshot.exists
          ) {
            throw new Error(
              'Actor Playerが存在しません。',
            );
          }

          if (
            !opponentSnapshot.exists
          ) {
            throw new Error(
              'Opponent Playerが存在しません。',
            );
          }

          const actorData =
            actorSnapshot.data() as PlayerData;

          const opponentData =
            opponentSnapshot.data() as PlayerData;

          if (
            actorData.uid &&
            actorData.uid !== authUid
          ) {
            throw new Error(
              'Actor PlayerのUIDが一致しません。',
            );
          }

          if (
            actorData.role &&
            actorData.role !== actorRole
          ) {
            throw new Error(
              'Actor Playerのroleが一致しません。',
            );
          }

          if (body.type === 'DRAW_TURN') {
            if (
              requestedAvatarIndex < 0 ||
              requestedAvatarIndex > 2
            ) {
              throw new Error(
                'avatarIndexが不正です。',
              );
            }

            if (
              requestedAvatarIndex !==
              currentYear - 1
            ) {
              throw new Error(
                '現在のクラスとAvatarが一致しません。',
              );
            }

            const turnOrdinal =
              getBattleTurnOrdinal(
                currentYear,
                turnIndex,
              );

            if (
              actorData.lastDrawTurnOrdinal ===
              turnOrdinal
            ) {
              const privatePlayerRef =
                roomRef
                  .collection('privatePlayers')
                  .doc(actorRole);
              const privateSnapshot =
                await transaction.get(
                  privatePlayerRef,
                );
              const privateData =
                privateSnapshot.exists
                  ? (privateSnapshot.data() as PrivatePlayerData)
                  : {};

              return {
                actionId,
                alreadyProcessed: true,
                drawCount: 0,
                hand: Array.isArray(privateData.hand)
                  ? privateData.hand
                  : [],
                deck: Array.isArray(privateData.deck)
                  ? privateData.deck
                  : [],
              };
            }

            let actorAvatars =
              actorData.avatars
                ? [...actorData.avatars]
                : [];
            const freshBattleStart =
              isFreshBattleStart(
                roomData,
                actorData,
                opponentData,
              );

            if (freshBattleStart) {
              actorAvatars =
                sanitizeFreshBattleAvatars(
                  actorAvatars,
                );
            }

            const activeAvatar =
              actorAvatars[
                requestedAvatarIndex
              ];

            if (!activeAvatar) {
              throw new Error(
                '対象Avatarが存在しません。',
              );
            }

            const privatePlayerRef =
              roomRef
                .collection('privatePlayers')
                .doc(actorRole);
            const privateSnapshot =
              await transaction.get(
                privatePlayerRef,
              );

            if (!privateSnapshot.exists) {
              throw new Error(
                'Private Playerが存在しません。',
              );
            }

            const privateData =
              privateSnapshot.data() as PrivatePlayerData;
            const hand = Array.isArray(privateData.hand)
              ? [...privateData.hand]
              : [];
            const deck = Array.isArray(privateData.deck)
              ? [...privateData.deck]
              : [];

            const drawCount = Math.min(
              1 +
                getAdditionalDrawFromEffects(
                  activeAvatar.supportControlEffects,
                  turnOrdinal,
                ),
              Math.max(0, 7 - hand.length),
              deck.length,
            );

            const drawnCards = deck.slice(
              0,
              drawCount,
            );
            const nextHand = [
              ...hand,
              ...drawnCards,
            ];
            const nextDeck = deck.slice(
              drawCount,
            );

            transaction.set(
              privatePlayerRef,
              {
                uid: authUid,
                hand: nextHand,
                deck: nextDeck,
              },
              { merge: true },
            );

            transaction.update(
              actorPlayerRef,
              {
                ...(freshBattleStart
                  ? {
                      avatars:
                        actorAvatars,
                      battleStateVersion:
                        Number(
                          actorData.battleStateVersion ??
                            0,
                        ),
                    }
                  : {}),
                handCount:
                  nextHand.length,
                deckCount:
                  nextDeck.length,
                lastDrawTurnOrdinal:
                  turnOrdinal,
              },
            );

            return {
              actionId,
              alreadyProcessed: false,
              drawCount,
              hand: nextHand,
              deck: nextDeck,
            };
          }

          if (body.type === 'PLAY_SUPPORT') {
            if (
              actorData.lastSupportActionId ===
              actionId
            ) {
              return {
                actionId,
                alreadyProcessed: true,
              };
            }

            if (
              requestedAvatarIndex < 0 ||
              requestedAvatarIndex > 2
            ) {
              throw new Error(
                'avatarIndexが不正です。',
              );
            }

            if (
              requestedAvatarIndex !==
              currentYear - 1
            ) {
              throw new Error(
                '現在のクラスとAvatarが一致しません。',
              );
            }

            const privatePlayerRef =
              roomRef
                .collection('privatePlayers')
                .doc(actorRole);

            const privateSnapshot =
              await transaction.get(
                privatePlayerRef,
              );

            if (!privateSnapshot.exists) {
              throw new Error(
                'Private Playerが存在しません。',
              );
            }

            const privateData =
              privateSnapshot.data() as PrivatePlayerData;

            const hand = Array.isArray(
              privateData.hand,
            )
              ? [...privateData.hand]
              : [];

            if (
              typeof requestedSupportCardId !==
                'string'
            ) {
              throw new Error(
                'supportCardIdが不正です。',
              );
            }

            const supportIndex = hand.findIndex(
              (card) =>
                card?.id ===
                requestedSupportCardId,
            );

            if (supportIndex < 0) {
              throw new Error(
                '指定されたサポートカードが手札に存在しません。',
              );
            }

            const supportCard =
              hand[supportIndex];

            if (!supportCard) {
              throw new Error(
                'サポートカード情報を取得できません。',
              );
            }

            const preset =
              getSupportPresetFromCard(
                supportCard,
              );

            if (!preset) {
              throw new Error(
                '公式エモーションを特定できないサポートカードです。',
              );
            }

            let actorAvatars =
              actorData.avatars
                ? [...actorData.avatars]
                : [];
            let opponentAvatars =
              opponentData.avatars
                ? [...opponentData.avatars]
                : [];

            const freshBattleStart = isFreshBattleStart(
              roomData,
              actorData,
              opponentData,
            );

            if (freshBattleStart) {
              actorAvatars =
                sanitizeFreshBattleAvatars(actorAvatars);
              opponentAvatars =
                sanitizeFreshBattleAvatars(opponentAvatars);
            }

            const activeAvatar =
              actorAvatars[
                requestedAvatarIndex
              ];
            const targetAvatar =
              opponentAvatars[
                requestedAvatarIndex
              ];

            if (
              !activeAvatar ||
              !targetAvatar
            ) {
              throw new Error(
                '対象Avatarが存在しません。',
              );
            }

            const turnOrdinal =
              getBattleTurnOrdinal(
                currentYear,
                turnIndex,
              );

            const supportLimit =
              getSupportUsageLimitFromEffects(
                activeAvatar.supportControlEffects,
                turnOrdinal,
              );

            const currentUsedSkills =
              actorData.usedSkills &&
              typeof actorData.usedSkills ===
                'object'
                ? actorData.usedSkills
                : {};

            const supportUseCount =
              getSupportUseCountFromUsedSkills(
                currentUsedSkills,
                currentYear,
                turnIndex,
              );

            const isFreeSupportCard =
              preset.effectCategory === 'サポートカード使用数' &&
              preset.statEffect.includes('制限されない');

            if (
              !isFreeSupportCard &&
              Number.isFinite(supportLimit) &&
              supportUseCount >= supportLimit
            ) {
              throw new Error(
                'このターンはサポートカードをこれ以上使用できません。',
              );
            }

            const calculated =
              calculateSupportEffectResult(
                preset,
                actorAvatars,
                opponentAvatars,
                requestedAvatarIndex,
                turnOrdinal,
                actionId,
              );

            const nextHand = hand.filter(
              (_card, index) =>
                index !== supportIndex,
            );

            const currentDeck =
              Array.isArray(privateData.deck)
                ? [...privateData.deck]
                : [];

            const drawCount = Math.min(
              calculated.extraDraw,
              Math.max(
                0,
                7 - nextHand.length,
              ),
              currentDeck.length,
            );

            const drawnCards =
              currentDeck.slice(
                0,
                drawCount,
              );
            const nextDeck =
              currentDeck.slice(
                drawCount,
              );

            nextHand.push(
              ...drawnCards,
            );

            let actorClassScores =
              Array.isArray(
                roomData[
                  actorRole === 'host'
                    ? 'hostClassScores'
                    : 'guestClassScores'
                ],
              )
                ? [
                    ...(roomData[
                      actorRole === 'host'
                        ? 'hostClassScores'
                        : 'guestClassScores'
                    ] ?? [0, 0, 0]),
                  ]
                : [0, 0, 0];

            let targetClassScores =
              Array.isArray(
                roomData[
                  opponentRole === 'host'
                    ? 'hostClassScores'
                    : 'guestClassScores'
                ],
              )
                ? [
                    ...(roomData[
                      opponentRole === 'host'
                        ? 'hostClassScores'
                        : 'guestClassScores'
                    ] ?? [0, 0, 0]),
                  ]
                : [0, 0, 0];

            const oldActorClassScore = Number(
              actorClassScores[
                requestedAvatarIndex
              ] ?? 0,
            );
            const oldTargetClassScore = Number(
              targetClassScores[
                requestedAvatarIndex
              ] ?? 0,
            );

            const newActorClassScore =
              Math.max(
                0,
                oldActorClassScore +
                  calculated.actorScoreDelta,
              );
            const newTargetClassScore =
              Math.max(
                0,
                oldTargetClassScore +
                  calculated.targetScoreDelta,
              );

            actorClassScores[
              requestedAvatarIndex
            ] = newActorClassScore;
            targetClassScores[
              requestedAvatarIndex
            ] = newTargetClassScore;

            const actualActorScoreDelta =
              newActorClassScore -
              oldActorClassScore;
            const actualTargetScoreDelta =
              newTargetClassScore -
              oldTargetClassScore;

            const actorTotalField =
              actorRole === 'host'
                ? 'hostTotalScore'
                : 'guestTotalScore';
            const targetTotalField =
              opponentRole === 'host'
                ? 'hostTotalScore'
                : 'guestTotalScore';

            const actorTotal =
              Math.max(
                0,
                Number(
                  roomData[
                    actorTotalField
                  ] ?? 0,
                ) +
                  actualActorScoreDelta,
              );
            const targetTotal =
              Math.max(
                0,
                Number(
                  roomData[
                    targetTotalField
                  ] ?? 0,
                ) +
                  actualTargetScoreDelta,
              );

            const nextUsedSkills =
              setSupportUseCountInUsedSkills(
                currentUsedSkills,
                currentYear,
                turnIndex,
                supportUseCount + 1,
              );

            const nextVersion =
              Number(
                actorData.battleStateVersion ??
                  0,
              ) + 1;
            const nextOpponentVersion =
              Number(
                opponentData.battleStateVersion ??
                  0,
              ) + 1;

            const processedAt =
              Date.now();

            const lastSupportAction = {
              actionId,
              player:
                actorRole,
              year:
                currentYear,
              turnIndex,
              avatarIndex:
                requestedAvatarIndex,
              supportCardId:
                requestedSupportCardId,
              supportPresetId:
                preset.id,
              supportName:
                preset.name,
              actorScoreDelta:
                actualActorScoreDelta,
              targetScoreDelta:
                actualTargetScoreDelta,
              processedAt,
            };

            const nextPendingAction = {
              actionId,
              type: 'PLAY_SUPPORT' as const,
              playerRole: actorRole,
              uid: authUid,
              year: currentYear,
              turnIndex,
              avatarIndex:
                requestedAvatarIndex,
              supportCardId:
                requestedSupportCardId,
              supportPresetId:
                preset.id,
              submittedAt:
                processedAt,
              supportCardConsumed: true,
            };

            transaction.set(
              privatePlayerRef,
              {
                uid: authUid,
                hand: nextHand,
                deck: nextDeck,
              },
              { merge: true },
            );

            transaction.update(
              roomRef,
              {
                ...(actorRole === 'host'
                  ? {
                      hostClassScores:
                        actorClassScores,
                      guestClassScores:
                        targetClassScores,
                      hostTotalScore:
                        actorTotal,
                      guestTotalScore:
                        targetTotal,
                    }
                  : {
                      guestClassScores:
                        actorClassScores,
                      hostClassScores:
                        targetClassScores,
                      guestTotalScore:
                        actorTotal,
                      hostTotalScore:
                        targetTotal,
                    }),
              },
            );

            transaction.update(
              actorPlayerRef,
              {
                avatars:
                  calculated.actorAvatars,
                handCount:
                  nextHand.length,
                deckCount:
                  nextDeck.length,
                usedSkills:
                  nextUsedSkills,
                battleStateVersion:
                  nextVersion,
                lastSupportActionId:
                  actionId,
                lastSupportAction,
                pendingAction:
                  nextPendingAction,
              },
            );

            transaction.update(
              opponentPlayerRef,
              {
                avatars:
                  calculated.targetAvatars,
                battleStateVersion:
                  nextOpponentVersion,
              },
            );

            return {
              actionId,
              alreadyProcessed: false,
              supportPresetId:
                preset.id,
              supportName:
                preset.name,
              actorScoreDelta:
                actualActorScoreDelta,
              targetScoreDelta:
                actualTargetScoreDelta,
              extraDraw: drawCount,
              actorRole,
              nextYear: currentYear,
              nextTurnIndex: turnIndex,
              nextBattlePhase:
                roomData.battlePhase ??
                'battle',
              actorAvatars:
                calculated.actorAvatars,
              opponentAvatars:
                calculated.targetAvatars,
            };
          }

          const actorBattleStateVersion =
            Number(
              actorData.battleStateVersion ?? 0,
            );

          const opponentBattleStateVersion =
            Number(
              opponentData.battleStateVersion ?? 0,
            );

          if (
            actorData.lastSkillActionId ===
            actionId
          ) {
            return {
              actionId,
              alreadyProcessed: true,
              gainedScore:
                Number(
                  actorData.lastSkillAction?.gainedScore ??
                    0,
                ),
              actorRole,
              nextYear:
                currentYear,
              nextTurnIndex:
                turnIndex,
              nextBattlePhase:
                roomData.battlePhase ??
                'battle',
              actorAvatars:
                actorData.avatars ??
                [],
              opponentAvatars:
                opponentData.avatars ??
                [],
              actorBattleStateVersion,
              opponentBattleStateVersion,
            };
          }

          const avatarIndex =
            requestedAvatarIndex;

          if (
            avatarIndex < 0 ||
            avatarIndex > 2
          ) {
            throw new Error(
              'avatarIndexが不正です。',
            );
          }

          if (
            avatarIndex !==
            currentYear - 1
          ) {
            throw new Error(
              '現在のクラスとAvatarが一致しません。',
            );
          }

          const actorAvatars =
            actorData.avatars
              ? [...actorData.avatars]
              : [];

          const opponentAvatars =
            opponentData.avatars
              ? [...opponentData.avatars]
              : [];

          const freshBattleStart = isFreshBattleStart(
            roomData,
            actorData,
            opponentData,
          );

          const sanitizedActorAvatars =
            freshBattleStart
              ? sanitizeFreshBattleAvatars(actorAvatars)
              : actorAvatars;
          const sanitizedOpponentAvatars =
            freshBattleStart
              ? sanitizeFreshBattleAvatars(opponentAvatars)
              : opponentAvatars;

          const actorAvatar =
            sanitizedActorAvatars[
              avatarIndex
            ];

          const opponentAvatar =
            sanitizedOpponentAvatars[
              avatarIndex
            ];

          if (freshBattleStart) {
            actorAvatars.splice(0, actorAvatars.length, ...sanitizedActorAvatars);
            opponentAvatars.splice(0, opponentAvatars.length, ...sanitizedOpponentAvatars);
          }

          if (
            !actorAvatar ||
            !opponentAvatar
          ) {
            throw new Error(
              '対象Avatarが存在しません。',
            );
          }

          if (typeof requestedSkillId !== 'string') {
            throw new Error('skillIdが不正です。');
          }

          const skill = getCanonicalSkill(
            actorAvatar,
            requestedSkillId,
          );

          if (
            (skill.rule ===
              'y_response_score' ||
              skill.rule === 'y_burst') &&
            (!requestedBoostStat ||
              !isStatKey(
                requestedBoostStat,
              ))
          ) {
            throw new Error(
              'このN-1技にはselectedBoostStatが必要です。',
            );
          }

          const usedSkills =
            actorData.usedSkills &&
            typeof actorData.usedSkills ===
              'object'
              ? actorData.usedSkills
              : {};

          const yearKey =
            String(currentYear);

          const usedForClass =
            Array.isArray(
              usedSkills[
                yearKey
              ],
            )
              ? usedSkills[
                  yearKey
                ]
              : [];

          if (
            skill.maxUsesPerClass >
              0 &&
            usedForClass.filter((usedSkillId) => usedSkillId === skill.id).length >=
              skill.maxUsesPerClass
          ) {
            throw new Error(
              'このSkillはこのクラスでは使用済みです。',
            );
          }

          const turnOrdinal =
            getBattleTurnOrdinal(
              currentYear,
              turnIndex,
            );

          const calculated =
            calculateSkillResult(
              skill,
              actorAvatar,
              opponentAvatar,
              turnOrdinal,
              requestedBoostStat,
            );

          actorAvatars[
            avatarIndex
          ] =
            calculated.nextActor;

          opponentAvatars[
            avatarIndex
          ] =
            calculated.nextTarget;

          const nextUsedSkills: Record<
            string,
            string[]
          > = {
            ...usedSkills,
          };

          if (
            skill.maxUsesPerClass >
              0
          ) {
            nextUsedSkills[
              yearKey
            ] = [
              ...usedForClass,
              skill.id,
            ];
          }

          const scoreField =
            actorRole === 'host'
              ? 'hostClassScores'
              : 'guestClassScores';

          const totalField =
            actorRole === 'host'
              ? 'hostTotalScore'
              : 'guestTotalScore';

          const scores =
            Array.isArray(
              roomData[
                scoreField
              ],
            )
              ? [
                  ...roomData[
                    scoreField
                  ]!,
                ]
              : [0, 0, 0];

          scores[
            avatarIndex
          ] =
            Number(
              scores[
                avatarIndex
              ] ?? 0,
            ) +
            calculated.gainedScore;

          const total =
            Number(
              roomData[
                totalField
              ] ?? 0,
            ) +
            calculated.gainedScore;

          const next =
            getNextTurnState(
              currentYear,
              turnIndex,
            );

          const nextActorAvatars =
            next.currentYear !== currentYear
              ? clearSupportEffectsFromAvatars(actorAvatars)
              : actorAvatars;
          const nextOpponentAvatars =
            next.currentYear !== currentYear
              ? clearSupportEffectsFromAvatars(opponentAvatars)
              : opponentAvatars;

          const processedAt =
            Date.now();

          const lastSkillAction: LastSkillAction =
            {
              actionId,
              player:
                actorRole,
              year:
                currentYear,
              turnIndex,
              avatarIndex,
              skillId:
                skill.id,
              skillName:
                skill.name,
              gainedScore:
                calculated.gainedScore,
              processedAt,
            };

          transaction.update(
            roomRef,
            {
              [scoreField]:
                scores,

              [totalField]:
                total,

              currentYear:
                next.currentYear,

              turnIndex:
                next.turnIndex,

              battlePhase:
                next.battlePhase,

              firstPlayer:
                next.battlePhase ===
                'setup'
                  ? null
                  : roomData.firstPlayer,

              startSeasonIdx:
                next.battlePhase ===
                'setup'
                  ? null
                  : roomData.startSeasonIdx ??
                    null,
            },
          );

          transaction.update(
            actorPlayerRef,
            {
              avatars:
                nextActorAvatars,

              usedSkills:
                nextUsedSkills,

              battleStateVersion:
                actorBattleStateVersion + 1,

              lastSkillActionId:
                actionId,

              lastSkillAction,

              pendingAction: FieldValue.delete(),
            },
          );

          transaction.update(
            opponentPlayerRef,
            {
              avatars:
                nextOpponentAvatars,

              battleStateVersion:
                opponentBattleStateVersion + 1,
            },
          );

          return {
            actionId,
            alreadyProcessed: false,

            gainedScore:
              calculated.gainedScore,

            actorRole,

            nextYear:
              next.currentYear,

            nextTurnIndex:
              next.turnIndex,

            nextBattlePhase:
              next.battlePhase,

            nextActorAvatars,
            nextOpponentAvatars,

            actorBattleStateVersion,
            opponentBattleStateVersion,
          };
        },
      );

    return NextResponse.json({
      ok: true,
      result,
    });
  } catch (error) {
    console.error(
      'Battle Action API error:',
      error,
    );

    const message =
      error instanceof Error
        ? error.message
        : 'Battle Actionの処理に失敗しました。';

    return NextResponse.json(
      {
        ok: false,
        error: message,
      },
      {
        status: 400,
      },
    );
  }
}
