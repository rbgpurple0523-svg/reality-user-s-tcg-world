'use client';

import React, { useState, useEffect, ChangeEvent, useMemo } from 'react';
import { CHARACTER_SAMPLE_CARDS } from './characterSampleCards';
import { EMOTION_PRESETS } from './emotionPresets';
import { createVirtualSupportCards, VIRTUAL_SUPPORT_PREFIX } from './supportSampleCards';

// --- LocalStorage キー定義 ---
const STORAGE_ENTRIES_KEY = 'reality_world_entries';
const STORAGE_DECKS_KEY = 'reality_decks';

// --- 作成画面側 (CardGenerator / SupportCardGenerator) の保存型 ---
export interface EntryRecord {
  id: string;
  cardType: 'coordinate' | 'emotion';
  title?: string;
  userName?: string;
  description?: string;
  effect?: string;
  imageUrl?: string;
  imageDataUrl?: string;
  color?: string;
  archetype?: string;
  hp?: number;
  ap?: number;
  type?: string;
  cost?: number;
  rarity?: string;
  category?: string;
  presetId?: string;
  customEffectName?: string;
  passwordHash?: string;
  ownerToken?: string;
  firstUser?: string;
  createdAt?: string;
}

// --- DeckBuilder 内で扱う型定義 ---
export interface AvatarCard {
  id: string;
  userName: string;
  color: string;
  archetype: string;
  imageDataUrl?: string;
  hp?: number;
  ap?: number;
}

export interface SupportCard {
  id: string;
  name: string;
  description: string;
  cost?: number;
  category?: string;
  imageDataUrl?: string;
  presetId?: string;
  isVirtual?: boolean;
}

export interface Deck {
  id: string;
  name: string;
  vanguardCardId: string | null;
  centerCardId: string | null;
  generalCardId: string | null;
  supportCardIds: string[];
  createdAt?: string;
  updatedAt?: string;
}

type PositionRole = 'vanguard' | 'center' | 'general';

export default function DeckBuilder() {
  const [cards, setCards] = useState<AvatarCard[]>([]);
  const [supportPool, setSupportPool] = useState<SupportCard[]>([]);
  
  const [decks, setDecks] = useState<Deck[]>([]);
  const [selectedDeckId, setSelectedDeckId] = useState<string | null>(null);
  const [deckName, setDeckName] = useState<string>('新規デッキ');
  
  const [vanguardId, setVanguardId] = useState<string | null>(null);
  const [centerId, setCenterId] = useState<string | null>(null);
  const [generalId, setGeneralId] = useState<string | null>(null);
  const [supportIds, setSupportIds] = useState<string[]>([]);
  
  // 選択モード用ステート
  const [selectedTargetRole, setSelectedTargetRole] = useState<PositionRole | null>(null);
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  
  const [message, setMessage] = useState<string>('');

  // 🔍 キャラカード専用 絞り込みステート
  const [isCharFilterOpen, setIsCharFilterOpen] = useState<boolean>(false);
  const [charSearchQuery, setCharSearchQuery] = useState<string>('');
  const [selectedColors, setSelectedColors] = useState<string[]>([]);
  const [selectedArchetypes, setSelectedArchetypes] = useState<string[]>([]);

  // 🔍 サポートカード専用 検索ステート
  const [supSearchQuery, setSupSearchQuery] = useState<string>('');

  // 仮サポートIDを、同じエモーションに実エントリーがあれば実カードへ解決します。
  const resolveSupportIds = (ids: string[], emotionEntries: EntryRecord[]) => {
    const realByPreset = new Map<string, string[]>();
    emotionEntries.forEach(entry => {
      if (!entry.presetId) return;
      const list = realByPreset.get(entry.presetId) || [];
      list.push(entry.id);
      realByPreset.set(entry.presetId, list);
    });

    const usedPerPreset = new Map<string, number>();
    return ids.map(id => {
      if (!id.startsWith(VIRTUAL_SUPPORT_PREFIX)) return id;
      const presetId = id.slice(VIRTUAL_SUPPORT_PREFIX.length);
      const realIds = realByPreset.get(presetId);
      if (!realIds || realIds.length === 0) return id;
      const used = usedPerPreset.get(presetId) || 0;
      const resolved = realIds[used % realIds.length];
      usedPerPreset.set(presetId, used + 1);
      return resolved;
    });
  };

  useEffect(() => {
    // エントリー前からデッキに組み込める公式コーデ仮キャラだけを使用。
    const defaultAvatars: AvatarCard[] = CHARACTER_SAMPLE_CARDS.map(a => ({
      id: a.id,
      userName: a.userName,
      color: a.color,
      archetype: a.archetype,
      imageDataUrl: a.imageDataUrl,
      hp: a.stats.hp,
      ap: a.stats.intellect
    }));

    // 1. LocalStorage から reality_world_entries を取得
    const rawEntries = localStorage.getItem(STORAGE_ENTRIES_KEY);
    if (rawEntries) {
      try {
        const entries: EntryRecord[] = JSON.parse(rawEntries);

        // キャラカード (coordinate) の抽出
        const loadedAvatars: AvatarCard[] = entries
          .filter(e => e.cardType === 'coordinate')
          .map(e => ({
            id: e.id,
            userName: e.userName || e.title || '無題のキャラ',
            color: e.color || e.type || 'ノーマル',
            archetype: e.archetype || e.rarity || '一般',
            imageDataUrl: e.imageDataUrl || e.imageUrl || '',
            hp: e.hp,
            ap: e.ap,
          }));

        // サポートカード (emotion) の抽出
        const loadedSupports: SupportCard[] = entries
          .filter(e => e.cardType === 'emotion')
          .map(e => {
            const preset = EMOTION_PRESETS.find(em => em.id === e.presetId);
            return {
              id: e.id,
              name: e.customEffectName || e.title || preset?.name || '無題のサポート',
              description: e.effect || e.description || preset?.description || '',
              cost: e.cost || 1,
              category: e.category || preset?.effectCategory || 'サポート',
              imageDataUrl: e.imageDataUrl || e.imageUrl || '',
              presetId: e.presetId,
              isVirtual: false,
            };
          });

        // サンプルキャラとユーザー作成キャラの統合 (重複除外)
        const combinedAvatars = [...defaultAvatars];
        loadedAvatars.forEach(ca => {
          if (!combinedAvatars.some(a => a.id === ca.id)) {
            combinedAvatars.push(ca);
          }
        });
        setCards(combinedAvatars);

        // 固定サンプル + エントリー前の公式エモーション仮カード + 実エントリーを統合。
        // 実エントリー済みのエモーションには仮カードを出さず、実カードを使用します。
        const enteredPresetIds = new Set(
          loadedSupports.map(s => s.presetId).filter((id): id is string => Boolean(id))
        );
        const virtualEmotionSupports: SupportCard[] = createVirtualSupportCards(enteredPresetIds);
        const combinedSupports = [...virtualEmotionSupports];
        loadedSupports.forEach(cs => {
          if (!combinedSupports.some(s => s.id === cs.id)) {
            combinedSupports.push(cs);
          }
        });
        setSupportPool(combinedSupports);
      } catch (e) {
        console.error('Failed to parse reality_world_entries', e);
        setCards(defaultAvatars);
        setSupportPool(createVirtualSupportCards());
      }
    } else {
      // LocalStorage に何もない場合はサンプルの全データを使用
      setCards(defaultAvatars);
      setSupportPool(createVirtualSupportCards());
    }

    // 2. デッキデータの取得
    const rawDecks = localStorage.getItem(STORAGE_DECKS_KEY);
    if (rawDecks) {
      try {
        const parsedDecks: Deck[] = JSON.parse(rawDecks);
        // 以前に仮カードを入れて保存したデッキは、実エントリーが存在すれば自動的に差し替えます。
        const rawEntriesForDecks = localStorage.getItem(STORAGE_ENTRIES_KEY);
        const emotionEntriesForDecks: EntryRecord[] = rawEntriesForDecks
          ? (() => {
              try {
                const allEntries: EntryRecord[] = JSON.parse(rawEntriesForDecks);
                return allEntries.filter(e => e.cardType === 'emotion');
              } catch {
                return [];
              }
            })()
          : [];
        const resolvedDecks = parsedDecks.map(deck => ({
          ...deck,
          supportCardIds: resolveSupportIds(deck.supportCardIds || [], emotionEntriesForDecks),
        }));
        setDecks(resolvedDecks);
        if (resolvedDecks.length > 0) {
          loadDeckToEditor(resolvedDecks[0]);
        }
      } catch (e) {
        console.error('Failed to parse decks', e);
      }
    }
  }, []);

  // 重複サポートカードの集約計算
  const groupedSupportCards = useMemo(() => {
    const map = new Map<string, number>();
    supportIds.forEach(id => {
      map.set(id, (map.get(id) || 0) + 1);
    });
    return Array.from(map.entries()).map(([id, count]) => ({
      id,
      count,
      data: supportPool.find(s => s.id === id)
    }));
  }, [supportIds, supportPool]);

  // カラー・タイプ一覧抽出
  const availableColors = useMemo(() => {
    const set = new Set<string>();
    cards.forEach(c => { if (c.color) set.add(c.color); });
    return Array.from(set);
  }, [cards]);

  const availableArchetypes = useMemo(() => {
    const set = new Set<string>();
    cards.forEach(c => { if (c.archetype) set.add(c.archetype); });
    return Array.from(set);
  }, [cards]);

  // フィルター処理
  const toggleColorFilter = (color: string) => {
    setSelectedColors(prev =>
      prev.includes(color) ? prev.filter(c => c !== color) : [...prev, color]
    );
  };

  const toggleArchetypeFilter = (arch: string) => {
    setSelectedArchetypes(prev =>
      prev.includes(arch) ? prev.filter(a => a !== arch) : [...prev, arch]
    );
  };

  const clearCharFilters = () => {
    setCharSearchQuery('');
    setSelectedColors([]);
    setSelectedArchetypes([]);
  };

  // 絞り込み済みキャラカード一覧
  const filteredCards = useMemo(() => {
    return cards.filter(card => {
      if (charSearchQuery.trim()) {
        const q = charSearchQuery.toLowerCase();
        const matchName = card.userName?.toLowerCase().includes(q);
        const matchColor = card.color?.toLowerCase().includes(q);
        const matchArchetype = card.archetype?.toLowerCase().includes(q);
        if (!matchName && !matchColor && !matchArchetype) return false;
      }
      if (selectedColors.length > 0 && !selectedColors.includes(card.color)) {
        return false;
      }
      if (selectedArchetypes.length > 0 && !selectedArchetypes.includes(card.archetype)) {
        return false;
      }
      return true;
    });
  }, [cards, charSearchQuery, selectedColors, selectedArchetypes]);

  // 絞り込み済みサポートカード一覧
  const filteredSupportCards = useMemo(() => {
    return supportPool.filter(sup => {
      if (supSearchQuery.trim()) {
        const q = supSearchQuery.toLowerCase();
        const matchName = sup.name.toLowerCase().includes(q);
        const matchDesc = sup.description.toLowerCase().includes(q);
        if (!matchName && !matchDesc) return false;
      }
      return true;
    });
  }, [supportPool, supSearchQuery]);

  const loadDeckToEditor = (deck: Deck) => {
    setSelectedDeckId(deck.id);
    setDeckName(deck.name);
    setVanguardId(deck.vanguardCardId);
    setCenterId(deck.centerCardId);
    setGeneralId(deck.generalCardId);
    setSupportIds(deck.supportCardIds || []);
    resetSelections();
  };

  const resetToNewDeck = () => {
    setSelectedDeckId(null);
    setDeckName(`デッキ ${decks.length + 1}`);
    setVanguardId(null);
    setCenterId(null);
    setGeneralId(null);
    setSupportIds([]);
    resetSelections();
    setMessage('');
  };

  const resetSelections = () => {
    setSelectedTargetRole(null);
    setSelectedCardId(null);
  };

  const assignCardToRole = (cardId: string, role: PositionRole) => {
    if (vanguardId === cardId) setVanguardId(null);
    if (centerId === cardId) setCenterId(null);
    if (generalId === cardId) setGeneralId(null);

    if (role === 'vanguard') setVanguardId(cardId);
    if (role === 'center') setCenterId(cardId);
    if (role === 'general') setGeneralId(cardId);

    resetSelections();
    setMessage('');
  };

  const handleSlotClick = (role: PositionRole) => {
    if (selectedCardId) {
      assignCardToRole(selectedCardId, role);
    } else {
      setSelectedTargetRole(prev => prev === role ? null : role);
    }
  };

  const handleCardClick = (cardId: string) => {
    if (selectedTargetRole) {
      assignCardToRole(cardId, selectedTargetRole);
    } else {
      setSelectedCardId(prev => prev === cardId ? null : cardId);
    }
  };

  const handleDragStart = (e: React.DragEvent, cardId: string) => {
    e.dataTransfer.setData('text/plain', cardId);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent, role: PositionRole) => {
    e.preventDefault();
    const cardId = e.dataTransfer.getData('text/plain');
    if (cardId) {
      assignCardToRole(cardId, role);
    }
  };

  const handleRemoveCard = (e: React.MouseEvent, role: PositionRole) => {
    e.stopPropagation();
    if (role === 'vanguard') setVanguardId(null);
    if (role === 'center') setCenterId(null);
    if (role === 'general') setGeneralId(null);
  };

  const handleAddSupport = (supId: string) => {
    if (supportIds.length >= 18) {
      setMessage('⚠️ サポートカードは最大18枚までです。');
      return;
    }
    const count = supportIds.filter(id => id === supId).length;
    if (count >= 2) {
      setMessage('⚠️ 同じサポートカードは2枚までしか入れられません。');
      return;
    }
    setSupportIds([...supportIds, supId]);
    setMessage('');
  };

  const handleRemoveSingleSupport = (supId: string) => {
    const idx = supportIds.indexOf(supId);
    if (idx !== -1) {
      const updated = [...supportIds];
      updated.splice(idx, 1);
      setSupportIds(updated);
    }
  };

  const handleClearAllSupports = () => {
    if (supportIds.length === 0) return;
    setSupportIds([]);
    setMessage('🧹 サポートカードをすべて解除しました。');
  };

  const handleSaveDeck = () => {
    if (!deckName.trim()) {
      setMessage('⚠️ デッキ名を入力してください。');
      return;
    }
    if (!vanguardId || !centerId || !generalId) {
      setMessage('⚠️ 先鋒・中堅・大将のすべての枠にキャラカードをセットしてください。');
      return;
    }
    if (supportIds.length !== 18) {
      setMessage(`⚠️ サポートカードは18枚ピッタリ用意してください。（現在: ${supportIds.length}枚）`);
      return;
    }

    const now = new Date().toISOString();
    let updatedDecks: Deck[];

    const deckData: Deck = {
      id: selectedDeckId || `deck_${Date.now()}`,
      name: deckName.trim(),
      vanguardCardId: vanguardId,
      centerCardId: centerId,
      generalCardId: generalId,
      supportCardIds: supportIds,
      createdAt: now,
      updatedAt: now
    };

    if (selectedDeckId) {
      updatedDecks = decks.map(d => d.id === selectedDeckId ? deckData : d);
      setMessage('✅ デッキを更新しました。');
    } else {
      updatedDecks = [deckData, ...decks];
      setSelectedDeckId(deckData.id);
      setMessage('🎉 新しいデッキを保存しました！');
    }

    setDecks(updatedDecks);
    localStorage.setItem(STORAGE_DECKS_KEY, JSON.stringify(updatedDecks));
  };

  const handleDuplicateDeck = () => {
    const newName = `${deckName.trim()} のコピー`;
    const now = new Date().toISOString();

    const duplicatedDeck: Deck = {
      id: `deck_${Date.now()}`,
      name: newName,
      vanguardCardId: vanguardId,
      centerCardId: centerId,
      generalCardId: generalId,
      supportCardIds: [...supportIds],
      createdAt: now,
      updatedAt: now
    };

    const updatedDecks = [duplicatedDeck, ...decks];
    setDecks(updatedDecks);
    localStorage.setItem(STORAGE_DECKS_KEY, JSON.stringify(updatedDecks));

    setSelectedDeckId(duplicatedDeck.id);
    setDeckName(newName);
    setMessage(`📋 「${newName}」を作成しました！`);
  };

  const handleDeleteDeck = (deckId: string) => {
    if (confirm('このデッキを削除してもよろしいですか？')) {
      const updated = decks.filter(d => d.id !== deckId);
      setDecks(updated);
      localStorage.setItem(STORAGE_DECKS_KEY, JSON.stringify(updated));
      resetToNewDeck();
      setMessage('🗑️ デッキを削除しました。');
    }
  };

  const handleExportDeck = () => {
    const exportData = {
      version: '2.0',
      type: 'single_deck',
      exportedAt: new Date().toISOString(),
      deck: {
        name: deckName,
        vanguardCardId: vanguardId,
        centerCardId: centerId,
        generalCardId: generalId,
        supportCardIds: supportIds
      },
      cards: cards.filter(c => [vanguardId, centerId, generalId].includes(c.id)),
      supportCards: supportPool.filter(s => supportIds.includes(s.id))
    };

    downloadJson(exportData, `${deckName.replace(/\s+/g, '_')}_deck.json`);
    setMessage('📥 単一デッキファイルをダウンロードしました。');
  };

  const handleExportAllDecks = () => {
    if (decks.length === 0) {
      setMessage('⚠️ 出力できる保存済みデッキがありません。');
      return;
    }

    const usedCardIds = new Set<string>();
    const usedSupportIds = new Set<string>();
    decks.forEach(d => {
      if (d.vanguardCardId) usedCardIds.add(d.vanguardCardId);
      if (d.centerCardId) usedCardIds.add(d.centerCardId);
      if (d.generalCardId) usedCardIds.add(d.generalCardId);
      d.supportCardIds?.forEach(sId => usedSupportIds.add(sId));
    });

    const exportData = {
      version: '2.0',
      type: 'all_decks',
      exportedAt: new Date().toISOString(),
      decks: decks,
      cards: cards.filter(c => usedCardIds.has(c.id)),
      supportCards: supportPool.filter(s => usedSupportIds.has(s.id))
    };

    const dateStr = new Date().toISOString().split('T')[0];
    downloadJson(exportData, `all_decks_backup_${dateStr}.json`);
    setMessage(`📦 ${decks.length}件のデッキをまとめてダウンロードしました。`);
  };

  const downloadJson = (data: any, fileName: string) => {
    const jsonString = JSON.stringify(data, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportDeck = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const importedData = JSON.parse(event.target?.result as string);

        if (importedData.type === 'all_decks' && Array.isArray(importedData.decks)) {
          const existingDeckIds = decks.map(d => d.id);
          const newDecks = [...decks];
          let importedCount = 0;

          importedData.decks.forEach((impDeck: Deck) => {
            if (!existingDeckIds.includes(impDeck.id)) {
              newDecks.push(impDeck);
              importedCount++;
            }
          });

          setDecks(newDecks);
          localStorage.setItem(STORAGE_DECKS_KEY, JSON.stringify(newDecks));

          if (newDecks.length > 0) {
            loadDeckToEditor(newDecks[0]);
          }

          setMessage(`🎉 ${importedCount}件のデッキを一括インポートしました！`);
        } else if (importedData.deck) {
          setDeckName(`${importedData.deck.name} (共有)`);
          setVanguardId(importedData.deck.vanguardCardId);
          setCenterId(importedData.deck.centerCardId);
          setGeneralId(importedData.deck.generalCardId);
          setSupportIds(importedData.deck.supportCardIds || []);
          setSelectedDeckId(null);

          setMessage('🎉 ファイルからデッキを復元しました！');
        } else {
          throw new Error('形式が不正です');
        }
      } catch (err) {
        setMessage('❌ ファイルの読み込みに失敗しました。正しいJSONファイルかご確認ください。');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const getCard = (id: string | null) => cards.find(c => c.id === id);

  const activeCharFilterCount = selectedColors.length + selectedArchetypes.length + (charSearchQuery ? 1 : 0);

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-8 text-gray-900">
      {message && (
        <div className="p-3 text-sm font-bold text-indigo-900 bg-indigo-50 border border-indigo-200 rounded-lg">
          {message}
        </div>
      )}

      {/* 上部: 保存済みデッキ選択 & 一括操作 */}
      <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm flex flex-wrap gap-4 items-center justify-between">
        <div className="flex items-center space-x-2 overflow-x-auto py-1">
          <span className="text-sm font-bold text-gray-700 whitespace-nowrap">デッキ選択:</span>
          {decks.map(d => (
            <button
              key={d.id}
              onClick={() => loadDeckToEditor(d)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition whitespace-nowrap cursor-pointer ${
                selectedDeckId === d.id ? 'bg-indigo-600 text-white shadow' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
              }`}
            >
              {d.name}
            </button>
          ))}
          <button onClick={resetToNewDeck} className="px-3 py-1.5 rounded-lg text-xs font-bold border border-dashed text-gray-600 hover:bg-gray-50 cursor-pointer">
            ＋ 新規作成
          </button>
        </div>

        <div className="flex items-center space-x-2">
          {decks.length > 0 && (
            <button
              onClick={handleExportAllDecks}
              className="px-3 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold rounded-lg transition cursor-pointer"
              title="保存されている全デッキを一括ダウンロード"
            >
              📦 全デッキ一括出力 ({decks.length})
            </button>
          )}

          <label className="px-3 py-1.5 bg-gray-800 hover:bg-gray-900 text-white text-xs font-bold rounded-lg cursor-pointer transition">
            📂 JSONインポート
            <input type="file" accept=".json" onChange={handleImportDeck} className="hidden" />
          </label>
        </div>
      </div>

      {/* デッキ編集枠 */}
      <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm space-y-6">
        <div className="flex flex-wrap gap-4 justify-between items-center border-b pb-4">
          <input
            type="text"
            value={deckName}
            onChange={(e) => setDeckName(e.target.value)}
            className="text-xl font-bold px-3 py-1 border rounded-lg focus:ring-2 focus:ring-indigo-500 bg-white text-gray-900"
            placeholder="デッキ名"
          />
          <div className="flex space-x-2 flex-wrap gap-y-2">
            <button onClick={handleSaveDeck} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold rounded-lg shadow cursor-pointer">
              {selectedDeckId ? '上書き保存' : 'デッキを保存'}
            </button>
            <button 
              onClick={handleDuplicateDeck} 
              className="px-3 py-2 bg-amber-500 hover:bg-amber-600 text-white text-sm font-bold rounded-lg shadow cursor-pointer"
              title="この構成をもとに複製して新しいデッキを作成"
            >
              📋 複製
            </button>
            <button onClick={handleExportDeck} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold rounded-lg shadow cursor-pointer">
              📤 出力
            </button>
            {selectedDeckId && (
              <button onClick={() => handleDeleteDeck(selectedDeckId)} className="px-3 py-2 bg-red-100 hover:bg-red-200 text-red-700 text-sm font-bold rounded-lg cursor-pointer">
                削除
              </button>
            )}
          </div>
        </div>

        {/* キャラカード指定枠 */}
        <div>
          <h3 className="text-sm font-bold text-gray-800 mb-1">【キャラカード】（先鋒・中堅・大将 各1枚）</h3>
          <p className="text-xs text-gray-500 mb-3">枠をクリックして選択するか、下のキャラをドラッグ＆ドロップで配置できます。</p>
          
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {(['vanguard', 'center', 'general'] as PositionRole[]).map((role) => {
              const label = role === 'vanguard' ? '先鋒' : role === 'center' ? '中堅' : '大将';
              const cardId = role === 'vanguard' ? vanguardId : role === 'center' ? centerId : generalId;
              const card = getCard(cardId);
              const isTargeting = selectedTargetRole === role;

              return (
                <div
                  key={role}
                  onClick={() => handleSlotClick(role)}
                  onDragOver={handleDragOver}
                  onDrop={(e) => handleDrop(e, role)}
                  className={`border-2 rounded-xl p-3 text-center transition cursor-pointer relative ${
                    isTargeting 
                      ? 'border-indigo-600 bg-indigo-100 ring-2 ring-indigo-400' 
                      : 'border-indigo-200 bg-indigo-50/30 hover:border-indigo-400'
                  }`}
                >
                  <div className="font-bold text-xs text-indigo-800 mb-2">
                    ⚔️ {label} {isTargeting && <span className="text-indigo-600">(選択中)</span>}
                  </div>

                  {card ? (
                    <div className="relative group">
                      <button
                        onClick={(e) => handleRemoveCard(e, role)}
                        className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-5 h-5 text-xs font-bold hover:bg-red-600 z-10"
                      >
                        ×
                      </button>
                      {card.imageDataUrl ? (
                        <img src={card.imageDataUrl} alt={card.userName} className="w-full h-28 object-cover rounded-lg mb-1 pointer-events-none" />
                      ) : (
                        <div className="w-full h-28 bg-gray-200 rounded-lg mb-1 flex items-center justify-center text-xs text-gray-400">No Image</div>
                      )}
                      <div className="font-bold text-sm text-gray-900">{card.userName}</div>
                      <div className="text-[10px] text-gray-500">{card.color} / {card.archetype}</div>
                    </div>
                  ) : (
                    <div className="h-32 border-2 border-dashed border-gray-300 rounded-lg flex flex-col items-center justify-center text-xs text-gray-400">
                      <span>{isTargeting ? '下のキャラを選択' : '未セット'}</span>
                      <span className="text-[10px] mt-1 text-gray-400">(クリックまたはD&D)</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* サポートカード枠 */}
        <div className="border-t pt-4">
          <div className="flex justify-between items-center mb-3">
            <div className="flex items-center space-x-3">
              <h3 className="text-sm font-bold text-gray-800">
                【サポートカード】（{supportIds.length} / 18 枚）
              </h3>
              {supportIds.length > 0 && (
                <button
                  onClick={handleClearAllSupports}
                  className="px-2 py-1 bg-red-50 hover:bg-red-100 text-red-600 text-xs font-bold rounded border border-red-200 transition cursor-pointer"
                >
                  🗑️ 全解除
                </button>
              )}
            </div>
            <span className="text-xs text-gray-500">同名カードは2枚まで</span>
          </div>

          <div className="min-h-[72px] p-2.5 border-2 border-dashed border-gray-200 rounded-xl bg-gray-50 flex flex-wrap gap-2">
            {groupedSupportCards.length === 0 ? (
              <span className="text-xs text-gray-400 m-auto">下の一覧からサポートカードを選択してください</span>
            ) : (
              groupedSupportCards.map(({ id, count, data }) => (
                <div 
                  key={id} 
                  className="w-44 bg-white border border-indigo-200 hover:border-indigo-400 px-2.5 py-1.5 rounded-lg text-xs flex items-center justify-between shadow-sm transition"
                >
                  <div className="flex items-center min-w-0 mr-1">
                    <span className="font-bold text-indigo-950 truncate" title={data?.name}>
                      {data?.name || '不明なカード'}
                    </span>
                    {count > 1 && (
                      <span className="ml-1 px-1.5 py-0.2 bg-indigo-600 text-white font-extrabold rounded-full text-[10px] flex-shrink-0">
                        ②
                      </span>
                    )}
                  </div>
                  <button 
                    onClick={() => handleRemoveSingleSupport(id)} 
                    className="text-gray-400 hover:text-red-600 font-bold px-1.5 py-0.5 hover:bg-red-50 rounded transition flex-shrink-0 text-sm leading-none"
                    title="1枚減らす"
                  >
                    −
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* 下部: 各カードプール ＆ それぞれの独立検索 */}
      <div className="space-y-8">
        {/* 1. キャラカード一覧セクション */}
        <div className="space-y-3">
          <div className="flex flex-wrap justify-between items-center gap-2">
            <div className="flex items-center space-x-2">
              <h2 className="text-sm font-bold text-gray-800">
                キャラカード一覧 ({filteredCards.length} / {cards.length}件)
              </h2>
              <button
                onClick={() => setIsCharFilterOpen(!isCharFilterOpen)}
                className={`px-2.5 py-1 text-xs font-bold rounded-lg border transition flex items-center space-x-1 cursor-pointer ${
                  activeCharFilterCount > 0 
                    ? 'bg-indigo-600 text-white border-indigo-600' 
                    : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                }`}
              >
                <span>🔍 絞り込み</span>
                {activeCharFilterCount > 0 && (
                  <span className="bg-white text-indigo-600 rounded-full px-1.5 text-[10px] font-black">
                    {activeCharFilterCount}
                  </span>
                )}
                <span>{isCharFilterOpen ? '▲' : '▼'}</span>
              </button>
            </div>
            <span className="text-xs text-gray-500">クリックまたはドラッグ＆ドロップ</span>
          </div>

          {/* キャラ用絞り込み展開パネル */}
          {isCharFilterOpen && (
            <div className="p-3 bg-indigo-50/50 border border-indigo-100 rounded-xl space-y-3">
              <div>
                <input
                  type="text"
                  value={charSearchQuery}
                  onChange={(e) => setCharSearchQuery(e.target.value)}
                  placeholder="キャラ名や属性で検索..."
                  className="w-full text-xs px-3 py-1.5 border rounded-lg bg-white text-gray-900 focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              {availableColors.length > 0 && (
                <div className="flex items-center space-x-2 text-xs">
                  <span className="font-bold text-gray-600 whitespace-nowrap">カラー:</span>
                  <div className="flex flex-wrap gap-1">
                    {availableColors.map(color => (
                      <button
                        key={color}
                        onClick={() => toggleColorFilter(color)}
                        className={`px-2 py-0.5 rounded text-[11px] font-bold transition border cursor-pointer ${
                          selectedColors.includes(color)
                            ? 'bg-indigo-600 text-white border-indigo-600'
                            : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-100'
                        }`}
                      >
                        {color}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {availableArchetypes.length > 0 && (
                <div className="flex items-center space-x-2 text-xs">
                  <span className="font-bold text-gray-600 whitespace-nowrap">タイプ:</span>
                  <div className="flex flex-wrap gap-1">
                    {availableArchetypes.map(arch => (
                      <button
                        key={arch}
                        onClick={() => toggleArchetypeFilter(arch)}
                        className={`px-2 py-0.5 rounded text-[11px] font-bold transition border cursor-pointer ${
                          selectedArchetypes.includes(arch)
                            ? 'bg-indigo-600 text-white border-indigo-600'
                            : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-100'
                        }`}
                      >
                        {arch}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {activeCharFilterCount > 0 && (
                <div className="text-right">
                  <button onClick={clearCharFilters} className="text-[11px] text-red-600 hover:underline font-bold cursor-pointer">
                    条件リセット
                  </button>
                </div>
              )}
            </div>
          )}

          {/* キャラカードグリッド */}
          {filteredCards.length === 0 ? (
            <div className="p-6 text-center bg-gray-50 border border-dashed rounded-xl text-xs text-gray-400">
              条件に一致するキャラカードがありません
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-3">
              {filteredCards.map((card) => {
                const isAssigned = [vanguardId, centerId, generalId].includes(card.id);
                const isSelected = selectedCardId === card.id;

                return (
                  <div
                    key={card.id}
                    draggable={!isAssigned}
                    onDragStart={(e) => handleDragStart(e, card.id)}
                    onClick={() => handleCardClick(card.id)}
                    className={`p-2 border rounded-xl transition text-center select-none ${
                      isAssigned
                        ? 'bg-gray-100 opacity-50 border-gray-300 cursor-not-allowed'
                        : isSelected
                        ? 'bg-indigo-50 border-indigo-600 ring-2 ring-indigo-400 cursor-pointer'
                        : 'bg-white hover:border-indigo-400 border-gray-200 cursor-grab active:cursor-grabbing'
                    }`}
                  >
                    {card.imageDataUrl ? (
                      <img src={card.imageDataUrl} alt={card.userName} className="w-full h-20 object-cover rounded-lg mb-1 pointer-events-none" />
                    ) : (
                      <div className="w-full h-20 bg-gray-200 rounded-lg mb-1 flex items-center justify-center text-[10px] text-gray-400">No Image</div>
                    )}
                    <div className="text-xs font-bold truncate">{card.userName}</div>
                    <div className="text-[10px] text-gray-500">{card.color}</div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* 2. サポートカード一覧セクション */}
        <div className="border-t pt-6 space-y-3">
          <div className="flex flex-wrap justify-between items-center gap-2">
            <h2 className="text-sm font-bold text-gray-800">
              サポートカード一覧 ({filteredSupportCards.length} / {supportPool.length}件)
            </h2>
            
            <div className="w-full sm:w-64">
              <input
                type="text"
                value={supSearchQuery}
                onChange={(e) => setSupSearchQuery(e.target.value)}
                placeholder="🔍 サポートカード名・効果で検索..."
                className="w-full text-xs px-3 py-1.5 border border-gray-300 rounded-lg bg-white text-gray-900 focus:ring-1 focus:ring-indigo-500"
              />
            </div>
          </div>

          {/* サポートカードグリッド */}
          {filteredSupportCards.length === 0 ? (
            <div className="p-6 text-center bg-gray-50 border border-dashed rounded-xl text-xs text-gray-400">
              条件に一致するサポートカードがありません
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              {filteredSupportCards.map((sup) => {
                const currentCount = supportIds.filter(id => id === sup.id).length;
                return (
                  <div
                    key={sup.id}
                    onClick={() => handleAddSupport(sup.id)}
                    className={`p-3 border rounded-xl cursor-pointer transition flex justify-between items-center ${
                      currentCount >= 2 ? 'bg-gray-100 border-gray-200 opacity-50' : 'bg-white hover:border-indigo-400 border-gray-200 shadow-sm'
                    }`}
                  >
                    <div className="flex items-center min-w-0">
                      {sup.imageDataUrl ? (
                        <img src={sup.imageDataUrl} alt="" className="w-12 h-12 rounded-lg object-cover mr-2 flex-shrink-0 border border-gray-200" />
                      ) : (
                        <div className="w-12 h-12 rounded-lg bg-gray-100 mr-2 flex-shrink-0 flex items-center justify-center text-[9px] text-gray-400">NO IMG</div>
                      )}
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-gray-900 truncate">{sup.name}</div>
                        <div className="text-[10px] text-gray-500 line-clamp-2">{sup.description}</div>
                        {sup.isVirtual && (
                          <div className="text-[9px] text-purple-600 font-bold mt-0.5">✨ エントリー前の仮カード</div>
                        )}
                      </div>
                    </div>
                    <span className="text-xs font-bold px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded-full border border-indigo-200 flex-shrink-0 ml-2">
                      {currentCount}/2
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}