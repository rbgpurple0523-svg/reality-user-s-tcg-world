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

  skills: Skill[];
};

type BattleAction = {
  actionId?: string;
  type?: 'USE_SKILL' | 'PLAY_SUPPORT';

  playerRole?: PlayerRole;
  uid?: string;

  year?: number;
  turnIndex?: number;
  avatarIndex?: number;

  skillId?: string;
  selectedBoostStat?: StatKey;

  supportCardId?: string;

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

type BattleActionRequest = {
  roomId?: unknown;
  actionId?: unknown;
  type?: unknown;
  year?: unknown;
  turnIndex?: unknown;
  avatarIndex?: unknown;
  skillId?: unknown;
  selectedBoostStat?: unknown;
};

const STAT_KEYS: StatKey[] = [
  'hp',
  'intellect',
  'dexterity',
  'charm',
];

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

const getEffectiveStats = (
  avatar: BattleAvatar,
): Record<StatKey, number> => {
  const result: Record<
    StatKey,
    number
  > = {
    hp: Number(
      avatar.stats?.hp ?? 0,
    ),

    intellect: Number(
      avatar.stats?.intellect ?? 0,
    ),

    dexterity: Number(
      avatar.stats?.dexterity ?? 0,
    ),

    charm: Number(
      avatar.stats?.charm ?? 0,
    ),
  };

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
  selectedBoostStat?: StatKey,
) => {
  const effective =
    getEffectiveStats(actor);

  const targetEffective =
    getEffectiveStats(target);

  let gainedScore = 0;

  const debuffs: Partial<
    Record<StatKey, number>
  > = {};

  let nextActor = actor;
  let nextTarget = target;

  if (
    skill.rule ===
    'primary_score'
  ) {
    const stat =
      skill.primaryStat ?? 'hp';

    gainedScore =
      effective[stat] * 10;
  } else if (
    skill.rule ===
    'product_score'
  ) {
    const first =
      skill.primaryStat ?? 'hp';

    const second =
      skill.secondaryStat ??
      'intellect';

    gainedScore =
      effective[first] *
      effective[second];
  } else if (
    skill.rule ===
    'difference_score'
  ) {
    const stat =
      skill.primaryStat ?? 'hp';

    gainedScore =
      Math.max(
        0,
        effective[stat] -
          targetEffective[stat],
      ) * 20;
  } else if (
    skill.rule ===
    'combo_score_and_debuff'
  ) {
    const first =
      skill.secondaryStat ??
      'intellect';

    const second =
      skill.tertiaryStat ??
      'charm';

    const targetStat =
      skill.primaryStat ?? 'hp';

    gainedScore =
      (
        effective[first] +
        effective[second]
      ) * 5;

    debuffs[targetStat] =
      Math.ceil(
        targetEffective[targetStat] / 2,
      );

    nextTarget =
      addDebuffs(
        target,
        debuffs,
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
    const actorMin =
      Math.min(
        ...Object.values(
          effective,
        ),
      );

    const targetMin =
      Math.min(
        ...Object.values(
          targetEffective,
        ),
      );

    gainedScore =
      Math.max(
        0,
        actorMin - targetMin,
      ) * 20;
  } else if (
    skill.rule === 'y_burst'
  ) {
    if (
      !selectedBoostStat ||
      !isStatKey(
        selectedBoostStat,
      )
    ) {
      throw new Error(
        'y_burstにはselectedBoostStatが必要です。',
      );
    }

    gainedScore = 100;

    nextActor = {
      ...actor,

      statBoost: {
        ...(actor.statBoost ?? {}),
        [selectedBoostStat]: 2,
      },
    };
  } else if (
    skill.rule === 'y_crash'
  ) {
    for (const key of STAT_KEYS) {
      debuffs[key] =
        Math.ceil(
          targetEffective[key] * 0.25,
        );
    }

    nextTarget =
      addDebuffs(
        target,
        debuffs,
      );
  } else {
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

      nextTarget =
        addDebuffs(
          target,
          debuffs,
        );
    }
  }

  return {
    gainedScore,
    nextActor,
    nextTarget,
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
      body.type !==
      'USE_SKILL'
    ) {
      return NextResponse.json(
        {
          ok: false,
          error:
            '現在のAPIはUSE_SKILLのみ対応しています。',
        },
        {
          status: 400,
        },
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
      typeof body.skillId !==
        'string' ||
      !body.skillId
    ) {
      return NextResponse.json(
        {
          ok: false,
          error:
            'skillIdがありません。',
        },
        {
          status: 400,
        },
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

          const actorAvatar =
            actorAvatars[
              avatarIndex
            ];

          const opponentAvatar =
            opponentAvatars[
              avatarIndex
            ];

          if (
            !actorAvatar ||
            !opponentAvatar
          ) {
            throw new Error(
              '対象Avatarが存在しません。',
            );
          }

          const skill =
            actorAvatar.skills.find(
              (item) =>
                item.id ===
                requestedSkillId,
            );

          if (!skill) {
            throw new Error(
              '指定されたSkillが存在しません。',
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
            usedForClass.includes(
              skill.id,
            )
          ) {
            throw new Error(
              'このSkillはこのクラスでは使用済みです。',
            );
          }

          const calculated =
            calculateSkillResult(
              skill,
              actorAvatar,
              opponentAvatar,
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
                actorAvatars,

              usedSkills:
                nextUsedSkills,

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
                opponentAvatars,
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

            actorAvatars,

            opponentAvatars,
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