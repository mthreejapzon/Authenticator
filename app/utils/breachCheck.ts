/**
 * breachCheck.ts
 * ──────────────
 * Checks a plaintext password against the Have I Been Pwned (HIBP)
 * Pwned Passwords API using the k-Anonymity model.
 *
 * How it works:
 *  1. Hash the password with SHA-1 locally.
 *  2. Send only the first 5 characters of the hex hash to the API.
 *  3. HIBP returns ~500 hash suffixes that match that prefix.
 *  4. Check locally whether our full suffix appears in the list.
 *  5. The server never sees the full hash or the original password.
 *
 * API docs: https://haveibeenpwned.com/API/v3#PwnedPasswords
 */

// ─────────────────────────────────────────────────────────────────────────────
// SHA-1 implementation (pure JS — no native module needed)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Compute the SHA-1 digest of a UTF-8 string.
 * Returns an uppercase hex string (40 chars).
 *
 * This is a self-contained implementation so we don't need an extra
 * dependency. SHA-1 is fine here because we're using it as a lookup
 * key for HIBP — not as a security primitive.
 */
function sha1Hex(message: string): string {
  // Convert string to byte array (UTF-8)
  const bytes: number[] = [];
  for (let i = 0; i < message.length; i++) {
    const code = message.charCodeAt(i);
    if (code < 0x80) {
      bytes.push(code);
    } else if (code < 0x800) {
      bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
    } else {
      bytes.push(
        0xe0 | (code >> 12),
        0x80 | ((code >> 6) & 0x3f),
        0x80 | (code & 0x3f),
      );
    }
  }

  // SHA-1 constants
  const H = [0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476, 0xc3d2e1f0];

  // Pre-processing: adding padding bits
  const msgLen = bytes.length;
  bytes.push(0x80);
  while (bytes.length % 64 !== 56) bytes.push(0);

  // Append original length in bits as 64-bit big-endian
  const bitLen = msgLen * 8;
  for (let i = 7; i >= 0; i--) {
    bytes.push((bitLen / Math.pow(2, i * 8)) & 0xff);
  }

  // Process each 512-bit (64-byte) chunk
  for (let chunk = 0; chunk < bytes.length; chunk += 64) {
    const w: number[] = [];
    for (let i = 0; i < 16; i++) {
      w[i] =
        (bytes[chunk + i * 4] << 24) |
        (bytes[chunk + i * 4 + 1] << 16) |
        (bytes[chunk + i * 4 + 2] << 8) |
        bytes[chunk + i * 4 + 3];
    }
    for (let i = 16; i < 80; i++) {
      const n = w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16];
      w[i] = ((n << 1) | (n >>> 31)) >>> 0;
    }

    let [a, b, c, d, e] = H;

    for (let i = 0; i < 80; i++) {
      let f: number, k: number;
      if (i < 20)      { f = (b & c) | (~b & d);       k = 0x5a827999; }
      else if (i < 40) { f = b ^ c ^ d;                 k = 0x6ed9eba1; }
      else if (i < 60) { f = (b & c) | (b & d) | (c & d); k = 0x8f1bbcdc; }
      else             { f = b ^ c ^ d;                 k = 0xca62c1d6; }

      const temp = (((a << 5) | (a >>> 27)) + f + e + k + w[i]) >>> 0;
      e = d; d = c; c = ((b << 30) | (b >>> 2)) >>> 0; b = a; a = temp;
    }

    H[0] = (H[0] + a) >>> 0;
    H[1] = (H[1] + b) >>> 0;
    H[2] = (H[2] + c) >>> 0;
    H[3] = (H[3] + d) >>> 0;
    H[4] = (H[4] + e) >>> 0;
  }

  return H.map((h) => h.toString(16).padStart(8, "0")).join("").toUpperCase();
}

// ─────────────────────────────────────────────────────────────────────────────
// HIBP API
// ─────────────────────────────────────────────────────────────────────────────

const HIBP_API = "https://api.pwnedpasswords.com/range/";

/** How long to wait for the HIBP API before giving up (ms). */
const BREACH_CHECK_TIMEOUT_MS = 8_000;

export interface BreachResult {
  /** Whether this password appeared in any known breach. */
  breached: boolean;
  /**
   * How many times this exact password appeared across all known breach
   * datasets. 0 if not breached or if the check was skipped/failed.
   */
  count: number;
  /** True if the network request failed or timed out — result is inconclusive. */
  error?: boolean;
}

/**
 * Check a single plaintext password against the HIBP Pwned Passwords API.
 *
 * Uses k-Anonymity: only the first 5 characters of the SHA-1 hash are
 * sent to the server. The comparison is done locally on-device.
 *
 * @param plainPassword  Decrypted plaintext password to check.
 * @returns BreachResult — breached flag, count, and optional error flag.
 */
export async function checkPasswordBreach(
  plainPassword: string,
): Promise<BreachResult> {
  if (!plainPassword || plainPassword.trim().length === 0) {
    return { breached: false, count: 0 };
  }

  try {
    const hash   = sha1Hex(plainPassword);       // e.g. "CBFDAC6008F9..."
    const prefix = hash.slice(0, 5);             // "CBFDA"
    const suffix = hash.slice(5);                // "C6008F9CAB40..."

    // Fetch with timeout via AbortController
    const controller = new AbortController();
    const timeoutId  = setTimeout(() => controller.abort(), BREACH_CHECK_TIMEOUT_MS);

    let responseText: string;
    try {
      const res = await fetch(`${HIBP_API}${prefix}`, {
        headers: {
          // Recommended by HIBP to identify the client
          "Add-Padding": "true",
        },
        signal: controller.signal,
      });
      responseText = await res.text();
    } finally {
      clearTimeout(timeoutId);
    }

    // Each line is "SUFFIX:COUNT\r\n"
    const lines = responseText.split("\n");
    for (const line of lines) {
      const [lineSuffix, countStr] = line.trim().split(":");
      if (lineSuffix && lineSuffix.toUpperCase() === suffix) {
        const count = parseInt(countStr ?? "0", 10);
        return { breached: true, count: isNaN(count) ? 1 : count };
      }
    }

    // No match — password not found in any known breach
    return { breached: false, count: 0 };
  } catch (err) {
    // Network error or timeout — don't crash the whole scan
    console.warn("⚠️ Breach check failed for an account:", err);
    return { breached: false, count: 0, error: true };
  }
}

/**
 * Run breach checks for multiple passwords in parallel (with concurrency cap).
 *
 * @param passwords  Array of { key, password } pairs.
 * @param concurrency  Max simultaneous HIBP requests (default 5).
 * @returns Map of account key → BreachResult.
 */
export async function checkPasswordBreachesBatch(
  passwords: { key: string; password: string }[],
  concurrency = 5,
): Promise<Map<string, BreachResult>> {
  const results = new Map<string, BreachResult>();

  // Process in chunks to avoid overwhelming the API
  for (let i = 0; i < passwords.length; i += concurrency) {
    const chunk = passwords.slice(i, i + concurrency);
    const chunkResults = await Promise.all(
      chunk.map(async ({ key, password }) => ({
        key,
        result: await checkPasswordBreach(password),
      })),
    );
    for (const { key, result } of chunkResults) {
      results.set(key, result);
    }
  }

  return results;
}
