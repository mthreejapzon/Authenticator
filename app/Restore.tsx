import { Ionicons } from "@expo/vector-icons";
import * as SecureStore from "expo-secure-store";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { decryptWithMasterKey, getOrCreateMasterKey } from "./utils/crypto";

export default function Restore() {
  const [gistId, setGistId] = useState("");
  const [loading, setLoading] = useState(false);
  const [githubTokenExists, setGithubTokenExists] = useState(false);

  useEffect(() => {
    (async () => {
      const stored = await SecureStore.getItemAsync("github_token");
      setGithubTokenExists(!!stored);
    })();
  }, []);

  const extractGistId = (input: string) => {
    if (input.includes("gist.github.com")) {
      const parts = input.split("/");
      return parts[parts.length - 1].trim();
    }
    return input.trim();
  };

  const restoreBackup = async () => {
    try {
      setLoading(true);

      if (!gistId.trim()) {
        setLoading(false);
        Alert.alert("Error", "Please enter a valid Gist ID or URL.");
        return;
      }

      const token = await SecureStore.getItemAsync("github_token");
      if (!token) {
        setLoading(false);
        Alert.alert("No Token", "You must save a GitHub token in Settings before restoring.");
        return;
      }

      const finalGistId = extractGistId(gistId);

      // Fetch encrypted backup from gist
      const res = await fetch(`https://api.github.com/gists/${finalGistId}`, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
        },
      });

      if (!res.ok) {
        setLoading(false);
        Alert.alert("Error", `Failed to fetch gist (${res.status}). Check ID and token.`);
        return;
      }

      const gistData = await res.json();
      const file = gistData.files["authenticator_backup.enc"];

      if (!file || !file.content) {
        setLoading(false);
        Alert.alert("Error", "Invalid backup file. Expected 'authenticator_backup.enc'.");
        return;
      }

      const rawContent = file.content.trim();

      // 🔥 NEW: Support BOTH formats (old JSON wrapper and new raw cipher)
      let cipher: string;

      if (rawContent.startsWith("{")) {
        // OLD FORMAT: JSON wrapper
        console.log("Detected old JSON format backup");
        try {
          const parsed = JSON.parse(rawContent);
          cipher = parsed.cipher;
          
          if (!cipher) {
            setLoading(false);
            Alert.alert("Error", "Backup file is missing encrypted content.");
            return;
          }
        } catch (e) {
          setLoading(false);
          Alert.alert("Error", "Failed to parse backup JSON.");
          return;
        }
      } else if (rawContent.startsWith("v2:")) {
        // NEW FORMAT: Raw cipher string
        console.log("Detected new raw cipher format backup");
        cipher = rawContent;
      } else {
        setLoading(false);
        Alert.alert(
          "Error", 
          `Invalid backup format. File starts with: ${rawContent.substring(0, 20)}...`
        );
        return;
      }

      // Get master key and decrypt
      const masterKey = await getOrCreateMasterKey();
      
      console.log("Attempting to decrypt backup...");
      const plaintext = await decryptWithMasterKey(cipher, masterKey);

      // Parse decrypted content
      const payload = JSON.parse(plaintext);
      const accounts = payload.accounts ?? {};

      // Restore accounts AS-IS (passwords already encrypted)
      const keys = Object.keys(accounts);
      
      if (keys.length === 0) {
        setLoading(false);
        Alert.alert("Warning", "Backup contains no accounts.");
        return;
      }

      for (const k of keys) {
        await SecureStore.setItemAsync(k, JSON.stringify(accounts[k]));
      }

      // Update the account keys list
      await SecureStore.setItemAsync("userAccountKeys", JSON.stringify(keys));

      setLoading(false);
      Alert.alert("Success", `Restored ${keys.length} account(s) successfully!`);
      setGistId("");
    } catch (err: any) {
      console.error("Restore error:", err);
      setLoading(false);
      
      // More helpful error messages
      let errorMessage = "Restore failed. ";
      
      if (err.message?.includes("Decryption failed")) {
        errorMessage += "Wrong master key - this backup was created on a different device.";
      } else if (err.message?.includes("Unexpected token")) {
        errorMessage += "Decrypted data is not valid JSON.";
      } else {
        errorMessage += err.message || "Unknown error occurred.";
      }
      
      Alert.alert("Error", errorMessage);
    }
  };

  return (
    <ScrollView
      contentContainerStyle={{
        padding: 20,
        backgroundColor: "#f8f9fa",
        flexGrow: 1,
      }}
    >
      <Text style={{ fontSize: 22, fontWeight: "600", marginBottom: 14 }}>
        Restore Backup
      </Text>

      {/* GitHub Token Status */}
      {githubTokenExists ? (
        <View
          style={{
            padding: 14,
            backgroundColor: "#e8f5e9",
            borderRadius: 10,
            borderWidth: 1,
            borderColor: "#4caf50",
            marginBottom: 14,
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
          }}
        >
          <Ionicons name="checkmark-circle-outline" size={22} color="#2e7d32" />
          <Text style={{ color: "#2e7d32", fontWeight: "500" }}>
            GitHub token detected
          </Text>
        </View>
      ) : (
        <View
          style={{
            padding: 14,
            backgroundColor: "#ffebee",
            borderRadius: 10,
            borderWidth: 1,
            borderColor: "#d32f2f",
            marginBottom: 14,
          }}
        >
          <Text style={{ color: "#c62828", fontWeight: "500" }}>
            No GitHub token saved. Add one in Settings first.
          </Text>
        </View>
      )}

      {/* Info Box */}
      <View
        style={{
          padding: 14,
          backgroundColor: "#e3f2fd",
          borderRadius: 10,
          borderWidth: 1,
          borderColor: "#2196f3",
          marginBottom: 20,
        }}
      >
        <Text style={{ color: "#1565c0", fontSize: 14, lineHeight: 20 }}>
          💡 <Text style={{ fontWeight: "600" }}>Important:</Text> You can only restore backups on the SAME device where they were created. The master key is device-specific and cannot be transferred.
        </Text>
      </View>

      {/* Gist Input */}
      <Text style={{ fontSize: 16, marginBottom: 6, fontWeight: "500" }}>
        Gist ID or URL
      </Text>
      <TextInput
        placeholder="Example: a1b2c3d4e5f6 or https://gist.github.com/..."
        value={gistId}
        onChangeText={setGistId}
        autoCapitalize="none"
        autoCorrect={false}
        style={{
          backgroundColor: "#fff",
          padding: 12,
          borderRadius: 10,
          borderWidth: 1,
          borderColor: "#ccc",
          marginBottom: 20,
          fontSize: 15,
        }}
      />

      {/* Restore Button */}
      <TouchableOpacity
        onPress={restoreBackup}
        disabled={loading || !githubTokenExists}
        style={{
          backgroundColor: loading || !githubTokenExists ? "#9bbcf4" : "#0066FF",
          paddingVertical: 14,
          borderRadius: 10,
          alignItems: "center",
        }}
      >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={{ color: "#fff", fontSize: 16, fontWeight: "600" }}>
            Restore Backup
          </Text>
        )}
      </TouchableOpacity>

      {/* Warning */}
      <View
        style={{
          marginTop: 24,
          padding: 14,
          backgroundColor: "#fff3e0",
          borderRadius: 10,
          borderWidth: 1,
          borderColor: "#ff9800",
        }}
      >
        <Text style={{ color: "#e65100", fontSize: 13, lineHeight: 18 }}>
          ⚠️ <Text style={{ fontWeight: "600" }}>Warning:</Text> Restoring will replace all current accounts with the backup data. This action cannot be undone.
        </Text>
      </View>
    </ScrollView>
  );
}
