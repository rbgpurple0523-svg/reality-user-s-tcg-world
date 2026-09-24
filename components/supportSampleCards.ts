import {
  EMOTION_PRESETS,
  getEmotionFlavorText,
  type EmotionPreset,
} from './emotionPresets';

export const VIRTUAL_SUPPORT_PREFIX = 'emotion_sample_';
export const DEFAULT_VIRTUAL_SUPPORT_COLOR_HEX = '#22D3EE';

const EMOTION_CATEGORY_ICONS: Record<string, string> = {
  '情熱': '🔥',
  '知性': '🔷',
  '技能': '⬡',
  '愛嬌': '🩷',
  '全ステータス': '✚',
  'スコア': '●',
  'サポートカード使用数': '↕',
  'ドロー': '＋',
  'ステータスコピー・平均化': '◎',
  '効果反射': '↩',
  '技封印': '⊘',
};

const getVirtualSupportIcon = (emotion: EmotionPreset): string =>
  EMOTION_CATEGORY_ICONS[emotion.effectCategory] || '●';

/** 公式仮サポートカード用のアイコンだけのプレビュー画像を生成します。 */
export const getVirtualSupportImageDataUrl = (emotion: EmotionPreset): string => {
  const icon = getVirtualSupportIcon(emotion);
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#eef2ff"/>
      <stop offset="100%" stop-color="#f5d0fe"/>
    </linearGradient>
    <linearGradient id="orb" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#6366f1" stop-opacity="0.86"/>
      <stop offset="100%" stop-color="#c026d3" stop-opacity="0.76"/>
    </linearGradient>
  </defs>
  <rect x="18" y="18" width="364" height="364" rx="58" fill="url(#bg)" stroke="#ffffff" stroke-width="10"/>
  <circle cx="200" cy="200" r="126" fill="url(#orb)" opacity="0.94"/>
  <circle cx="200" cy="200" r="96" fill="#ffffff" opacity="0.18"/>
  <text x="200" y="246" text-anchor="middle" font-family="system-ui,-apple-system,Segoe UI,sans-serif" font-size="148" font-weight="900" fill="#ffffff">${icon}</text>
</svg>`;

  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
};

export interface VirtualSupportCard {
  id: string;
  name: string;
  description: string;
  cost: number;
  category: string;
  imageDataUrl: string;
  presetId: string;
  flavorText: string;
  colorHex: string;
  isVirtual: true;
}

function createVirtualSupportCard(
  emotion: EmotionPreset,
): VirtualSupportCard {
  return {
    id: `${VIRTUAL_SUPPORT_PREFIX}${emotion.id}`,
    name: emotion.name,
    description: emotion.description,
    cost: 1,
    category: emotion.effectCategory,
    imageDataUrl: getVirtualSupportImageDataUrl(emotion),
    presetId: emotion.id,
    flavorText: getEmotionFlavorText(emotion),
    colorHex: DEFAULT_VIRTUAL_SUPPORT_COLOR_HEX,
    isVirtual: true,
  };
}

/** エントリー前の公式エモーションを、デッキに入れられる仮サポートカードへ変換します。 */
export const createVirtualSupportCards = (
  enteredPresetIds: Set<string> = new Set(),
): VirtualSupportCard[] =>
  EMOTION_PRESETS
    .filter((emotion) => !enteredPresetIds.has(emotion.id))
    .map(createVirtualSupportCard);
