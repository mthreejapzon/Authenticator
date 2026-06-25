/**
 * Centralized storage key constants.
 * Import these instead of using raw string literals anywhere in the codebase.
 */

// ── GitHub / Backup ──────────────────────────────────────────────────────────
export const GITHUB_PAT_KEY = "github_token";
export const BACKUP_GIST_ID_KEY = "backup_gist_id";
export const LAST_BACKUP_KEY = "last_backup_at";
export const BACKUP_HISTORY_KEY = "backup_history";
export const AUTO_SYNC_ENABLED_KEY = "auto_sync_enabled";
export const AUTO_RESTORE_ENABLED_KEY = "auto_restore_enabled";

// ── Accounts ─────────────────────────────────────────────────────────────────
export const USER_ACCOUNT_KEYS = "userAccountKeys";

// ── Encryption ───────────────────────────────────────────────────────────────
export const MASTER_KEY_STORAGE_KEY = "encryptionMasterKey";
export const ENTROPY_KEY = "entropy_key";

// ── PIN / Security ───────────────────────────────────────────────────────────
export const PIN_HASH_KEY = "security_pin_hash";
export const PIN_SALT_KEY = "security_pin_salt";
export const APP_LOCKED_KEY = "app_locked";
export const FAILED_ATTEMPTS_KEY = "failed_pin_attempts";
export const LOCKOUT_UNTIL_KEY = "lockout_until";

/** Number of digits in the app PIN. */
export const PIN_LENGTH = 6;

// ── App Settings ─────────────────────────────────────────────────────────────
export const THEME_KEY = "app_theme_mode";
export const BIOMETRICS_ENABLED_KEY = "use_biometrics";

/**
 * Storage key for the clipboard auto-clear delay setting.
 * Value is stored as a string number (milliseconds), or "0" to disable.
 */
export const CLIPBOARD_CLEAR_DELAY_KEY = "clipboard_clear_delay_ms";

/** Default clipboard auto-clear delay: 30 seconds. */
export const CLIPBOARD_CLEAR_DELAY_DEFAULT_MS = 30_000;

// ── Timing ───────────────────────────────────────────────────────────────────
/** Delay (ms) between a successful PIN verification and the onVerified callback. */
export const VERIFICATION_SUCCESS_DELAY_MS = 300;
