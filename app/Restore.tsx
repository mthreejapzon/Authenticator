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
import { decryptText } from "./utils/crypto"; // adjust path

export default function Restore() {
  const [gistId, setGistId] = useState("");
  const [loading, setLoading] = useState(false);
  const [patExists, setPatExists] = useState(false);

  useEffect(() => {
    (async () => {
      const stored = await SecureStore.getItemAsync("userPAT");
      setPatExists(!!stored);
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

      const pat = await SecureStore.getItemAsync("userPAT");
      if (!pat) {
        setLoading(false);
        Alert.alert("No PAT", "You must save a GitHub PAT before restoring.");
        return;
      }

      const finalGistId = extractGistId(gistId);

      // Fetch encrypted JSON from gist
      const res = await fetch(`https://api.github.com/gists/${finalGistId}`, {
        headers: {
          Authorization: `token ${pat}`,
        },
      });

      if (!res.ok) {
        setLoading(false);
        Alert.alert("Error", "Failed to fetch gist. Check ID and PAT.");
        return;
      }

      const json = await res.json();
      const fileName = Object.keys(json.files)[0];
      const rawContent = json.files[fileName]?.content;

      if (!rawContent) {
        setLoading(false);
        Alert.alert("Error", "Invalid backup file.");
        return;
      }

      const backup = JSON.parse(rawContent);
      const encryptedAccounts = backup.data || [];

      const restoredKeys: string[] = [];

      for (let acc of encryptedAccounts) {
        const decrypted = {
          accountName: await decryptText(acc.accountName),
          username: await decryptText(acc.username),
          password: await decryptText(acc.password),
          value: await decryptText(acc.value),
        };

        // Save back to SecureStore
        await SecureStore.setItemAsync(acc.key, JSON.stringify(decrypted));
        restoredKeys.push(acc.key);
      }

      // Replace key list
      await SecureStore.setItemAsync(
        "userAccountKeys",
        JSON.stringify(restoredKeys)
      );

      setLoading(false);
      Alert.alert("Success", "Backup restored successfully!");
    } catch (err) {
      console.error(err);
      setLoading(false);
      Alert.alert("Error", "Restore failed.");
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

      {/* PAT Status */}
      {patExists ? (
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
            PAT detected
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
            No PAT saved. Add one in Settings first.
          </Text>
        </View>
      )}

      {/* Gist Input */}
      <Text style={{ fontSize: 16, marginBottom: 6 }}>Gist ID or URL</Text>
      <TextInput
        placeholder="Example: a1b2c3d4e5f6 OR https://gist.github.com/...."
        value={gistId}
        onChangeText={setGistId}
        autoCapitalize="none"
        style={{
          backgroundColor: "#fff",
          padding: 12,
          borderRadius: 10,
          borderWidth: 1,
          borderColor: "#ccc",
          marginBottom: 20,
        }}
      />

      {/* Restore Button */}
      <TouchableOpacity
        onPress={restoreBackup}
        disabled={loading}
        style={{
          backgroundColor: loading ? "#9bbcf4" : "#0066FF",
          paddingVertical: 14,
          borderRadius: 10,
          alignItems: "center",
        }}
      >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={{ color: "#fff", fontSize: 16, fontWeight: "500" }}>
            Restore Backup
          </Text>
        )}
      </TouchableOpacity>
    </ScrollView>
  );
}
