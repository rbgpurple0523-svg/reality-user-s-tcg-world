'use client';

import React, { ChangeEvent, FormEvent, useEffect, useMemo, useState } from 'react';
import { CoordinatePreset, COORDINATE_PRESETS, EntryRecord } from './EntryHub';
import { EMOTION_PRESETS } from './emotionPresets';
import CoordinateRadialMap from './CoordinateRadialMap';
import {
  COLOR_PALETTE,
  getColorTypeFromHex,
  getColorTypeLabel,
  getLegacyColorHex,
} from './colorTypes';

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
  flavorText?: string;
  colorHex?: string;
  colorType?: import('./colorTypes').ColorType;
};

const emptySkills: [string, string, string, string] = ['', '', '', ''];
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
  const [flavorText, setFlavorText] = useState('');
  const [selectedColorHex, setSelectedColorHex] = useState('#22D3EE');

  const selectedColorType = useMemo(
    () => getColorTypeFromHex(selectedColorHex),
    [selectedColorHex],
  );

  const [entries, setEntries] = useState<EntryRecord[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [creatorTokens, setCreatorTokens] = useState<Record<string, string>>({});
  const [authorizedIds, setAuthorizedIds] = useState<Record<string, boolean>>({});

  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [draftAvailable, setDraftAvailable] = useState(false);
  const [draftChecked, setDraftChecked] = useState(false);
  const [isModerating, setIsModerating] = useState(false);

  const [activeEditor, setActiveEditor] = useState<'basic' | 'skills' | 'color' | 'flavor' | 'saved' | null>(null);

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
        flavorText,
        colorHex: selectedColorHex,
        colorType: selectedColorType,
      };
      localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
      setDraftAvailable(true);
    } catch {
      // localStorageが利用できない場合も入力自体は継続可能。
    }
  }, [profileUrl, userName, imageDataUrl, password, currentCoordinate, customSkills, flavorText, selectedColorHex, draftChecked]);

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
      setFlavorText(draft.flavorText ?? '');
      setSelectedColorHex(
        draft.colorHex && /^#[0-9a-fA-F]{6}$/.test(draft.colorHex)
          ? draft.colorHex.toUpperCase()
          : getLegacyColorHex(undefined),
      );
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
    setErrorMessage('');
  };

  const handleImageUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setImageDataUrl(reader.result as string);
    reader.readAsDataURL(file);
  };

  const handleColorChange = (hex: string) => {
    const normalized = hex.toUpperCase();
    if (!/^#[0-9A-F]{6}$/.test(normalized)) return;
    setSelectedColorHex(normalized);
    setErrorMessage('');
  };

  const handleSkillChange = (index: number, value: string) => {
    setCustomSkills((prev) => {
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
      flavorText: flavorText.trim(),
      colorHex: selectedColorHex,
      colorType: getColorTypeFromHex(selectedColorHex),
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
    setSuccessMessage(editingEntry ? '✨ キャラカードを更新しました！' : '✨ キャラカードを登録しました！');

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
    setFlavorText(entry.flavorText ?? '');
    setSelectedColorHex(
      entry.colorHex && /^#[0-9a-fA-F]{6}$/.test(entry.colorHex)
        ? entry.colorHex.toUpperCase()
        : getLegacyColorHex(entry.color),
    );
    setEditingId(entry.id);
    setErrorMessage('');
    setActiveEditor('basic');
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
    <div className="mx-auto flex h-full min-h-0 w-full max-w-5xl flex-col text-gray-900">
      <div className="shrink-0 border-b border-gray-200 px-3 py-2 sm:px-5">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[9px] font-black tracking-[0.22em] text-pink-500">CHARACTER CARD</div>
            <h2 className="truncate text-lg font-black">キャラカードを作る</h2>
          </div>
          {onBackToHub && (
            <button type="button" onClick={onBackToHub} className="shrink-0 rounded-xl bg-gray-100 px-3 py-2 text-[10px] font-black text-gray-700">
              ← 戻る
            </button>
          )}
        </div>

        <div className="mt-2 grid grid-cols-[auto_1fr_auto] items-center gap-2 text-[9px] font-black">
          <span className="rounded-full bg-pink-100 px-2.5 py-1 text-pink-800">① コーデ</span>
          <span className="h-px bg-pink-200" />
          <span className="rounded-full bg-pink-600 px-2.5 py-1 text-white">② カード編集</span>
        </div>
        <div className="mt-1 text-right text-[9px] font-bold text-gray-400">③ 登録で完成</div>
      </div>

      {draftAvailable && !editingId && (
        <div className="mx-3 mt-2 shrink-0 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[10px] sm:mx-5">
          <div className="flex items-center justify-between gap-2">
            <div className="font-bold text-amber-900">前回の続きがあります</div>
            <div className="flex gap-1.5">
              <button type="button" onClick={restoreDraft} className="rounded-lg bg-amber-600 px-2.5 py-1.5 font-black text-white">復元</button>
              <button type="button" onClick={discardDraft} className="rounded-lg border border-amber-300 bg-white px-2.5 py-1.5 font-black text-amber-900">破棄</button>
            </div>
          </div>
        </div>
      )}

      {(errorMessage || successMessage) && (
        <div className={`mx-3 mt-2 shrink-0 rounded-xl border px-3 py-2 text-[10px] font-bold sm:mx-5 ${errorMessage ? 'border-red-200 bg-red-50 text-red-700' : 'border-green-200 bg-green-50 text-green-700'}`} role={errorMessage ? 'alert' : 'status'}>
          {errorMessage || successMessage}
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
        <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_minmax(120px,180px)] gap-3 px-3 py-3 sm:grid-cols-[minmax(0,1fr)_220px] sm:gap-4 sm:px-5">
          <div className="min-h-0 rounded-2xl border border-gray-200 bg-gray-50 p-3 sm:p-4">
            {!currentCoordinate ? (
              <div className="flex h-full min-h-[260px] flex-col items-center justify-center text-center text-xs text-gray-400">
                <div className="text-4xl">👗</div>
                <div className="mt-2 font-black">コーデ未選択</div>
                <div className="mt-1">前の画面でコーデを選んでください。</div>
              </div>
            ) : (
              <div className="flex h-full min-h-0 flex-col">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="rounded-md bg-pink-600 px-2 py-1 text-[9px] font-black text-white">{currentCoordinate.code.toUpperCase()}</span>
                      <span className="truncate text-sm font-black">{currentCoordinate.name}</span>
                    </div>
                    <div className="mt-1 text-[9px] font-bold text-gray-500">{currentCoordinate.tendency}</div>
                  </div>
                  <button type="button" onClick={() => setActiveEditor('saved')} className="shrink-0 rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-[9px] font-black text-gray-600">自分のカード</button>
                </div>

                <div className="mt-3 min-h-0 flex-1 overflow-hidden rounded-2xl border-4 border-pink-400 bg-white shadow-sm">
                  <div className="flex h-full min-h-0 flex-col p-2.5">
                    <div className="flex items-center justify-between gap-2 text-[9px] font-black">
                      <span className="rounded bg-pink-600 px-2 py-1 text-white">{currentCoordinate.code.toUpperCase()}</span>
                      <span className="text-gray-600">{currentCoordinate.archetype}</span>
                    </div>
                    <div className="mt-2 text-center">
                      <div className="truncate text-base font-black">{userName || 'ユーザー名'}</div>
                      <div className="mt-0.5 truncate text-[9px] font-bold text-pink-600">{currentCoordinate.name}</div>
                    </div>
                    <div className="mt-2 min-h-0 flex-1 overflow-hidden rounded-xl bg-gray-100">
                      {imageDataUrl ? <img src={imageDataUrl} alt="Avatar" className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center text-[9px] font-bold text-gray-400">画像を設定してください</div>}
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-1 text-[8px] font-black text-gray-700">
                      <div className="rounded bg-gray-50 px-1.5 py-1">体力 {currentCoordinate.stats.hp}</div>
                      <div className="rounded bg-gray-50 px-1.5 py-1">知略 {currentCoordinate.stats.intellect}</div>
                      <div className="rounded bg-gray-50 px-1.5 py-1">器用 {currentCoordinate.stats.dexterity}</div>
                      <div className="rounded bg-gray-50 px-1.5 py-1">特技 {currentCoordinate.stats.charm}</div>
                    </div>
                    <div className="mt-2 rounded-lg bg-pink-50 px-2 py-1.5 text-[8px] leading-4 text-gray-700">
                      <div className="font-black text-pink-800">所持スキル</div>
                      {customSkills.map((skill, index) => <div key={index} className="truncate">{index + 1}. {skill || currentCoordinate.defaultSkills[index]}</div>)}
                    </div>
                    <div className="mt-2 rounded-lg bg-amber-50 px-2 py-1.5 text-[8px] leading-4 text-amber-950">
                      <div className="font-black text-amber-700">カードの一言</div>
                      <div className="truncate">{flavorText || 'このキャラらしい一言'}</div>
                    </div>
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <button type="button" onClick={() => setActiveEditor('basic')} className="rounded-xl border border-gray-200 bg-white px-2 py-2 text-[9px] font-black">基本情報</button>
                  <button type="button" onClick={() => setActiveEditor('skills')} className="rounded-xl border border-gray-200 bg-white px-2 py-2 text-[9px] font-black">スキルを編集</button>
                  <button type="button" onClick={() => setActiveEditor('color')} className="rounded-xl border border-gray-200 bg-white px-2 py-2 text-[9px] font-black">カラー</button>
                  <button type="button" onClick={() => setActiveEditor('flavor')} className="rounded-xl border border-gray-200 bg-white px-2 py-2 text-[9px] font-black">一言</button>
                </div>
              </div>
            )}
          </div>

          <div className="min-h-0 rounded-2xl border border-gray-200 bg-white p-2.5 sm:p-3">
            <div className="text-[8px] font-black tracking-wider text-gray-400">PREVIEW</div>
            <div className="mt-2 aspect-[3/4] w-full overflow-hidden rounded-xl border border-gray-200 bg-gray-50">
              {imageDataUrl ? <img src={imageDataUrl} alt="" className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center px-2 text-center text-[8px] font-bold text-gray-400">アバター画像</div>}
            </div>
            <div className="mt-2 truncate text-center text-[10px] font-black">{userName || 'ユーザー名'}</div>
            <div className="mt-1 truncate text-center text-[8px] font-bold text-pink-600">{currentCoordinate?.name || 'コーデ未選択'}</div>
            <div className="mt-2 h-2 rounded-full" style={{ backgroundColor: selectedColorHex }} />
            <div className="mt-1 text-center text-[8px] font-bold text-gray-500">{getColorTypeLabel(selectedColorType)}</div>
          </div>
        </div>

        <div className="shrink-0 border-t border-gray-200 bg-white px-3 py-2.5 sm:px-5">
          <button type="submit" disabled={isModerating || !currentCoordinate} className="w-full rounded-2xl bg-pink-600 px-4 py-3 text-sm font-black text-white shadow disabled:cursor-wait disabled:bg-pink-300">
            {isModerating ? '安全確認中…' : editingId ? 'このカードを更新する' : 'このカードで参加する'}
          </button>
        </div>
      </form>

      {activeEditor && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/60 p-3 backdrop-blur-sm">
          <div className="flex max-h-[88dvh] w-full max-w-md flex-col overflow-hidden rounded-3xl bg-white shadow-2xl">
            <div className="flex shrink-0 items-center justify-between gap-3 border-b border-gray-200 px-4 py-3">
              <div className="text-sm font-black">
                {activeEditor === 'basic' && '基本情報を編集'}
                {activeEditor === 'skills' && 'スキルを編集'}
                {activeEditor === 'color' && 'カードカラーを設定'}
                {activeEditor === 'flavor' && 'カードの一言を編集'}
                {activeEditor === 'saved' && '自分のキャラカード'}
              </div>
              <button type="button" onClick={() => setActiveEditor(null)} className="rounded-lg bg-gray-100 px-2.5 py-1.5 text-xs font-black">✕</button>
            </div>

            <div className="min-h-0 overflow-y-auto p-4">
              {activeEditor === 'basic' && (
                <div className="space-y-4 text-xs">
                  <div><label className="mb-1 block font-bold">アバター名 <span className="text-red-500">*</span></label><input type="text" value={userName} onChange={(e) => setUserName(e.target.value)} maxLength={40} placeholder="例：キャラ太郎" className="w-full rounded-xl border px-3 py-2.5" /></div>
                  <div><label className="mb-1 block font-bold">REALITY プロフURL <span className="text-red-500">*</span></label><input type="text" value={profileUrl} onChange={(e) => setProfileUrl(e.target.value)} placeholder="https://reality.app/user/xxxxxx" className="w-full rounded-xl border px-3 py-2.5" /></div>
                  <div><label className="mb-1 block font-bold">アバター画像 <span className="text-red-500">*</span></label><input type="file" accept="image/*" onChange={handleImageUpload} className="w-full text-xs" /></div>
                  <div><label className="mb-1 block font-bold">編集・削除用の合言葉 <span className="text-red-500">*</span></label><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="後からの編集・削除に使用します" className="w-full rounded-xl border px-3 py-2.5" /><p className="mt-1 text-[9px] text-gray-500">同じ端末では作成者トークンにより省略できます。</p></div>
                </div>
              )}

              {activeEditor === 'skills' && currentCoordinate && (
                <div className="space-y-3 text-xs">
                  <p className="text-[10px] font-bold text-gray-500">コーデごとの効果説明は固定。スキル名だけ自分らしく変更できます。</p>
                  {[0, 1, 2, 3].map((index) => (
                    <div key={index} className="rounded-2xl border border-pink-100 bg-pink-50/50 p-3">
                      <div className="font-black text-pink-700">スキル{index + 1}</div>
                      <input type="text" value={customSkills[index]} onChange={(e) => handleSkillChange(index, e.target.value)} maxLength={40} className="mt-2 w-full rounded-xl border px-3 py-2.5" />
                      <div className="mt-2 rounded-xl bg-white px-3 py-2 text-[10px] leading-5 text-gray-600">{currentCoordinate.skillDescriptions[index]}</div>
                    </div>
                  ))}
                </div>
              )}

              {activeEditor === 'color' && (
                <div className="space-y-4">
                  <div className="flex flex-wrap gap-2">
                    {COLOR_PALETTE.map((color) => <button key={color} type="button" onClick={() => handleColorChange(color)} aria-label={`カラー ${color}`} className={`h-10 w-10 rounded-full border-2 ${selectedColorHex.toUpperCase() === color.toUpperCase() ? 'border-gray-900 ring-2 ring-offset-1 ring-gray-300' : 'border-white shadow-sm'}`} style={{ backgroundColor: color }} />)}
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
                  <textarea value={flavorText} onChange={(e) => setFlavorText(e.target.value)} rows={6} maxLength={120} placeholder="このキャラらしい一言をどうぞ。" className="w-full resize-none rounded-2xl border px-3 py-3 text-sm" />
                  <p className="mt-1 text-[9px] text-gray-500">最大120文字。</p>
                </div>
              )}

              {activeEditor === 'saved' && (
                <div className="space-y-3">
                  {entries.filter((entry) => entry.cardType === 'coordinate').length === 0 ? (
                    <div className="py-10 text-center text-xs text-gray-500">まだキャラカードはありません。</div>
                  ) : entries.filter((entry) => entry.cardType === 'coordinate').map((entry) => {
                    const preset = COORDINATE_PRESETS.find((item) => item.id === entry.presetId);
                    const canEdit = Boolean(authorizedIds[entry.id] || creatorTokens[entry.id]);
                    return (
                      <div key={entry.id} className="rounded-2xl border bg-gray-50 p-3">
                        <div className="flex items-center gap-3">
                          <img src={entry.imageDataUrl} alt="" className="h-12 w-12 rounded-xl object-cover" />
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-sm font-black">{entry.userName}</div>
                            <div className="truncate text-[9px] font-bold text-pink-700">{preset ? `${preset.code.toUpperCase()} / ${preset.name}` : entry.presetId}</div>
                          </div>
                        </div>
                        <div className="mt-2 flex gap-2">
                          <button type="button" onClick={() => handleEdit(entry)} className={`flex-1 rounded-xl px-3 py-2 text-[10px] font-black ${canEdit ? 'bg-indigo-600 text-white' : 'bg-gray-200 text-gray-700'}`}>{canEdit ? '編集' : '所有者認証 → 編集'}</button>
                          <button type="button" onClick={() => handleDelete(entry)} className={`flex-1 rounded-xl px-3 py-2 text-[10px] font-black ${canEdit ? 'bg-red-600 text-white' : 'bg-gray-200 text-gray-700'}`}>{canEdit ? '削除' : '所有者認証 → 削除'}</button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {activeEditor !== 'saved' && (
              <div className="shrink-0 border-t border-gray-200 p-3">
                <button type="button" onClick={() => setActiveEditor(null)} className="w-full rounded-xl bg-gray-900 py-2.5 text-xs font-black text-white">完了</button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
