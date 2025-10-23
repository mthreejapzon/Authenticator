import { Link, useFocusEffect } from "expo-router";
import * as SecureStore from "expo-secure-store";
import { useCallback, useState } from "react";
import { Text, TouchableOpacity, View } from "react-native";
import AccountList from "./components/AccountList";

export default function Index() {
  const [accountKeys, setAccountKeys] = useState<string[]>([]);
  const [accounts, setAccounts] = useState<
    {
      key: string;
      data: {
        accountName: string;
        username: string;
        password: string;
        value: string;
      } | null;
    }[]
  >([]);

  // 🔄 Load stored account keys and data
  const loadAccounts = useCallback(async () => {
    try {
      const storedKeys = await SecureStore.getItemAsync("userAccountKeys");
      const keys = storedKeys ? JSON.parse(storedKeys) : [];

      setAccountKeys(keys);

      const userAccounts = await Promise.all(
        keys.map(async (key: string) => {
          const accountData = await SecureStore.getItemAsync(key);
          return { key, data: accountData ? JSON.parse(accountData) : null };
        })
      );

      setAccounts(userAccounts);
    } catch (error) {
      console.error("Error loading accounts:", error);
    }
  }, []);

  // ✅ Automatically reload whenever this screen gains focus
  useFocusEffect(
    useCallback(() => {
      loadAccounts();
    }, [loadAccounts])
  );

  // 🗑 Delete account
  const deleteAccount = async (key: string) => {
    try {
      await SecureStore.deleteItemAsync(key);

      const updatedKeys = accountKeys.filter((k) => k !== key);
      await SecureStore.setItemAsync("userAccountKeys", JSON.stringify(updatedKeys));

      setAccountKeys(updatedKeys);
      setAccounts((prev) => prev.filter((acc) => acc.key !== key));
    } catch (err) {
      console.error("Error deleting account:", err);
    }
  };

  // ✏️ Edit account name
  const editAccount = async (key: string, newName: string) => {
    try {
      const storedData = await SecureStore.getItemAsync(key);
      if (!storedData) return;

      const parsed = JSON.parse(storedData);
      const updated = { ...parsed, accountName: newName };

      await SecureStore.setItemAsync(key, JSON.stringify(updated));
      setAccounts((prev) =>
        prev.map((acc) => (acc.key === key ? { ...acc, data: updated } : acc))
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
      {/* Accounts List */}
      {accounts.length ? (
        <AccountList accounts={accounts} onDelete={deleteAccount} onEdit={editAccount} />
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
          <Text style={{ color: "white", fontSize: 16, fontWeight: "500" }}>
            + Add Account
          </Text>
        </TouchableOpacity>
      </Link>
    </View>
  );
}
