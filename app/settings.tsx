import { Ionicons } from "@expo/vector-icons";
import { useNavigation, useRouter } from "expo-router";
import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
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
import { useSafeAreaInsets } from "react-native-safe-area-context";
import PinSetupScreen from "./components/PinSetupScreen";
import PinVerificationScreen from "./components/PinVerificationScreen";
import { useTheme } from "./context/ThemeContext";
import {
  decryptWithMasterKey,
  encryptWithMasterKey,
  getOrCreateMasterKey,
} from "./utils/crypto";
import { hasPin } from "./utils/pinSecurity";
import { Storage } from "./utils/storage";

/**
 * Keys used in SecureStore
 */
const GITHUB_TOKEN_KEY = "github_token";
const BACKUP_GIST_ID_KEY = "backup_gist_id";
const LAST_BACKUP_KEY = "last_backup_at";
const BACKUP_HISTORY_KEY = "backup_history";
const USER_ACCOUNT_KEYS = "userAccountKeys";

type BackupHistoryItem = {
  id: string;
  gistId: string;
  atIso: string;
  note?: string;
};

export default function SettingsScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const [githubToken, setGithubToken] = useState<string>("");
  const [hasToken, setHasToken] = useState<boolean>(false);
  const [showToken, setShowToken] = useState<boolean>(false);
  const [maskedToken, setMaskedToken] = useState<string>("");
  const [gistIdInput, setGistIdInput] = useState<string>("");
  const [gistId, setGistId] = useState<string | null>(null);
  const [status, setStatus] = useState<string>("");
  const [isWorking, setIsWorking] = useState(false);
  const [lastBackup, setLastBackup] = useState<string | null>(null);
  const [history, setHistory] = useState<BackupHistoryItem[]>([]);
  const [isLoadingToken, setIsLoadingToken] = useState(true);
  const [autoRestoreEnabled, setAutoRestoreEnabled] = useState(true);
  const [syncStatus, setSyncStatus] = useState<string>("Idle");
  const syncProgress = useRef(new Animated.Value(0)).current;
  const [showPinSetup, setShowPinSetup] = useState(false);
  const [hasPinConfigured, setHasPinConfigured] = useState(false);
  const [isInitialSetup, setIsInitialSetup] = useState(false);
  const [showPinVerification, setShowPinVerification] = useState(false);
  const [isRemovingPin, setIsRemovingPin] = useState(false);
  const [showThemeOptions, setShowThemeOptions] = useState(false);
  const { themeMode, resolvedTheme, setThemeMode, colors } = useTheme();

  // Hide default header and use custom header
  useLayoutEffect(() => {
    navigation.setOptions({
      headerShown: false,
    });
  }, [navigation]);

  // Check if PIN is configured
  useEffect(() => {
    (async () => {
      const pinExists = await hasPin();
      setHasPinConfigured(pinExists);
    })();
  }, []);

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
    setAutoRestoreEnabled(enabled);
    try {
      const { setAutoRestoreEnabled: persistAutoRestore } =
        await import("./utils/backupUtils");

      await persistAutoRestore(enabled);

      const msg = enabled
        ? "Auto-sync enabled. Your accounts will sync automatically."
        : "Auto-sync disabled. You'll need to sync manually.";

      if (Platform.OS === "web") {
        window.alert(msg);
      } else {
        Alert.alert("Auto Sync", msg);
      }
    } catch (err) {
      console.error("Failed to toggle auto-restore:", err);

      // rollback on failure
      setAutoRestoreEnabled(!enabled);
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
          setGithubToken(t);
        } else {
          setHasToken(false);
          setMaskedToken("");
        }

        if (g) {
          setGistId(g);
          setGistIdInput(g);
        }
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

  // Enhanced saveToken function with comprehensive validation
  const saveToken = async () => {
    try {
      const trimmedToken = githubToken.trim();

      if (!trimmedToken) {
        const msg = "Please enter your GitHub Personal Access Token.";
        if (Platform.OS === "web") {
          window.alert(msg);
        } else {
          Alert.alert("Missing token", msg);
        }
        return;
      }

      // Import validation functions
      const { validateGitHubToken } =
        await import("./utils/githubTokenValidation");

      // Show validation in progress
      setStatus("Validating GitHub token...");
      setIsWorking(true);

      // Validate token
      const validationResult = await validateGitHubToken(trimmedToken);

      if (!validationResult.isValid) {
        setIsWorking(false);
        setStatus(`Validation failed: ${validationResult.error}`);

        const msg =
          `GitHub Token Validation Failed\n\n${validationResult.error}\n\n` +
          `Please check:\n` +
          `• Token is copied correctly\n` +
          `• Token hasn't been revoked\n` +
          `• Token hasn't expired`;

        if (Platform.OS === "web") {
          window.alert(msg);
        } else {
          Alert.alert("Invalid Token", msg);
        }
        return;
      }

      // Token is valid - show success and scope info
      setStatus("Token validated successfully!");

      let successMsg = `✅ Token validated for ${validationResult.username}\n\n`;

      if (validationResult.hasGistScope) {
        successMsg += `✓ Gist permission enabled\n`;
        successMsg += `Your vault will be backed up to GitHub Gists.`;
      } else {
        successMsg += `⚠️ No Gist permission detected\n\n`;
        successMsg += `Your token will be used for:\n`;
        successMsg += `• Deriving encryption keys\n`;
        successMsg += `• Local vault encryption\n\n`;
        successMsg += `To enable cloud backups, recreate the token with "gist" scope.`;
      }

      if (Platform.OS === "web") {
        window.alert(successMsg);
      } else {
        Alert.alert("Token Validated", successMsg);
      }

      // Proceed with saving
      await performTokenSave(trimmedToken);
    } catch (err) {
      console.error("Token save error:", err);
      setIsWorking(false);
      setStatus("Validation failed");

      const msg =
        err instanceof Error ? err.message : "Could not validate token.";
      if (Platform.OS === "web") {
        window.alert(`Error: ${msg}`);
      } else {
        Alert.alert("Validation failed", msg);
      }
    }
  };

  const performTokenSave = async (token: string) => {
    await Storage.setItemAsync(GITHUB_TOKEN_KEY, token);
    setHasToken(true);
    setMaskedToken("ghp_" + "•".repeat(32) + token.slice(-4));
    setGithubToken(token);
    setShowToken(false);

    // Save Gist ID if provided
    if (gistIdInput.trim()) {
      await Storage.setItemAsync(BACKUP_GIST_ID_KEY, gistIdInput.trim());
      setGistId(gistIdInput.trim());
    }

    // Check if PIN is already set
    const pinExists = await hasPin();

    if (!pinExists) {
      // Show PIN setup for first-time users - this is initial setup
      setStatus("Token saved! Now set up your security PIN.");
      setIsInitialSetup(true); // Mark as initial setup
      setShowPinSetup(true);
      setIsWorking(false);
      return; // Don't continue with auto-restore yet
    }

    // If PIN already exists, continue with auto-restore flow
    await continueWithAutoRestore(token);
  };

  // Extract auto-restore logic into separate function
  const continueWithAutoRestore = async (token: string) => {
    setStatus("Checking for existing backups...");
    try {
      const { findBackupGistId, getGistBackup } =
        await import("./utils/githubBackup");
      const { importAllAccounts } = await import("./utils/backupUtils");

      // Look for existing gist
      const existingGistId = await findBackupGistId(token);

      if (existingGistId) {
        // Update gist ID if found
        if (!gistIdInput.trim()) {
          setGistId(existingGistId);
          setGistIdInput(existingGistId);
          await Storage.setItemAsync(BACKUP_GIST_ID_KEY, existingGistId);
        }

        const shouldRestore =
          Platform.OS === "web"
            ? window.confirm(
                `Found existing backup in your GitHub Gists!\n\n` +
                  `Gist ID: ${existingGistId}\n\n` +
                  `Would you like to restore your accounts from this backup?`,
              )
            : await new Promise<boolean>((resolve) => {
                Alert.alert(
                  "Backup Found!",
                  `Found existing backup (Gist ID: ${existingGistId})\n\nRestore your accounts from this backup?`,
                  [
                    {
                      text: "Not Now",
                      style: "cancel",
                      onPress: () => resolve(false),
                    },
                    { text: "Restore", onPress: () => resolve(true) },
                  ],
                );
              });

        if (shouldRestore) {
          setStatus("Restoring accounts from backup...");

          // Fetch and import backup
          const cipherText = await getGistBackup(token);
          if (cipherText) {
            await importAllAccounts(cipherText);

            setGistId(existingGistId);
            setGistIdInput(existingGistId);
            const keysString = await Storage.getItemAsync("userAccountKeys");
            const keys = keysString ? JSON.parse(keysString) : [];
            const count = keys.length || 0;
            setStatus(`Restored ${count} account(s) successfully!`);

            const successMsg = `Successfully restored ${count} account(s) from backup!`;
            if (Platform.OS === "web") {
              window.alert(successMsg);
            } else {
              Alert.alert("Restore Complete", successMsg);
            }
          } else {
            throw new Error("Failed to fetch backup content");
          }
        } else {
          setStatus("Token saved. Auto-sync enabled.");

          const msg = "GitHub token saved. Auto-sync is now enabled.";
          if (Platform.OS === "web") {
            window.alert(msg);
          } else {
            Alert.alert("Saved", msg);
          }
        }
      } else {
        setStatus("Token saved. Auto-sync enabled.");

        const msg =
          "GitHub token saved. Auto-sync is now enabled. Your accounts will be automatically backed up.";
        if (Platform.OS === "web") {
          window.alert(msg);
        } else {
          Alert.alert("Saved", msg);
        }
      }
    } catch (err) {
      console.error("Auto-restore check failed:", err);
      setStatus("Token saved (auto-restore failed)");

      const msg =
        "Token saved, but couldn't check for existing backups. You can manually restore from the Restore screen.";
      if (Platform.OS === "web") {
        window.alert(msg);
      } else {
        Alert.alert("Saved", msg);
      }
    } finally {
      setIsWorking(false);
    }
  };

  // Handler for when PIN setup is complete
  const handlePinSetupComplete = async () => {
    setShowPinSetup(false);
    setHasPinConfigured(true);

    // Only proceed with auto-restore if this was initial setup
    if (isInitialSetup) {
      const msg = "Security PIN set successfully! Your app is now protected.";
      if (Platform.OS === "web") {
        window.alert(msg);
      } else {
        Alert.alert("Success", msg);
      }

      // Continue with auto-restore flow
      const token = await Storage.getItemAsync(GITHUB_TOKEN_KEY);
      if (token) {
        await continueWithAutoRestore(token);
      }

      setIsInitialSetup(false); // Reset flag
    } else {
      // Just changing PIN - no auto-restore
      const msg = "Security PIN changed successfully!";
      if (Platform.OS === "web") {
        window.alert(msg);
      } else {
        Alert.alert("Success", msg);
      }
    }
  };

  // Handler for skipping PIN setup
  const handleSkipPinSetup = async () => {
    setShowPinSetup(false);

    // Only proceed with auto-restore if this was initial setup
    if (isInitialSetup) {
      const msg = "You can set up a PIN later in Settings for added security.";
      if (Platform.OS === "web") {
        window.alert(msg);
      } else {
        Alert.alert("PIN Skipped", msg);
      }

      // Continue with auto-restore flow
      const token = await Storage.getItemAsync(GITHUB_TOKEN_KEY);
      if (token) {
        await continueWithAutoRestore(token);
      }

      setIsInitialSetup(false); // Reset flag
    } else {
      // Just canceling PIN change - no message needed
      const msg = "PIN change canceled.";
      if (Platform.OS === "web") {
        window.alert(msg);
      } else {
        Alert.alert("Canceled", msg);
      }
    }
  };

  // Clear all data - accounts, token, and backup metadata
  const clearAllData = async () => {
    const confirmMessage =
      "⚠️ WARNING: This will permanently delete:\n\n" +
      "• All your accounts\n" +
      "• Your GitHub token\n" +
      "• Your security PIN\n" +
      "• All backup metadata\n" +
      "• All encrypted data\n\n" +
      "This action cannot be undone!\n\n" +
      "Are you absolutely sure?";

    if (Platform.OS === "web") {
      const confirmed = window.confirm(confirmMessage);
      if (!confirmed) return;
      await performClearAll();
    } else {
      Alert.alert("Clear All Data", confirmMessage, [
        { text: "Cancel", style: "cancel" },
        { text: "Clear All", style: "destructive", onPress: performClearAll },
      ]);
    }
  };

  const performClearAll = async () => {
    try {
      console.log("🗑️ Starting clear all data...");

      // Delete all accounts
      const keysString = await Storage.getItemAsync(USER_ACCOUNT_KEYS);
      const keys: string[] = keysString ? JSON.parse(keysString) : [];
      for (const key of keys) {
        await Storage.deleteItemAsync(key);
      }
      await Storage.deleteItemAsync(USER_ACCOUNT_KEYS);

      // Delete token and backup metadata
      await Storage.deleteItemAsync(GITHUB_TOKEN_KEY);
      await Storage.deleteItemAsync(BACKUP_GIST_ID_KEY);
      await Storage.deleteItemAsync(LAST_BACKUP_KEY);
      await Storage.deleteItemAsync(BACKUP_HISTORY_KEY);

      // Delete PIN data
      const { removePin } = await import("./utils/pinSecurity");
      try {
        // Force remove PIN without verification since we're clearing everything
        await Storage.deleteItemAsync("security_pin_hash");
        await Storage.deleteItemAsync("security_pin_salt");
        await Storage.deleteItemAsync("app_locked");
        await Storage.deleteItemAsync("failed_pin_attempts");
        await Storage.deleteItemAsync("lockout_until");
      } catch (err) {
        console.warn("Failed to clear PIN data:", err);
      }

      console.log("✅ All data cleared");

      setHasToken(false);
      setMaskedToken("");
      setGistId(null);
      setGistIdInput("");
      setLastBackup(null);
      setHistory([]);
      setStatus("");
      setGithubToken("");
      setShowToken(false);
      setHasPinConfigured(false);

      const msg = "All data has been cleared successfully.";
      if (Platform.OS === "web") {
        window.alert(msg);
      } else {
        Alert.alert("Cleared", msg);
      }

      // Navigate back to home
      router.replace("/");
    } catch (err: any) {
      console.error("❌ Clear all data failed:", err);
      const msg = err.message || "Could not clear all data.";
      if (Platform.OS === "web") {
        window.alert(`Failed: ${msg}`);
      } else {
        Alert.alert("Clear failed", msg);
      }
    }
  };

  // Change PIN
  const handleChangePin = () => {
    if (hasPinConfigured) {
      // User has existing PIN - require verification first
      setShowPinVerification(true);
    } else {
      // No existing PIN - go directly to setup
      setIsInitialSetup(false);
      setShowPinSetup(true);
    }
  };

  // Handler for when old PIN is verified
  const handlePinVerified = () => {
    if (isRemovingPin) {
      // User verified PIN for removal - proceed with removal
      handlePinVerifiedForRemoval();
    } else {
      // User verified PIN for changing - show setup screen
      setShowPinVerification(false);
      setIsInitialSetup(false); // This is NOT initial setup
      setShowPinSetup(true); // Now show PIN setup to change it
    }
  };

  // Handler for when verification is cancelled
  const handleVerificationCancelled = () => {
    setShowPinVerification(false);
    setIsRemovingPin(false); // Reset removal flag
  };

  // Remove PIN
  const handleRemovePin = async () => {
    // First, verify the current PIN
    setShowPinVerification(true);

    // Store a flag to know we're removing (not changing) the PIN
    setIsRemovingPin(true);
  };

  // Handler for when PIN is verified for removal
  const handlePinVerifiedForRemoval = async () => {
    setShowPinVerification(false);
    setIsRemovingPin(false);

    // Now show confirmation dialog
    const confirmMessage =
      "Remove Security PIN?\n\n" +
      "This will disable PIN protection for your app. Anyone with access to your device will be able to view your authenticator codes.\n\n" +
      "Are you sure?";

    const confirmed =
      Platform.OS === "web"
        ? window.confirm(confirmMessage)
        : await new Promise<boolean>((resolve) => {
            Alert.alert("Remove PIN", confirmMessage, [
              {
                text: "Cancel",
                style: "cancel",
                onPress: () => resolve(false),
              },
              {
                text: "Remove",
                style: "destructive",
                onPress: () => resolve(true),
              },
            ]);
          });

    if (!confirmed) return;

    try {
      // Force remove PIN
      await Storage.deleteItemAsync("security_pin_hash");
      await Storage.deleteItemAsync("security_pin_salt");
      await Storage.deleteItemAsync("app_locked");
      await Storage.deleteItemAsync("failed_pin_attempts");
      await Storage.deleteItemAsync("lockout_until");

      setHasPinConfigured(false);

      const msg = "Security PIN removed successfully.";
      if (Platform.OS === "web") {
        window.alert(msg);
      } else {
        Alert.alert("Success", msg);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to remove PIN";
      if (Platform.OS === "web") {
        window.alert(`Error: ${msg}`);
      } else {
        Alert.alert("Error", msg);
      }
    }
  };

  // Sync function - triggers backup
  const handleSync = async () => {
    await exportAllAccounts();
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
        if (Platform.OS === "web") {
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
        if (Platform.OS === "web") {
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
        if (Platform.OS === "web") {
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
            },
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
            },
          );

          if (listRes.ok) {
            const gists = await listRes.json();
            const candidate = (gists || [])
              .filter((g: any) => g.files?.["authenticator_backup.enc"])
              .sort(
                (a: any, b: any) =>
                  new Date(b.updated_at).getTime() -
                  new Date(a.updated_at).getTime(),
              )[0];

            if (candidate && candidate.id) {
              console.log("✅ Found existing backup:", candidate.id);
              targetGistId = candidate.id;
              await Storage.setItemAsync(
                BACKUP_GIST_ID_KEY,
                targetGistId as string,
              );
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
          setGistIdInput("");

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
            throw new Error(
              `Failed to create backup: ${retryRes.status} ${retryTxt}`,
            );
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

      console.log(
        `✅ Backup ${isUpdate ? "updated" : "created"}:`,
        targetGistId,
      );

      await Storage.setItemAsync(BACKUP_GIST_ID_KEY, targetGistId!);
      await Storage.setItemAsync(LAST_BACKUP_KEY, exportedAt);
      setGistId(targetGistId!);
      setGistIdInput(targetGistId!);
      setLastBackup(exportedAt);

      const histItem: BackupHistoryItem = {
        id: String(Date.now()) + "-" + Math.random().toString(36).slice(2),
        gistId: targetGistId!,
        atIso: exportedAt,
        note: isUpdate ? "Updated" : "Created",
      };

      const newHistory = [
        histItem,
        ...history.filter((h) => h.gistId !== targetGistId),
      ].slice(0, 20);

      setHistory(newHistory);
      await Storage.setItemAsync(
        BACKUP_HISTORY_KEY,
        JSON.stringify(newHistory),
      );

      setStatus(isUpdate ? "Backup updated!" : "Backup created!");

      const msg = `${isUpdate ? "Backup updated" : "New backup created"}!\nGist ID: ${targetGistId}`;
      if (Platform.OS === "web") {
        window.alert(msg);
      } else {
        Alert.alert(isUpdate ? "Updated" : "Created", msg);
      }
    } catch (err: any) {
      console.error("❌ Export failed:", err);
      const msg = err.message || String(err);
      if (Platform.OS === "web") {
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
        if (Platform.OS === "web") {
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
        if (Platform.OS === "web") {
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
            new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
        );

      if (backupGists.length === 0) {
        const msg = "No encrypted backups found in your GitHub Gists.";
        if (Platform.OS === "web") {
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
      setGistIdInput(latestGistId);

      setStatus("Fetching latest backup...");
      const gistRes = await fetch(
        `https://api.github.com/gists/${latestGistId}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/vnd.github+json",
          },
        },
      );

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
        throw new Error(
          `Invalid backup format: ${rawContent.substring(0, 20)}...`,
        );
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
      if (Platform.OS === "web") {
        window.alert(msg);
      } else {
        Alert.alert("Restore complete", msg);
      }
    } catch (err: any) {
      console.error("Restore error:", err);
      const msg = err.message || String(err);
      if (Platform.OS === "web") {
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
      <View
        style={{
          flex: 1,
          backgroundColor: colors.background,
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {/* PIN Verification Modal */}
      {showPinVerification && (
        <View
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: colors.background,
            zIndex: 1001,
          }}
        >
          <PinVerificationScreen
            onVerified={handlePinVerified}
            onCancel={handleVerificationCancelled}
          />
        </View>
      )}

      {/* PIN Setup Modal */}
      {showPinSetup && (
        <View
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: colors.background,
            zIndex: 1000,
          }}
        >
          <PinSetupScreen
            onPinSetup={handlePinSetupComplete}
            onSkip={handleSkipPinSetup}
          />
        </View>
      )}

      {/* Custom Header */}
      <View
        style={{
          borderBottomWidth: 0.613,
          borderBottomColor: colors.border,
          paddingTop: insets.top,
          minHeight: 72.591,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          paddingHorizontal: 16,
          paddingBottom: 12,
        }}
      >
        {/* Back Button */}
        <TouchableOpacity
          onPress={() => router.back()}
          activeOpacity={0.8}
          style={{
            width: 36,
            height: 40,
            alignItems: "center",
            justifyContent: "center",
            borderRadius: 8,
          }}
        >
          <Ionicons name="arrow-back" size={20} color={colors.primary} />
        </TouchableOpacity>

        {/* Title */}
        <View style={{ flex: 1, alignItems: "center" }}>
          <Text
            style={{
              fontSize: 17,
              fontWeight: "600",
              color: colors.primary,
              marginRight: 42,
            }}
          >
            Settings
          </Text>
        </View>

        {/* Spacer to balance the layout
        <View style={{ width: 36 }} /> */}
      </View>

      {/* Theme Divider */}
      {/* <View
        style={{
          height: 1,
          backgroundColor: colors.border,
          marginVertical: 32,
        }}
      /> */}

      <ScrollView
        contentContainerStyle={{ flexGrow: 1, paddingBottom: 50 }}
        style={{ flex: 1 }}
      >
        {/* GitHub Gist Sync Section */}
        <View style={{ paddingTop: 24, paddingHorizontal: 24 }}>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              marginBottom: 16,
              gap: 12,
            }}
          >
            <View
              style={{
                backgroundColor: colors.card,
                width: 40,
                height: 40,
                borderRadius: 10,
                justifyContent: "center",
                alignItems: "center",
              }}
            >
              <Ionicons
                name="git-branch-outline"
                size={20}
                color={colors.text}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text
                style={{
                  fontSize: 14,
                  fontWeight: "500",
                  color: colors.text,
                  marginBottom: 2,
                }}
              >
                GitHub Gist Sync
              </Text>
              <Text style={{ fontSize: 12, color: colors.subText }}>
                Sync your encrypted vault
              </Text>
            </View>
          </View>

          <View style={{ gap: 8, marginBottom: 16 }}>
            {/* Access Token Input */}
            <View>
              <Text
                style={{
                  fontSize: 14,
                  fontWeight: "500",
                  color: colors.text,
                  marginBottom: 8,
                }}
              >
                Access Token
              </Text>
              <TextInput
                value={
                  hasToken
                    ? showToken
                      ? githubToken
                      : maskedToken
                    : githubToken
                }
                onChangeText={setGithubToken}
                placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                placeholderTextColor={colors.subText}
                secureTextEntry={hasToken ? !showToken : false}
                editable={!hasToken}
                style={{
                  backgroundColor: colors.card,
                  borderWidth: 0.6,
                  borderColor: colors.border,
                  borderRadius: 8,
                  padding: 12,
                  fontSize: 16,
                  color: colors.text,
                  fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
                }}
                autoCapitalize="none"
                autoCorrect={false}
              />
              {hasToken && (
                <TouchableOpacity
                  onPress={() => setShowToken(!showToken)}
                  style={{ alignSelf: "flex-end", marginTop: 4 }}
                >
                  <Text
                    style={{
                      color: colors.text,
                      fontSize: 12,
                      fontWeight: "500",
                    }}
                  >
                    {showToken ? "Hide" : "Show"}
                  </Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Gist ID Input */}
            <View>
              <Text
                style={{
                  fontSize: 14,
                  fontWeight: "500",
                  color: colors.text,
                  marginBottom: 8,
                }}
              >
                Gist ID
              </Text>
              <TextInput
                value={gistIdInput}
                onChangeText={setGistIdInput}
                placeholder="Optional"
                placeholderTextColor={colors.subText}
                style={{
                  backgroundColor: colors.card,
                  borderWidth: 0.6,
                  borderColor: colors.border,
                  borderRadius: 8,
                  padding: 12,
                  fontSize: 16,
                  color: colors.text,
                  fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
                }}
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>

            {/* Auto Sync Toggle */}
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
                height: 36,
              }}
            >
              <Text style={{ fontSize: 14, color: colors.text }}>
                Auto Sync
              </Text>
              <Switch
                value={autoRestoreEnabled}
                onValueChange={toggleAutoRestore}
                trackColor={{ false: "#cbced4", true: "#000000" }}
                thumbColor="#fff"
                ios_backgroundColor="#cbced4"
                disabled={!hasToken}
              />
            </View>

            {/* Save and Sync Buttons */}
            <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
              <TouchableOpacity
                onPress={saveToken}
                style={{
                  flex: 1,
                  backgroundColor: colors.primary,
                  height: 44,
                  borderRadius: 8,
                  justifyContent: "center",
                  alignItems: "center",
                }}
                disabled={isWorking}
              >
                {isWorking && status.includes("Validating") ? (
                  <ActivityIndicator color={colors.background} size="small" />
                ) : (
                  <Text
                    style={{
                      color: colors.background,
                      fontSize: 14,
                      fontWeight: "500",
                    }}
                  >
                    Save
                  </Text>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleSync}
                style={{
                  width: 66,
                  backgroundColor: colors.background,
                  borderWidth: 0.6,
                  borderColor: colors.border,
                  height: 44,
                  borderRadius: 8,
                  justifyContent: "center",
                  alignItems: "center",
                }}
                disabled={!hasToken || isWorking}
              >
                {isWorking &&
                (status.includes("Encrypting") ||
                  status.includes("Uploading") ||
                  status.includes("Creating")) ? (
                  <ActivityIndicator color={colors.text} size="small" />
                ) : (
                  <Text
                    style={{
                      color: colors.text,
                      fontSize: 14,
                      fontWeight: "500",
                    }}
                  >
                    Sync
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>

          {/* How to Create Token Guide */}
          {!hasToken && (
            <View
              style={{
                marginTop: 24,
                padding: 16,
                backgroundColor: colors.card,
                borderRadius: 8,
                borderWidth: 0.6,
                borderColor: colors.border,
              }}
            >
              <Text
                style={{
                  fontSize: 14,
                  fontWeight: "500",
                  color: colors.text,
                  marginBottom: 12,
                }}
              >
                How to Create a Token
              </Text>

              <View style={{ gap: 12 }}>
                <View>
                  <Text
                    style={{
                      fontSize: 13,
                      fontWeight: "500",
                      color: colors.text,
                      marginBottom: 4,
                    }}
                  >
                    1. Go to GitHub Settings
                  </Text>
                  <Text
                    style={{
                      fontSize: 12,
                      color: colors.subText,
                      lineHeight: 18,
                    }}
                  >
                    Visit github.com/settings/tokens
                  </Text>
                </View>

                <View>
                  <Text
                    style={{
                      fontSize: 13,
                      fontWeight: "500",
                      color: colors.text,
                      marginBottom: 4,
                    }}
                  >
                    2. Generate New Token
                  </Text>
                  <Text
                    style={{
                      fontSize: 12,
                      color: colors.subText,
                      lineHeight: 18,
                    }}
                  >
                    Click "Generate new token (classic)"
                  </Text>
                </View>

                <View>
                  <Text
                    style={{
                      fontSize: 13,
                      fontWeight: "500",
                      color: colors.text,
                      marginBottom: 4,
                    }}
                  >
                    3. Configure Token
                  </Text>
                  <Text
                    style={{
                      fontSize: 12,
                      color: colors.subText,
                      lineHeight: 18,
                    }}
                  >
                    • Name: "2FA App" or similar{"\n"}• Expiration: No
                    expiration (recommended){"\n"}• Scopes: Check "gist" for
                    backups, or leave all unchecked for encryption only
                  </Text>
                </View>

                <View>
                  <Text
                    style={{
                      fontSize: 13,
                      fontWeight: "500",
                      color: colors.text,
                      marginBottom: 4,
                    }}
                  >
                    4. Copy & Save
                  </Text>
                  <Text
                    style={{
                      fontSize: 12,
                      color: colors.subText,
                      lineHeight: 18,
                    }}
                  >
                    Copy the token (starts with ghp_) and paste it above. Save
                    it in a password manager as backup!
                  </Text>
                </View>
              </View>
            </View>
          )}
        </View>

        {/* Divider */}
        <View
          style={{
            height: 1,
            backgroundColor: colors.border,
            marginVertical: 32,
          }}
        />

        {/* Dark Mode Toggle */}
        <View style={{ paddingHorizontal: 24 }}>
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
              height: 36,
            }}
          >
            <Text style={{ fontSize: 14, color: colors.text }}>Dark Mode</Text>
            <TouchableOpacity
              onPress={() => setShowThemeOptions((prev) => !prev)}
              style={{
                flexDirection: "row",
                alignItems: "center",
                paddingHorizontal: 12,
                height: 32,
                borderRadius: 8,
                borderWidth: 0.6,
                borderColor: colors.border,
                backgroundColor: colors.background,
              }}
            >
              <Text
                style={{
                  fontSize: 14,
                  color: colors.text,
                  marginRight: 6,
                }}
              >
                {themeMode === "light"
                  ? "Light"
                  : themeMode === "dark"
                  ? "Dark"
                  : "System"}
              </Text>
              <Ionicons
                name={showThemeOptions ? "chevron-up" : "chevron-down"}
                size={14}
                color={colors.subText}
              />
            </TouchableOpacity>
          </View>

          {showThemeOptions && (
            <View
              style={{
                marginTop: 8,
                borderRadius: 8,
                borderWidth: 0.6,
                borderColor: colors.border,
                backgroundColor: colors.card,
                overflow: "hidden",
              }}
            >
              <TouchableOpacity
                onPress={() => {
                  setThemeMode("light");
                  setShowThemeOptions(false);
                }}
                style={{
                  paddingVertical: 10,
                  paddingHorizontal: 12,
                }}
              >
                <Text style={{ color: colors.text, fontSize: 14 }}>Light</Text>
              </TouchableOpacity>

              <View
                style={{
                  height: 1,
                  backgroundColor: colors.border,
                  opacity: 0.5,
                }}
              />

              <TouchableOpacity
                onPress={() => {
                  setThemeMode("dark");
                  setShowThemeOptions(false);
                }}
                style={{
                  paddingVertical: 10,
                  paddingHorizontal: 12,
                }}
              >
                <Text style={{ color: colors.text, fontSize: 14 }}>Dark</Text>
              </TouchableOpacity>

              <View
                style={{
                  height: 1,
                  backgroundColor: colors.border,
                  opacity: 0.5,
                }}
              />

              <TouchableOpacity
                onPress={() => {
                  setThemeMode("system");
                  setShowThemeOptions(false);
                }}
                style={{
                  paddingVertical: 10,
                  paddingHorizontal: 12,
                }}
              >
                <Text style={{ color: colors.text, fontSize: 14 }}>System</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Divider */}
        <View
          style={{
            height: 1,
            backgroundColor: colors.border,
            marginVertical: 32,
          }}
        />

        {/* Security Section */}
        <View style={{ paddingHorizontal: 24 }}>
          <Text
            style={{
              fontSize: 14,
              fontWeight: "500",
              color: colors.text,
              marginBottom: 16,
            }}
          >
            Security
          </Text>
          <View style={{ gap: 8 }}>
            {/* Setup/Change PIN */}
            {!hasPinConfigured ? (
              <TouchableOpacity
                onPress={handleChangePin}
                style={{
                  backgroundColor: colors.background,
                  borderWidth: 0.6,
                  borderColor: colors.border,
                  height: 44,
                  borderRadius: 8,
                  flexDirection: "row",
                  alignItems: "center",
                  paddingHorizontal: 12,
                }}
              >
                <Ionicons
                  name="lock-closed-outline"
                  size={16}
                  color={colors.text}
                />
                <Text
                  style={{
                    color: colors.text,
                    fontSize: 14,
                    fontWeight: "500",
                    marginLeft: 12,
                  }}
                >
                  Set Up PIN
                </Text>
              </TouchableOpacity>
            ) : (
              <>
                <TouchableOpacity
                  onPress={handleChangePin}
                  style={{
                    backgroundColor: colors.background,
                    borderWidth: 0.6,
                    borderColor: colors.border,
                    height: 44,
                    borderRadius: 8,
                    flexDirection: "row",
                    alignItems: "center",
                    paddingHorizontal: 12,
                  }}
                >
                  <Ionicons name="key-outline" size={16} color={colors.text} />
                  <Text
                    style={{
                      color: colors.text,
                      fontSize: 14,
                      fontWeight: "500",
                      marginLeft: 12,
                    }}
                  >
                    Change PIN
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={handleRemovePin}
                  style={{
                    backgroundColor: colors.background,
                    borderWidth: 0.6,
                    borderColor: colors.border,
                    height: 44,
                    borderRadius: 8,
                    flexDirection: "row",
                    alignItems: "center",
                    paddingHorizontal: 12,
                  }}
                >
                  <Ionicons
                    name="lock-open-outline"
                    size={16}
                    color={colors.danger}
                  />
                  <Text
                    style={{
                      color: colors.danger,
                      fontSize: 14,
                      fontWeight: "500",
                      marginLeft: 12,
                    }}
                  >
                    Remove PIN
                  </Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>

        {/* Divider */}
        <View
          style={{
            height: 1,
            backgroundColor: colors.border,
            marginVertical: 32,
          }}
        />

        {/* Data Management Section */}
        <View style={{ paddingHorizontal: 24 }}>
          <Text
            style={{
              fontSize: 14,
              fontWeight: "500",
              color: colors.text,
              marginBottom: 16,
            }}
          >
            Data Management
          </Text>
          <View style={{ gap: 8 }}>
            {/* Export Vault */}
            <TouchableOpacity
              onPress={exportAllAccounts}
              style={{
                backgroundColor: colors.background,
                borderWidth: 0.6,
                borderColor: colors.border,
                height: 44,
                borderRadius: 8,
                flexDirection: "row",
                alignItems: "center",
                paddingHorizontal: 12,
              }}
              disabled={!hasToken || isWorking}
            >
              <Ionicons name="download-outline" size={16} color={colors.text} />
              <Text
                style={{
                  color: colors.text,
                  fontSize: 14,
                  fontWeight: "500",
                  marginLeft: 12,
                  opacity: !hasToken || isWorking ? 0.5 : 1,
                }}
              >
                Export Vault
              </Text>
            </TouchableOpacity>

            {/* Import Vault */}
            <TouchableOpacity
              onPress={importFromLatestBackup}
              style={{
                backgroundColor: colors.background,
                borderWidth: 0.6,
                borderColor: colors.border,
                height: 44,
                borderRadius: 8,
                flexDirection: "row",
                alignItems: "center",
                paddingHorizontal: 12,
              }}
              disabled={!hasToken || isWorking}
            >
              <Ionicons
                name="cloud-upload-outline"
                size={16}
                color={colors.text}
              />
              <Text
                style={{
                  color: colors.text,
                  fontSize: 14,
                  fontWeight: "500",
                  marginLeft: 12,
                  opacity: !hasToken || isWorking ? 0.5 : 1,
                }}
              >
                Import Vault
              </Text>
            </TouchableOpacity>

            {/* Clear All Data */}
            <TouchableOpacity
              onPress={clearAllData}
              style={{
                backgroundColor: colors.background,
                borderWidth: 0.6,
                borderColor: colors.border,
                height: 44,
                borderRadius: 8,
                flexDirection: "row",
                alignItems: "center",
                paddingHorizontal: 12,
              }}
            >
              <Ionicons name="trash-outline" size={16} color={colors.danger} />
              <Text
                style={{
                  color: colors.danger,
                  fontSize: 14,
                  fontWeight: "500",
                  marginLeft: 12,
                }}
              >
                Clear All Data
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Footer with App Version */}
        <View style={{ alignItems: "center", marginTop: 32, marginBottom: 40 }}>
          <View
            style={{
              width: 48,
              height: 48,
              backgroundColor: colors.primary,
              borderRadius: 16,
              justifyContent: "center",
              alignItems: "center",
              marginBottom: 16,
            }}
          >
            <Ionicons
              name="shield-checkmark-outline"
              size={24}
              color={colors.background}
            />
          </View>
          <Text
            style={{ fontSize: 12, color: colors.subText, marginBottom: 4 }}
          >
            AuthFactory 2026
          </Text>
          <Text style={{ fontSize: 12, color: colors.subText }}>v1.0.0</Text>
        </View>

        {/* Status Display */}
        {status && !status.includes("Validating") && (
          <View
            style={{
              marginHorizontal: 24,
              marginBottom: 16,
              padding: 12,
              backgroundColor:
                status.includes("Failed") || status.includes("failed")
                  ? colors.danger
                  : colors.primary,
              borderRadius: 8,
            }}
          >
            <Text
              style={{
                color:
                  status.includes("Failed") || status.includes("failed")
                    ? colors.danger
                    : colors.primary,
                fontSize: 13,
                fontWeight: "500",
              }}
            >
              {status}
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}
