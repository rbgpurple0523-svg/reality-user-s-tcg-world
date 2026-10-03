'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { ensureAnonymousAuth, db } from '@/lib/firebase';
import { collection, getDocs, query, where } from 'firebase/firestore';
import CardGenerator from './CardGenerator';
import SupportCardGenerator from './SupportCardGenerator';
import { EMOTION_PRESETS } from './emotionPresets';
import type { EmotionAxisKey, EmotionPreset } from './emotionPresets';
import { COORDINATE_PRESETS } from './coordinatePresets';
import type {
  Archetype,
  CardColor,
  CoordinatePreset,
  Season,
  StatKey,
} from './coordinatePresets';
import type { ColorType } from './colorTypes';
import CoordinateRadialMap from './CoordinateRadialMap';

export type {
  Archetype,
  CardColor,
  CoordinatePreset,
  Season,
  StatKey,
} from './coordinatePresets';

export { COORDINATE_PRESETS };

export interface EntryRecord {
  id: string;
  presetId: string;
  cardType: 'coordinate' | 'emotion';
  profileUrl: string;
  userName: string;
  imageDataUrl: string;
  firstUser: string;
  customEffectName?: string;
  customSkills?: [string, string, string, string];
  skillDescriptions?: [string, string, string, string];
  skillVoices?: [string, string, string, string];
  flavorText?: string;
  color?: CardColor;
  colorHex?: string;
  colorType?: ColorType;
  showProfileUrl?: boolean;
  season?: Season;
  archetype?: Archetype;
  hp?: number;
  ap?: number;
  transferStatus?: 'none' | 'pending';
  createdAt: string;
  updatedAt?: string;
}

interface EntryHubProps {
  onBackToMenu?: () => void;
  onGoToDeckBuilder?: () => void;
  onStartCharacterRegistration?: (preset?: CoordinatePreset) => void;
  onStartSupportRegistration?: (preset?: EmotionPreset) => void;
  openEntryList?: boolean;
  onEntryListClose?: () => void;
}

const ENTRIES_KEY = 'reality_world_entries';

type LibraryMode = 'coordinate' | 'emotion';
type SupportMode = 'feeling' | 'performance';

type EmotionAxisConfig = {
  label: string;
  icon: string;
  x: number;
  y: number;
};

const EMOTION_AXIS_CONFIG: Record<EmotionAxisKey, EmotionAxisConfig> = {
  challenge: { label: '挑戦', icon: '🔥', x: 50, y: 8 },
  philosophy: { label: '哲学', icon: '◇', x: 88, y: 36 },
  compassion: { label: '慈愛', icon: '♡', x: 70, y: 89 },
  temptation: { label: '誘惑', icon: '✦', x: 30, y: 89 },
  freedom: { label: '自由', icon: '🪽', x: 12, y: 36 },
};

const EMOTION_AXIS_ORDER: EmotionAxisKey[] = [
  'challenge',
  'philosophy',
  'compassion',
  'temptation',
  'freedom',
];

const EMOTION_AXIS_RING_VALUES = [20, 40, 60, 80, 100];

function getEmotionMapPosition(
  emotion: EmotionPreset,
): { x: number; y: number } {
  const total = EMOTION_AXIS_ORDER.reduce(
    (sum, axis) =>
      sum +
      Math.max(
        0,
        Number(emotion.emotionAxes[axis] ?? 0),
      ),
    0,
  );

  if (total <= 0) return { x: 50, y: 49 };

  const weighted = EMOTION_AXIS_ORDER.reduce(
    (point, axis) => {
      const weight = Math.max(
        0,
        Number(emotion.emotionAxes[axis] ?? 0),
      );
      const vertex = EMOTION_AXIS_CONFIG[axis];

      return {
        x: point.x + vertex.x * weight,
        y: point.y + vertex.y * weight,
      };
    },
    { x: 0, y: 0 },
  );

  const seed = emotion.id
    .split('')
    .reduce(
      (sum, char) => sum + char.charCodeAt(0),
      0,
    );

  const jitterX = ((seed % 5) - 2) * 0.8;
  const jitterY =
    (((seed * 7) % 5) - 2) * 0.65;

  return {
    x: Math.min(
      92,
      Math.max(
        8,
        weighted.x / total + jitterX,
      ),
    ),
    y: Math.min(
      91,
      Math.max(
        9,
        weighted.y / total + jitterY,
      ),
    ),
  };
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function readNumber(value: unknown): number | undefined {
  return typeof value === 'number' &&
    Number.isFinite(value)
    ? value
    : undefined;
}

function readBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean'
    ? value
    : undefined;
}

function readStringTuple4(
  value: unknown,
): [string, string, string, string] | undefined {
  if (!Array.isArray(value) || value.length !== 4) {
    return undefined;
  }

  const result = value.filter(
    (item): item is string =>
      typeof item === 'string',
  );

  if (result.length !== 4) return undefined;

  return [
    result[0],
    result[1],
    result[2],
    result[3],
  ];
}

function getStoredEntries(): EntryRecord[] {
  if (typeof window === 'undefined') return [];

  try {
    const saved =
      localStorage.getItem(ENTRIES_KEY);

    if (!saved) return [];

    const parsed = JSON.parse(saved) as unknown;

    if (!Array.isArray(parsed)) return [];

    return parsed.filter(
      (entry): entry is EntryRecord =>
        Boolean(
          entry &&
            typeof entry === 'object' &&
            'id' in entry &&
            typeof entry.id === 'string' &&
            'presetId' in entry &&
            typeof entry.presetId === 'string' &&
            'cardType' in entry &&
            (entry.cardType === 'coordinate' ||
              entry.cardType === 'emotion'),
        ),
    );
  } catch {
    return [];
  }
}

function parseSharedEntry(
  id: string,
  data: Record<string, unknown>,
): EntryRecord | null {
  const cardType = data.cardType;
  const presetId = readString(data.presetId);

  if (
    (cardType !== 'coordinate' &&
      cardType !== 'emotion') ||
    !presetId
  ) {
    return null;
  }

  const userName =
    readString(data.userName) ||
    '無題のカード';

  const imageDataUrl =
    readString(data.imageDataUrl) ||
    readString(data.imageUrl) ||
    '';

  const firstUser =
    readString(data.firstUser) || '';

  const createdAt =
    readString(data.createdAt) ||
    new Date().toISOString();

  const color = readString(data.color);
  const colorType =
    readString(data.colorType);
  const season = readString(data.season);
  const archetype =
    readString(data.archetype);

  const transferStatus =
    data.transferStatus === 'pending'
      ? 'pending'
      : 'none';

  return {
    id,
    presetId,
    cardType,
    profileUrl:
      readString(data.profileUrl) || '',
    userName,
    imageDataUrl,
    firstUser,
    customEffectName:
      readString(data.customEffectName),
    customSkills:
      readStringTuple4(data.customSkills),
    skillDescriptions:
      readStringTuple4(data.skillDescriptions),
    skillVoices:
      readStringTuple4(data.skillVoices),
    flavorText:
      readString(data.flavorText),
    color:
      color === '赤' ||
      color === '青' ||
      color === '黄'
        ? color
        : undefined,
    colorHex:
      readString(data.colorHex),
    colorType:
      colorType as ColorType | undefined,
    showProfileUrl:
      readBoolean(data.showProfileUrl),
    season:
      season === '春' ||
      season === '夏' ||
      season === '秋' ||
      season === '冬'
        ? season
        : undefined,
    archetype:
      archetype as Archetype | undefined,
    hp: readNumber(data.hp),
    ap: readNumber(data.ap),
    transferStatus,
    createdAt,
    updatedAt:
      readString(data.updatedAt),
  };
}

async function loadSharedEntries(): Promise<EntryRecord[]> {
  try {
    await ensureAnonymousAuth();

    const cardsQuery = query(
      collection(db, 'cards'),
      where('status', '==', 'active'),
    );

    const snapshot =
      await getDocs(cardsQuery);

    return snapshot.docs
      .map((doc) =>
        parseSharedEntry(
          doc.id,
          doc.data() as Record<string, unknown>,
        ),
      )
      .filter(
        (entry): entry is EntryRecord =>
          Boolean(entry),
      );
  } catch (error) {
    console.error(
      'Failed to load shared cards',
      error,
    );

    return [];
  }
}

async function loadOwnedCardIds(): Promise<Set<string>> {
  try {
    const user =
      await ensureAnonymousAuth();

    const idToken =
      await user.getIdToken();

    const response = await fetch(
      '/api/cards/owned',
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${idToken}`,
        },
      },
    );

    if (!response.ok) {
      return new Set();
    }

    const data =
      await response.json();

    if (
      !data ||
      !Array.isArray(data.cardIds)
    ) {
      return new Set();
    }

    return new Set(
      data.cardIds.filter(
        (value: unknown): value is string =>
          typeof value === 'string',
      ),
    );
  } catch (error) {
    console.error(
      'Failed to load owned card IDs',
      error,
    );

    return new Set();
  }
}

async function issueTransferCode(
  cardId: string,
): Promise<string> {
  const user =
    await ensureAnonymousAuth();

  const idToken =
    await user.getIdToken();

  const response = await fetch(
    '/api/cards/transfer/issue',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify({
        cardId,
      }),
    },
  );

  const data =
    await response.json().catch(
      () => null,
    );

  if (!response.ok || !data?.ok) {
    const errorCode =
      typeof data?.error === 'string'
        ? data.error
        : 'CARD_TRANSFER_ISSUE_FAILED';

    throw new Error(errorCode);
  }

  if (
    typeof data.code !== 'string' ||
    !data.code
  ) {
    throw new Error(
      'TRANSFER_CODE_NOT_RETURNED',
    );
  }

  return data.code;
}

async function acceptTransferCode(
  cardId: string,
  code: string,
): Promise<void> {
  const user =
    await ensureAnonymousAuth();

  const idToken =
    await user.getIdToken();

  const response = await fetch(
    '/api/cards/transfer/accept',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify({
        cardId,
        code,
      }),
    },
  );

  const data =
    await response.json().catch(
      () => null,
    );

  if (!response.ok || !data?.ok) {
    const errorCode =
      typeof data?.error === 'string'
        ? data.error
        : 'CARD_TRANSFER_ACCEPT_FAILED';

    throw new Error(errorCode);
  }
}

function EmotionMap({
  emotions,
  selectedEmotionId,
  onSelect,
  isRegistered,
}: {
  emotions: EmotionPreset[];
  selectedEmotionId: string | null;
  onSelect: (emotion: EmotionPreset) => void;
  isRegistered: (emotionId: string) => boolean;
}) {
  return (
    <div className="relative mx-auto w-full max-w-[560px] aspect-square overflow-hidden rounded-3xl border border-purple-100 bg-[radial-gradient(circle_at_center,rgba(168,85,247,0.16),transparent_48%),linear-gradient(135deg,rgba(99,102,241,0.04),rgba(236,72,153,0.08))]">
      <svg
        viewBox="0 0 100 100"
        className="absolute inset-0 h-full w-full"
        aria-hidden="true"
      >
        {EMOTION_AXIS_RING_VALUES.map(
          (value) => {
            const points =
              EMOTION_AXIS_ORDER.map(
                (axis) => {
                  const vertex =
                    EMOTION_AXIS_CONFIG[
                      axis
                    ];

                  return [
                    50 +
                      (vertex.x - 50) *
                        (value / 100),
                    49 +
                      (vertex.y - 49) *
                        (value / 100),
                  ].join(',');
                },
              ).join(' ');

            return (
              <polygon
                key={value}
                points={points}
                fill="none"
                stroke="rgba(124,58,237,0.12)"
                strokeWidth="0.55"
              />
            );
          },
        )}

        {EMOTION_AXIS_ORDER.map(
          (axis) => {
            const vertex =
              EMOTION_AXIS_CONFIG[axis];

            return (
              <line
                key={axis}
                x1="50"
                y1="49"
                x2={vertex.x}
                y2={vertex.y}
                stroke="rgba(124,58,237,0.16)"
                strokeWidth="0.55"
              />
            );
          },
        )}

        <polygon
          points={EMOTION_AXIS_ORDER.map(
            (axis) =>
              `${EMOTION_AXIS_CONFIG[axis].x},${EMOTION_AXIS_CONFIG[axis].y}`,
          ).join(' ')}
          fill="rgba(139,92,246,0.04)"
          stroke="rgba(124,58,237,0.26)"
          strokeWidth="1"
        />
      </svg>

      {EMOTION_AXIS_ORDER.map(
        (axis) => {
          const vertex =
            EMOTION_AXIS_CONFIG[axis];

          return (
            <div
              key={axis}
              className="absolute -translate-x-1/2 -translate-y-1/2 whitespace-nowrap text-center"
              style={{
                left: `${vertex.x}%`,
                top: `${vertex.y}%`,
              }}
            >
              <div className="text-xl leading-none">
                {vertex.icon}
              </div>

              <div className="mt-1 text-[11px] font-black text-purple-950">
                {vertex.label}
              </div>
            </div>
          );
        },
      )}

      {emotions.map((emotion) => {
        const position =
          getEmotionMapPosition(emotion);

        const registered =
          isRegistered(emotion.id);

        const selected =
          emotion.id ===
          selectedEmotionId;

        return (
          <button
            key={emotion.id}
            type="button"
            onClick={() =>
              onSelect(emotion)
            }
            aria-label={`${emotion.emotionPhrase}｜${emotion.name}`}
            title={`${emotion.emotionPhrase}｜${emotion.name}`}
            className={`absolute h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 transition focus:outline-none focus:ring-2 focus:ring-offset-1 ${
              registered
                ? selected
                  ? 'z-30 scale-150 border-white bg-gray-500 ring-2 ring-gray-300'
                  : 'z-10 border-gray-100 bg-gray-400 hover:bg-gray-500'
                : selected
                  ? 'z-30 scale-150 border-white bg-purple-700 shadow-[0_0_0_4px_rgba(124,58,237,0.20),0_0_18px_rgba(124,58,237,0.75)]'
                  : 'z-10 border-purple-100 bg-purple-500 shadow-[0_0_10px_rgba(124,58,237,0.45)] hover:scale-150 hover:bg-fuchsia-500'
            }`}
            style={{
              left: `${position.x}%`,
              top: `${position.y}%`,
            }}
          />
        );
      })}

      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full border border-white/80 bg-white/90 px-3 py-1 text-[9px] font-black text-gray-600 shadow-sm backdrop-blur">
        点をタップして詳細を見る
      </div>
    </div>
  );
}

export default function EntryHub({
  onBackToMenu,
  onGoToDeckBuilder,
  onStartCharacterRegistration,
  onStartSupportRegistration,
  openEntryList,
  onEntryListClose,
}: EntryHubProps) {
  const [libraryMode, setLibraryMode] =
    useState<LibraryMode>('coordinate');

  const [supportMode, setSupportMode] =
    useState<SupportMode>('feeling');

  const [entries, setEntries] =
    useState<EntryRecord[]>(
      getStoredEntries,
    );

  const [ownedCardIds, setOwnedCardIds] =
    useState<Set<string>>(
      () => new Set(),
    );

  const [
    selectedEmotionId,
    setSelectedEmotionId,
  ] = useState<string | null>(null);

  const [
    showPerformanceFilter,
    setShowPerformanceFilter,
  ] = useState(false);

  const [
    showEntryList,
    setShowEntryList,
  ] = useState(false);

  const [
    showRegistrationInfo,
    setShowRegistrationInfo,
  ] = useState(false);

  const [
    showEmotionDetail,
    setShowEmotionDetail,
  ] = useState(false);

  const [
    emoTargetFilter,
    setEmoTargetFilter,
  ] = useState('ALL');

  const [
    emoStatFilter,
    setEmoStatFilter,
  ] = useState('ALL');

  const [
    emoDurationFilter,
    setEmoDurationFilter,
  ] = useState('ALL');

  const [
    activeGenerator,
    setActiveGenerator,
  ] = useState<{
    type: 'coordinate' | 'emotion';
    preset:
      | CoordinatePreset
      | EmotionPreset;
    editEntryId?: string;
  } | null>(null);

  const [
    transferTarget,
    setTransferTarget,
  ] = useState<EntryRecord | null>(null);

  const [
    showTransferConfirm,
    setShowTransferConfirm,
  ] = useState(false);

  const [
    transferCode,
    setTransferCode,
  ] = useState<string | null>(null);

  const [
    isIssuingTransferCode,
    setIsIssuingTransferCode,
  ] = useState(false);

  const [
    transferError,
    setTransferError,
  ] = useState<string | null>(null);

  const [
    transferCopied,
    setTransferCopied,
  ] = useState(false);

  const [
    transferAcceptTarget,
    setTransferAcceptTarget,
  ] = useState<EntryRecord | null>(null);

  const [
    transferAcceptCode,
    setTransferAcceptCode,
  ] = useState('');

  const [
    isAcceptingTransfer,
    setIsAcceptingTransfer,
  ] = useState(false);

  const [
    transferAcceptError,
    setTransferAcceptError,
  ] = useState<string | null>(null);

  const reloadEntries = async () => {
    const cachedEntries =
      getStoredEntries();

    const [
      sharedEntries,
      nextOwnedCardIds,
    ] = await Promise.all([
      loadSharedEntries(),
      loadOwnedCardIds(),
    ]);

    const merged =
      new Map<string, EntryRecord>();

    cachedEntries.forEach((entry) => {
      merged.set(entry.id, entry);
    });

    sharedEntries.forEach((entry) => {
      merged.set(entry.id, entry);
    });

    const nextEntries =
      Array.from(merged.values());

    if (
      typeof window !== 'undefined'
    ) {
      localStorage.setItem(
        ENTRIES_KEY,
        JSON.stringify(nextEntries),
      );
    }

    setEntries(nextEntries);
    setOwnedCardIds(
      nextOwnedCardIds,
    );
  };

  useEffect(() => {
    let cancelled = false;

    const initializeEntries =
      async () => {
        const cachedEntries =
          getStoredEntries();

        if (!cancelled) {
          setEntries(
            cachedEntries,
          );
        }

        const [
          sharedEntries,
          nextOwnedCardIds,
        ] = await Promise.all([
          loadSharedEntries(),
          loadOwnedCardIds(),
        ]);

        if (cancelled) return;

        const merged =
          new Map<string, EntryRecord>();

        cachedEntries.forEach(
          (entry) => {
            merged.set(
              entry.id,
              entry,
            );
          },
        );

        sharedEntries.forEach(
          (entry) => {
            merged.set(
              entry.id,
              entry,
            );
          },
        );

        const nextEntries =
          Array.from(
            merged.values(),
          );

        localStorage.setItem(
          ENTRIES_KEY,
          JSON.stringify(
            nextEntries,
          ),
        );

        setEntries(
          nextEntries,
        );

        setOwnedCardIds(
          nextOwnedCardIds,
        );
      };

    void initializeEntries();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (openEntryList) {
      setShowEntryList(true);
    }
  }, [openEntryList]);

  const handleCloseEntryList = () => {
    setShowEntryList(false);
    onEntryListClose?.();
  };

  const totalPossibleSlots =
    COORDINATE_PRESETS.length +
    EMOTION_PRESETS.length;

  const filledPresetCount = useMemo(
    () =>
      [
        ...COORDINATE_PRESETS,
        ...EMOTION_PRESETS,
      ].filter(
        (preset) =>
          entries.filter(
            (entry) =>
              entry.presetId ===
              preset.id,
          ).length >= 1,
      ).length,
    [entries],
  );

  const countAtLeastTwo = useMemo(
    () =>
      [
        ...COORDINATE_PRESETS,
        ...EMOTION_PRESETS,
      ].filter(
        (preset) =>
          entries.filter(
            (entry) =>
              entry.presetId ===
              preset.id,
          ).length >= 2,
      ).length,
    [entries],
  );

  const countAtLeastOneRate =
    filledPresetCount /
    Math.max(
      1,
      totalPossibleSlots,
    );

  const countAtLeastTwoRate =
    countAtLeastTwo /
    Math.max(
      1,
      totalPossibleSlots,
    );

  const maxEntryLimit =
    countAtLeastOneRate >= 0.9 &&
    countAtLeastTwoRate >= 0.5
      ? 3
      : countAtLeastOneRate >= 0.5
        ? 2
        : 1;

  const characterEntries =
    entries.filter(
      (entry) =>
        entry.cardType ===
        'coordinate',
    );

  const supportEntries =
    entries.filter(
      (entry) =>
        entry.cardType ===
        'emotion',
    );

  const selectedEmotion =
    selectedEmotionId
      ? EMOTION_PRESETS.find(
          (emotion) =>
            emotion.id ===
            selectedEmotionId,
        ) ?? null
      : null;

  const getEntryCount = (
    presetId: string,
  ) =>
    entries.filter(
      (entry) =>
        entry.presetId === presetId,
    ).length;

  const filteredEmotions =
    useMemo(
      () =>
        EMOTION_PRESETS.filter(
          (emotion) => {
            const matchTarget =
              emoTargetFilter ===
                'ALL' ||
              emotion.target ===
                emoTargetFilter;

            const matchStat =
              emoStatFilter ===
                'ALL' ||
              emotion.effectCategory ===
                emoStatFilter;

            const matchDuration =
              emoDurationFilter ===
                'ALL' ||
              emotion.duration ===
                emoDurationFilter;

            return (
              matchTarget &&
              matchStat &&
              matchDuration
            );
          },
        ),
      [
        emoTargetFilter,
        emoStatFilter,
        emoDurationFilter,
      ],
    );

  const handleEmotionSelect = (
    emotion: EmotionPreset,
  ) => {
    setSelectedEmotionId(
      emotion.id,
    );
    setShowEmotionDetail(true);
  };

  const handleRegisteredGeneratorClose =
    () => {
      void reloadEntries();
      setActiveGenerator(null);
    };

  const handleRegisteredGeneratorComplete =
    () => {
      void reloadEntries();
      setActiveGenerator(null);
      setShowEntryList(true);
    };

  const openTransferDialog = (
    entry: EntryRecord,
  ) => {
    setTransferTarget(entry);
    setTransferCode(null);
    setTransferError(null);
    setTransferCopied(false);
    setShowTransferConfirm(true);
  };

  const closeTransferDialog = () => {
    if (isIssuingTransferCode) {
      return;
    }

    setShowTransferConfirm(false);
    setTransferTarget(null);
    setTransferError(null);
  };

  const handleIssueTransferCode =
    async () => {
      if (!transferTarget) return;

      setIsIssuingTransferCode(true);
      setTransferError(null);

      try {
        const code =
          await issueTransferCode(
            transferTarget.id,
          );

        setTransferCode(code);
        setShowTransferConfirm(false);

        await reloadEntries();
      } catch (error) {
        console.error(
          'Failed to issue transfer code',
          error,
        );

        const code =
          error instanceof Error
            ? error.message
            : 'CARD_TRANSFER_ISSUE_FAILED';

        if (
          code ===
          'CARD_TRANSFER_PENDING'
        ) {
          setTransferError(
            'このカードはすでに引き継ぎ中です。',
          );
        } else if (
          code ===
          'PERMISSION_DENIED'
        ) {
          setTransferError(
            'このカードの所有者ではないため、引き継ぎコードを発行できません。',
          );
        } else {
          setTransferError(
            '引き継ぎコードの発行に失敗しました。もう一度お試しください。',
          );
        }
      } finally {
        setIsIssuingTransferCode(false);
      }
    };

  const handleCopyTransferCode =
    async () => {
      if (!transferCode) return;

      try {
        await navigator.clipboard.writeText(
          transferCode,
        );

        setTransferCopied(true);

        window.setTimeout(() => {
          setTransferCopied(false);
        }, 1800);
      } catch (error) {
        console.error(
          'Failed to copy transfer code',
          error,
        );
      }
    };

  const openTransferAcceptDialog = (
    entry: EntryRecord,
  ) => {
    setTransferAcceptTarget(entry);
    setTransferAcceptCode('');
    setTransferAcceptError(null);
  };

  const closeTransferAcceptDialog = () => {
    if (isAcceptingTransfer) {
      return;
    }

    setTransferAcceptTarget(null);
    setTransferAcceptCode('');
    setTransferAcceptError(null);
  };

  const handleAcceptTransfer =
    async () => {
      if (!transferAcceptTarget) {
        return;
      }

      const code =
        transferAcceptCode
          .replace(/\s+/g, '')
          .toUpperCase();

      if (!code) {
        setTransferAcceptError(
          '引き継ぎコードを入力してください。',
        );
        return;
      }

      setIsAcceptingTransfer(true);
      setTransferAcceptError(null);

      try {
        await acceptTransferCode(
          transferAcceptTarget.id,
          code,
        );

        await reloadEntries();

        setTransferAcceptTarget(null);
        setTransferAcceptCode('');
      } catch (error) {
        console.error(
          'Failed to accept transfer code',
          error,
        );

        const errorCode =
          error instanceof Error
            ? error.message
            : 'CARD_TRANSFER_ACCEPT_FAILED';

        if (
          errorCode ===
          'INVALID_TRANSFER_CODE'
        ) {
          setTransferAcceptError(
            '引き継ぎコードが正しくありません。',
          );
        } else if (
          errorCode ===
          'CARD_TRANSFER_NOT_PENDING'
        ) {
          setTransferAcceptError(
            'このカードは現在、引き継ぎ中ではありません。',
          );
        } else if (
          errorCode ===
          'CARD_DELETED'
        ) {
          setTransferAcceptError(
            'このカードはすでに削除されています。',
          );
        } else {
          setTransferAcceptError(
            '引き継ぎに失敗しました。もう一度お試しください。',
          );
        }
      } finally {
        setIsAcceptingTransfer(false);
      }
    };

  if (activeGenerator) {
    if (
      activeGenerator.type ===
      'coordinate'
    ) {
      return (
        <CardGenerator
          selectedCoordinate={
            activeGenerator.preset as CoordinatePreset
          }
          onBackToHub={
            handleRegisteredGeneratorClose
          }
          onOpenEntryList={
            handleRegisteredGeneratorComplete
          }
          openEntryId={
            activeGenerator.editEntryId
          }
        />
      );
    }

    return (
      <SupportCardGenerator
        selectedEmotion={
          activeGenerator.preset as EmotionPreset
        }
        onBackToHub={
          handleRegisteredGeneratorClose
        }
      />
    );
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-5 p-4 text-gray-900 sm:p-6">
      <section className="overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-sm">
        <div className="bg-gradient-to-br from-indigo-950 via-indigo-900 to-purple-900 p-5 text-white sm:p-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="text-[10px] font-black tracking-[0.2em] text-indigo-200">
                CARD LIBRARY
              </div>

              <h1 className="mt-1 text-2xl font-black sm:text-3xl">
                カードライブラリ
              </h1>

              <p className="mt-2 max-w-2xl text-xs leading-relaxed text-indigo-100">
                登録したカードを確認したり、新しく参加するコーデ・エモーションを選べます。
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              {onGoToDeckBuilder && (
                <button
                  type="button"
                  onClick={
                    onGoToDeckBuilder
                  }
                  className="rounded-xl bg-white px-4 py-2.5 text-xs font-black text-indigo-900 shadow-sm transition hover:bg-indigo-50"
                >
                  チームを構築する
                </button>
              )}

              {onBackToMenu && (
                <button
                  type="button"
                  onClick={
                    onBackToMenu
                  }
                  className="rounded-xl border border-white/20 bg-white/10 px-4 py-2.5 text-xs font-black text-white transition hover:bg-white/20"
                >
                  ← メニューへ
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-200 bg-gray-50 px-4 py-3">
          <div className="text-xs font-black text-gray-700">
            登録状況：
            <span className="text-indigo-700">
              キャラ {characterEntries.length} / 1
            </span>

            <span className="mx-1 text-gray-400">
              ・
            </span>

            <span className="text-purple-700">
              サポート {supportEntries.length} / 1
            </span>
          </div>

          <button
            type="button"
            onClick={() =>
              setShowRegistrationInfo(
                true,
              )
            }
            className="text-[10px] font-black text-gray-500 underline underline-offset-2 hover:text-gray-800"
          >
            登録について
          </button>
        </div>
      </section>

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() =>
            setLibraryMode(
              'coordinate',
            )
          }
          className={`rounded-2xl border px-4 py-4 text-left transition ${
            libraryMode ===
            'coordinate'
              ? 'border-indigo-900 bg-indigo-900 text-white shadow-sm'
              : 'border-gray-200 bg-white text-gray-800 hover:bg-indigo-50'
          }`}
        >
          <div className="text-sm font-black">
            👤 キャラカード
          </div>

          <div className="mt-1 text-[10px] font-bold opacity-75">
            コーデの性能マップから探す
          </div>
        </button>

        <button
          type="button"
          onClick={() =>
            setLibraryMode(
              'emotion',
            )
          }
          className={`rounded-2xl border px-4 py-4 text-left transition ${
            libraryMode ===
            'emotion'
              ? 'border-purple-900 bg-purple-900 text-white shadow-sm'
              : 'border-gray-200 bg-white text-gray-800 hover:bg-purple-50'
          }`}
        >
          <div className="text-sm font-black">
            ✨ サポートカード
          </div>

          <div className="mt-1 text-[10px] font-bold opacity-75">
            想い・性能から探す
          </div>
        </button>
      </div>

      {libraryMode ===
      'coordinate' ? (
        <section className="overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-sm">
          <div className="border-b border-gray-200 px-5 py-5 sm:px-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <div className="text-[9px] font-black tracking-[0.18em] text-indigo-500">
                  CHARACTER CARDS
                </div>

                <h2 className="mt-1 text-xl font-black">
                  コーデの性能マップ
                </h2>

                <p className="mt-1 text-[10px] leading-relaxed text-gray-600">
                  気になるコーデをタップすると、その性能と登録済みカードを確認できます。
                </p>
              </div>

              {onStartCharacterRegistration && (
                <button
                  type="button"
                  onClick={() =>
                    onStartCharacterRegistration()
                  }
                  className="shrink-0 rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-black text-white transition hover:bg-indigo-700"
                >
                  ＋ キャラカードを登録
                </button>
              )}
            </div>
          </div>

          <div className="p-4 sm:p-6">
            <CoordinateRadialMap
              coordinates={
                COORDINATE_PRESETS
              }
              entries={entries}
              maxEntryLimit={
                maxEntryLimit
              }
              mode="entry"
              onEntry={(
                coordinate,
              ) => {
                setActiveGenerator({
                  type: 'coordinate',
                  preset: coordinate,
                });
              }}
            />
          </div>
        </section>
      ) : (
        <section className="overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-sm">
          <div className="border-b border-gray-200 px-5 py-5 sm:px-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
              <div>
                <div className="text-[9px] font-black tracking-[0.18em] text-purple-500">
                  SUPPORT CARDS
                </div>

                <h2 className="mt-1 text-xl font-black">
                  エモーションを探す
                </h2>

                <p className="mt-1 text-[10px] leading-relaxed text-gray-600">
                  「どんな想い？」から探すか、「どんな効果？」から探すかを切り替えられます。
                </p>
              </div>

              {onStartSupportRegistration && (
                <button
                  type="button"
                  onClick={() =>
                    onStartSupportRegistration()
                  }
                  className="shrink-0 rounded-xl bg-purple-600 px-4 py-2.5 text-xs font-black text-white transition hover:bg-purple-700"
                >
                  ＋ サポートカードを登録
                </button>
              )}
            </div>

            <div
              className="mt-4 inline-flex rounded-full border border-purple-200 bg-purple-50 p-1"
              role="group"
              aria-label="エモーション探索モード"
            >
              <button
                type="button"
                onClick={() =>
                  setSupportMode(
                    'feeling',
                  )
                }
                className={`rounded-full px-4 py-2 text-[10px] font-black transition ${
                  supportMode ===
                  'feeling'
                    ? 'bg-purple-800 text-white shadow-sm'
                    : 'text-purple-700 hover:bg-white'
                }`}
              >
                想いから
              </button>

              <button
                type="button"
                onClick={() =>
                  setSupportMode(
                    'performance',
                  )
                }
                className={`rounded-full px-4 py-2 text-[10px] font-black transition ${
                  supportMode ===
                  'performance'
                    ? 'bg-purple-800 text-white shadow-sm'
                    : 'text-purple-700 hover:bg-white'
                }`}
              >
                性能から
              </button>
            </div>
          </div>

          {supportMode ===
          'feeling' ? (
            <div className="p-4 sm:p-6">
              <EmotionMap
                emotions={
                  EMOTION_PRESETS
                }
                selectedEmotionId={
                  selectedEmotionId
                }
                onSelect={
                  handleEmotionSelect
                }
                isRegistered={(
                  emotionId,
                ) =>
                  getEntryCount(
                    emotionId,
                  ) > 0
                }
              />

              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[9px] font-bold text-gray-500">
                <span>
                  ● 未登録{' '}
                  <span className="text-gray-400">
                    ● 登録済み
                  </span>
                </span>

                <span>
                  {
                    EMOTION_PRESETS.length
                  }
                  種のエモーション
                </span>
              </div>
            </div>
          ) : (
            <div className="space-y-4 p-4 sm:p-6">
              <div className="rounded-2xl border border-purple-100 bg-purple-50/50 p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="text-[9px] font-black tracking-[0.16em] text-purple-500">
                      PERFORMANCE SEARCH
                    </div>

                    <div className="mt-1 text-sm font-black text-purple-950">
                      効果条件からエモーションを探す
                    </div>

                    <div className="mt-1 text-[10px] font-bold text-gray-600">
                      {emoTargetFilter ===
                        'ALL' &&
                      emoStatFilter ===
                        'ALL' &&
                      emoDurationFilter ===
                        'ALL'
                        ? 'すべての条件で表示中'
                        : `対象：${
                            emoTargetFilter ===
                            'ALL'
                              ? 'すべて'
                              : emoTargetFilter
                          } / 効果：${
                            emoStatFilter ===
                            'ALL'
                              ? 'すべて'
                              : emoStatFilter
                          } / 持続：${
                            emoDurationFilter ===
                            'ALL'
                              ? 'すべて'
                              : emoDurationFilter
                          }`}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() =>
                      setShowPerformanceFilter(
                        true,
                      )
                    }
                    className="shrink-0 rounded-xl border border-purple-200 bg-white px-4 py-2.5 text-[10px] font-black text-purple-800 shadow-sm hover:bg-purple-50"
                  >
                    条件を設定
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                {filteredEmotions.map(
                  (emotion) => {
                    const count =
                      getEntryCount(
                        emotion.id,
                      );

                    const full =
                      count >=
                      maxEntryLimit;

                    return (
                      <button
                        key={emotion.id}
                        type="button"
                        onClick={() =>
                          handleEmotionSelect(
                            emotion,
                          )
                        }
                        className="w-full rounded-2xl border border-gray-200 bg-white p-4 text-left shadow-sm transition hover:border-purple-300 hover:bg-purple-50/30"
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="min-w-0">
                            <div className="flex flex-wrap gap-1.5">
                              <span className="rounded-lg bg-purple-100 px-2 py-1 text-[9px] font-black text-purple-800">
                                {
                                  emotion.target
                                }
                              </span>

                              <span className="rounded-lg bg-purple-100 px-2 py-1 text-[9px] font-black text-purple-800">
                                {
                                  emotion.effectCategory
                                }
                              </span>

                              <span className="rounded-lg bg-purple-100 px-2 py-1 text-[9px] font-black text-purple-800">
                                {
                                  emotion.duration
                                }
                              </span>
                            </div>

                            <div className="mt-2 font-black text-gray-900">
                              {
                                emotion.name
                              }
                            </div>

                            <div className="mt-1 text-[10px] leading-relaxed text-gray-600">
                              {
                                emotion.statEffect
                              }
                              {emotion.effectAmount
                                ? ` / ${emotion.effectAmount}`
                                : ''}
                            </div>
                          </div>

                          <span
                            className={`shrink-0 rounded-full px-2.5 py-1 text-[9px] font-black ${
                              full
                                ? 'bg-gray-100 text-gray-400'
                                : 'bg-purple-100 text-purple-700'
                            }`}
                          >
                            {count} /{' '}
                            {
                              maxEntryLimit
                            }
                          </span>
                        </div>
                      </button>
                    );
                  },
                )}
              </div>
            </div>
          )}
        </section>
      )}

      {characterEntries.length +
        supportEntries.length >
        0 && (
        <button
          type="button"
          onClick={() =>
            setShowEntryList(true)
          }
          className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-xs font-black text-gray-700 shadow-sm hover:bg-gray-50"
        >
          登録済みカードを見る
        </button>
      )}

      {showEmotionDetail &&
        selectedEmotion && (
          <div
            className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
            role="dialog"
            aria-modal="true"
          >
            <div className="max-h-[88vh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl">
              <div className="sticky top-0 z-10 border-b border-gray-200 bg-white/95 px-5 py-4 backdrop-blur">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-[9px] font-black tracking-[0.16em] text-purple-500">
                      EMOTION DETAILS
                    </div>

                    <h3 className="mt-1 text-lg font-black text-gray-900">
                      {
                        selectedEmotion.name
                      }
                    </h3>
                  </div>

                  <button
                    type="button"
                    onClick={() =>
                      setShowEmotionDetail(
                        false,
                      )
                    }
                    className="rounded-full bg-gray-100 px-3 py-1.5 text-[10px] font-black text-gray-600 hover:bg-gray-200"
                  >
                    閉じる
                  </button>
                </div>
              </div>

              <div className="space-y-4 p-5">
                <div className="rounded-2xl border border-purple-100 bg-purple-50/60 p-4">
                  <div className="text-[9px] font-black text-purple-500">
                    性能
                  </div>

                  <div className="mt-1 text-sm font-black text-purple-950">
                    {
                      selectedEmotion.statEffect
                    }
                    {selectedEmotion.effectAmount
                      ? ` / ${selectedEmotion.effectAmount}`
                      : ''}
                  </div>

                  <div className="mt-1 text-[10px] font-bold text-gray-500">
                    {
                      selectedEmotion.target
                    }{' '}
                    /{' '}
                    {
                      selectedEmotion.duration
                    }{' '}
                    /{' '}
                    {
                      selectedEmotion.effectCategory
                    }
                  </div>
                </div>

                <div className="rounded-2xl border border-gray-200 bg-white p-4">
                  <div className="text-[9px] font-black text-gray-400">
                    想い
                  </div>

                  <div className="mt-1 font-serif text-base font-black leading-relaxed text-gray-900">
                    {
                      selectedEmotion.emotionPhrase
                    }
                  </div>
                </div>

                <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[9px] font-black text-gray-500">
                      登録状況
                    </span>

                    <span
                      className={`rounded-full px-2.5 py-1 text-[9px] font-black ${
                        getEntryCount(
                          selectedEmotion.id,
                        ) >=
                        maxEntryLimit
                          ? 'bg-gray-200 text-gray-500'
                          : 'bg-purple-100 text-purple-700'
                      }`}
                    >
                      {
                        getEntryCount(
                          selectedEmotion.id,
                        )
                      }{' '}
                      /{' '}
                      {
                        maxEntryLimit
                      }
                    </span>
                  </div>

                  {getEntryCount(
                    selectedEmotion.id,
                  ) > 0 && (
                    <div className="mt-3 space-y-2">
                      {supportEntries
                        .filter(
                          (entry) =>
                            entry.presetId ===
                            selectedEmotion.id,
                        )
                        .map((entry) => (
                          <div
                            key={entry.id}
                            className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white p-2.5"
                          >
                            {entry.imageDataUrl ? (
                              <img
                                src={
                                  entry.imageDataUrl
                                }
                                alt=""
                                className="h-9 w-9 rounded-lg border border-gray-200 object-cover"
                              />
                            ) : (
                              <div className="h-9 w-9 rounded-lg bg-gray-100" />
                            )}

                            <div className="min-w-0">
                              <div className="truncate text-[10px] font-black text-gray-900">
                                {
                                  entry.userName
                                }
                              </div>

                              <div className="truncate text-[9px] font-bold text-purple-700">
                                {entry.customEffectName ||
                                  selectedEmotion.name}
                              </div>
                            </div>
                          </div>
                        ))}
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  disabled={
                    getEntryCount(
                      selectedEmotion.id,
                    ) >=
                      maxEntryLimit ||
                    !onStartSupportRegistration
                  }
                  onClick={() => {
                    if (
                      getEntryCount(
                        selectedEmotion.id,
                      ) >=
                        maxEntryLimit ||
                      !onStartSupportRegistration
                    ) {
                      return;
                    }

                    setShowEmotionDetail(
                      false,
                    );

                    onStartSupportRegistration(
                      selectedEmotion,
                    );
                  }}
                  className={`w-full rounded-2xl py-3 text-xs font-black text-white transition ${
                    getEntryCount(
                      selectedEmotion.id,
                    ) >=
                    maxEntryLimit
                      ? 'cursor-not-allowed bg-gray-300'
                      : 'bg-purple-700 hover:bg-purple-800'
                  }`}
                >
                  {getEntryCount(
                    selectedEmotion.id,
                  ) >= maxEntryLimit
                    ? 'このエモーションは満員です'
                    : 'このエモーションで登録する'}
                </button>
              </div>
            </div>
          </div>
        )}

      {showPerformanceFilter && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-md rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl">
            <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
              <div>
                <div className="text-[9px] font-black tracking-[0.16em] text-purple-500">
                  PERFORMANCE FILTER
                </div>

                <h3 className="mt-1 text-base font-black">
                  性能条件を設定
                </h3>
              </div>

              <button
                type="button"
                onClick={() =>
                  setShowPerformanceFilter(
                    false,
                  )
                }
                className="rounded-full bg-gray-100 px-3 py-1.5 text-[10px] font-black text-gray-600"
              >
                閉じる
              </button>
            </div>

            <div className="space-y-3 p-5">
              <label className="block text-[10px] font-black text-gray-600">
                対象

                <select
                  value={
                    emoTargetFilter
                  }
                  onChange={(e) =>
                    setEmoTargetFilter(
                      e.target.value,
                    )
                  }
                  className="mt-1 w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-xs font-bold"
                >
                  <option value="ALL">
                    すべて
                  </option>
                  <option value="自分">
                    自分
                  </option>
                  <option value="相手">
                    相手
                  </option>
                  <option value="自分・相手">
                    自分・相手
                  </option>
                </select>
              </label>

              <label className="block text-[10px] font-black text-gray-600">
                効果

                <select
                  value={
                    emoStatFilter
                  }
                  onChange={(e) =>
                    setEmoStatFilter(
                      e.target.value,
                    )
                  }
                  className="mt-1 w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-xs font-bold"
                >
                  <option value="ALL">
                    すべて
                  </option>

                  {Array.from(
                    new Set(
                      EMOTION_PRESETS.map(
                        (emotion) =>
                          emotion.effectCategory,
                      ),
                    ),
                  ).map(
                    (category) => (
                      <option
                        key={category}
                        value={
                          category
                        }
                      >
                        {category}
                      </option>
                    ),
                  )}
                </select>
              </label>

              <label className="block text-[10px] font-black text-gray-600">
                持続

                <select
                  value={
                    emoDurationFilter
                  }
                  onChange={(e) =>
                    setEmoDurationFilter(
                      e.target.value,
                    )
                  }
                  className="mt-1 w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-xs font-bold"
                >
                  <option value="ALL">
                    すべて
                  </option>
                  <option value="一時">
                    一時
                  </option>
                  <option value="永続">
                    永続
                  </option>
                </select>
              </label>

              <button
                type="button"
                onClick={() =>
                  setShowPerformanceFilter(
                    false,
                  )
                }
                className="mt-2 w-full rounded-2xl bg-purple-700 py-3 text-xs font-black text-white"
              >
                この条件で探す
              </button>
            </div>
          </div>
        </div>
      )}

      {showEntryList && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="max-h-[88vh] w-full max-w-2xl overflow-y-auto rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-200 bg-white/95 px-5 py-4 backdrop-blur">
              <div>
                <div className="text-[9px] font-black tracking-[0.16em] text-gray-400">
                  REGISTERED CARDS
                </div>

                <h3 className="mt-1 text-base font-black">
                  登録済みカード
                </h3>
              </div>

              <button
                type="button"
                onClick={
                  handleCloseEntryList
                }
                className="rounded-full bg-gray-100 px-3 py-1.5 text-[10px] font-black text-gray-600"
              >
                閉じる
              </button>
            </div>

            <div className="space-y-3 p-5">
              {entries.map(
                (entry) => {
                  const emotion =
                    entry.cardType ===
                    'emotion'
                      ? EMOTION_PRESETS.find(
                          (item) =>
                            item.id ===
                            entry.presetId,
                        )
                      : null;

                  const coordinate =
                    entry.cardType ===
                    'coordinate'
                      ? COORDINATE_PRESETS.find(
                          (item) =>
                            item.id ===
                            entry.presetId,
                        )
                      : null;

                  const isOwner =
                    ownedCardIds.has(
                      entry.id,
                    );

                  const isTransferring =
                    entry.transferStatus ===
                    'pending';

                  return (
                    <article
                      key={entry.id}
                      className="rounded-2xl border border-gray-200 bg-gray-50 p-3"
                    >
                      <div className="flex items-center gap-3">
                        <div className="shrink-0">
                          {isTransferring ? (
                            <div className="flex flex-col items-stretch gap-1.5">
                              <div className="rounded-xl bg-gray-200 px-3 py-2 text-center text-[10px] font-black text-gray-500">
                                引き継ぎ中
                              </div>

                              <button
                                type="button"
                                onClick={() =>
                                  openTransferAcceptDialog(
                                    entry,
                                  )
                                }
                                className="whitespace-nowrap rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[10px] font-black text-amber-800 transition hover:bg-amber-100"
                              >
                                引き継ぎコードを入力
                              </button>
                            </div>
                          ) : (
                            isOwner && (
                              <button
                                type="button"
                                onClick={() => {
                                  if (
                                    entry.cardType ===
                                    'coordinate'
                                  ) {
                                    const preset =
                                      COORDINATE_PRESETS.find(
                                        (item) =>
                                          item.id ===
                                          entry.presetId,
                                      );

                                    if (!preset) {
                                      return;
                                    }

                                    handleCloseEntryList();

                                    setActiveGenerator(
                                      {
                                        type: 'coordinate',
                                        preset,
                                        editEntryId:
                                          entry.id,
                                      },
                                    );

                                    return;
                                  }

                                  const preset =
                                    EMOTION_PRESETS.find(
                                      (item) =>
                                        item.id ===
                                        entry.presetId,
                                    );

                                  if (!preset) {
                                    return;
                                  }

                                  handleCloseEntryList();

                                  setActiveGenerator(
                                    {
                                      type: 'emotion',
                                      preset,
                                      editEntryId:
                                        entry.id,
                                    },
                                  );
                                }}
                                className={`rounded-xl px-3 py-2 text-[10px] font-black text-white ${
                                  entry.cardType ===
                                  'coordinate'
                                    ? 'bg-indigo-600 hover:bg-indigo-700'
                                    : 'bg-purple-600 hover:bg-purple-700'
                                }`}
                              >
                                編集・削除
                              </button>
                            )
                          )}
                        </div>

                        {entry.imageDataUrl ? (
                          <img
                            src={
                              entry.imageDataUrl
                            }
                            alt=""
                            className="h-12 w-12 rounded-xl border border-gray-200 object-cover"
                          />
                        ) : (
                          <div className="h-12 w-12 rounded-xl bg-gray-200" />
                        )}

                        <div className="min-w-0 flex-1">
                          <div className="text-[9px] font-black text-gray-400">
                            {entry.cardType ===
                            'coordinate'
                              ? 'キャラカード'
                              : 'サポートカード'}
                          </div>

                          <div className="truncate text-sm font-black text-gray-900">
                            {
                              entry.userName
                            }
                          </div>

                          <div className="mt-0.5 truncate text-[10px] font-bold text-gray-500">
                            {
                              coordinate?.name ||
                              emotion?.name ||
                              entry.presetId
                            }
                          </div>
                        </div>
                      </div>

                      {isOwner &&
                        !isTransferring && (
                          <div className="mt-3">
                            <button
                              type="button"
                              onClick={() =>
                                openTransferDialog(
                                  entry,
                                )
                              }
                              className="w-full rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-[10px] font-black text-amber-800 transition hover:bg-amber-100"
                            >
                              ↔ このカードを引き継ぐ
                            </button>
                          </div>
                        )}

                      {isTransferring && (
                        <div className="mt-3 rounded-xl border border-gray-200 bg-gray-100 px-3 py-2.5 text-[10px] font-bold leading-relaxed text-gray-600">
                          このカードは現在、引き継ぎコードの入力を待っています。
                        </div>
                      )}

                      {entry.cardType ===
                        'emotion' && (
                        <div className="mt-2 rounded-xl bg-white p-2.5 text-[10px] text-gray-600">
                          <div className="font-black text-purple-700">
                            効果名：
                            {entry.customEffectName ||
                              emotion?.name ||
                              '未設定'}
                          </div>

                          {entry.flavorText && (
                            <div className="mt-1">
                              💬{' '}
                              {
                                entry.flavorText
                              }
                            </div>
                          )}
                        </div>
                      )}

                      {entry.cardType ===
                        'coordinate' && (
                        <div className="mt-2 rounded-xl bg-white p-2.5 text-[10px] text-gray-600">
                          <div className="font-black text-indigo-700">
                            コーデ：
                            {coordinate?.name ||
                              entry.presetId}
                          </div>

                          {entry.flavorText && (
                            <div className="mt-1">
                              💬{' '}
                              {
                                entry.flavorText
                              }
                            </div>
                          )}
                        </div>
                      )}
                    </article>
                  );
                },
              )}
            </div>
          </div>
        </div>
      )}

      {showTransferConfirm &&
        transferTarget && (
          <div
            className="fixed inset-0 z-[60] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
            role="dialog"
            aria-modal="true"
          >
            <div className="w-full max-w-md rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl">
              <div className="border-b border-gray-200 px-5 py-4">
                <div className="text-[9px] font-black tracking-[0.16em] text-amber-600">
                  CARD TRANSFER
                </div>

                <h3 className="mt-1 text-base font-black text-gray-900">
                  カードの所有権を引き継ぐ
                </h3>
              </div>

              <div className="space-y-4 p-5">
                <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-[11px] leading-relaxed text-gray-700">
                  このカードを、引き継ぎコードを使って別の端末から再び編集できる状態にします。
                  引き継ぎ中は、現在の端末からもカードを編集・削除できなくなります。
                  <br />
                  <br />
                  発行されたコードは、引き継ぎたい端末で入力してください。
                </div>

                {transferError && (
                  <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-[10px] font-bold leading-relaxed text-red-700">
                    {transferError}
                  </div>
                )}

                <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
                  <div className="text-[9px] font-black text-gray-400">
                    対象カード
                  </div>

                  <div className="mt-1 text-sm font-black text-gray-900">
                    {
                      transferTarget.userName
                    }
                  </div>
                </div>

                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={
                      isIssuingTransferCode
                    }
                    onClick={
                      closeTransferDialog
                    }
                    className="flex-1 rounded-2xl border border-gray-200 bg-white py-3 text-xs font-black text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                  >
                    キャンセル
                  </button>

                  <button
                    type="button"
                    disabled={
                      isIssuingTransferCode
                    }
                    onClick={
                      handleIssueTransferCode
                    }
                    className="flex-1 rounded-2xl bg-amber-600 py-3 text-xs font-black text-white hover:bg-amber-700 disabled:cursor-not-allowed disabled:bg-gray-300"
                  >
                    {isIssuingTransferCode
                      ? '発行中…'
                      : '引き継ぎコードを発行する'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

      {transferCode && (
        <div
          className="fixed inset-0 z-[70] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-md rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl">
            <div className="border-b border-gray-200 px-5 py-4">
              <div className="text-[9px] font-black tracking-[0.16em] text-green-600">
                TRANSFER CODE
              </div>

              <h3 className="mt-1 text-base font-black text-gray-900">
                引き継ぎコードを発行しました
              </h3>
            </div>

            <div className="space-y-4 p-5">
              <div className="rounded-2xl border border-green-200 bg-green-50 p-4 text-[11px] leading-relaxed text-gray-700">
                このコードを、引き継ぎたい端末で入力してください。
                <br />
                このコードは今回だけ表示されます。
              </div>

              <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4 text-center">
                <div className="text-[9px] font-black tracking-[0.16em] text-gray-400">
                  TRANSFER CODE
                </div>

                <div className="mt-3 break-all text-xl font-black tracking-[0.12em] text-gray-900">
                  {transferCode}
                </div>
              </div>

              <button
                type="button"
                onClick={
                  handleCopyTransferCode
                }
                className="w-full rounded-2xl border border-gray-200 bg-white py-3 text-xs font-black text-gray-800 hover:bg-gray-50"
              >
                {transferCopied
                  ? '✓ コピーしました'
                  : 'コードをコピー'}
              </button>

              <button
                type="button"
                onClick={() => {
                  setTransferCode(null);
                  setTransferTarget(null);
                  setTransferCopied(false);
                }}
                className="w-full rounded-2xl bg-gray-900 py-3 text-xs font-black text-white hover:bg-gray-800"
              >
                閉じる
              </button>
            </div>
          </div>
        </div>
      )}

      {transferAcceptTarget && (
        <div
          className="fixed inset-0 z-[65] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-md rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl">
            <div className="border-b border-gray-200 px-5 py-4">
              <div className="text-[9px] font-black tracking-[0.16em] text-amber-600">
                CARD TRANSFER
              </div>

              <h3 className="mt-1 text-base font-black text-gray-900">
                引き継ぎコードを入力
              </h3>
            </div>

            <div className="space-y-4 p-5">
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-[11px] leading-relaxed text-gray-700">
                このカードの引き継ぎコードを入力すると、この端末からカードを編集・削除できるようになります。
              </div>

              <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
                <div className="text-[9px] font-black text-gray-400">
                  対象カード
                </div>

                <div className="mt-1 text-sm font-black text-gray-900">
                  {
                    transferAcceptTarget.userName
                  }
                </div>
              </div>

              {transferAcceptError && (
                <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-[10px] font-bold leading-relaxed text-red-700">
                  {transferAcceptError}
                </div>
              )}

              <label className="block text-[10px] font-black text-gray-600">
                引き継ぎコード

                <input
                  type="text"
                  value={
                    transferAcceptCode
                  }
                  onChange={(event) =>
                    setTransferAcceptCode(
                      event.target.value.toUpperCase(),
                    )
                  }
                  inputMode="text"
                  autoCapitalize="characters"
                  autoCorrect="off"
                  spellCheck={false}
                  placeholder="コードを入力"
                  className="mt-1 w-full rounded-xl border border-gray-200 bg-white px-3 py-3 text-center text-sm font-black tracking-[0.12em] outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100"
                />
              </label>

              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={
                    isAcceptingTransfer
                  }
                  onClick={
                    closeTransferAcceptDialog
                  }
                  className="flex-1 rounded-2xl border border-gray-200 bg-white py-3 text-xs font-black text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                  キャンセル
                </button>

                <button
                  type="button"
                  disabled={
                    isAcceptingTransfer ||
                    !transferAcceptCode.trim()
                  }
                  onClick={
                    handleAcceptTransfer
                  }
                  className="flex-1 rounded-2xl bg-amber-600 py-3 text-xs font-black text-white hover:bg-amber-700 disabled:cursor-not-allowed disabled:bg-gray-300"
                >
                  {isAcceptingTransfer
                    ? '引き継ぎ中…'
                    : '引き継ぐ'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showRegistrationInfo && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-md rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl">
            <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
              <div>
                <div className="text-[9px] font-black tracking-[0.16em] text-gray-400">
                  REGISTRATION
                </div>

                <h3 className="mt-1 text-base font-black">
                  カード登録について
                </h3>
              </div>

              <button
                type="button"
                onClick={() =>
                  setShowRegistrationInfo(
                    false,
                  )
                }
                className="rounded-full bg-gray-100 px-3 py-1.5 text-[10px] font-black text-gray-600"
              >
                閉じる
              </button>
            </div>

            <div className="space-y-4 p-5 text-[11px] leading-relaxed text-gray-600">
              <div className="rounded-2xl bg-indigo-50 p-3">
                <div className="font-black text-indigo-900">
                  キャラカード
                </div>

                <div className="mt-1">
                  1ユーザーにつき1枚の登録を想定しています。コーデごとに登録枠があります。
                </div>
              </div>

              <div className="rounded-2xl bg-purple-50 p-3">
                <div className="font-black text-purple-900">
                  サポートカード
                </div>

                <div className="mt-1">
                  1ユーザーにつき1枚の登録を想定しています。エモーションごとに登録枠があります。
                </div>
              </div>

              <div className="rounded-2xl border border-gray-200 bg-gray-50 p-3">
                <div className="font-black text-gray-800">
                  現在のエントリー上限
                </div>

                <div className="mt-1 text-xl font-black text-gray-900">
                  {
                    maxEntryLimit
                  }
                  人 / 枠
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}