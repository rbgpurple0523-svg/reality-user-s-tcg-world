'use client';

import React, { useState, useEffect, ChangeEvent, useMemo } from 'react';
import { CHARACTER_SAMPLE_CARDS } from './characterSampleCards';
import { COORDINATE_PRESETS } from './EntryHub';
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
  customSkills?: string[];
  skillDescriptions?: string[];
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
  intellect?: number;
  dexterity?: number;
  charm?: number;
  favoredSeason?: string;
  presetId?: string;
  customSkills?: string[];
  skillDescriptions?: string[];
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

interface DeckBuilderProps {
  onGoToCpuBattle?: () => void;
  onGoToBattle?: () => void;
  initialDeckId?: string | null;
  battleButtonLabel?: string;
}

export default function DeckBuilder({ onGoToCpuBattle, onGoToBattle, initialDeckId = null, battleButtonLabel = '⚔️ CPU対戦へ' }: DeckBuilderProps) {
  // 既存の呼び出し側が onGoToCpuBattle / onGoToBattle のどちらでも動くよう互換性を維持します。
  const goToCpuBattle = onGoToCpuBattle ?? onGoToBattle;
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

  // 「名前を付けて保存」用
  const [isSaveAsOpen, setIsSaveAsOpen] = useState<boolean>(false);
  const [saveAsName, setSaveAsName] = useState<string>('');
  const [saveAsConflictName, setSaveAsConflictName] = useState<string | null>(null);

  // 🔍 キャラカード専用 絞り込みステート
  const [isCharFilterOpen, setIsCharFilterOpen] = useState<boolean>(false);
  const [charSearchQuery, setCharSearchQuery] = useState<string>('');
  const [selectedColors, setSelectedColors] = useState<string[]>([]);
  const [selectedArchetypes, setSelectedArchetypes] = useState<string[]>([]);

  // 🔍 サポートカード専用 検索ステート
  const [supSearchQuery, setSupSearchQuery] = useState<string>('');
  const [isSupportFilterOpen, setIsSupportFilterOpen] = useState<boolean>(false);
  const [selectedSupportCategories, setSelectedSupportCategories] = useState<string[]>([]);
  const [supportPage, setSupportPage] = useState<number>(1);
  const [selectedSupportDetail, setSelectedSupportDetail] = useState<SupportCard | null>(null);
  const [selectedCharacterDetail, setSelectedCharacterDetail] = useState<AvatarCard | null>(null);
  const [isDeckDashboardOpen, setIsDeckDashboardOpen] = useState<boolean>(false);
  const SUPPORT_PAGE_SIZE = 20;

  // 保存済みデッキと現在の編集内容を比較し、未保存変更があるかをリアルタイム判定します。
  // 新規デッキ（selectedDeckId === null）は、保存されるまで常に未保存扱いです。
  const hasUnsavedChanges = useMemo(() => {
    if (!selectedDeckId) return true;

    const savedDeck = decks.find(deck => deck.id === selectedDeckId);
    if (!savedDeck) return true;

    return (
      savedDeck.name.trim() !== deckName.trim() ||
      savedDeck.vanguardCardId !== vanguardId ||
      savedDeck.centerCardId !== centerId ||
      savedDeck.generalCardId !== generalId ||
      JSON.stringify(savedDeck.supportCardIds || []) !== JSON.stringify(supportIds)
    );
  }, [
    decks,
    selectedDeckId,
    deckName,
    vanguardId,
    centerId,
    generalId,
    supportIds,
  ]);

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
      ap: a.stats.intellect,
      intellect: a.stats.intellect,
      dexterity: a.stats.dexterity,
      charm: a.stats.charm,
      favoredSeason: a.favoredSeason,
      presetId: a.presetId,
      customSkills: a.customSkills,
      skillDescriptions: (() => {
        const preset = COORDINATE_PRESETS.find(p => p.id === a.presetId);
        return preset ? [...preset.skillDescriptions] : undefined;
      })(),
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
            intellect: e.ap,
            dexterity: 20,
            charm: 20,
            favoredSeason:
              e.archetype === 'マッスル型' ? '春' :
              e.archetype === '頭脳型' ? '秋' :
              e.archetype === '職人型' ? '冬' : '夏',
            presetId: e.presetId,
            customSkills: e.customSkills,
            skillDescriptions: e.skillDescriptions,
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
          const initialDeck = initialDeckId
            ? resolvedDecks.find(deck => deck.id === initialDeckId) || resolvedDecks[0]
            : resolvedDecks[0];
          loadDeckToEditor(initialDeck);
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

  // サポートカードの絞り込み候補
  const availableSupportCategories = useMemo(() => {
    const set = new Set<string>();
    supportPool.forEach(sup => {
      if (sup.category) set.add(sup.category);
    });
    return Array.from(set);
  }, [supportPool]);

  const toggleSupportCategoryFilter = (category: string) => {
    setSelectedSupportCategories(prev =>
      prev.includes(category) ? prev.filter(c => c !== category) : [...prev, category]
    );
  };

  const clearSupportFilters = () => {
    setSupSearchQuery('');
    setSelectedSupportCategories([]);
  };

  // 絞り込み済みサポートカード一覧
  const filteredSupportCards = useMemo(() => {
    return supportPool.filter(sup => {
      if (supSearchQuery.trim()) {
        const q = supSearchQuery.toLowerCase();
        const matchName = sup.name.toLowerCase().includes(q);
        const matchDesc = sup.description.toLowerCase().includes(q);
        if (!matchName && !matchDesc) return false;
      }
      if (selectedSupportCategories.length > 0 && !selectedSupportCategories.includes(sup.category || '')) {
        return false;
      }
      return true;
    });
  }, [supportPool, supSearchQuery, selectedSupportCategories]);

  const supportTotalPages = Math.max(1, Math.ceil(filteredSupportCards.length / SUPPORT_PAGE_SIZE));

  const paginatedSupportCards = useMemo(() => {
    const start = (supportPage - 1) * SUPPORT_PAGE_SIZE;
    return filteredSupportCards.slice(start, start + SUPPORT_PAGE_SIZE);
  }, [filteredSupportCards, supportPage]);

  const activeSupportFilterCount =
    selectedSupportCategories.length + (supSearchQuery ? 1 : 0);

  useEffect(() => {
    setSupportPage(1);
  }, [supSearchQuery, selectedSupportCategories]);

  useEffect(() => {
    if (supportPage > supportTotalPages) {
      setSupportPage(supportTotalPages);
    }
  }, [supportPage, supportTotalPages]);

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

  // サポートカードは一覧から選択中エリアへドラッグ＆ドロップで追加できます。
  const handleSupportDragStart = (e: React.DragEvent, supId: string) => {
    e.dataTransfer.setData('text/plain', `support:${supId}`);
    e.dataTransfer.effectAllowed = 'copy';
  };

  const handleSupportDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const data = e.dataTransfer.getData('text/plain');
    if (!data.startsWith('support:')) return;

    const supId = data.slice('support:'.length);
    if (supId) {
      handleAddSupport(supId);
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

  const handleOpenSupportDetail = (e: React.MouseEvent, sup: SupportCard) => {
    e.stopPropagation();
    setSelectedSupportDetail(sup);
  };

  // サポートカードの詳細表示用メタデータ。公式カードはEMOTION_PRESETSの定義を優先して表示します。
  const getSupportDetailMeta = (sup: SupportCard) => {
    const preset = sup.presetId ? EMOTION_PRESETS.find(emotion => emotion.id === sup.presetId) : undefined;
    return {
      duration: preset?.duration,
      target: preset?.target,
      statEffect: preset?.statEffect,
      effectAmount: preset?.effectAmount,
      note: preset?.note,
    };
  };

  const validateDeckForSave = () => {
    if (!deckName.trim()) {
      setMessage('⚠️ デッキ名を入力してください。');
      return false;
    }
    if (!vanguardId || !centerId || !generalId) {
      setMessage('⚠️ 先鋒・中堅・大将のすべての枠にキャラカードをセットしてください。');
      return false;
    }
    if (supportIds.length !== 18) {
      setMessage(`⚠️ サポートカードは18枚ピッタリ用意してください。（現在: ${supportIds.length}枚）`);
      return false;
    }
    return true;
  };

  const saveDeckWithName = (name: string, targetId: string | null, createdAt?: string) => {
    const now = new Date().toISOString();
    const deckData: Deck = {
      id: targetId || `deck_${Date.now()}`,
      name: name.trim(),
      vanguardCardId: vanguardId,
      centerCardId: centerId,
      generalCardId: generalId,
      supportCardIds: [...supportIds],
      createdAt: createdAt || now,
      updatedAt: now
    };

    const updatedDecks = targetId
      ? decks.map(d => d.id === targetId ? deckData : d)
      : [deckData, ...decks];

    setDecks(updatedDecks);
    localStorage.setItem(STORAGE_DECKS_KEY, JSON.stringify(updatedDecks));
    setSelectedDeckId(deckData.id);
    setDeckName(deckData.name);
    return deckData;
  };

  // 上書き保存はポップアップを出さず、左上で直接編集したデッキ名もそのまま保存します。
  const handleSaveDeck = () => {
    if (!validateDeckForSave()) return;

    if (selectedDeckId) {
      const currentDeck = decks.find(d => d.id === selectedDeckId);
      saveDeckWithName(deckName, selectedDeckId, currentDeck?.createdAt);
      setMessage('✅ デッキを上書き保存しました。');
    } else {
      saveDeckWithName(deckName, null);
      setMessage('🎉 新しいデッキを保存しました！');
    }
  };

  const handleOpenSaveAs = () => {
    if (!validateDeckForSave()) return;
    setSaveAsName(deckName.trim());
    setSaveAsConflictName(null);
    setIsSaveAsOpen(true);
  };

  const handleSaveAsConfirm = () => {
    const name = saveAsName.trim();
    if (!name) {
      setMessage('⚠️ デッキ名を入力してください。');
      return;
    }

    const duplicate = decks.find(d => d.name.trim() === name);
    if (duplicate) {
      setSaveAsConflictName(name);
      return;
    }

    saveDeckWithName(name, null);
    setIsSaveAsOpen(false);
    setSaveAsConflictName(null);
    setMessage(`🎉 「${name}」を新しいデッキとして保存しました！`);
  };

  const handleSaveAsOverwrite = () => {
    if (!saveAsConflictName) return;
    const duplicate = decks.find(d => d.name.trim() === saveAsConflictName);
    if (!duplicate) {
      setSaveAsConflictName(null);
      return;
    }

    saveDeckWithName(duplicate.name, duplicate.id, duplicate.createdAt);
    setIsSaveAsOpen(false);
    setSaveAsConflictName(null);
    setMessage(`✅ 「${duplicate.name}」を上書き保存しました。`);
  };

  const handleDuplicateDeck = () => {
    const baseName = deckName.trim() || '新規デッキ';
    let newName = `${baseName} のコピー`;
    let suffix = 2;
    while (decks.some(d => d.name.trim() === newName)) {
      newName = `${baseName} のコピー（${suffix}）`;
      suffix++;
    }

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

  const getCharacterStats = (card: AvatarCard) => ({
    hp: card.hp ?? 0,
    intellect: card.intellect ?? card.ap ?? 0,
    dexterity: card.dexterity ?? 20,
    charm: card.charm ?? 20,
  });

  const getArchetypeDistribution = (card: AvatarCard) => {
    const stats = getCharacterStats(card);
    const labels: Array<[string, number]> = [
      ['体力', stats.hp],
      ['知略', stats.intellect],
      ['器用', stats.dexterity],
      ['特技', stats.charm],
    ];
    const sorted = [...labels].sort((a, b) => b[1] - a[1]);
    const groups: string[][] = [];
    sorted.forEach(([label, value]) => {
      const last = groups[groups.length - 1];
      if (last && last.__value === value) {
        last.push(label);
      } else {
        const group = [label] as string[] & { __value?: number };
        group.__value = value;
        groups.push(group);
      }
    });
    return groups.map(group => group.join('＝')).join('＞');
  };

  const getCharacterSeason = (card: AvatarCard) => {
    if (card.favoredSeason) return card.favoredSeason;
    if (card.archetype === 'マッスル型') return '春';
    if (card.archetype === '頭脳型') return '秋';
    if (card.archetype === '職人型') return '冬';
    return '夏';
  };

  // キャラ詳細で表示する4つの技。
  // 登録済みキャラは保存された技名・効果を優先し、公式仮キャラは対応する公式コーデの定義を使用します。
  // キャラ詳細に表示する技情報を、必ず「コーデの正本」から解決します。
  // 優先順位：カード自身に保存された技情報 → 対応するサンプルカード → COORDINATE_PRESETS
  // これにより、サンプルキャラでもユーザー登録キャラでも、EntryHubのコーデ定義を表示できます。
  const getCharacterSkills = (card: AvatarCard) => {
    const sampleCard = CHARACTER_SAMPLE_CARDS.find(sample => sample.id === card.id);
    const presetId = card.presetId || sampleCard?.presetId;
    const preset = presetId ? COORDINATE_PRESETS.find(p => p.id === presetId) : undefined;

    const savedNames = card.customSkills?.filter(Boolean) || [];
    const savedDescriptions = card.skillDescriptions?.filter(Boolean) || [];
    const sampleNames = sampleCard?.customSkills?.filter(Boolean) || [];

    // サンプルカードのcustomSkillsは「技名」、技の効果本文はEntryHubのskillDescriptionsが正本です。
    const names = savedNames.length === 4
      ? savedNames
      : sampleNames.length === 4
        ? sampleNames
        : (preset?.defaultSkills || []);

    const descriptions = savedDescriptions.length === 4
      ? savedDescriptions
      : (preset?.skillDescriptions || []);

    return Array.from({ length: 4 }, (_, index) => ({
      number: index + 1,
      name: names[index] || `技${index + 1}`,
      description: descriptions[index] || 'この技の効果詳細は登録されていません。',
    }));
  };

  const getSupportStatDelta = useMemo(() => {
    const delta = { hp: 0, intellect: 0, dexterity: 0, charm: 0 };
    supportIds.forEach(id => {
      const sup = supportPool.find(card => card.id === id);
      if (!sup?.presetId) return;
      const preset = EMOTION_PRESETS.find(emotion => emotion.id === sup.presetId);
      if (!preset || preset.target !== '自分') return;
      const amountText = preset.effectAmount || '';
      const match = amountText.match(/[+-]?\d+/);
      if (!match) return;
      const amount = Number(match[0]);
      if (!Number.isFinite(amount)) return;
      if (preset.effectCategory === '体力') delta.hp += amount;
      if (preset.effectCategory === '知略') delta.intellect += amount;
      if (preset.effectCategory === '器用') delta.dexterity += amount;
      if (preset.effectCategory === '特技') delta.charm += amount;
      if (preset.effectCategory === '全ステータス') {
        delta.hp += amount;
        delta.intellect += amount;
        delta.dexterity += amount;
        delta.charm += amount;
      }
    });
    return delta;
  }, [supportIds, supportPool]);

  const StatRadar = ({
    stats,
    compareStats,
    size = 180,
  }: {
    stats: { hp: number; intellect: number; dexterity: number; charm: number };
    compareStats?: { hp: number; intellect: number; dexterity: number; charm: number };
    size?: number;
  }) => {
    const labels = ['体力', '知略', '器用', '特技'];
    const values = [stats.hp, stats.intellect, stats.dexterity, stats.charm];
    const compareValues = compareStats
      ? [compareStats.hp, compareStats.intellect, compareStats.dexterity, compareStats.charm]
      : null;

    const max = Math.max(100, ...values, ...(compareValues || []), 1);
    const center = size / 2;
    const radius = size * 0.31;
    const angleFor = (index: number) => (-Math.PI / 2) + index * (Math.PI * 2 / 4);

    const point = (value: number, index: number, r = radius) => {
      const angle = angleFor(index);
      const rr = r * Math.max(0, Math.min(value / max, 1));
      return [center + Math.cos(angle) * rr, center + Math.sin(angle) * rr];
    };

    const polygon = values.map((value, i) => point(value, i).join(',')).join(' ');
    const comparePolygon = compareValues
      ? compareValues.map((value, i) => point(value, i).join(',')).join(' ')
      : null;

    return (
      <div className="flex flex-col items-center">
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label="ステータスレーダーチャート">
          {[0.25, 0.5, 0.75, 1].map(scale => (
            <polygon
              key={scale}
              points={labels.map((_, i) => point(max * scale, i).join(',')).join(' ')}
              fill="none"
              stroke="#d1d5db"
              strokeWidth="1"
            />
          ))}

          {labels.map((_, i) => {
            const [x, y] = point(max, i);
            return <line key={i} x1={center} y1={center} x2={x} y2={y} stroke="#d1d5db" strokeWidth="1" />;
          })}

          {compareValues && comparePolygon ? (
            <>
              {/* 基礎値：青紫 */}
              <polygon
                points={polygon}
                fill="rgba(79,70,229,0.10)"
                stroke="#4f46e5"
                strokeWidth="2"
              />

              {/* サポート反映後：オレンジ */}
              <polygon
                points={comparePolygon}
                fill="rgba(249,115,22,0.18)"
                stroke="#f97316"
                strokeWidth="3"
              />

              {/* 増減部分：増加はオレンジ、減少は青 */}
              {values.map((value, index) => {
                const next = (index + 1) % 4;
                const compareValue = compareValues[index];
                const compareNext = compareValues[next];

                if (compareValue === value && compareNext === values[next]) return null;

                const baseA = point(value, index);
                const baseB = point(values[next], next);
                const compareA = point(compareValue, index);
                const compareB = point(compareNext, next);

                const deltaA = compareValue - value;
                const deltaB = compareNext - values[next];
                const isIncrease = deltaA + deltaB >= 0;

                return (
                  <polygon
                    key={`delta-${index}`}
                    points={[baseA, baseB, compareB, compareA].map(p => p.join(',')).join(' ')}
                    fill={isIncrease ? '#fb923c' : '#60a5fa'}
                    fillOpacity="0.28"
                    stroke="none"
                  />
                );
              })}
            </>
          ) : (
            <polygon
              points={polygon}
              fill="rgba(79,70,229,0.18)"
              stroke="#4f46e5"
              strokeWidth="2"
            />
          )}

          {labels.map((label, i) => {
            const displayValue = compareValues ? compareValues[i] : values[i];
            const [x, y] = point(max, i, radius + 24);
            return (
              <text
                key={label}
                x={x}
                y={y}
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize="11"
                fontWeight="700"
                fill="#374151"
              >
                {label} {displayValue}
              </text>
            );
          })}
        </svg>

        {compareValues ? (
          <div className="flex items-center gap-3 text-[10px] font-bold text-gray-600">
            <span><span className="text-indigo-600">■</span> 基礎値</span>
            <span><span className="text-orange-500">■</span> サポート反映後</span>
          </div>
        ) : null}
      </div>
    );
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
        <div className="flex flex-wrap gap-4 justify-between items-end border-b pb-4">
          <div className="flex-1 min-w-[220px]">
            <label className="block text-xs font-black text-gray-600 mb-1">デッキ名</label>
            <input
              type="text"
              value={deckName}
              onChange={(e) => setDeckName(e.target.value)}
              className="w-full max-w-md text-xl font-bold px-3 py-1.5 border rounded-lg focus:ring-2 focus:ring-indigo-500 bg-white text-gray-900"
              placeholder="デッキ名"
            />
          </div>
          <div className="flex space-x-2 flex-wrap gap-y-2">
            <button onClick={handleSaveDeck} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold rounded-lg shadow cursor-pointer">
              {selectedDeckId ? '💾 上書き保存' : '💾 保存'}
            </button>
            <button onClick={handleOpenSaveAs} className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white text-sm font-bold rounded-lg shadow cursor-pointer">
              📝 名前を付けて保存
            </button>
            <button onClick={handleDuplicateDeck} className="px-3 py-2 bg-amber-500 hover:bg-amber-600 text-white text-sm font-bold rounded-lg shadow cursor-pointer" title="この構成をもとに複製して新しいデッキを作成">
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
                      <button
                        onClick={(e) => { e.stopPropagation(); setSelectedCharacterDetail(card); }}
                        className="absolute -top-2 -left-2 bg-white border border-gray-300 text-gray-600 rounded-full w-6 h-6 text-xs font-black hover:bg-indigo-50 hover:text-indigo-600 z-10"
                        title="キャラカード詳細"
                        aria-label={`${card.userName}の詳細`}
                      >ⓘ</button>
                      {card.imageDataUrl ? (
                        <div className="w-full h-28 rounded-lg mb-1 bg-gray-50 border border-gray-100 flex items-center justify-center overflow-hidden">
                          <img src={card.imageDataUrl} alt={card.userName} className="max-w-full max-h-full object-contain pointer-events-none" />
                        </div>
                      ) : (
                        <div className="w-full h-28 bg-gray-200 rounded-lg mb-1 flex items-center justify-center text-xs text-gray-400">No Image</div>
                      )}
                      <div className="font-bold text-sm text-gray-900">{card.userName}</div>
                      <div className="text-[10px] text-gray-500">{card.color} / {card.archetype}</div>
                      <div className="text-[10px] font-bold text-gray-700">{getArchetypeDistribution(card)}</div>
                      <div className="text-[10px] text-gray-500">好きな季節：{getCharacterSeason(card)}</div>
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

      </div>

      {/* 下部: カード選択エリア */}
      <div className="space-y-8">
        {/* 2. 選択できるキャラカード一覧セクション */}
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
                        ? 'bg-gray-100 border-gray-300 cursor-not-allowed'
                        : isSelected
                        ? 'bg-indigo-50 border-indigo-600 ring-2 ring-indigo-400 cursor-pointer'
                        : 'bg-white hover:border-indigo-400 border-gray-200 cursor-grab active:cursor-grabbing'
                    }`}
                  >
                    {card.imageDataUrl ? (
                      <div className="w-full h-20 rounded-lg mb-1 bg-gray-50 border border-gray-100 flex items-center justify-center overflow-hidden">
                        <img src={card.imageDataUrl} alt={card.userName} className="max-w-full max-h-full object-contain pointer-events-none" />
                      </div>
                    ) : (
                      <div className="w-full h-20 bg-gray-200 rounded-lg mb-1 flex items-center justify-center text-[10px] text-gray-400">No Image</div>
                    )}
                    <div className="text-xs font-bold truncate">{card.userName}</div>
                    <div className="text-[10px] text-gray-500">{card.color} / {card.archetype}</div>
                    <div className="text-[9px] font-bold text-gray-700 truncate" title={getArchetypeDistribution(card)}>{getArchetypeDistribution(card)}</div>
                    <div className="text-[9px] text-gray-500">好きな季節：{getCharacterSeason(card)}</div>
                    <div className="flex items-center justify-center gap-1 mt-1.5">
                      {isAssigned ? (
                        <button
                          onClick={(e) => { e.stopPropagation();
                            if (vanguardId === card.id) setVanguardId(null);
                            if (centerId === card.id) setCenterId(null);
                            if (generalId === card.id) setGeneralId(null);
                          }}
                          className="px-3 py-1.5 rounded-md bg-red-100 hover:bg-red-200 text-red-700 border border-red-300 text-xs font-black shadow-sm"
                        >外す</button>
                      ) : null}
                      <button
                        onClick={(e) => { e.stopPropagation(); setSelectedCharacterDetail(card); }}
                        className="w-6 h-6 rounded-full border border-gray-300 bg-white hover:bg-indigo-50 hover:border-indigo-400 text-gray-500 hover:text-indigo-600 font-black text-xs"
                        title="キャラカード詳細"
                        aria-label={`${card.userName}の詳細`}
                      >ⓘ</button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* 3. 選択中のサポートカード枠 */}
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
          <div
            className="min-h-[72px] p-2.5 border-2 border-dashed border-gray-200 rounded-xl bg-gray-50 flex flex-wrap gap-2"
            onDragOver={handleDragOver}
            onDrop={handleSupportDrop}
          >
            {groupedSupportCards.length === 0 ? (
              <span className="text-xs text-gray-400 m-auto">下の一覧からクリック、またはドラッグ＆ドロップで追加できます</span>
            ) : (
              groupedSupportCards.map(({ id, count, data }) => (
                <div key={id} className="w-64 bg-white border border-indigo-200 hover:border-indigo-400 px-2 py-1.5 rounded-lg text-xs flex items-center gap-1 shadow-sm transition">
                  <button
                    onClick={() => handleRemoveSingleSupport(id)}
                    className="w-6 h-6 rounded-md bg-gray-100 hover:bg-red-50 text-gray-500 hover:text-red-600 font-black flex-shrink-0 transition"
                    title="1枚減らす"
                  >−</button>
                  <div className="flex items-center min-w-0 flex-1">
                    <span className="font-bold text-indigo-950 truncate" title={data?.name}>{data?.name || '不明なカード'}</span>
                    <span className="ml-1 px-1.5 py-0.2 bg-orange-500 text-white font-extrabold rounded-full text-[10px] flex-shrink-0">{count}</span>
                  </div>
                  <button
                    onClick={() => handleAddSupport(id)}
                    disabled={supportIds.length >= 18 || count >= 2}
                    className={`w-6 h-6 rounded-md font-black flex-shrink-0 transition ${
                      supportIds.length >= 18 || count >= 2
                        ? 'bg-gray-50 text-gray-300 cursor-not-allowed'
                        : 'bg-gray-100 hover:bg-indigo-50 text-gray-500 hover:text-indigo-600'
                    }`}
                    title={count >= 2 ? '同じカードは2枚まで' : supportIds.length >= 18 ? 'サポートカードは18枚まで' : '1枚追加'}
                  >+</button>
                  {data && (
                    <button
                      onClick={(e) => handleOpenSupportDetail(e, data)}
                      className="w-6 h-6 rounded-full border border-gray-300 bg-white hover:bg-indigo-50 hover:border-indigo-400 text-gray-500 hover:text-indigo-600 font-black flex-shrink-0 transition"
                      title="カード詳細を見る"
                      aria-label={`${data.name}の詳細`}
                    >ⓘ</button>
                  )}
                </div>
              ))
            )}
          </div>
          {supportIds.length >= 18 && (
            <div className="mt-2 px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-xs font-black text-center">
              ✓ サポートカードは満杯です（18 / 18）　「−」で減らすと再び追加できます
            </div>
          )}
        </div>
        {/* 4. 選択できるサポートカード一覧セクション */}
        <div className="border-t pt-6 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-sm font-bold text-gray-800">
                サポートカード一覧 ({filteredSupportCards.length} / {supportPool.length}件)
              </h2>
              <button
                onClick={() => setIsSupportFilterOpen(!isSupportFilterOpen)}
                className={`px-2.5 py-1 text-xs font-bold rounded-lg border transition flex items-center space-x-1 cursor-pointer ${
                  activeSupportFilterCount > 0
                    ? 'bg-indigo-600 text-white border-indigo-600'
                    : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                }`}
              >
                <span>🔍 絞り込み</span>
                {activeSupportFilterCount > 0 && (
                  <span className="bg-white text-indigo-600 rounded-full px-1.5 text-[10px] font-black">{activeSupportFilterCount}</span>
                )}
                <span>{isSupportFilterOpen ? '▲' : '▼'}</span>
              </button>

              {supportTotalPages > 1 && (
                <div className="flex items-center gap-1.5 ml-1">
                  <button
                    onClick={() => setSupportPage(prev => Math.max(1, prev - 1))}
                    disabled={supportPage === 1}
                    className="px-2.5 py-1 text-xs font-bold rounded-lg border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                  >←</button>
                  <span className="text-xs font-bold text-gray-600 whitespace-nowrap">{supportPage} / {supportTotalPages}</span>
                  <button
                    onClick={() => setSupportPage(prev => Math.min(supportTotalPages, prev + 1))}
                    disabled={supportPage === supportTotalPages}
                    className="px-2.5 py-1 text-xs font-bold rounded-lg border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                  >→</button>
                </div>
              )}
            </div>
            <div className="w-full sm:w-72">
              <input
                type="text"
                value={supSearchQuery}
                onChange={(e) => setSupSearchQuery(e.target.value)}
                placeholder="🔍 サポートカード名・効果で検索..."
                className="w-full text-xs px-3 py-1.5 border border-gray-300 rounded-lg bg-white text-gray-900 focus:ring-1 focus:ring-indigo-500"
              />
            </div>
          </div>

          {isSupportFilterOpen && (
            <div className="p-3 bg-indigo-50/50 border border-indigo-100 rounded-xl space-y-3">
              {availableSupportCategories.length > 0 && (
                <div className="flex items-start gap-2 text-xs">
                  <span className="font-bold text-gray-600 whitespace-nowrap pt-1">カテゴリ:</span>
                  <div className="flex flex-wrap gap-1">
                    {availableSupportCategories.map(category => (
                      <button
                        key={category}
                        onClick={() => toggleSupportCategoryFilter(category)}
                        className={`px-2 py-0.5 rounded text-[11px] font-bold transition border cursor-pointer ${
                          selectedSupportCategories.includes(category)
                            ? 'bg-indigo-600 text-white border-indigo-600'
                            : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-100'
                        }`}
                      >{category}</button>
                    ))}
                  </div>
                </div>
              )}

              {activeSupportFilterCount > 0 && (
                <div className="text-right">
                  <button onClick={clearSupportFilters} className="text-[11px] text-red-600 hover:underline font-bold cursor-pointer">条件リセット</button>
                </div>
              )}
            </div>
          )}

          {filteredSupportCards.length === 0 ? (
            <div className="p-6 text-center bg-gray-50 border border-dashed rounded-xl text-xs text-gray-400">条件に一致するサポートカードがありません</div>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                {paginatedSupportCards.map((sup) => {
                  const currentCount = supportIds.filter(id => id === sup.id).length;
                  const canAdd = supportIds.length < 18 && currentCount < 2;
                  return (
                    <div
                      key={sup.id}
                      draggable
                      onDragStart={(e) => handleSupportDragStart(e, sup.id)}
                      className={`min-h-[178px] p-3 border rounded-xl transition flex flex-col cursor-grab active:cursor-grabbing ${
                        currentCount >= 2 || supportIds.length >= 18
                          ? 'bg-gray-100 border-gray-200'
                          : 'bg-white hover:border-indigo-400 border-gray-200 shadow-sm'
                      }`}
                    >
                      <div className="flex gap-3 min-w-0">
                        {sup.imageDataUrl ? (
                          <div className="w-20 h-20 rounded-lg bg-gray-50 flex-shrink-0 border border-gray-200 flex items-center justify-center overflow-hidden">
                            <img src={sup.imageDataUrl} alt="" className="max-w-full max-h-full object-contain" />
                          </div>
                        ) : (
                          <div className="w-20 h-20 rounded-lg bg-gray-100 flex-shrink-0 flex items-center justify-center text-[9px] text-gray-400 border border-gray-200">NO IMG</div>
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-black text-gray-900 leading-tight mb-1">{sup.name}</div>
                          <div className="text-[11px] text-gray-600 leading-relaxed line-clamp-3">{sup.description}</div>
                          {sup.category && (
                            <div className="mt-2 inline-flex px-2 py-0.5 rounded-full bg-gray-100 text-[10px] font-bold text-gray-600">{sup.category}</div>
                          )}
                        </div>
                      </div>

                      {sup.isVirtual && (
                        <div className="mt-2 text-[10px] text-purple-600 font-bold">✨ エントリー前の仮カード</div>
                      )}

                      <div className="mt-auto pt-3 flex items-center justify-between gap-2">
                        <button
                          onClick={(e) => handleOpenSupportDetail(e, sup)}
                          className="h-8 px-2.5 rounded-lg border border-gray-300 bg-white hover:bg-indigo-50 hover:border-indigo-400 text-gray-600 hover:text-indigo-600 font-black text-xs transition"
                          title="カード詳細を見る"
                          aria-label={`${sup.name}の詳細`}
                        >ⓘ 詳細</button>

                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={(e) => { e.stopPropagation(); handleRemoveSingleSupport(sup.id); }}
                            disabled={currentCount === 0}
                            className={`w-8 h-8 rounded-lg font-black text-base transition ${
                              currentCount === 0
                                ? 'bg-gray-50 text-gray-300 cursor-not-allowed'
                                : 'bg-gray-100 hover:bg-red-50 text-gray-500 hover:text-red-600'
                            }`}
                            title={currentCount === 0 ? 'デッキに入っていません' : '1枚減らす'}
                            aria-label={`${sup.name}を1枚減らす`}
                          >−</button>
                          <span className={`text-[11px] font-black px-2 py-1 rounded-full border min-w-[40px] text-center ${currentCount === 0 ? 'bg-indigo-50 text-indigo-700 border-indigo-200' : 'bg-orange-50 text-orange-700 border-orange-200'}`}>{currentCount}/2</span>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleAddSupport(sup.id); }}
                            disabled={!canAdd}
                            className={`w-8 h-8 rounded-lg font-black text-base transition ${
                              !canAdd
                                ? 'bg-gray-50 text-gray-300 cursor-not-allowed'
                                : 'bg-gray-100 hover:bg-indigo-50 text-gray-500 hover:text-indigo-600'
                            }`}
                            title={currentCount >= 2 ? '同じカードは2枚まで' : supportIds.length >= 18 ? 'サポートカードは18枚まで' : '1枚追加'}
                            aria-label={`${sup.name}を1枚追加`}
                          >+</button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {supportTotalPages > 1 && (
                <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
                  <button
                    onClick={() => setSupportPage(prev => Math.max(1, prev - 1))}
                    disabled={supportPage === 1}
                    className="px-3 py-1.5 text-xs font-bold rounded-lg border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                  >← 前へ</button>
                  <span className="text-xs font-bold text-gray-600">{supportPage} / {supportTotalPages} ページ</span>
                  <button
                    onClick={() => setSupportPage(prev => Math.min(supportTotalPages, prev + 1))}
                    disabled={supportPage === supportTotalPages}
                    className="px-3 py-1.5 text-xs font-bold rounded-lg border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                  >次へ →</button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {isSaveAsOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-gray-200 p-6">
            {!saveAsConflictName ? (
              <>
                <h3 className="text-lg font-black text-gray-900 mb-2">デッキ名を入力</h3>
                <p className="text-xs text-gray-500 mb-4">現在のデッキを別のデッキとして保存します。</p>
                <input autoFocus type="text" value={saveAsName} onChange={(e) => setSaveAsName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleSaveAsConfirm(); }}
                  className="w-full px-3 py-2 border rounded-lg text-sm font-bold text-gray-900 focus:ring-2 focus:ring-indigo-500" />
                <div className="flex justify-end gap-2 mt-5">
                  <button onClick={() => setIsSaveAsOpen(false)} className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm font-bold">キャンセル</button>
                  <button onClick={handleSaveAsConfirm} className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm font-bold">保存</button>
                </div>
              </>
            ) : (
              <>
                <h3 className="text-lg font-black text-gray-900 mb-2">同じ名称のデッキがあります</h3>
                <p className="text-sm text-gray-700 mb-5">「{saveAsConflictName}」という名称のデッキがすでにあります。上書きしますか？</p>
                <div className="flex justify-end gap-2">
                  <button onClick={() => setSaveAsConflictName(null)} className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm font-bold">名前編集に戻る</button>
                  <button onClick={handleSaveAsOverwrite} className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-bold">はい</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      <div className="sticky bottom-0 z-30 mt-6 -mx-6 px-6 py-3 bg-white/95 backdrop-blur border-t border-gray-200 shadow-[0_-4px_12px_rgba(0,0,0,0.08)]">
        <div className="max-w-4xl mx-auto flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs font-bold text-gray-600">
            {selectedDeckId ? `編集中：${deckName}` : '新規デッキを編集中'}
            {hasUnsavedChanges && (
              <span className="ml-2 text-amber-700">● 未保存の変更</span>
            )}
            <span className="ml-3">キャラ 3枠</span>
            <span className="ml-3">サポート {supportIds.length} / 18</span>
          </div>
          <div className="flex gap-2">
            <button onClick={handleSaveDeck} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-black rounded-lg shadow cursor-pointer">
              {selectedDeckId ? '💾 上書き保存' : '💾 保存'}
            </button>
            <button onClick={handleOpenSaveAs} className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white text-sm font-black rounded-lg shadow cursor-pointer">
              📝 名前を付けて保存
            </button>
            <button onClick={() => setIsDeckDashboardOpen(true)} className="px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white text-sm font-black rounded-lg shadow cursor-pointer">
              📊 デッキダッシュボード
            </button>
            {goToCpuBattle && (
              <button
                onClick={goToCpuBattle}
                disabled={hasUnsavedChanges}
                title={hasUnsavedChanges ? '未保存の変更があります。保存してからCPU対戦へ進んでください。' : '保存済みデッキでCPU対戦を開始'}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-300 disabled:hover:bg-gray-300 disabled:text-gray-500 disabled:cursor-not-allowed text-white text-sm font-black rounded-lg shadow cursor-pointer"
              >
                {battleButtonLabel}
              </button>
            )}
          </div>
        </div>
      </div>

      {selectedCharacterDetail && (
        <div className="fixed inset-0 z-[55] bg-black/50 flex items-center justify-center p-4" onClick={() => setSelectedCharacterDetail(null)}>
          <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto bg-white rounded-2xl shadow-2xl border border-gray-200 p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3 mb-5">
              <div>
                <div className="text-xs font-bold text-indigo-600 mb-1">キャラカード詳細</div>
                <h3 className="text-xl font-black text-gray-900">{selectedCharacterDetail.userName}</h3>
              </div>
              <button onClick={() => setSelectedCharacterDetail(null)} className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-600 font-black">×</button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-[180px_1fr] gap-6">
              <div>
                <div className="w-full aspect-square rounded-xl border border-gray-200 bg-gray-50 flex items-center justify-center overflow-hidden">
                  {selectedCharacterDetail.imageDataUrl ? <img src={selectedCharacterDetail.imageDataUrl} alt={selectedCharacterDetail.userName} className="max-w-full max-h-full object-contain" /> : <span className="text-xs text-gray-400">NO IMG</span>}
                </div>
                <div className="mt-3 text-sm font-black text-gray-900">{selectedCharacterDetail.archetype}</div>
                <div className="text-xs text-gray-600 mt-1">{selectedCharacterDetail.color}</div>
                <div className="text-xs font-bold text-gray-700 mt-2">ステータス配分</div>
                <div className="text-sm font-black text-indigo-700 mt-1">{getArchetypeDistribution(selectedCharacterDetail)}</div>
                <div className="text-xs text-gray-600 mt-2">好きな季節：{getCharacterSeason(selectedCharacterDetail)}</div>
              </div>
              <div className="flex flex-col items-center">
                <StatRadar stats={getCharacterStats(selectedCharacterDetail)} size={250} />
                <div className="grid grid-cols-2 gap-2 w-full max-w-sm mt-2">
                  {Object.entries(getCharacterStats(selectedCharacterDetail)).map(([key, value]) => (
                    <div key={key} className="p-2 rounded-lg bg-gray-50 border border-gray-200 text-center">
                      <div className="text-[10px] font-bold text-gray-500">{key === 'hp' ? '体力' : key === 'intellect' ? '知略' : key === 'dexterity' ? '器用' : '特技'}</div>
                      <div className="text-lg font-black text-gray-900">{value}</div>
                    </div>
                  ))}
                </div>
                <div className="w-full max-w-sm mt-5 rounded-xl border border-indigo-100 bg-indigo-50/40 p-4">
                  <div className="text-sm font-black text-indigo-900 mb-3">技一覧・効果</div>
                  <div className="space-y-2.5">
                    {getCharacterSkills(selectedCharacterDetail).map(skill => (
                      <div key={`${selectedCharacterDetail.id}-${skill.number}`} className="rounded-lg bg-white border border-indigo-100 p-3">
                        <div className="text-sm font-black text-gray-900">{skill.number}：{skill.name}</div>
                        <div className="text-xs leading-relaxed text-gray-700 mt-1 whitespace-pre-wrap">{skill.description}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {isDeckDashboardOpen && (
        <div className="fixed inset-0 z-[50] bg-black/50 flex items-center justify-center p-4" onClick={() => setIsDeckDashboardOpen(false)}>
          <div className="w-full max-w-5xl max-h-[92vh] overflow-y-auto bg-white rounded-2xl shadow-2xl border border-gray-200 p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3 mb-2">
              <div>
                <div className="text-xs font-bold text-sky-600 mb-1">リアルタイムデッキダッシュボード</div>
                <h3 className="text-2xl font-black text-gray-900">{deckName}</h3>
                <p className="text-xs text-gray-500 mt-1">編集中の内容に合わせて自動更新されます。</p>
              </div>
              <button onClick={() => setIsDeckDashboardOpen(false)} className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-600 font-black">×</button>
            </div>

            <div className="mt-5 grid grid-cols-1 lg:grid-cols-3 gap-4">
              {(['vanguard', 'center', 'general'] as PositionRole[]).map(role => {
                const label = role === 'vanguard' ? '先鋒' : role === 'center' ? '中堅' : '大将';
                const id = role === 'vanguard' ? vanguardId : role === 'center' ? centerId : generalId;
                const card = getCard(id);
                if (!card) return (
                  <div key={role} className="rounded-xl border-2 border-dashed border-gray-200 p-5 text-center text-sm text-gray-400">{label}：未セット</div>
                );
                const base = getCharacterStats(card);
                const final = { hp: base.hp + getSupportStatDelta.hp, intellect: base.intellect + getSupportStatDelta.intellect, dexterity: base.dexterity + getSupportStatDelta.dexterity, charm: base.charm + getSupportStatDelta.charm };
                return (
                  <div key={role} className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                    <div className="flex items-center justify-between mb-2"><span className="text-xs font-black text-indigo-700">{label}</span><span className="text-sm font-black text-gray-900">{card.userName}</span></div>
                    <div className="flex justify-center">
                      <StatRadar stats={base} compareStats={final} size={210} />
                    </div>
                    <div className="text-xs font-bold text-gray-600 mt-1">{card.archetype}　／　好きな季節：{getCharacterSeason(card)}</div>
                    <div className="text-[11px] font-black text-indigo-700 mt-1">{getArchetypeDistribution(card)}</div>
                    <div className="mt-3 p-3 rounded-xl bg-white border border-gray-200">
                      <div className="text-xs font-black text-gray-700 mb-2">選択中サポートをすべて使用した場合</div>
                      <div className="grid grid-cols-4 gap-1 text-center">
                        {[['体力', base.hp, getSupportStatDelta.hp, final.hp], ['知略', base.intellect, getSupportStatDelta.intellect, final.intellect], ['器用', base.dexterity, getSupportStatDelta.dexterity, final.dexterity], ['特技', base.charm, getSupportStatDelta.charm, final.charm]].map(([name, before, delta, after]) => (
                          <div key={String(name)}>
                            <div className="text-[10px] text-gray-500">{name}</div>
                            <div className="text-sm font-black text-gray-900">{before}</div>
                            <div className={`text-[11px] font-black ${Number(delta) > 0 ? 'text-emerald-600' : Number(delta) < 0 ? 'text-red-600' : 'text-gray-400'}`}>{Number(delta) > 0 ? '+' : ''}{delta}</div>
                            <div className="text-sm font-black text-indigo-700">→ {after}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-5 p-4 rounded-xl bg-sky-50 border border-sky-100">
              <div className="text-sm font-black text-sky-900">サポートによる単純なステータス増減</div>
              <div className="text-xs text-sky-800 mt-1">「自分」対象の公式カードについて、選択枚数分を合計しています。反転・平均化・カードドロー・スコア・使用数制限などの特殊効果は計算対象外です。</div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3">
                {[['体力', getSupportStatDelta.hp], ['知略', getSupportStatDelta.intellect], ['器用', getSupportStatDelta.dexterity], ['特技', getSupportStatDelta.charm]].map(([name, value]) => (
                  <div key={String(name)} className="bg-white rounded-lg border border-sky-100 p-2 text-center"><div className="text-[10px] text-gray-500">{name}</div><div className={`text-lg font-black ${Number(value) > 0 ? 'text-emerald-600' : Number(value) < 0 ? 'text-red-600' : 'text-gray-400'}`}>{Number(value) > 0 ? '+' : ''}{value}</div></div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {selectedSupportDetail && (
        <div
          className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center p-4"
          onClick={() => setSelectedSupportDetail(null)}
        >
          <div
            className="w-full max-w-lg max-h-[90vh] overflow-y-auto bg-white rounded-2xl shadow-2xl border border-gray-200 p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 mb-4">
              <div>
                <div className="text-xs font-bold text-indigo-600 mb-1">サポートカード詳細</div>
                <h3 className="text-xl font-black text-gray-900">{selectedSupportDetail.name}</h3>
              </div>
              <button onClick={() => setSelectedSupportDetail(null)} className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-600 font-black" aria-label="閉じる">×</button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-[140px_1fr] gap-5">
              <div>
                {selectedSupportDetail.imageDataUrl ? (
                  <div className="w-full aspect-square rounded-xl border border-gray-200 bg-gray-50 flex items-center justify-center overflow-hidden">
                    <img src={selectedSupportDetail.imageDataUrl} alt={selectedSupportDetail.name} className="max-w-full max-h-full object-contain" />
                  </div>
                ) : (
                  <div className="w-full aspect-square rounded-xl bg-gray-100 border border-gray-200 flex items-center justify-center text-xs text-gray-400">NO IMG</div>
                )}
              </div>
              <div className="space-y-3">
                {(() => {
                  const meta = getSupportDetailMeta(selectedSupportDetail);
                  return (
                    <>
                      <div className="flex flex-wrap gap-2">
                        {selectedSupportDetail.category && <span className="px-2 py-1 rounded-full bg-gray-100 text-gray-700 text-xs font-bold">カテゴリ：{selectedSupportDetail.category}</span>}
                        {meta.target && <span className="px-2 py-1 rounded-full bg-blue-50 text-blue-700 border border-blue-100 text-xs font-bold">対象：{meta.target}</span>}
                        {selectedSupportDetail.isVirtual && <span className="px-2 py-1 rounded-full bg-purple-50 text-purple-700 border border-purple-100 text-xs font-bold">仮カード</span>}
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <div className="p-3 rounded-xl bg-indigo-50 border border-indigo-100">
                          <div className="text-[11px] font-black text-indigo-500 mb-1">持続</div>
                          <div className="text-sm font-black text-indigo-900">{meta.duration === '永続' && meta.note?.includes('最大4ターン') ? '永続（最大4ターン）' : (meta.duration || '記載なし')}</div>
                        </div>
                        <div className="p-3 rounded-xl bg-amber-50 border border-amber-100">
                          <div className="text-[11px] font-black text-amber-600 mb-1">増加・減少量</div>
                          <div className="text-sm font-black text-amber-900">{meta.effectAmount || '数値・枚数の指定なし'}</div>
                        </div>
                      </div>

                      <div className="p-3 rounded-xl bg-gray-50 border border-gray-200 space-y-2">
                        {meta.statEffect && (
                          <div>
                            <div className="text-[11px] font-black text-gray-500 mb-1">具体的な効果</div>
                            <div className="text-sm font-bold text-gray-800">{meta.statEffect}</div>
                          </div>
                        )}
                        <div>
                          <div className="text-[11px] font-black text-gray-500 mb-1">効果・説明</div>
                          <div className="text-sm leading-relaxed text-gray-800 whitespace-pre-wrap">{selectedSupportDetail.description || '説明はありません。'}</div>
                        </div>
                        {meta.note && (
                          <div className="pt-2 border-t border-gray-200">
                            <div className="text-[11px] font-black text-gray-500 mb-1">備考・制限</div>
                            <div className="text-sm leading-relaxed text-gray-700 whitespace-pre-wrap">{meta.note}</div>
                          </div>
                        )}
                      </div>

                      {selectedSupportDetail.presetId && <div className="text-[10px] text-gray-400 break-all">プリセットID: {selectedSupportDetail.presetId}</div>}
                    </>
                  );
                })()}
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-6">
              <button
                onClick={() => handleRemoveSingleSupport(selectedSupportDetail.id)}
                disabled={!supportIds.includes(selectedSupportDetail.id)}
                className="px-4 py-2 bg-gray-100 hover:bg-red-50 hover:text-red-600 rounded-lg text-sm font-bold disabled:opacity-40 disabled:cursor-not-allowed"
              >− 1枚減らす</button>
              <button
                onClick={() => handleAddSupport(selectedSupportDetail.id)}
                disabled={supportIds.length >= 18 || supportIds.filter(id => id === selectedSupportDetail.id).length >= 2}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-bold disabled:opacity-40 disabled:cursor-not-allowed"
              >＋ 1枚追加</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
