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

interface OpenAIErrorResponse {
  error?: {
    code?: string;
    type?: string;
    message?: string;
  };
}

type DiagnosticCode =
  | 'MODERATION_NOT_CONFIGURED'
  | 'INVALID_INPUT'
  | 'CUSTOM_RULE'
  | 'OPENAI_BAD_REQUEST'
  | 'OPENAI_UNAUTHORIZED'
  | 'OPENAI_FORBIDDEN'
  | 'OPENAI_RATE_LIMITED'
  | 'OPENAI_NOT_FOUND'
  | 'MODERATION_INVALID_RESPONSE'
  | 'MODERATION_NETWORK_ERROR'
  | 'MODERATION_SERVICE_ERROR'
  | 'MODERATION_FLAGGED'
  | 'OK';

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

function getOpenAIDiagnosticCode(status: number): DiagnosticCode {
  switch (status) {
    case 400:
      return 'OPENAI_BAD_REQUEST';
    case 401:
      return 'OPENAI_UNAUTHORIZED';
    case 403:
      return 'OPENAI_FORBIDDEN';
    case 404:
      return 'OPENAI_NOT_FOUND';
    case 429:
      return 'OPENAI_RATE_LIMITED';
    default:
      return 'MODERATION_SERVICE_ERROR';
  }
}

async function readOpenAIErrorDetails(response: Response): Promise<{
  code?: string;
  type?: string;
}> {
  try {
    const errorBody = (await response.json()) as OpenAIErrorResponse;
    return {
      code: errorBody.error?.code,
      type: errorBody.error?.type,
    };
  } catch {
    return {};
  }
}

export async function POST(request: Request) {
  try {
    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        { allowed: false, code: 'MODERATION_NOT_CONFIGURED' satisfies DiagnosticCode },
        { status: 503 },
      );
    }

    const body = (await request.json()) as ModerateTextRequest;
    const texts = collectTexts(body.texts);

    if (!texts) {
      return NextResponse.json(
        { allowed: false, code: 'INVALID_INPUT' satisfies DiagnosticCode },
        { status: 400 },
      );
    }

    if (texts.length === 0) {
      return NextResponse.json({
        allowed: true,
        code: 'OK' satisfies DiagnosticCode,
      });
    }

    if (texts.some(findLocalRuleMatch)) {
      return NextResponse.json({
        allowed: false,
        code: 'CUSTOM_RULE' satisfies DiagnosticCode,
      });
    }

    const combinedText = texts
      .map((text, index) => `FIELD_${index + 1}\n${text}`)
      .join('\n\n');

    let openAIResponse: Response;

    try {
      openAIResponse = await fetch(OPENAI_MODERATION_URL, {
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
    } catch {
      console.error('[moderate-text] OpenAI request failed before receiving a response.');

      return NextResponse.json(
        {
          allowed: false,
          code: 'MODERATION_NETWORK_ERROR' satisfies DiagnosticCode,
        },
        { status: 502 },
      );
    }

    if (!openAIResponse.ok) {
      const diagnosticCode = getOpenAIDiagnosticCode(openAIResponse.status);
      const details = await readOpenAIErrorDetails(openAIResponse);

      console.error('[moderate-text] OpenAI API request failed.', {
        status: openAIResponse.status,
        diagnosticCode,
        providerCode: details.code,
        providerType: details.type,
      });

      return NextResponse.json(
        {
          allowed: false,
          code: diagnosticCode,
        },
        { status: 502 },
      );
    }

    let moderation: OpenAIModerationResponse;

    try {
      moderation = (await openAIResponse.json()) as OpenAIModerationResponse;
    } catch {
      console.error('[moderate-text] Failed to parse OpenAI moderation response.');

      return NextResponse.json(
        {
          allowed: false,
          code: 'MODERATION_INVALID_RESPONSE' satisfies DiagnosticCode,
        },
        { status: 502 },
      );
    }

    if (!Array.isArray(moderation.results) || moderation.results.length === 0) {
      console.error('[moderate-text] OpenAI moderation response did not contain results.');

      return NextResponse.json(
        {
          allowed: false,
          code: 'MODERATION_INVALID_RESPONSE' satisfies DiagnosticCode,
        },
        { status: 502 },
      );
    }

    const flagged = moderation.results.some(
      (result) => result.flagged === true,
    );

    return NextResponse.json({
      allowed: !flagged,
      code: flagged ? 'MODERATION_FLAGGED' : 'OK',
    });
  } catch {
    console.error('[moderate-text] Unexpected server error.');

    return NextResponse.json(
      {
        allowed: false,
        code: 'MODERATION_SERVICE_ERROR' satisfies DiagnosticCode,
      },
      { status: 500 },
    );
  }
}