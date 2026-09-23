import {
  EMOTION_PRESETS,
  getEmotionFlavorText,
  type EmotionPreset,
} from './emotionPresets';

export const VIRTUAL_SUPPORT_PREFIX = 'emotion_sample_';
export const DEFAULT_VIRTUAL_SUPPORT_COLOR_HEX = '#22D3EE';

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
    imageDataUrl: `/support_sample/${encodeURIComponent(emotion.name)}.jpg`,
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
