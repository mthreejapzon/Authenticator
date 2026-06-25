import CryptoJS from "crypto-js";
import { getRandomBytes } from "./cryptoPolyfill";
import { Storage } from "./storage";
import {
  AUTO_LOCK_TIMEOUT_DEFAULT_MS,
  AUTO_LOCK_TIMEOUT_KEY,
  LAST_ACTIVE_AT_KEY,
} from "./constants";

/**
 * Storage keys for PIN security
 */
const PIN_HASH_KEY = "security_pin_hash";
const PIN_SALT_KEY = "security_pin_salt";
const APP_LOCKED_KEY = "app_locked";
const FAILED_ATTEMPTS_KEY = "failed_pin_attempts";
const LOCKOUT_UNTIL_KEY = "lockout_until";

/**
 * PIN configuration
 */
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Generate a random salt for PIN hashing
 */
function generateSalt(): string {
  const randomBytes = getRandomBytes(32);
  return CryptoJS.enc.Base64.stringify(
    CryptoJS.lib.WordArray.create(Array.from(randomBytes))
  );
}

/**
 * Hash a PIN with salt using PBKDF2
 */
function hashPin(pin: string, salt: string): string {
  return CryptoJS.PBKDF2(pin, salt, {
    keySize: 256 / 32,
    iterations: 10000,
  }).toString();
}

/**
 * Set up a new PIN for the app
 * @param pin - 4-6 digit PIN
 * @returns true if successful
 */
export async function setupPin(pin: string): Promise<boolean> {
  // Validate PIN format
  if (!pin || !/^\d{4,6}$/.test(pin)) {
    throw new Error("PIN must be 4-6 digits");
  }

  try {
    const salt = generateSalt();
    const hashedPin = hashPin(pin, salt);

    await Storage.setItemAsync(PIN_HASH_KEY, hashedPin);
    await Storage.setItemAsync(PIN_SALT_KEY, salt);
    await Storage.setItemAsync(APP_LOCKED_KEY, "true");
    
    // Clear any failed attempts
    await Storage.deleteItemAsync(FAILED_ATTEMPTS_KEY);
    await Storage.deleteItemAsync(LOCKOUT_UNTIL_KEY);

    console.log("✅ PIN setup successfully");
    return true;
  } catch (error) {
    console.error("❌ PIN setup failed:", error);
    throw new Error("Failed to set up PIN");
  }
}

/**
 * Check if a PIN is set
 */
export async function hasPin(): Promise<boolean> {
  const hash = await Storage.getItemAsync(PIN_HASH_KEY);
  return hash !== null;
}

/**
 * Check if app is currently locked
 */
export async function isAppLocked(): Promise<boolean> {
  const locked = await Storage.getItemAsync(APP_LOCKED_KEY);
  return locked === "true";
}

/**
 * Check if user is in lockout period due to failed attempts
 */
export async function isInLockout(): Promise<{ locked: boolean; remainingMs?: number }> {
  const lockoutUntil = await Storage.getItemAsync(LOCKOUT_UNTIL_KEY);
  
  if (!lockoutUntil) {
    return { locked: false };
  }

  const lockoutTime = parseInt(lockoutUntil, 10);
  const now = Date.now();

  if (now < lockoutTime) {
    return { 
      locked: true, 
      remainingMs: lockoutTime - now 
    };
  }

  // Lockout expired, clear it
  await Storage.deleteItemAsync(LOCKOUT_UNTIL_KEY);
  await Storage.deleteItemAsync(FAILED_ATTEMPTS_KEY);
  
  return { locked: false };
}

/**
 * Verify a PIN and unlock the app if correct
 * @param pin - User-entered PIN
 * @returns true if PIN is correct and app is unlocked
 */
export async function verifyPin(pin: string): Promise<{
  success: boolean;
  error?: string;
  attemptsRemaining?: number;
  lockoutRemainingMs?: number;
}> {
  // Check lockout first
  const lockout = await isInLockout();
  if (lockout.locked) {
    const minutes = Math.ceil((lockout.remainingMs || 0) / 60000);
    return {
      success: false,
      error: `Too many failed attempts. Try again in ${minutes} minute${minutes > 1 ? 's' : ''}.`,
      lockoutRemainingMs: lockout.remainingMs,
    };
  }

  const storedHash = await Storage.getItemAsync(PIN_HASH_KEY);
  const salt = await Storage.getItemAsync(PIN_SALT_KEY);

  if (!storedHash || !salt) {
    throw new Error("No PIN configured");
  }

  const inputHash = hashPin(pin, salt);

  if (inputHash === storedHash) {
    // Correct PIN - unlock app and clear failed attempts
    await Storage.setItemAsync(APP_LOCKED_KEY, "false");
    await Storage.deleteItemAsync(FAILED_ATTEMPTS_KEY);
    await Storage.deleteItemAsync(LOCKOUT_UNTIL_KEY);
    
    console.log("✅ PIN verified, app unlocked");
    return { success: true };
  } else {
    // Wrong PIN - increment failed attempts
    const failedStr = await Storage.getItemAsync(FAILED_ATTEMPTS_KEY);
    const failedAttempts = failedStr ? parseInt(failedStr, 10) : 0;
    const newFailedAttempts = failedAttempts + 1;

    await Storage.setItemAsync(FAILED_ATTEMPTS_KEY, newFailedAttempts.toString());

    if (newFailedAttempts >= MAX_FAILED_ATTEMPTS) {
      // Trigger lockout
      const lockoutUntil = Date.now() + LOCKOUT_DURATION_MS;
      await Storage.setItemAsync(LOCKOUT_UNTIL_KEY, lockoutUntil.toString());
      
      console.log("🔒 User locked out due to failed attempts");
      return {
        success: false,
        error: "Too many failed attempts. Locked out for 5 minutes.",
      };
    }

    const remaining = MAX_FAILED_ATTEMPTS - newFailedAttempts;
    console.log(`❌ Wrong PIN. ${remaining} attempts remaining`);
    
    return {
      success: false,
      error: "Incorrect PIN",
      attemptsRemaining: remaining,
    };
  }
}

/**
 * Lock the app (require PIN to access)
 */
export async function lockApp(): Promise<void> {
  await Storage.setItemAsync(APP_LOCKED_KEY, "true");
  console.log("🔒 App locked");
}

/**
 * Change the PIN
 * @param currentPin - Current PIN for verification
 * @param newPin - New PIN to set
 */
export async function changePin(currentPin: string, newPin: string): Promise<boolean> {
  // Verify current PIN first
  const verification = await verifyPin(currentPin);
  
  if (!verification.success) {
    throw new Error("Current PIN is incorrect");
  }

  // Set new PIN
  return await setupPin(newPin);
}

/**
 * Remove PIN protection (requires current PIN)
 * WARNING: This removes an important security layer
 */
export async function removePin(currentPin: string): Promise<boolean> {
  // Verify current PIN first
  const verification = await verifyPin(currentPin);
  
  if (!verification.success) {
    throw new Error("Current PIN is incorrect");
  }

  await Storage.deleteItemAsync(PIN_HASH_KEY);
  await Storage.deleteItemAsync(PIN_SALT_KEY);
  await Storage.deleteItemAsync(APP_LOCKED_KEY);
  await Storage.deleteItemAsync(FAILED_ATTEMPTS_KEY);
  await Storage.deleteItemAsync(LOCKOUT_UNTIL_KEY);

  console.log("🗑️ PIN removed");
  return true;
}

/**
 * Get remaining failed attempts before lockout
 */
export async function getFailedAttempts(): Promise<number> {
  const failedStr = await Storage.getItemAsync(FAILED_ATTEMPTS_KEY);
  return failedStr ? parseInt(failedStr, 10) : 0;
}

// ── Auto-lock timeout ─────────────────────────────────────────────────────────

/**
 * Read the user's configured auto-lock timeout (ms).
 * Returns AUTO_LOCK_TIMEOUT_DEFAULT_MS when no setting has been saved yet.
 * A value of Number.MAX_SAFE_INTEGER means "Never".
 */
export async function getAutoLockTimeout(): Promise<number> {
  try {
    const raw = await Storage.getItemAsync(AUTO_LOCK_TIMEOUT_KEY);
    if (raw === null) return AUTO_LOCK_TIMEOUT_DEFAULT_MS;
    const parsed = parseInt(raw, 10);
    return isNaN(parsed) ? AUTO_LOCK_TIMEOUT_DEFAULT_MS : parsed;
  } catch {
    return AUTO_LOCK_TIMEOUT_DEFAULT_MS;
  }
}

/**
 * Persist the user's chosen auto-lock timeout.
 * Pass Number.MAX_SAFE_INTEGER to disable ("Never").
 */
export async function setAutoLockTimeout(ms: number): Promise<void> {
  await Storage.setItemAsync(AUTO_LOCK_TIMEOUT_KEY, String(ms));
  console.log(`⏱️ Auto-lock timeout set to ${ms} ms`);
}

/**
 * Record the current timestamp as the last moment the app was active.
 * Call this whenever the app enters the foreground or on unlock.
 */
export async function recordLastActiveAt(): Promise<void> {
  await Storage.setItemAsync(LAST_ACTIVE_AT_KEY, String(Date.now()));
}

/**
 * Determine whether the app should lock when returning to the foreground.
 * Returns true only if:
 *  - A PIN is configured, AND
 *  - The time elapsed since the last active timestamp exceeds the timeout.
 */
export async function shouldLockOnForeground(): Promise<boolean> {
  try {
    const timeoutMs = await getAutoLockTimeout();

    // "Never" — skip the check entirely
    if (timeoutMs >= Number.MAX_SAFE_INTEGER) return false;

    const raw = await Storage.getItemAsync(LAST_ACTIVE_AT_KEY);
    // No timestamp recorded yet — treat as if just unlocked
    if (raw === null) return false;

    const lastActiveAt = parseInt(raw, 10);
    if (isNaN(lastActiveAt)) return false;

    const elapsed = Date.now() - lastActiveAt;
    return elapsed >= timeoutMs;
  } catch {
    return false;
  }
}
