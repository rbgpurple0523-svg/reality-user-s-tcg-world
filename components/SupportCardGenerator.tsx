'use client';

import React, { useState, useEffect, ChangeEvent, FormEvent } from 'react';
import { EmotionPreset, EMOTION_PRESETS } from './emotionPresets';
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

export default function SupportCardGenerator({ selectedEmotion, onBackToHub }: SupportCardGeneratorProps) {
  const [selectedEmotionId, setSelectedEmotionId] = useState<string>(
    selectedEmotion?.id || EMOTION_PRESETS[0]?.id || '',
  );

  const [pickerSearch, setPickerSearch] = useState('');
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
  const [flavorText, setFlavorText] = useState('');
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
          setFlavorText(draft.flavorText || '');
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
    setFlavorText('');
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
        emotion.description.toLowerCase().includes(query);
      if (!matches) return false;
    }
    if (pickerTarget !== 'ALL' && emotion.target !== pickerTarget) return false;
    if (pickerEffect !== 'ALL' && emotion.effectCategory !== pickerEffect) return false;
    if (pickerDuration !== 'ALL' && emotion.duration !== pickerDuration) return false;
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
            ← 一覧に戻る
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div className="space-y-5">
          {errorMessage && (
            <div className="p-3 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg" role="alert">
              {errorMessage}
            </div>
          )}
          {successMessage && (
            <div className="p-3 text-xs text-green-700 bg-green-50 border border-green-200 rounded-lg">
              {successMessage}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4 text-xs">
            <div>
              <label className="block font-bold text-gray-700 mb-1">
                REALITY プロフURL <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                placeholder="https://reality.app/user/xxxxxx"
                value={profileUrl}
                onChange={(e) => setProfileUrl(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-purple-500 bg-white"
              />
            </div>

            <div>
              <label className="block font-bold text-gray-700 mb-1">
                アバター名 <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                placeholder="例: サポート太郎"
                value={userName}
                onChange={(e) => setUserName(e.target.value)}
                maxLength={40}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-purple-500 bg-white"
              />
            </div>

            <div>
              <label className="block font-bold text-gray-700 mb-1">
                アバター画像 <span className="text-red-500">*</span>
              </label>
              <input
                type="file"
                accept="image/*"
                onChange={handleImageUpload}
                className="w-full text-gray-700 file:mr-2 file:py-1.5 file:px-3 file:rounded file:border-0 file:text-xs file:font-semibold file:bg-purple-50 file:text-purple-700 hover:file:bg-purple-100 cursor-pointer"
              />
            </div>

            <div className="pt-2 border-t border-gray-100 space-y-3">
              <div>
                <label className="block font-bold text-purple-900 mb-1">
                  ✨ 自分の思いと重なるエモーションを選ぶ <span className="text-red-500">*</span>
                </label>
                <p className="text-[10px] text-gray-500 leading-relaxed">
                  公式エモーションの性能は固定です。ここでは「自分が大切にしたい思い」に近いものを1つ選びます。
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <input
                  type="text"
                  value={pickerSearch}
                  onChange={(e) => setPickerSearch(e.target.value)}
                  placeholder="エモーション名や説明を検索"
                  className="w-full px-3 py-2 border rounded-lg bg-white"
                />
                <select
                  value={pickerTarget}
                  onChange={(e) => setPickerTarget(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg bg-white font-bold text-purple-900"
                >
                  <option value="ALL">対象：すべて</option>
                  <option value="自分">自分</option>
                  <option value="相手">相手</option>
                  <option value="自分・相手">自分・相手</option>
                </select>
                <select
                  value={pickerEffect}
                  onChange={(e) => setPickerEffect(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg bg-white font-bold text-purple-900"
                >
                  <option value="ALL">効果：すべて</option>
                  {Array.from(new Set(EMOTION_PRESETS.map((emotion) => emotion.effectCategory))).map((category) => (
                    <option key={category} value={category}>{category}</option>
                  ))}
                </select>
                <select
                  value={pickerDuration}
                  onChange={(e) => setPickerDuration(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg bg-white font-bold text-purple-900"
                >
                  <option value="ALL">時間：すべて</option>
                  <option value="一時">一時</option>
                  <option value="永続">永続</option>
                </select>
              </div>

              <div className="max-h-[360px] overflow-y-auto rounded-xl border border-purple-100 bg-purple-50/40 p-2 space-y-2">
                {pickerEmotions.length === 0 ? (
                  <div className="py-6 text-center text-xs font-bold text-gray-500">
                    条件に一致するエモーションがありません。
                  </div>
                ) : (
                  pickerEmotions.map((emotion) => {
                    const selected = emotion.id === selectedEmotionPreview.id;
                    return (
                      <button
                        key={emotion.id}
                        type="button"
                        onClick={() => handleEmotionChange(emotion)}
                        className={`w-full rounded-xl border p-3 text-left transition ${selected ? 'border-purple-500 bg-purple-100 ring-2 ring-purple-200' : 'border-white bg-white hover:border-purple-300'}`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="font-black text-purple-950">
                              {selected ? '✓ ' : ''}{emotion.name}
                            </div>
                            <div className="mt-0.5 text-[10px] font-bold text-gray-500">
                              {emotion.target} / {emotion.duration} / {emotion.effectCategory}
                            </div>
                            <div className="mt-1 text-[11px] leading-relaxed text-gray-700">
                              {emotion.description}
                            </div>
                          </div>
                          <div className="shrink-0 rounded-lg bg-purple-50 px-2 py-1 text-[9px] font-black text-purple-800">
                            {emotion.statEffect}{emotion.effectAmount ? ` ${emotion.effectAmount}` : ''}
                          </div>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>

              <div className="rounded-xl border border-purple-200 bg-white p-3">
                <div className="text-[10px] font-black text-purple-700">選択中のエモーション</div>
                <div className="mt-1 text-base font-black text-purple-950">
                  {selectedEmotionPreview.name}
                </div>
                <div className="mt-1 text-[10px] font-bold text-gray-500">
                  {selectedEmotionPreview.target} / {selectedEmotionPreview.duration} / {selectedEmotionPreview.effectCategory}
                </div>
                <p className="mt-2 text-[11px] leading-relaxed text-gray-700">
                  {selectedEmotionPreview.description}
                </p>
                {selectedEmotionPreview.note && (
                  <p className="mt-1 text-[10px] leading-relaxed text-gray-500">
                    備考：{selectedEmotionPreview.note}
                  </p>
                )}
              </div>
            </div>

            <div className="pt-2 border-t border-gray-100 space-y-3">
              <div>
                <label className="block font-bold text-gray-700 mb-1">イメージカラー</label>
                <p className="text-[10px] text-gray-500">
                  カードの雰囲気を表す色です。ゲーム用のカラータイプは選んだ色から自動判定されます。
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                {COLOR_PALETTE.map((color) => (
                  <button
                    key={color}
                    type="button"
                    onClick={() => handleColorChange(color)}
                    aria-label={`カラー ${color}`}
                    className={`h-8 w-8 rounded-full border-2 transition ${selectedColorHex.toUpperCase() === color.toUpperCase() ? 'border-gray-900 ring-2 ring-offset-1 ring-gray-300' : 'border-white shadow-sm'}`}
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center gap-3 rounded-xl border border-gray-200 bg-gray-50 p-3">
                <input
                  type="color"
                  value={selectedColorHex}
                  onChange={(e) => handleColorChange(e.target.value)}
                  aria-label="自由な色を選択"
                  className="h-12 w-16 cursor-pointer rounded-lg border border-gray-300 bg-white p-1"
                />
                <div>
                  <div className="text-[11px] font-black text-gray-700">自由な色を選択</div>
                  <div className="text-[10px] text-gray-500">
                    HEX {selectedColorHex.toUpperCase()} / {getColorTypeLabel(selectedColorType)}
                  </div>
                </div>
              </div>
            </div>

            <div className="pt-2 border-t border-gray-100">
              <label className="block font-bold text-gray-700 mb-1">
                効果名称設定（1つ・変更可能） <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={effectName}
                onChange={(e) => setEffectName(e.target.value)}
                maxLength={40}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-purple-500 bg-white font-bold text-purple-900"
              />
            </div>

            <div className="pt-2 border-t border-gray-100">
              <label className="block font-bold text-gray-700 mb-1">
                カードの一言（フレーバーテキスト）
              </label>
              <textarea
                value={flavorText}
                onChange={(e) => setFlavorText(e.target.value)}
                rows={3}
                maxLength={120}
                placeholder="このサポートカードに込めた思いを、一言でどうぞ。"
                className="w-full px-3 py-2 border rounded-lg bg-white resize-none focus:ring-2 focus:ring-purple-500"
              />
              <p className="text-[10px] text-gray-500 mt-1">
                この一言は対戦画面でも表示されます。最大120文字。
              </p>
            </div>

            <div className="pt-2 border-t border-gray-100">
              <label className="block font-bold text-gray-700 mb-1">
                編集・削除用の合言葉（パスワード） <span className="text-red-500">*</span>
              </label>
              <input
                type="password"
                placeholder="後からの編集・削除に使用します"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-purple-500 bg-white"
              />
            </div>

            <div className="pt-4">
              <button
                type="submit"
                disabled={isModerating}
                className="w-full py-2.5 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-300 disabled:cursor-wait text-white font-bold rounded-xl transition cursor-pointer shadow"
              >
                {isModerating ? '安全確認中…' : editingId ? 'エントリー内容を更新する' : 'カードをエントリーして保存'}
              </button>
            </div>
          </form>
        </div>

        <div>
          <h2 className="text-lg font-bold text-gray-900 mb-3">ライブプレビュー</h2>
          <div className="p-4 border-4 rounded-2xl bg-white shadow-md max-w-sm mx-auto space-y-3" style={{ borderColor: selectedColorHex }}>
            <div className="flex justify-between items-center">
              <span className="font-bold px-2.5 py-1 rounded text-white text-xs bg-purple-600">
                サポートカード
              </span>
              <span className="text-xs font-bold text-gray-700">
                {selectedEmotionPreview.target} / {selectedEmotionPreview.duration}
              </span>
            </div>

            <div className="text-center">
              <h3 className="font-extrabold text-gray-900 text-lg">
                {userName || 'ユーザー名'}
              </h3>
              <p className="text-xs font-semibold mt-0.5" style={{ color: selectedColorHex }}>
                ✨ {selectedEmotionPreview.name}
              </p>
            </div>

            <div className="w-full h-48 bg-gray-100 border border-gray-200 rounded-xl overflow-hidden flex items-center justify-center">
              {imageDataUrl ? (
                <img src={imageDataUrl} alt="Avatar" className="w-full h-full object-cover" />
              ) : (
                <span className="text-gray-400 text-xs font-medium">画像を選択すると表示されます</span>
              )}
            </div>

            {profileUrl && (
              <div className="text-[10px] text-indigo-600 truncate px-2 text-center">
                🔗{' '}
                <a
                  href={profileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline hover:text-indigo-800"
                >
                  {profileUrl}
                </a>
              </div>
            )}

            <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
              <div className="h-2 rounded-full" style={{ backgroundColor: selectedColorHex }} />
              <div className="mt-2 flex items-center justify-between gap-3 text-[10px]">
                <span className="font-bold text-gray-600">イメージカラー {selectedColorHex.toUpperCase()}</span>
                <span className="font-black text-gray-900">{getColorTypeLabel(selectedColorType)}</span>
              </div>
            </div>

            <div className="text-xs bg-purple-50 border border-purple-100 p-2.5 rounded-lg space-y-1">
              <div className="font-bold text-purple-900 border-b border-purple-200 pb-1 flex justify-between">
                <span>🛡️ 効果仕様</span>
                <span className="text-purple-700">
                  {selectedEmotionPreview.statEffect} {selectedEmotionPreview.effectAmount ? `(${selectedEmotionPreview.effectAmount})` : ''} / {selectedEmotionPreview.duration}
                </span>
              </div>
              <p className="text-[11px] text-gray-700 leading-relaxed">
                {selectedEmotionPreview.description}
              </p>
              {selectedEmotionPreview.note && (
                <p className="text-[10px] text-gray-500 leading-relaxed">備考：{selectedEmotionPreview.note}</p>
              )}
            </div>

            <div className="text-xs bg-white border border-gray-200 p-2.5 rounded-lg space-y-1">
              <div className="font-bold text-gray-800 border-b border-gray-200 pb-1 mb-1">
                ⚡ 設定効果名称
              </div>
              <div className="text-purple-700 font-bold">
                {effectName || '名称未設定'}
              </div>
            </div>

            <div className="text-xs bg-gray-50 border border-gray-200 p-2.5 rounded-lg">
              <div className="font-bold text-gray-800 mb-1">💬 フレーバーテキスト</div>
              <p className="text-[11px] leading-relaxed text-gray-700 whitespace-pre-wrap">
                {flavorText || 'ここにカードの一言が表示されます。'}
              </p>
            </div>
          </div>
        </div>
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
