import { Ionicons } from "@expo/vector-icons";
import { useNavigation, useRouter } from "expo-router";
import React, { useEffect, useLayoutEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Platform,
  ScrollView,
  StyleSheet,
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
import {
  BACKUP_GIST_ID_KEY,
  BACKUP_HISTORY_KEY,
  AUTO_LOCK_TIMEOUT_DEFAULT_MS,
  AUTO_LOCK_TIMEOUT_KEY,
  CLIPBOARD_CLEAR_DELAY_DEFAULT_MS,
  CLIPBOARD_CLEAR_DELAY_KEY,
  GITHUB_PAT_KEY as GITHUB_TOKEN_KEY,
  LAST_BACKUP_KEY,
  USER_ACCOUNT_KEYS,
} from "./utils/constants";
import { showAlert } from "./utils/alert";
import { parseBackupCipher } from "./utils/backupUtils";

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
  const [showPinSetup, setShowPinSetup] = useState(false);
  const [hasPinConfigured, setHasPinConfigured] = useState(false);
  const [isInitialSetup, setIsInitialSetup] = useState(false);
  const [showPinVerification, setShowPinVerification] = useState(false);
  const [isRemovingPin, setIsRemovingPin] = useState(false);
  const [showThemeOptions, setShowThemeOptions] = useState(false);
  const [isBiometricsSupportedByDevice, setIsBiometricsSupportedByDevice] = useState(false);
  const [biometricsEnabled, setBiometricsEnabled] = useState(false);
  const [biometricsName, setBiometricsName] = useState("Biometrics");
  const { themeMode, setThemeMode, colors } = useTheme();
  const [csvWorking, setCsvWorking] = useState(false);
  const [showImportOptions, setShowImportOptions] = useState(false);
  /**
   * Clipboard auto-clear delay in ms.
   * 0 = disabled. Defaults to CLIPBOARD_CLEAR_DELAY_DEFAULT_MS on first run.
   */
  const [clipboardClearDelay, setClipboardClearDelay] = useState<number>(CLIPBOARD_CLEAR_DELAY_DEFAULT_MS);
  /**
   * Auto-lock timeout in ms.
   * Number.MAX_SAFE_INTEGER = Never. Defaults to AUTO_LOCK_TIMEOUT_DEFAULT_MS.
   */
  const [autoLockTimeout, setAutoLockTimeout] = useState<number>(AUTO_LOCK_TIMEOUT_DEFAULT_MS);

  // Hide default header and use custom header
  useLayoutEffect(() => {
    navigation.setOptions({
      headerShown: false,
    });
  }, [navigation]);

  // Check if PIN and biometrics are configured
  useEffect(() => {
    (async () => {
      const pinExists = await hasPin();
      setHasPinConfigured(pinExists);

      const { isBiometricsSupported, isBiometricsEnabled, getSupportedBiometryNames } =
        await import("./utils/biometrics");
      const supported = await isBiometricsSupported();
      setIsBiometricsSupportedByDevice(supported);
      if (supported) {
        const enabled = await isBiometricsEnabled();
        setBiometricsEnabled(enabled);
        const names = await getSupportedBiometryNames();
        if (names.length > 0) {
          setBiometricsName(names[0]);
        }
      }
    })();
  }, []);

  // Load clipboard auto-clear delay
  useEffect(() => {
    (async () => {
      try {
        const raw = await Storage.getItemAsync(CLIPBOARD_CLEAR_DELAY_KEY);
        if (raw !== null) {
          const parsed = parseInt(raw, 10);
          setClipboardClearDelay(isNaN(parsed) ? CLIPBOARD_CLEAR_DELAY_DEFAULT_MS : parsed);
        }
      } catch (err) {
        console.error("Failed to load clipboard clear delay:", err);
      }
    })();
  }, []);

  // Load auto-lock timeout
  useEffect(() => {
    (async () => {
      try {
        const raw = await Storage.getItemAsync(AUTO_LOCK_TIMEOUT_KEY);
        if (raw !== null) {
          const parsed = parseInt(raw, 10);
          setAutoLockTimeout(isNaN(parsed) ? AUTO_LOCK_TIMEOUT_DEFAULT_MS : parsed);
        }
      } catch (err) {
        console.error("Failed to load auto-lock timeout:", err);
      }
    })();
  }, []);

  /** Persist the user's chosen auto-lock timeout. */
  const handleAutoLockTimeoutChange = async (ms: number) => {
    setAutoLockTimeout(ms);
    try {
      const { setAutoLockTimeout: persistTimeout } = await import("./utils/pinSecurity");
      await persistTimeout(ms);
    } catch (err) {
      console.error("Failed to save auto-lock timeout:", err);
    }
  };

  /** Persist the user's chosen clipboard auto-clear delay. */
  const handleClipboardClearDelayChange = async (delayMs: number) => {
    setClipboardClearDelay(delayMs);
    try {
      await Storage.setItemAsync(CLIPBOARD_CLEAR_DELAY_KEY, String(delayMs));
    } catch (err) {
      console.error("Failed to save clipboard clear delay:", err);
    }
  };

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

      showAlert("Auto Sync", msg);
    } catch (err) {
      console.error("Failed to toggle auto-restore:", err);

      // rollback on failure
      setAutoRestoreEnabled(!enabled);
    }
  };

  const handleToggleBiometrics = async (value: boolean) => {
    if (!hasPinConfigured) {
      Alert.alert("PIN Required", "You must configure a Security PIN before enabling biometric unlock.");
      return;
    }

    try {
      const { setBiometricsEnabled: saveBiometrics, authenticateWithBiometrics } =
        await import("./utils/biometrics");

      if (value) {
        const success = await authenticateWithBiometrics(`Confirm enabling ${biometricsName}`);
        if (success) {
          await saveBiometrics(true);
          setBiometricsEnabled(true);
        } else {
          setBiometricsEnabled(false);
        }
      } else {
        await saveBiometrics(false);
        setBiometricsEnabled(false);
      }
    } catch (err) {
      console.error("Failed to toggle biometrics:", err);
      setBiometricsEnabled(!value);
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
        showAlert("Missing token", msg);
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

        showAlert("Invalid Token", msg);
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

      showAlert("Token Validated", successMsg);

      // Proceed with saving
      await performTokenSave(trimmedToken);
    } catch (err) {
      console.error("Token save error:", err);
      setIsWorking(false);
      setStatus("Validation failed");

      const msg =
        err instanceof Error ? err.message : "Could not validate token.";
      showAlert("Validation failed", msg);
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
            const keysString = await Storage.getItemAsync(USER_ACCOUNT_KEYS);
            const keys = keysString ? JSON.parse(keysString) : [];
            const count = keys.length || 0;
            setStatus(`Restored ${count} account(s) successfully!`);

            const successMsg = `Successfully restored ${count} account(s) from backup!`;
            showAlert("Restore Complete", successMsg);
          } else {
            throw new Error("Failed to fetch backup content");
          }
        } else {
          setStatus("Token saved. Auto-sync enabled.");

          const msg = "GitHub token saved. Auto-sync is now enabled.";
          showAlert("Saved", msg);
        }
      } else {
        setStatus("Token saved. Auto-sync enabled.");

        const msg =
          "GitHub token saved. Auto-sync is now enabled. Your accounts will be automatically backed up.";
        showAlert("Saved", msg);
      }
    } catch (err) {
      console.error("Auto-restore check failed:", err);
      setStatus("Token saved (auto-restore failed)");

      const msg =
        "Token saved, but couldn't check for existing backups. You can manually restore from the Restore screen.";
      showAlert("Saved", msg);
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
      showAlert("Success", msg);

      // Continue with auto-restore flow
      const token = await Storage.getItemAsync(GITHUB_TOKEN_KEY);
      if (token) {
        await continueWithAutoRestore(token);
      }

      setIsInitialSetup(false); // Reset flag
    } else {
      // Just changing PIN - no auto-restore
      const msg = "Security PIN changed successfully!";
      showAlert("Success", msg);
    }
  };

  // Handler for skipping PIN setup
  const handleSkipPinSetup = async () => {
    setShowPinSetup(false);

    // Only proceed with auto-restore if this was initial setup
    if (isInitialSetup) {
      const msg = "You can set up a PIN later in Settings for added security.";
      showAlert("PIN Skipped", msg);

      // Continue with auto-restore flow
      const token = await Storage.getItemAsync(GITHUB_TOKEN_KEY);
      if (token) {
        await continueWithAutoRestore(token);
      }

      setIsInitialSetup(false); // Reset flag
    } else {
      // Just canceling PIN change - no message needed
      const msg = "PIN change canceled.";
      showAlert("Canceled", msg);
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

      // Delete PIN and Biometric data
      try {
        // Force remove PIN without verification since we're clearing everything
        await Storage.deleteItemAsync("security_pin_hash");
        await Storage.deleteItemAsync("security_pin_salt");
        await Storage.deleteItemAsync("app_locked");
        await Storage.deleteItemAsync("failed_pin_attempts");
        await Storage.deleteItemAsync("lockout_until");
        await Storage.deleteItemAsync("use_biometrics");
        setBiometricsEnabled(false);
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
      showAlert("Cleared", msg);

      // Navigate back to home
      router.replace("/");
    } catch (err: any) {
      console.error("❌ Clear all data failed:", err);
      const msg = err.message || "Could not clear all data.";
      showAlert("Clear failed", msg);
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
      await Storage.deleteItemAsync("use_biometrics");

      setHasPinConfigured(false);
      setBiometricsEnabled(false);

      const msg = "Security PIN removed successfully.";
      showAlert("Success", msg);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to remove PIN";
      showAlert("Error", msg);
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
        showAlert("Nothing to export", msg);
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
        showAlert("Backup failed", msg);
        setIsWorking(false);
        setStatus("Failed: crypto unavailable");
        return;
      }

      setStatus("Encrypting backup...");
      const cipher = await encryptWithMasterKey(jsonText, masterKey);
      const exportedAt = new Date().toISOString();

      if (!hasToken) {
        const msg = "Please save your GitHub token first.";
        showAlert("Missing token", msg);
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
      showAlert(isUpdate ? "Updated" : "Created", msg);
    } catch (err: any) {
      console.error("❌ Export failed:", err);
      const msg = err.message || String(err);
      showAlert("Backup failed", msg);
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
        showAlert("Missing token", msg);
        setIsWorking(false);
        return;
      }

      const token = await Storage.getItemAsync(GITHUB_TOKEN_KEY);
      if (!token) {
        const msg = "GitHub token not found.";
        showAlert("Missing token", msg);
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
        showAlert("No backups found", msg);
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

      const cipher = parseBackupCipher(rawContent);

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
      showAlert("Restore complete", msg);
    } catch (err: any) {
      console.error("Restore error:", err);
      const msg = err.message || String(err);
      showAlert("Restore failed", msg);
      setStatus("Restore failed");
    } finally {
      setIsWorking(false);
    }
  };

  const handleExportCSV = async () => {
    setCsvWorking(true);
    const { exportAccountsToCSV } = await import("./utils/csvUtils");
    const result = await exportAccountsToCSV();
    setCsvWorking(false);
    if (!result.success) Alert.alert("Export Failed", result.message);
  };

  const handleImportCSV = async (mode: "merge" | "overwrite") => {
    setShowImportOptions(false);
    setCsvWorking(true);
    const { importAccountsFromCSV } = await import("./utils/csvUtils");
    const result = await importAccountsFromCSV(mode);
    setCsvWorking(false);

    if (!result.success) {
      Alert.alert("Import Failed", result.message);
      return;
    }

    let message = result.message;
    if (result.validation?.warnings.length) {
      message += `\n\nWarnings:\n${result.validation.warnings.join("\n")}`;
    }
    Alert.alert("Import Complete", message);
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
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: colors.border,
          paddingTop: insets.top,
          minHeight: 72,
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
            {isBiometricsSupportedByDevice && (
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "center",
                  height: 44,
                  backgroundColor: colors.background,
                  borderWidth: 0.6,
                  borderColor: colors.border,
                  borderRadius: 8,
                  paddingHorizontal: 12,
                  marginBottom: 8,
                }}
              >
                <View style={{ flexDirection: "row", alignItems: "center" }}>
                  <Ionicons
                    name={biometricsName.includes("Face") ? "scan-outline" : "finger-print-outline"}
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
                    Unlock with {biometricsName}
                  </Text>
                </View>
                <Switch
                  value={biometricsEnabled}
                  onValueChange={handleToggleBiometrics}
                  trackColor={{ false: "#cbced4", true: colors.primary }}
                  thumbColor="#fff"
                  ios_backgroundColor="#cbced4"
                />
              </View>
            )}
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

        {/* Divider (security → clipboard) */}
        <View style={{ height: 1, backgroundColor: colors.border, marginVertical: 16 }} />

        {/* Clipboard Auto-Clear */}
        <View style={{ paddingHorizontal: 24, paddingBottom: 16 }}>
          <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 10, gap: 8 }}>
            <Ionicons name="clipboard-outline" size={16} color={colors.text} />
            <Text style={{ fontSize: 14, fontWeight: "500", color: colors.text }}>
              Clear clipboard after copy
            </Text>
          </View>
          <Text style={{ fontSize: 12, color: colors.subText, marginBottom: 12, lineHeight: 17 }}>
            Automatically overwrites the clipboard after you copy a password or OTP code.
          </Text>
          {/* Segmented delay picker */}
          <View style={{ flexDirection: "row", gap: 8 }}>
            {([
              { label: "Off", value: 0 },
              { label: "30s", value: 30_000 },
              { label: "60s", value: 60_000 },
              { label: "2 min", value: 120_000 },
            ] as { label: string; value: number }[]).map(({ label, value }) => {
              const active = clipboardClearDelay === value;
              return (
                <TouchableOpacity
                  key={label}
                  onPress={() => handleClipboardClearDelayChange(value)}
                  style={{
                    flex: 1,
                    height: 36,
                    borderRadius: 8,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: active ? colors.primary : colors.background,
                    borderWidth: 0.6,
                    borderColor: active ? colors.primary : colors.border,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 13,
                      fontWeight: "600",
                      color: active ? colors.background : colors.subText,
                    }}
                  >
                    {label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Divider (clipboard → auto-lock) */}
        <View style={{ height: 1, backgroundColor: colors.border, marginVertical: 16 }} />

        {/* Auto-Lock Timeout */}
        <View style={{ paddingHorizontal: 24, paddingBottom: 16 }}>
          <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 10, gap: 8 }}>
            <Ionicons name="timer-outline" size={16} color={colors.text} />
            <Text style={{ fontSize: 14, fontWeight: "500", color: colors.text }}>
              Auto-lock timeout
            </Text>
          </View>
          <Text style={{ fontSize: 12, color: colors.subText, marginBottom: 12, lineHeight: 17 }}>
            Lock the app automatically after it has been in the background for this long.
          </Text>
          {/* Segmented timeout picker */}
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {([
              { label: "Immediately", value: 0 },
              { label: "1 min",  value: 60_000 },
              { label: "5 min",  value: 300_000 },
              { label: "15 min", value: 900_000 },
              { label: "Never",  value: Number.MAX_SAFE_INTEGER },
            ] as { label: string; value: number }[]).map(({ label, value }) => {
              const active = autoLockTimeout === value;
              return (
                <TouchableOpacity
                  key={label}
                  onPress={() => hasPinConfigured && handleAutoLockTimeoutChange(value)}
                  style={{
                    paddingHorizontal: 14,
                    height: 36,
                    borderRadius: 8,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: active ? colors.primary : colors.background,
                    borderWidth: 0.6,
                    borderColor: active ? colors.primary : colors.border,
                    opacity: hasPinConfigured ? 1 : 0.4,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 13,
                      fontWeight: "600",
                      color: active ? colors.background : colors.subText,
                    }}
                  >
                    {label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
          {!hasPinConfigured && (
            <Text style={{ fontSize: 11, color: colors.subText, marginTop: 8 }}>
              Set up a PIN first to enable auto-lock.
            </Text>
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
            {/* BackUp Vault */}
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
                Backup Vault
              </Text>
            </TouchableOpacity>

            {/* Restore Vault */}
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
                Restore Vault
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

            <Text
              style={{
                marginTop: 32,
                fontSize: 14,
                fontWeight: "500",
                color: colors.text,
                marginBottom: 16,
              }}
            >
              CSV Import/Export
            </Text>

            {/* Export CSV */}
            <TouchableOpacity
              onPress={handleExportCSV}
              disabled={csvWorking}
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
                name="document-text-outline"
                size={16}
                color={colors.text}
              />
              <Text
                style={{
                  color: colors.text,
                  fontSize: 14,
                  fontWeight: "500",
                  marginLeft: 12,
                  opacity: csvWorking ? 0.5 : 1,
                }}
              >
                Export as CSV
              </Text>
            </TouchableOpacity>

            {/* Import CSV */}
            <TouchableOpacity
              onPress={() => setShowImportOptions(true)}
              disabled={csvWorking}
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
                name="document-attach-outline"
                size={16}
                color={colors.text}
              />
              <Text
                style={{
                  color: colors.text,
                  fontSize: 14,
                  fontWeight: "500",
                  marginLeft: 12,
                  opacity: csvWorking ? 0.5 : 1,
                }}
              >
                Import from CSV
              </Text>
            </TouchableOpacity>

            {/* Import Mode Picker */}
            {showImportOptions && (
              <View
                style={{
                  borderRadius: 8,
                  borderWidth: 0.6,
                  borderColor: colors.border,
                  backgroundColor: colors.card,
                  overflow: "hidden",
                }}
              >
                <Text
                  style={{
                    fontSize: 12,
                    color: colors.subText,
                    padding: 12,
                    paddingBottom: 8,
                  }}
                >
                  How should existing accounts be handled?
                </Text>
                <TouchableOpacity
                  onPress={() => handleImportCSV("merge")}
                  style={{ paddingVertical: 10, paddingHorizontal: 12 }}
                >
                  <Text
                    style={{
                      color: colors.text,
                      fontSize: 14,
                      fontWeight: "500",
                    }}
                  >
                    Merge — Add to existing
                  </Text>
                  <Text
                    style={{
                      color: colors.subText,
                      fontSize: 12,
                      marginTop: 2,
                    }}
                  >
                    Keep current accounts and add new ones
                  </Text>
                </TouchableOpacity>
                <View
                  style={{
                    height: 1,
                    backgroundColor: colors.border,
                    opacity: 0.5,
                  }}
                />
                <TouchableOpacity
                  onPress={() => handleImportCSV("overwrite")}
                  style={{ paddingVertical: 10, paddingHorizontal: 12 }}
                >
                  <Text
                    style={{
                      color: colors.danger,
                      fontSize: 14,
                      fontWeight: "500",
                    }}
                  >
                    Overwrite — Replace all
                  </Text>
                  <Text
                    style={{
                      color: colors.subText,
                      fontSize: 12,
                      marginTop: 2,
                    }}
                  >
                    Delete all current accounts and import fresh
                  </Text>
                </TouchableOpacity>
                <View
                  style={{
                    height: 1,
                    backgroundColor: colors.border,
                    opacity: 0.5,
                  }}
                />
                <TouchableOpacity
                  onPress={() => setShowImportOptions(false)}
                  style={{ paddingVertical: 10, paddingHorizontal: 12 }}
                >
                  <Text style={{ color: colors.subText, fontSize: 14 }}>
                    Cancel
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>

        {/* Footer with App Version */}
        <View style={{ alignItems: "center", marginTop: 32, marginBottom: 40 }}>
          <Image
            source={
              themeMode === "dark"
                ? require("../assets/images/appstore.png")
                : require("../assets/images/invert-icon.png")
            }
            style={{
              width: 48,
              height: 48,
              borderRadius: 16,
              marginBottom: 16,
            }}
          />
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
