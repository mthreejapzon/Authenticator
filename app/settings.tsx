import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Platform,
  ScrollView,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import {
  decryptWithMasterKey,
  encryptWithMasterKey,
  getOrCreateMasterKey,
  isValidGitHubToken,
} from "./utils/crypto";
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

export default function SettingsScreen() {
  const [githubToken, setGithubToken] = useState<string>("");
  const [hasToken, setHasToken] = useState<boolean>(false);
  const [showToken, setShowToken] = useState<boolean>(false);
  const [maskedToken, setMaskedToken] = useState<string>("");
  const [gistId, setGistId] = useState<string | null>(null);
  const [status, setStatus] = useState<string>("");
  const [isWorking, setIsWorking] = useState(false);
  const [lastBackup, setLastBackup] = useState<string | null>(null);
  const [history, setHistory] = useState<BackupHistoryItem[]>([]);
  const [isLoadingToken, setIsLoadingToken] = useState(true);
  const [autoRestoreEnabled, setAutoRestoreEnabled] = useState(true);
  const [syncStatus, setSyncStatus] = useState<string>("Idle");
  const syncProgress = useRef(new Animated.Value(0)).current;



  // Load auto-restore setting
  useEffect(() => {
    (async () => {
      try {
        const { isAutoRestoreEnabled } = await import("./utils/backupUtils");
        const enabled = await isAutoRestoreEnabled();
        setAutoRestoreEnabled(enabled);
      } catch (err) {
        console.error("Failed to load auto-restore setting:", err);
      }
    })();
  }, []);

  // Subscribe to sync state
  useEffect(() => {
    let unsubscribe: (() => void) | null = null;

    (async () => {
      try {
        const { onSyncStateChange } = await import("./utils/backupUtils");
        
        unsubscribe = onSyncStateChange((syncing) => {
          if (syncing) {
            setSyncStatus("Syncing...");
          } else {
            setSyncStatus("Up to date");
            // Clear status after 2 seconds
            setTimeout(() => setSyncStatus("Idle"), 2000);
          }
        });
      } catch (err) {
        console.error("Failed to subscribe to sync state:", err);
      }
    })();

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, []);

  // Toggle auto-restore function
  const toggleAutoRestore = async (enabled: boolean) => {
    try {
      const { setAutoRestoreEnabled } = await import("./utils/backupUtils");
      await setAutoRestoreEnabled(enabled);
      setAutoRestoreEnabled(enabled);
      
      const msg = enabled 
        ? "Auto-restore enabled. Your accounts will sync automatically."
        : "Auto-restore disabled. You'll need to restore manually.";
      
      if (Platform.OS === 'web') {
        window.alert(msg);
      } else {
        Alert.alert("Auto-Restore", msg);
      }
    } catch (err) {
      console.error("Failed to toggle auto-restore:", err);
    }
  };

  // Load saved values
  useEffect(() => {
    (async () => {
      try {
        setIsLoadingToken(true);
        const t = await Storage.getItemAsync(GITHUB_TOKEN_KEY);
        const g = await Storage.getItemAsync(BACKUP_GIST_ID_KEY);
        const last = await Storage.getItemAsync(LAST_BACKUP_KEY);
        const hist = await Storage.getItemAsync(BACKUP_HISTORY_KEY);

        if (t) {
          setHasToken(true);
          setMaskedToken("ghp_" + "•".repeat(32) + (t.slice(-4) || ""));
          setGithubToken(t); // Store full token for viewing
        } else {
          setHasToken(false);
          setMaskedToken("");
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
      } finally {
        setIsLoadingToken(false);
      }
    })();
  }, []);

  // Save PAT with validation
  const saveToken = async () => {
    try {
      const trimmedToken = githubToken.trim();
      
      if (!trimmedToken) {
        const msg = "Please enter your GitHub Personal Access Token.";
        if (Platform.OS === 'web') {
          window.alert(msg);
        } else {
          Alert.alert("Missing token", msg);
        }
        return;
      }

      // Validate token format
      if (!isValidGitHubToken(trimmedToken)) {
        const msg = 
          "This doesn't look like a valid GitHub token.\n\n" +
          "GitHub tokens typically:\n" +
          "• Are 40+ characters long\n" +
          "• Start with 'ghp_', 'github_pat_', or similar\n\n" +
          "Do you want to save it anyway?";

        if (Platform.OS === 'web') {
          if (!window.confirm(msg)) return;
        } else {
          return new Promise<void>((resolve) => {
            Alert.alert(
              "Invalid Token Format",
              msg,
              [
                { text: "Cancel", style: "cancel", onPress: () => resolve() },
                { 
                  text: "Save Anyway", 
                  onPress: async () => {
                    await performTokenSave(trimmedToken);
                    resolve();
                  } 
                },
              ]
            );
          });
        }
      }

      await performTokenSave(trimmedToken);
    } catch (err) {
      console.error("Token save error:", err);
      const msg = "Could not save token.";
      if (Platform.OS === 'web') {
        window.alert(msg);
      } else {
        Alert.alert("Save failed", msg);
      }
    }
  };

  const performTokenSave = async (token: string) => {
  await Storage.setItemAsync(GITHUB_TOKEN_KEY, token);
  setHasToken(true);
  setMaskedToken("ghp_" + "•".repeat(32) + token.slice(-4));
  setGithubToken(token);
  setShowToken(false);
  
  // Auto-restore from existing gist if found
  setStatus("Checking for existing backups...");
  try {
    const { findBackupGistId, getGistBackup } = await import("./utils/githubBackup");
    const { importAllAccounts } = await import("./utils/backupUtils");
    
    // Look for existing gist
    const existingGistId = await findBackupGistId(token);
    
    if (existingGistId) {
      const shouldRestore = Platform.OS === 'web'
        ? window.confirm(
            `Found existing backup in your GitHub Gists!\n\n` +
            `Gist ID: ${existingGistId}\n\n` +
            `Would you like to restore your accounts from this backup?`
          )
        : await new Promise<boolean>((resolve) => {
            Alert.alert(
              "Backup Found!",
              `Found existing backup (Gist ID: ${existingGistId})\n\nRestore your accounts from this backup?`,
              [
                { text: "Not Now", style: "cancel", onPress: () => resolve(false) },
                { text: "Restore", onPress: () => resolve(true) },
              ]
            );
          });

      if (shouldRestore) {
        setStatus("Restoring accounts from backup...");
        
        // Fetch and import backup
        const cipherText = await getGistBackup(token);
        if (cipherText) {
          await importAllAccounts(cipherText);
          
          setGistId(existingGistId);
          const count = (await Storage.getItemAsync("userAccountKeys"))?.split(",").length || 0;
          setStatus(`Restored ${count} account(s) successfully!`);
          
          const successMsg = `Successfully restored ${count} account(s) from backup!`;
          if (Platform.OS === 'web') {
            window.alert(successMsg);
          } else {
            Alert.alert("Restore Complete", successMsg);
          }
        } else {
          throw new Error("Failed to fetch backup content");
        }
      } else {
        setGistId(existingGistId);
        setStatus("Token saved. Auto-sync enabled.");
        
        const msg = "GitHub token saved. Auto-sync is now enabled.";
        if (Platform.OS === 'web') {
          window.alert(msg);
        } else {
          Alert.alert("Saved", msg);
        }
      }
    } else {
      setStatus("Token saved. Auto-sync enabled.");
      
      const msg = "GitHub token saved. Auto-sync is now enabled. Your accounts will be automatically backed up.";
      if (Platform.OS === 'web') {
        window.alert(msg);
      } else {
        Alert.alert("Saved", msg);
      }
    }
  } catch (err) {
    console.error("Auto-restore check failed:", err);
    setStatus("Token saved (auto-restore failed)");
    
    const msg = "Token saved, but couldn't check for existing backups. You can manually restore from the Restore screen.";
    if (Platform.OS === 'web') {
      window.alert(msg);
    } else {
      Alert.alert("Saved", msg);
    }
  }
};

  // Remove token AND clear all backup metadata
  const removeToken = async () => {
    const confirmMessage = 
      "⚠️ WARNING: This will:\n\n" +
      "• Remove your GitHub token\n" +
      "• Clear all backup metadata\n" +
      "• Make existing encrypted data unreadable\n\n" +
      "Your saved accounts will NOT be deleted, but you won't be able to decrypt passwords/OTP codes until you add the token back.\n\n" +
      "Continue?";
    
    if (Platform.OS === 'web') {
      const confirmed = window.confirm(confirmMessage);
      if (!confirmed) return;
      await performRemoval();
    } else {
      Alert.alert(
        "Remove Token & Clear Backups",
        confirmMessage,
        [
          { text: "Cancel", style: "cancel" },
          { text: "Remove", style: "destructive", onPress: performRemoval },
        ]
      );
    }
  };

  const performRemoval = async () => {
    try {
      console.log("🗑️ Starting token removal...");
      
      await Storage.deleteItemAsync(GITHUB_TOKEN_KEY);
      await Storage.deleteItemAsync(BACKUP_GIST_ID_KEY);
      await Storage.deleteItemAsync(LAST_BACKUP_KEY);
      await Storage.deleteItemAsync(BACKUP_HISTORY_KEY);

      console.log("✅ Deletion completed");

      const verify = await Storage.getItemAsync(GITHUB_TOKEN_KEY);
      console.log("🔍 Verification:", verify === null ? "✅ Removed" : "❌ Still exists");

      if (verify !== null) {
        throw new Error("Token still present after deletion.");
      }

      setHasToken(false);
      setMaskedToken("");
      setGistId(null);
      setLastBackup(null);
      setHistory([]);
      setStatus("");
      setGithubToken("");
      setShowToken(false);

      const msg = "GitHub token and backup metadata removed successfully.";
      if (Platform.OS === 'web') {
        window.alert(msg);
      } else {
        Alert.alert("Removed", msg);
      }
    } catch (err: any) {
      console.error("❌ Remove token failed:", err);
      const msg = err.message || "Could not remove token and metadata.";
      if (Platform.OS === 'web') {
        window.alert(`Failed: ${msg}`);
      } else {
        Alert.alert("Remove failed", msg);
      }
    }
  };

  // Export all accounts -> encrypt -> upload gist
  const exportAllAccounts = async () => {
    setIsWorking(true);
    setStatus("Collecting accounts...");
    try {
      const keysString = await Storage.getItemAsync(USER_ACCOUNT_KEYS);
      const keys: string[] = keysString ? JSON.parse(keysString) : [];

      if (!keys || keys.length === 0) {
        const msg = "No accounts stored.";
        if (Platform.OS === 'web') {
          window.alert(msg);
        } else {
          Alert.alert("Nothing to export", msg);
        }
        setStatus("No accounts to export.");
        setIsWorking(false);
        return;
      }

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

      let masterKey: string;
      try {
        masterKey = await getOrCreateMasterKey();
      } catch (err: any) {
        const msg = err.message || "Native crypto unavailable";
        if (Platform.OS === 'web') {
          window.alert(msg);
        } else {
          Alert.alert("Backup failed", msg);
        }
        setIsWorking(false);
        setStatus("Failed: crypto unavailable");
        return;
      }

      setStatus("Encrypting backup...");
      const cipher = await encryptWithMasterKey(jsonText, masterKey);
      const exportedAt = new Date().toISOString();

      if (!hasToken) {
        const msg = "Please save your GitHub token first.";
        if (Platform.OS === 'web') {
          window.alert(msg);
        } else {
          Alert.alert("Missing token", msg);
        }
        setIsWorking(false);
        return;
      }
      
      const token = (await Storage.getItemAsync(GITHUB_TOKEN_KEY)) || "";

      let targetGistId = gistId;
      
      if (targetGistId) {
        setStatus("Verifying backup gist exists...");
        try {
          const verifyRes = await fetch(
            `https://api.github.com/gists/${targetGistId}`,
            {
              method: "GET",
              headers: {
                Authorization: `Bearer ${token}`,
                Accept: "application/vnd.github+json",
              },
            }
          );

          if (!verifyRes.ok) {
            console.log("⚠️ Stored gist doesn't exist, will search");
            targetGistId = null;
          } else {
            console.log("✅ Verified existing gist:", targetGistId);
          }
        } catch (err) {
          console.warn("⚠️ Could not verify gist:", err);
          targetGistId = null;
        }
      }

      if (!targetGistId) {
        setStatus("Searching for existing backup gist...");
        try {
          const listRes = await fetch(
            `https://api.github.com/gists?per_page=100`,
            {
              headers: {
                Authorization: `Bearer ${token}`,
                Accept: "application/vnd.github+json",
                "X-Github-Api-Version": "2022-11-28",
              },
            }
          );

          if (listRes.ok) {
            const gists = await listRes.json();
            const candidate = (gists || [])
              .filter((g: any) => g.files?.["authenticator_backup.enc"])
              .sort(
                (a: any, b: any) =>
                  new Date(b.updated_at).getTime() -
                  new Date(a.updated_at).getTime()
              )[0];

            if (candidate && candidate.id) {
              console.log("✅ Found existing backup:", candidate.id);
              targetGistId = candidate.id;
              await Storage.setItemAsync(BACKUP_GIST_ID_KEY, targetGistId as string);
              setGistId(targetGistId as string);
            } else {
              console.log("ℹ️ No existing backup found");
            }
          }
        } catch (err) {
          console.warn("⚠️ Finding existing gist failed:", err);
        }
      }

      const isUpdate = Boolean(targetGistId);
      const url = isUpdate
        ? `https://api.github.com/gists/${targetGistId}`
        : `https://api.github.com/gists`;
      const method = isUpdate ? "PATCH" : "POST";

      setStatus(isUpdate ? "Updating backup..." : "Creating backup...");
      console.log(`📤 ${isUpdate ? "Updating" : "Creating"} gist...`);

      const res = await fetch(url, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
          "Content-Type": "application/json",
          "X-Github-Api-Version": "2022-11-28",
        },
        body: JSON.stringify({
          description: `Encrypted Authenticator backup (updated ${new Date().toLocaleString()})`,
          public: false,
          files: {
            "authenticator_backup.enc": {
              content: cipher,
            },
          },
        }),
      });

      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        console.error("❌ Gist operation failed:", res.status, txt);
        
        if (isUpdate && res.status === 404) {
          console.log("🔄 Gist deleted, retrying...");
          await Storage.deleteItemAsync(BACKUP_GIST_ID_KEY);
          setGistId(null);
          
          const retryRes = await fetch(`https://api.github.com/gists`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
              Accept: "application/vnd.github+json",
              "Content-Type": "application/json",
              "X-Github-Api-Version": "2022-11-28",
            },
            body: JSON.stringify({
              description: `Encrypted Authenticator backup (created ${new Date().toLocaleString()})`,
              public: false,
              files: {
                "authenticator_backup.enc": {
                  content: cipher,
                },
              },
            }),
          });

          if (!retryRes.ok) {
            const retryTxt = await retryRes.text().catch(() => "");
            throw new Error(`Failed to create backup: ${retryRes.status} ${retryTxt}`);
          }

          const retryData = await retryRes.json();
          targetGistId = retryData.id;
        } else {
          throw new Error(`Failed: ${res.status} ${txt}`);
        }
      } else {
        const data = await res.json();
        targetGistId = data.id;
      }

      console.log(`✅ Backup ${isUpdate ? "updated" : "created"}:`, targetGistId);

      await Storage.setItemAsync(BACKUP_GIST_ID_KEY, targetGistId!);
      await Storage.setItemAsync(LAST_BACKUP_KEY, exportedAt);
      setGistId(targetGistId!);
      setLastBackup(exportedAt);

      const histItem: BackupHistoryItem = {
        id: String(Date.now()) + "-" + Math.random().toString(36).slice(2),
        gistId: targetGistId!,
        atIso: exportedAt,
        note: isUpdate ? "Updated" : "Created",
      };
      
      const newHistory = [
        histItem,
        ...history.filter(h => h.gistId !== targetGistId)
      ].slice(0, 20);
      
      setHistory(newHistory);
      await Storage.setItemAsync(BACKUP_HISTORY_KEY, JSON.stringify(newHistory));

      setStatus(isUpdate ? "Backup updated!" : "Backup created!");
      
      const msg = `${isUpdate ? "Backup updated" : "New backup created"}!\nGist ID: ${targetGistId}`;
      if (Platform.OS === 'web') {
        window.alert(msg);
      } else {
        Alert.alert(isUpdate ? "Updated" : "Created", msg);
      }
    } catch (err: any) {
      console.error("❌ Export failed:", err);
      const msg = err.message || String(err);
      if (Platform.OS === 'web') {
        window.alert(`Backup failed: ${msg}`);
      } else {
        Alert.alert("Backup failed", msg);
      }
      setStatus(`Failed: ${msg}`);
    } finally {
      setIsWorking(false);
    }
  };

  // Import from latest backup
  const importFromLatestBackup = async () => {
    setIsWorking(true);
    setStatus("Preparing restore...");

    try {
      if (!hasToken) {
        const msg = "Please save your GitHub token first.";
        if (Platform.OS === 'web') {
          window.alert(msg);
        } else {
          Alert.alert("Missing token", msg);
        }
        setIsWorking(false);
        return;
      }

      const token = await Storage.getItemAsync(GITHUB_TOKEN_KEY);
      if (!token) {
        const msg = "GitHub token not found.";
        if (Platform.OS === 'web') {
          window.alert(msg);
        } else {
          Alert.alert("Missing token", msg);
        }
        setIsWorking(false);
        return;
      }

      setStatus("Searching for latest backup...");
      const listRes = await fetch(`https://api.github.com/gists?per_page=100`, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
        },
      });

      if (!listRes.ok) {
        throw new Error("Failed to fetch gists");
      }

      const gists = await listRes.json();

      const backupGists = gists
        .filter((g: any) => g.files && g.files["authenticator_backup.enc"])
        .sort(
          (a: any, b: any) =>
            new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
        );

      if (backupGists.length === 0) {
        const msg = "No encrypted backups found in your GitHub Gists.";
        if (Platform.OS === 'web') {
          window.alert(msg);
        } else {
          Alert.alert("No backups found", msg);
        }
        setIsWorking(false);
        return;
      }

      const latest = backupGists[0];
      const latestGistId = latest.id;

      await Storage.setItemAsync(BACKUP_GIST_ID_KEY, latestGistId);
      setGistId(latestGistId);

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

      let cipher: string;

      if (rawContent.startsWith("{")) {
        console.log("Detected old JSON format");
        try {
          const parsed = JSON.parse(rawContent);
          cipher = parsed.cipher;
          if (!cipher) throw new Error("Missing encrypted content");
        } catch (e) {
          throw new Error("Failed to parse backup JSON");
        }
      } else if (rawContent.startsWith("v2:")) {
        console.log("Detected raw cipher format");
        cipher = rawContent;
      } else {
        throw new Error(`Invalid backup format: ${rawContent.substring(0, 20)}...`);
      }

      const masterKey = await getOrCreateMasterKey();

      setStatus("Decrypting backup...");
      const plaintext = await decryptWithMasterKey(cipher, masterKey);

      const payload = JSON.parse(plaintext);
      const accounts = payload.accounts ?? {};

      const keys = Object.keys(accounts);
      for (const k of keys) {
        await Storage.setItemAsync(k, JSON.stringify(accounts[k]));
      }
      await Storage.setItemAsync(USER_ACCOUNT_KEYS, JSON.stringify(keys));

      setStatus("Restore complete!");
      const msg = `Restored ${keys.length} account(s).`;
      if (Platform.OS === 'web') {
        window.alert(msg);
      } else {
        Alert.alert("Restore complete", msg);
      }
    } catch (err: any) {
      console.error("Restore error:", err);
      const msg = err.message || String(err);
      if (Platform.OS === 'web') {
        window.alert(`Restore failed: ${msg}`);
      } else {
        Alert.alert("Restore failed", msg);
      }
      setStatus("Restore failed");
    } finally {
      setIsWorking(false);
    }
  };

  if (isLoadingToken) {
    return (
      <View style={{ flex: 1, backgroundColor: "#f8f9fa", justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    );
  }

  return (
    <ScrollView
      contentContainerStyle={{ padding: 20, backgroundColor: "#f8f9fa", flexGrow: 1, paddingBottom: 50 }}
    >
      <Text style={{ fontSize: 28, fontWeight: "700", marginBottom: 8, color: "#000" }}>
        Settings
      </Text>
      <Text style={{ fontSize: 15, color: "#666", marginBottom: 24, lineHeight: 22 }}>
        Configure encryption and manage backups
      </Text>

      {/* Info Banner */}
      <View
        style={{
          backgroundColor: "#e3f2fd",
          borderRadius: 12,
          padding: 16,
          marginBottom: 20,
          borderLeftWidth: 4,
          borderLeftColor: "#2196F3",
        }}
      >
        <Text style={{ fontSize: 14, fontWeight: "600", color: "#1976D2", marginBottom: 8 }}>
          ℹ️ About GitHub Token
        </Text>
        <Text style={{ fontSize: 14, color: "#1565C0", lineHeight: 20 }}>
          Your token is used for:{"\n"}
          • Encrypting passwords & OTP secrets{"\n"}
          • Creating and restoring backups{"\n"}
          • Syncing data across devices{"\n\n"}
          It never leaves your device.
        </Text>
      </View>

      {/* GitHub Token Section */}
      <View style={{ backgroundColor: "#fff", padding: 16, borderRadius: 12, marginBottom: 16 }}>
        <Text style={{ fontSize: 18, fontWeight: "600", marginBottom: 12, color: "#000" }}>
          GitHub Personal Access Token
        </Text>

        {hasToken ? (
          <>
            <View style={{ marginBottom: 12 }}>
              <Text style={{ fontSize: 14, color: "#666", marginBottom: 6 }}>
                Current token:
              </Text>
              <View style={{ 
                backgroundColor: "#f5f5f5", 
                borderRadius: 8, 
                padding: 10,
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center"
              }}>
                <Text style={{ 
                  fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace", 
                  fontSize: 13,
                  color: "#333",
                  flex: 1
                }}>
                  {showToken ? githubToken : maskedToken}
                </Text>
                <TouchableOpacity onPress={() => setShowToken(!showToken)}>
                  <Text style={{ color: "#007AFF", fontWeight: "600", fontSize: 14, marginLeft: 8 }}>
                    {showToken ? "Hide" : "Show"}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            <TouchableOpacity
              onPress={removeToken}
              style={{ 
                backgroundColor: "#fff", 
                borderWidth: 1,
                borderColor: "#E63946",
                paddingVertical: 12, 
                borderRadius: 10, 
                alignItems: "center" 
              }}
            >
              <Text style={{ color: "#E63946", fontWeight: "600", fontSize: 15 }}>
                Remove Token & Clear Metadata
              </Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <TextInput
              value={githubToken}
              onChangeText={setGithubToken}
              placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
              placeholderTextColor="#999"
              secureTextEntry={!showToken}
              style={{
                borderWidth: 1,
                borderColor: "#ddd",
                borderRadius: 10,
                padding: 12,
                fontSize: 15,
                marginBottom: 8,
                backgroundColor: "#f9f9f9",
                fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
              }}
              autoCapitalize="none"
              autoCorrect={false}
            />
            
            <TouchableOpacity
              onPress={() => setShowToken(!showToken)}
              style={{ alignSelf: "flex-end", marginBottom: 12 }}
            >
              <Text style={{ color: "#007AFF", fontSize: 14, fontWeight: "600" }}>
                {showToken ? "Hide Token" : "Show Token"}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={saveToken}
              style={{ 
                backgroundColor: "#007AFF", 
                paddingVertical: 12, 
                borderRadius: 10, 
                alignItems: "center",
                marginBottom: 8
              }}
            >
              <Text style={{ color: "white", fontWeight: "600", fontSize: 15 }}>
                Save Token
              </Text>
            </TouchableOpacity>

            <Text style={{ fontSize: 13, color: "#666", marginTop: 4, lineHeight: 18 }}>
              Create at: <Text style={{ fontWeight: "600", color: "#007AFF" }}>github.com/settings/tokens</Text>
              {"\n"}No special permissions needed.
            </Text>
          </>
        )}
      </View>

      {/* Warning when no token */}
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
            ⚠️ <Text style={{ fontWeight: "600" }}>Token required:</Text> Add a GitHub token above to decrypt passwords/OTP codes and enable backups.
          </Text>
        </View>
      )}

      {/* Auto-Restore Toggle Section */}
      {hasToken && (
        <View style={{ backgroundColor: "#fff", padding: 16, borderRadius: 12, marginBottom: 16 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 18, fontWeight: "600", color: "#000", marginBottom: 4 }}>
                Auto-Restore
              </Text>
              <Text style={{ fontSize: 13, color: "#666", lineHeight: 18 }}>
                Automatically sync accounts from cloud when changes are detected
              </Text>
            </View>
            
            {/* Import Switch from react-native at the top */}
            <Switch
              value={autoRestoreEnabled}
              onValueChange={toggleAutoRestore}
              trackColor={{ false: "#d1d1d6", true: "#34C759" }}
              thumbColor="#fff"
              ios_backgroundColor="#d1d1d6"
            />
          </View>

          {/* Sync Status */}
          {autoRestoreEnabled && (
            <View
              style={{
                marginTop: 12,
                paddingTop: 12,
                borderTopWidth: 1,
                borderTopColor: "#f0f0f0",
                flexDirection: "row",
                alignItems: "center",
              }}
            >
              <View
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 4,
                  backgroundColor: 
                    syncStatus === "Syncing..." ? "#2196F3" :
                    syncStatus === "Up to date" ? "#4CAF50" :
                    "#9E9E9E",
                  marginRight: 8,
                }}
              />
              <Text style={{ fontSize: 13, color: "#666" }}>
                {syncStatus === "Idle" ? "Monitoring for changes..." : syncStatus}
              </Text>
            </View>
          )}

          {/* Info */}
          <View
            style={{
              marginTop: 12,
              padding: 12,
              backgroundColor: "#f0f7ff",
              borderRadius: 8,
            }}
          >
            <Text style={{ fontSize: 12, color: "#1976D2", lineHeight: 16 }}>
              ℹ️ Checks for updates every 30 seconds. Your accounts will appear automatically on all devices.
            </Text>
          </View>
        </View>
      )}

      {/* Backup Section */}
      <View style={{ backgroundColor: "#fff", padding: 16, borderRadius: 12, marginBottom: 16 }}>
        <Text style={{ fontSize: 18, fontWeight: "600", marginBottom: 12, color: "#000" }}>
          Backup & Restore
        </Text>

        <TouchableOpacity
          onPress={exportAllAccounts}
          style={{
            backgroundColor: !hasToken || isWorking ? "#cccccc" : "#28a745",
            paddingVertical: 14,
            borderRadius: 10,
            alignItems: "center",
            marginBottom: 12,
          }}
          disabled={!hasToken || isWorking}
        >
          {isWorking && (status.includes("Encrypting") || status.includes("Uploading") || status.includes("Creating")) ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={{ color: "white", fontWeight: "600", fontSize: 15, opacity: !hasToken ? 0.6 : 1 }}>
              📤 Backup Now (Encrypted)
            </Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          onPress={importFromLatestBackup}
          style={{
            backgroundColor: !hasToken || isWorking ? "#cccccc" : "#6c757d",
            paddingVertical: 14,
            borderRadius: 10,
            alignItems: "center",
          }}
          disabled={!hasToken || isWorking}
        >
          {isWorking && (status.includes("Fetching") || status.includes("Decrypting") || status.includes("Searching")) ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={{ color: "white", fontWeight: "600", fontSize: 15, opacity: !hasToken ? 0.6 : 1 }}>
              📥 Restore Latest Backup
            </Text>
          )}
        </TouchableOpacity>

        {gistId && (
          <View style={{ 
            marginTop: 12, 
            padding: 10, 
            backgroundColor: "#f5f5f5", 
            borderRadius: 8 
          }}>
            <Text style={{ fontSize: 13, color: "#666" }}>
              Backup Gist ID:
            </Text>
            <Text style={{ 
              fontSize: 13, 
              color: "#333",
              fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
              marginTop: 2
            }}>
              {gistId}
            </Text>
          </View>
        )}
      </View>

      {/* Backup History */}
      <View style={{ backgroundColor: "#fff", padding: 16, borderRadius: 12, marginBottom: 16 }}>
        <Text style={{ fontSize: 18, fontWeight: "600", marginBottom: 12, color: "#000" }}>
          Backup History
        </Text>
        
        {lastBackup ? (
          <Text style={{ color: "#333", marginBottom: 12, fontSize: 14 }}>
            Last backup: <Text style={{ fontWeight: "600" }}>{new Date(lastBackup).toLocaleString()}</Text>
          </Text>
        ) : (
          <Text style={{ color: "#999", marginBottom: 12, fontSize: 14 }}>
            No backups yet
          </Text>
        )}

        {history.length === 0 ? (
          <Text style={{ color: "#999", fontSize: 14 }}>No history available</Text>
        ) : (
          history.map((h) => (
            <View 
              key={h.id} 
              style={{ 
                paddingVertical: 10, 
                borderTopWidth: 1, 
                borderTopColor: "#eee" 
              }}
            >
              <Text style={{ fontSize: 14, color: "#333", fontWeight: "500" }}>
                {new Date(h.atIso).toLocaleString()}
              </Text>
              <Text style={{ fontSize: 12, color: "#666", marginTop: 2 }}>
                {h.note} • Gist: {h.gistId.substring(0, 8)}...
              </Text>
            </View>
          ))
        )}
      </View>

      {/* Status Display */}
      {status ? (
        <View style={{ 
          backgroundColor: "#fff", 
          padding: 14, 
          borderRadius: 12,
          borderLeftWidth: 4,
          borderLeftColor: status.includes("Failed") || status.includes("failed") ? "#E63946" : "#28a745"
        }}>
          <Text style={{ 
            color: status.includes("Failed") || status.includes("failed") ? "#E63946" : "#28a745",
            fontSize: 14,
            fontWeight: "500"
          }}>
            {status}
          </Text>
        </View>
      ) : null}

      {/* How to Create Token Guide */}
      <View style={{ backgroundColor: "#fff", padding: 16, borderRadius: 12, marginTop: 16 }}>
        <Text style={{ fontSize: 18, fontWeight: "600", marginBottom: 12, color: "#000" }}>
          How to Create a Token
        </Text>

        <View style={{ gap: 12 }}>
          <View>
            <Text style={{ fontSize: 15, fontWeight: "600", color: "#333" }}>
              1. Go to GitHub Settings
            </Text>
            <Text style={{ fontSize: 14, color: "#666", marginTop: 4 }}>
              Visit github.com/settings/tokens
            </Text>
          </View>

          <View>
            <Text style={{ fontSize: 15, fontWeight: "600", color: "#333" }}>
              2. Generate New Token
            </Text>
            <Text style={{ fontSize: 14, color: "#666", marginTop: 4 }}>
              Click "Generate new token (classic)"
            </Text>
          </View>

          <View>
            <Text style={{ fontSize: 15, fontWeight: "600", color: "#333" }}>
              3. Configure Token
            </Text>
            <Text style={{ fontSize: 14, color: "#666", marginTop: 4 }}>
              • Name: "2FA App" or similar{"\n"}
              • Expiration: No expiration (recommended){"\n"}
              • Scopes: Check "gist" for backups, or leave all unchecked for encryption only
            </Text>
          </View>

          <View>
            <Text style={{ fontSize: 15, fontWeight: "600", color: "#333" }}>
              4. Copy & Save
            </Text>
            <Text style={{ fontSize: 14, color: "#666", marginTop: 4 }}>
              Copy the token (starts with ghp_) and paste it above. Save it in a password manager as backup!
            </Text>
          </View>
        </View>
      </View>
    </ScrollView>
  );
}
