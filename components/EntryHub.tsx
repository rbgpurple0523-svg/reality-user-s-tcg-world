'use client';

import React, { useMemo, useState } from 'react';
import { EMOTION_PRESETS } from './emotionPresets';
import type { EmotionPreset } from './emotionPresets';

// =========================================================
// 正本データ・共通型
// =========================================================
import {
  COORDINATE_PRESETS,
  STAT_LABELS,
  STAT_RANKS,
  type Archetype,
  type CardColor,
  type CoordinatePreset,
  type Season,
  type StatKey,
} from './coordinatePresets';
import type { ColorType } from './colorTypes';

export type {
  Archetype,
  CardColor,
  CoordinatePreset,
  Season,
  StatKey,
};
export { COORDINATE_PRESETS };

export interface EntryRecord {
  id: string;
  presetId: string;
  cardType: 'coordinate' | 'emotion';
  profileUrl: string;
  userName: string;
  imageDataUrl: string;
  passwordHash: string;
  firstUser: string;
  ownerToken?: string;
  customEffectName?: string;
  customSkills?: [string, string, string, string];
  skillDescriptions?: [string, string, string, string];
  skillVoices?: [string, string, string, string];
  flavorText?: string;
  color?: CardColor;
  colorHex?: string;
  colorType?: ColorType;
  season?: Season;
  archetype?: Archetype;
  hp?: number;
  ap?: number;
  createdAt: string;
  updatedAt?: string;
}

interface EntryHubProps {
  onBackToMenu?: () => void;
  onGoToDeckBuilder?: () => void;
  onStartCharacterRegistration?: (
    preset?: CoordinatePreset,
  ) => void;
  onStartSupportRegistration?: (
    preset?: EmotionPreset,
  ) => void;
}

const ENTRIES_KEY = 'reality_world_entries';

export default function EntryHub({
  onBackToMenu,
  onGoToDeckBuilder,
  onStartCharacterRegistration,
  onStartSupportRegistration,
}: EntryHubProps) {
  const [activeTab, setActiveTab] = useState<'coordinate' | 'emotion'>('coordinate');
  const [entries, setEntries] = useState<EntryRecord[]>(() => {
    if (typeof window === 'undefined') return [];
    try {
      const saved = localStorage.getItem(ENTRIES_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [coordSearchFilter, setCoordSearchFilter] = useState('');
  const [coordArchetypeFilter, setCoordArchetypeFilter] = useState('ALL');
  const [emoTargetFilter, setEmoTargetFilter] = useState('ALL');
  const [emoStatFilter, setEmoStatFilter] = useState('ALL');
  const [emoDurationFilter, setEmoDurationFilter] = useState('ALL');

  const getEntryCount = (presetId: string) =>
    entries.filter((entry) => entry.presetId === presetId).length;

  const totalPossibleSlots = COORDINATE_PRESETS.length + EMOTION_PRESETS.length;

  // 「1人以上が登録された枠」の充足率を基準にする。
  const filledPresetCount = useMemo(
    () =>
      [...COORDINATE_PRESETS, ...EMOTION_PRESETS].filter(
        (preset) => getEntryCount(preset.id) >= 1,
      ).length,
    [entries],
  );
  const fillRate = filledPresetCount / Math.max(1, totalPossibleSlots);

  const countAtLeastOneRate = filledPresetCount / Math.max(1, totalPossibleSlots);
  const countAtLeastTwo = useMemo(
    () =>
      [...COORDINATE_PRESETS, ...EMOTION_PRESETS].filter(
        (preset) => getEntryCount(preset.id) >= 2,
      ).length,
    [entries],
  );
  const countAtLeastTwoRate = countAtLeastTwo / Math.max(1, totalPossibleSlots);

  const maxEntryLimit =
    countAtLeastOneRate >= 0.9 && countAtLeastTwoRate >= 0.5
      ? 3
      : countAtLeastOneRate >= 0.5
        ? 2
        : 1;

  const coordinateMatrix = useMemo(() => {
    const stats: StatKey[] = ['hp', 'intellect', 'dexterity', 'charm'];
    return stats.map((primary) => ({
      primary,
      cells: stats.map((secondary) => {
        if (primary === secondary) return [];
        return COORDINATE_PRESETS.filter((coordinate) => {
          const rank = STAT_RANKS[coordinate.code];
          return rank[0] === primary && rank[1] === secondary;
        });
      }),
    }));
  }, []);

  const filteredCoordinates = useMemo(() => {
    const q = coordSearchFilter.trim().toLowerCase();
    return COORDINATE_PRESETS.filter((coordinate) => {
      const matchSearch =
        !q ||
        coordinate.code.includes(q) ||
        coordinate.name.toLowerCase().includes(q) ||
        coordinate.tendency.toLowerCase().includes(q);
      const matchArchetype =
        coordArchetypeFilter === 'ALL' || coordinate.archetype === coordArchetypeFilter;
      return matchSearch && matchArchetype;
    });
  }, [coordSearchFilter, coordArchetypeFilter]);

  const filteredEmotions = useMemo(
    () =>
      EMOTION_PRESETS.filter((emotion) => {
        const matchTarget = emoTargetFilter === 'ALL' || emotion.target === emoTargetFilter;
        const matchStat = emoStatFilter === 'ALL' || emotion.effectCategory === emoStatFilter;
        const matchDuration = emoDurationFilter === 'ALL' || emotion.duration === emoDurationFilter;
        return matchTarget && matchStat && matchDuration;
      }),
    [emoTargetFilter, emoStatFilter, emoDurationFilter],
  );

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6 text-gray-900 bg-gray-50 min-h-screen rounded-2xl">
      <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm space-y-4">
        <div className="flex justify-between items-start gap-4">
          <div>
            <h1 className="text-2xl font-extrabold">コーデ・エモーション一覧から選んでエントリー</h1>
            <p className="text-xs text-gray-500 mt-1">
              公式に用意された性能枠へ、自分のアバターを登録します。性能そのものは編集できません。
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            {onGoToDeckBuilder && (
              <button
                type="button"
                onClick={onGoToDeckBuilder}
                className="px-3 py-2 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-bold border border-indigo-100"
              >
                🃏 デッキを構築する
              </button>
            )}
            {onStartCharacterRegistration && (
              <button
                type="button"
                onClick={() => onStartCharacterRegistration()}
                className="px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold"
              >
                👤 キャラカードを登録
              </button>
            )}
            {onStartSupportRegistration && (
              <button
                type="button"
                onClick={() => onStartSupportRegistration()}
                className="px-3 py-2 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold"
              >
                ✨ サポートカードを登録
              </button>
            )}
            {onBackToMenu && (
              <button
                type="button"
                onClick={onBackToMenu}
                className="px-3 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-xs font-bold"
              >
                ← メニューへ
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 pt-2 border-t border-gray-100 text-xs">
          <div className="p-2 rounded-lg border bg-indigo-50 border-indigo-200 text-indigo-800 font-bold text-center">
            🔓 上限1人
          </div>
          <div className={`p-2 rounded-lg border text-center ${maxEntryLimit >= 2 ? 'bg-indigo-50 border-indigo-200 text-indigo-800 font-bold' : 'bg-gray-50 text-gray-400'}`}>
            🔓 上限2人 {maxEntryLimit >= 2 ? '✨解放' : '(50%以上で解放)'}
          </div>
          <div className={`p-2 rounded-lg border text-center ${maxEntryLimit >= 3 ? 'bg-purple-50 border-purple-200 text-purple-800 font-bold' : 'bg-gray-50 text-gray-400'}`}>
            🌟 上限3人 {maxEntryLimit >= 3 ? '✨解放' : '(90%/50%条件で解放)'}
          </div>
        </div>
        <div className="text-xs text-gray-500">
          現在の枠充足率：<span className="font-bold text-indigo-700">{(fillRate * 100).toFixed(1)}%</span>
          <span className="ml-3">1人以上：{filledPresetCount}/{totalPossibleSlots}</span>
          <span className="ml-3">2人以上：{countAtLeastTwo}/{totalPossibleSlots}</span>
        </div>
      </div>

      {/* コーデ */}
      <section className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <button
          type="button"
          onClick={() => setActiveTab('coordinate')}
          className="w-full p-5 bg-indigo-900 text-white flex justify-between items-center text-left font-bold"
        >
          <div>
            <div className="text-lg">👗 コーデ一覧（キャラカードの性能）</div>
            <div className="text-xs font-normal text-indigo-200 mt-1">1位ステータス × 2位ステータスの25枠</div>
          </div>
          <span className="text-xs">{activeTab === 'coordinate' ? '▼ 開き中' : '▶ 開く'}</span>
        </button>

        {activeTab === 'coordinate' && (
          <div className="p-6 space-y-6">
            <div className="p-4 bg-gray-50 rounded-xl border border-gray-200 flex flex-wrap gap-3 items-center text-xs">
              <span className="font-bold">🔍 絞り込み</span>
              <input
                value={coordSearchFilter}
                onChange={(e) => setCoordSearchFilter(e.target.value)}
                placeholder="P-1〜A-1 / 傾向で検索"
                className="px-3 py-2 border rounded-lg bg-white min-w-52"
              />
              <select
                value={coordArchetypeFilter}
                onChange={(e) => setCoordArchetypeFilter(e.target.value)}
                className="px-3 py-2 border rounded-lg bg-white"
              >
                <option value="ALL">タイプ：すべて</option>
                <option value="マッスル型">マッスル型</option>
                <option value="頭脳型">頭脳型</option>
                <option value="ディーバ型">ディーバ型</option>
                <option value="職人型">職人型</option>
              </select>
            </div>

            <div className="overflow-x-auto rounded-xl border border-gray-200">
              <div className="min-w-[760px]">
                <div className="grid grid-cols-5 bg-indigo-50 text-[10px] font-black text-indigo-900">
                  <div className="p-2">1位 ＼ 2位</div>
                  {(['hp', 'intellect', 'dexterity', 'charm'] as StatKey[]).map((key) => (
                    <div key={key} className="p-2 text-center">{STAT_LABELS[key]}</div>
                  ))}
                </div>
                {coordinateMatrix.map((row) => (
                  <div key={row.primary} className="grid grid-cols-5 border-t border-gray-200">
                    <div className="p-2 bg-gray-50 text-[10px] font-black">{STAT_LABELS[row.primary]}</div>
                    {row.cells.map((cell, index) => (
                      <div key={index} className="min-h-20 border-l border-gray-200 p-1.5 space-y-1">
                        {cell.map((coordinate) => (
                          <button
                            key={coordinate.id}
                            type="button"
                            onClick={() => onStartCharacterRegistration?.(coordinate)}
                            className="w-full rounded-lg border border-indigo-100 bg-white px-2 py-2 text-left text-[9px] hover:border-indigo-400 hover:bg-indigo-50"
                          >
                            <div className="font-black text-indigo-900">
                              {coordinate.code.toUpperCase()} <span className="font-normal">{coordinate.tendency}</span>
                            </div>
                            <div className="text-gray-500 mt-0.5">
                              {coordinate.stats.hp}/{coordinate.stats.intellect}/{coordinate.stats.dexterity}/{coordinate.stats.charm}
                            </div>
                          </button>
                        ))}
                      </div>
                    ))}
                  </div>
                ))}
                <div className="border-t border-gray-200 p-2">
                  <button
                    type="button"
                    onClick={() => {
                      const balanced = COORDINATE_PRESETS.find((coordinate) => coordinate.code === 'a1');
                      if (balanced) onStartCharacterRegistration?.(balanced);
                    }}
                    className="w-full rounded-lg border border-purple-200 bg-purple-50 p-2 text-left text-xs hover:bg-purple-100"
                  >
                    <span className="font-black">A-1</span>：体力＝知略＝器用＝特技（均等型）
                  </button>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredCoordinates.map((coordinate) => {
                const count = getEntryCount(coordinate.id);
                const isFull = count >= maxEntryLimit;
                const presetEntries = entries.filter((entry) => entry.presetId === coordinate.id);

                return (
                  <article key={coordinate.id} className="border border-gray-200 rounded-xl p-4 bg-white shadow-sm space-y-4">
                    <div className="flex justify-between items-start gap-3">
                      <div>
                        <span className="text-xs font-black px-2 py-1 bg-indigo-100 text-indigo-800 rounded">{coordinate.code.toUpperCase()}</span>
                        <h3 className="font-extrabold text-base mt-2">{coordinate.name}</h3>
                        <div className="text-[11px] text-indigo-700 font-bold mt-1">傾向：{coordinate.tendency}</div>
                      </div>
                      <span className="text-[10px] font-bold text-gray-500">性能固定</span>
                    </div>

                    <div className="text-[11px] bg-gray-50 p-3 rounded border grid grid-cols-2 gap-1">
                      <div>体力：<b>{coordinate.stats.hp}</b></div>
                      <div>知略：<b>{coordinate.stats.intellect}</b></div>
                      <div>特技：<b>{coordinate.stats.charm}</b></div>
                      <div>器用：<b>{coordinate.stats.dexterity}</b></div>
                    </div>

                    <div className="text-[10px] bg-indigo-50/60 p-3 rounded border border-indigo-100 space-y-1">
                      <div className="font-bold text-indigo-800">固定されている4技</div>
                      {coordinate.defaultSkills.map((skill, index) => (
                        <div key={`${coordinate.id}-skill-${index}`}>
                          <span className="font-bold">技{index + 1} {skill}</span>
                          <span className="text-gray-600">：{coordinate.skillDescriptions[index]}</span>
                        </div>
                      ))}
                    </div>

                    <div className="text-xs space-y-2">
                      <div className="flex justify-between font-semibold">
                        <span>エントリー状況</span>
                        <span className={isFull ? 'text-red-600' : 'text-green-600'}>{count} / {maxEntryLimit}人 {isFull && '(満員)'}</span>
                      </div>
                      {presetEntries.length > 0 && (
                        <div className="text-[11px] bg-indigo-50 p-2 rounded border border-indigo-100 text-indigo-900">
                          <div>👑 先駆者：<span className="font-bold">{presetEntries[0].userName}</span> さん</div>
                          <div className="text-gray-500 mt-0.5">現在 {presetEntries.length}人がエントリー</div>
                        </div>
                      )}
                    </div>

                    <button
                      type="button"
                      disabled={isFull}
                      onClick={() => onStartCharacterRegistration?.(coordinate)}
                      className={`w-full py-2.5 rounded-lg text-xs font-bold ${isFull ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-700 text-white'}`}
                    >
                      {isFull ? 'エントリー満員' : 'このコーデを選んでエントリーする'}
                    </button>
                  </article>
                );
              })}
            </div>
          </div>
        )}
      </section>

      {/* エモーション */}
      <section className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <button
          type="button"
          onClick={() => setActiveTab('emotion')}
          className="w-full p-5 bg-purple-900 text-white flex justify-between items-center text-left font-bold"
        >
          <div>
            <div className="text-lg">✨ エモーション一覧（サポートカードの性能）</div>
            <div className="text-xs font-normal text-purple-200 mt-1">対象 × 効果内容 × 持続性の3軸</div>
          </div>
          <span className="text-xs">{activeTab === 'emotion' ? '▼ 開き中' : '▶ 開く'}</span>
        </button>

        {activeTab === 'emotion' && (
          <div className="p-6 space-y-6">
            <div className="p-4 bg-gray-50 rounded-xl border border-gray-200 flex flex-wrap gap-3 items-center text-xs">
              <span className="font-bold">🔍 3軸絞り込み</span>
              <select value={emoTargetFilter} onChange={(e) => setEmoTargetFilter(e.target.value)} className="px-3 py-2 border rounded-lg bg-white">
                <option value="ALL">対象：すべて</option>
                <option value="自分">自分</option>
                <option value="相手">相手</option>
                <option value="自分・相手">自分・相手</option>
              </select>
              <select value={emoStatFilter} onChange={(e) => setEmoStatFilter(e.target.value)} className="px-3 py-2 border rounded-lg bg-white">
                <option value="ALL">効果：すべて</option>
                {Array.from(new Set(EMOTION_PRESETS.map((emotion) => emotion.effectCategory))).map((category) => (
                  <option key={category} value={category}>{category}</option>
                ))}
              </select>
              <select value={emoDurationFilter} onChange={(e) => setEmoDurationFilter(e.target.value)} className="px-3 py-2 border rounded-lg bg-white">
                <option value="ALL">持続：すべて</option>
                <option value="一時">一時</option>
                <option value="永続">永続</option>
              </select>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredEmotions.map((emotion) => {
                const count = getEntryCount(emotion.id);
                const isFull = count >= maxEntryLimit;
                const presetEntries = entries.filter((entry) => entry.presetId === emotion.id);

                return (
                  <article key={emotion.id} className="border border-gray-200 rounded-xl p-4 bg-white shadow-sm space-y-4">
                    <div>
                      <div className="flex flex-wrap gap-1.5">
                        <span className="text-xs font-bold px-2 py-1 bg-purple-100 text-purple-800 rounded">
                          {emotion.target}
                        </span>
                        <span className="text-xs font-bold px-2 py-1 bg-purple-100 text-purple-800 rounded">
                          {emotion.effectCategory}
                        </span>
                        <span className="text-xs font-bold px-2 py-1 bg-purple-100 text-purple-800 rounded">
                          {emotion.duration}
                        </span>
                      </div>
                      <h3 className="font-extrabold text-base mt-2">{emotion.name}</h3>
                      <p className="text-xs text-gray-600 leading-relaxed mt-1">{emotion.description}</p>
                      <div className="text-[11px] text-purple-800 font-semibold mt-2">
                        効果：{emotion.statEffect}{emotion.effectAmount ? ` / ${emotion.effectAmount}` : ''}
                      </div>
                      {emotion.note && (
                        <div className="text-[10px] text-gray-500 leading-relaxed mt-1">備考：{emotion.note}</div>
                      )}
                    </div>

                    <div className="text-xs space-y-2">
                      <div className="flex justify-between font-semibold">
                        <span>エントリー状況</span>
                        <span className={isFull ? 'text-red-600' : 'text-green-600'}>
                          {count} / {maxEntryLimit}人 {isFull && '(満員)'}
                        </span>
                      </div>
                      {presetEntries.length > 0 && (
                        <div className="text-[11px] bg-purple-50 p-2 rounded border border-purple-100 text-purple-900">
                          👑 先駆者：<span className="font-bold">{presetEntries[0].userName}</span> さん
                          <div className="text-gray-500 mt-0.5">現在 {presetEntries.length}人がエントリー</div>
                        </div>
                      )}
                    </div>

                    <button
                      type="button"
                      disabled={isFull}
                      onClick={() => onStartSupportRegistration?.(emotion)}
                      className={`w-full py-2.5 rounded-lg text-xs font-bold ${isFull ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'bg-purple-600 hover:bg-purple-700 text-white'}`}
                    >
                      {isFull ? 'エントリー満員' : 'このエモーションを選んでエントリーする'}
                    </button>
                  </article>
                );
              })}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
