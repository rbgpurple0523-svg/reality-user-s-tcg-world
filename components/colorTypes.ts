export type ColorType = 'cyan' | 'magenta' | 'yellow' | 'neutral';

export const COLOR_TYPE_LABELS: Record<ColorType, string> = {
  cyan: 'シアン系',
  magenta: 'マゼンタ系',
  yellow: 'イエロー系',
  neutral: '無彩色',
};

export const COLOR_PALETTE = [
  '#FF4D6D', '#FF6B35', '#FFD166', '#8BD450', '#35D0BA', '#36C5F0',
  '#3B82F6', '#5B5FEF', '#8B5CF6', '#D946EF', '#F04FA3', '#111827',
] as const;

const NEUTRAL_SATURATION_THRESHOLD = 0.15;
const COLOR_TYPE_HUES: Record<Exclude<ColorType, 'neutral'>, number> = {
  yellow: 60,
  cyan: 180,
  magenta: 300,
};

export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const normalized = hex.replace('#', '').trim();
  const expanded = normalized.length === 3
    ? normalized.split('').map((char) => `${char}${char}`).join('')
    : normalized;

  if (!/^[0-9a-fA-F]{6}$/.test(expanded)) {
    return { r: 34, g: 211, b: 238 };
  }

  return {
    r: parseInt(expanded.slice(0, 2), 16),
    g: parseInt(expanded.slice(2, 4), 16),
    b: parseInt(expanded.slice(4, 6), 16),
  };
}

function rgbToHsl(r: number, g: number, b: number): {
  hue: number;
  saturation: number;
  lightness: number;
} {
  const red = r / 255;
  const green = g / 255;
  const blue = b / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const delta = max - min;
  const lightness = (max + min) / 2;

  if (delta === 0) {
    return {
      hue: 0,
      saturation: 0,
      lightness,
    };
  }

  const saturation = delta / (1 - Math.abs(2 * lightness - 1));

  let hue: number;

  if (max === red) {
    hue = 60 * (((green - blue) / delta) % 6);
  } else if (max === green) {
    hue = 60 * ((blue - red) / delta + 2);
  } else {
    hue = 60 * ((red - green) / delta + 4);
  }

  if (hue < 0) hue += 360;

  return {
    hue,
    saturation,
    lightness,
  };
}

function circularHueDistance(a: number, b: number): number {
  const distance = Math.abs(a - b) % 360;
  return Math.min(distance, 360 - distance);
}

export function getColorTypeFromHex(hex: string): ColorType {
  const { r, g, b } = hexToRgb(hex);
  const { hue, saturation } = rgbToHsl(r, g, b);

  if (saturation <= NEUTRAL_SATURATION_THRESHOLD) {
    return 'neutral';
  }

  const candidates: Array<{
    type: Exclude<ColorType, 'neutral'>;
    distance: number;
  }> = [
    {
      type: 'yellow',
      distance: circularHueDistance(hue, COLOR_TYPE_HUES.yellow),
    },
    {
      type: 'cyan',
      distance: circularHueDistance(hue, COLOR_TYPE_HUES.cyan),
    },
    {
      type: 'magenta',
      distance: circularHueDistance(hue, COLOR_TYPE_HUES.magenta),
    },
  ];

  candidates.sort((a, b) => a.distance - b.distance);
  return candidates[0].type;
}

export function getColorTypeLabel(type: ColorType): string {
  return COLOR_TYPE_LABELS[type];
}

export function getLegacyColorHex(color?: string): string {
  switch (color) {
    case '赤':
      return '#FF4D6D';
    case '青':
      return '#3B82F6';
    case '黄':
      return '#FFD166';
    default:
      return '#22D3EE';
  }
}
