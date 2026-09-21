'use client';

import React, { ChangeEvent, FormEvent, useEffect, useMemo, useState } from 'react';
import { CoordinatePreset, COORDINATE_PRESETS, EntryRecord } from './EntryHub';
import { EMOTION_PRESETS } from './emotionPresets';
import CoordinateRadialMap from './CoordinateRadialMap';

interface CardGeneratorProps {
  selectedCoordinate?: CoordinatePreset | null;
  onBackToHub?: () => void;
}

const ENTRIES_KEY = 'reality_world_entries';
const TOKEN_KEY = 'reality_world_creator_tokens';
const DRAFT_KEY = 'reality_world_coordinate_draft';

type DraftData = {
  profileUrl: string;
  userName: string;
  imageDataUrl: string;
  password: string;
  selectedCoordinateId: string | null;
  customSkills: [string, string, string, string];
  skillVoices?: [string, string, string, string];
  flavorText?: string;
};

const emptySkills: [string, string, string, string] = ['', '', '', ''];
const emptySkillVoices: [string, string, string, string] = ['', '', '', ''];

function getDefaultSkillVoice(skillName: string): string {
  return `『${skillName}』！`;
}

function getStoredEntries(): EntryRecord[] {
  try {
    const saved = localStorage.getItem(ENTRIES_KEY);
    return saved ? JSON.parse(saved) : [];
  } catch {
    return [];
  }
}

function getCreatorTokens(): Record<string, string> {
  try {
    const saved = localStorage.getItem(TOKEN_KEY);
    return saved ? JSON.parse(saved) : {};
  } catch {
    return {};
  }
}

function makeCreatorToken(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

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

function getMaxEntryLimit(entries: EntryRecord[]): number {
  const allPresets = [...COORDINATE_PRESETS, ...EMOTION_PRESETS];
  const getEntryCount = (presetId: string) =>
    entries.filter((entry) => entry.presetId === presetId).length;

  const filledPresetCount = allPresets.filter(
    (preset) => getEntryCount(preset.id) >= 1,
  ).length;
  const countAtLeastTwo = allPresets.filter(
    (preset) => getEntryCount(preset.id) >= 2,
  ).length;
  const totalPossibleSlots = Math.max(1, allPresets.length);
  const countAtLeastOneRate = filledPresetCount / totalPossibleSlots;
  const countAtLeastTwoRate = countAtLeastTwo / totalPossibleSlots;

  return countAtLeastOneRate >= 0.9 && countAtLeastTwoRate >= 0.5
    ? 3
    : countAtLeastOneRate >= 0.5
      ? 2
      : 1;
}

export default function CardGenerator({ selectedCoordinate, onBackToHub }: CardGeneratorProps) {
  // ---------------------------------------------------------
  // コーデ選択
  // 未選択状態を許容。EntryHubから来た場合だけ初期選択される。
  // ---------------------------------------------------------
  const [currentCoordinate, setCurrentCoordinate] = useState<CoordinatePreset | null>(selectedCoordinate ?? null);

  useEffect(() => {
    setCurrentCoordinate(selectedCoordinate ?? null);
    if (selectedCoordinate) {
      setCustomSkills([
        selectedCoordinate.defaultSkills[0],
        selectedCoordinate.defaultSkills[1],
        selectedCoordinate.defaultSkills[2],
        selectedCoordinate.defaultSkills[3],
      ]);
      setSkillVoices([
        getDefaultSkillVoice(selectedCoordinate.defaultSkills[0]),
        getDefaultSkillVoice(selectedCoordinate.defaultSkills[1]),
        getDefaultSkillVoice(selectedCoordinate.defaultSkills[2]),
        getDefaultSkillVoice(selectedCoordinate.defaultSkills[3]),
      ]);
      setFlavorText('');
    }
  }, [selectedCoordinate]);

  // ---------------------------------------------------------
  // フォーム
  // ---------------------------------------------------------
  const [profileUrl, setProfileUrl] = useState('');
  const [userName, setUserName] = useState('');
  const [imageDataUrl, setImageDataUrl] = useState('');
  const [password, setPassword] = useState('');
  const [customSkills, setCustomSkills] = useState<[string, string, string, string]>(emptySkills);
  const [skillVoices, setSkillVoices] = useState<[string, string, string, string]>(emptySkillVoices);
  const [flavorText, setFlavorText] = useState('');

  const [entries, setEntries] = useState<EntryRecord[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [creatorTokens, setCreatorTokens] = useState<Record<string, string>>({});
  const [authorizedIds, setAuthorizedIds] = useState<Record<string, boolean>>({});

  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [draftAvailable, setDraftAvailable] = useState(false);
  const [draftChecked, setDraftChecked] = useState(false);
  const [isModerating, setIsModerating] = useState(false);

  const maxEntryLimit = useMemo(
    () => getMaxEntryLimit(entries),
    [entries],
  );

  useEffect(() => {
    const loadedEntries = getStoredEntries();
    const tokens = getCreatorTokens();
    setEntries(loadedEntries);
    setCreatorTokens(tokens);

    try {
      setDraftAvailable(Boolean(localStorage.getItem(DRAFT_KEY)));
    } catch {
      setDraftAvailable(false);
    }
    setDraftChecked(true);
  }, []);

  // ---------------------------------------------------------
  // draft：入力変更ごとに自動保存
  // ---------------------------------------------------------
  useEffect(() => {
    if (!draftChecked) return;
    // 完全な空フォームはdraftとして残さない。
    const hasDraft =
      Boolean(profileUrl) ||
      Boolean(userName) ||
      Boolean(imageDataUrl) ||
      Boolean(password) ||
      Boolean(currentCoordinate) ||
      customSkills.some(Boolean) ||
      skillVoices.some(Boolean) ||
      Boolean(flavorText);

    try {
      if (!hasDraft) {
        localStorage.removeItem(DRAFT_KEY);
        setDraftAvailable(false);
        return;
      }

      const draft: DraftData = {
        profileUrl,
        userName,
        imageDataUrl,
        password,
        selectedCoordinateId: currentCoordinate?.id ?? null,
        customSkills,
        skillVoices,
        flavorText,
      };
      localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
      setDraftAvailable(true);
    } catch {
      // localStorageが利用できない場合も入力自体は継続可能。
    }
  }, [profileUrl, userName, imageDataUrl, password, currentCoordinate, customSkills, skillVoices, flavorText, draftChecked]);

  const restoreDraft = () => {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (!raw) return;
      const draft = JSON.parse(raw) as DraftData;
      const preset = draft.selectedCoordinateId
        ? COORDINATE_PRESETS.find((item) => item.id === draft.selectedCoordinateId) ?? null
        : null;
      setProfileUrl(draft.profileUrl ?? '');
      setUserName(draft.userName ?? '');
      setImageDataUrl(draft.imageDataUrl ?? '');
      setPassword(draft.password ?? '');
      setCurrentCoordinate(preset);
      const restoredSkills: [string, string, string, string] =
        draft.customSkills?.length === 4
          ? [draft.customSkills[0], draft.customSkills[1], draft.customSkills[2], draft.customSkills[3]]
          : preset?.defaultSkills ?? emptySkills;
      setCustomSkills(restoredSkills);
      setSkillVoices(
        draft.skillVoices?.length === 4
          ? [draft.skillVoices[0], draft.skillVoices[1], draft.skillVoices[2], draft.skillVoices[3]]
          : [
              getDefaultSkillVoice(restoredSkills[0] || preset?.defaultSkills[0] || '技1'),
              getDefaultSkillVoice(restoredSkills[1] || preset?.defaultSkills[1] || '技2'),
              getDefaultSkillVoice(restoredSkills[2] || preset?.defaultSkills[2] || '技3'),
              getDefaultSkillVoice(restoredSkills[3] || preset?.defaultSkills[3] || '技4'),
            ],
      );
      setFlavorText(draft.flavorText ?? '');
      setDraftAvailable(false);
      setSuccessMessage('前回の続きから復元しました。');
      setTimeout(() => setSuccessMessage(''), 2000);
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

  // ---------------------------------------------------------
  // コーデ選択
  // ---------------------------------------------------------
  const selectCoordinatePreset = (preset: CoordinatePreset) => {
    setCurrentCoordinate(preset);
    setCustomSkills([
      preset.defaultSkills[0],
      preset.defaultSkills[1],
      preset.defaultSkills[2],
      preset.defaultSkills[3],
    ]);
    setSkillVoices([
      getDefaultSkillVoice(preset.defaultSkills[0]),
      getDefaultSkillVoice(preset.defaultSkills[1]),
      getDefaultSkillVoice(preset.defaultSkills[2]),
      getDefaultSkillVoice(preset.defaultSkills[3]),
    ]);
    setErrorMessage('');
  };

  const handleImageUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setImageDataUrl(reader.result as string);
    reader.readAsDataURL(file);
  };

  const handleSkillChange = (index: number, value: string) => {
    const previousSkill = customSkills[index];
    setCustomSkills((prev) => {
      const next = [...prev] as [string, string, string, string];
      next[index] = value;
      return next;
    });
    setSkillVoices((prev) => {
      const next = [...prev] as [string, string, string, string];
      if (next[index] === getDefaultSkillVoice(previousSkill)) {
        next[index] = getDefaultSkillVoice(value || `技${index + 1}`);
      }
      return next;
    });
  };

  const handleSkillVoiceChange = (index: number, value: string) => {
    setSkillVoices((prev) => {
      const next = [...prev] as [string, string, string, string];
      next[index] = value;
      return next;
    });
  };

  // ---------------------------------------------------------
  // 保存
  // ---------------------------------------------------------
  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setErrorMessage('');

    if (!currentCoordinate) {
      setErrorMessage('コーデを1つ選択してください。');
      return;
    }

    const currentCoordinateCount = entries.filter(
      (entry) => entry.presetId === currentCoordinate.id,
    ).length;
    const editingKeepsCurrentCoordinate = Boolean(
      editingId &&
        entries.some(
          (entry) => entry.id === editingId && entry.presetId === currentCoordinate.id,
        ),
    );

    if (currentCoordinateCount >= maxEntryLimit && !editingKeepsCurrentCoordinate) {
      setErrorMessage('このコーデは現在エントリー上限に達しています。別のコーデを選択してください。');
      return;
    }
    if (!profileUrl.includes('reality.app/user/')) {
      setErrorMessage('有効なREALITYプロフURLを入力してください。');
      return;
    }
    if (!userName.trim() || !imageDataUrl || !password.trim() || customSkills.some((skill) => !skill.trim())) {
      setErrorMessage('必須項目をすべて入力してください。');
      return;
    }

    const moderationTexts = [
      userName.trim(),
      ...customSkills.map((skill) => skill.trim()),
      ...skillVoices.map((voice) => voice.trim()),
      flavorText.trim(),
    ];

    setIsModerating(true);

    try {
      const moderationResult = await moderateCardTexts(moderationTexts);

      if (!moderationResult.allowed) {
        setIsModerating(false);

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
      setIsModerating(false);
      setErrorMessage('入力内容を安全確認できなかったため、保存していません。もう一度お試しください。');
      return;
    }

    setIsModerating(false);

    const currentEntries = getStoredEntries();
    const editingEntry = editingId ? currentEntries.find((entry) => entry.id === editingId) : null;

    // 新規作成時だけcreator tokenを発行。編集時は既存tokenを維持。
    let creatorToken = editingEntry ? creatorTokens[editingEntry.id] : undefined;
    if (!creatorToken) creatorToken = makeCreatorToken();

    const now = new Date().toISOString();
    const normalizedCustomSkills: [string, string, string, string] = [
      customSkills[0].trim(),
      customSkills[1].trim(),
      customSkills[2].trim(),
      customSkills[3].trim(),
    ];

    const normalizedSkillVoices: [string, string, string, string] = [
      skillVoices[0].trim() || getDefaultSkillVoice(normalizedCustomSkills[0]),
      skillVoices[1].trim() || getDefaultSkillVoice(normalizedCustomSkills[1]),
      skillVoices[2].trim() || getDefaultSkillVoice(normalizedCustomSkills[2]),
      skillVoices[3].trim() || getDefaultSkillVoice(normalizedCustomSkills[3]),
    ];

    const newEntry: EntryRecord = {
      id: editingId || `entry_${Date.now()}`,
      presetId: currentCoordinate.id,
      cardType: 'coordinate',
      profileUrl: profileUrl.trim(),
      userName: userName.trim(),
      imageDataUrl,
      // 既存データ形式との互換性を優先し、現時点では入力された合言葉を保持。
      passwordHash: password,
      firstUser: editingEntry?.firstUser || userName.trim(),
      customSkills: normalizedCustomSkills,
      skillVoices: normalizedSkillVoices,
      flavorText: flavorText.trim(),
      createdAt: editingEntry?.createdAt || now,
      updatedAt: now,
    };

    const updated = editingId
      ? currentEntries.map((entry) => (entry.id === editingId ? newEntry : entry))
      : [newEntry, ...currentEntries];

    try {
      localStorage.setItem(ENTRIES_KEY, JSON.stringify(updated));
      const nextTokens = { ...getCreatorTokens(), [newEntry.id]: creatorToken };
      localStorage.setItem(TOKEN_KEY, JSON.stringify(nextTokens));
      setCreatorTokens(nextTokens);
    } catch {
      setErrorMessage('保存に失敗しました。ブラウザの保存領域を確認してください。');
      return;
    }

    setEntries(updated);
    setAuthorizedIds((prev) => ({ ...prev, [newEntry.id]: true }));
    setEditingId(null);
    setSuccessMessage(editingEntry ? '✨ キャラカードを更新しました！' : '✨ キャラカードをエントリーしました！');

    try {
      localStorage.removeItem(DRAFT_KEY);
    } catch {}
    setDraftAvailable(false);
    setTimeout(() => setSuccessMessage(''), 2500);
  };

  // ---------------------------------------------------------
  // 所有者認証：同端末はtokenで自動、別端末はpassword
  // ---------------------------------------------------------
  const authorizeEntry = (entry: EntryRecord): boolean => {
    if (authorizedIds[entry.id]) return true;

    const tokens = getCreatorTokens();
    if (tokens[entry.id]) {
      setAuthorizedIds((prev) => ({ ...prev, [entry.id]: true }));
      return true;
    }

    const inputPass = window.prompt('このカードの所持者ですか？\n作成時に設定した合言葉を入力してください。');
    if (inputPass === entry.passwordHash) {
      setAuthorizedIds((prev) => ({ ...prev, [entry.id]: true }));
      alert('認証されました。「編集」「削除」ができます。');
      return true;
    }

    alert('合言葉が一致しません。');
    return false;
  };

  const handleEdit = (entry: EntryRecord) => {
    if (!authorizeEntry(entry)) return;

    const preset = COORDINATE_PRESETS.find((item) => item.id === entry.presetId) ?? null;
    setCurrentCoordinate(preset);
    setProfileUrl(entry.profileUrl);
    setUserName(entry.userName);
    setImageDataUrl(entry.imageDataUrl);
    setPassword(entry.passwordHash);
    const restoredSkills: [string, string, string, string] =
      entry.customSkills?.length === 4
        ? [entry.customSkills[0], entry.customSkills[1], entry.customSkills[2], entry.customSkills[3]]
        : preset?.defaultSkills ?? emptySkills;
    setCustomSkills(restoredSkills);
    setSkillVoices(
      entry.skillVoices?.length === 4
        ? [entry.skillVoices[0], entry.skillVoices[1], entry.skillVoices[2], entry.skillVoices[3]]
        : [
            getDefaultSkillVoice(restoredSkills[0] || preset?.defaultSkills[0] || '技1'),
            getDefaultSkillVoice(restoredSkills[1] || preset?.defaultSkills[1] || '技2'),
            getDefaultSkillVoice(restoredSkills[2] || preset?.defaultSkills[2] || '技3'),
            getDefaultSkillVoice(restoredSkills[3] || preset?.defaultSkills[3] || '技4'),
          ],
    );
    setFlavorText(entry.flavorText ?? '');
    setEditingId(entry.id);
    setErrorMessage('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDelete = (entry: EntryRecord) => {
    if (!authorizeEntry(entry)) return;
    if (!window.confirm('本当にこのエントリーを削除しますか？')) return;

    const updated = entries.filter((item) => item.id !== entry.id);
    setEntries(updated);
    try {
      localStorage.setItem(ENTRIES_KEY, JSON.stringify(updated));
      const tokens = getCreatorTokens();
      delete tokens[entry.id];
      localStorage.setItem(TOKEN_KEY, JSON.stringify(tokens));
      setCreatorTokens(tokens);
    } catch {}

    setAuthorizedIds((prev) => {
      const next = { ...prev };
      delete next[entry.id];
      return next;
    });
    if (editingId === entry.id) setEditingId(null);
  };

  return (
    <div className="max-w-5xl mx-auto p-6 bg-white rounded-2xl border border-gray-200 shadow-lg space-y-8 text-gray-900">
      <div className="flex justify-between items-center border-b pb-4 gap-4">
        <div>
          <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-pink-100 text-pink-800">1-1 キャラカードとしてエントリー</span>
          <h2 className="text-xl font-extrabold mt-2">キャラカード・アバターエントリー</h2>
          <p className="text-xs text-gray-500 mt-1">コーデは公式25種から選択。性能と4技の効果は固定です。</p>
        </div>
        {onBackToHub && (
          <button type="button" onClick={onBackToHub} className="text-xs font-bold px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg">
            ← 一覧に戻る
          </button>
        )}
      </div>

      {draftAvailable && !editingId && (
        <div className="p-4 rounded-xl border border-amber-200 bg-amber-50 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div>
            <div className="font-bold text-amber-900">前回の続きが保存されています</div>
            <div className="text-amber-800 mt-0.5">入力中だった内容を復元できます。</div>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={restoreDraft} className="px-3 py-2 rounded-lg bg-amber-600 text-white font-bold">続きから作成する</button>
            <button type="button" onClick={discardDraft} className="px-3 py-2 rounded-lg bg-white border border-amber-300 font-bold text-amber-900">破棄</button>
          </div>
        </div>
      )}

      {errorMessage && <div className="p-3 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg">{errorMessage}</div>}
      {successMessage && <div className="p-3 text-xs text-green-700 bg-green-50 border border-green-200 rounded-lg">{successMessage}</div>}

      <CoordinateRadialMap
        coordinates={COORDINATE_PRESETS}
        entries={entries}
        maxEntryLimit={maxEntryLimit}
        initialSelectedId={currentCoordinate?.id ?? null}
        mode="picker"
        onSelect={selectCoordinatePreset}
      />

      {!currentCoordinate && (
        <div className="text-[11px] text-red-600 font-bold text-center -mt-2">
          コーデを選択すると、性能と4技がプレビューに反映されます。
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* 入力 */}
        <div className="space-y-5">
          <form onSubmit={handleSubmit} className="space-y-4 text-xs">
            <div>
              <label className="block font-bold text-gray-700 mb-1">REALITY プロフURL <span className="text-red-500">*</span></label>
              <input type="text" placeholder="https://reality.app/user/xxxxxx" value={profileUrl} onChange={(e) => setProfileUrl(e.target.value)} className="w-full px-3 py-2 border rounded-lg bg-white" />
            </div>

            <div>
              <label className="block font-bold text-gray-700 mb-1">アバター名 <span className="text-red-500">*</span></label>
              <input type="text" placeholder="例：キャラ太郎" value={userName} onChange={(e) => setUserName(e.target.value)} maxLength={40} className="w-full px-3 py-2 border rounded-lg bg-white" />
            </div>

            <div>
              <label className="block font-bold text-gray-700 mb-1">アバター画像 <span className="text-red-500">*</span></label>
              <input type="file" accept="image/*" onChange={handleImageUpload} className="w-full text-gray-700" />
            </div>

            <div className="pt-3 border-t border-gray-100 space-y-4">
              <div>
                <label className="block font-bold text-gray-700">所持ワザ設定（4つ） <span className="text-red-500">*</span></label>
                <p className="text-[10px] text-gray-500 mt-1">技名は変更できます。使用時のセリフは技名に合わせたデフォルトが入り、自由に変更できます。</p>
              </div>
              {[0, 1, 2, 3].map((index) => (
                <div key={index} className="rounded-xl border border-pink-100 bg-pink-50/40 p-3 space-y-2">
                  <div className="font-bold text-pink-700">技{index + 1}</div>
                  <div>
                    <label className="block text-[10px] font-bold text-gray-600 mb-1">技名</label>
                    <input disabled={!currentCoordinate} type="text" value={customSkills[index]} onChange={(e) => handleSkillChange(index, e.target.value)} maxLength={40} className="w-full px-3 py-2 border rounded-lg bg-white disabled:bg-gray-100" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-gray-600 mb-1">使用時のセリフ</label>
                    <input disabled={!currentCoordinate} type="text" value={skillVoices[index]} onChange={(e) => handleSkillVoiceChange(index, e.target.value)} maxLength={100} className="w-full px-3 py-2 border rounded-lg bg-white disabled:bg-gray-100" placeholder={currentCoordinate ? getDefaultSkillVoice(customSkills[index] || `技${index + 1}`) : ''} />
                  </div>
                  <div className="rounded-lg bg-white/80 border border-gray-100 px-3 py-2">
                    <div className="text-[10px] font-bold text-gray-500 mb-0.5">効果説明（固定）</div>
                    <div className="text-[11px] text-gray-600 leading-relaxed">{currentCoordinate?.skillDescriptions[index] ?? 'コーデを選択すると表示されます。'}</div>
                  </div>
                </div>
              ))}
            </div>

            <div className="pt-3 border-t border-gray-100">
              <label className="block font-bold text-gray-700 mb-1">カードの一言（フレーバーテキスト）</label>
              <textarea value={flavorText} onChange={(e) => setFlavorText(e.target.value)} rows={3} maxLength={120} placeholder="このキャラらしい一言をどうぞ。" className="w-full px-3 py-2 border rounded-lg bg-white resize-none" />
              <p className="text-[10px] text-gray-500 mt-1">キャラクターの雰囲気や個性が伝わる一言です。最大120文字。</p>
            </div>

            <div className="pt-3 border-t border-gray-100">
              <label className="block font-bold text-gray-700 mb-1">編集・削除用の合言葉 <span className="text-red-500">*</span></label>
              <input type="password" placeholder="後からの編集・削除に使用します" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full px-3 py-2 border rounded-lg bg-white" />
              <p className="text-[10px] text-gray-500 mt-1">同じ端末では作成者トークンにより、次回から合言葉入力を省略できます。</p>
            </div>

            {errorMessage && (
              <div className="p-3 rounded-lg border border-red-200 bg-red-50 text-xs font-bold text-red-700" role="alert">
                {errorMessage}
              </div>
            )}

            <button type="submit" disabled={isModerating} className="w-full py-2.5 bg-pink-600 hover:bg-pink-700 disabled:bg-pink-300 disabled:cursor-wait text-white font-bold rounded-xl shadow">
              {isModerating ? '安全確認中…' : editingId ? 'エントリー内容を更新する' : 'カードをエントリーして保存'}
            </button>
          </form>
        </div>

        {/* プレビュー */}
        <div>
          <h2 className="text-lg font-bold mb-3">ライブプレビュー</h2>
          <div className="p-4 border-4 border-pink-400 rounded-2xl bg-white shadow-md max-w-sm mx-auto space-y-3">
            {!currentCoordinate ? (
              <div className="min-h-96 flex flex-col items-center justify-center text-center text-gray-400 text-xs gap-2">
                <div className="text-4xl">👗</div>
                <div className="font-bold">コーデ未選択</div>
                <div>左側からコーデを選択してください。</div>
              </div>
            ) : (
              <>
                <div className="flex justify-between items-center">
                  <span className="font-bold px-2.5 py-1 rounded bg-pink-600 text-white text-xs">{currentCoordinate.code.toUpperCase()}</span>
                  <span className="text-xs font-bold text-gray-700">{currentCoordinate.archetype}</span>
                </div>

                <div className="text-center">
                  <h3 className="font-extrabold text-gray-900 text-xl">{userName || 'ユーザー名'}</h3>
                  <p className="text-xs font-semibold text-pink-600 mt-0.5">👗 {currentCoordinate.name}</p>
                </div>

                <div className="w-full h-64 bg-gray-100 border border-gray-200 rounded-xl overflow-hidden flex items-center justify-center">
                  {imageDataUrl ? <img src={imageDataUrl} alt="Avatar" className="w-full h-full object-cover" /> : <span className="text-gray-400 text-xs">画像を選択すると表示されます</span>}
                </div>

                {profileUrl && (
                  <div className="text-[10px] text-indigo-600 truncate px-2 text-center">
                    🔗 <a href={profileUrl} target="_blank" rel="noopener noreferrer" className="underline">{profileUrl}</a>
                  </div>
                )}

                <div className="text-xs bg-gray-50 border p-3 rounded-lg grid grid-cols-2 gap-2">
                  <div>体力：<b>{currentCoordinate.stats.hp}</b></div>
                  <div>知略：<b>{currentCoordinate.stats.intellect}</b></div>
                  <div>特技：<b>{currentCoordinate.stats.charm}</b></div>
                  <div>器用：<b>{currentCoordinate.stats.dexterity}</b></div>
                </div>

                <div className="text-xs bg-pink-50 border border-pink-100 p-3 rounded-lg space-y-3">
                  <div className="font-bold text-pink-900">⚔️ 所持ワザ</div>
                  {[0, 1, 2, 3].map((index) => {
                    const skillName = customSkills[index] || currentCoordinate.defaultSkills[index];
                    const skillVoice = skillVoices[index] || getDefaultSkillVoice(skillName);
                    return (
                      <div key={index} className="rounded-lg bg-white/80 border border-pink-100 p-2.5">
                        <div className="font-bold text-pink-700">技{index + 1}：{skillName}</div>
                        <div className="mt-1 text-[11px] font-semibold text-gray-800">使用時のセリフ：{skillVoice}</div>
                        <div className="mt-1 text-[10px] text-gray-600">{currentCoordinate.skillDescriptions[index]}</div>
                      </div>
                    );
                  })}
                </div>

                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                  <div className="text-[10px] font-bold text-amber-700">💬 カードの一言</div>
                  <div className="mt-1 text-sm leading-relaxed text-amber-950 min-h-10">
                    {flavorText || 'このキャラらしい一言がここに入ります。'}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* エントリー済み一覧 */}
      <div className="pt-6 border-t border-gray-200 space-y-4">
        <div>
          <h3 className="font-bold text-base">自分のエントリーカード一覧</h3>
          <p className="text-[10px] text-gray-500 mt-1">この端末で作成したカードは、作成者トークンが残っているため自動的に編集・削除できます。</p>
        </div>

        {entries.filter((entry) => entry.cardType === 'coordinate').length === 0 ? (
          <p className="text-xs text-gray-500">まだエントリーされたキャラカードはありません。</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {entries.filter((entry) => entry.cardType === 'coordinate').map((entry) => {
              const preset = COORDINATE_PRESETS.find((item) => item.id === entry.presetId);
              const canEdit = Boolean(authorizedIds[entry.id] || creatorTokens[entry.id]);
              return (
                <div key={entry.id} className="p-4 border rounded-xl bg-gray-50 space-y-3">
                  <div className="flex items-center gap-3">
                    <img src={entry.imageDataUrl} alt="" className="w-14 h-14 rounded-lg object-cover flex-shrink-0" />
                    <div className="min-w-0">
                      <div className="font-bold truncate">{entry.userName}</div>
                      <div className="text-xs text-pink-700 font-bold">{preset ? `${preset.code.toUpperCase()} / ${preset.name}` : entry.presetId}</div>
                      <div className="text-[10px] text-gray-500 truncate">{entry.profileUrl}</div>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => handleEdit(entry)} className={`flex-1 px-3 py-2 rounded-lg text-xs font-bold ${canEdit ? 'bg-indigo-600 text-white hover:bg-indigo-700' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}`}>
                      {canEdit ? '編集' : '所有者認証 → 編集'}
                    </button>
                    <button type="button" onClick={() => handleDelete(entry)} className={`flex-1 px-3 py-2 rounded-lg text-xs font-bold ${canEdit ? 'bg-red-600 text-white hover:bg-red-700' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}`}>
                      {canEdit ? '削除' : '所有者認証 → 削除'}
                    </button>
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
