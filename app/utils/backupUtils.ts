import { decryptWithMasterKey, encryptWithMasterKey, getOrCreateMasterKey } from "./crypto";
import { createOrUpdateGistBackup } from "./githubBackup";
import { Storage } from "./storage";

const USER_ACCOUNT_KEYS = "userAccountKeys";
const GITHUB_TOKEN_KEY = "github_token";
const BACKUP_GIST_ID_KEY = "backup_gist_id";
const AUTO_SYNC_ENABLED_KEY = "auto_sync_enabled";

let syncTimeout: NodeJS.Timeout | null = null;

/**
 * Export all accounts and encrypt the payload with the device master key.
 * Returns a ciphertext string in the same v2 format used by Restore.
 */
export async function exportAllAccounts(): Promise<string> {
  const storedKeys = await Storage.getItemAsync(USER_ACCOUNT_KEYS);
  const keys: string[] = storedKeys ? JSON.parse(storedKeys) : [];

  const accounts: Record<string, any> = {};
  for (const key of keys) {
    const data = await Storage.getItemAsync(key);
    if (data) {
      try {
        accounts[key] = JSON.parse(data);
      } catch {
        accounts[key] = data;
      }
    }
  }

  const payload = JSON.stringify({ accounts });
  const masterKey = await getOrCreateMasterKey();
  return encryptWithMasterKey(payload, masterKey);
}

/**
 * Import accounts from an encrypted backup produced by exportAllAccounts.
 * Existing accounts are cleared before restore.
 */
export async function importAllAccounts(cipherText: string): Promise<void> {
  const plaintext = await decryptWithMasterKey(cipherText);

  const parsed = JSON.parse(plaintext);
  const accounts = parsed?.accounts ?? {};
  const newKeys = Object.keys(accounts);

  // Clear existing accounts
  const existingKeysRaw = await Storage.getItemAsync(USER_ACCOUNT_KEYS);
  const existingKeys: string[] = existingKeysRaw ? JSON.parse(existingKeysRaw) : [];
  for (const key of existingKeys) {
    await Storage.deleteItemAsync(key);
  }

  // Save new accounts
  for (const key of newKeys) {
    await Storage.setItemAsync(key, JSON.stringify(accounts[key]));
  }

  await Storage.setItemAsync(USER_ACCOUNT_KEYS, JSON.stringify(newKeys));
}

/**
 * Check if auto-sync is enabled (default: true if token exists)
 */
export async function isAutoSyncEnabled(): Promise<boolean> {
  const enabled = await Storage.getItemAsync(AUTO_SYNC_ENABLED_KEY);
  if (enabled === null) return true; // Default enabled
  return enabled === "true";
}

/**
 * Enable/disable auto-sync
 */
export async function setAutoSyncEnabled(enabled: boolean): Promise<void> {
  await Storage.setItemAsync(AUTO_SYNC_ENABLED_KEY, enabled ? "true" : "false");
}

/**
 * Perform automatic backup to GitHub Gist
 */
export async function performAutoBackup(): Promise<void> {
  try {
    // Check if auto-sync is enabled
    const enabled = await isAutoSyncEnabled();
    if (!enabled) {
      console.log("ℹ️ Auto-sync disabled");
      return;
    }

    // Check if we have a GitHub token
    const token = await Storage.getItemAsync(GITHUB_TOKEN_KEY);
    if (!token || token.trim().length === 0) {
      console.log("ℹ️ No GitHub token - skipping auto-backup");
      return;
    }

    console.log("📤 Starting auto-backup...");

    // Export all accounts
    const cipherText = await exportAllAccounts();

    // Create or update gist
    const gistId = await createOrUpdateGistBackup(token, cipherText);

    // Save gist ID
    await Storage.setItemAsync(BACKUP_GIST_ID_KEY, gistId);

    console.log(`✅ Auto-backup complete: ${gistId}`);
  } catch (err) {
    console.error("❌ Auto-backup failed:", err);
    // Don't throw - fail silently for auto-backup
  }
}

/**
 * Trigger auto-backup with debouncing (2 second delay)
 */
export async function triggerAutoBackup(): Promise<void> {
  // Clear existing timeout
  if (syncTimeout) {
    clearTimeout(syncTimeout);
  }

  // Set new timeout
  syncTimeout = setTimeout(() => {
    performAutoBackup();
  }, 2000) as unknown as typeof syncTimeout; // 2 second debounce
}
