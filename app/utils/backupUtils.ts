import { decryptWithMasterKey, encryptWithMasterKey, getOrCreateMasterKey } from "./crypto";
import { Storage } from "./storage";

const USER_ACCOUNT_KEYS = "userAccountKeys";

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
        // If parsing fails, store raw value to avoid data loss
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

