import CryptoJS from "crypto-js";
import * as Crypto from "expo-crypto";
import * as SecureStore from "expo-secure-store";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, Alert, ScrollView, Text, TextInput, TouchableOpacity, View } from "react-native";

/**
 * Keys used in SecureStore
 */
const GITHUB_TOKEN_KEY = "github_token";
const BACKUP_GIST_ID_KEY = "backup_gist_id";
const LAST_BACKUP_KEY = "last_backup_at";
const BACKUP_HISTORY_KEY = "backup_history"; // array of { id, gistId, atIso }
const USER_ACCOUNT_KEYS = "userAccountKeys";
const MASTER_KEY_STORAGE_KEY = "encryptionMasterKey"; // matches your crypto.ts

type BackupHistoryItem = { id: string; gistId: string; atIso: string; note?: string };

/**
 * Helper: create or return a base64 master key stored in SecureStore.
 * Uses Crypto.getRandomValues from expo-crypto. If unavailable, alerts user.
 */
async function getOrCreateMasterKey(): Promise<string> {
  const existing = await SecureStore.getItemAsync(MASTER_KEY_STORAGE_KEY);
  if (existing) return existing;

  // generate 32 random bytes using expo-crypto's getRandomValues
  try {
    // getRandomValues returns Uint8Array
    const ivBytes = Crypto.getRandomValues(new Uint8Array(32));
    // convert to WordArray then base64
    const wordArray = CryptoJS.lib.WordArray.create(Array.from(ivBytes));
    const masterKey = CryptoJS.enc.Base64.stringify(wordArray);
    await SecureStore.setItemAsync(MASTER_KEY_STORAGE_KEY, masterKey);
    return masterKey;
  } catch (err) {
    console.error("Crypto.getRandomValues failed:", err);
    throw new Error(
      "Native crypto module not available. Please run on a real device or ensure your environment supports secure random generation."
    );
  }
}

/**
 * AES encrypt JSON text with derived key from masterKey.
 * Returns an object { cipher: "v2:<ivB64>:<ctB64>", exportedAt: ISO }.
 * We use AES-CBC with PKCS7 (same style as your crypto.ts).
 */
async function encryptJsonPayload(masterKeyB64: string, jsonText: string) {
  // derive key: SHA256(masterKey)
  const key = CryptoJS.SHA256(masterKeyB64);

  // iv: 16 bytes
  let ivBytes: Uint8Array;
  try {
    ivBytes = Crypto.getRandomValues(new Uint8Array(16));
  } catch (err) {
    console.error("Crypto.getRandomValues (iv) failed:", err);
    throw new Error("Secure random not available for IV generation.");
  }

  const ivWordArray = CryptoJS.lib.WordArray.create(Array.from(ivBytes));
  const ivB64 = CryptoJS.enc.Base64.stringify(ivWordArray);

  // encrypt
  const encrypted = CryptoJS.AES.encrypt(jsonText, key, {
    iv: ivWordArray,
    mode: CryptoJS.mode.CBC,
    padding: CryptoJS.pad.Pkcs7,
  });

  const ctB64 = encrypted.toString(); // already base64-compatible string
  const fullCipher = `v2:${ivB64}:${ctB64}`;

  return { cipher: fullCipher, exportedAt: new Date().toISOString() };
}

/**
 * Decrypt a v2 cipher string using the masterKey (base64)
 */
async function decryptJsonPayload(masterKeyB64: string, cipherText: string) {
  if (!cipherText.startsWith("v2:")) {
    throw new Error("Unsupported backup format");
  }
  const key = CryptoJS.SHA256(masterKeyB64);
  const [, ivB64, ctB64] = cipherText.split(":");
  const iv = CryptoJS.enc.Base64.parse(ivB64);

  const decrypted = CryptoJS.AES.decrypt(ctB64, key, {
    iv,
    mode: CryptoJS.mode.CBC,
    padding: CryptoJS.pad.Pkcs7,
  });

  const plain = decrypted.toString(CryptoJS.enc.Utf8);
  if (!plain) throw new Error("Decryption failed (possibly wrong master key)");
  return plain;
}

/**
 * Main Settings screen component
 */
export default function SettingsScreen() {
  const [githubToken, setGithubToken] = useState<string>("");
  const [hasToken, setHasToken] = useState<boolean>(false);
  const [maskedToken, setMaskedToken] = useState<string>("");
  const [gistId, setGistId] = useState<string | null>(null);
  const [status, setStatus] = useState<string>("");
  const [isWorking, setIsWorking] = useState(false);
  const [lastBackup, setLastBackup] = useState<string | null>(null);
  const [history, setHistory] = useState<BackupHistoryItem[]>([]);

  // load saved values
  useEffect(() => {
    (async () => {
      try {
        const t = await SecureStore.getItemAsync(GITHUB_TOKEN_KEY);
        const g = await SecureStore.getItemAsync(BACKUP_GIST_ID_KEY);
        const last = await SecureStore.getItemAsync(LAST_BACKUP_KEY);
        const hist = await SecureStore.getItemAsync(BACKUP_HISTORY_KEY);

        if (t) {
          setHasToken(true);
          // mask token for UI (show only last 4 chars)
          setMaskedToken("••••••••" + (t.slice(-4) || ""));
        }
        if (g) setGistId(g);
        if (last) setLastBackup(last);
        if (hist) {
          try {
            setHistory(JSON.parse(hist));
          } catch {
            setHistory([]);
          }
        }
      } catch (err) {
        console.error("Error loading settings:", err);
      }
    })();
  }, []);

  // Save PAT
  const saveToken = async () => {
    try {
      if (!githubToken.trim()) {
        Alert.alert("Missing token", "Please enter your GitHub Personal Access Token (with gist scope).");
        return;
      }
      await SecureStore.setItemAsync(GITHUB_TOKEN_KEY, githubToken.trim());
      setHasToken(true);
      setMaskedToken("••••••••" + githubToken.slice(-4));
      setGithubToken("");
      Alert.alert("Saved", "GitHub token saved securely.");
    } catch (err) {
      console.error(err);
      Alert.alert("Save failed", "Could not save token.");
    }
  };

  const removeToken = async () => {
    try {
      await SecureStore.deleteItemAsync(GITHUB_TOKEN_KEY);
      setHasToken(false);
      setMaskedToken("");
      Alert.alert("Removed", "GitHub token removed.");
    } catch (err) {
      console.error(err);
      Alert.alert("Remove failed", "Could not remove token.");
    }
  };

  // Export all accounts -> encrypt -> upload gist
  const exportAllAccounts = async () => {
    setIsWorking(true);
    setStatus("Collecting accounts...");
    try {
      // 1) Load keys
      const keysString = await SecureStore.getItemAsync(USER_ACCOUNT_KEYS);
      const keys: string[] = keysString ? JSON.parse(keysString) : [];

      if (!keys || keys.length === 0) {
        Alert.alert("Nothing to export", "No accounts stored.");
        setStatus("No accounts to export.");
        setIsWorking(false);
        return;
      }

      // 2) Read all account data
      const accounts: Record<string, any> = {};
      for (const key of keys) {
        const raw = await SecureStore.getItemAsync(key);
        if (raw) {
          try {
            accounts[key] = JSON.parse(raw);
          } catch {
            accounts[key] = raw;
          }
        }
      }

      const payload = {
        exportedAt: new Date().toISOString(),
        sourceApp: "Authenticator",
        accounts,
      };
      const jsonText = JSON.stringify(payload, null, 2);

      setStatus("Preparing encryption key...");
      // 3) Get or create master key
      let masterKey: string;
      try {
        masterKey = await getOrCreateMasterKey();
      } catch (err: any) {
        // Provide actionable error: native crypto not available
        Alert.alert("Backup failed", err.message || "Native crypto unavailable");
        setIsWorking(false);
        setStatus("Failed: crypto unavailable");
        return;
      }

      // 4) Encrypt payload
      setStatus("Encrypting backup...");
      const { cipher, exportedAt } = await encryptJsonPayload(masterKey, jsonText);

      // 5) Upload to gist
      if (!hasToken) {
        Alert.alert("Missing token", "Please save your GitHub token in Settings first.");
        setIsWorking(false);
        return;
      }
      setStatus("Uploading to GitHub Gist...");

      const token = (await SecureStore.getItemAsync(GITHUB_TOKEN_KEY)) || "";
      const isUpdate = Boolean(gistId);
      const url = isUpdate ? `https://api.github.com/gists/${gistId}` : `https://api.github.com/gists`;
      const method = isUpdate ? "PATCH" : "POST";

      const res = await fetch(url, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          description: `Encrypted authenticator backup (${new Date().toLocaleString()})`,
          public: false,
          files: {
            "authenticator_backup.enc": {
              content: JSON.stringify({
                format: "v2-encrypted-blob",
                exportedAt,
                cipher, // encrypted v2:<iv>:<ct>
              }),
            },
          },
        }),
      });

      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        console.error("Gist upload failed:", res.status, txt);
        throw new Error(`Failed to upload backup to Gist (${res.status})`);
      }

      const data = await res.json();
      const newGistId: string = data.id;
      // Save gist id and last backup timestamp and history
      await SecureStore.setItemAsync(BACKUP_GIST_ID_KEY, newGistId);
      await SecureStore.setItemAsync(LAST_BACKUP_KEY, exportedAt);
      setGistId(newGistId);
      setLastBackup(exportedAt);

      // update history
      const histItem: BackupHistoryItem = { id: String(Date.now()), gistId: newGistId, atIso: exportedAt };
      const newHistory = [histItem, ...history].slice(0, 20); // keep last 20
      setHistory(newHistory);
      await SecureStore.setItemAsync(BACKUP_HISTORY_KEY, JSON.stringify(newHistory));

      setStatus("Backup successful.");
      Alert.alert("Backup uploaded", `Gist ID: ${newGistId}`);
    } catch (err: any) {
      console.error("Export failed:", err);
      Alert.alert("Backup failed", err.message || String(err));
      setStatus(`Backup failed: ${err.message || String(err)}`);
    } finally {
      setIsWorking(false);
    }
  };

  // Import: fetch gist (most recent) and restore local accounts (after decrypt)
  const importFromLatestBackup = async () => {
    setIsWorking(true);
    setStatus("Preparing restore...");
    try {
      const savedGistId = gistId || (history.length > 0 ? history[0].gistId : null);
      if (!savedGistId) {
        Alert.alert("No backup found", "No backup Gist ID saved in settings/history.");
        setIsWorking(false);
        return;
      }
      if (!hasToken) {
        Alert.alert("Missing token", "Please save your GitHub token in Settings first.");
        setIsWorking(false);
        return;
      }

      const token = (await SecureStore.getItemAsync(GITHUB_TOKEN_KEY)) || "";
      setStatus("Fetching backup from GitHub...");
      const res = await fetch(`https://api.github.com/gists/${savedGistId}`, {
        headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" },
      });

      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        console.error("Fetch gist failed:", res.status, txt);
        throw new Error("Failed to fetch backup from Gist");
      }

      const data = await res.json();
      // look for the encrypted file (authenticator_backup.enc)
      const file = data.files?.["authenticator_backup.enc"] ?? Object.values(data.files ?? {})[0];
      if (!file || !file.content) throw new Error("Backup file not found in gist");

      let parsed: any;
      try {
        parsed = typeof file.content === "string" ? JSON.parse(file.content) : file.content;
      } catch {
        throw new Error("Backup file content not valid JSON");
      }

      if (!parsed?.cipher) throw new Error("Backup does not contain encrypted payload");

      // get master key
      let masterKey: string;
      try {
        masterKey = await getOrCreateMasterKey();
      } catch (err: any) {
        Alert.alert("Restore failed", err.message || "Native crypto not available");
        setIsWorking(false);
        return;
      }

      setStatus("Decrypting backup...");
      const plaintext = await decryptJsonPayload(masterKey, parsed.cipher);

      // parse JSON payload
      const payload = JSON.parse(plaintext);
      const accounts = payload.accounts ?? {};

      // Save accounts to SecureStore
      const keys = Object.keys(accounts);
      for (const k of keys) {
        await SecureStore.setItemAsync(k, JSON.stringify(accounts[k]));
      }
      // store keys list
      await SecureStore.setItemAsync(USER_ACCOUNT_KEYS, JSON.stringify(keys));

      // Save last restore timestamp in history if desired
      const restoredAt = new Date().toISOString();
      setStatus("Restore complete");
      Alert.alert("Restore complete", `Restored ${keys.length} account(s)`);
    } catch (err: any) {
      console.error("Import failed:", err);
      Alert.alert("Restore failed", err.message || String(err));
      setStatus(`Restore failed: ${err.message || String(err)}`);
    } finally {
      setIsWorking(false);
    }
  };

  // Helper to clear all backup metadata (NOT deleting gist)
  const clearBackupMetadata = async () => {
    await SecureStore.deleteItemAsync(BACKUP_GIST_ID_KEY);
    await SecureStore.deleteItemAsync(LAST_BACKUP_KEY);
    await SecureStore.deleteItemAsync(BACKUP_HISTORY_KEY);
    setGistId(null);
    setLastBackup(null);
    setHistory([]);
    setStatus("Backup metadata cleared");
    Alert.alert("Cleared", "Backup metadata removed from device.");
  };

  return (
    <ScrollView contentContainerStyle={{ padding: 20, backgroundColor: "#f8f9fa", flexGrow: 1 }}>
      <Text style={{ fontSize: 22, fontWeight: "700", marginBottom: 16 }}>Backup & Restore</Text>

      {/* PAT field logic */}
      <View style={{ backgroundColor: "#fff", padding: 14, borderRadius: 12, marginBottom: 16 }}>
        <Text style={{ fontSize: 16, fontWeight: "600", marginBottom: 8 }}>GitHub Personal Access Token</Text>

        {hasToken ? (
          <>
            <Text style={{ marginBottom: 10, color: "#333" }}>Token saved: <Text style={{ fontFamily: "monospace" }}>{maskedToken}</Text></Text>
            <View style={{ flexDirection: "row", gap: 10 }}>
              <TouchableOpacity
                onPress={() => {
                  // allow replacing token: reveal input by clearing saved token
                  removeToken();
                }}
                style={{ flex: 1, backgroundColor: "#E63946", paddingVertical: 10, borderRadius: 10, alignItems: "center" }}
              >
                <Text style={{ color: "white", fontWeight: "600" }}>Remove Token</Text>
              </TouchableOpacity>
            </View>
          </>
        ) : (
          <>
            <TextInput
              value={githubToken}
              onChangeText={setGithubToken}
              placeholder="Enter GitHub token (gist scope)"
              secureTextEntry
              style={{
                borderWidth: 1,
                borderColor: "#ccc",
                borderRadius: 10,
                padding: 10,
                fontSize: 16,
                marginBottom: 12,
              }}
              autoCapitalize="none"
            />
            <TouchableOpacity onPress={saveToken} style={{ backgroundColor: "#007AFF", paddingVertical: 12, borderRadius: 10, alignItems: "center" }}>
              <Text style={{ color: "white", fontWeight: "600" }}>Save Token</Text>
            </TouchableOpacity>
          </>
        )}
      </View>

      {/* Backup controls */}
      <View style={{ backgroundColor: "#fff", padding: 14, borderRadius: 12, marginBottom: 16 }}>
        <Text style={{ fontSize: 16, fontWeight: "600", marginBottom: 8 }}>Backup</Text>

        <TouchableOpacity
          onPress={exportAllAccounts}
          style={{ backgroundColor: "#28a745", paddingVertical: 12, borderRadius: 10, alignItems: "center", marginBottom: 12 }}
          disabled={isWorking}
        >
          {isWorking && status.includes("Uploading") ? <ActivityIndicator color="#fff" /> : <Text style={{ color: "white", fontWeight: "600" }}>Backup Now (encrypted)</Text>}
        </TouchableOpacity>

        <TouchableOpacity
          onPress={importFromLatestBackup}
          style={{ backgroundColor: "#6c757d", paddingVertical: 12, borderRadius: 10, alignItems: "center", marginBottom: 8 }}
          disabled={isWorking}
        >
          {isWorking && status.includes("Fetching") ? <ActivityIndicator color="#fff" /> : <Text style={{ color: "white", fontWeight: "600" }}>Restore Latest Backup</Text>}
        </TouchableOpacity>

        <TouchableOpacity onPress={clearBackupMetadata} style={{ backgroundColor: "#F59E0B", paddingVertical: 10, borderRadius: 10, alignItems: "center" }}>
          <Text style={{ color: "white", fontWeight: "600" }}>Clear Backup Metadata</Text>
        </TouchableOpacity>

        {gistId && (
          <Text style={{ marginTop: 12, color: "#555" }}>Backup Gist ID: {gistId}</Text>
        )}
      </View>

      {/* Last backup + history */}
      <View style={{ backgroundColor: "#fff", padding: 14, borderRadius: 12 }}>
        <Text style={{ fontSize: 16, fontWeight: "600", marginBottom: 8 }}>Backup History</Text>
        {lastBackup ? <Text style={{ color: "#333", marginBottom: 8 }}>Last Backup: {new Date(lastBackup).toLocaleString()}</Text> : <Text style={{ color: "#777", marginBottom: 8 }}>No backups yet</Text>}

        {history.length === 0 ? (
          <Text style={{ color: "#777" }}>No backup history</Text>
        ) : (
          history.map((h) => (
            <View key={h.id} style={{ paddingVertical: 8, borderTopWidth: 1, borderTopColor: "#eee" }}>
              <Text style={{ fontSize: 13 }}>• {new Date(h.atIso).toLocaleString()}</Text>
              <Text style={{ fontSize: 12, color: "#666" }}>Gist: {h.gistId}</Text>
            </View>
          ))
        )}
      </View>

      {/* Status */}
      {status ? <Text style={{ marginTop: 14, color: "#333" }}>{status}</Text> : null}
    </ScrollView>
  );
}
