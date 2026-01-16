import { decryptWithMasterKey, encryptWithMasterKey, getOrCreateMasterKey } from "./crypto";
import { createOrUpdateGistBackup } from "./githubBackup";
import { Storage } from "./storage";

const USER_ACCOUNT_KEYS = "userAccountKeys";
const GITHUB_TOKEN_KEY = "github_token";
const BACKUP_GIST_ID_KEY = "backup_gist_id";
const AUTO_SYNC_ENABLED_KEY = "auto_sync_enabled";

// Use environment-agnostic timer types
let syncTimeout: ReturnType<typeof setTimeout> | null = null;

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
  }, 2000); // 2 second debounce
}


// Polling state
let pollingInterval: ReturnType<typeof setInterval> | null = null;
let lastKnownGistTimestamp: string | null = null;

/**
 * Check if backup has been updated on GitHub
 */
async function hasBackupChanged(): Promise<boolean> {
  try {
    const token = await Storage.getItemAsync(GITHUB_TOKEN_KEY);
    if (!token) return false;

    const { findBackupGistId } = await import("./githubBackup");
    const gistId = await findBackupGistId(token);
    
    if (!gistId) return false;

    // Fetch gist metadata to check updated_at timestamp
    const res = await fetch(`https://api.github.com/gists/${gistId}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
      },
    });

    if (!res.ok) return false;

    const gistData = await res.json();
    const updatedAt = gistData.updated_at;

    // First time checking
    if (lastKnownGistTimestamp === null) {
      lastKnownGistTimestamp = updatedAt;
      return false;
    }

    // Check if gist was updated
    if (updatedAt !== lastKnownGistTimestamp) {
      lastKnownGistTimestamp = updatedAt;
      return true;
    }

    return false;
  } catch (err) {
    console.error("Error checking backup changes:", err);
    return false;
  }
}

/**
 * Silently restore backup if it has changed
 */
async function silentRestore(): Promise<void> {
  try {
    notifySyncStateChange(true); // Start syncing
    
    const token = await Storage.getItemAsync(GITHUB_TOKEN_KEY);
    if (!token) return;

    const { getGistBackup } = await import("./githubBackup");
    const cipherText = await getGistBackup(token);
    
    if (!cipherText) return;

    await importAllAccounts(cipherText);
    console.log("✅ Auto-restored from updated backup");
    
    // Small delay to show sync indicator
    await new Promise(resolve => setTimeout(resolve, 500));
  } catch (err) {
    console.error("❌ Silent restore failed:", err);
  } finally {
    notifySyncStateChange(false); // Stop syncing
  }
}

/**
 * Start polling for backup changes (every 30 seconds)
 */
export async function startAutoRestorePolling(): Promise<void> {
  // Check if auto-restore is enabled
  const enabled = await isAutoRestoreEnabled();
  if (!enabled) {
    console.log("ℹ️ Auto-restore disabled");
    return;
  }

  // Don't start if already polling
  if (pollingInterval) return;

  const token = await Storage.getItemAsync(GITHUB_TOKEN_KEY);
  if (!token) {
    console.log("ℹ️ No token - auto-restore polling disabled");
    return;
  }

  console.log("🔄 Starting auto-restore polling...");

  // Initialize last known timestamp
  try {
    const { findBackupGistId } = await import("./githubBackup");
    const gistId = await findBackupGistId(token);
    
    if (gistId) {
      const res = await fetch(`https://api.github.com/gists/${gistId}`, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
        },
      });

      if (res.ok) {
        const gistData = await res.json();
        lastKnownGistTimestamp = gistData.updated_at;
        console.log("✅ Initialized with timestamp:", lastKnownGistTimestamp);
      }
    }
  } catch (err) {
    console.error("Failed to initialize timestamp:", err);
  }

  // Poll every 30 seconds
  pollingInterval = setInterval(async () => {
    const hasChanged = await hasBackupChanged();
    
    if (hasChanged) {
      console.log("🔔 Backup changed - restoring...");
      await silentRestore();
      console.log("✅ Sync complete");
    }
  }, 30000); // 30 seconds
}

/**
 * Stop polling
 */
export function stopAutoRestorePolling(): void {
  if (pollingInterval) {
    clearInterval(pollingInterval);
    pollingInterval = null;
    console.log("⏹️ Auto-restore polling stopped");
  }
}


// Add to the END of your backupUtils.ts file

// Sync state management
type SyncListener = (isSyncing: boolean) => void;
const syncListeners: SyncListener[] = [];
let currentlySyncing = false;

/**
 * Subscribe to sync state changes
 */
export function onSyncStateChange(listener: SyncListener): () => void {
  syncListeners.push(listener);
  
  // Return unsubscribe function
  return () => {
    const index = syncListeners.indexOf(listener);
    if (index > -1) {
      syncListeners.splice(index, 1);
    }
  };
}

/**
 * Notify all listeners of sync state change
 */
function notifySyncStateChange(isSyncing: boolean): void {
  currentlySyncing = isSyncing;
  syncListeners.forEach(listener => {
    try {
      listener(isSyncing);
    } catch (err) {
      console.error("Sync listener error:", err);
    }
  });
}

/**
 * Get current sync state
 */
export function isSyncing(): boolean {
  return currentlySyncing;
}

/**
 * Check if auto-restore is enabled
 */
export async function isAutoRestoreEnabled(): Promise<boolean> {
  const enabled = await Storage.getItemAsync("auto_restore_enabled");
  if (enabled === null) return true; // Default enabled
  return enabled === "true";
}

/**
 * Enable/disable auto-restore
 */
export async function setAutoRestoreEnabled(enabled: boolean): Promise<void> {
  await Storage.setItemAsync("auto_restore_enabled", enabled ? "true" : "false");
  
  if (enabled) {
    await startAutoRestorePolling();
  } else {
    stopAutoRestorePolling();
  }
}
