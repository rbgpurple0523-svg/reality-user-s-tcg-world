'use client';

import React, { ChangeEvent, FormEvent, useEffect, useMemo, useState } from 'react';
import { CoordinatePreset, COORDINATE_PRESETS, EntryRecord } from './EntryHub';
import { EMOTION_PRESETS } from './emotionPresets';
import {
COLOR_PALETTE,
getColorTypeFromHex,
getColorTypeLabel,
getLegacyColorHex,
} from './colorTypes';

interface CardGeneratorProps {
selectedCoordinate?: CoordinatePreset | null;
onBackToHub?: () => void;
onChangeCoordinate?: () => void;
}

const ENTRIES_KEY = 'reality_world_entries';
const TOKEN_KEY = 'reality_world_creator_tokens';
const DRAFT_KEY = 'reality_world_coordinate_draft';

type DraftData = {
profileUrl: string;
userName: string;
imageDataUrl: string;
selectedCoordinateId: string | null;
customSkills: [string, string, string, string];
flavorText?: string;
colorHex?: string;
colorType?: import('./colorTypes').ColorType;
showProfileUrl?: boolean;
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

function normalizeProfileUrl(value: string): string {
  return value
    .trim()
    .replace(/#REALITY$/i, '')
    .replace(/\/$/, '');
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

function MiniRadarChart({ stats }: { stats: CoordinatePreset['stats'] }) {
const size = 96;
const center = size / 2;
const radius = 34;
const values = [stats.hp, stats.intellect, stats.dexterity, stats.charm].map((value) => Math.min(100, Math.max(0, value)));
const points = [
`${center},${center - (values[0] / 100) * radius}`,
`${center + (values[1] / 100) * radius},${center}`,
`${center},${center + (values[2] / 100) * radius}`,
`${center - (values[3] / 100) * radius},${center}`,
].join(' ');
const outerPoints = [
`${center},${center - radius}`,
`${center + radius},${center}`,
`${center},${center + radius}`,
`${center - radius},${center}`,
].join(' ');
const middleRadius = radius * 0.5;
const middlePoints = [
`${center},${center - middleRadius}`,
`${center + middleRadius},${center}`,
`${center},${center + middleRadius}`,
`${center - middleRadius},${center}`,
].join(' ');
return (
<svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-label="ステータスレーダー"> <polygon points={outerPoints} fill="none" stroke="currentColor" strokeOpacity="0.18" /> <polygon points={middlePoints} fill="none" stroke="currentColor" strokeOpacity="0.12" />
<line x1={center} y1={center - radius} x2={center} y2={center + radius} stroke="currentColor" strokeOpacity="0.12" />
<line x1={center - radius} y1={center} x2={center + radius} y2={center} stroke="currentColor" strokeOpacity="0.12" /> <polygon points={points} fill="currentColor" fillOpacity="0.15" stroke="currentColor" strokeWidth="2" /> </svg>
);
}

export default function CardGenerator({
selectedCoordinate,
onBackToHub,
onChangeCoordinate,
}: CardGeneratorProps) {
const [currentCoordinate, setCurrentCoordinate] = useState<CoordinatePreset | null>(selectedCoordinate ?? null);

useEffect(() => {
setCurrentCoordinate(selectedCoordinate ?? null);
setRegistrationStep(2);
setActiveEditor(null);
setShowProfileUrl(true);

if (selectedCoordinate) {
  setCustomSkills([
    selectedCoordinate.defaultSkills[0],
    selectedCoordinate.defaultSkills[1],
    selectedCoordinate.defaultSkills[2],
    selectedCoordinate.defaultSkills[3],
  ]);
  setFlavorText('');
  setIsColorTouched(false);
}

}, [selectedCoordinate]);

const [profileUrl, setProfileUrl] = useState('');
const [userName, setUserName] = useState('');
const [imageDataUrl, setImageDataUrl] = useState('');
const [password, setPassword] = useState('');
const [customSkills, setCustomSkills] = useState<[string, string, string, string]>(emptySkills);
const [flavorText, setFlavorText] = useState('');
const [selectedColorHex, setSelectedColorHex] = useState('#22D3EE');
const [showProfileUrl, setShowProfileUrl] = useState(true);

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
const [showProfileHelp, setShowProfileHelp] = useState(false);
const [showSkillsHelp, setShowSkillsHelp] = useState(false);
const [isColorTouched, setIsColorTouched] = useState(false);
const [registrationStep, setRegistrationStep] = useState<2 | 3>(2);

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

useEffect(() => {
if (!draftChecked) return;

const hasDraft =
  Boolean(profileUrl) ||
  Boolean(userName) ||
  Boolean(imageDataUrl) ||
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
    profileUrl: normalizeProfileUrl(profileUrl),
    userName,
    imageDataUrl,
    selectedCoordinateId: currentCoordinate?.id ?? null,
    customSkills,
    flavorText,
    colorHex: selectedColorHex,
    colorType: selectedColorType,
    showProfileUrl,
  };
  localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  setDraftAvailable(true);
} catch {}

}, [profileUrl, userName, imageDataUrl, currentCoordinate, customSkills, flavorText, selectedColorHex, selectedColorType, showProfileUrl, draftChecked]);

const restoreDraft = () => {
try {
const raw = localStorage.getItem(DRAFT_KEY);
if (!raw) return;
const draft = JSON.parse(raw) as DraftData;
const preset = draft.selectedCoordinateId
? COORDINATE_PRESETS.find((item) => item.id === draft.selectedCoordinateId) ?? null
: null;

  setProfileUrl(normalizeProfileUrl(draft.profileUrl ?? ''));
  setUserName(draft.userName ?? '');
  setImageDataUrl(draft.imageDataUrl ?? '');
  setPassword('');
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
  setIsColorTouched(Boolean(draft.colorHex && /^#[0-9a-fA-F]{6}$/.test(draft.colorHex)));
  setShowProfileUrl(draft.showProfileUrl !== false);
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

const handleBackButton = () => {
if (registrationStep === 3) {
setRegistrationStep(2);
setErrorMessage('');
setSuccessMessage('');
return;
}

if (onChangeCoordinate) {
  onChangeCoordinate();
  return;
}

onBackToHub?.();

};

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

const handleProfileUrlChange = (value: string) => {
setProfileUrl(normalizeProfileUrl(value));
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
setIsColorTouched(true);
setErrorMessage('');
};

const handleSkillChange = (index: number, value: string) => {
setCustomSkills((prev) => {
const next = [...prev] as [string, string, string, string];
next[index] = value;
return next;
});
};

const handleSubmit = async (e: FormEvent) => {
e.preventDefault();
setErrorMessage('');

const normalizedCurrentProfileUrl = normalizeProfileUrl(profileUrl);
setProfileUrl(normalizedCurrentProfileUrl);

if (!currentCoordinate) {
  setErrorMessage('コーデを1つ選択してください。');
  return;
}

const currentEntries = getStoredEntries();
const currentMaxEntryLimit = getMaxEntryLimit(currentEntries);
const currentCoordinateCount = currentEntries.filter(
  (entry) => entry.presetId === currentCoordinate.id,
).length;
const editingKeepsCurrentCoordinate = Boolean(
  editingId &&
    currentEntries.some(
      (entry) => entry.id === editingId && entry.presetId === currentCoordinate.id,
    ),
);

if (
  currentCoordinateCount >= currentMaxEntryLimit &&
  !editingKeepsCurrentCoordinate
) {
  setErrorMessage('このコーデは現在エントリー上限に達しています。別のコーデを選択してください。');
  if (registrationStep === 3) setRegistrationStep(2);
  return;
}

if (!normalizedCurrentProfileUrl.startsWith('https://reality.app/profile/')) {
  setErrorMessage('有効なREALITYプロフURLを入力してください。');
  setActiveEditor('basic');
  return;
}
if (!userName.trim() || !imageDataUrl || !password.trim() || customSkills.some((skill) => !skill.trim())) {
  setErrorMessage('基本情報と4つのスキルをすべて入力してください。');
  if (!userName.trim() || !normalizedCurrentProfileUrl.startsWith('https://reality.app/profile/') || !imageDataUrl || !password.trim()) {
    setActiveEditor('basic');
  } else {
    setActiveEditor('skills');
  }
  return;
}

if (registrationStep === 2) {
  setRegistrationStep(3);
  setActiveEditor(null);
  setSuccessMessage('登録内容を確認してください。');
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

const editingEntry = editingId ? currentEntries.find((entry) => entry.id === editingId) : null;

const normalizedProfileUrl = normalizeProfileUrl(normalizedCurrentProfileUrl);
const duplicateCharacterEntry = currentEntries.find(
  (entry) =>
    entry.cardType === 'coordinate' &&
    entry.id !== editingId &&
    normalizeProfileUrl(entry.profileUrl || '').toLowerCase() === normalizedProfileUrl.toLowerCase(),
);

if (duplicateCharacterEntry) {
  setErrorMessage('このREALITYプロフURLでは、すでにキャラカードが登録されています。1ユーザーにつき登録できるキャラカードは1枚です。');
  setActiveEditor('basic');
  return;
}

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
  profileUrl: normalizedProfileUrl,
  userName: userName.trim(),
  imageDataUrl,
  passwordHash: password,
  firstUser: editingEntry?.firstUser || userName.trim(),
  customSkills: normalizedCustomSkills,
  flavorText: flavorText.trim(),
  colorHex: selectedColorHex,
  colorType: getColorTypeFromHex(selectedColorHex),
  showProfileUrl,
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
setRegistrationStep(3);
setActiveEditor(null);

try {
  localStorage.removeItem(DRAFT_KEY);
} catch {}
setDraftAvailable(false);

};

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
setProfileUrl(normalizeProfileUrl(entry.profileUrl || ''));
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
setIsColorTouched(true);
setShowProfileUrl(entry.showProfileUrl !== false);
setRegistrationStep(2);
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

const normalizedProfileUrlForValidation = (value: string) =>
  normalizeProfileUrl(value).startsWith('https://reality.app/profile/');

const basicInfoComplete = Boolean(
  userName.trim() &&
    normalizedProfileUrlForValidation(profileUrl) &&
    imageDataUrl &&
    password.trim(),
);

const skillsComplete = customSkills.every((skill) => skill.trim().length > 0);
const currentEntriesIsFull = Boolean(
currentCoordinate &&
entries.filter((entry) => entry.presetId === currentCoordinate.id).length >= maxEntryLimit,
);

return ( <div className="mx-auto flex h-full min-h-0 w-full max-w-5xl flex-col text-gray-900"> <div className="shrink-0 border-b border-gray-200 px-3 py-2 sm:px-5"> <div className="flex items-center justify-between gap-3"> <div className="min-w-0"> <div className="text-[9px] font-black tracking-[0.22em] text-pink-500">CHARACTER CARD</div> <h2 className="truncate text-lg font-black">キャラカードを作る</h2> </div> <div className="flex shrink-0 items-center gap-1.5">
{onBackToHub && ( <button type="button" onClick={handleBackButton} className="rounded-xl bg-gray-100 px-3 py-2 text-[10px] font-black text-gray-700">← 戻る</button>
)} </div> </div>

    <div className="mt-2 grid grid-cols-[1fr_auto_1fr_auto_1fr] items-center gap-1.5 text-[9px] font-black">
      <span className="rounded-full bg-pink-100 px-2 py-1 text-center text-pink-800">① コーデ</span>
      <span className="h-px bg-pink-200" />
      <span className={`rounded-full px-2 py-1 text-center ${registrationStep === 2 ? 'bg-pink-600 text-white' : 'bg-pink-100 text-pink-800'}`}>② カード編集</span>
      <span className="h-px bg-pink-200" />
      <span className={`rounded-full px-2 py-1 text-center ${registrationStep === 3 ? 'bg-pink-600 text-white' : 'bg-gray-100 text-gray-400'}`}>③ 登録</span>
    </div>
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
    <div className="min-h-0 flex-1 overflow-hidden px-3 py-3 sm:px-5">
      {registrationStep === 2 ? (
        <div className="flex h-full min-h-0 flex-col gap-3">
          <div className="shrink-0 rounded-2xl border border-indigo-100 bg-indigo-50/60 p-3">
            <div className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <div className="text-[9px] font-black tracking-[0.16em] text-indigo-500">SELECTED COORDINATE</div>
                <div className="mt-1 flex items-center gap-2">
                  <span className="rounded-md bg-indigo-600 px-2 py-1 text-[9px] font-black text-white">{currentCoordinate?.code.toUpperCase()}</span>
                  <span className="truncate text-sm font-black text-indigo-950">{currentCoordinate?.name || '未選択'}</span>
                </div>
                <p className="mt-1 text-[9px] font-bold leading-4 text-indigo-800">コーデは、4つのステータスの得意・不得意を決めるキャラの性能タイプです。</p>
              </div>
              {currentCoordinate && (
                <div className="shrink-0 rounded-xl border border-indigo-100 bg-white p-1">
                  <MiniRadarChart stats={currentCoordinate.stats} />
                </div>
              )}
            </div>
          </div>

          {currentCoordinate && currentEntriesIsFull && !editingId && (
            <div className="shrink-0 rounded-xl border border-red-200 bg-red-50 px-3 py-2">
              <div className="text-[10px] font-black text-red-700">このコーデは現在満員です。</div>
              <div className="mt-0.5 text-[9px] font-bold leading-4 text-red-600">別のコーデを選んでからカード編集を続けてください。</div>
              {onChangeCoordinate && <button type="button" onClick={onChangeCoordinate} className="mt-2 rounded-lg bg-red-600 px-3 py-1.5 text-[9px] font-black text-white">コーデを選び直す</button>}
            </div>
          )}

          <div className="min-h-0 flex-1 rounded-2xl border border-gray-200 bg-white p-3">
            <div className="flex items-end justify-between gap-2">
              <div>
                <div className="text-[9px] font-black tracking-[0.16em] text-gray-400">EDIT</div>
                <h3 className="mt-0.5 text-sm font-black">カードの設定</h3>
              </div>
              <div className="text-[8px] font-bold text-gray-400">未設定の項目を開いて編集</div>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setActiveEditor('basic')} className="rounded-2xl border-2 border-indigo-100 bg-indigo-50/60 p-3 text-left">
                <div className="flex items-center justify-between gap-2"><span className="text-[10px] font-black text-indigo-900">基本情報</span><span className={`rounded-full px-1.5 py-0.5 text-[8px] font-black ${basicInfoComplete ? 'bg-emerald-100 text-emerald-700' : 'bg-white text-indigo-600'}`}>{basicInfoComplete ? '入力済み' : '必須・未設定'}</span></div>
                <div className="mt-1 text-[8px] font-bold text-indigo-700">反映：名前・画像・プロフィール</div>
              </button>

              <button type="button" onClick={() => setActiveEditor('skills')} className="rounded-2xl border-2 border-pink-100 bg-pink-50/60 p-3 text-left">
                <div className="flex items-center justify-between gap-2"><span className="text-[10px] font-black text-pink-900">スキル</span><span className={`rounded-full px-1.5 py-0.5 text-[8px] font-black ${skillsComplete ? 'bg-emerald-100 text-emerald-700' : 'bg-white text-pink-600'}`}>{skillsComplete ? '4つ入力済み' : '必須・未設定'}</span></div>
                <div className="mt-1 text-[8px] font-bold text-pink-700">反映：カードのスキル欄</div>
              </button>

              <button type="button" onClick={() => setActiveEditor('color')} style={!isColorTouched ? undefined : { borderColor: selectedColorHex, backgroundColor: `${selectedColorHex}14` }} className="rounded-2xl border-2 border-cyan-100 bg-cyan-50/60 p-3 text-left">
                <div className="flex items-center justify-between gap-2"><span className="text-[10px] font-black text-cyan-950">カラー</span><span className={`rounded-full px-1.5 py-0.5 text-[8px] font-black ${isColorTouched ? 'bg-emerald-100 text-emerald-700' : 'bg-white text-cyan-700'}`}>{isColorTouched ? '設定済み' : '未設定'}</span></div>
                <div className="mt-1 flex items-center gap-1.5 text-[8px] font-bold text-cyan-800"><span className="h-2.5 w-2.5 rounded-full border border-white shadow-sm" style={{ backgroundColor: selectedColorHex }} />反映：カードの枠・色</div>
              </button>

              <button type="button" onClick={() => setActiveEditor('flavor')} className="rounded-2xl border-2 border-amber-100 bg-amber-50/60 p-3 text-left">
                <div className="flex items-center justify-between gap-2"><span className="text-[10px] font-black text-amber-950">一言</span><span className={`rounded-full px-1.5 py-0.5 text-[8px] font-black ${flavorText.trim() ? 'bg-emerald-100 text-emerald-700' : 'bg-white text-amber-700'}`}>{flavorText.trim() ? '入力済み' : '未設定'}</span></div>
                <div className="mt-1 text-[8px] font-bold text-amber-800">反映：カードの一言</div>
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex h-full min-h-0 flex-col gap-3">
          <div className="shrink-0 rounded-2xl border border-pink-100 bg-pink-50/60 p-3">
            <div className="text-[9px] font-black tracking-[0.16em] text-pink-500">STEP 3</div>
            <h3 className="mt-1 text-base font-black text-pink-950">登録内容を確認</h3>
            <p className="mt-1 text-[9px] font-bold leading-4 text-pink-800">内容を確認してから「このカードで参加する」を押してください。</p>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto rounded-2xl border border-gray-200 bg-gray-50 p-3">
            <div className="mx-auto w-full max-w-sm overflow-hidden rounded-[1.65rem] border-[5px] bg-white shadow-lg" style={{ borderColor: selectedColorHex }}>
              <div className="border-b border-gray-100 px-4 pb-3 pt-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-[8px] font-black tracking-[0.18em] text-pink-500">CHARACTER CARD</div>
                    <div className="mt-1 truncate text-xl font-black text-gray-950">{userName || '名前未設定'}</div>
                    <div className="mt-1 flex items-center gap-1.5">
                      <span className="rounded-md bg-gray-900 px-1.5 py-1 text-[8px] font-black text-white">{currentCoordinate?.code.toUpperCase()}</span>
                      <span className="truncate text-[9px] font-black text-gray-600">{currentCoordinate?.name}</span>
                    </div>
                  </div>
                  <div className="shrink-0 rounded-xl border border-gray-200 bg-gray-50 px-2 py-1 text-[8px] font-black text-gray-500">PREVIEW</div>
                </div>
              </div>

              <div className="grid grid-cols-[1.1fr_0.9fr] gap-3 p-3">
                <div className="overflow-hidden rounded-2xl border border-gray-200 bg-gray-50">
                  {imageDataUrl ? (
                    <img src={imageDataUrl} alt="" className="aspect-[4/5] w-full object-cover" />
                  ) : (
                    <div className="flex aspect-[4/5] items-center justify-center text-xs font-black text-gray-400">画像未設定</div>
                  )}
                </div>
                {currentCoordinate && (
                  <div className="flex min-w-0 flex-col items-center">
                    <MiniRadarChart stats={currentCoordinate.stats} />
                    <div className="mt-1 grid w-full grid-cols-1 gap-1 text-[8px] font-black text-gray-600">
                      <div className="flex items-center justify-between"><span>🔥 情熱</span><span>{currentCoordinate.stats.hp}</span></div>
                      <div className="flex items-center justify-between"><span>▽ 知性</span><span>{currentCoordinate.stats.intellect}</span></div>
                      <div className="flex items-center justify-between"><span>⬡ 技能</span><span>{currentCoordinate.stats.dexterity}</span></div>
                      <div className="flex items-center justify-between"><span>♥ 愛嬌</span><span>{currentCoordinate.stats.charm}</span></div>
                    </div>
                  </div>
                )}
              </div>

              <div className="px-3 pb-3">
                <div className="rounded-2xl border border-pink-100 bg-pink-50/60 p-3">
                  <div className="text-[9px] font-black tracking-[0.12em] text-pink-600">SKILLS</div>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    {customSkills.map((skill, index) => (
                      <div key={`${skill}-${index}`} className="rounded-xl border border-white bg-white px-2.5 py-2 shadow-sm">
                        <div className="text-[7px] font-black text-pink-500">SKILL {index + 1}</div>
                        <div className="mt-0.5 line-clamp-2 text-[9px] font-black text-gray-800">{skill}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="border-t border-amber-100 bg-amber-50 px-4 py-3 text-center">
                <div className="text-[8px] font-black tracking-[0.12em] text-amber-700">FLAVOR</div>
                <div className={`mt-1 text-[10px] font-bold leading-4 ${flavorText.trim() ? 'text-amber-950' : 'text-amber-500'}`}>
                  {flavorText.trim() || '一言未設定'}
                </div>
              </div>

              {showProfileUrl && (
                <div className="border-t border-gray-100 bg-white px-3 py-3">
                  <div className="text-[8px] font-black tracking-[0.12em] text-gray-400">REALITY PROFILE</div>
                  <div className="mt-1 break-all text-[9px] font-bold text-gray-700">
                    {normalizeProfileUrl(profileUrl) || '未設定'}
                  </div>
                </div>
              )}
            </div>

            <div className="mx-auto mt-3 grid w-full max-w-sm grid-cols-2 gap-2 text-[8px] font-bold text-gray-500">
              <div className="rounded-xl border border-white bg-white px-2.5 py-2">カードカラー<br /><span className="font-black" style={{ color: selectedColorHex }}>{selectedColorHex.toUpperCase()}</span></div>
              <div className="rounded-xl border border-white bg-white px-2.5 py-2">
                プロフURL表示<br />
                <span className={`font-black ${showProfileUrl ? 'text-emerald-600' : 'text-gray-400'}`}>
                  {showProfileUrl ? 'ON' : 'OFF'}
                </span>
              </div>
            </div>
          </div>

          <button type="button" onClick={() => { setRegistrationStep(2); setErrorMessage(''); setSuccessMessage(''); }} className="shrink-0 rounded-xl border border-gray-200 bg-white py-2.5 text-xs font-black text-gray-700">② 編集に戻る</button>
        </div>
      )}
    </div>

    <div className="shrink-0 border-t border-gray-200 bg-white px-3 py-2.5 sm:px-5">
      <button type="submit" disabled={isModerating || !currentCoordinate || (registrationStep === 2 && currentEntriesIsFull && !editingId)} className="w-full rounded-2xl bg-pink-600 px-4 py-3 text-sm font-black text-white shadow disabled:cursor-not-allowed disabled:bg-pink-300">
        {isModerating ? '安全確認中…' : registrationStep === 2 ? '③ 登録内容を確認' : editingId ? 'このカードを更新する' : 'このカードで参加する'}
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
              <div>
                <div className="mb-1 flex items-center justify-between gap-2">
                  <label className="block font-bold">アバター名 <span className="text-red-500">*</span></label>
                </div>
                <input type="text" value={userName} onChange={(e) => setUserName(e.target.value)} maxLength={40} placeholder="例：キャラ太郎" className="w-full rounded-xl border px-3 py-2.5" />
              </div>

              <div>
                <div className="mb-1 flex items-center justify-between gap-2">
                  <label className="block font-bold">REALITY プロフURL <span className="text-red-500">*</span></label>
                  <button type="button" onClick={() => setShowProfileHelp(true)} className="rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 py-1.5 text-[9px] font-black text-indigo-700">
                    手順
                  </button>
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
                  <span className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition ${showProfileUrl ? 'bg-indigo-600' : 'bg-gray-300'}`}>
                    <input
                      type="checkbox"
                      checked={showProfileUrl}
                      onChange={(e) => setShowProfileUrl(e.target.checked)}
                      className="peer sr-only"
                    />
                    <span className={`pointer-events-none h-4 w-4 rounded-full bg-white shadow transition ${showProfileUrl ? 'translate-x-6' : 'translate-x-1'}`} />
                  </span>
                </label>
              </div>

              <div>
                <label className="mb-1 block font-bold">アバター画像 <span className="text-red-500">*</span></label>
                <input type="file" accept="image/*" onChange={handleImageUpload} className="w-full text-xs" />
              </div>

              <div>
                <label className="mb-1 block font-bold">編集・削除用の合言葉 <span className="text-red-500">*</span></label>
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="後からの編集・削除に使用します" className="w-full rounded-xl border px-3 py-2.5" />
                <p className="mt-1 text-[9px] text-gray-500">同じ端末では作成者トークンにより省略できます。</p>
              </div>
            </div>
          )}

          {activeEditor === 'skills' && currentCoordinate && (
            <div className="space-y-3 text-xs">
              <div className="flex items-start justify-between gap-2 rounded-xl border border-pink-100 bg-pink-50 px-3 py-2">
                <p className="text-[10px] font-bold leading-4 text-pink-800">4つのスキル名を、自分のキャラらしく設定できます。</p>
                <button type="button" onClick={() => setShowSkillsHelp(true)} className="shrink-0 rounded-lg border border-pink-200 bg-white px-2 py-1 text-[9px] font-black text-pink-700">説明</button>
              </div>
              {[0, 1, 2, 3].map((index) => (
                <div key={index} className="rounded-2xl border border-pink-100 bg-pink-50/50 p-3">
                  <div className="font-black text-pink-700">スキル{index + 1}</div>
                  <div className="mt-2 rounded-xl border border-pink-100 bg-white px-3 py-2">
                    <div className="text-[8px] font-black text-pink-500">効果説明</div>
                    <p className="mt-0.5 text-[9px] font-bold leading-4 text-gray-600">{currentCoordinate.skillDescriptions[index]}</p>
                  </div>
                  <input type="text" value={customSkills[index]} onChange={(e) => handleSkillChange(index, e.target.value)} maxLength={40} className="mt-2 w-full rounded-xl border px-3 py-2.5" />
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
        </div>

        {activeEditor !== 'saved' && (
          <div className="shrink-0 border-t border-gray-200 p-3">
            <button type="button" onClick={() => setActiveEditor(null)} className="w-full rounded-xl bg-gray-900 py-2.5 text-xs font-black text-white">完了</button>
          </div>
        )}
      </div>
    </div>
  )}

  {showProfileHelp && (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/70 p-3 backdrop-blur-sm">
      <div className="w-full max-w-sm overflow-hidden rounded-3xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
          <div className="text-sm font-black">REALITYプロフィールURLの取得手順</div>
          <button type="button" onClick={() => setShowProfileHelp(false)} className="rounded-lg bg-gray-100 px-2.5 py-1.5 text-xs font-black">✕</button>
        </div>

        <div className="min-h-0 max-h-[78dvh] overflow-y-auto p-4 text-[10px] leading-5 text-gray-700">
          <div className="font-black text-indigo-800">① 自分のREALITYプロフィールを開き、共有ボタンをタップ</div>
          <img
            src="/tcg_card/REALITY_USERURL_copy_1.jpg"
            alt="REALITYプロフィール画面で共有ボタンをタップする手順"
            className="mt-2 w-full rounded-2xl border border-gray-200 bg-gray-50 object-contain"
          />

          <div className="mt-5 font-black text-indigo-800">② プロフィールURLをコピーする</div>
          <img
            src="/tcg_card/REALITY_USERURL_copy_2.jpg"
            alt="REALITYプロフィールURLをコピーする手順"
            className="mt-2 w-full rounded-2xl border border-gray-200 bg-gray-50 object-contain"
          />
        </div>

        <div className="border-t border-gray-200 p-3">
          <button type="button" onClick={() => setShowProfileHelp(false)} className="w-full rounded-xl bg-gray-900 py-2.5 text-xs font-black text-white">閉じる</button>
        </div>
      </div>
    </div>
  )}

  {showSkillsHelp && (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/70 p-3 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-3xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
          <div className="text-sm font-black">スキルについて</div>
          <button type="button" onClick={() => setShowSkillsHelp(false)} className="rounded-lg bg-gray-100 px-2.5 py-1.5 text-xs font-black">✕</button>
        </div>
        <div className="p-4 text-[10px] leading-5 text-gray-700">
          <div className="font-black text-pink-800">スキル名</div>
          <p className="mt-1">4つのスキル名は、自分のキャラらしく設定できます。各スキルの下に、そのコーデでの効果説明を表示しています。</p>
        </div>
        <div className="border-t border-gray-200 p-3">
          <button type="button" onClick={() => setShowSkillsHelp(false)} className="w-full rounded-xl bg-gray-900 py-2.5 text-xs font-black text-white">閉じる</button>
        </div>
      </div>
    </div>
  )}
</div>

);
}
