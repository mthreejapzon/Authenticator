import { Link } from "expo-router";
import * as SecureStore from 'expo-secure-store';
import { useEffect, useState } from "react";
import { Text, TouchableOpacity, View } from "react-native";
import AccountList from "./components/AccountList";

export default function Index() {
  const [accountKeys, setAccountKeys] = useState<string[]>([]);
  const [accounts, setAccounts] = useState<{ key: string; data: { name: string; value: string } | null }[]>([]);

  // Load stored account keys
  useEffect(() => {
    SecureStore.getItemAsync('userAccountKeys').then((storedKeys) => {
      const keys = storedKeys ? JSON.parse(storedKeys) : [];
      setAccountKeys(keys);
    });
  }, []);

  // Load account details
  useEffect(() => {
    if (!accountKeys.length) {
      setAccounts([]);
      return;
    }

    const userAccounts = accountKeys.map(async (key) => {
      const accountData = await SecureStore.getItemAsync(key);
      return { key, data: accountData ? JSON.parse(accountData) : null };
    });

    Promise.all(userAccounts).then((results) => {
      setAccounts(results);
    });
  }, [accountKeys]);

  // Delete account
  const deleteAccount = async (key: string) => {
    try {
      await SecureStore.deleteItemAsync(key);

      const updatedKeys = accountKeys.filter((k) => k !== key);
      await SecureStore.setItemAsync('userAccountKeys', JSON.stringify(updatedKeys));

      setAccountKeys(updatedKeys);
      setAccounts((prev) => prev.filter((acc) => acc.key !== key));
    } catch (err) {
      console.error("Error deleting account:", err);
    }
  };

  // Edit account name
  const editAccount = async (key: string, newName: string) => {
    try {
      const storedData = await SecureStore.getItemAsync(key);
      if (!storedData) return;

      const parsed = JSON.parse(storedData);
      const updated = { ...parsed, name: newName };

      await SecureStore.setItemAsync(key, JSON.stringify(updated));

      // Update local state
      setAccounts((prev) =>
        prev.map((acc) =>
          acc.key === key ? { ...acc, data: updated } : acc
        )
      );
    } catch (err) {
      console.error("Error editing account:", err);
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

      {/* Accounts List */}
      {accounts.length ? (
        <AccountList
          accounts={accounts}
          onDelete={deleteAccount}
          onEdit={editAccount}
        />
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
