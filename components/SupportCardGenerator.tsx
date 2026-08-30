'use client';

import React, { useState, useEffect, ChangeEvent, FormEvent } from 'react';
import { EmotionPreset, EMOTION_PRESETS } from './emotionPresets';
import type { EntryRecord } from './EntryHub';

interface SupportCardGeneratorProps {
  selectedEmotion?: EmotionPreset | null;
  onBackToHub?: () => void;
}

const DRAFT_KEY = 'reality_world_support_draft';
const ENTRIES_KEY = 'reality_world_entries';
const MY_TOKENS_KEY = 'reality_world_my_tokens';

export default function SupportCardGenerator({ selectedEmotion, onBackToHub }: SupportCardGeneratorProps) {
  // 選択されたエモーションのIDを保持
  const [selectedEmotionId, setSelectedEmotionId] = useState<string>(
    selectedEmotion?.id || EMOTION_PRESETS[0]?.id || ''
  );

  // 一覧の絞り込み用State ('all' または emotion.id)
  const [filterEmotionId, setFilterEmotionId] = useState<string>('all');
  const [filterTarget, setFilterTarget] = useState<string>('ALL');
  const [filterEffect, setFilterEffect] = useState<string>('ALL');
  const [filterDuration, setFilterDuration] = useState<string>('ALL');

  // IDから現在アクティブなエモーションオブジェクトを取得
  const activeEmotion =
    EMOTION_PRESETS.find((e) => e.id === selectedEmotionId) ||
    selectedEmotion ||
    EMOTION_PRESETS[0];

  const [profileUrl, setProfileUrl] = useState('');
  const [userName, setUserName] = useState('');
  const [imageDataUrl, setImageDataUrl] = useState('');
  const [password, setPassword] = useState('');
  const [effectName, setEffectName] = useState(activeEmotion.name);

  const [entries, setEntries] = useState<EntryRecord[]>([]);
  const [myTokens, setMyTokens] = useState<string[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  // 1. 初期ロード：エントリー一覧、所持トークン、下書き(Draft)復元確認
  useEffect(() => {
    try {
      const savedEntries = localStorage.getItem(ENTRIES_KEY);
      if (savedEntries) setEntries(JSON.parse(savedEntries));

      const savedTokens = localStorage.getItem(MY_TOKENS_KEY);
      if (savedTokens) setMyTokens(JSON.parse(savedTokens));

      const savedDraft = localStorage.getItem(DRAFT_KEY);
      if (savedDraft) {
        const draft = JSON.parse(savedDraft);
        if (confirm('前回の作成途中の下書きデータがあります。続きから作成しますか？')) {
          setProfileUrl(draft.profileUrl || '');
          setUserName(draft.userName || '');
          setImageDataUrl(draft.imageDataUrl || '');
          setPassword(draft.password || '');
          if (draft.selectedEmotionId) setSelectedEmotionId(draft.selectedEmotionId);
          if (draft.effectName) setEffectName(draft.effectName);
        } else {
          localStorage.removeItem(DRAFT_KEY);
        }
      }
    } catch {}
  }, []);

  // 外部からのpropsが変更された場合の同期
  useEffect(() => {
    if (selectedEmotion) {
      setSelectedEmotionId(selectedEmotion.id);
      setEffectName(selectedEmotion.name);
    }
  }, [selectedEmotion]);

  // 2. 入力変更ごとの自動下書き保存 (Draft Auto-Save)
  useEffect(() => {
    if (editingId) return;

    const draftData = {
      profileUrl,
      userName,
      imageDataUrl,
      password,
      selectedEmotionId,
      effectName,
    };

    if (profileUrl || userName || imageDataUrl || password) {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(draftData));
    }
  }, [profileUrl, userName, imageDataUrl, password, selectedEmotionId, effectName, editingId]);

  // エモーション切り替えハンドラー
  const handleEmotionChange = (e: ChangeEvent<HTMLSelectElement>) => {
    const newId = e.target.value;
    setSelectedEmotionId(newId);
    const targetEmotion = EMOTION_PRESETS.find((em) => em.id === newId);
    if (targetEmotion) {
      setEffectName(targetEmotion.name);
    }
  };

  const handleImageUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setImageDataUrl(reader.result as string);
    reader.readAsDataURL(file);
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    setErrorMessage('');

    if (!profileUrl.includes('reality.app/user/')) {
      setErrorMessage('有効なREALITYプロフURLを入力してください。');
      return;
    }
    if (!userName.trim() || !imageDataUrl || !password || !effectName.trim()) {
      setErrorMessage('必須項目をすべて入力してください。');
      return;
    }

    let updatedEntries: EntryRecord[];
    let currentTokens = [...myTokens];

    if (editingId) {
      updatedEntries = entries.map((item) => {
        if (item.id === editingId) {
          return {
            ...item,
            presetId: activeEmotion.id,
            profileUrl,
            userName,
            imageDataUrl,
            passwordHash: password,
            customEffectName: effectName.trim(),
          };
        }
        return item;
      });
      setEditingId(null);
      setSuccessMessage('✨ サポートカードを更新しました！');
    } else {
      const newToken = 'token_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
      const newEntry: EntryRecord = {
        id: 'entry_' + Date.now(),
        presetId: activeEmotion.id,
        cardType: 'emotion',
        profileUrl,
        userName,
        imageDataUrl,
        passwordHash: password,
        customEffectName: effectName.trim(),
        ownerToken: newToken,
        firstUser: '自分',
        createdAt: new Date().toISOString(),
      };

      updatedEntries = [newEntry, ...entries];
      currentTokens.push(newToken);
      setSuccessMessage('✨ サポートカードが正常にエントリーされました！');
    }

    setEntries(updatedEntries);
    setMyTokens(currentTokens);

    try {
      localStorage.setItem(ENTRIES_KEY, JSON.stringify(updatedEntries));
      localStorage.setItem(MY_TOKENS_KEY, JSON.stringify(currentTokens));
      localStorage.removeItem(DRAFT_KEY);
    } catch {}

    setProfileUrl('');
    setUserName('');
    setImageDataUrl('');
    setPassword('');
    setEffectName(activeEmotion.name);

    setTimeout(() => setSuccessMessage(''), 2000);
  };

  const startEdit = (entry: EntryRecord) => {
    setProfileUrl(entry.profileUrl);
    setUserName(entry.userName);
    setImageDataUrl(entry.imageDataUrl);
    setPassword(entry.passwordHash);
    setEffectName(entry.customEffectName || '');
    if (entry.presetId) {
      setSelectedEmotionId(entry.presetId);
      const matched = EMOTION_PRESETS.find((e) => e.id === entry.presetId);
      if (matched) setEffectName(entry.customEffectName || matched.name);
    }
    setEditingId(entry.id);
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

  // 絞り込み処理
  const filteredEntries = entries.filter((e) => {
    if (e.cardType !== 'emotion') return false;
    const emotion = EMOTION_PRESETS.find((preset) => preset.id === e.presetId);
    if (!emotion) return false;
    if (filterEmotionId !== 'all' && e.presetId !== filterEmotionId) return false;
    if (filterTarget !== 'ALL' && emotion.target !== filterTarget) return false;
    if (filterEffect !== 'ALL' && emotion.effectCategory !== filterEffect) return false;
    if (filterDuration !== 'ALL' && emotion.duration !== filterDuration) return false;
    return true;
  });

  return (
    <div className="max-w-4xl mx-auto p-6 bg-white rounded-2xl border border-gray-200 shadow-lg space-y-8 text-gray-900">
      <div className="flex justify-between items-center border-b pb-4">
        <div>
          <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-purple-100 text-purple-800">
            1-2 サポートカードとしてエントリー
          </span>
          <h2 className="text-xl font-extrabold text-gray-900 mt-1">
            サポートカード・アバターエントリー
          </h2>
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
        {/* --- 左側: 入力フォーム --- */}
        <div className="space-y-5">
          {errorMessage && (
            <div className="p-3 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg">
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

            {/* エモーション選択（フォーム内の一覧として配置） */}
            <div className="pt-2 border-t border-gray-100">
              <div className="flex justify-between items-center mb-1">
                <label htmlFor="emotion-select" className="block font-bold text-purple-900">
                  ✨ エモーション選択 <span className="text-red-500">*</span>
                </label>
                {onBackToHub && (
                  <button
                    type="button"
                    onClick={onBackToHub}
                    className="text-[10px] text-purple-600 underline font-bold hover:text-purple-800 cursor-pointer"
                  >
                    別アバター選択画面から探す →
                  </button>
                )}
              </div>
              <select
                id="emotion-select"
                value={activeEmotion.id}
                onChange={handleEmotionChange}
                className="w-full px-3 py-2 bg-purple-50 border border-purple-300 rounded-lg font-bold text-purple-900 focus:outline-none focus:ring-2 focus:ring-purple-500 cursor-pointer"
              >
                {EMOTION_PRESETS.map((emotion) => (
                  <option key={emotion.id} value={emotion.id}>
                    {emotion.name} ({emotion.statEffect})
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-gray-600 leading-relaxed mt-1.5 bg-gray-50 p-2 rounded border border-gray-100">
                💡 <span className="font-semibold text-gray-800">{activeEmotion.name}:</span> {activeEmotion.description}
              </p>
              {activeEmotion.note && (
                <p className="text-[10px] text-gray-500 leading-relaxed">備考：{activeEmotion.note}</p>
              )}
            </div>

            <div className="pt-2 border-t border-gray-100">
              <label className="block font-bold text-gray-700 mb-1">
                効果名称設定（1つ・変更可能） <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={effectName}
                onChange={(e) => setEffectName(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-purple-500 bg-white font-bold text-purple-900"
              />
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
                className="w-full py-2.5 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-xl transition cursor-pointer shadow"
              >
                {editingId ? 'エントリー内容を更新する' : 'カードをエントリーして保存'}
              </button>
            </div>
          </form>
        </div>

        {/* --- 右側: ライブプレビュー --- */}
        <div>
          <h2 className="text-lg font-bold text-gray-900 mb-3">ライブプレビュー</h2>
          <div className="p-4 border-4 border-purple-400 rounded-2xl bg-white shadow-md max-w-xs mx-auto space-y-3">
            <div className="flex justify-between items-center">
              <span className="font-bold px-2.5 py-1 rounded text-white text-xs bg-purple-600">
                サポートカード
              </span>
              <span className="text-xs font-bold text-gray-700">
                対象: {activeEmotion.target} / {activeEmotion.duration}
              </span>
            </div>

            <div className="text-center">
              <h3 className="font-extrabold text-gray-900 text-lg">
                {userName || 'ユーザー名'}
              </h3>
              <p className="text-xs font-semibold text-purple-600 mt-0.5">
                ✨ {activeEmotion.name}
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

            <div className="text-xs bg-purple-50 border border-purple-100 p-2.5 rounded-lg space-y-1">
              <div className="font-bold text-purple-900 border-b border-purple-200 pb-1 flex justify-between">
                <span>🛡️ 効果仕様</span>
                <span className="text-purple-700">
                  {activeEmotion.statEffect} {activeEmotion.effectAmount ? `(${activeEmotion.effectAmount})` : ''} / {activeEmotion.duration}
                </span>
              </div>
              <p className="text-[11px] text-gray-700 leading-relaxed">
                {activeEmotion.description}
              </p>
              {activeEmotion.note && (
                <p className="text-[10px] text-gray-500 leading-relaxed">備考：{activeEmotion.note}</p>
              )}
            </div>

            <div className="text-xs bg-gray-50 border border-gray-200 p-2.5 rounded-lg space-y-1">
              <div className="font-bold text-gray-800 border-b border-gray-200 pb-1 mb-1">
                ⚡ 設定効果名称
              </div>
              <div className="text-purple-700 font-bold flex justify-between">
                <span>効果名:</span>
                <span className="truncate max-w-[180px]">{effectName || '名称未設定'}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* --- 下部: エントリーカード一覧 (絞り込み・トークン認証付き) --- */}
      <div className="pt-6 border-t border-gray-200 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <h3 className="font-bold text-base text-gray-900">エントリーされたカード一覧</h3>

          {/* エモーションでの絞り込みフィルター */}
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
              {Array.from(new Set(EMOTION_PRESETS.map((em) => em.effectCategory))).map((category) => (
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
              {EMOTION_PRESETS.map((em) => <option key={em.id} value={em.id}>{em.name}</option>)}
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
              const isOwner = myTokens.includes(entry.ownerToken);
              const emotionInfo = EMOTION_PRESETS.find((e) => e.id === entry.presetId);

              return (
                <div
                  key={entry.id}
                  className="p-4 border rounded-xl bg-gray-50 flex items-center justify-between space-x-3 shadow-sm hover:shadow transition"
                >
                  <div className="flex items-center space-x-3 overflow-hidden">
                    <img
                      src={entry.imageDataUrl}
                      alt=""
                      className="w-12 h-12 rounded-lg object-cover flex-shrink-0 border"
                    />
                    <div className="truncate text-xs">
                      <div className="font-bold text-gray-900 truncate">{entry.userName}</div>
                      <div className="text-[10px] text-purple-700 font-bold truncate">
                        ✨ {emotionInfo?.name || 'エモーション'}
                      </div>
                      <div className="text-[10px] text-gray-400 truncate">{entry.profileUrl}</div>
                    </div>
                  </div>

                  <div className="flex flex-col space-y-1 text-xs flex-shrink-0">
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
                        className="px-2 py-1 bg-gray-700 text-white rounded font-bold hover:bg-gray-800 cursor-pointer text-[10px]"
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