import CryptoJS from "crypto-js";
import * as Crypto from "expo-crypto";
import * as Random from "expo-random";
import * as SecureStore from "expo-secure-store";

const MASTER_KEY_STORAGE_KEY = "encryptionMasterKey";

async function getOrCreateMasterKey(): Promise<string> {
  const existing = await SecureStore.getItemAsync(MASTER_KEY_STORAGE_KEY);
  if (existing) return existing;

  // Generate a cryptographically strong random key (base64)
  let randomBytes: Uint8Array;
  try {
    // Preferred path (native/web crypto backed)
    randomBytes = Crypto.getRandomValues(new Uint8Array(32));
  } catch (e) {
    // Fallback for environments where native crypto isn't available
    const bytes = await Random.getRandomBytesAsync(32);
    randomBytes = Uint8Array.from(bytes);
  }
  let b64 = "";
  for (let i = 0; i < randomBytes.length; i++) {
    b64 += String.fromCharCode(randomBytes[i]);
  }
  const masterKey = CryptoJS.enc.Base64.stringify(CryptoJS.enc.Latin1.parse(b64));

  await SecureStore.setItemAsync(MASTER_KEY_STORAGE_KEY, masterKey);
  return masterKey;
}

export async function encryptText(plainText: string): Promise<string> {
  const masterKey = await getOrCreateMasterKey();
  // v2: Use explicit key/iv to avoid environments that lack global secure RNG
  const key = CryptoJS.SHA256(masterKey); // 32 bytes key

  // Get secure random iv (16 bytes)
  let ivBytes: Uint8Array;
  try {
    ivBytes = Crypto.getRandomValues(new Uint8Array(16));
  } catch {
    const bytes = await Random.getRandomBytesAsync(16);
    ivBytes = Uint8Array.from(bytes);
  }
  const iv = CryptoJS.lib.WordArray.create(Array.from(ivBytes));

  const encrypted = CryptoJS.AES.encrypt(plainText, key, {
    iv,
    mode: CryptoJS.mode.CBC,
    padding: CryptoJS.pad.Pkcs7,
  });

  const ivB64 = CryptoJS.enc.Base64.stringify(iv);
  const ctB64 = encrypted.toString();
  return `v2:${ivB64}:${ctB64}`;
}

export async function decryptText(cipherText: string): Promise<string> {
  const masterKey = await getOrCreateMasterKey();

  // v2 format: v2:<ivBase64>:<cipherBase64>
  if (cipherText.startsWith("v2:")) {
    const [, ivB64, ctB64] = cipherText.split(":");
    const key = CryptoJS.SHA256(masterKey);
    const iv = CryptoJS.enc.Base64.parse(ivB64);
    const decrypted = CryptoJS.AES.decrypt(ctB64, key, {
      iv,
      mode: CryptoJS.mode.CBC,
      padding: CryptoJS.pad.Pkcs7,
    }).toString(CryptoJS.enc.Utf8);
    return decrypted;
  }

  // Legacy fallback (passphrase-based OpenSSL string)
  const legacyBytes = CryptoJS.AES.decrypt(cipherText, masterKey);
  return legacyBytes.toString(CryptoJS.enc.Utf8);
}
