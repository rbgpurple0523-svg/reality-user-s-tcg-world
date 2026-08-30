import { EMOTION_PRESETS } from './emotionPresets';

export const VIRTUAL_SUPPORT_PREFIX = 'emotion_sample_';

export interface VirtualSupportCard {
  id: string;
  name: string;
  description: string;
  cost: number;
  category: string;
  imageDataUrl: string;
  presetId: string;
  isVirtual: true;
}

/** エントリー前の公式エモーションを、デッキに入れられる仮サポートカードへ変換します。 */
export const createVirtualSupportCards = (
  enteredPresetIds: Set<string> = new Set()
): VirtualSupportCard[] =>
  EMOTION_PRESETS
    .filter(emotion => !enteredPresetIds.has(emotion.id))
    .map(emotion => ({
      id: `${VIRTUAL_SUPPORT_PREFIX}${emotion.id}`,
      name: emotion.name,
      description: emotion.description,
      cost: 1,
      category: emotion.effectCategory,
      imageDataUrl: `/support_sample/${encodeURIComponent(emotion.name)}.jpg`,
      presetId: emotion.id,
      isVirtual: true as const,
    }));
