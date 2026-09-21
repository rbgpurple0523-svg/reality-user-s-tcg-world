import { NextResponse } from 'next/server';
import { Filter } from 'glin-profanity';
import { BLOCKED_PATTERNS, BLOCKED_TERMS } from '../../../components/moderation/blockedTerms';

export const runtime = 'nodejs';

const MAX_TEXT_ITEMS = 12;
const MAX_TOTAL_CHARS = 6000;

interface ModerateTextRequest {
  texts?: unknown;
}

const profanityFilter = new Filter({
  languages: ['japanese', 'english'],
  detectLeetspeak: true,
  leetspeakLevel: 'aggressive',
  normalizeUnicode: true,
  cacheResults: true,
  maxCacheSize: 1000,
});

function normalizeForRuleMatching(value: string): string {
  return value
    .normalize('NFKC')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .toLowerCase();
}

function findLocalRuleMatch(text: string): boolean {
  const normalized = normalizeForRuleMatching(text);

  for (const rule of BLOCKED_TERMS) {
    const term = normalizeForRuleMatching(rule.term.trim());
    if (term && normalized.includes(term)) {
      return true;
    }
  }

  for (const pattern of BLOCKED_PATTERNS) {
    pattern.lastIndex = 0;
    if (pattern.test(text) || pattern.test(normalized)) {
      pattern.lastIndex = 0;
      return true;
    }
    pattern.lastIndex = 0;
  }

  return false;
}

function findProfanityMatch(text: string): boolean {
  return profanityFilter.checkProfanity(text).containsProfanity;
}

function collectTexts(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;

  const texts = value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean);

  if (texts.length > MAX_TEXT_ITEMS) return null;

  const totalChars = texts.reduce((sum, item) => sum + item.length, 0);
  if (totalChars > MAX_TOTAL_CHARS) return null;

  return texts;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as ModerateTextRequest;
    const texts = collectTexts(body.texts);

    if (!texts) {
      return NextResponse.json(
        { allowed: false, code: 'INVALID_INPUT' },
        { status: 400 },
      );
    }

    if (texts.length === 0) {
      return NextResponse.json({ allowed: true, code: 'OK' });
    }

    if (texts.some(findLocalRuleMatch)) {
      return NextResponse.json({
        allowed: false,
        code: 'CUSTOM_RULE',
      });
    }

    if (texts.some(findProfanityMatch)) {
      return NextResponse.json({
        allowed: false,
        code: 'PROFANITY_FILTERED',
      });
    }

    return NextResponse.json({
      allowed: true,
      code: 'OK',
    });
  } catch (error) {
    console.error('[moderate-text] Local moderation failed.', error);

    return NextResponse.json(
      { allowed: false, code: 'MODERATION_SERVICE_ERROR' },
      { status: 500 },
    );
  }
}
