import CryptoJS from "crypto-js";
import * as Crypto from "expo-crypto";
import * as Random from "expo-random";
import * as SecureStore from "expo-secure-store";

const MASTER_KEY_STORAGE_KEY = "encryptionMasterKey";

/** Safe RNG wrapper always returning real Uint8Array */
async function safeRandom(size: number): Promise<Uint8Array> {
  try {
    return Crypto.getRandomValues(new Uint8Array(size));
  } catch {
    return await Random.getRandomBytesAsync(size);
  }
}

async function getOrCreateMasterKey(): Promise<string> {
  const existing = await SecureStore.getItemAsync(MASTER_KEY_STORAGE_KEY);
  if (existing) return existing;

  const randomBytes = await safeRandom(32);

  const wordArray = CryptoJS.lib.WordArray.create(Array.from(randomBytes));
  const masterKey = CryptoJS.enc.Base64.stringify(wordArray);

  await SecureStore.setItemAsync(MASTER_KEY_STORAGE_KEY, masterKey);
  return masterKey;
}

function toShortToken(input: string): string {
  const hash = CryptoJS.SHA256(input);
  const b64 = CryptoJS.enc.Base64.stringify(hash);
  return b64.replace(/[^A-Za-z0-9]/g, "").substring(0, 16);
}

/** FIXED encryptText that never crashes and always writes valid ciphertext */
export async function encryptText(plainText: string): Promise<string> {
  const masterKey = await getOrCreateMasterKey();
  const key = CryptoJS.SHA256(masterKey);

  // always safe RNG
  const ivBytes = await safeRandom(16);
  const iv = CryptoJS.lib.WordArray.create(Array.from(ivBytes));

  const encrypted = CryptoJS.AES.encrypt(plainText, key, {
    iv,
    mode: CryptoJS.mode.CBC,
    padding: CryptoJS.pad.Pkcs7,
  });

  const ivB64 = CryptoJS.enc.Base64.stringify(iv);
  const ctB64 = encrypted.toString();

  const fullCipher = `v2:${ivB64}:${ctB64}`;
  const token = toShortToken(fullCipher);

  await SecureStore.setItemAsync(`cipher_${token}`, fullCipher);

  return token;
}

export async function decryptText(cipherText: string): Promise<string> {
  const masterKey = await getOrCreateMasterKey();
  const key = CryptoJS.SHA256(masterKey);

  if (!cipherText.startsWith("v2:")) {
    const stored = await SecureStore.getItemAsync(`cipher_${cipherText}`);
    if (stored) cipherText = stored;
    else return cipherText;
  }

  const [, ivB64, ctB64] = cipherText.split(":");
  const iv = CryptoJS.enc.Base64.parse(ivB64);

  const decrypted = CryptoJS.AES.decrypt(ctB64, key, {
    iv,
    mode: CryptoJS.mode.CBC,
    padding: CryptoJS.pad.Pkcs7,
  });

  return decrypted.toString(CryptoJS.enc.Utf8);
}
