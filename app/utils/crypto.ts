import CryptoJS from "crypto-js";
import * as Crypto from "expo-crypto";
import * as Random from "expo-random";
import * as SecureStore from "expo-secure-store";

const MASTER_KEY_STORAGE_KEY = "encryptionMasterKey";

async function getOrCreateMasterKey(): Promise<string> {
  const existing = await SecureStore.getItemAsync(MASTER_KEY_STORAGE_KEY);
  if (existing) return existing;

  let randomBytes: Uint8Array;
  try {
    randomBytes = Crypto.getRandomValues(new Uint8Array(32));
  } catch {
    randomBytes = await Random.getRandomBytesAsync(32);
  }

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

export async function encryptText(plainText: string): Promise<string> {
  const masterKey = await getOrCreateMasterKey();
  const key = CryptoJS.SHA256(masterKey);

  let ivBytes: Uint8Array;
  try {
    ivBytes = Crypto.getRandomValues(new Uint8Array(16));
  } catch {
    ivBytes = await Random.getRandomBytesAsync(16);
  }
  const iv = CryptoJS.lib.WordArray.create(Array.from(ivBytes));

  const encrypted = CryptoJS.AES.encrypt(plainText, key, {
    iv,
    mode: CryptoJS.mode.CBC,
    padding: CryptoJS.pad.Pkcs7,
  });

  const ivB64 = CryptoJS.enc.Base64.stringify(iv);
  const ctB64 = encrypted.toString();
  const fullCipher = `v2:${ivB64}:${ctB64}`;

  // Store full cipher by token
  const token = toShortToken(fullCipher);
  await SecureStore.setItemAsync(`cipher_${token}`, fullCipher);

  return token;
}

export async function decryptText(cipherText: string): Promise<string> {
  const masterKey = await getOrCreateMasterKey();
  const key = CryptoJS.SHA256(masterKey);

  // 1️⃣ New short-token system
  if (!cipherText.startsWith("v2:")) {
    const stored = await SecureStore.getItemAsync(`cipher_${cipherText}`);
    if (stored) {
      cipherText = stored;
    } else {
      // 2️⃣ Not found — maybe old plaintext or v2 string stored directly
      if (cipherText.includes(":")) {
        // probably an old "v2:..." string trimmed
        cipherText = cipherText.trim();
      } else {
        // fallback to returning the text itself if it’s unencrypted
        return cipherText;
      }
    }
  }

  // 3️⃣ Now decrypt actual v2 format
  if (!cipherText.startsWith("v2:")) {
    throw new Error("Unsupported ciphertext format. Expected 'v2:' prefix.");
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
