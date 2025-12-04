import CryptoJS from "crypto-js";
import { Storage } from "./storage";
import { getRandomBytes } from "./cryptoPolyfill";

/**
 * Storage key for the master encryption key (used for backups)
 */
const MASTER_KEY_STORAGE_KEY = "encryptionMasterKey";

/**
 * Convert bytes → CryptoJS WordArray
 */
function toWordArray(bytes: Uint8Array) {
  return CryptoJS.lib.WordArray.create(Array.from(bytes));
}

/**
 * Short token generator used for local SecureStore caching.
 */
function toShortToken(input: string): string {
  const hash = CryptoJS.SHA256(input).toString(CryptoJS.enc.Base64);
  return hash.replace(/[^A-Za-z0-9]/g, "").substring(0, 16);
}

// ============================================================================
// PAT-BASED ENCRYPTION (for account secrets)
// ============================================================================

/**
 * Derive AES key from PAT.
 */
function keyFromPAT(pat: string) {
  if (!pat || pat.length < 10) {
    throw new Error("PAT is required for encryption/decryption.");
  }
  return CryptoJS.SHA256(pat); // 256-bit key
}

/**
 * Encrypt text using PAT-derived key.
 */
export async function encryptText(
  plainText: string,
  pat: string
): Promise<string> {
  const key = keyFromPAT(pat);

  const ivBytes = getRandomBytes(16);
  const iv = toWordArray(ivBytes);

  const encrypted = CryptoJS.AES.encrypt(plainText, key, {
    iv,
    mode: CryptoJS.mode.CBC,
    padding: CryptoJS.pad.Pkcs7,
  });

  const ivB64 = CryptoJS.enc.Base64.stringify(iv);
  const ctB64 = encrypted.toString();

  const fullCipher = `v2:${ivB64}:${ctB64}`;

  // Store inside secure store only for faster local lookup
  const token = toShortToken(fullCipher);
  await Storage.setItemAsync(`cipher_${token}`, fullCipher);

  return token;
}

/**
 * Decrypt using PAT-derived key.
 * Automatically resolves short tokens from SecureStore.
 */
export async function decryptText(
  cipherText: string,
  pat: string
): Promise<string> {
  const key = keyFromPAT(pat);

  // 1. If it's a short token (not starting with v2:)
  if (!cipherText.startsWith("v2:")) {
    const stored = await Storage.getItemAsync(`cipher_${cipherText}`);
    if (stored) {
      cipherText = stored;
    } else {
      // Maybe plaintext or malformed history value
      if (!cipherText.includes(":")) {
        return cipherText;
      }
    }
  }

  // Must be v2 format
  if (!cipherText.startsWith("v2:")) {
    throw new Error("Unsupported ciphertext format. Expected 'v2:'.");
  }

  const [, ivB64, ctB64] = cipherText.split(":");
  const iv = CryptoJS.enc.Base64.parse(ivB64);

  const decrypted = CryptoJS.AES.decrypt(ctB64, key, {
    iv,
    mode: CryptoJS.mode.CBC,
    padding: CryptoJS.pad.Pkcs7,
  });

  const result = decrypted.toString(CryptoJS.enc.Utf8);

  if (!result) {
    throw new Error("Decryption failed — incorrect PAT or corrupted backup.");
  }

  return result;
}

// ============================================================================
// MASTER KEY-BASED ENCRYPTION (for backups)
// ============================================================================

/**
 * Get or create a base64 master key stored in SecureStore.
 * This key is used for encrypting/decrypting backup files.
 */
export async function getOrCreateMasterKey(): Promise<string> {
  const existing = await Storage.getItemAsync(MASTER_KEY_STORAGE_KEY);
  if (existing) return existing;

  try {
    // Generate 32 random bytes
    const keyBytes = getRandomBytes(32);
    const wordArray = toWordArray(keyBytes);
    const masterKey = CryptoJS.enc.Base64.stringify(wordArray);

    await Storage.setItemAsync(MASTER_KEY_STORAGE_KEY, masterKey);
    return masterKey;
  } catch (err) {
    console.error("Master key generation failed:", err);
    throw new Error(
      "Native crypto module not available. Please run on a real device or ensure your environment supports secure random generation."
    );
  }
}

/**
 * Encrypt JSON payload using master key.
 * Returns format: "v2:<ivB64>:<ctB64>"
 */
export async function encryptWithMasterKey(
  plainText: string,
  masterKeyB64?: string
): Promise<string> {
  // If no master key provided, get/create it
  const key = masterKeyB64 
    ? CryptoJS.SHA256(masterKeyB64)
    : CryptoJS.SHA256(await getOrCreateMasterKey());

  const ivBytes = getRandomBytes(16);
  const iv = toWordArray(ivBytes);
  const ivB64 = CryptoJS.enc.Base64.stringify(iv);

  const encrypted = CryptoJS.AES.encrypt(plainText, key, {
    iv,
    mode: CryptoJS.mode.CBC,
    padding: CryptoJS.pad.Pkcs7,
  });

  const ctB64 = encrypted.toString();
  return `v2:${ivB64}:${ctB64}`;
}

/**
 * Decrypt a v2 cipher string using master key.
 */
export async function decryptWithMasterKey(
  cipherText: string,
  masterKeyB64?: string
): Promise<string> {
  // 🔥 FIX: Handle both old JSON wrapper format and new raw format
  let cipher = cipherText;
  
  // Check if it's wrapped in JSON format
  if (cipherText.trim().startsWith("{")) {
    try {
      const parsed = JSON.parse(cipherText);
      cipher = parsed.cipher || cipherText;
    } catch (e) {
      // If JSON parse fails, assume it's raw cipher
      cipher = cipherText;
    }
  }
  
  if (!cipher.startsWith("v2:")) {
    throw new Error("Unsupported backup format. Expected 'v2:' prefix.");
  }

  // If no master key provided, get it from storage
  const key = masterKeyB64
    ? CryptoJS.SHA256(masterKeyB64)
    : CryptoJS.SHA256(await getOrCreateMasterKey());

  const [, ivB64, ctB64] = cipher.split(":");
  const iv = CryptoJS.enc.Base64.parse(ivB64);

  const decrypted = CryptoJS.AES.decrypt(ctB64, key, {
    iv,
    mode: CryptoJS.mode.CBC,
    padding: CryptoJS.pad.Pkcs7,
  });

  const result = decrypted.toString(CryptoJS.enc.Utf8);

  if (!result) {
    throw new Error("Decryption failed — possibly wrong master key or corrupted data.");
  }

  return result;
}
/**
 * Delete the master key from SecureStore.
 * WARNING: This will make all existing backups unrecoverable!
 */
export async function deleteMasterKey(): Promise<void> {
  await Storage.deleteItemAsync(MASTER_KEY_STORAGE_KEY);
}

/**
 * Check if a master key exists in SecureStore.
 */
export async function hasMasterKey(): Promise<boolean> {
  const key = await Storage.getItemAsync(MASTER_KEY_STORAGE_KEY);
  return key !== null;
}
