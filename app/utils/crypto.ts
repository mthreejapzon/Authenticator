import CryptoJS from "crypto-js";
import { getRandomBytes } from "./cryptoPolyfill";
import { Storage } from "./storage";

/**
 * Storage key for the master encryption key (used for backups)
 */
const MASTER_KEY_STORAGE_KEY = "encryptionMasterKey";
const GITHUB_TOKEN_KEY = "github_token";

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
  if (!pat || pat.trim().length === 0) {
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
  if (!plainText) {
    throw new Error("Cannot encrypt empty text");
  }
  
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
  
  try {
    await Storage.setItemAsync(`cipher_${token}`, fullCipher);
    console.log(`✅ Stored cipher with token: cipher_${token}`);
  } catch (err) {
    console.error("Failed to store cipher token:", err);
    // Return full cipher if storage fails
    return fullCipher;
  }

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
  if (!cipherText || cipherText.trim().length === 0) {
    throw new Error("Cannot decrypt empty ciphertext");
  }

  if (!pat || pat.trim().length === 0) {
    throw new Error("PAT is required for decryption");
  }

  const key = keyFromPAT(pat);
  let actualCipher = cipherText;

  // 1. If it's a short token (not starting with v2:)
  if (!cipherText.startsWith("v2:")) {
    console.log(`🔍 Attempting to resolve token: ${cipherText.substring(0, 20)}...`);
    
    try {
      const stored = await Storage.getItemAsync(`cipher_${cipherText}`);
      
      if (stored) {
        console.log("✅ Token resolved from storage");
        actualCipher = stored;
      } else {
        console.warn("⚠️ Token not found in storage");
        
        // Check if it might be a direct cipher text that doesn't have v2: prefix
        if (cipherText.includes(":") && cipherText.split(":").length === 3) {
          console.log("🔄 Treating as direct cipher without v2: prefix");
          actualCipher = `v2:${cipherText}`;
        } else if (!cipherText.includes(":")) {
          // Might be plaintext from old data
          console.log("⚠️ Appears to be plaintext, returning as-is");
          return cipherText;
        } else {
          throw new Error(
            `Cipher token not found in storage. The data may have been encrypted on a different device or the local cache was cleared.`
          );
        }
      }
    } catch (err) {
      console.error("❌ Error resolving token:", err);
      throw new Error(
        `Failed to resolve cipher token: ${err instanceof Error ? err.message : "Unknown error"}`
      );
    }
  }

  // Must be v2 format
  if (!actualCipher.startsWith("v2:")) {
    throw new Error(
      `Unsupported ciphertext format. Expected 'v2:' prefix but got: ${actualCipher.substring(0, 20)}...`
    );
  }

  try {
    const parts = actualCipher.split(":");
    
    if (parts.length !== 3) {
      throw new Error(
        `Malformed cipher - expected 3 parts (v2:iv:ct) but got ${parts.length}`
      );
    }

    const [version, ivB64, ctB64] = parts;

    if (!ivB64 || !ctB64) {
      throw new Error("Missing IV or ciphertext component");
    }

    const iv = CryptoJS.enc.Base64.parse(ivB64);

    const decrypted = CryptoJS.AES.decrypt(ctB64, key, {
      iv,
      mode: CryptoJS.mode.CBC,
      padding: CryptoJS.pad.Pkcs7,
    });

    const result = decrypted.toString(CryptoJS.enc.Utf8);

    if (!result || result.length === 0) {
      throw new Error(
        "Decryption failed — incorrect PAT or corrupted backup. The GitHub token used for decryption must match the one used for encryption."
      );
    }

    console.log("✅ Decryption successful");
    return result;
  } catch (err) {
    if (err instanceof Error) {
      // Re-throw our custom errors
      if (err.message.includes("Decryption failed")) {
        throw err;
      }
      throw new Error(`Decryption error: ${err.message}`);
    }
    throw new Error("Decryption failed with unknown error");
  }
}

// ============================================================================
// MASTER KEY-BASED ENCRYPTION (for backups)
// ============================================================================

/**
 * 🔥 NEW: Get or create a master key DERIVED FROM GITHUB TOKEN
 * This ensures the same master key on all devices with the same token.
 */
export async function getOrCreateMasterKey(): Promise<string> {
  // Try to get GitHub token first
  const githubToken = await Storage.getItemAsync(GITHUB_TOKEN_KEY);
  
  if (githubToken && githubToken.trim().length > 0) {
    // Derive master key from GitHub token (consistent across devices)
    console.log("✅ Deriving master key from GitHub token");
    const derived = CryptoJS.SHA256(githubToken + "_backup_master_key");
    return CryptoJS.enc.Base64.stringify(derived);
  }
  
  // Fallback: use device-specific key (old behavior)
  console.log("⚠️ No GitHub token, using device-specific master key");
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
  if (!plainText) {
    throw new Error("Cannot encrypt empty text");
  }

  // If no master key provided, get/create it
  const keyBase = masterKeyB64 || (await getOrCreateMasterKey());
  const key = CryptoJS.SHA256(keyBase);

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
  if (!cipherText || cipherText.trim().length === 0) {
    throw new Error("Cannot decrypt empty ciphertext");
  }

  // Handle both old JSON wrapper format and new raw format
  let cipher = cipherText.trim();
  
  // Check if it's wrapped in JSON format
  if (cipher.startsWith("{")) {
    try {
      const parsed = JSON.parse(cipher);
      cipher = parsed.cipher || cipher;
    } catch (e) {
      // If JSON parse fails, assume it's raw cipher
      console.log("Not JSON format, treating as raw cipher");
    }
  }
  
  if (!cipher.startsWith("v2:")) {
    throw new Error(
      `Unsupported backup format. Expected 'v2:' prefix but got: ${cipher.substring(0, 20)}...`
    );
  }

  // If no master key provided, get it from storage
  const keyBase = masterKeyB64 || (await getOrCreateMasterKey());
  const key = CryptoJS.SHA256(keyBase);

  const parts = cipher.split(":");
  
  if (parts.length !== 3) {
    throw new Error(
      `Malformed cipher - expected 3 parts (v2:iv:ct) but got ${parts.length}`
    );
  }

  const [version, ivB64, ctB64] = parts;
  
  if (!ivB64 || !ctB64) {
    throw new Error("Malformed cipher text - missing IV or ciphertext");
  }

  try {
    const iv = CryptoJS.enc.Base64.parse(ivB64);

    const decrypted = CryptoJS.AES.decrypt(ctB64, key, {
      iv,
      mode: CryptoJS.mode.CBC,
      padding: CryptoJS.pad.Pkcs7,
    });

    const result = decrypted.toString(CryptoJS.enc.Utf8);

    if (!result || result.length === 0) {
      throw new Error(
        "Decryption failed. Make sure you're using the same GitHub token that was used to create the backup."
      );
    }

    console.log("✅ Master key decryption successful");
    return result;
  } catch (err) {
    if (err instanceof Error && err.message.includes("Decryption failed")) {
      throw err;
    }
    throw new Error(
      `Master key decryption failed: ${err instanceof Error ? err.message : "Unknown error"}`
    );
  }
}

/**
 * Delete the master key from SecureStore.
 * WARNING: This will make all existing backups unrecoverable!
 */
export async function deleteMasterKey(): Promise<void> {
  await Storage.deleteItemAsync(MASTER_KEY_STORAGE_KEY);
  console.log("🗑️ Master key deleted");
}

/**
 * Check if a master key exists in SecureStore.
 */
export async function hasMasterKey(): Promise<boolean> {
  const key = await Storage.getItemAsync(MASTER_KEY_STORAGE_KEY);
  return key !== null;
}

/**
 * Helper function to validate if a token looks like a valid GitHub token
 */
export function isValidGitHubToken(token: string): boolean {
  if (!token || token.trim().length === 0) {
    return false;
  }
  
  // GitHub tokens are typically 40+ characters
  // Classic tokens start with 'ghp_', fine-grained start with 'github_pat_'
  const trimmed = token.trim();
  
  if (trimmed.length < 20) {
    return false;
  }
  
  // Check for common GitHub token prefixes
  const hasValidPrefix = 
    trimmed.startsWith("ghp_") || 
    trimmed.startsWith("github_pat_") ||
    trimmed.startsWith("gho_") ||
    trimmed.startsWith("ghu_") ||
    trimmed.startsWith("ghs_") ||
    trimmed.startsWith("ghr_");
  
  return hasValidPrefix || trimmed.length >= 40;
}
