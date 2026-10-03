import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getAuth, type DecodedIdToken } from 'firebase-admin/auth';
import { createHash, randomBytes } from 'node:crypto';
import { adminDb } from '@/lib/firebaseAdmin';
import { COORDINATE_PRESETS } from '@/components/coordinatePresets';
import { EMOTION_PRESETS } from '@/components/emotionPresets';
import { getColorTypeFromHex } from '@/components/colorTypes';

const TOTAL_PRESET_COUNT =
  COORDINATE_PRESETS.length + EMOTION_PRESETS.length;

const MAX_IMAGE_DATA_URL_LENGTH = 600_000;

export type CardType = 'coordinate' | 'emotion';

export type CardWritePayload = {
  cardType: CardType;
  presetId: string;
  profileUrl: string;
  userName: string;
  imageDataUrl: string;
  customSkills?: [string, string, string, string];
  skillVoices?: [string, string, string, string];
  flavorText?: string;
  customEffectName?: string;
  colorHex: string;
  showProfileUrl: boolean;
};

export type PublicCard = {
  id: string;
  cardType: CardType;
  presetId: string;
  profileUrl: string;
  userName: string;
  imageDataUrl: string;
  firstUser: string;
  customEffectName?: string;
  customSkills?: [string, string, string, string];
  skillVoices?: [string, string, string, string];
  flavorText?: string;
  colorHex: string;
  colorType: string;
  showProfileUrl: boolean;
  status: 'active' | 'deleted';
  createdAt: string;
  updatedAt: string;
};

export type CardOwner = {
  ownerUid: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
};

function getAdminAuth() {
  const apps = getApps();

  if (apps.length > 0) {
    return getAuth(apps[0]);
  }

  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const privateKey =
    process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n');

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error('FIREBASE_ADMIN_CONFIG_MISSING');
  }

  const app = initializeApp({
    credential: cert({
      projectId,
      clientEmail,
      privateKey,
    }),
  });

  return getAuth(app);
}

export async function verifyBearerToken(
  request: Request,
): Promise<DecodedIdToken> {
  const authorization = request.headers.get('authorization') || '';
  const match = authorization.match(/^Bearer\s+(.+)$/i);

  if (!match) {
    throw new Error('AUTH_REQUIRED');
  }

  return getAdminAuth().verifyIdToken(match[1]);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasControlCharacters(value: string): boolean {
  return /[\u0000-\u001F\u007F]/.test(value);
}

function readRequiredString(
  body: Record<string, unknown>,
  key: string,
  maxLength: number,
): string {
  const value = body[key];

  if (typeof value !== 'string') {
    throw new Error(`INVALID_${key.toUpperCase()}`);
  }

  const trimmed = value.trim();

  if (
    !trimmed ||
    trimmed.length > maxLength ||
    hasControlCharacters(trimmed)
  ) {
    throw new Error(`INVALID_${key.toUpperCase()}`);
  }

  return trimmed;
}

function readOptionalString(
  body: Record<string, unknown>,
  key: string,
  maxLength: number,
): string | undefined {
  const value = body[key];

  if (value === undefined || value === null || value === '') {
    return undefined;
  }

  if (typeof value !== 'string') {
    throw new Error(`INVALID_${key.toUpperCase()}`);
  }

  const trimmed = value.trim();

  if (trimmed.length > maxLength || hasControlCharacters(trimmed)) {
    throw new Error(`INVALID_${key.toUpperCase()}`);
  }

  return trimmed;
}

function readBoolean(
  body: Record<string, unknown>,
  key: string,
  fallback: boolean,
): boolean {
  const value = body[key];

  if (value === undefined) {
    return fallback;
  }

  if (typeof value !== 'boolean') {
    throw new Error(`INVALID_${key.toUpperCase()}`);
  }

  return value;
}

function readStringArray(
  body: Record<string, unknown>,
  key: string,
  expectedLength: number,
  maxItemLength: number,
): [string, string, string, string] | undefined {
  const value = body[key];

  if (value === undefined || value === null) {
    return undefined;
  }

  if (
    !Array.isArray(value) ||
    value.length !== expectedLength ||
    !value.every((item) => typeof item === 'string')
  ) {
    throw new Error(`INVALID_${key.toUpperCase()}`);
  }

  const normalized = value.map((item) => {
    const trimmed = item.trim();

    if (
      !trimmed ||
      trimmed.length > maxItemLength ||
      hasControlCharacters(trimmed)
    ) {
      throw new Error(`INVALID_${key.toUpperCase()}`);
    }

    return trimmed;
  });

  return [
    normalized[0],
    normalized[1],
    normalized[2],
    normalized[3],
  ];
}

function normalizeProfileUrl(value: string): string {
  return value
    .trim()
    .replace(/#REALITY$/i, '')
    .replace(/\/$/, '');
}

export function validateProfileUrl(value: string): string {
  const normalized = normalizeProfileUrl(value);

  if (
    !normalized.startsWith('https://reality.app/profile/') ||
    normalized.length > 240 ||
    /\s/.test(normalized)
  ) {
    throw new Error('INVALID_PROFILE_URL');
  }

  return normalized;
}

function validateImageDataUrl(value: string): string {
  if (value.length > MAX_IMAGE_DATA_URL_LENGTH) {
    throw new Error('IMAGE_TOO_LARGE');
  }

  if (
    !/^data:image\/(jpeg|jpg|png|webp);base64,[A-Za-z0-9+/=]+$/i.test(
      value,
    )
  ) {
    throw new Error('INVALID_IMAGE');
  }

  return value;
}

function validateColorHex(value: string | undefined): string {
  const normalized = value || '#22D3EE';

  if (!/^#[0-9a-fA-F]{6}$/.test(normalized)) {
    throw new Error('INVALID_COLOR_HEX');
  }

  return normalized.toUpperCase();
}

export function resolvePreset(cardType: CardType, presetId: string) {
  if (cardType === 'coordinate') {
    const preset = COORDINATE_PRESETS.find((item) => item.id === presetId);

    if (!preset) {
      throw new Error('INVALID_COORDINATE_PRESET');
    }

    return preset;
  }

  const preset = EMOTION_PRESETS.find((item) => item.id === presetId);

  if (!preset) {
    throw new Error('INVALID_EMOTION_PRESET');
  }

  return preset;
}

export function parseCardWritePayload(body: unknown) {
  if (!isRecord(body)) {
    throw new Error('INVALID_BODY');
  }

  const cardType = body.cardType;

  if (cardType !== 'coordinate' && cardType !== 'emotion') {
    throw new Error('INVALID_CARD_TYPE');
  }

  const presetId = readRequiredString(body, 'presetId', 120);
  resolvePreset(cardType, presetId);

  const profileUrl = readRequiredString(body, 'profileUrl', 240);
  const normalizedProfileUrl = validateProfileUrl(profileUrl);

  const userName = readRequiredString(body, 'userName', 80);

  const imageDataUrl = validateImageDataUrl(
    readRequiredString(
      body,
      'imageDataUrl',
      MAX_IMAGE_DATA_URL_LENGTH,
    ),
  );

  const customSkills = readStringArray(body, 'customSkills', 4, 80);
  const skillVoices = readStringArray(body, 'skillVoices', 4, 100);
  const flavorText = readOptionalString(body, 'flavorText', 240);
  const customEffectName = readOptionalString(
    body,
    'customEffectName',
    80,
  );

  const colorHex = validateColorHex(
    readOptionalString(body, 'colorHex', 7),
  );

  const showProfileUrl = readBoolean(
    body,
    'showProfileUrl',
    true,
  );

  if (cardType === 'coordinate' && !customSkills) {
    throw new Error('CUSTOM_SKILLS_REQUIRED');
  }

  if (cardType === 'coordinate' && customEffectName) {
    throw new Error('CUSTOM_EFFECT_NOT_ALLOWED');
  }

  if (cardType === 'emotion' && customSkills) {
    throw new Error('CUSTOM_SKILLS_NOT_ALLOWED');
  }

  if (cardType === 'emotion' && skillVoices) {
    throw new Error('SKILL_VOICES_NOT_ALLOWED');
  }

  if (cardType === 'emotion' && !customEffectName) {
    throw new Error('CUSTOM_EFFECT_REQUIRED');
  }

  return {
    cardType,
    presetId,
    profileUrl: normalizedProfileUrl,
    normalizedProfileUrl,
    userName,
    imageDataUrl,
    customSkills,
    skillVoices,
    flavorText,
    customEffectName,
    colorHex,
    showProfileUrl,
  } satisfies CardWritePayload & {
    normalizedProfileUrl: string;
  };
}

export function makeCardId(): string {
  return `card_${randomBytes(12).toString('hex')}`;
}

export function makeProfileHash(normalizedProfileUrl: string): string {
  return createHash('sha256')
    .update(normalizedProfileUrl, 'utf8')
    .digest('hex');
}

export function getPresetStatsReference(presetId: string) {
  return adminDb.collection('cardPresetStats').doc(presetId);
}

export function calculateMaxEntryLimit(activeCounts: number[]): number {
  const filledPresetCount = activeCounts.filter(
    (count) => count >= 1,
  ).length;

  const countAtLeastTwo = activeCounts.filter(
    (count) => count >= 2,
  ).length;

  const oneRate =
    filledPresetCount / Math.max(1, TOTAL_PRESET_COUNT);

  const twoRate =
    countAtLeastTwo / Math.max(1, TOTAL_PRESET_COUNT);

  return oneRate >= 0.9 && twoRate >= 0.5
    ? 3
    : oneRate >= 0.5
      ? 2
      : 1;
}

export function isOwner(
  owner: CardOwner,
  user: DecodedIdToken,
): boolean {
  return owner.ownerUid !== '' && owner.ownerUid === user.uid;
}

export function getOwnerData(
  data: Record<string, unknown>,
): CardOwner {
  return {
    ownerUid: String(data.ownerUid || ''),
    createdAt: String(data.createdAt || ''),
    updatedAt: String(data.updatedAt || ''),
    ...(typeof data.deletedAt === 'string'
      ? { deletedAt: data.deletedAt }
      : {}),
  };
}

export function buildPublicCardFields(
  payload: ReturnType<typeof parseCardWritePayload>,
) {
  const colorHex = validateColorHex(payload.colorHex);

  const fields: Omit<
    PublicCard,
    'id' | 'createdAt' | 'updatedAt' | 'firstUser' | 'status'
  > = {
    cardType: payload.cardType,
    presetId: payload.presetId,
    profileUrl: payload.normalizedProfileUrl,
    userName: payload.userName,
    imageDataUrl: payload.imageDataUrl,
    colorHex,
    colorType: getColorTypeFromHex(colorHex),
    showProfileUrl: payload.showProfileUrl,
  };

  if (payload.flavorText !== undefined) {
    fields.flavorText = payload.flavorText;
  }

  if (payload.cardType === 'coordinate' && payload.customSkills) {
    fields.customSkills = payload.customSkills;
  }

  if (payload.cardType === 'coordinate' && payload.skillVoices) {
    fields.skillVoices = payload.skillVoices;
  }

  if (
    payload.cardType === 'emotion' &&
    payload.customEffectName
  ) {
    fields.customEffectName = payload.customEffectName;
  }

  return fields;
}