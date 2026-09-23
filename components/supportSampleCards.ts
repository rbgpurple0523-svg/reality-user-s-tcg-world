import {
  EMOTION_PRESETS,
  getEmotionFlavorText,
  type EmotionPreset,
} from './emotionPresets';

export const VIRTUAL_SUPPORT_PREFIX = 'emotion_sample_';
export const DEFAULT_VIRTUAL_SUPPORT_COLOR_HEX = '#22D3EE';

const EMOTION_CATEGORY_ICONS: Record<string, string> = {
  '体力': '♥',
  '知略': '◆',
  '器用': '✦',
  '特技': '★',
  '全ステータス': '✚',
  'スコア': '●',
  'サポートカード使用数': '↕',
  'ドロー': '＋',
  'ステータスコピー・平均化': '◎',
  '効果反射': '↩',
  '技封印': '⊘',
};

const escapeXml = (value: string): string =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('\"', '&quot;')
    .replaceAll("'", '&apos;');

/** 公式仮サポートカード用の自己完結型プレビュー画像を生成します。 */
export const getVirtualSupportImageDataUrl = (emotion: EmotionPreset): string => {
  const name = escapeXml(emotion.name);
  const category = escapeXml(emotion.effectCategory);
  const icon = escapeXml(EMOTION_CATEGORY_ICONS[emotion.effectCategory] || '●');
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 800">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#eef2ff"/>
      <stop offset="100%" stop-color="#f5d0fe"/>
    </linearGradient>
    <linearGradient id="orb" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#6366f1" stop-opacity="0.82"/>
      <stop offset="100%" stop-color="#c026d3" stop-opacity="0.72"/>
    </linearGradient>
  </defs>
  <rect x="18" y="18" width="564" height="764" rx="46" fill="url(#bg)" stroke="#ffffff" stroke-width="12"/>
  <circle cx="300" cy="285" r="150" fill="url(#orb)" opacity="0.92"/>
  <circle cx="300" cy="285" r="112" fill="#ffffff" opacity="0.20"/>
  <text x="300" y="326" text-anchor="middle" font-family="system-ui,-apple-system,Segoe UI,sans-serif" font-size="92" font-weight="900" fill="#ffffff">${icon}</text>
  <text x="300" y="80" text-anchor="middle" font-family="system-ui,-apple-system,Segoe UI,sans-serif" font-size="24" font-weight="800" fill="#4c1d95">OFFICIAL SUPPORT</text>
  <text x="300" y="560" text-anchor="middle" font-family="system-ui,-apple-system,Segoe UI,sans-serif" font-size="36" font-weight="900" fill="#111827">${name}</text>
  <rect x="110" y="610" width="380" height="62" rx="31" fill="#ffffff" opacity="0.86"/>
  <text x="300" y="650" text-anchor="middle" font-family="system-ui,-apple-system,Segoe UI,sans-serif" font-size="22" font-weight="800" fill="#5b21b6">${category}</text>
  <text x="300" y="730" text-anchor="middle" font-family="system-ui,-apple-system,Segoe UI,sans-serif" font-size="18" font-weight="700" fill="#6b7280">エントリー前の公式仮カード</text>
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
