/**
 * passwordHealth.ts
 * ─────────────────
 * Pure analysis utilities for the Password Health Dashboard.
 * No React, no UI — just data-in → report-out.
 *
 * Checks performed:
 *  1. Weak passwords   — scored with the same rubric as PasswordStrengthIndicator
 *  2. Reused passwords — exact-match comparison across decrypted passwords
 *  3. Old passwords    — modified/created more than OLD_PASSWORD_DAYS_THRESHOLD days ago
 *  4. Breached         — found in Have I Been Pwned database (k-anonymity)
 */

// ─────────────────────────────────────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────────────────────────────────────

/** Passwords older than this many days (no update) are considered stale. */
export const OLD_PASSWORD_DAYS_THRESHOLD = 90;

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type StrengthLevel = "Too Short" | "Weak" | "Fair" | "Strong" | "Very Strong";

export interface HealthIssue {
  /** Account storage key */
  key: string;
  accountName: string;
  username: string;
  /** Which checks this account failed */
  issues: IssueType[];
  /** Strength level of the decrypted password */
  strengthLevel?: StrengthLevel;
  /** Days since the password was last changed (undefined if no timestamp) */
  daysSinceChange?: number;
  /** Number of times this password appeared in known breach datasets */
  breachCount?: number;
}

export type IssueType = "weak" | "reused" | "old" | "breached";

export interface HealthReport {
  totalAccounts: number;
  weakCount: number;
  reusedCount: number;
  oldCount: number;
  breachedCount: number;
  /** Overall health score 0-100 */
  score: number;
  issues: HealthIssue[];
  /** True if the scan ran without a PAT (passwords couldn't be decrypted) */
  partialScan: boolean;
  /** True if the breach check was skipped (no internet / partial scan) */
  breachCheckSkipped: boolean;
}

export interface AccountSnapshot {
  key: string;
  accountName: string;
  username: string;
  /** Already-decrypted plaintext password (or empty string if unavailable) */
  password: string;
  /** ISO string, undefined if never set */
  modifiedAt?: string;
  createdAt?: string;
  /** Whether the account data was actually encrypted */
  encrypted: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Strength scoring (mirrors PasswordStrengthIndicator logic)
// ─────────────────────────────────────────────────────────────────────────────

export function scorePassword(password: string): { level: StrengthLevel; score: number } {
  if (!password || password.length < 6) return { level: "Too Short", score: 1 };

  let score = 0;
  if (password.length >= 8)  score++;
  if (password.length >= 12) score++;
  if (/[A-Z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;

  if (score <= 1) return { level: "Weak",       score: 2 };
  if (score === 2) return { level: "Fair",       score: 3 };
  if (score === 3) return { level: "Strong",     score: 4 };
  return              { level: "Very Strong", score: 5 };
}

export function isWeakPassword(password: string): boolean {
  if (!password) return false;
  const { level } = scorePassword(password);
  return level === "Too Short" || level === "Weak";
}

// ─────────────────────────────────────────────────────────────────────────────
// Age check
// ─────────────────────────────────────────────────────────────────────────────

export function daysSinceDate(isoString: string | undefined): number | undefined {
  if (!isoString) return undefined;
  const ts = Date.parse(isoString);
  if (isNaN(ts)) return undefined;
  return Math.floor((Date.now() - ts) / 86_400_000);
}

// ─────────────────────────────────────────────────────────────────────────────
// Main analysis
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Analyse a list of account snapshots and return a full health report.
 *
 * @param accounts       Pre-fetched + pre-decrypted account data
 * @param partialScan    True when PAT was unavailable and passwords are empty
 * @param breachResults  Optional map of account key → breach result from HIBP
 */
export function analyseHealth(
  accounts: AccountSnapshot[],
  partialScan: boolean,
  breachResults?: Map<string, { breached: boolean; count: number }>,
): HealthReport {
  const breachCheckSkipped = !breachResults;

  // ── 1. Build a map of password → keys that share it (for reuse detection) ──
  const passwordMap = new Map<string, string[]>(); // password → [key, ...]
  for (const acc of accounts) {
    if (!acc.password) continue;
    const existing = passwordMap.get(acc.password) ?? [];
    existing.push(acc.key);
    passwordMap.set(acc.password, existing);
  }

  // Passwords that appear more than once
  const reusedPasswords = new Set<string>(
    [...passwordMap.entries()]
      .filter(([, keys]) => keys.length > 1)
      .map(([pw]) => pw),
  );

  // ── 2. Build issue list per account ──────────────────────────────────────
  const issueMap = new Map<string, HealthIssue>();

  const getOrCreate = (acc: AccountSnapshot): HealthIssue => {
    if (!issueMap.has(acc.key)) {
      issueMap.set(acc.key, {
        key: acc.key,
        accountName: acc.accountName,
        username: acc.username,
        issues: [],
      });
    }
    return issueMap.get(acc.key)!;
  };

  for (const acc of accounts) {
    const entry = getOrCreate(acc);

    // Weak
    if (acc.password && isWeakPassword(acc.password)) {
      entry.issues.push("weak");
      entry.strengthLevel = scorePassword(acc.password).level;
    }

    // Reused
    if (acc.password && reusedPasswords.has(acc.password)) {
      entry.issues.push("reused");
    }

    // Old — prefer modifiedAt, fall back to createdAt
    const days = daysSinceDate(acc.modifiedAt) ?? daysSinceDate(acc.createdAt);
    if (days !== undefined && days >= OLD_PASSWORD_DAYS_THRESHOLD) {
      entry.issues.push("old");
      entry.daysSinceChange = days;
    }

    // Breached — from HIBP results map
    if (breachResults) {
      const breach = breachResults.get(acc.key);
      if (breach?.breached) {
        entry.issues.push("breached");
        entry.breachCount = breach.count;
      }
    }
  }

  const issues = [...issueMap.values()].filter((e) => e.issues.length > 0);

  // ── 3. Counts ─────────────────────────────────────────────────────────────
  const weakCount     = issues.filter((e) => e.issues.includes("weak")).length;
  const reusedCount   = issues.filter((e) => e.issues.includes("reused")).length;
  const oldCount      = issues.filter((e) => e.issues.includes("old")).length;
  const breachedCount = issues.filter((e) => e.issues.includes("breached")).length;
  const total         = accounts.length;

  // ── 4. Score (0-100) ──────────────────────────────────────────────────────
  // Breached accounts are the most severe — deduct up to 30 extra points.
  // Partial scans cap at 50 since we can't fully assess.
  let score = 100;
  if (total > 0) {
    score -= Math.round((weakCount     / total) * 30);
    score -= Math.round((reusedCount   / total) * 25);
    score -= Math.round((oldCount      / total) * 15);
    score -= Math.round((breachedCount / total) * 30);
  }
  if (partialScan) score = Math.min(score, 50);
  score = Math.max(0, Math.min(100, score));

  return {
    totalAccounts: total,
    weakCount,
    reusedCount,
    oldCount,
    breachedCount,
    score,
    issues,
    partialScan,
    breachCheckSkipped,
  };
}
