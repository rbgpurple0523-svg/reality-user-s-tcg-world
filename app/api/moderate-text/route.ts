import { NextResponse } from 'next/server';
import { BLOCKED_PATTERNS, BLOCKED_TERMS } from '../../../components/moderation/blockedTerms';

export const runtime = 'nodejs';

const OPENAI_MODERATION_URL = 'https://api.openai.com/v1/moderations';
const DEFAULT_MODEL = 'omni-moderation-latest';
const MAX_TEXT_ITEMS = 12;
const MAX_TOTAL_CHARS = 6000;

interface ModerateTextRequest {
  texts?: unknown;
}

interface OpenAIModerationResponse {
  results?: Array<{
    flagged?: boolean;
  }>;
}

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
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { allowed: false, code: 'MODERATION_NOT_CONFIGURED' },
        { status: 503 },
      );
    }

    const body = (await request.json()) as ModerateTextRequest;
    const texts = collectTexts(body.texts);

    if (!texts) {
      return NextResponse.json(
        { allowed: false, code: 'INVALID_INPUT' },
        { status: 400 },
      );
    }

    if (texts.length === 0) {
      return NextResponse.json({ allowed: true });
    }

    if (texts.some(findLocalRuleMatch)) {
      return NextResponse.json({
        allowed: false,
        code: 'CUSTOM_RULE',
      });
    }

    const combinedText = texts
      .map((text, index) => `FIELD_${index + 1}\n${text}`)
      .join('\n\n');

    const openAIResponse = await fetch(OPENAI_MODERATION_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODERATION_MODEL || DEFAULT_MODEL,
        input: combinedText,
      }),
      cache: 'no-store',
    });

    if (!openAIResponse.ok) {
      return NextResponse.json(
        { allowed: false, code: 'MODERATION_SERVICE_ERROR' },
        { status: 502 },
      );
    }

    const moderation = (await openAIResponse.json()) as OpenAIModerationResponse;
    const flagged = moderation.results?.some((result) => result.flagged === true) ?? true;

    return NextResponse.json({
      allowed: !flagged,
      code: flagged ? 'MODERATION_FLAGGED' : 'OK',
    });
  } catch {
    return NextResponse.json(
      { allowed: false, code: 'MODERATION_SERVICE_ERROR' },
      { status: 500 },
    );
  }
}
