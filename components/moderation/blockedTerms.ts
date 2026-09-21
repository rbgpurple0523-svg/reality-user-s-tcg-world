export interface BlockedTermRule {
  term: string;
  label?: string;
}

export const BLOCKED_TERMS: readonly BlockedTermRule[] = [];

export const BLOCKED_PATTERNS: readonly RegExp[] = [];
