import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import {
  decryptWithMasterKey,
  getOrCreateMasterKey,
} from "./utils/crypto";
import { Storage } from "./utils/storage";
import { GITHUB_PAT_KEY, USER_ACCOUNT_KEYS } from "./utils/constants";
import { parseBackupCipher } from "./utils/backupUtils";
import { useTheme } from "./context/ThemeContext";

/**
 * Restore screen:
 * - If user enters a Gist ID / URL it will use that.
 * - If no Gist ID is entered, the app will automatically search the authenticated user's gists
 *   (using the saved PAT) and pick the most recently updated gist containing 'authenticator_backup.enc'.
 */

export default function Restore() {
  const { colors } = useTheme();
  const [gistId, setGistId] = useState("");
  const [loading, setLoading] = useState(false);
  const [githubTokenExists, setGithubTokenExists] = useState(false);

  useEffect(() => {
    (async () => {
      const stored = await Storage.getItemAsync(GITHUB_PAT_KEY);
      setGithubTokenExists(!!stored);
    })();
  }, []);

  const extractGistId = (input: string) => {
    if (!input) return "";
    if (input.includes("gist.github.com")) {
      const parts = input.split("/");
      return parts[parts.length - 1].trim();
    }
    return input.trim();
  };

  /**
   * Find the latest gist ID that contains the backup file.
   * Returns gist ID string or null if none found.
   */
  const findLatestBackupGist = async (token: string): Promise<string | null> => {
    // Fetch user's gists (first page). This should usually be enough.
    const res = await fetch(`https://api.github.com/gists`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
      },
    });

    if (!res.ok) {
      // Pass details up for better error reporting
      const errText = await res.text().catch(() => "");
      throw new Error(`GitHub API error: ${res.status} ${errText}`);
    }

    const gists = await res.json();
    if (!Array.isArray(gists) || gists.length === 0) return null;

    // Find the newest gist containing authenticator_backup.enc
    let latest: any = null;
    for (const g of gists) {
      if (!g.files) continue;
      if (g.files["authenticator_backup.enc"]) {
        if (!latest) latest = g;
        else {
          const a = new Date(g.updated_at || g.created_at || 0);
          const b = new Date(latest.updated_at || latest.created_at || 0);
          if (a > b) latest = g;
        }
      }
    }

    return latest ? latest.id : null;
  };

  const fetchBackupFromGist = async (token: string, id: string) => {
    const res = await fetch(`https://api.github.com/gists/${id}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
      },
    });

    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      throw new Error(`Failed to fetch gist (${res.status}): ${txt}`);
    }

    const gistData = await res.json();

    // File name expected: authenticator_backup.enc
    const file = gistData.files?.["authenticator_backup.enc"];
    if (!file || typeof file.content !== "string") {
      throw new Error(
        "Backup not found in gist. Expected file 'authenticator_backup.enc'."
      );
    }

    // Gist file.content is plain text (not base64) — this is the exact text you saved.
    return file.content.trim();
  };

  const restoreBackup = async () => {
    try {
      setLoading(true);

      const token = await Storage.getItemAsync(GITHUB_PAT_KEY);
      if (!token) {
        setLoading(false);
        Alert.alert("No Token", "You must save a GitHub token in Settings before restoring.");
        return;
      }

      // Determine gist id: either user provided or auto-detect
      // Allow null when auto-detecting
      let finalGistId: string | null = extractGistId(gistId) || null;

      if (!finalGistId) {
        // Auto-detect the latest backup gist using PAT
        try {
          finalGistId = await findLatestBackupGist(token);
        } catch (err: any) {
          setLoading(false);
          Alert.alert("GitHub Error", err.message || "Failed to query gists.");
          return;
        }
      }

      if (!finalGistId) {
        setLoading(false);
        Alert.alert(
          "Not found",
          "No backup gist containing 'authenticator_backup.enc' was found for this token."
        );
        return;
      }

      // Fetch the backup content from the chosen gist
      let rawContent: string;
      try {
        rawContent = await fetchBackupFromGist(token, finalGistId);
      } catch (err: any) {
        setLoading(false);
        Alert.alert("Error", err.message || "Failed to fetch backup gist.");
        return;
      }

      let cipher: string;
      try {
        cipher = parseBackupCipher(rawContent);
      } catch (err) {
        setLoading(false);
        Alert.alert("Error", err instanceof Error ? err.message : "Invalid backup format.");
        return;
      }

      // Decrypt using master key (device-specific)
      try {
        // IMPORTANT: This will use the device's master key stored in SecureStore.
        // If the backup was created on another device with a different master key,
        // decryption will fail.
        const masterKey = await getOrCreateMasterKey();
        const plaintext = await decryptWithMasterKey(cipher, masterKey);

        // Parse decrypted JSON
        const payload = JSON.parse(plaintext);
        const accounts = payload.accounts ?? {};

        const keys = Object.keys(accounts);
        if (keys.length === 0) {
          setLoading(false);
          Alert.alert("Warning", "Backup contains no accounts.");
          return;
        }

        // Restore accounts
        for (const k of keys) {
          await Storage.setItemAsync(k, JSON.stringify(accounts[k]));
        }

        // Update account key list
        await Storage.setItemAsync(USER_ACCOUNT_KEYS, JSON.stringify(keys));

        setLoading(false);
        Alert.alert("Success", `Restored ${keys.length} account(s) successfully!`);
        setGistId("");
      } catch (err: any) {
        setLoading(false);

        // Friendly guidance when master key mismatch occurs
        const msg = (err && err.message) || String(err);
        if (msg.includes("Decryption failed") || msg.includes("wrong master key")) {
          Alert.alert(
            "Decryption failed",
            "Unable to decrypt the backup. This backup was likely created with a different device's master key."
          );
        } else if (msg.includes("Unexpected token")) {
          Alert.alert("Error", "Decrypted data is not valid JSON.");
        } else {
          Alert.alert("Restore failed", msg || "Unknown error occurred during restore.");
        }
      }
    } catch (topErr: any) {
      console.error("Unexpected restore error:", topErr);
      setLoading(false);
      Alert.alert("Error", topErr.message || "An unexpected error occurred.");
    }
  };

  return (
    <ScrollView
      contentContainerStyle={{
        padding: 20,
        backgroundColor: colors.background,
        flexGrow: 1,
      }}
    >
      <Text
        style={{
          fontSize: 22,
          fontWeight: "600",
          marginBottom: 14,
          color: colors.text,
        }}
      >
        Restore Backup
      </Text>

      {/* GitHub Token Status */}
      {githubTokenExists ? (
        <View
          style={{
            padding: 14,
            backgroundColor: colors.successBg,
            borderRadius: 10,
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: colors.success,
            marginBottom: 14,
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
          }}
        >
          <Ionicons
            name="checkmark-circle-outline"
            size={22}
            color={colors.success}
          />
          <Text
            style={{
              color: colors.success,
              fontWeight: "500",
            }}
          >
            GitHub token detected
          </Text>
        </View>
      ) : (
        <View
          style={{
            padding: 14,
            backgroundColor: colors.dangerBg,
            borderRadius: 10,
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: colors.danger,
            marginBottom: 14,
          }}
        >
          <Text style={{ color: colors.danger, fontWeight: "500" }}>
            No GitHub token saved. Add one in Settings first.
          </Text>
        </View>
      )}

      {/* Info Box */}
      <View
        style={{
          padding: 14,
          backgroundColor: colors.infoBg,
          borderRadius: 10,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: colors.primary,
          marginBottom: 20,
        }}
      >
        <Text
          style={{ color: colors.primary, fontSize: 14, lineHeight: 20 }}
        >
          {'💡 '}
          <Text style={{ fontWeight: "600" }}>Important:</Text>
          {' You can only restore backups on the SAME device where they were created. The master key is device-specific and cannot be transferred.'}
        </Text>
      </View>

      {/* Gist Input */}
      <Text
        style={{
          fontSize: 16,
          marginBottom: 6,
          fontWeight: "500",
          color: colors.text,
        }}
      >
        Gist ID or URL (optional)
      </Text>
      <TextInput
        placeholder="Leave empty to auto-find using your PAT"
        placeholderTextColor={colors.subText}
        value={gistId}
        onChangeText={setGistId}
        autoCapitalize="none"
        autoCorrect={false}
        style={{
          backgroundColor: colors.input,
          color: colors.text,
          padding: 12,
          borderRadius: 10,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: colors.inputBorder,
          marginBottom: 20,
          fontSize: 15,
        }}
      />

      {/* Restore Button */}
      <TouchableOpacity
        onPress={restoreBackup}
        disabled={loading || !githubTokenExists}
        style={{
          backgroundColor:
            loading || !githubTokenExists ? colors.border : colors.primary,
          paddingVertical: 14,
          borderRadius: 10,
          alignItems: "center",
        }}
      >
        {loading ? (
          <ActivityIndicator color={colors.background} />
        ) : (
          <Text
            style={{
              color: colors.background,
              fontSize: 16,
              fontWeight: "600",
            }}
          >
            Restore Backup
          </Text>
        )}
      </TouchableOpacity>

      {/* Warning */}
      <View
        style={{
          marginTop: 24,
          padding: 14,
          backgroundColor: colors.warningBg,
          borderRadius: 10,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: colors.warning,
        }}
      >
        <Text
          style={{
            color: colors.warning,
            fontSize: 13,
            lineHeight: 18,
          }}
        >
          {'⚠️ '}
          <Text style={{ fontWeight: "600" }}>Warning:</Text>
          {' Restoring will replace all current accounts with the backup data. This action cannot be undone.'}
        </Text>
      </View>
    </ScrollView>
  );
}
