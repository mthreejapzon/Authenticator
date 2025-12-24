import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { Link, useFocusEffect, useRouter } from "expo-router";
import { useCallback, useLayoutEffect, useState } from "react";
import { Pressable, Text, TouchableOpacity, View } from "react-native";
import AccountList from "./components/AccountList";
import { Storage } from "./utils/storage";

export default function Index() {
  const navigation = useNavigation();
  const router = useRouter();

  // ⭐ Add header with Settings button
  useLayoutEffect(() => {
    navigation.setOptions({
      title: "Authenticator",
      headerRight: () => (
        <Pressable
          onPress={() => router.push("/settings")}
          style={{ paddingHorizontal: 12 }}
        >
          <Ionicons name="settings-outline" size={24} />
        </Pressable>
      ),
    });
  }, [navigation]);

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

  const loadAccounts = useCallback(async () => {
    try {
      const storedKeys = await Storage.getItemAsync("userAccountKeys");
      const keys = storedKeys ? JSON.parse(storedKeys) : [];

      setAccountKeys(keys);

      const userAccounts = await Promise.all(
        keys.map(async (key: string) => {
          const accountData = await Storage.getItemAsync(key);
          return { key, data: accountData ? JSON.parse(accountData) : null };
        })
      );

      setAccounts(userAccounts);
    } catch (error) {
      console.error("Error loading accounts:", error);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadAccounts();
    }, [loadAccounts])
  );

  const deleteAccount = async (key: string) => {
  try {
    await Storage.deleteItemAsync(key);

    const updatedKeys = accountKeys.filter((k) => k !== key);
    await Storage.setItemAsync(
      "userAccountKeys",
      JSON.stringify(updatedKeys)
    );

    setAccountKeys(updatedKeys);
    setAccounts((prev) => prev.filter((acc) => acc.key !== key));

    // Trigger auto-backup after deletion
    const { triggerAutoBackup } = await import("./utils/backupUtils");
    triggerAutoBackup().catch(err => {
      console.error("Auto-backup after delete failed:", err);
    });
  } catch (err) {
    console.error("Error deleting account:", err);
  }
};

  const editAccount = async (key: string, newName: string) => {
    try {
      const storedData = await Storage.getItemAsync(key);
      if (!storedData) return;

      const parsed = JSON.parse(storedData);
      const updated = { ...parsed, accountName: newName };

      await Storage.setItemAsync(key, JSON.stringify(updated));
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
