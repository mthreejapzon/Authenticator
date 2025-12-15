import React, { useEffect, useState } from "react";
import { ActivityIndicator, Alert, ScrollView, Text, TextInput, TouchableOpacity, View } from "react-native";
import {
  decryptWithMasterKey,
  encryptWithMasterKey,
  getOrCreateMasterKey
} from './utils/crypto';
import { Storage } from "./utils/storage";

/**
 * Keys used in SecureStore
 */
const GITHUB_TOKEN_KEY = "github_token";
const BACKUP_GIST_ID_KEY = "backup_gist_id";
const LAST_BACKUP_KEY = "last_backup_at";
const BACKUP_HISTORY_KEY = "backup_history";
const USER_ACCOUNT_KEYS = "userAccountKeys";

type BackupHistoryItem = { id: string; gistId: string; atIso: string; note?: string };

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

  // Load saved values
  useEffect(() => {
    (async () => {
      try {
        const t = await Storage.getItemAsync(GITHUB_TOKEN_KEY);
        const g = await Storage.getItemAsync(BACKUP_GIST_ID_KEY);
        const last = await Storage.getItemAsync(LAST_BACKUP_KEY);
        const hist = await Storage.getItemAsync(BACKUP_HISTORY_KEY);

        if (t) {
          setHasToken(true);
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
      await Storage.setItemAsync(GITHUB_TOKEN_KEY, githubToken.trim());
      setHasToken(true);
      setMaskedToken("••••••••" + githubToken.slice(-4));
      setGithubToken("");
      Alert.alert("Saved", "GitHub token saved securely.");
    } catch (err) {
      console.error(err);
      Alert.alert("Save failed", "Could not save token.");
    }
  };

  // Remove token AND clear all backup metadata
  const removeToken = async () => {
    Alert.alert(
      "Remove Token & Clear Backups",
      "This will remove your GitHub token and clear all backup metadata (Gist ID, history, etc.). Your accounts will NOT be deleted. Continue?",
      [
        {
          text: "Cancel",
          style: "cancel"
        },
        {
          text: "Remove",
          style: "destructive",
          onPress: async () => {
            try {
              // Remove GitHub token
              await Storage.deleteItemAsync(GITHUB_TOKEN_KEY);
              
              // Clear all backup metadata
              await Storage.deleteItemAsync(BACKUP_GIST_ID_KEY);
              await Storage.deleteItemAsync(LAST_BACKUP_KEY);
              await Storage.deleteItemAsync(BACKUP_HISTORY_KEY);
              
              // Update state
              setHasToken(false);
              setMaskedToken("");
              setGistId(null);
              setLastBackup(null);
              setHistory([]);
              setStatus("");
              
              Alert.alert("Removed", "GitHub token and backup metadata removed.");
            } catch (err) {
              console.error(err);
              Alert.alert("Remove failed", "Could not remove token.");
            }
          }
        }
      ]
    );
  };

  // Export all accounts -> encrypt -> upload gist
  const exportAllAccounts = async () => {
    setIsWorking(true);
    setStatus("Collecting accounts...");
    try {
      // 1) Load keys
      const keysString = await Storage.getItemAsync(USER_ACCOUNT_KEYS);
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
        const raw = await Storage.getItemAsync(key);
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
        Alert.alert("Backup failed", err.message || "Native crypto unavailable");
        setIsWorking(false);
        setStatus("Failed: crypto unavailable");
        return;
      }

      // 4) Encrypt payload using the crypto module
      setStatus("Encrypting backup...");
      const cipher = await encryptWithMasterKey(jsonText, masterKey);
      const exportedAt = new Date().toISOString();

      // 5) Upload to gist
      if (!hasToken) {
        Alert.alert("Missing token", "Please save your GitHub token in Settings first.");
        setIsWorking(false);
        return;
      }
      setStatus("Uploading to GitHub Gist...");

      const token = (await Storage.getItemAsync(GITHUB_TOKEN_KEY)) || "";
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
              content: cipher,  // 🔥 Raw cipher string only
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
      await Storage.setItemAsync(BACKUP_GIST_ID_KEY, newGistId);
      await Storage.setItemAsync(LAST_BACKUP_KEY, exportedAt);
      setGistId(newGistId);
      setLastBackup(exportedAt);

      // Update history
      const histItem = { 
        id: String(Date.now()) + "-" + Math.random().toString(36).slice(2),
        gistId: newGistId,
        atIso: exportedAt
      };      
      const newHistory = [histItem, ...history].slice(0, 20);
      setHistory(newHistory);
      await Storage.setItemAsync(BACKUP_HISTORY_KEY, JSON.stringify(newHistory));

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
      if (!hasToken) {
        Alert.alert("Missing token", "Please save your GitHub token in Settings first.");
        setIsWorking(false);
        return;
      }

      const token = await Storage.getItemAsync(GITHUB_TOKEN_KEY);
      if (!token) {
        Alert.alert("Missing token", "GitHub token not found.");
        setIsWorking(false);
        return;
      }

      // Fetch all gists under this PAT
      setStatus("Searching for latest backup...");
      const listRes = await fetch(`https://api.github.com/gists`, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
        },
      });

      if (!listRes.ok) {
        throw new Error("Failed to fetch gists");
      }

      const gists = await listRes.json();

      // Find all gists containing authenticator_backup.enc
      const backupGists = gists
        .filter((g: any) => g.files && g.files["authenticator_backup.enc"])
        .sort(
          (a: any, b: any) =>
            new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
        );

      if (backupGists.length === 0) {
        Alert.alert("No backups found", "No encrypted Authenticator backups found in your GitHub Gists.");
        setIsWorking(false);
        return;
      }

      // Pick the most recently updated gist
      const latest = backupGists[0];
      const latestGistId = latest.id;

      // Save gist ID for future direct restores
      await Storage.setItemAsync(BACKUP_GIST_ID_KEY, latestGistId);
      setGistId(latestGistId);

      // Fetch encrypted backup file
      setStatus("Fetching latest backup...");
      const gistRes = await fetch(`https://api.github.com/gists/${latestGistId}`, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
        },
      });

      if (!gistRes.ok) {
        throw new Error("Failed to fetch backup file");
      }

      const gistData = await gistRes.json();
      const file = gistData.files["authenticator_backup.enc"];

      if (!file || !file.content) {
        throw new Error("Backup file has no content");
      }

      const rawContent = file.content.trim();

      // Support BOTH formats (old JSON wrapper and new raw cipher)
      let cipher: string;

      if (rawContent.startsWith("{")) {
        // OLD FORMAT: JSON wrapper
        console.log("Detected old JSON format backup");
        try {
          const parsed = JSON.parse(rawContent);
          cipher = parsed.cipher;
          
          if (!cipher) {
            throw new Error("Backup file is missing encrypted content.");
          }
        } catch (e) {
          throw new Error("Failed to parse backup JSON.");
        }
      } else if (rawContent.startsWith("v2:")) {
        // NEW FORMAT: Raw cipher string
        console.log("Detected new raw cipher format backup");
        cipher = rawContent;
      } else {
        throw new Error(`Invalid backup format. File starts with: ${rawContent.substring(0, 20)}...`);
      }

      // Get master key
      const masterKey = await getOrCreateMasterKey();

      // Decrypt
      setStatus("Decrypting backup...");
      const plaintext = await decryptWithMasterKey(cipher, masterKey);

      // Parse decrypted content
      const payload = JSON.parse(plaintext);
      const accounts = payload.accounts ?? {};

      // Restore accounts
      const keys = Object.keys(accounts);
      for (const k of keys) {
        await Storage.setItemAsync(k, JSON.stringify(accounts[k]));
      }
      await Storage.setItemAsync(USER_ACCOUNT_KEYS, JSON.stringify(keys));

      setStatus("Restore complete!");
      Alert.alert("Restore complete", `Restored ${keys.length} account(s).`);
    } catch (err: any) {
      console.error("Restore error:", err);
      Alert.alert("Restore failed", err.message || String(err));
      setStatus("Restore failed");
    } finally {
      setIsWorking(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={{ padding: 20, backgroundColor: "#f8f9fa", flexGrow: 1 }}>
      <Text style={{ fontSize: 22, fontWeight: "700", marginBottom: 16 }}>Backup & Restore</Text>

      {/* PAT field logic */}
      <View style={{ backgroundColor: "#fff", padding: 14, borderRadius: 12, marginBottom: 16 }}>
        <Text style={{ fontSize: 16, fontWeight: "600", marginBottom: 8 }}>GitHub Personal Access Token</Text>

        {hasToken ? (
          <>
            <Text style={{ marginBottom: 10, color: "#333" }}>
              Token saved: <Text style={{ fontFamily: "monospace" }}>{maskedToken}</Text>
            </Text>
            <TouchableOpacity
              onPress={removeToken}
              style={{ backgroundColor: "#E63946", paddingVertical: 10, borderRadius: 10, alignItems: "center" }}
            >
              <Text style={{ color: "white", fontWeight: "600" }}>Remove Token & Clear Metadata</Text>
            </TouchableOpacity>
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
            <TouchableOpacity 
              onPress={saveToken} 
              style={{ backgroundColor: "#007AFF", paddingVertical: 12, borderRadius: 10, alignItems: "center" }}
            >
              <Text style={{ color: "white", fontWeight: "600" }}>Save Token</Text>
            </TouchableOpacity>
          </>
        )}
      </View>

      {/* 🔥 Warning when no token */}
      {!hasToken && (
        <View
          style={{
            backgroundColor: "#fff3cd",
            borderWidth: 1,
            borderColor: "#ffc107",
            padding: 14,
            borderRadius: 12,
            marginBottom: 16,
          }}
        >
          <Text style={{ color: "#856404", fontSize: 14, lineHeight: 20 }}>
            ⚠️ <Text style={{ fontWeight: "600" }}>GitHub token required:</Text> Please save a GitHub token above to enable backup and restore features.
          </Text>
        </View>
      )}

      {/* Backup controls */}
      <View style={{ backgroundColor: "#fff", padding: 14, borderRadius: 12, marginBottom: 16 }}>
        <Text style={{ fontSize: 16, fontWeight: "600", marginBottom: 8 }}>Backup</Text>

        {/* 🔥 Backup button - disabled when no token */}
        <TouchableOpacity
          onPress={exportAllAccounts}
          style={{ 
            backgroundColor: !hasToken || isWorking ? "#cccccc" : "#28a745", 
            paddingVertical: 12, 
            borderRadius: 10, 
            alignItems: "center", 
            marginBottom: 12 
          }}
          disabled={!hasToken || isWorking}
        >
          {isWorking && status.includes("Uploading") ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={{ color: "white", fontWeight: "600", opacity: !hasToken ? 0.6 : 1 }}>
              Backup Now (encrypted)
            </Text>
          )}
        </TouchableOpacity>

        {/* 🔥 Restore button - disabled when no token */}
        <TouchableOpacity
          onPress={importFromLatestBackup}
          style={{ 
            backgroundColor: !hasToken || isWorking ? "#cccccc" : "#6c757d", 
            paddingVertical: 12, 
            borderRadius: 10, 
            alignItems: "center", 
            marginBottom: 8 
          }}
          disabled={!hasToken || isWorking}
        >
          {isWorking && status.includes("Fetching") ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={{ color: "white", fontWeight: "600", opacity: !hasToken ? 0.6 : 1 }}>
              Restore Latest Backup
            </Text>
          )}
        </TouchableOpacity>

        {gistId && (
          <Text style={{ marginTop: 12, color: "#555" }}>Backup Gist ID: {gistId}</Text>
        )}
      </View>

      {/* Last backup + history */}
      <View style={{ backgroundColor: "#fff", padding: 14, borderRadius: 12 }}>
        <Text style={{ fontSize: 16, fontWeight: "600", marginBottom: 8 }}>Backup History</Text>
        {lastBackup ? (
          <Text style={{ color: "#333", marginBottom: 8 }}>
            Last Backup: {new Date(lastBackup).toLocaleString()}
          </Text>
        ) : (
          <Text style={{ color: "#777", marginBottom: 8 }}>No backups yet</Text>
        )}

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
