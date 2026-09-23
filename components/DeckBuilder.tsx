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
  colorHex?: string;
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
  colorHex?: string;
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
  colorHex?: string;
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
  onGoToEntryHub?: () => void;
}

export default function DeckBuilder({ onGoToCpuBattle, onGoToBattle, initialDeckId = null, battleButtonLabel = '⚔️ CPU対戦へ', onGoToEntryHub }: DeckBuilderProps) {
  // 既存の呼び出し側が onGoToCpuBattle / onGoToBattle のどちらでも動くよう互換性を維持します。
  const goToCpuBattle = onGoToCpuBattle ?? onGoToBattle;
  const [cards, setCards] = useState<AvatarCard[]>([]);
  const [supportPool, setSupportPool] = useState<SupportCard[]>([]);
  
  const [decks, setDecks] = useState<Deck[]>([]);
  const [selectedDeckId, setSelectedDeckId] = useState<string | null>(null);
  const [deckName, setDeckName] = useState<string>('新しいチーム');
  
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
  const [isOtherMenuOpen, setIsOtherMenuOpen] = useState<boolean>(false);
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
            colorHex: e.colorHex,
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
    setDeckName('新しいチーム');
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
      setMessage('⚠️ フェザークラス・オーロラクラス・スタークラスのすべてにキャラカードをセットしてください。');
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
      setMessage('🎉 新しいチームを保存しました！');
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
    const baseName = deckName.trim() || '新規チーム';
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
      setMessage('🗑️ チームを削除しました。');
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

          setMessage('🎉 ファイルからチームを復元しました！');
        } else {
          throw new Error('形式が不正です');
        }
      } catch (err) {
        setMessage('❌ ファイルの読み込みに失敗しました。正しいチームJSONかご確認ください。');
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
    const groups: Array<{ labels: string[]; value: number }> = [];
    sorted.forEach(([label, value]) => {
      const last = groups[groups.length - 1];
      if (last && last.value === value) {
        last.labels.push(label);
      } else {
        groups.push({ labels: [label], value });
      }
    });
    return groups.map(group => group.labels.join('＝')).join('＞');
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
    <div className="flex h-full min-h-0 flex-col bg-gray-50 text-gray-900">
      <div className="shrink-0 border-b border-gray-200 bg-white px-4 py-3 shadow-sm sm:px-5">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[9px] font-black tracking-[0.24em] text-indigo-500">TEAM BUILDER</div>
            <h1 className="mt-0.5 truncate text-xl font-black text-indigo-950">チームを編成する</h1>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => setIsDeckDashboardOpen(true)}
              className="rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-[10px] font-black text-indigo-800 transition hover:bg-indigo-100"
            >
              チーム分析
            </button>
            <button
              type="button"
              onClick={() => setIsOtherMenuOpen(true)}
              className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-[10px] font-black text-gray-600 transition hover:bg-gray-50"
              aria-label="その他"
            >
              ••• その他
            </button>
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden">
        <div className="mx-auto flex h-full min-h-0 w-full max-w-5xl flex-col px-3 py-3 sm:px-5">
          {message && (
            <div className="mb-2 shrink-0 rounded-2xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-[10px] font-black text-indigo-900" role="status">
              {message}
            </div>
          )}

          <section className="shrink-0 rounded-3xl border border-gray-200 bg-white p-3 shadow-sm sm:p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="text-[9px] font-black tracking-[0.14em] text-gray-400">TEAM NAME</div>
                <input
                  type="text"
                  value={deckName}
                  onChange={(e) => setDeckName(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-base font-black text-gray-950 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                  placeholder="チーム名"
                  aria-label="チーム名"
                />
              </div>
              <div className="shrink-0 text-right">
                <div className="text-[9px] font-black tracking-[0.14em] text-gray-400">編成状況</div>
                <div className={`mt-1 text-sm font-black ${vanguardId && centerId && generalId ? 'text-emerald-600' : 'text-amber-600'}`}>
                  キャラ {[vanguardId, centerId, generalId].filter(Boolean).length}/3
                </div>
                <div className={`text-[10px] font-black ${supportIds.length === 18 ? 'text-emerald-600' : 'text-amber-600'}`}>サポート {supportIds.length}/18</div>
              </div>
            </div>
          </section>

          <section className="mt-3 shrink-0 rounded-3xl border border-indigo-100 bg-indigo-50/50 p-3 shadow-sm sm:p-4">
            <div className="mb-2 flex items-end justify-between gap-3">
              <div>
                <div className="text-[9px] font-black tracking-[0.16em] text-indigo-500">CHARACTER LINEUP</div>
                <h2 className="mt-0.5 text-sm font-black text-indigo-950">キャラカード</h2>
              </div>
              <div className="text-[9px] font-bold text-gray-500">各クラスの枠をタップ → キャラを選ぶ</div>
            </div>

            <div className="grid grid-cols-3 gap-2">
              {([
                ['vanguard', 'フェザークラス', vanguardId],
                ['center', 'オーロラクラス', centerId],
                ['general', 'スタークラス', generalId],
              ] as Array<[PositionRole, string, string | null]>).map(([role, label, cardId]) => {
                const card = getCard(cardId);
                const isTargeting = selectedTargetRole === role;
                return (
                  <button
                    key={role}
                    type="button"
                    onClick={() => {
                      setSelectedTargetRole(role);
                      setSelectedCardId(null);
                      setSelectedCharacterDetail(null);
                    }}
                    className={`min-w-0 rounded-2xl border-2 p-2 text-left transition ${
                      isTargeting ? 'border-indigo-500 bg-white ring-2 ring-indigo-200' : 'border-white bg-white/80 hover:border-indigo-200'
                    }`}
                    aria-label={`${label}にキャラカードを設定`}
                  >
                    <div className="text-center text-[9px] font-black text-indigo-700">{label}</div>
                    {card ? (
                      <div className="mt-2">
                        <div className="overflow-hidden rounded-xl border-2 bg-white" style={{ borderColor: card.colorHex || '#dbeafe' }}>
                          {card.imageDataUrl ? (
                            <img src={card.imageDataUrl} alt="" className="h-28 w-full object-cover" />
                          ) : (
                            <div className="flex h-28 items-center justify-center bg-gray-100 text-[9px] text-gray-400">画像なし</div>
                          )}
                        </div>
                        <div className="mt-1 truncate text-center text-[10px] font-black text-gray-950">{card.userName}</div>
                        <div className="mt-0.5 text-center text-[8px] font-bold text-gray-400">詳しく見る／変更</div>
                      </div>
                    ) : (
                      <div className={`mt-2 flex h-36 flex-col items-center justify-center rounded-xl border-2 border-dashed ${isTargeting ? 'border-indigo-300 bg-indigo-50 text-indigo-700' : 'border-gray-300 bg-gray-50 text-gray-400'}`}>
                        <span className="text-lg">＋</span>
                        <span className="mt-1 text-[9px] font-black">キャラを選ぶ</span>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </section>

          <section className="mt-3 min-h-0 flex-1 rounded-3xl border border-purple-100 bg-white p-3 shadow-sm sm:p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-[9px] font-black tracking-[0.16em] text-purple-500">SUPPORT LINEUP</div>
                <h2 className="mt-0.5 text-sm font-black text-purple-950">サポートカード</h2>
              </div>
              <div className="flex items-center gap-2">
                <div className={`text-sm font-black ${supportIds.length === 18 ? 'text-emerald-600' : 'text-amber-600'}`}>{supportIds.length} / 18枚</div>
                <button
                  type="button"
                  onClick={() => { setIsSupportFilterOpen(true); setSelectedSupportDetail(null); }}
                  className="rounded-xl bg-purple-700 px-3 py-2 text-[10px] font-black text-white shadow-sm transition hover:bg-purple-800"
                >
                  ＋ カードを選ぶ
                </button>
              </div>
            </div>

            <div
              className="mt-2 min-h-[76px] max-h-[26vh] overflow-x-auto rounded-2xl border-2 border-dashed border-purple-100 bg-purple-50/40 p-2"
              onDragOver={handleDragOver}
              onDrop={handleSupportDrop}
            >
              {groupedSupportCards.length === 0 ? (
                <div className="flex h-16 items-center justify-center text-[10px] font-bold text-gray-400">「カードを選ぶ」から追加してください</div>
              ) : (
                <div className="grid grid-flow-col grid-rows-2 auto-cols-[76px] gap-2 min-w-max">
                  {groupedSupportCards.map(({ id, count, data }) => data ? (
                    <div key={id} className="w-[76px] shrink-0 rounded-xl border bg-white p-1 shadow-sm" style={{ borderColor: data.colorHex || '#e9d5ff' }}>
                      <div className="relative h-14 overflow-hidden rounded-lg bg-gray-100">
                        {data.imageDataUrl ? <img src={data.imageDataUrl} alt="" className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center text-[7px] text-gray-400">画像なし</div>}
                        <span className="absolute right-0.5 top-0.5 rounded-full bg-gray-950/75 px-1 py-0.5 text-[7px] font-black text-white">×{count}</span>
                      </div>
                      <div className="mt-1 line-clamp-2 min-h-[22px] text-[8px] font-black leading-tight text-gray-900">{data.name}</div>
                      <button type="button" onClick={() => handleRemoveSingleSupport(id)} className="mt-1 w-full rounded-lg bg-gray-50 py-0.5 text-[7px] font-black text-gray-500 hover:bg-red-50 hover:text-red-600">1枚減らす</button>
                    </div>
                  ) : null)}
                </div>
              )}
            </div>
          </section>

          <div className="mt-3 grid shrink-0 grid-cols-2 gap-2">
            <button
              type="button"
              onClick={handleSaveDeck}
              className="rounded-2xl bg-indigo-600 px-4 py-3 text-sm font-black text-white shadow-lg shadow-indigo-100 transition hover:bg-indigo-700"
            >
              {selectedDeckId ? 'チームを保存して更新' : 'チームを保存する'}
            </button>
            <button
              type="button"
              onClick={() => {
                if (!validateDeckForSave()) return;
                handleSaveDeck();
                goToCpuBattle?.();
              }}
              className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-black text-emerald-800 transition hover:bg-emerald-100"
            >
              {battleButtonLabel.replace(/^⚔️\s*/, '')}
            </button>
          </div>
        </div>
      </div>

      {/* キャラカード選択モーダル */}
      {selectedTargetRole && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-gray-950/50 p-2 sm:items-center sm:p-5">
          <div className="flex max-h-[92dvh] w-full max-w-5xl min-h-0 flex-col overflow-hidden rounded-3xl bg-white shadow-2xl">
            <div className="shrink-0 border-b border-gray-200 bg-white px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-[9px] font-black tracking-[0.16em] text-indigo-500">CHARACTER CARD SELECT</div>
                  <h2 className="mt-0.5 text-base font-black text-gray-950">
                    {selectedTargetRole === 'vanguard' ? 'フェザークラス' : selectedTargetRole === 'center' ? 'オーロラクラス' : 'スタークラス'} に入れるキャラを選ぶ
                  </h2>
                </div>
                <button type="button" onClick={() => { setSelectedTargetRole(null); setSelectedCharacterDetail(null); }} className="rounded-xl bg-gray-100 px-3 py-2 text-[10px] font-black text-gray-700">閉じる</button>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <input type="text" value={charSearchQuery} onChange={(e) => setCharSearchQuery(e.target.value)} placeholder="登録ユーザー名で検索" className="min-w-0 flex-1 rounded-xl border border-gray-200 bg-white px-3 py-2 text-[10px]" />
                <button type="button" onClick={() => setIsCharFilterOpen((v) => !v)} className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-[10px] font-black text-gray-600">絞り込み{activeCharFilterCount > 0 ? ` (${activeCharFilterCount})` : ''}</button>
              </div>
              {isCharFilterOpen && (
                <div className="mt-2 rounded-2xl bg-indigo-50 p-2">
                  <div className="flex flex-wrap gap-1.5">
                    {availableColors.map(color => <button key={color} type="button" onClick={() => toggleColorFilter(color)} className={`rounded-lg border px-2 py-1 text-[9px] font-black ${selectedColors.includes(color) ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-gray-200 bg-white text-gray-600'}`}>{color}</button>)}
                  </div>
                </div>
              )}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-3">
              {filteredCards.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 py-12 text-center text-xs font-bold text-gray-400">登録されているキャラカードがありません。</div>
              ) : (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                  {filteredCards.map(card => {
                    const isAssigned = [vanguardId, centerId, generalId].includes(card.id);
                    return (
                      <div key={card.id} className={`rounded-2xl border p-2 transition ${isAssigned ? 'border-gray-200 bg-gray-100 opacity-45' : 'border-gray-200 bg-white hover:border-indigo-300'}`}>
                        <button type="button" disabled={isAssigned} onClick={() => { assignCardToRole(card.id, selectedTargetRole); setSelectedCharacterDetail(null); }} className="w-full text-left disabled:cursor-not-allowed">
                          <div className="overflow-hidden rounded-xl border-2 bg-white" style={{ borderColor: card.colorHex || '#dbeafe' }}>
                            {card.imageDataUrl ? <img src={card.imageDataUrl} alt="" className="h-32 w-full object-cover" /> : <div className="flex h-32 items-center justify-center bg-gray-100 text-[8px] text-gray-400">画像なし</div>}
                          </div>
                          <div className="mt-1 truncate text-[10px] font-black">{card.userName}</div>
                          <div className="mt-0.5 text-[8px] font-bold text-gray-400">{isAssigned ? '編成済み' : 'このクラスに入れる'}</div>
                        </button>
                        <button type="button" onClick={() => setSelectedCharacterDetail(card)} className="mt-1 w-full rounded-lg bg-gray-50 py-1 text-[8px] font-black text-gray-500 hover:bg-indigo-50 hover:text-indigo-700">詳細を見る</button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {selectedCharacterDetail && (
              <div className="shrink-0 max-h-[34dvh] overflow-y-auto border-t border-gray-200 bg-gray-50 p-3">
                <div className="flex items-start gap-3">
                  <div className="w-24 shrink-0 overflow-hidden rounded-2xl border-2 bg-white" style={{ borderColor: selectedCharacterDetail.colorHex || '#dbeafe' }}>
                    {selectedCharacterDetail.imageDataUrl ? <img src={selectedCharacterDetail.imageDataUrl} alt="" className="aspect-square w-full object-cover" /> : <div className="flex aspect-square items-center justify-center text-[8px] text-gray-400">画像なし</div>}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-black text-gray-950">{selectedCharacterDetail.userName}</div>
                    <div className="mt-1 grid grid-cols-2 gap-1 text-[9px] font-black text-gray-600">
                      {(['hp','intellect','dexterity','charm'] as const).map(key => (
                        <div key={key} className="rounded-lg bg-white px-2 py-1">{key === 'hp' ? '体力' : key === 'intellect' ? '知略' : key === 'dexterity' ? '器用' : '特技'} {getCharacterStats(selectedCharacterDetail)[key]}</div>
                      ))}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {getCharacterSkills(selectedCharacterDetail).map(skill => <div key={skill.number} className="rounded-lg bg-white px-2 py-1 text-[8px] font-bold text-gray-600">スキル{skill.number}：{skill.name}</div>)}
                    </div>
                    <button type="button" disabled={[vanguardId, centerId, generalId].includes(selectedCharacterDetail.id)} onClick={() => { assignCardToRole(selectedCharacterDetail.id, selectedTargetRole); setSelectedCharacterDetail(null); }} className="mt-2 rounded-xl bg-indigo-600 px-4 py-2 text-[9px] font-black text-white disabled:bg-gray-300">このキャラをセットする</button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* サポートカード選択モーダル */}
      {isSupportFilterOpen && !selectedTargetRole && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-gray-950/50 p-2 sm:items-center sm:p-5">
          <div className="flex max-h-[92dvh] w-full max-w-5xl min-h-0 flex-col overflow-hidden rounded-3xl bg-white shadow-2xl">
            <div className="shrink-0 border-b border-gray-200 bg-white px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-[9px] font-black tracking-[0.16em] text-purple-500">SUPPORT CARD SELECT</div>
                  <h2 className="mt-0.5 text-base font-black text-gray-950">サポートカードを選ぶ</h2>
                </div>
                <button type="button" onClick={() => setIsSupportFilterOpen(false)} className="rounded-xl bg-gray-100 px-3 py-2 text-[10px] font-black text-gray-700">閉じる</button>
              </div>
              <div className="mt-3 space-y-2">
                <label className="block text-[9px] font-black text-gray-500" htmlFor="support-card-search">カード名・効果から探す</label>
                <input id="support-card-search" type="text" value={supSearchQuery} onChange={(e) => setSupSearchQuery(e.target.value)} placeholder="カード名・効果を入力して検索" className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm outline-none focus:border-purple-400 focus:ring-2 focus:ring-purple-100" />
                <div className="flex flex-wrap gap-2">
                {availableSupportCategories.length > 0 && availableSupportCategories.map(category => (
                  <button
                    key={category}
                    type="button"
                    onClick={() => toggleSupportCategoryFilter(category)}
                    className={`rounded-xl border px-2.5 py-2 text-[9px] font-black ${selectedSupportCategories.includes(category) ? 'border-purple-600 bg-purple-600 text-white' : 'border-gray-200 bg-white text-gray-600'}`}
                  >
                    {category}
                  </button>
                ))}
                </div>
              </div>
              <div className="mt-2 flex items-center justify-between text-[9px] font-bold text-gray-400">
                <span>{filteredSupportCards.length}件</span>
                {selectedSupportCategories.length > 0 && <button type="button" onClick={clearSupportFilters} className="font-black text-purple-600">絞り込みを解除</button>}
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-3">
              {filteredSupportCards.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 py-12 text-center text-xs font-bold text-gray-400">条件に一致するサポートカードがありません。</div>
              ) : (
                <div className="grid grid-cols-4 gap-2">
                  {filteredSupportCards.map(sup => {
                    const currentCount = supportIds.filter(id => id === sup.id).length;
                    const full = supportIds.length >= 18 || currentCount >= 2;
                    const meta = getSupportDetailMeta(sup);
                    return (
                      <div key={sup.id} className={`rounded-2xl border p-2 transition ${full ? 'border-gray-200 bg-gray-100 opacity-55' : 'border-gray-200 bg-white hover:border-purple-300'}`}>
                        <button type="button" disabled={full} onClick={() => handleAddSupport(sup.id)} className="w-full text-left disabled:cursor-not-allowed">
                          <div className="overflow-hidden rounded-xl border-2 bg-gray-100" style={{ borderColor: sup.colorHex || '#e9d5ff' }}>
                            {sup.imageDataUrl ? <img src={sup.imageDataUrl} alt="" className="h-24 w-full object-cover" /> : <div className="flex h-24 items-center justify-center text-[8px] text-gray-400">画像なし</div>}
                          </div>
                          <div className="mt-1 line-clamp-2 text-[9px] font-black text-gray-950">{sup.name}</div>
                          <div className="mt-1 text-[8px] font-bold text-gray-500">{meta.statEffect || sup.category || 'サポート効果'}</div>
                          <div className="mt-0.5 text-[8px] text-gray-400">{currentCount > 0 ? `現在 ×${currentCount}` : 'タップで追加'}</div>
                        </button>
                        <button type="button" onClick={() => setSelectedSupportDetail(sup)} className="mt-1 w-full rounded-lg bg-gray-50 py-1 text-[8px] font-black text-gray-500 hover:bg-purple-50 hover:text-purple-700">詳細を見る</button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {selectedSupportDetail && (
              <div className="shrink-0 max-h-[34dvh] overflow-y-auto border-t border-gray-200 bg-gray-50 p-3">
                <div className="flex items-start gap-3">
                  <div className="w-24 shrink-0 overflow-hidden rounded-2xl border-2 bg-white" style={{ borderColor: selectedSupportDetail.colorHex || '#e9d5ff' }}>
                    {selectedSupportDetail.imageDataUrl ? <img src={selectedSupportDetail.imageDataUrl} alt="" className="aspect-square w-full object-cover" /> : <div className="flex aspect-square items-center justify-center text-[8px] text-gray-400">画像なし</div>}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-black text-gray-950">{selectedSupportDetail.name}</div>
                    {(() => {
                      const meta = getSupportDetailMeta(selectedSupportDetail);
                      return (
                        <>
                          <div className="mt-1 flex flex-wrap gap-1.5 text-[8px] font-black text-gray-600">
                            {meta.target && <span className="rounded-lg bg-white px-2 py-1">対象：{meta.target}</span>}
                            {meta.duration && <span className="rounded-lg bg-white px-2 py-1">持続：{meta.duration}</span>}
                            {meta.statEffect && <span className="rounded-lg bg-white px-2 py-1">効果：{meta.statEffect}{meta.effectAmount ? ` ${meta.effectAmount}` : ''}</span>}
                          </div>
                          <div className="mt-2 rounded-xl bg-white p-2 text-[9px] leading-5 text-gray-700 whitespace-pre-wrap">{selectedSupportDetail.description || '説明はありません。'}</div>
                          {meta.note && <div className="mt-1 text-[8px] text-gray-500 whitespace-pre-wrap">{meta.note}</div>}
                        </>
                      );
                    })()}
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button type="button" onClick={() => setSelectedSupportDetail(null)} className="rounded-xl bg-white px-3 py-2 text-[9px] font-black text-gray-600">閉じる</button>
                      <button type="button" onClick={() => { handleAddSupport(selectedSupportDetail.id); setSelectedSupportDetail(null); }} disabled={supportIds.length >= 18 || supportIds.filter(id => id === selectedSupportDetail.id).length >= 2} className="rounded-xl bg-purple-700 px-3 py-2 text-[9px] font-black text-white disabled:bg-gray-300">このカードを追加</button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* チーム分析 */}
      {isDeckDashboardOpen && (
        <div className="fixed inset-0 z-[55] flex items-end justify-center bg-gray-950/50 p-2 sm:items-center sm:p-5">
          <div className="flex max-h-[92dvh] w-full max-w-4xl min-h-0 flex-col overflow-hidden rounded-3xl bg-white shadow-2xl">
            <div className="shrink-0 flex items-center justify-between gap-3 border-b border-gray-200 px-4 py-3">
              <div>
                <div className="text-[9px] font-black tracking-[0.16em] text-indigo-500">TEAM ANALYSIS</div>
                <h2 className="mt-0.5 text-base font-black">チーム分析</h2>
              </div>
              <button type="button" onClick={() => setIsDeckDashboardOpen(false)} className="rounded-xl bg-gray-100 px-3 py-2 text-[10px] font-black text-gray-700">閉じる</button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              <div className="grid gap-3 sm:grid-cols-3">
                {([
                  ['フェザークラス', vanguardId],
                  ['オーロラクラス', centerId],
                  ['スタークラス', generalId],
                ] as Array<[string, string | null]>).map(([label, cardId]) => {
                  const card = getCard(cardId);
                  const stats = card ? getCharacterStats(card) : null;
                  return (
                    <div key={label} className="rounded-2xl border border-gray-200 bg-gray-50 p-3 text-center">
                      <div className="text-[9px] font-black text-indigo-700">{label}</div>
                      <div className="mt-1 truncate text-xs font-black">{card?.userName || '未セット'}</div>
                      {stats ? <StatRadar stats={stats} size={145} /> : <div className="py-10 text-[9px] font-bold text-gray-400">キャラ未設定</div>}
                    </div>
                  );
                })}
              </div>
              <div className="mt-3 rounded-2xl border border-purple-100 bg-purple-50/50 p-3">
                <div className="text-[9px] font-black text-purple-700">サポートによるステータス変化（自分対象のみ）</div>
                <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {([
                    ['体力', getSupportStatDelta.hp],
                    ['知略', getSupportStatDelta.intellect],
                    ['器用', getSupportStatDelta.dexterity],
                    ['特技', getSupportStatDelta.charm],
                  ] as Array<[string, number]>).map(([label, delta]) => (
                    <div key={label} className="rounded-xl bg-white px-2 py-2 text-center">
                      <div className="text-[8px] font-bold text-gray-400">{label}</div>
                      <div className={`text-sm font-black ${delta > 0 ? 'text-emerald-600' : delta < 0 ? 'text-rose-600' : 'text-gray-500'}`}>{delta > 0 ? '+' : ''}{delta}</div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="mt-3 rounded-2xl border border-gray-200 bg-white p-3">
                <div className="text-[9px] font-black tracking-wide text-gray-400">CURRENT TEAM</div>
                <div className="mt-1 text-sm font-black">{deckName || '新規チーム'}</div>
                <div className="mt-2 text-[9px] leading-5 text-gray-500">キャラ3枠とサポート18枚を、この分析で確認できます。</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* その他メニュー */}
      {isOtherMenuOpen && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-gray-950/50 p-2 sm:items-center sm:p-5">
          <div className="w-full max-w-md rounded-3xl bg-white p-4 shadow-2xl">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-[9px] font-black tracking-[0.16em] text-gray-400">OTHER</div>
                <h2 className="mt-0.5 text-base font-black">その他</h2>
              </div>
              <button type="button" onClick={() => setIsOtherMenuOpen(false)} className="rounded-xl bg-gray-100 px-3 py-2 text-[10px] font-black text-gray-700">閉じる</button>
            </div>

            <div className="mt-3 space-y-3">
              {decks.length > 0 && (
                <div className="rounded-2xl border border-gray-200 bg-gray-50 p-3">
                  <div className="text-[9px] font-black text-gray-500">保存済みチーム</div>
                  <div className="mt-2 flex max-h-28 flex-wrap gap-1.5 overflow-y-auto">
                    {decks.map(deck => (
                      <button
                        key={deck.id}
                        type="button"
                        onClick={() => { loadDeckToEditor(deck); setIsOtherMenuOpen(false); }}
                        className={`rounded-xl px-2.5 py-2 text-[9px] font-black ${selectedDeckId === deck.id ? 'bg-indigo-600 text-white' : 'border border-gray-200 bg-white text-gray-700 hover:bg-indigo-50'}`}
                      >
                        {deck.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={() => { setIsDeckDashboardOpen(true); setIsOtherMenuOpen(false); }} className="rounded-2xl border border-indigo-200 bg-indigo-50 p-3 text-left text-[10px] font-black text-indigo-800">📊 チーム分析</button>
                {onGoToEntryHub && (
                  <button type="button" onClick={() => { setIsOtherMenuOpen(false); onGoToEntryHub(); }} className="rounded-2xl border border-gray-200 bg-gray-50 p-3 text-left text-[10px] font-black text-gray-700">🗂️ カードライブラリ</button>
                )}
                <button type="button" onClick={() => { handleDuplicateDeck(); setIsOtherMenuOpen(false); }} className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-left text-[10px] font-black text-amber-800">📋 チームを複製</button>
                <button type="button" onClick={() => { handleOpenSaveAs(); setIsOtherMenuOpen(false); }} className="rounded-2xl border border-gray-200 bg-white p-3 text-left text-[10px] font-black text-gray-700">＋ 名前を付けて保存</button>
                <button type="button" onClick={() => { handleExportDeck(); setIsOtherMenuOpen(false); }} className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-left text-[10px] font-black text-emerald-800">📤 チームを書き出す</button>
                <label className="cursor-pointer rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-left text-[10px] font-black text-emerald-800">
                  📥 チームを読み込む
                  <input type="file" accept=".json" onChange={(e) => { handleImportDeck(e); setIsOtherMenuOpen(false); }} className="hidden" />
                </label>
                {decks.length > 1 && <button type="button" onClick={handleExportAllDecks} className="rounded-2xl border border-emerald-200 bg-white p-3 text-left text-[10px] font-black text-emerald-700">📦 全チームを書き出す</button>}
                {selectedDeckId && <button type="button" onClick={() => { handleDeleteDeck(selectedDeckId); setIsOtherMenuOpen(false); }} className="rounded-2xl border border-rose-200 bg-rose-50 p-3 text-left text-[10px] font-black text-rose-700">🗑️ チームを削除</button>}
                <button type="button" onClick={() => { resetToNewDeck(); setIsOtherMenuOpen(false); }} className="rounded-2xl border border-dashed border-gray-300 bg-white p-3 text-left text-[10px] font-black text-gray-600">＋ 新しいチーム</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 名前を付けて保存 */}
      {isSaveAsOpen && (
        <div className="fixed inset-0 z-[65] flex items-end justify-center bg-gray-950/50 p-2 sm:items-center sm:p-5">
          <div className="w-full max-w-md rounded-3xl bg-white p-4 shadow-2xl">
            <div className="text-base font-black">名前を付けて保存</div>
            <p className="mt-1 text-[9px] text-gray-500">現在の編成を別のチームとして保存します。</p>
            <input type="text" value={saveAsName} onChange={(e) => setSaveAsName(e.target.value)} className="mt-3 w-full rounded-xl border border-gray-200 px-3 py-3 text-sm font-black" placeholder="チーム名" />
            {saveAsConflictName && <div className="mt-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-[10px] font-black text-amber-800">「{saveAsConflictName}」はすでにあります。上書きしますか？</div>}
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button type="button" onClick={() => { setIsSaveAsOpen(false); setSaveAsConflictName(null); }} className="rounded-xl bg-gray-100 px-3 py-3 text-xs font-black text-gray-700">キャンセル</button>
              {saveAsConflictName ? <button type="button" onClick={handleSaveAsOverwrite} className="rounded-xl bg-indigo-600 px-3 py-3 text-xs font-black text-white">上書きする</button> : <button type="button" onClick={handleSaveAsConfirm} className="rounded-xl bg-indigo-600 px-3 py-3 text-xs font-black text-white">保存する</button>}
            </div>
          </div>
        </div>
      )}

      {selectedCharacterDetail && !selectedTargetRole && null}
      {selectedSupportDetail && !isSupportFilterOpen && null}
    </div>
  );
}
