/**
 * CPU戦・オンライン戦で共有する、対戦計算の基礎型と純粋関数。
 * React / Firebase / Firestore には依存しない。
 */

export type PlayerRole = 'host' | 'guest';

export type StatKey = 'hp' | 'intellect' | 'dexterity' | 'charm';

export const STAT_KEYS: readonly StatKey[] = [
  'hp',
  'intellect',
  'dexterity',
  'charm',
];

export type SupportAvatarEffectState = {
  id: string;
  sourcePresetId: string;
  /** 効果を発生させたプレイヤー。旧データ互換のため optional。 */
  appliedByRole?: PlayerRole;
  statDelta?: Partial<Record<StatKey, number>>;
  statOverride?: Partial<Record<StatKey, number>>;
  /** statOverride のスナップショットに含まれている既存 statDelta 効果のID。平均化後に追加された補正だけを後段で反映する。 */
  statDeltaIdsIncludedInOverride?: string[];
  skillSealIndex?: number;
  expiresAtTurnOrdinal: number | null;
};

export type SupportControlEffectState = {
  id: string;
  sourcePresetId: string;
  duration: '一時' | '永続';
  kind: 'limit' | 'free' | 'extra_draw';
  maxUsesPerTurn?: number;
  extraDrawPerTurn?: number;
  expiresAtTurnOrdinal: number | null;
};

export type BattleStatState = {
  stats: Record<StatKey, number>;
  baseStats?: Record<StatKey, number>;
  currentDebuff?: Partial<Record<StatKey, number>>;
  statBoost?: Partial<Record<StatKey, number>>;
  supportEffects?: SupportAvatarEffectState[];
};

export const isSupportEffectActive = (
  effect: { expiresAtTurnOrdinal: number | null },
  turnOrdinal: number,
): boolean =>
  effect.expiresAtTurnOrdinal === null ||
  turnOrdinal < effect.expiresAtTurnOrdinal;

/**
 * サポート効果・倍率・デバフを反映した有効ステータスを返す。
 * statOverride はコピー／平均化で確定した有効値なので、通常補正の後に適用する。
 */
export const calculateEffectiveStats = (
  avatar: BattleStatState,
  turnOrdinal: number,
  fallbackBaseStats?: Record<StatKey, number>,
): Record<StatKey, number> => {
  const sourceBaseStats =
    avatar.baseStats ?? fallbackBaseStats ?? avatar.stats;

  const result: Record<StatKey, number> = {
    hp: Math.max(0, Number(sourceBaseStats.hp ?? 0)),
    intellect: Math.max(0, Number(sourceBaseStats.intellect ?? 0)),
    dexterity: Math.max(0, Number(sourceBaseStats.dexterity ?? 0)),
    charm: Math.max(0, Number(sourceBaseStats.charm ?? 0)),
  };

  const activeEffects = (avatar.supportEffects ?? []).filter((effect) =>
    isSupportEffectActive(effect, turnOrdinal),
  );

  for (const effect of activeEffects) {
    if (!effect.statDelta) continue;
    for (const key of STAT_KEYS) {
      result[key] = Math.max(
        0,
        result[key] + Number(effect.statDelta[key] ?? 0),
      );
    }
  }

  for (const key of STAT_KEYS) {
    const boost = Number(avatar.statBoost?.[key] ?? 1);
    const debuff = Number(avatar.currentDebuff?.[key] ?? 0);
    result[key] = Math.max(0, result[key] * boost - debuff);
  }

  // コピー／平均化の値は、その効果を適用した時点の有効値をスナップショットとして保持する。
  // ただし、その後に追加されたサポート補正はスナップショットに隠されず反映する。
  // ステータスごとに最後にその値を上書きした効果を採用するため、複数のコピー／平均化も共存できる。
  for (const key of STAT_KEYS) {
    let latestOverride: SupportAvatarEffectState | undefined;

    for (const effect of activeEffects) {
      const override = effect.statOverride?.[key];
      if (typeof override === 'number' && Number.isFinite(override)) {
        latestOverride = effect;
      }
    }

    if (!latestOverride) continue;

    result[key] = Math.max(0, Number(latestOverride.statOverride?.[key] ?? 0));
    const includedIds = new Set(latestOverride.statDeltaIdsIncludedInOverride ?? []);

    for (const effect of activeEffects) {
      if (!effect.statDelta || includedIds.has(effect.id)) continue;
      result[key] = Math.max(
        0,
        result[key] + Number(effect.statDelta[key] ?? 0),
      );
    }
  }

  return result;
};


export type SkillScoreRule =
  | 'primary_score'
  | 'product_score'
  | 'difference_score'
  | 'combo_score_and_debuff'
  | 'total_score'
  | 'response_score'
  | 'burst'
  | 'crash'
  | 'y_total_score'
  | 'y_response_score'
  | 'y_burst'
  | 'y_crash';

export type SkillScoreInput = {
  rule: SkillScoreRule;
  effective: Record<StatKey, number>;
  targetEffective: Record<StatKey, number>;
  baseRank: readonly StatKey[];
  baseTargetStats?: Partial<Record<StatKey, number>>;
  primaryStat?: StatKey;
  secondaryStat?: StatKey;
  tertiaryStat?: StatKey;
  selectedStat?: StatKey;
};

/**
 * スキルのスコア計算をCPU戦・オンライン戦で共有する純粋関数。
 * 効果による状態変更（デバフ付与・ステータス強化等）は呼び出し側が担当する。
 */
export const calculateSkillScore = ({
  rule,
  effective,
  targetEffective,
  baseRank,
  baseTargetStats = {},
  primaryStat,
  secondaryStat,
  tertiaryStat,
  selectedStat,
}: SkillScoreInput): number => {
  const primary = primaryStat ?? baseRank[0] ?? 'hp';
  const firstProduct = primaryStat ?? baseRank[1] ?? 'intellect';
  const secondProduct = secondaryStat ?? baseRank[2] ?? 'dexterity';
  const firstCombo = secondaryStat ?? baseRank[2] ?? 'dexterity';
  const secondCombo = tertiaryStat ?? baseRank[3] ?? 'charm';
  const responseStat = selectedStat ?? baseRank[0] ?? 'hp';

  let score: number;
  switch (rule) {
    case 'primary_score':
      score = effective[primary] * 20;
      break;
    case 'product_score':
      score = (effective[firstProduct] + effective[secondProduct]) * 15;
      break;
    case 'difference_score':
      score = Math.max(0, effective[primary] - targetEffective[primary]) * 40;
      break;
    case 'combo_score_and_debuff': {
      const targetStat = primaryStat ?? baseRank[0] ?? 'hp';
      score = (effective[firstCombo] + effective[secondCombo]) * 10;
      // targetStat is intentionally resolved here alongside score rules so both sides use identical defaults.
      void targetStat;
      break;
    }
    case 'total_score':
    case 'y_total_score':
      score = Object.values(effective).reduce((sum, value) => sum + Number(value ?? 0), 0) * 10;
      break;
    case 'response_score':
    case 'y_response_score':
      score = Math.max(0, effective[responseStat] - targetEffective[responseStat]) * 40;
      break;
    case 'burst':
    case 'y_burst':
      score = effective[responseStat] * 10;
      break;
    case 'crash':
    case 'y_crash': {
      const baseOrder = new Map(baseRank.map((stat, index) => [stat, index]));
      const lowRank = STAT_KEYS.slice().sort((a, b) => {
        const diff = effective[a] - effective[b];
        if (diff !== 0) return diff;
        return (baseOrder.get(a) ?? STAT_KEYS.indexOf(a)) - (baseOrder.get(b) ?? STAT_KEYS.indexOf(b));
      });
      score = (effective[lowRank[0] ?? 'hp'] + effective[lowRank[1] ?? 'intellect']) * 10;
      // Kept in the input to make the expected target baseline explicit for callers and tests.
      void baseTargetStats;
      break;
    }
    default: {
      const exhaustive: never = rule;
      throw new Error(`Unsupported skill score rule: ${String(exhaustive)}`);
    }
  }

  return Math.max(0, Number.isFinite(score) ? score : 0);
};


export type ExtremeStatResult = {
  value: number;
  candidates: StatKey[];
  selected?: StatKey;
};

/** 最大／最小ステータスと同値候補を共通計算する。 */
export const calculateExtremeStatCandidates = (
  stats: Record<StatKey, number>,
  mode: 'highest' | 'lowest',
  selected?: StatKey,
): ExtremeStatResult => {
  const values = STAT_KEYS.map((key) => Number(stats[key] ?? 0));
  const value = mode === 'highest' ? Math.max(...values) : Math.min(...values);
  const candidates = STAT_KEYS.filter((key) => Number(stats[key] ?? 0) === value);
  const selectedKey = selected && candidates.includes(selected)
    ? selected
    : candidates.length === 1 ? candidates[0] : undefined;
  return { value, candidates, selected: selectedKey };
};

/** コピー・平均化効果が確定した有効値を、statOverride形式で返す。 */
export const calculateSupportStatOverride = (
  presetId: 'emo_29' | 'emo_30' | 'emo_31' | 'emo_32',
  actorEffective: Record<StatKey, number>,
  targetEffective: Record<StatKey, number>,
  selected?: StatKey,
): { targetSide: 'actor' | 'target'; statOverride: Partial<Record<StatKey, number>>; candidates?: StatKey[]; selected?: StatKey; value?: number } => {
  if (presetId === 'emo_29' || presetId === 'emo_30') {
    const source = presetId === 'emo_29' ? targetEffective : actorEffective;
    const extreme = calculateExtremeStatCandidates(source, presetId === 'emo_29' ? 'highest' : 'lowest', selected);
    if (!extreme.selected) {
      return { targetSide: presetId === 'emo_29' ? 'actor' : 'target', statOverride: {}, candidates: extreme.candidates, value: extreme.value };
    }
    return {
      targetSide: presetId === 'emo_29' ? 'actor' : 'target',
      statOverride: { [extreme.selected]: extreme.value },
      candidates: extreme.candidates,
      selected: extreme.selected,
      value: extreme.value,
    };
  }

  const source = presetId === 'emo_32' ? targetEffective : actorEffective;
  const average = Math.round(STAT_KEYS.reduce((sum, key) => sum + Number(source[key] ?? 0), 0) / STAT_KEYS.length);
  return {
    targetSide: presetId === 'emo_32' ? 'target' : 'actor',
    statOverride: { hp: average, intellect: average, dexterity: average, charm: average },
    value: average,
  };
};

/** スコア系サポートカードの増減値を共通化する。適用時の下限処理は状態更新側で行う。 */
export const calculateSupportScoreDelta = (
  presetId: 'emo_21' | 'emo_22',
  amount: number,
): { actorScoreDelta: number; targetScoreDelta: number } => ({
  actorScoreDelta: presetId === 'emo_21' ? Math.abs(amount) : 0,
  targetScoreDelta: presetId === 'emo_22' ? -Math.abs(amount) : 0,
});
