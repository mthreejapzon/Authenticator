import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { Link, useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import {
  ActivityIndicator,
  AppState,
  Pressable,
  Text,
  TouchableOpacity,
  View
} from "react-native";
import AccountList from "./components/AccountList";
import { Storage } from "./utils/storage";

export default function Index() {
  const navigation = useNavigation();
  const router = useRouter();

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
  const [isSyncing, setIsSyncing] = useState(false);

  // Header with Settings button
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

  // Subscribe to sync state changes
  useEffect(() => {
    let unsubscribe: (() => void) | null = null;

    (async () => {
      try {
        const { onSyncStateChange, isSyncing: getCurrentSyncState } = await import("./utils/backupUtils");
        
        // Set initial state
        setIsSyncing(getCurrentSyncState());
        
        // Subscribe to changes
        unsubscribe = onSyncStateChange((syncing) => {
          setIsSyncing(syncing);
          
          // Reload accounts after sync completes
          if (!syncing) {
            loadAccounts();
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

  // Load accounts when screen is focused
  useFocusEffect(
    useCallback(() => {
      loadAccounts();
    }, [loadAccounts])
  );

  // Refresh accounts when app comes to foreground
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      if (nextAppState === 'active') {
        loadAccounts();
      }
    });

    return () => {
      subscription.remove();
    };
  }, [loadAccounts]);

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
      {/* Sync Indicator */}
      {isSyncing && (
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            backgroundColor: "#e3f2fd",
            padding: 12,
            borderRadius: 10,
            marginBottom: 16,
            borderLeftWidth: 4,
            borderLeftColor: "#2196F3",
          }}
        >
          <ActivityIndicator size="small" color="#1976D2" />
          <Text
            style={{
              marginLeft: 10,
              color: "#1565C0",
              fontSize: 14,
              fontWeight: "500",
            }}
          >
            Syncing from cloud...
          </Text>
        </View>
      )}

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
            backgroundColor: "#000000",
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
