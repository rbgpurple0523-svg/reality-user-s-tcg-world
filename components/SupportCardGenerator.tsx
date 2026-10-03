'use client';

import React, { useEffect, useMemo, useState, ChangeEvent, FormEvent } from 'react';
import { ensureAnonymousAuth } from '@/lib/firebase';
import {
  EMOTION_PRESETS,
  getEmotionFlavorText,
  type EmotionAxisKey,
  type EmotionPreset,
} from './emotionPresets';
import type { EntryRecord } from './EntryHub';
import {
  COLOR_PALETTE,
  getColorTypeFromHex,
  getColorTypeLabel,
  getLegacyColorHex,
} from './colorTypes';

interface SupportCardGeneratorProps {
  selectedEmotion?: EmotionPreset | null;
  onBackToHub?: () => void;
  onBackToEmotionSelect?: () => void;
  openSaved?: boolean;
  openEntryId?: string;
}

const DRAFT_KEY = 'reality_world_support_draft';
const ENTRIES_KEY = 'reality_world_entries';
const MY_TOKENS_KEY = 'reality_world_my_tokens';

type ModerationResult = {
  allowed: boolean;
  code: string;
};

type EmotionPickerMode = 'feeling' | 'performance';
type RegistrationStep = 2 | 3;
type EditorKey = 'basic' | 'effect' | 'color' | 'flavor' | null;
type ModalKey = 'emotion' | 'saved' | null;
type PublicCardResponse = Omit<EntryRecord, 'passwordHash'>;

type CardApiCardResponse = {
  ok: true;
  card: PublicCardResponse;
};

type CardApiDeleteResponse = {
  ok: true;
  result: {
    cardId: string;
    status: 'deleted';
  };
};

type CardApiErrorResponse = {
  ok: false;
  error?: string;
};

type CardApiResponse =
  | CardApiCardResponse
  | CardApiDeleteResponse
  | CardApiErrorResponse;

const EMOTION_AXIS_CONFIG: Record<
  EmotionAxisKey,
  { label: string; icon: string; x: number; y: number }
> = {
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

const IMAGE_MAX_SIZE = 800;
const IMAGE_JPEG_QUALITY = 0.82;
const IMAGE_DATA_URL_MAX_LENGTH = 480_000;

function getEmotionMapPosition(emotion: EmotionPreset): { x: number; y: number } {
  const axes = emotion.emotionAxes;
  const total = EMOTION_AXIS_ORDER.reduce(
    (sum, axis) => sum + Math.max(0, Number(axes[axis] ?? 0)),
    0,
  );

  if (total <= 0) return { x: 50, y: 49 };

  const weighted = EMOTION_AXIS_ORDER.reduce(
    (point, axis) => {
      const weight = Math.max(0, Number(axes[axis] ?? 0));
      const vertex = EMOTION_AXIS_CONFIG[axis];
      return {
        x: point.x + vertex.x * weight,
        y: point.y + vertex.y * weight,
      };
    },
    { x: 0, y: 0 },
  );

  const seed = emotion.id.split('').reduce((sum, char) => sum + char.charCodeAt(0), 0);
  const jitterX = ((seed % 5) - 2) * 0.8;
  const jitterY = (((seed * 7) % 5) - 2) * 0.65;

  return {
    x: Math.min(92, Math.max(8, weighted.x / total + jitterX)),
    y: Math.min(91, Math.max(9, weighted.y / total + jitterY)),
  };
}

function getSeparatedEmotionMapPositions(): Record<string, { x: number; y: number }> {
  const positions = EMOTION_PRESETS.map((emotion) => ({
    id: emotion.id,
    ...getEmotionMapPosition(emotion),
  }));

  const vertexClearance = 10;
  const minimumDistance = 5.6;

  for (let iteration = 0; iteration < 10; iteration += 1) {
    for (const point of positions) {
      for (const axis of EMOTION_AXIS_ORDER) {
        const vertex = EMOTION_AXIS_CONFIG[axis];
        const dx = point.x - vertex.x;
        const dy = point.y - vertex.y;
        const distance = Math.hypot(dx, dy);

        if (distance > 0 && distance < vertexClearance) {
          const push = (vertexClearance - distance) / distance;
          point.x += dx * push * 0.7;
          point.y += dy * push * 0.7;
        }
      }
    }

    for (let i = 0; i < positions.length; i += 1) {
      for (let j = i + 1; j < positions.length; j += 1) {
        const a = positions[i];
        const b = positions[j];
        let dx = a.x - b.x;
        let dy = a.y - b.y;
        let distance = Math.hypot(dx, dy);

        if (distance === 0) {
          const seed = a.id.length * 17 + b.id.length * 31 + i + j;
          dx = ((seed % 3) - 1) * 0.01;
          dy = (((seed * 7) % 3) - 1) * 0.01;
          distance = Math.hypot(dx, dy) || 0.01;
        }

        if (distance < minimumDistance) {
          const push = ((minimumDistance - distance) / distance) * 0.45;
          a.x += dx * push;
          a.y += dy * push;
          b.x -= dx * push;
          b.y -= dy * push;
        }
      }
    }

    for (const point of positions) {
      point.x = Math.min(93, Math.max(7, point.x));
      point.y = Math.min(93, Math.max(7, point.y));
    }
  }

  return Object.fromEntries(positions.map((point) => [point.id, { x: point.x, y: point.y }]));
}

async function moderateCardTexts(texts: string[]): Promise<ModerationResult> {
  const response = await fetch('/api/moderate-text', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ texts }),
  });

  try {
    const result = (await response.json()) as {
      allowed?: boolean;
      code?: string;
    };

    return {
      allowed: result.allowed === true,
      code: result.code ?? 'MODERATION_INVALID_RESPONSE',
    };
  } catch {
    return {
      allowed: false,
      code: response.ok ? 'MODERATION_INVALID_RESPONSE' : 'MODERATION_SERVICE_ERROR',
    };
  }
}

function normalizeProfileUrl(value: string): string {
  return value
    .trim()
    .replace(/#REALITY$/i, '')
    .replace(/\/$/, '');
}

function sanitizeStoredEntry(entry: EntryRecord): EntryRecord {
  const stored = entry as EntryRecord & {
    passwordHash?: unknown;
    ownerToken?: unknown;
  };

  const {
    passwordHash: _passwordHash,
    ownerToken: _ownerToken,
    ...safeEntry
  } = stored;

  return safeEntry;
}

function getStoredEntries(): EntryRecord[] {
  try {
    const saved = localStorage.getItem(ENTRIES_KEY);
    if (!saved) return [];

    const parsed = JSON.parse(saved) as unknown;
    if (!Array.isArray(parsed)) return [];

    const cleanEntries = (parsed as EntryRecord[]).map(sanitizeStoredEntry);
    localStorage.setItem(ENTRIES_KEY, JSON.stringify(cleanEntries));
    return cleanEntries;
  } catch {
    return [];
  }
}

function saveCachedEntries(entries: EntryRecord[]): EntryRecord[] {
  const cleanEntries = entries.map(sanitizeStoredEntry);
  localStorage.setItem(ENTRIES_KEY, JSON.stringify(cleanEntries));
  return cleanEntries;
}

async function requestCardApi(
  path: string,
  body: Record<string, unknown>,
): Promise<CardApiResponse> {
  const user = await ensureAnonymousAuth();
  const idToken = await user.getIdToken();

  const response = await fetch(path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify(body),
  });

  const raw = (await response.json()) as unknown;

  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('CARD_API_INVALID_RESPONSE');
  }

  const data = raw as Record<string, unknown>;

  if (data.ok === true && path.endsWith('/delete')) {
    return data as unknown as CardApiDeleteResponse;
  }

  if (data.ok === true && data.card && typeof data.card === 'object') {
    return data as unknown as CardApiCardResponse;
  }

  return {
    ok: false,
    error:
      typeof data.error === 'string'
        ? data.error
        : response.ok
          ? 'CARD_API_INVALID_RESPONSE'
          : 'CARD_API_REQUEST_FAILED',
  };
}

function getCardApiErrorMessage(
  code: string,
  action: 'register' | 'update' | 'delete',
): string {
  switch (code) {
    case 'AUTH_REQUIRED':
      return '認証の準備に失敗しました。ページを再読み込みして、もう一度お試しください。';
    case 'PROFILE_ALREADY_REGISTERED':
      return 'このREALITYプロフURLでは、すでにカードが登録されています。';
    case 'CARD_LIMIT_REACHED':
      return 'この「想い」は現在エントリー上限に達しています。別の「想い」を選択してください。';
    case 'CARD_NOT_FOUND':
      return '対象のカードが見つかりません。一覧を開き直してください。';
    case 'PERMISSION_DENIED':
      return action === 'delete'
        ? 'このカードを操作する権限を確認できませんでした。登録時の合言葉を入力してもう一度お試しください。'
        : 'このカードを更新する権限を確認できませんでした。登録時の合言葉を入力してもう一度お試しください。';
    case 'CARD_DELETED':
      return 'このカードはすでに削除されています。';
    case 'CARD_TYPE_OR_PRESET_IMMUTABLE':
      return 'カード種別と「想い」は変更できません。';
    case 'INVALID_CARD_ID':
      return 'カード情報を確認できませんでした。もう一度一覧から開いてください。';
    case 'CARD_API_INVALID_RESPONSE':
      return 'サーバーから正しい応答を受け取れませんでした。もう一度お試しください。';
    case 'CARD_API_REQUEST_FAILED':
      return 'カード処理に失敗しました。もう一度お試しください。';
    default:
      return action === 'delete'
        ? 'カードを削除できませんでした。'
        : action === 'update'
          ? 'カードを更新できませんでした。'
          : 'カードを登録できませんでした。';
  }
}

function toCachedEntry(card: PublicCardResponse): EntryRecord {
  return sanitizeStoredEntry(card);
}

async function loadImageFromSource(source: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('画像を読み込めませんでした。'));
    image.src = source;
  });
}

async function compressImageFile(file: File): Promise<string> {
  const objectUrl = URL.createObjectURL(file);

  try {
    const image = await loadImageFromSource(objectUrl);
    const maxDimension = Math.max(image.naturalWidth, image.naturalHeight);
    const scale = Math.min(1, IMAGE_MAX_SIZE / Math.max(1, maxDimension));
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext('2d');
    if (!context) throw new Error('画像処理を開始できませんでした。');

    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, width, height);
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.drawImage(image, 0, 0, width, height);

    const result = canvas.toDataURL('image/jpeg', IMAGE_JPEG_QUALITY);
    if (!result || result === 'data:,') {
      throw new Error('画像の圧縮に失敗しました。');
    }

    return result;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

async function compressImageDataUrlIfNeeded(dataUrl: string): Promise<string> {
  if (!dataUrl) return dataUrl;

  const isJpeg = /^data:image\/(?:jpeg|jpg);/i.test(dataUrl);
  if (isJpeg && dataUrl.length <= IMAGE_DATA_URL_MAX_LENGTH) return dataUrl;

  const image = await loadImageFromSource(dataUrl);
  const maxDimension = Math.max(image.naturalWidth, image.naturalHeight);
  const scale = Math.min(1, IMAGE_MAX_SIZE / Math.max(1, maxDimension));
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext('2d');
  if (!context) throw new Error('画像処理を開始できませんでした。');

  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, width, height);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(image, 0, 0, width, height);

  const result = canvas.toDataURL('image/jpeg', IMAGE_JPEG_QUALITY);
  if (!result || result === 'data:,') {
    throw new Error('画像の圧縮に失敗しました。');
  }

  return result;
}

function EmotionMiniMap({
  selectedEmotionId,
  onSelect,
}: {
  selectedEmotionId: string;
  onSelect: (emotion: EmotionPreset) => void;
}) {
  const emotionMapPositions = useMemo(() => getSeparatedEmotionMapPositions(), []);

  return (
    <div className="w-full rounded-2xl border border-purple-100 bg-white p-2.5 shadow-sm">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="text-[9px] font-black tracking-wide text-purple-700">想いのマップ</div>
        <div className="text-[9px] font-bold text-gray-400">35種</div>
      </div>

      <div className="relative aspect-square overflow-hidden rounded-xl border border-purple-100 bg-[radial-gradient(circle_at_center,rgba(168,85,247,0.14),transparent_48%),linear-gradient(135deg,rgba(99,102,241,0.04),rgba(236,72,153,0.08))]">
        <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full" aria-hidden="true">
          {EMOTION_AXIS_RING_VALUES.map((value) => {
            const points = EMOTION_AXIS_ORDER.map((axis) => {
              const vertex = EMOTION_AXIS_CONFIG[axis];
              return [
                50 + (vertex.x - 50) * (value / 100),
                49 + (vertex.y - 49) * (value / 100),
              ].join(',');
            }).join(' ');

            return (
              <polygon
                key={value}
                points={points}
                fill="none"
                stroke="rgba(124,58,237,0.12)"
                strokeWidth="0.55"
              />
            );
          })}

          {EMOTION_AXIS_ORDER.map((axis) => {
            const vertex = EMOTION_AXIS_CONFIG[axis];
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
          })}

          <polygon
            points={EMOTION_AXIS_ORDER.map((axis) => `${EMOTION_AXIS_CONFIG[axis].x},${EMOTION_AXIS_CONFIG[axis].y}`).join(' ')}
            fill="rgba(139,92,246,0.04)"
            stroke="rgba(124,58,237,0.26)"
            strokeWidth="1"
          />
          <circle cx="50" cy="49" r="1.2" fill="rgba(91,95,239,0.42)" />
        </svg>

        {EMOTION_AXIS_ORDER.map((axis) => {
          const vertex = EMOTION_AXIS_CONFIG[axis];
          return (
            <div
              key={axis}
              className="absolute -translate-x-1/2 -translate-y-1/2 whitespace-nowrap text-center"
              style={{ left: `${vertex.x}%`, top: `${vertex.y}%` }}
            >
              <div className="text-[16px] leading-none">{vertex.icon}</div>
              <div className="mt-0.5 text-[11px] font-black text-purple-950">{vertex.label}</div>
            </div>
          );
        })}

        {EMOTION_PRESETS.map((emotion) => {
          const position = getEmotionMapPosition(emotion);
          const selected = emotion.id === selectedEmotionId;

          return (
            <button
              key={emotion.id}
              type="button"
              onClick={() => onSelect(emotion)}
              aria-label={`${emotion.emotionPhrase}｜${emotion.name}`}
              className={`absolute h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 transition ${
                selected
                  ? 'z-30 scale-150 border-white bg-purple-700 shadow-[0_0_0_4px_rgba(124,58,237,0.20),0_0_18px_rgba(124,58,237,0.75)]'
                  : 'z-10 border-purple-100 bg-purple-500 shadow-[0_0_10px_rgba(124,58,237,0.45)] hover:scale-150 hover:bg-fuchsia-500'
              }`}
              style={{ left: `${emotionMapPositions[emotion.id]?.x ?? position.x}%`, top: `${emotionMapPositions[emotion.id]?.y ?? position.y}%` }}
            />
          );
        })}
      </div>

      <p className="mt-2 text-[9px] font-bold leading-relaxed text-gray-500">
        ドットをタップして、登録する「想い」を選び直せます。
      </p>
    </div>
  );
}

export default function SupportCardGenerator({
  selectedEmotion,
  onBackToHub,
  onBackToEmotionSelect,
  openSaved,
  openEntryId,
}: SupportCardGeneratorProps) {
  const [selectedEmotionId, setSelectedEmotionId] = useState<string>(
    selectedEmotion?.id || EMOTION_PRESETS[0]?.id || '',
  );
  const [pickerMode, setPickerMode] = useState<EmotionPickerMode>('feeling');
  const [pickerSearch, setPickerSearch] = useState('');
  const [pickerTarget, setPickerTarget] = useState('ALL');
  const [pickerEffect, setPickerEffect] = useState('ALL');
  const [pickerDuration, setPickerDuration] = useState('ALL');

  const activeEmotion: EmotionPreset =
    EMOTION_PRESETS.find((emotion) => emotion.id === selectedEmotionId) ||
    selectedEmotion ||
    EMOTION_PRESETS[0]!;

  const [profileUrl, setProfileUrl] = useState('');
  const [userName, setUserName] = useState('');
  const [imageDataUrl, setImageDataUrl] = useState('');
  const [password, setPassword] = useState('');
  const [effectName, setEffectName] = useState(activeEmotion.name);
  const [flavorText, setFlavorText] = useState(getEmotionFlavorText(activeEmotion));
  const [selectedColorHex, setSelectedColorHex] = useState('#22D3EE');
  const [showProfileUrl, setShowProfileUrl] = useState(true);
  const [showProfileUrlGuide, setShowProfileUrlGuide] = useState(false);

  const [entries, setEntries] = useState<EntryRecord[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [registrationStep, setRegistrationStep] = useState<RegistrationStep>(2);
  const [activeEditor, setActiveEditor] = useState<EditorKey>(null);
  const [activeModal, setActiveModal] = useState<ModalKey>(null);
  const [draftAvailable, setDraftAvailable] = useState(false);
  const [isColorTouched, setIsColorTouched] = useState(false);

  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [isModerating, setIsModerating] = useState(false);
  const [isProcessingCard, setIsProcessingCard] = useState(false);

  const selectedColorType = getColorTypeFromHex(selectedColorHex);

  useEffect(() => {
    void ensureAnonymousAuth().catch(() => {});
  }, []);

  useEffect(() => {
    if (openSaved) {
      setActiveModal('saved');
    }
  }, [openSaved]);

  useEffect(() => {
    const loadedEntries = getStoredEntries();
    setEntries(loadedEntries);

    try {
      localStorage.removeItem(MY_TOKENS_KEY);
    } catch {}

    try {
      setDraftAvailable(Boolean(localStorage.getItem(DRAFT_KEY)));
    } catch {
      setDraftAvailable(false);
    }
  }, []);

  useEffect(() => {
    if (!selectedEmotion || editingId) return;
    setSelectedEmotionId(selectedEmotion.id);
    setEffectName(selectedEmotion.name);
    setFlavorText(getEmotionFlavorText(selectedEmotion));
  }, [selectedEmotion, editingId]);

  useEffect(() => {
    if (editingId) return;

    const draftData = {
      profileUrl: normalizeProfileUrl(profileUrl),
      userName,
      imageDataUrl,
      selectedEmotionId,
      effectName,
      flavorText,
      colorHex: selectedColorHex,
      colorType: selectedColorType,
      showProfileUrl,
    };

    const hasDraft =
      Boolean(profileUrl) ||
      Boolean(userName) ||
      Boolean(imageDataUrl) ||
      Boolean(effectName) ||
      Boolean(flavorText);

    try {
      if (!hasDraft) {
        localStorage.removeItem(DRAFT_KEY);
        setDraftAvailable(false);
        return;
      }

      localStorage.setItem(DRAFT_KEY, JSON.stringify(draftData));
      setDraftAvailable(true);
    } catch {}
  }, [
    profileUrl,
    showProfileUrl,
    userName,
    imageDataUrl,
    selectedEmotionId,
    effectName,
    flavorText,
    selectedColorHex,
    selectedColorType,
    editingId,
  ]);

  const restoreDraft = () => {
    try {
      const savedDraft = localStorage.getItem(DRAFT_KEY);
      if (!savedDraft) return;

      const draft = JSON.parse(savedDraft) as {
        profileUrl?: string;
        userName?: string;
        imageDataUrl?: string;
        selectedEmotionId?: string;
        effectName?: string;
        flavorText?: string;
        colorHex?: string;
        showProfileUrl?: boolean;
      };

      setProfileUrl(normalizeProfileUrl(draft.profileUrl || ''));
      setShowProfileUrl(draft.showProfileUrl !== false);
      setUserName(draft.userName || '');
      setImageDataUrl(draft.imageDataUrl || '');
      setPassword('');
      if (draft.selectedEmotionId) setSelectedEmotionId(draft.selectedEmotionId);
      if (draft.effectName) setEffectName(draft.effectName);
      setFlavorText(draft.flavorText || '');
      setSelectedColorHex(
        draft.colorHex && /^#[0-9a-fA-F]{6}$/.test(draft.colorHex)
          ? draft.colorHex.toUpperCase()
          : getLegacyColorHex(undefined),
      );
      setIsColorTouched(Boolean(draft.colorHex && /^#[0-9a-fA-F]{6}$/.test(draft.colorHex)));
      setDraftAvailable(false);
      setRegistrationStep(2);
      setSuccessMessage('前回の続きから復元しました。');
      window.setTimeout(() => setSuccessMessage(''), 2000);
    } catch {
      setErrorMessage('下書きを復元できませんでした。');
    }
  };

  const discardDraft = () => {
    try {
      localStorage.removeItem(DRAFT_KEY);
    } catch {}
    setDraftAvailable(false);
  };

  const handleBackButton = () => {
    if (registrationStep === 3) {
      setRegistrationStep(2);
      setErrorMessage('');
      setSuccessMessage('');
      return;
    }

    if (onBackToEmotionSelect) {
      onBackToEmotionSelect();
      return;
    }

    onBackToHub?.();
  };

  const handleEmotionChange = (emotion: EmotionPreset) => {
    setSelectedEmotionId(emotion.id);
    setEffectName(emotion.name);
    setFlavorText(getEmotionFlavorText(emotion));
    setErrorMessage('');
    setActiveModal(null);
  };

  const handleProfileUrlChange = (value: string) => {
    setProfileUrl(normalizeProfileUrl(value));
    setErrorMessage('');
  };

  const handleImageUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const compressed = await compressImageFile(file);
      setImageDataUrl(compressed);
      setErrorMessage('');
    } catch {
      setErrorMessage('画像を読み込めませんでした。別の画像をお試しください。');
    }
  };

  const handleColorChange = (hex: string) => {
    const normalized = hex.toUpperCase();
    if (!/^#[0-9A-F]{6}$/.test(normalized)) return;
    setSelectedColorHex(normalized);
    setIsColorTouched(true);
    setErrorMessage('');
  };

  const validateBeforeConfirm = () => {
    if (!profileUrl.trim() || !normalizeProfileUrl(profileUrl).startsWith('https://reality.app/profile/')) {
      setErrorMessage('REALITYプロフURLを入力してください。');
      setActiveEditor('basic');
      return false;
    }

    const requiresPasswordForRegistration = !editingId && !password.trim();

    if (!userName.trim() || !imageDataUrl || requiresPasswordForRegistration || !effectName.trim()) {
      setErrorMessage('カード画像・REALITYプロフURL・登録ユーザー名・合言葉・効果名をすべて入力してください。');
      if (!userName.trim() || !imageDataUrl || !profileUrl.trim() || requiresPasswordForRegistration) {
        setActiveEditor('basic');
      } else {
        setActiveEditor('effect');
      }
      return false;
    }

    return true;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (isModerating || isProcessingCard) return;
    setErrorMessage('');

    if (!activeEmotion) {
      setErrorMessage('「想い」を1つ選択してください。');
      setActiveModal('emotion');
      return;
    }

    if (!validateBeforeConfirm()) return;

    if (registrationStep === 2) {
      setRegistrationStep(3);
      setActiveEditor(null);
      setActiveModal(null);
      setSuccessMessage('登録内容を確認してください。');
      return;
    }

    const moderationTexts = [
      userName.trim(),
      effectName.trim(),
      flavorText.trim(),
    ];

    setIsModerating(true);

    try {
      const moderationResult = await moderateCardTexts(moderationTexts);

      if (!moderationResult.allowed) {
        if (
          moderationResult.code === 'CUSTOM_RULE' ||
          moderationResult.code === 'PROFANITY_FILTERED'
        ) {
          setErrorMessage('入力内容に安全上の問題があるため、保存できませんでした。');
        } else {
          setErrorMessage('入力内容を安全確認できなかったため、保存していません。もう一度お試しください。');
        }
        return;
      }
    } catch {
      setErrorMessage('入力内容を安全確認できなかったため、保存していません。もう一度お試しください。');
      return;
    } finally {
      setIsModerating(false);
    }

    const normalizedProfileUrl = normalizeProfileUrl(profileUrl);

    let normalizedImageDataUrl = imageDataUrl;
    try {
      normalizedImageDataUrl = await compressImageDataUrlIfNeeded(imageDataUrl);
      if (normalizedImageDataUrl !== imageDataUrl) {
        setImageDataUrl(normalizedImageDataUrl);
      }
    } catch {
      setErrorMessage('画像の圧縮に失敗したため、保存できませんでした。別の画像をお試しください。');
      return;
    }

    const requestBody: Record<string, unknown> = {
      presetId: activeEmotion.id,
      cardType: 'emotion',
      profileUrl: normalizedProfileUrl,
      userName: userName.trim(),
      imageDataUrl: normalizedImageDataUrl,
      customEffectName: effectName.trim(),
      flavorText: flavorText.trim(),
      colorHex: selectedColorHex,
      showProfileUrl,
    };

    const isUpdating = Boolean(editingId);
    if (editingId) {
      requestBody.cardId = editingId;
      if (password.trim()) {
        requestBody.password = password.trim();
      }
    } else {
      requestBody.password = password.trim();
    }

    setIsProcessingCard(true);

    try {
      let result = await requestCardApi(
        isUpdating ? '/api/cards/update' : '/api/cards/register',
        requestBody,
      );

      if (!result.ok && result.error === 'PERMISSION_DENIED' && isUpdating && !password.trim()) {
        const inputPass = window.prompt('このカードの所有者認証が必要です。\n登録時に設定した合言葉を入力してください。');
        if (inputPass) {
          requestBody.password = inputPass;
          setPassword(inputPass);
          result = await requestCardApi('/api/cards/update', requestBody);
        }
      }

      if (!result.ok) {
        setErrorMessage(getCardApiErrorMessage(result.error ?? 'CARD_API_REQUEST_FAILED', isUpdating ? 'update' : 'register'));
        if (result.error === 'PROFILE_ALREADY_REGISTERED' || result.error === 'CARD_LIMIT_REACHED') {
          setRegistrationStep(2);
        }
        if (result.error === 'PERMISSION_DENIED') {
          setActiveEditor('basic');
          setPassword('');
        }
        return;
      }

      if (!('card' in result)) {
        setErrorMessage('カード情報を受け取れませんでした。もう一度お試しください。');
        return;
      }

      const cachedEntry = toCachedEntry(result.card);
      const currentEntries = getStoredEntries();
      const nextEntries = isUpdating
        ? currentEntries.some((entry) => entry.id === cachedEntry.id)
          ? currentEntries.map((entry) => (entry.id === cachedEntry.id ? cachedEntry : entry))
          : [cachedEntry, ...currentEntries]
        : [cachedEntry, ...currentEntries.filter((entry) => entry.id !== cachedEntry.id)];

      try {
        const savedEntries = saveCachedEntries(nextEntries);
        setEntries(savedEntries);
      } catch {
        setErrorMessage('カードはサーバーに保存されましたが、一覧のキャッシュ更新に失敗しました。');
        setEditingId(cachedEntry.id);
        setPassword('');
        setRegistrationStep(3);
        setActiveEditor(null);
        setIsProcessingCard(false);
        return;
      }

      setEditingId(cachedEntry.id);
      setDraftAvailable(false);
      setActiveEditor(null);
      setActiveModal(null);
      setSuccessMessage(isUpdating ? '✨ サポートカードを更新しました！' : '✨ サポートカードを登録しました！');
      setPassword('');
      setRegistrationStep(3);

      try {
        localStorage.removeItem(DRAFT_KEY);
      } catch {}
    } catch (error) {
      const code = error instanceof Error ? error.message : 'CARD_API_REQUEST_FAILED';
      setErrorMessage(getCardApiErrorMessage(code, isUpdating ? 'update' : 'register'));
    } finally {
      setIsProcessingCard(false);
    }
  };

  const handleEdit = (entry: EntryRecord) => {
    setProfileUrl(normalizeProfileUrl(entry.profileUrl || ''));
    setShowProfileUrl(entry.showProfileUrl !== false);
    setUserName(entry.userName || '');
    setImageDataUrl(entry.imageDataUrl || '');
    setPassword('');
    setEffectName(entry.customEffectName || '');
    setFlavorText(entry.flavorText || '');
    setSelectedColorHex(
      entry.colorHex && /^#[0-9a-fA-F]{6}$/.test(entry.colorHex)
        ? entry.colorHex.toUpperCase()
        : getLegacyColorHex(entry.color),
    );
    setIsColorTouched(true);

    if (entry.presetId) {
      setSelectedEmotionId(entry.presetId);
    }

    setEditingId(entry.id);
    setRegistrationStep(2);
    setActiveModal(null);
    setActiveEditor(null);
    setErrorMessage('');
    setSuccessMessage('');
  };

  useEffect(() => {
    if (!openEntryId || editingId) return;

    const entry = entries.find((item) => item.id === openEntryId);
    if (!entry) return;

    handleEdit(entry);
  }, [openEntryId, entries, editingId]);

  const handleDelete = async (entry: EntryRecord) => {
    if (
      !window.confirm(
        `「${entry.customEffectName || entry.userName}」のサポートカードを削除しますか？\nこの操作は元に戻せません。`,
      )
    ) {
      return;
    }

    setIsProcessingCard(true);
    setErrorMessage('');

    try {
      const body: Record<string, unknown> = {
        cardId: entry.id,
      };

      let result = await requestCardApi('/api/cards/delete', body);

      if (!result.ok && result.error === 'PERMISSION_DENIED') {
        const inputPass = window.prompt('このカードの所有者認証が必要です。\n登録時に設定した合言葉を入力してください。');
        if (inputPass) {
          body.password = inputPass;
          result = await requestCardApi('/api/cards/delete', body);
        }
      }

      if (!result.ok) {
        setErrorMessage(getCardApiErrorMessage(result.error ?? 'CARD_API_REQUEST_FAILED', 'delete'));
        return;
      }

      if (!('result' in result)) {
        setErrorMessage('削除結果を受け取れませんでした。もう一度お試しください。');
        return;
      }

      const currentEntries = getStoredEntries();
      const nextEntries = currentEntries.filter((item) => item.id !== entry.id);

      try {
        setEntries(saveCachedEntries(nextEntries));
      } catch {
        setEntries(nextEntries);
      }

      setPassword('');
      if (editingId === entry.id) {
        setEditingId(null);
        setActiveEditor(null);
        setActiveModal(null);
        setRegistrationStep(2);
        setSuccessMessage('✨ サポートカードを削除しました。');
      } else {
        setSuccessMessage('✨ サポートカードを削除しました。');
      }
    } catch (error) {
      const code = error instanceof Error ? error.message : 'CARD_API_REQUEST_FAILED';
      setErrorMessage(getCardApiErrorMessage(code, 'delete'));
    } finally {
      setIsProcessingCard(false);
    }
  };

  const pickerEmotions = EMOTION_PRESETS.filter((emotion) => {
    if (pickerSearch.trim()) {
      const query = pickerSearch.trim().toLowerCase();
      const matches =
        emotion.name.toLowerCase().includes(query) ||
        emotion.statEffect.toLowerCase().includes(query) ||
        emotion.description.toLowerCase().includes(query) ||
        emotion.emotionPhrase.toLowerCase().includes(query);
      if (!matches) return false;
    }

    if (pickerMode === 'performance') {
      if (pickerTarget !== 'ALL' && emotion.target !== pickerTarget) return false;
      if (pickerEffect !== 'ALL' && emotion.effectCategory !== pickerEffect) return false;
      if (pickerDuration !== 'ALL' && emotion.duration !== pickerDuration) return false;
    }

    return true;
  });

  const savedSupportEntries = entries.filter((entry) => entry.cardType === 'emotion');

  const handlePerformanceEmotionSelect = (emotion: EmotionPreset) => {
    setSelectedEmotionId(emotion.id);
    setEffectName(emotion.name);
    setFlavorText(getEmotionFlavorText(emotion));
    setErrorMessage('');
  };

  const basicInfoComplete = Boolean(
    profileUrl.trim() &&
      userName.trim() &&
      imageDataUrl &&
      (editingId || password.trim()),
  );
  const effectComplete = Boolean(effectName.trim());
  const flavorComplete = Boolean(flavorText.trim());

  return (
    <div className="mx-auto flex h-full min-h-0 w-full max-w-5xl flex-col text-gray-900">
      <div className="shrink-0 border-b border-gray-200 px-3 py-2 sm:px-5">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[9px] font-black tracking-[0.22em] text-purple-500">SUPPORT CARD</div>
            <h2 className="truncate text-lg font-black">サポートカードを作る</h2>
          </div>

          <div className="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              onClick={() => setActiveModal('saved')}
              className="rounded-xl border border-purple-100 bg-purple-50 px-3 py-2 text-[10px] font-black text-purple-700"
            >
              登録済み
            </button>
            {onBackToHub && (
              <button
                type="button"
                onClick={handleBackButton}
                className="rounded-xl bg-gray-100 px-3 py-2 text-[10px] font-black text-gray-700"
              >
                ← 戻る
              </button>
            )}
          </div>
        </div>

        <div className="mt-2 grid grid-cols-[1fr_auto_1fr_auto_1fr] items-center gap-1.5 text-[9px] font-black">
          <span className="rounded-full bg-purple-100 px-2 py-1 text-center text-purple-800">① 想い／性能</span>
          <span className="h-px bg-purple-200" />
          <span className={`rounded-full px-2 py-1 text-center ${registrationStep === 2 ? 'bg-purple-600 text-white' : 'bg-purple-100 text-purple-800'}`}>② カード編集</span>
          <span className="h-px bg-purple-200" />
          <span className={`rounded-full px-2 py-1 text-center ${registrationStep === 3 ? 'bg-purple-600 text-white' : 'bg-gray-100 text-gray-400'}`}>③ 登録</span>
        </div>
      </div>

      {draftAvailable && !editingId && !openEntryId && (
        <div className="mx-3 mt-2 shrink-0 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[10px] sm:mx-5">
          <div className="flex items-center justify-between gap-2">
            <div className="font-bold text-amber-900">前回の続きがあります</div>
            <div className="flex gap-1.5">
              <button type="button" onClick={restoreDraft} className="rounded-lg bg-amber-600 px-2.5 py-1.5 font-black text-white">復元</button>
              <button type="button" onClick={discardDraft} className="rounded-lg border border-amber-300 bg-white px-2.5 py-1.5 font-black text-amber-900">破棄</button>
            </div>
          </div>
          <div className="mt-1 text-[8px] font-bold text-amber-800">合言葉は保存されません。</div>
        </div>
      )}

      {(errorMessage || successMessage) && (
        <div
          className={`mx-3 mt-2 shrink-0 rounded-xl border px-3 py-2 text-[10px] font-bold sm:mx-5 ${errorMessage ? 'border-red-200 bg-red-50 text-red-700' : 'border-green-200 bg-green-50 text-green-700'}`}
          role={errorMessage ? 'alert' : 'status'}
        >
          {errorMessage || successMessage}
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
        <div className="min-h-0 flex-1 overflow-hidden px-3 py-3 sm:px-5">
          {registrationStep === 2 ? (
            <div className="flex h-full min-h-0 flex-col gap-3">
              <section className="shrink-0 rounded-2xl border border-purple-100 bg-purple-50/60 p-3">
                <div className="flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="text-[9px] font-black tracking-[0.16em] text-purple-500">SELECTED EMOTION</div>
                    <div className="mt-1 text-[9px] font-black text-purple-700">性能</div>
                    <div className="mt-0.5 text-sm font-black text-gray-950">
                      {activeEmotion.statEffect}{activeEmotion.effectAmount ? ` ${activeEmotion.effectAmount}` : ''}
                      <span className="ml-1 text-[8px] font-bold text-gray-500">{activeEmotion.target} / {activeEmotion.duration} / {activeEmotion.effectCategory}</span>
                    </div>
                    <div className="mt-1 text-[9px] leading-4 text-gray-600">{activeEmotion.description}</div>
                    <div className="mt-2 text-sm font-serif font-black leading-relaxed text-purple-950">{activeEmotion.emotionPhrase}</div>
                    <div className="mt-1 text-[8px] font-bold text-gray-400">仮カード名：{activeEmotion.name}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveModal('emotion')}
                    className="shrink-0 rounded-xl border border-purple-200 bg-white px-3 py-2 text-[9px] font-black text-purple-700 shadow-sm"
                  >
                    エモーションを変える
                  </button>
                </div>
              </section>

              <div className="min-h-0 flex-1 rounded-2xl border border-gray-200 bg-white p-3">
                <div className="flex items-end justify-between gap-2">
                  <div>
                    <div className="text-[9px] font-black tracking-[0.16em] text-gray-400">EDIT</div>
                    <h3 className="mt-0.5 text-sm font-black">カードの設定</h3>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveModal('saved')}
                    className="rounded-lg bg-gray-50 px-2 py-1 text-[8px] font-black text-gray-500"
                  >
                    登録済みを見る
                  </button>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button type="button" onClick={() => setActiveEditor('basic')} className="rounded-2xl border-2 border-indigo-100 bg-indigo-50/60 p-3 text-left">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] font-black text-indigo-900">カード情報</span>
                      <span className={`rounded-full px-1.5 py-0.5 text-[8px] font-black ${basicInfoComplete ? 'bg-emerald-100 text-emerald-700' : 'bg-white text-indigo-600'}`}>
                        {basicInfoComplete ? '入力済み' : '必須・未設定'}
                      </span>
                    </div>
                    <div className="mt-1 text-[8px] font-bold text-indigo-700">反映：画像・登録ユーザー情報</div>
                  </button>

                  <button type="button" onClick={() => setActiveEditor('effect')} className="rounded-2xl border-2 border-purple-100 bg-purple-50/60 p-3 text-left">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] font-black text-purple-900">効果名</span>
                      <span className={`rounded-full px-1.5 py-0.5 text-[8px] font-black ${effectComplete ? 'bg-emerald-100 text-emerald-700' : 'bg-white text-purple-600'}`}>
                        {effectComplete ? '入力済み' : '必須・未設定'}
                      </span>
                    </div>
                    <div className="mt-1 text-[8px] font-bold text-purple-700">反映：カードの効果欄</div>
                  </button>

                  <button type="button" onClick={() => setActiveEditor('color')} style={!isColorTouched ? undefined : { borderColor: selectedColorHex, backgroundColor: `${selectedColorHex}14` }} className="rounded-2xl border-2 border-cyan-100 bg-cyan-50/60 p-3 text-left">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] font-black text-cyan-950">カラー</span>
                      <span className={`rounded-full px-1.5 py-0.5 text-[8px] font-black ${isColorTouched ? 'bg-emerald-100 text-emerald-700' : 'bg-white text-cyan-700'}`}>
                        {isColorTouched ? '設定済み' : '未設定'}
                      </span>
                    </div>
                    <div className="mt-1 flex items-center gap-1.5 text-[8px] font-bold text-cyan-800">
                      <span className="h-2.5 w-2.5 rounded-full border border-white shadow-sm" style={{ backgroundColor: selectedColorHex }} />
                      反映：カードの枠・色
                    </div>
                  </button>

                  <button type="button" onClick={() => setActiveEditor('flavor')} className="rounded-2xl border-2 border-amber-100 bg-amber-50/60 p-3 text-left">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] font-black text-amber-950">一言</span>
                      <span className={`rounded-full px-1.5 py-0.5 text-[8px] font-black ${flavorComplete ? 'bg-emerald-100 text-emerald-700' : 'bg-white text-amber-700'}`}>
                        {flavorComplete ? '入力済み' : '未設定'}
                      </span>
                    </div>
                    <div className="mt-1 text-[8px] font-bold text-amber-800">反映：カードの一言</div>
                  </button>
                </div>

                <div className="mt-3 rounded-2xl border border-gray-200 bg-gray-50 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <div className="text-[9px] font-black text-gray-500">選択中の「想い」</div>
                      <div className="mt-1 text-sm font-black text-gray-900">{activeEmotion.name}</div>
                    </div>
                    <div className="rounded-xl bg-white px-2.5 py-2 text-right shadow-sm">
                      <div className="text-[8px] font-black text-purple-700">{activeEmotion.statEffect}{activeEmotion.effectAmount ? ` ${activeEmotion.effectAmount}` : ''}</div>
                      <div className="mt-0.5 text-[8px] font-bold text-gray-500">{activeEmotion.target} / {activeEmotion.duration}</div>
                    </div>
                  </div>
                  <div className="mt-2 text-[9px] leading-4 text-gray-600">{activeEmotion.description}</div>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex h-full min-h-0 flex-col gap-3">
              <div className="shrink-0 rounded-2xl border border-purple-100 bg-purple-50/60 p-3">
                <div className="text-[9px] font-black tracking-[0.16em] text-purple-500">STEP 3</div>
                <h3 className="mt-1 text-base font-black text-purple-950">登録内容を確認</h3>
                <p className="mt-1 text-[9px] font-bold leading-4 text-purple-800">内容を確認してから「このカードで参加する」を押してください。</p>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto rounded-2xl border border-gray-200 bg-gray-50 p-3">
                <div className="mx-auto w-full max-w-sm overflow-hidden rounded-[1.65rem] border-[5px] bg-white shadow-lg" style={{ borderColor: selectedColorHex }}>
                  <div className="border-b border-gray-100 px-4 pb-3 pt-4">
                    <div className="text-[8px] font-black tracking-[0.18em] text-purple-500">SUPPORT CARD</div>
                    <div className="mt-1 text-xl font-black text-gray-950">{effectName || '効果名未設定'}</div>
                    <div className="mt-1 text-[9px] font-bold text-gray-500">{activeEmotion.statEffect}{activeEmotion.effectAmount ? ` ${activeEmotion.effectAmount}` : ''} / {activeEmotion.target} / {activeEmotion.duration}</div>
                  </div>

                  <div className="p-3">
                    <div className="overflow-hidden rounded-2xl border border-gray-200 bg-gray-100">
                      {imageDataUrl ? (
                        <img src={imageDataUrl} alt="" className="aspect-[4/5] w-full object-cover" />
                      ) : (
                        <div className="flex aspect-[4/5] items-center justify-center text-xs font-black text-gray-400">画像未設定</div>
                      )}
                    </div>
                  </div>

                  <div className="px-3 pb-3">
                    <div className="rounded-2xl border border-gray-200 bg-gray-50 p-3">
                      <div className="text-[9px] font-black tracking-[0.12em] text-gray-500">EFFECT</div>
                      <div className="mt-1 text-sm font-black text-gray-900">{activeEmotion.statEffect}{activeEmotion.effectAmount ? `（${activeEmotion.effectAmount}）` : ''}</div>
                      <div className="mt-1 text-[9px] font-bold text-gray-500">{activeEmotion.target} / {activeEmotion.duration} / {activeEmotion.effectCategory}</div>
                      <div className="mt-2 text-[10px] leading-4 text-gray-600">{activeEmotion.description}</div>
                    </div>
                  </div>

                  <div className="px-3 pb-3">
                    <div className="rounded-2xl border border-amber-100 bg-amber-50 p-3">
                      <div className="text-[9px] font-black tracking-[0.12em] text-amber-700">FLAVOR</div>
                      <div className={`mt-1 text-[10px] font-bold leading-4 ${flavorText.trim() ? 'text-amber-950' : 'text-amber-500'}`}>
                        {flavorText.trim() || '一言未設定'}
                      </div>
                    </div>
                  </div>

                  <div className="border-t border-gray-100 bg-white px-3 pb-3 pt-2">
                    <div className="rounded-2xl border border-gray-200 bg-gray-50 p-3">
                      <div className="text-[9px] font-black tracking-[0.12em] text-gray-500">REGISTERED USER</div>
                      <div className="mt-1 text-sm font-black text-gray-950">{userName || '未設定'}</div>
                      {showProfileUrl && (
                        <>
                          <div className="mt-3 text-[8px] font-black text-gray-400">REALITYプロフィールURL</div>
                          <div className="mt-0.5 break-all text-[10px] font-bold text-gray-700">{normalizeProfileUrl(profileUrl) || '未設定'}</div>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="border-t border-gray-100 bg-white px-3 pb-4 pt-3">
                    <div className="flex items-center justify-between gap-3 rounded-2xl border border-gray-200 bg-white p-3">
                      <span className="text-[9px] font-black text-gray-500">カラー</span>
                      <span className="inline-flex items-center gap-1.5 text-[9px] font-black text-gray-700">
                        <span className="h-3 w-3 rounded-full border border-gray-300" style={{ backgroundColor: selectedColorHex }} />
                        {selectedColorHex.toUpperCase()}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <button type="button" onClick={() => { setRegistrationStep(2); setErrorMessage(''); setSuccessMessage(''); }} className="shrink-0 rounded-xl border border-gray-200 bg-white py-2.5 text-xs font-black text-gray-700">② 編集に戻る</button>
            </div>
          )}
        </div>

        <div className="shrink-0 border-t border-gray-200 bg-white px-3 py-3 sm:px-5">
          {registrationStep === 3 && isProcessingCard ? (
            <button type="button" disabled className="w-full rounded-2xl bg-purple-300 px-4 py-3 text-sm font-black text-white">
              保存中…
            </button>
          ) : (
            <button
              type="submit"
              disabled={isModerating || isProcessingCard}
              className="w-full rounded-2xl bg-purple-600 px-4 py-3 text-sm font-black text-white shadow disabled:cursor-wait disabled:bg-purple-300"
            >
              {isModerating ? '安全確認中…' : registrationStep === 2 ? '③ 登録内容を確認' : editingId ? 'このカードを更新する' : 'このカードで参加する'}
            </button>
          )}
        </div>
      </form>

      {activeEditor && (
        <div className="fixed inset-0 z-[80] flex items-end justify-center bg-slate-950/65 p-2 sm:items-center sm:p-4">
          <div className="flex max-h-[88dvh] w-full max-w-md flex-col overflow-hidden rounded-3xl bg-white shadow-2xl">
            <div className="flex shrink-0 items-center justify-between gap-3 border-b border-gray-200 px-4 py-3">
              <div className="text-sm font-black">
                {activeEditor === 'basic' && 'カード情報を編集'}
                {activeEditor === 'effect' && '効果名を編集'}
                {activeEditor === 'color' && 'カードカラーを設定'}
                {activeEditor === 'flavor' && 'カードの一言を編集'}
              </div>
              <button type="button" onClick={() => setActiveEditor(null)} className="rounded-lg bg-gray-100 px-2.5 py-1.5 text-xs font-black">✕</button>
            </div>

            <div className="min-h-0 overflow-y-auto p-4">
              {activeEditor === 'basic' && (
                <div className="space-y-4 text-xs">
                  <div>
                    <label className="mb-1 block font-bold">カード画像 <span className="text-red-500">*</span></label>
                    <input type="file" accept="image/*" onChange={handleImageUpload} className="w-full text-xs" />
                    {imageDataUrl && (
                      <div className="mt-2 overflow-hidden rounded-xl border border-gray-200 bg-gray-50">
                        <img src={imageDataUrl} alt="" className="h-36 w-full object-cover" />
                      </div>
                    )}
                  </div>

                  <div>
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <label className="block font-bold">REALITY プロフURL <span className="text-red-500">*</span></label>
                      <button type="button" onClick={() => setShowProfileUrlGuide(true)} className="rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 py-1.5 text-[9px] font-black text-indigo-700">手順</button>
                    </div>

                    <input
                      type="text"
                      value={profileUrl}
                      onChange={(e) => handleProfileUrlChange(e.target.value)}
                      placeholder="https://reality.app/profile/xxxxxx"
                      className="w-full rounded-xl border px-3 py-2.5"
                    />

                    <label className="mt-2 flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5">
                      <span className="text-[10px] font-bold text-gray-700">プロフURLをカードに表示する</span>
                      <span className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition ${showProfileUrl ? 'bg-purple-600' : 'bg-gray-300'}`}>
                        <input type="checkbox" checked={showProfileUrl} onChange={(e) => setShowProfileUrl(e.target.checked)} className="peer sr-only" />
                        <span className={`pointer-events-none h-4 w-4 rounded-full bg-white shadow transition ${showProfileUrl ? 'translate-x-6' : 'translate-x-1'}`} />
                      </span>
                    </label>
                    <p className="mt-1 text-[9px] leading-4 text-gray-500">同じREALITYユーザーがカードを複数登録することを防ぐために使用します。</p>
                  </div>

                  <div>
                    <label className="mb-1 block font-bold">登録ユーザー名 <span className="text-red-500">*</span></label>
                    <input type="text" value={userName} onChange={(e) => setUserName(e.target.value)} maxLength={40} placeholder="例：わくわくさん" className="w-full rounded-xl border px-3 py-2.5" />
                    <p className="mt-1 text-[9px] leading-4 text-gray-500">この名前を、サポートカードの登録ユーザーとして表示します。</p>
                  </div>

                  <div>
                    <label className="mb-1 block font-bold">編集・削除用の合言葉 {!editingId && <span className="text-red-500">*</span>}</label>
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder={editingId ? '別端末から編集・削除するときに入力' : '後からの編集・削除に使用します'}
                      className="w-full rounded-xl border px-3 py-2.5"
                    />
                    <p className="mt-1 text-[9px] text-gray-500">
                      {editingId
                        ? '同じ端末ではFirebase UIDによる所有者認証を使用します。認証できない場合は登録時の合言葉を確認します。'
                        : '新規登録時に必須です。合言葉そのものはブラウザには保存されません。'}
                    </p>
                  </div>
                </div>
              )}

              {activeEditor === 'effect' && (
                <div className="space-y-4">
                  <div className="rounded-2xl border border-purple-100 bg-purple-50/60 p-3">
                    <div className="text-[9px] font-black text-purple-600">選択中のエモーション</div>
                    <div className="mt-1 font-serif text-base font-black leading-relaxed text-purple-950">「{activeEmotion.emotionPhrase}」</div>
                    <div className="mt-1 text-[9px] font-bold text-gray-500">公式効果：{activeEmotion.statEffect}{activeEmotion.effectAmount ? ` ${activeEmotion.effectAmount}` : ''}</div>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-bold">効果名 <span className="text-red-500">*</span></label>
                    <input type="text" value={effectName} onChange={(e) => setEffectName(e.target.value)} maxLength={40} className="w-full rounded-xl border px-3 py-2.5 font-bold text-purple-900" />
                  </div>
                  <p className="text-[9px] leading-4 text-gray-500">この名前だけ、自分のカードらしく変更できます。実際の効果は選んだエモーションに基づきます。</p>
                </div>
              )}

              {activeEditor === 'color' && (
                <div className="space-y-4">
                  <div className="flex flex-wrap gap-2">
                    {COLOR_PALETTE.map((color) => (
                      <button key={color} type="button" onClick={() => handleColorChange(color)} aria-label={`カラー ${color}`} className={`h-10 w-10 rounded-full border-2 ${selectedColorHex.toUpperCase() === color.toUpperCase() ? 'border-gray-900 ring-2 ring-offset-1 ring-gray-300' : 'border-white shadow-sm'}`} style={{ backgroundColor: color }} />
                    ))}
                  </div>
                  <div className="rounded-2xl border border-gray-200 bg-gray-50 p-3">
                    <label className="mb-2 block text-[10px] font-black">自由な色</label>
                    <input type="color" value={selectedColorHex} onChange={(e) => handleColorChange(e.target.value)} className="h-12 w-16 cursor-pointer rounded-lg border bg-white p-1" />
                    <div className="mt-2 text-[10px] font-bold text-gray-600">{selectedColorHex.toUpperCase()} / {getColorTypeLabel(selectedColorType)}</div>
                  </div>
                </div>
              )}

              {activeEditor === 'flavor' && (
                <div>
                  <label className="mb-1 block text-xs font-bold">カードの一言</label>
                  <textarea value={flavorText} onChange={(e) => setFlavorText(e.target.value)} rows={6} maxLength={120} placeholder="このカードらしい一言をどうぞ。" className="w-full resize-none rounded-2xl border px-3 py-3 text-sm" />
                  <p className="mt-1 text-[9px] text-gray-500">最大120文字。</p>
                </div>
              )}
            </div>

            <div className="shrink-0 border-t border-gray-200 p-3 space-y-2">
              {editingId && (
                <button
                  type="button"
                  disabled={isProcessingCard}
                  onClick={() => {
                    const entry = entries.find((item) => item.id === editingId);
                    if (entry) void handleDelete(entry);
                  }}
                  className="w-full rounded-xl border border-red-200 bg-red-50 py-2.5 text-xs font-black text-red-700 hover:bg-red-100 disabled:cursor-wait disabled:opacity-60"
                >
                  このカードを削除する
                </button>
              )}

              <button
                type="button"
                onClick={() => setActiveEditor(null)}
                className="w-full rounded-xl bg-gray-900 py-2.5 text-xs font-black text-white"
              >
                完了
              </button>
            </div>
          </div>
        </div>
      )}

      {activeModal === 'emotion' && (
        <div className="fixed inset-0 z-[90] flex items-end justify-center bg-slate-950/70 p-0 sm:items-center sm:p-4">
          <div className="flex max-h-[92dvh] w-full max-w-3xl flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl">
            <div className="flex shrink-0 items-center justify-between gap-3 border-b border-gray-200 px-4 py-3">
              <div>
                <div className="text-[9px] font-black tracking-[0.16em] text-purple-500">EMOTION PICKER</div>
                <div className="mt-0.5 text-sm font-black">エモーションを選ぶ</div>
              </div>
              <button type="button" onClick={() => setActiveModal(null)} className="rounded-lg bg-gray-100 px-2.5 py-1.5 text-xs font-black">✕</button>
            </div>

            <div className="min-h-0 overflow-y-auto p-3 sm:p-4">
              <div className="inline-flex rounded-full border border-purple-200 bg-purple-50 p-1 shadow-sm" role="group" aria-label="エモーション選択モード">
                <button type="button" onClick={() => setPickerMode('feeling')} className={`rounded-full px-4 py-2 text-[10px] font-black transition ${pickerMode === 'feeling' ? 'bg-purple-700 text-white shadow' : 'text-gray-500 hover:text-purple-700'}`}>想いから選択</button>
                <button type="button" onClick={() => setPickerMode('performance')} className={`rounded-full px-4 py-2 text-[10px] font-black transition ${pickerMode === 'performance' ? 'bg-purple-700 text-white shadow' : 'text-gray-500 hover:text-purple-700'}`}>性能から選択</button>
              </div>

              <div className="mt-3 rounded-2xl border border-gray-200 bg-white p-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="text-[9px] font-black text-gray-500">{pickerMode === 'feeling' ? '想いのマップから探す' : '効果条件から探す'}</div>
                  <input type="text" value={pickerSearch} onChange={(e) => setPickerSearch(e.target.value)} placeholder={pickerMode === 'feeling' ? '想いの言葉を検索（任意）' : 'エモーション名・想い・効果を検索'} className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs sm:max-w-xs" />
                </div>

                {pickerMode === 'performance' && (
                  <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
                    <select value={pickerTarget} onChange={(e) => setPickerTarget(e.target.value)} className="w-full rounded-lg border border-gray-200 bg-white px-2.5 py-2 text-[10px] font-bold text-purple-900">
                      <option value="ALL">対象：すべて</option>
                      <option value="自分">自分</option>
                      <option value="相手">相手</option>
                      <option value="自分・相手">自分・相手</option>
                    </select>
                    <select value={pickerEffect} onChange={(e) => setPickerEffect(e.target.value)} className="w-full rounded-lg border border-gray-200 bg-white px-2.5 py-2 text-[10px] font-bold text-purple-900">
                      <option value="ALL">効果：すべて</option>
                      {Array.from(new Set(EMOTION_PRESETS.map((emotion) => emotion.effectCategory))).map((category) => (
                        <option key={category} value={category}>{category}</option>
                      ))}
                    </select>
                    <select value={pickerDuration} onChange={(e) => setPickerDuration(e.target.value)} className="w-full rounded-lg border border-gray-200 bg-white px-2.5 py-2 text-[10px] font-bold text-purple-900">
                      <option value="ALL">時間：すべて</option>
                      <option value="一時">一時</option>
                      <option value="永続">永続</option>
                    </select>
                  </div>
                )}

                {pickerMode === 'feeling' ? (
                  <div className="mt-3">
                    <EmotionMiniMap selectedEmotionId={activeEmotion.id} onSelect={handleEmotionChange} />
                  </div>
                ) : (
                  <div className="mt-3 max-h-[48dvh] space-y-2 overflow-y-auto pr-1">
                    {pickerEmotions.length === 0 ? (
                      <div className="py-10 text-center text-xs font-bold text-gray-500">条件に一致するエモーションがありません。</div>
                    ) : (
                      pickerEmotions.map((emotion) => {
                        const selected = emotion.id === activeEmotion.id;
                        return (
                          <button key={emotion.id} type="button" onClick={() => handlePerformanceEmotionSelect(emotion)} className={`w-full rounded-2xl border p-3 text-left transition ${selected ? 'border-purple-500 bg-purple-50 ring-2 ring-purple-200' : 'border-gray-200 bg-white hover:border-purple-300'}`}>
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="font-serif text-sm font-black leading-relaxed text-purple-950">{selected ? '✓ ' : ''}{emotion.emotionPhrase}</div>
                                <div className="mt-1 text-[10px] font-black text-gray-500">{emotion.name}</div>
                              </div>
                              <div className="shrink-0 rounded-xl bg-purple-50 px-2 py-1.5 text-right">
                                <div className="text-[9px] font-black text-purple-800">{emotion.statEffect}</div>
                                <div className="text-[9px] font-bold text-gray-500">{emotion.effectAmount || ''} / {emotion.duration}</div>
                              </div>
                            </div>
                            <div className="mt-2 text-[9px] font-bold text-gray-500">対象：{emotion.target} ／ {emotion.effectCategory}</div>
                          </button>
                        );
                      })
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="shrink-0 border-t border-gray-200 bg-white p-3">
              {pickerMode === 'performance' ? (
                <button type="button" onClick={() => setActiveModal(null)} className="w-full rounded-xl bg-purple-700 py-3 text-xs font-black text-white shadow-sm">このエモーションで登録に進む</button>
              ) : (
                <button type="button" onClick={() => setActiveModal(null)} className="w-full rounded-xl bg-gray-900 py-2.5 text-xs font-black text-white">閉じる</button>
              )}
            </div>
          </div>
        </div>
      )}

      {showProfileUrlGuide && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/70 p-3 backdrop-blur-sm">
          <div className="w-full max-w-sm overflow-hidden rounded-3xl bg-white shadow-2xl">
            <div className="flex items-center justify-between gap-3 border-b border-gray-200 px-4 py-3">
              <div className="text-sm font-black">REALITYプロフィールURLの取得手順</div>
              <button type="button" onClick={() => setShowProfileUrlGuide(false)} className="rounded-lg bg-gray-100 px-2.5 py-1.5 text-xs font-black">✕</button>
            </div>

            <div className="min-h-0 max-h-[78dvh] overflow-y-auto p-4 text-[10px] leading-5 text-gray-700">
              <div className="font-black text-indigo-800">① 自分のREALITYプロフィールを開き、共有ボタンをタップ</div>
              <img src="/tcg_card/REALITY_USERURL_copy_1.jpg" alt="REALITYプロフィール画面で共有ボタンをタップする手順" className="mt-2 w-full rounded-2xl border border-gray-200 bg-gray-50 object-contain" />
              <div className="mt-5 font-black text-indigo-800">② プロフィールURLをコピーする</div>
              <img src="/tcg_card/REALITY_USERURL_copy_2.jpg" alt="REALITYプロフィールURLをコピーする手順" className="mt-2 w-full rounded-2xl border border-gray-200 bg-gray-50 object-contain" />
            </div>

            <div className="border-t border-gray-200 p-3">
              <button type="button" onClick={() => setShowProfileUrlGuide(false)} className="w-full rounded-xl bg-gray-900 py-2.5 text-xs font-black text-white">閉じる</button>
            </div>
          </div>
        </div>
      )}

      {activeModal === 'saved' && (
        <div className="fixed inset-0 z-[90] flex items-end justify-center bg-slate-950/70 p-0 sm:items-center sm:p-4">
          <div className="flex max-h-[92dvh] w-full max-w-md flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl">
            <div className="flex shrink-0 items-center justify-between gap-3 border-b border-gray-200 px-4 py-3">
              <div className="text-sm font-black">自分のサポートカード</div>
              <button type="button" onClick={() => setActiveModal(null)} className="rounded-lg bg-gray-100 px-2.5 py-1.5 text-xs font-black">✕</button>
            </div>

            <div className="min-h-0 overflow-y-auto p-4">
              {savedSupportEntries.length === 0 ? (
                <div className="py-10 text-center text-xs text-gray-500">まだサポートカードはありません。</div>
              ) : (
                <div className="space-y-3">
                  {savedSupportEntries.map((entry) => {
                    const emotion = EMOTION_PRESETS.find((preset) => preset.id === entry.presetId);
                    const cardColor = entry.colorHex && /^#[0-9a-fA-F]{6}$/.test(entry.colorHex)
                      ? entry.colorHex
                      : getLegacyColorHex(entry.color);

                    return (
                      <div key={entry.id} className="rounded-2xl border bg-gray-50 p-3" style={{ borderTopWidth: 4, borderTopColor: cardColor }}>
                        <div className="flex items-center gap-3">
                          <img src={entry.imageDataUrl} alt="" className="h-12 w-12 rounded-xl object-cover" />
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-sm font-black">{entry.customEffectName || emotion?.name || '効果名未設定'}</div>
                            <div className="truncate text-[9px] font-bold text-purple-700">登録ユーザー：{entry.userName}</div>
                          </div>
                        </div>

                        {entry.flavorText && (
                          <div className="mt-2 rounded-xl bg-white p-2 text-[10px] leading-4 text-gray-700">💬 {entry.flavorText}</div>
                        )}

                        <div className="mt-2">
                          <button
                            type="button"
                            onClick={() => handleEdit(entry)}
                            className="w-full rounded-xl bg-purple-600 px-3 py-2 text-[10px] font-black text-white hover:bg-purple-700"
                          >
                            編集・削除
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="shrink-0 border-t border-gray-200 p-3">
              <button type="button" onClick={() => setActiveModal(null)} className="w-full rounded-xl bg-gray-900 py-2.5 text-xs font-black text-white">閉じる</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
