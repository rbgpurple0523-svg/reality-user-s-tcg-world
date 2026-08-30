'use client';

import React, { ChangeEvent, FormEvent, useEffect, useMemo, useState } from 'react';
import { CoordinatePreset, COORDINATE_PRESETS, EntryRecord } from './EntryHub';

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

export default function CardGenerator({ selectedCoordinate, onBackToHub }: CardGeneratorProps) {
  // ---------------------------------------------------------
  // コーデ選択
  // 未選択状態を許容。EntryHubから来た場合だけ初期選択される。
  // ---------------------------------------------------------
  const [currentCoordinate, setCurrentCoordinate] = useState<CoordinatePreset | null>(selectedCoordinate ?? null);
  const [searchKeyword, setSearchKeyword] = useState('');

  useEffect(() => {
    setCurrentCoordinate(selectedCoordinate ?? null);
  }, [selectedCoordinate]);

  const filteredPresets = useMemo(() => {
    const q = searchKeyword.trim().toLowerCase();
    if (!q) return COORDINATE_PRESETS;
    return COORDINATE_PRESETS.filter(
      (preset) =>
        preset.code.includes(q) ||
        preset.name.toLowerCase().includes(q) ||
        preset.tendency.toLowerCase().includes(q),
    );
  }, [searchKeyword]);

  // ---------------------------------------------------------
  // フォーム
  // ---------------------------------------------------------
  const [profileUrl, setProfileUrl] = useState('');
  const [userName, setUserName] = useState('');
  const [imageDataUrl, setImageDataUrl] = useState('');
  const [password, setPassword] = useState('');
  const [customSkills, setCustomSkills] = useState<[string, string, string, string]>(emptySkills);

  const [entries, setEntries] = useState<EntryRecord[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [creatorTokens, setCreatorTokens] = useState<Record<string, string>>({});
  const [authorizedIds, setAuthorizedIds] = useState<Record<string, boolean>>({});

  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [draftAvailable, setDraftAvailable] = useState(false);
  const [draftChecked, setDraftChecked] = useState(false);

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
      customSkills.some(Boolean);

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
      };
      localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
      setDraftAvailable(true);
    } catch {
      // localStorageが利用できない場合も入力自体は継続可能。
    }
  }, [profileUrl, userName, imageDataUrl, password, currentCoordinate, customSkills, draftChecked]);

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
      setCustomSkills(
        draft.customSkills?.length === 4
          ? [draft.customSkills[0], draft.customSkills[1], draft.customSkills[2], draft.customSkills[3]]
          : preset?.defaultSkills ?? emptySkills,
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
  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    setErrorMessage('');

    if (!currentCoordinate) {
      setErrorMessage('コーデを1つ選択してください。');
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

    const currentEntries = getStoredEntries();
    const editingEntry = editingId ? currentEntries.find((entry) => entry.id === editingId) : null;

    // 新規作成時だけcreator tokenを発行。編集時は既存tokenを維持。
    let creatorToken = editingEntry ? creatorTokens[editingEntry.id] : undefined;
    if (!creatorToken) creatorToken = makeCreatorToken();

    const now = new Date().toISOString();
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
      customSkills: [...customSkills],
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
    setCustomSkills(
      entry.customSkills?.length === 4
        ? [entry.customSkills[0], entry.customSkills[1], entry.customSkills[2], entry.customSkills[3]]
        : preset?.defaultSkills ?? emptySkills,
    );
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
              <input type="text" placeholder="例：キャラ太郎" value={userName} onChange={(e) => setUserName(e.target.value)} className="w-full px-3 py-2 border rounded-lg bg-white" />
            </div>

            <div>
              <label className="block font-bold text-gray-700 mb-1">アバター画像 <span className="text-red-500">*</span></label>
              <input type="file" accept="image/*" onChange={handleImageUpload} className="w-full text-gray-700" />
            </div>

            <div className="pt-3 border-t border-gray-100 space-y-3">
              <div>
                <label className="block font-bold text-gray-700 mb-1">コーデ選択 <span className="text-red-500">*</span></label>
                <input value={searchKeyword} onChange={(e) => setSearchKeyword(e.target.value)} placeholder="🔍 a〜y / 傾向で絞り込み" className="w-full px-3 py-2 border rounded-lg bg-white" />
              </div>
              <div className="max-h-56 overflow-y-auto border rounded-xl divide-y bg-white">
                {filteredPresets.map((preset) => {
                  const selected = currentCoordinate?.id === preset.id;
                  return (
                    <button key={preset.id} type="button" onClick={() => selectCoordinatePreset(preset)} className={`w-full text-left p-3 flex items-center justify-between gap-3 ${selected ? 'bg-pink-50' : 'hover:bg-gray-50'}`}>
                      <div>
                        <div className="font-bold"><span className="text-pink-600">{preset.code.toUpperCase()}</span> / {preset.name}</div>
                        <div className="text-[10px] text-gray-500 mt-0.5">{preset.tendency}</div>
                      </div>
                      {selected && <span className="text-[10px] bg-pink-600 text-white px-2 py-1 rounded-full">選択中</span>}
                    </button>
                  );
                })}
              </div>
              {!currentCoordinate && <div className="text-[11px] text-red-600 font-bold">コーデを選択すると、性能と4技がプレビューに反映されます。</div>}
            </div>

            <div className="pt-3 border-t border-gray-100 space-y-2">
              <label className="block font-bold text-gray-700">所持ワザ名称設定（4つ・変更可能） <span className="text-red-500">*</span></label>
              {[0, 1, 2, 3].map((index) => (
                <div key={index} className="flex items-center gap-2">
                  <span className="text-pink-600 font-bold w-10">技{index + 1}:</span>
                  <input disabled={!currentCoordinate} type="text" value={customSkills[index]} onChange={(e) => handleSkillChange(index, e.target.value)} className="w-full px-3 py-1.5 border rounded-lg bg-white disabled:bg-gray-100" />
                </div>
              ))}
            </div>

            <div className="pt-3 border-t border-gray-100">
              <label className="block font-bold text-gray-700 mb-1">編集・削除用の合言葉 <span className="text-red-500">*</span></label>
              <input type="password" placeholder="後からの編集・削除に使用します" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full px-3 py-2 border rounded-lg bg-white" />
              <p className="text-[10px] text-gray-500 mt-1">同じ端末では作成者トークンにより、次回から合言葉入力を省略できます。</p>
            </div>

            <button type="submit" className="w-full py-2.5 bg-pink-600 hover:bg-pink-700 text-white font-bold rounded-xl shadow">
              {editingId ? 'エントリー内容を更新する' : 'カードをエントリーして保存'}
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

                <div className="text-xs bg-pink-50 border border-pink-100 p-3 rounded-lg space-y-2">
                  <div className="font-bold text-pink-900">⚔️ 所持ワザ</div>
                  {[0, 1, 2, 3].map((index) => (
                    <div key={index}>
                      <div className="font-bold text-pink-700">技{index + 1}：{customSkills[index] || currentCoordinate.defaultSkills[index]}</div>
                      <div className="text-[10px] text-gray-600">{currentCoordinate.skillDescriptions[index]}</div>
                    </div>
                  ))}
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
