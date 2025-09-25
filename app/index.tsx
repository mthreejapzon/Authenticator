import { Link } from "expo-router";
import * as SecureStore from 'expo-secure-store';
import { useEffect, useState } from "react";
import { Text, TouchableOpacity, View } from "react-native";
import AccountList from "./components/AccountList";

export default function Index() {
  const [accountKeys, setAccountKeys] = useState<string[]>([]);
  const [accounts, setAccounts] = useState<{ key: string; data: { name: string; value: string } | null }[]>([]);

  useEffect(() => {
    SecureStore.getItemAsync('userAccountKeys').then((storedKeys) => {
      const keys = storedKeys ? JSON.parse(storedKeys) : [];
      setAccountKeys(keys);
    });
  }, []);

  useEffect(() => {
    if (!accountKeys.length) return;

    const userAccounts = accountKeys.map(async (key) => {
      const accountData = await SecureStore.getItemAsync(key);
      return { key, data: accountData ? JSON.parse(accountData) : null };
    });

    Promise.all(userAccounts).then((results) => {
      setAccounts(results);
    });
  }, [accountKeys]);

  const deleteAccount = async (key: string) => {
  try {
    // Remove from SecureStore
    await SecureStore.deleteItemAsync(key);

    // Update keys in SecureStore
    const updatedKeys = accountKeys.filter((k) => k !== key);
    await SecureStore.setItemAsync('userAccountKeys', JSON.stringify(updatedKeys));

    // Update local state
    setAccountKeys(updatedKeys);
    setAccounts(accounts.filter((acc) => acc.key !== key));
  } catch (err) {
    console.error("Error deleting account:", err);
  }
};

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: "#f8f9fa",
        padding: 20,
      }}
    >
      {/* Header */}
      <Text
        style={{
          fontSize: 24,
          fontWeight: "600",
          textAlign: "center",
          marginBottom: 20,
          color: "#333",
        }}
      >
        My 2FA Codes
      </Text>

      {/* Accounts */}
      {accounts.length ? (
        <AccountList accounts={accounts} onDelete={deleteAccount} />
      ) : (
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
          <Text style={{ fontSize: 16, color: "#666" }}>No accounts yet</Text>
        </View>
      )}

      {/* Add button */}
      <Link href="/setup" asChild>
        <TouchableOpacity
          style={{
            backgroundColor: "#007AFF",
            paddingVertical: 14,
            borderRadius: 12,
            marginTop: 20,
            alignItems: "center",
          }}
          activeOpacity={0.8}
        >
          <Text
            style={{
              color: "white",
              fontSize: 16,
              fontWeight: "500",
            }}
          >
            + Add Account
          </Text>
        </TouchableOpacity>
      </Link>
    </View>
  );
}
