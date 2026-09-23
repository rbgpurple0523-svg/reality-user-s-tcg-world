'use client';

import React, { useState, useEffect, ChangeEvent, FormEvent } from 'react';
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
}

const DRAFT_KEY = 'reality_world_support_draft';
const ENTRIES_KEY = 'reality_world_entries';
const MY_TOKENS_KEY = 'reality_world_my_tokens';

type ModerationResult = {
  allowed: boolean;
  code: string;
};


type EmotionPickerMode = 'feeling' | 'performance';

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

  const seed = emotion.id.split('').reduce(
    (sum, char) => sum + char.charCodeAt(0),
    0,
  );
  const jitterX = ((seed % 5) - 2) * 0.8;
  const jitterY = (((seed * 7) % 5) - 2) * 0.65;

  return {
    x: Math.min(92, Math.max(8, weighted.x / total + jitterX)),
    y: Math.min(91, Math.max(9, weighted.y / total + jitterY)),
  };
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


function EmotionMiniMap({
  selectedEmotionId,
  onSelect,
}: {
  selectedEmotionId: string;
  onSelect: (emotion: EmotionPreset) => void;
}) {
  const [hoveredEmotionId, setHoveredEmotionId] = useState<string | null>(null);

  return (
    <div className="w-full max-w-[280px] rounded-2xl border border-purple-100 bg-white p-2.5 shadow-sm">
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
              <div className="text-[12px] leading-none">{vertex.icon}</div>
              <div className="mt-0.5 text-[8px] font-black text-purple-950">{vertex.label}</div>
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
              onMouseEnter={() => setHoveredEmotionId(emotion.id)}
              onFocus={() => setHoveredEmotionId(emotion.id)}
              onMouseLeave={() => setHoveredEmotionId(null)}
              onBlur={() => setHoveredEmotionId(null)}
              aria-label={`${emotion.emotionPhrase}｜${emotion.name}`}
              title={`${emotion.emotionPhrase}｜${emotion.name}`}
              className={`absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border transition ${
                selected
                  ? 'z-30 scale-150 border-white bg-purple-700 shadow-[0_0_0_3px_rgba(124,58,237,0.20),0_0_10px_rgba(124,58,237,0.75)]'
                  : 'z-10 border-purple-100 bg-purple-500 shadow-[0_0_7px_rgba(124,58,237,0.42)] hover:scale-150 hover:bg-fuchsia-500'
              }`}
              style={{ left: `${position.x}%`, top: `${position.y}%` }}
            />
          );
        })}

        {hoveredEmotionId && (() => {
          const emotion = EMOTION_PRESETS.find((item) => item.id === hoveredEmotionId);
          if (!emotion) return null;
          const position = getEmotionMapPosition(emotion);
          return (
            <div
              className="pointer-events-none absolute z-40 max-w-[185px] -translate-x-1/2 -translate-y-full rounded-xl border border-purple-200 bg-white/95 px-2.5 py-2 text-center shadow-lg backdrop-blur-sm"
              style={{ left: `${position.x}%`, top: `${Math.max(9, position.y - 3)}%` }}
            >
              <div className="text-[8px] font-black text-purple-500">{emotion.name}</div>
              <div className="mt-0.5 font-serif text-[10px] font-black leading-relaxed text-purple-950">
                {emotion.emotionPhrase}
              </div>
            </div>
          );
        })()}
      </div>
      <p className="mt-2 text-[9px] font-bold leading-relaxed text-gray-500">
        ドットをタップして、登録する「想い」を選び直せます。
      </p>
    </div>
  );
}

export default function SupportCardGenerator({ selectedEmotion, onBackToHub }: SupportCardGeneratorProps) {
  const [selectedEmotionId, setSelectedEmotionId] = useState<string>(
    selectedEmotion?.id || EMOTION_PRESETS[0]?.id || '',
  );

  const [pickerMode, setPickerMode] = useState<EmotionPickerMode>('feeling');
  const [pickerSearch, setPickerSearch] = useState('');
  const [hoveredEmotionId, setHoveredEmotionId] = useState<string | null>(null);
  const [pickerTarget, setPickerTarget] = useState<string>('ALL');
  const [pickerEffect, setPickerEffect] = useState<string>('ALL');
  const [pickerDuration, setPickerDuration] = useState<string>('ALL');

  const [filterEmotionId, setFilterEmotionId] = useState<string>('all');
  const [filterTarget, setFilterTarget] = useState<string>('ALL');
  const [filterEffect, setFilterEffect] = useState<string>('ALL');
  const [filterDuration, setFilterDuration] = useState<string>('ALL');

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

  const [entries, setEntries] = useState<EntryRecord[]>([]);
  const [myTokens, setMyTokens] = useState<string[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [isModerating, setIsModerating] = useState(false);

  const selectedColorType = getColorTypeFromHex(selectedColorHex);

  useEffect(() => {
    try {
      const savedEntries = localStorage.getItem(ENTRIES_KEY);
      if (savedEntries) setEntries(JSON.parse(savedEntries));

      const savedTokens = localStorage.getItem(MY_TOKENS_KEY);
      if (savedTokens) setMyTokens(JSON.parse(savedTokens));

      const savedDraft = localStorage.getItem(DRAFT_KEY);
      if (savedDraft) {
        const draft = JSON.parse(savedDraft) as {
          profileUrl?: string;
          userName?: string;
          imageDataUrl?: string;
          password?: string;
          selectedEmotionId?: string;
          effectName?: string;
          flavorText?: string;
          colorHex?: string;
        };

        if (confirm('前回の作成途中の下書きデータがあります。続きから作成しますか？')) {
          setProfileUrl(draft.profileUrl || '');
          setUserName(draft.userName || '');
          setImageDataUrl(draft.imageDataUrl || '');
          setPassword(draft.password || '');
          if (draft.selectedEmotionId) setSelectedEmotionId(draft.selectedEmotionId);
          if (draft.effectName) setEffectName(draft.effectName);
          setFlavorText(draft.flavorText || getEmotionFlavorText(activeEmotion));
          setSelectedColorHex(
            draft.colorHex && /^#[0-9a-fA-F]{6}$/.test(draft.colorHex)
              ? draft.colorHex.toUpperCase()
              : getLegacyColorHex(undefined),
          );
        } else {
          localStorage.removeItem(DRAFT_KEY);
        }
      }
    } catch {
      // Local storage failure must not block the form itself.
    }
  }, []);

  useEffect(() => {
    if (selectedEmotion) {
      setSelectedEmotionId(selectedEmotion.id);
      setEffectName(selectedEmotion.name);
      setFlavorText(getEmotionFlavorText(selectedEmotion));
    }
  }, [selectedEmotion]);

  useEffect(() => {
    if (editingId) return;

    const draftData = {
      profileUrl,
      userName,
      imageDataUrl,
      password,
      selectedEmotionId,
      effectName,
      flavorText,
      colorHex: selectedColorHex,
      colorType: selectedColorType,
    };

    const hasDraft =
      Boolean(profileUrl) ||
      Boolean(userName) ||
      Boolean(imageDataUrl) ||
      Boolean(password) ||
      Boolean(effectName) ||
      Boolean(flavorText);

    try {
      if (!hasDraft) {
        localStorage.removeItem(DRAFT_KEY);
        return;
      }

      localStorage.setItem(DRAFT_KEY, JSON.stringify(draftData));
    } catch {
      // Continue editing even when local storage is unavailable.
    }
  }, [
    profileUrl,
    userName,
    imageDataUrl,
    password,
    selectedEmotionId,
    effectName,
    flavorText,
    selectedColorHex,
    selectedColorType,
    editingId,
  ]);

  const handleEmotionChange = (emotion: EmotionPreset) => {
    setSelectedEmotionId(emotion.id);
    setEffectName(emotion.name);
    setFlavorText(getEmotionFlavorText(emotion));
    setHoveredEmotionId(emotion.id);
    setErrorMessage('');
  };

  const handleImageUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setImageDataUrl(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleColorChange = (hex: string) => {
    const normalized = hex.toUpperCase();
    if (!/^#[0-9A-F]{6}$/.test(normalized)) return;
    setSelectedColorHex(normalized);
    setErrorMessage('');
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setErrorMessage('');

    if (!profileUrl.includes('reality.app/user/')) {
      setErrorMessage('有効なREALITYプロフURLを入力してください。');
      return;
    }

    if (
      !userName.trim() ||
      !imageDataUrl ||
      !password.trim() ||
      !effectName.trim()
    ) {
      setErrorMessage('必須項目をすべて入力してください。');
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

    const currentEntries = (() => {
      try {
        const saved = localStorage.getItem(ENTRIES_KEY);
        return saved ? (JSON.parse(saved) as EntryRecord[]) : entries;
      } catch {
        return entries;
      }
    })();

    const existing = editingId
      ? currentEntries.find((entry) => entry.id === editingId)
      : undefined;

    let ownerToken = existing?.ownerToken;
    if (!ownerToken) {
      ownerToken =
        'token_' +
        Date.now() +
        '_' +
        Math.random().toString(36).substring(2, 7);
    }

    const now = new Date().toISOString();
    const newEntry: EntryRecord = {
      id: editingId || 'entry_' + Date.now(),
      presetId: activeEmotion.id,
      cardType: 'emotion',
      profileUrl: profileUrl.trim(),
      userName: userName.trim(),
      imageDataUrl,
      passwordHash: password,
      customEffectName: effectName.trim(),
      flavorText: flavorText.trim(),
      colorHex: selectedColorHex,
      colorType: selectedColorType,
      ownerToken,
      firstUser: existing?.firstUser || '自分',
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    };

    const updatedEntries = editingId
      ? currentEntries.map((entry) =>
          entry.id === editingId ? newEntry : entry,
        )
      : [newEntry, ...currentEntries];

    const nextTokens = newEntry.ownerToken && !myTokens.includes(newEntry.ownerToken)
      ? [...myTokens, newEntry.ownerToken]
      : myTokens;

    try {
      localStorage.setItem(ENTRIES_KEY, JSON.stringify(updatedEntries));
      localStorage.setItem(MY_TOKENS_KEY, JSON.stringify(nextTokens));
      localStorage.removeItem(DRAFT_KEY);
    } catch {
      setErrorMessage('保存に失敗しました。ブラウザの保存領域を確認してください。');
      return;
    }

    setEntries(updatedEntries);
    setMyTokens(nextTokens);
    setEditingId(null);
    setSuccessMessage(
      editingId
        ? '✨ サポートカードを更新しました！'
        : '✨ サポートカードが正常にエントリーされました！',
    );

    setProfileUrl('');
    setUserName('');
    setImageDataUrl('');
    setPassword('');
    setFlavorText(getEmotionFlavorText(activeEmotion));
    setSelectedColorHex('#22D3EE');
    setSelectedEmotionId(activeEmotion.id);
    setEffectName(activeEmotion.name);

    window.setTimeout(() => setSuccessMessage(''), 2500);
  };

  const startEdit = (entry: EntryRecord) => {
    const isOwner = Boolean(entry.ownerToken && myTokens.includes(entry.ownerToken));
    if (!isOwner) {
      const inputPass = prompt('このカードの所持者ですか？作成時に決めた合言葉（パスワード）を入力してください:');
      if (inputPass !== entry.passwordHash) {
        alert('合言葉が違います。');
        return;
      }
    }

    setProfileUrl(entry.profileUrl);
    setUserName(entry.userName);
    setImageDataUrl(entry.imageDataUrl);
    setPassword(entry.passwordHash);
    setEffectName(entry.customEffectName || '');
    setFlavorText(entry.flavorText || '');
    setSelectedColorHex(
      entry.colorHex && /^#[0-9a-fA-F]{6}$/.test(entry.colorHex)
        ? entry.colorHex.toUpperCase()
        : getLegacyColorHex(entry.color),
    );

    if (entry.presetId) {
      setSelectedEmotionId(entry.presetId);
    }

    setEditingId(entry.id);
    setErrorMessage('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleAuthenticate = (entry: EntryRecord) => {
    const inputPass = prompt('このカードの所持者ですか？作成時に決めた合言葉（パスワード）を入力してください:');
    if (inputPass === entry.passwordHash) {
      if (!entry.ownerToken) {
        alert('このカードには作成者トークンがありません。作成した端末で操作してください。');
        return;
      }

      const updatedTokens = [...myTokens, entry.ownerToken];
      setMyTokens(updatedTokens);
      localStorage.setItem(MY_TOKENS_KEY, JSON.stringify(updatedTokens));
      alert('認証されました！「編集」「削除」が行えます。');
    } else {
      alert('合言葉が違います。');
    }
  };

  const handleDelete = (id: string) => {
    if (!confirm('本当にこのエントリーを削除しますか？')) return;
    const updated = entries.filter((item) => item.id !== id);
    setEntries(updated);
    localStorage.setItem(ENTRIES_KEY, JSON.stringify(updated));
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

  const filteredEntries = entries.filter((entry) => {
    if (entry.cardType !== 'emotion') return false;
    const emotion = EMOTION_PRESETS.find((preset) => preset.id === entry.presetId);
    if (!emotion) return false;
    if (filterEmotionId !== 'all' && entry.presetId !== filterEmotionId) return false;
    if (filterTarget !== 'ALL' && emotion.target !== filterTarget) return false;
    if (filterEffect !== 'ALL' && emotion.effectCategory !== filterEffect) return false;
    if (filterDuration !== 'ALL' && emotion.duration !== filterDuration) return false;
    return true;
  });

  const selectedEmotionPreview = activeEmotion;

  return (
    <div className="max-w-5xl mx-auto p-6 bg-white rounded-2xl border border-gray-200 shadow-lg space-y-8 text-gray-900">
      <div className="flex justify-between items-center border-b pb-4">
        <div>
          <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-purple-100 text-purple-800">
            1-2 サポートカードとしてエントリー
          </span>
          <h2 className="text-xl font-extrabold text-gray-900 mt-1">
            サポートカード・アバターエントリー
          </h2>
          <p className="text-[11px] text-gray-500 mt-1">
            自分の思いと重なるエモーションを1つ選び、アバターに合わせてサポートカードを作成します。
          </p>
        </div>
        {onBackToHub && (
          <button
            onClick={onBackToHub}
            className="text-xs font-bold px-3 py-1.5 bg-gray-100 hover:bg-gray-200 rounded-lg text-gray-600 transition cursor-pointer"
          >
            ← 戻る
          </button>
        )}
      </div>

      <section className="rounded-3xl border border-purple-100 bg-gradient-to-br from-white via-purple-50/40 to-indigo-50/40 p-4 md:p-5 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-[11px] font-black tracking-wider text-purple-700">EMOTION EXPLORER</div>
            <h3 className="mt-1 text-lg font-black text-purple-950">性能より先に、「どんな想いの人？」で選ぶ</h3>
            <p className="mt-1 text-[10px] leading-relaxed text-gray-600">
              これは分類ではなくニュアンスの地図です。35個のエモーションが、5つの空気感の重なり具合として配置されています。
            </p>
          </div>
          <div className="inline-flex self-start rounded-full border border-purple-200 bg-white p-1 shadow-sm" role="group" aria-label="エモーション選択モード">
            <button type="button" onClick={() => setPickerMode('feeling')} className={`rounded-full px-3 py-1.5 text-[10px] font-black transition ${pickerMode === 'feeling' ? 'bg-purple-700 text-white shadow' : 'text-gray-500 hover:text-purple-700'}`}>💜 感情重視</button>
            <button type="button" onClick={() => setPickerMode('performance')} className={`rounded-full px-3 py-1.5 text-[10px] font-black transition ${pickerMode === 'performance' ? 'bg-purple-700 text-white shadow' : 'text-gray-500 hover:text-purple-700'}`}>📊 性能重視</button>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-5 xl:grid-cols-[1.15fr_0.85fr]">
          <div className="min-w-0 rounded-2xl border border-white bg-white/80 p-3 shadow-sm">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-[10px] font-black text-gray-500">{pickerMode === 'feeling' ? '5つの空気感のあいだを探索' : '効果条件から素早く探す'}</div>
              <input type="text" value={pickerSearch} onChange={(e) => setPickerSearch(e.target.value)} placeholder={pickerMode === 'feeling' ? '想いの言葉を検索（任意）' : 'エモーション名・想い・効果を検索'} className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs focus:ring-2 focus:ring-purple-500 sm:max-w-xs" />
            </div>

            {pickerMode === 'performance' && (
              <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
                <select value={pickerTarget} onChange={(e) => setPickerTarget(e.target.value)} className="w-full rounded-lg border border-gray-200 bg-white px-2.5 py-2 text-[10px] font-bold text-purple-900"><option value="ALL">対象：すべて</option><option value="自分">自分</option><option value="相手">相手</option><option value="自分・相手">自分・相手</option></select>
                <select value={pickerEffect} onChange={(e) => setPickerEffect(e.target.value)} className="w-full rounded-lg border border-gray-200 bg-white px-2.5 py-2 text-[10px] font-bold text-purple-900"><option value="ALL">効果：すべて</option>{Array.from(new Set(EMOTION_PRESETS.map((emotion) => emotion.effectCategory))).map((category) => <option key={category} value={category}>{category}</option>)}</select>
                <select value={pickerDuration} onChange={(e) => setPickerDuration(e.target.value)} className="w-full rounded-lg border border-gray-200 bg-white px-2.5 py-2 text-[10px] font-bold text-purple-900"><option value="ALL">時間：すべて</option><option value="一時">一時</option><option value="永続">永続</option></select>
              </div>
            )}

            {pickerMode === 'feeling' ? (
              <div className="mt-3">
                <div className="relative aspect-square w-full overflow-hidden rounded-2xl border border-purple-100 bg-[radial-gradient(circle_at_center,rgba(168,85,247,0.16),transparent_48%),linear-gradient(135deg,rgba(99,102,241,0.04),rgba(236,72,153,0.08))]">
                  <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full" aria-hidden="true">
                    {EMOTION_AXIS_RING_VALUES.map((value) => {
                      const points = EMOTION_AXIS_ORDER.map((axis) => {
                        const vertex = EMOTION_AXIS_CONFIG[axis];
                        return [50 + (vertex.x - 50) * (value / 100), 49 + (vertex.y - 49) * (value / 100)].join(',');
                      }).join(' ');
                      return <polygon key={value} points={points} fill="none" stroke="rgba(124,58,237,0.12)" strokeWidth="0.55" />;
                    })}
                    {EMOTION_AXIS_ORDER.map((axis) => {
                      const vertex = EMOTION_AXIS_CONFIG[axis];
                      return <line key={axis} x1="50" y1="49" x2={vertex.x} y2={vertex.y} stroke="rgba(124,58,237,0.16)" strokeWidth="0.55" />;
                    })}
                    <polygon points={EMOTION_AXIS_ORDER.map((axis) => `${EMOTION_AXIS_CONFIG[axis].x},${EMOTION_AXIS_CONFIG[axis].y}`).join(' ')} fill="rgba(139,92,246,0.04)" stroke="rgba(124,58,237,0.26)" strokeWidth="1" />
                    <circle cx="50" cy="49" r="1.2" fill="rgba(91,95,239,0.42)" />
                  </svg>

                  {EMOTION_AXIS_ORDER.map((axis) => {
                    const vertex = EMOTION_AXIS_CONFIG[axis];
                    return <div key={axis} className="absolute -translate-x-1/2 -translate-y-1/2 whitespace-nowrap text-center" style={{ left: `${vertex.x}%`, top: `${vertex.y}%` }}><div className="text-lg leading-none">{vertex.icon}</div><div className="mt-0.5 text-[10px] font-black text-purple-950">{vertex.label}</div></div>;
                  })}

                  {pickerEmotions.map((emotion) => {
                    const position = getEmotionMapPosition(emotion);
                    const selected = emotion.id === selectedEmotionPreview.id;
                    return <button key={emotion.id} type="button" onClick={() => handleEmotionChange(emotion)} onMouseEnter={() => setHoveredEmotionId(emotion.id)} onFocus={() => setHoveredEmotionId(emotion.id)} onMouseLeave={() => setHoveredEmotionId(null)} onBlur={() => setHoveredEmotionId(null)} aria-label={`${emotion.emotionPhrase}｜${emotion.name}`} title={`${emotion.emotionPhrase}｜${emotion.name}`} className={`absolute h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 transition ${selected ? 'z-30 scale-150 border-white bg-purple-700 shadow-[0_0_0_4px_rgba(124,58,237,0.20),0_0_18px_rgba(124,58,237,0.75)]' : 'z-10 border-purple-100 bg-purple-500 shadow-[0_0_10px_rgba(124,58,237,0.45)] hover:scale-150 hover:bg-fuchsia-500'}`} style={{ left: `${position.x}%`, top: `${position.y}%` }} />;
                  })}

                  {hoveredEmotionId && (() => {
                    const emotion = pickerEmotions.find((item) => item.id === hoveredEmotionId);
                    if (!emotion) return null;
                    const position = getEmotionMapPosition(emotion);
                    return <div className="pointer-events-none absolute z-40 max-w-[230px] -translate-x-1/2 -translate-y-full rounded-2xl border border-purple-200 bg-white/95 px-3 py-2.5 text-center shadow-xl backdrop-blur-sm" style={{ left: `${position.x}%`, top: `${Math.max(8, position.y - 3)}%` }}><div className="text-[9px] font-black text-purple-500">{emotion.name}</div><div className="mt-0.5 font-serif text-[12px] font-black leading-relaxed text-purple-950">{emotion.emotionPhrase}</div><div className="mt-1 text-[9px] font-bold text-gray-500">{emotion.statEffect}{emotion.effectAmount ? ` ${emotion.effectAmount}` : ''} / {emotion.duration}</div></div>;
                  })()}

                  {pickerEmotions.length === 0 && <div className="absolute inset-0 flex items-center justify-center p-6 text-center text-xs font-bold text-gray-500">条件に一致するエモーションがありません。</div>}
                </div>
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[9px] font-bold text-gray-500"><span>● ドットをタップすると、その想いをカードに重ねられます。</span><span>{pickerEmotions.length} / {EMOTION_PRESETS.length} エモーション表示中</span></div>
              </div>
            ) : (
              <div className="mt-3 max-h-[430px] overflow-y-auto rounded-2xl border border-purple-100 bg-purple-50/40 p-2 space-y-2">
                {pickerEmotions.length === 0 ? <div className="py-8 text-center text-xs font-bold text-gray-500">条件に一致するエモーションがありません。</div> : pickerEmotions.map((emotion) => {
                  const selected = emotion.id === selectedEmotionPreview.id;
                  return <button key={emotion.id} type="button" onClick={() => handleEmotionChange(emotion)} className={`w-full rounded-2xl border p-3 text-left transition ${selected ? 'border-purple-500 bg-purple-100 ring-2 ring-purple-200' : 'border-white bg-white hover:border-purple-300'}`}><div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="font-serif text-sm font-black leading-relaxed text-purple-950">{selected ? '✓ ' : ''}{emotion.emotionPhrase}</div><div className="mt-1 text-[10px] font-black text-gray-500">{emotion.name}</div></div><div className="shrink-0 rounded-xl bg-purple-50 px-2 py-1.5 text-right"><div className="text-[9px] font-black text-purple-800">{emotion.statEffect}</div><div className="text-[9px] font-bold text-gray-500">{emotion.effectAmount || ''} / {emotion.duration}</div></div></div><div className="mt-2 text-[9px] font-bold text-gray-500">対象：{emotion.target} ／ {emotion.effectCategory}</div></button>;
                })}
              </div>
            )}
          </div>

          <div className="min-w-0">
            <div className="mb-2 flex items-center justify-between gap-2"><div><div className="text-[10px] font-black text-gray-500">REALTIME CARD PREVIEW</div><div className="mt-0.5 text-sm font-black text-gray-900">今選んでいる「想い」をカードに重ねる</div></div><div className="rounded-full bg-purple-100 px-2.5 py-1 text-[9px] font-black text-purple-800">{selectedEmotionPreview.id}</div></div>
            <div className="rounded-3xl border-4 bg-white p-4 shadow-md" style={{ borderColor: selectedColorHex }}>
              <div className="flex items-center justify-between gap-2 text-[9px] font-black text-gray-500"><span className="rounded-md bg-purple-700 px-2 py-1 text-white">サポートカード</span><span>{selectedEmotionPreview.target} / {selectedEmotionPreview.duration}</span></div>
              <div className="mt-3 rounded-2xl border border-purple-100 bg-gradient-to-br from-purple-50 to-white px-4 py-5 text-center shadow-inner"><div className="text-[9px] font-black uppercase tracking-[0.2em] text-purple-500">あなたの想い</div><div className="mt-2 font-serif text-xl font-black leading-relaxed text-purple-950">「{flavorText || selectedEmotionPreview.emotionPhrase}」</div>{flavorText !== selectedEmotionPreview.emotionPhrase && <div className="mt-2 text-[9px] font-bold text-gray-500">選択した想い：{selectedEmotionPreview.emotionPhrase}</div>}</div>
              <div className="mt-3 text-center"><div className="text-lg font-black text-gray-900">{userName || 'ユーザー名'}</div><div className="mt-0.5 text-xs font-black" style={{ color: selectedColorHex }}>✨ {selectedEmotionPreview.name}</div></div>
              <div className="mt-3 h-48 overflow-hidden rounded-2xl border border-gray-200 bg-gray-100">{imageDataUrl ? <img src={imageDataUrl} alt="Avatar" className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center text-xs font-medium text-gray-400">画像を選択すると表示されます</div>}</div>
              <div className="mt-3 rounded-2xl border border-gray-200 bg-gray-50 p-3"><div className="text-[9px] font-black tracking-wide text-gray-500">性能はサブ表示</div><div className="mt-1 text-sm font-black text-gray-800">✦ サポート効果：{selectedEmotionPreview.statEffect}{selectedEmotionPreview.effectAmount ? `（${selectedEmotionPreview.effectAmount}）` : ''}</div><div className="mt-1 text-[9px] font-bold text-gray-500">{selectedEmotionPreview.target} / {selectedEmotionPreview.duration} / {selectedEmotionPreview.effectCategory}</div><div className="mt-2 text-[10px] leading-relaxed text-gray-600">{selectedEmotionPreview.description}</div></div>
              <div className="mt-3 rounded-2xl border border-gray-200 bg-white p-3"><div className="flex items-center justify-between gap-3"><span className="text-[9px] font-black text-gray-500">イメージカラー</span><span className="inline-flex items-center gap-1.5 text-[9px] font-black text-gray-700"><span className="h-3 w-3 rounded-full border border-gray-300" style={{ backgroundColor: selectedColorHex }} />{getColorTypeLabel(selectedColorType)}</span></div><div className="mt-2 h-1.5 rounded-full" style={{ backgroundColor: selectedColorHex }} /></div>
            </div>
          </div>
        </div>
      </section>

      <div className="mt-6 rounded-3xl border border-gray-200 bg-white p-4 md:p-5 shadow-sm">
        <div className="mb-4"><div className="text-[10px] font-black tracking-wider text-gray-400">CARD DETAILS</div><h3 className="mt-1 text-base font-black text-gray-900">選んだ「想い」を、あなたのカードに整える</h3></div>
        <div className="mb-4">{errorMessage && <div className="p-3 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg" role="alert">{errorMessage}</div>}{successMessage && <div className="mt-2 p-3 text-xs text-green-700 bg-green-50 border border-green-200 rounded-lg">{successMessage}</div>}</div>
        <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-4 text-xs md:grid-cols-2">
          <div><label className="block font-bold text-gray-700 mb-1">REALITY プロフURL <span className="text-red-500">*</span></label><input type="text" placeholder="https://reality.app/user/xxxxxx" value={profileUrl} onChange={(e) => setProfileUrl(e.target.value)} className="w-full rounded-lg border bg-white px-3 py-2 focus:ring-2 focus:ring-purple-500" /></div>
          <div><label className="block font-bold text-gray-700 mb-1">アバター名 <span className="text-red-500">*</span></label><input type="text" placeholder="例: サポート太郎" value={userName} onChange={(e) => setUserName(e.target.value)} maxLength={40} className="w-full rounded-lg border bg-white px-3 py-2 focus:ring-2 focus:ring-purple-500" /></div>
          <div className="md:col-span-2"><label className="block font-bold text-gray-700 mb-1">アバター画像 <span className="text-red-500">*</span></label><input type="file" accept="image/*" onChange={handleImageUpload} className="w-full text-gray-700 file:mr-2 file:rounded file:border-0 file:bg-purple-50 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-purple-700 hover:file:bg-purple-100 cursor-pointer" /></div>
          <div className="rounded-2xl border border-gray-100 bg-gray-50 p-3 md:col-span-2"><label className="block font-bold text-gray-700 mb-1">イメージカラー</label><p className="text-[10px] text-gray-500">カードの雰囲気を表す色です。ゲーム用のカラータイプは選んだ色から自動判定されます。</p><div className="mt-3 flex flex-wrap gap-2">{COLOR_PALETTE.map((color) => <button key={color} type="button" onClick={() => handleColorChange(color)} aria-label={`カラー ${color}`} className={`h-8 w-8 rounded-full border-2 transition ${selectedColorHex.toUpperCase() === color.toUpperCase() ? 'border-gray-900 ring-2 ring-offset-1 ring-gray-300' : 'border-white shadow-sm'}`} style={{ backgroundColor: color }} />)}</div><div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center"><input type="color" value={selectedColorHex} onChange={(e) => handleColorChange(e.target.value)} aria-label="自由な色を選択" className="h-11 w-16 cursor-pointer rounded-lg border border-gray-300 bg-white p-1" /><div className="text-[10px] text-gray-500">HEX {selectedColorHex.toUpperCase()} / {getColorTypeLabel(selectedColorType)}</div></div></div>
          <div><label className="block font-bold text-gray-700 mb-1">効果名称設定（1つ・変更可能） <span className="text-red-500">*</span></label><input type="text" value={effectName} onChange={(e) => setEffectName(e.target.value)} maxLength={40} className="w-full rounded-lg border bg-white px-3 py-2 font-bold text-purple-900 focus:ring-2 focus:ring-purple-500" /><p className="mt-1 text-[10px] text-gray-500">エモーションの性能名称だけを自分らしく変更できます。</p></div>
          <div className="md:col-span-2"><label className="block font-bold text-gray-700 mb-2">選択したエモーション</label><div className="grid grid-cols-1 gap-4 rounded-2xl border border-purple-100 bg-purple-50/50 p-3 md:grid-cols-[minmax(0,280px)_1fr] md:items-center"><EmotionMiniMap selectedEmotionId={selectedEmotionPreview.id} onSelect={handleEmotionChange} /><div className="min-w-0 rounded-2xl border border-white bg-white p-4 shadow-sm"><div className="text-[9px] font-black tracking-wide text-purple-500">今の「想い」</div><div className="mt-1 font-serif text-lg font-black leading-relaxed text-purple-950">「{selectedEmotionPreview.emotionPhrase}」</div><div className="mt-3 text-sm font-black text-gray-900">{selectedEmotionPreview.name}</div><div className="mt-1 text-[10px] font-bold text-gray-500">{selectedEmotionPreview.target} / {selectedEmotionPreview.duration} / {selectedEmotionPreview.effectCategory}</div><div className="mt-2 text-[10px] leading-relaxed text-gray-600">{selectedEmotionPreview.description}</div></div></div></div>
          <div className="md:col-span-2"><label className="block font-bold text-gray-700 mb-1">カードに刻む一言（フレーバーテキスト）</label><textarea value={flavorText} onChange={(e) => setFlavorText(e.target.value)} rows={3} maxLength={120} placeholder={getEmotionFlavorText(activeEmotion)} className="w-full resize-none rounded-xl border bg-white px-3 py-2 focus:ring-2 focus:ring-purple-500" /><p className="mt-1 text-[10px] text-gray-500">選択した「想い」が初期値として入ります。自分の言葉に変えることもできます。この文章は対戦画面でも表示されます。</p></div>
          <div className="md:col-span-2"><label className="block font-bold text-gray-700 mb-1">編集・削除用の合言葉（パスワード） <span className="text-red-500">*</span></label><input type="password" placeholder="後からの編集・削除に使用します" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full rounded-lg border bg-white px-3 py-2 focus:ring-2 focus:ring-purple-500" /></div>
          <div className="pt-1 md:col-span-2"><button type="submit" disabled={isModerating} className="w-full rounded-2xl bg-purple-600 py-3 text-white font-black shadow transition hover:bg-purple-700 disabled:cursor-wait disabled:bg-purple-300">{isModerating ? '安全確認中…' : editingId ? 'エントリー内容を更新する' : 'この想いでサポートカードをエントリーして保存'}</button></div>
        </form>
      </div>
      <div className="pt-6 border-t border-gray-200 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h3 className="font-bold text-base text-gray-900">エントリーされたカード一覧</h3>
            <p className="text-[10px] text-gray-500 mt-1">登録したイメージカラーと一言もカード情報として保持されます。</p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-bold text-gray-600 flex-shrink-0">🔍 絞り込み:</span>
            <select value={filterTarget} onChange={(e) => setFilterTarget(e.target.value)} className="text-xs border rounded-lg px-2.5 py-1 bg-white font-bold text-purple-900 cursor-pointer">
              <option value="ALL">対象：すべて</option>
              <option value="自分">自分</option>
              <option value="相手">相手</option>
              <option value="自分・相手">自分・相手</option>
            </select>
            <select value={filterEffect} onChange={(e) => setFilterEffect(e.target.value)} className="text-xs border rounded-lg px-2.5 py-1 bg-white font-bold text-purple-900 cursor-pointer">
              <option value="ALL">効果：すべて</option>
              {Array.from(new Set(EMOTION_PRESETS.map((emotion) => emotion.effectCategory))).map((category) => (
                <option key={category} value={category}>{category}</option>
              ))}
            </select>
            <select value={filterDuration} onChange={(e) => setFilterDuration(e.target.value)} className="text-xs border rounded-lg px-2.5 py-1 bg-white font-bold text-purple-900 cursor-pointer">
              <option value="ALL">時間：すべて</option>
              <option value="一時">一時</option>
              <option value="永続">永続</option>
            </select>
            <select value={filterEmotionId} onChange={(e) => setFilterEmotionId(e.target.value)} className="text-xs border rounded-lg px-2.5 py-1 bg-white font-bold text-purple-900 cursor-pointer">
              <option value="all">エモーション：すべて</option>
              {EMOTION_PRESETS.map((emotion) => <option key={emotion.id} value={emotion.id}>{emotion.name}</option>)}
            </select>
          </div>
        </div>

        {filteredEntries.length === 0 ? (
          <p className="text-xs text-gray-500 py-4 text-center bg-gray-50 rounded-xl border border-dashed">
            {filterEmotionId === 'all'
              ? 'まだエントリーされたサポートカードはありません。'
              : '選択したエモーションのカードはまだありません。'}
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredEntries.map((entry) => {
              const isOwner = Boolean(entry.ownerToken && myTokens.includes(entry.ownerToken));
              const emotionInfo = EMOTION_PRESETS.find((emotion) => emotion.id === entry.presetId);
              const cardColor =
                entry.colorHex && /^#[0-9a-fA-F]{6}$/.test(entry.colorHex)
                  ? entry.colorHex
                  : getLegacyColorHex(entry.color);

              return (
                <div
                  key={entry.id}
                  className="p-4 border rounded-xl bg-gray-50 space-y-3 shadow-sm hover:shadow transition"
                  style={{ borderTopColor: cardColor, borderTopWidth: 4 }}
                >
                  <div className="flex items-center space-x-3 overflow-hidden">
                    <img
                      src={entry.imageDataUrl}
                      alt=""
                      className="w-12 h-12 rounded-lg object-cover flex-shrink-0 border"
                    />
                    <div className="truncate text-xs min-w-0">
                      <div className="font-bold text-gray-900 truncate">{entry.userName}</div>
                      <div className="text-[10px] text-purple-700 font-bold truncate">
                        ✨ {emotionInfo?.name || 'エモーション'}
                      </div>
                      <div className="text-[10px] text-gray-400 truncate">{entry.profileUrl}</div>
                    </div>
                  </div>

                  <div className="rounded-lg bg-white border border-gray-200 p-2">
                    <div className="h-1.5 rounded-full" style={{ backgroundColor: cardColor }} />
                    <div className="mt-1 text-[10px] font-bold text-gray-600">
                      イメージカラー {cardColor.toUpperCase()}
                    </div>
                    {entry.flavorText && (
                      <div className="mt-2 text-[10px] leading-relaxed text-gray-700 line-clamp-3">
                        💬 {entry.flavorText}
                      </div>
                    )}
                  </div>

                  <div className="flex justify-end space-x-1 text-xs">
                    {isOwner ? (
                      <>
                        <button
                          onClick={() => startEdit(entry)}
                          className="px-2.5 py-1 bg-purple-600 text-white rounded font-bold hover:bg-purple-700 cursor-pointer text-[11px]"
                        >
                          編集
                        </button>
                        <button
                          onClick={() => handleDelete(entry.id)}
                          className="px-2.5 py-1 bg-red-600 text-white rounded font-bold hover:bg-red-700 cursor-pointer text-[11px]"
                        >
                          削除
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => handleAuthenticate(entry)}
                        className="px-2.5 py-1 bg-gray-700 text-white rounded font-bold hover:bg-gray-800 cursor-pointer text-[10px]"
                      >
                        🔑 所持者認証
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
