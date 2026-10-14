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

  for (const effect of activeEffects) {
    if (!effect.statOverride) continue;
    for (const key of STAT_KEYS) {
      const override = effect.statOverride[key];
      if (typeof override === 'number' && Number.isFinite(override)) {
        result[key] = Math.max(0, override);
      }
    }
  }

  return result;
};
