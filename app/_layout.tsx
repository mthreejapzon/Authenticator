import { Stack } from "expo-router";
import { useEffect } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { FormProvider } from "./context/FormContext";

export default function RootLayout() {
  useEffect(() => {
    (async () => {
      try {
        const { setAutoSyncEnabled, isAutoSyncEnabled, startAutoRestorePolling, isAutoRestoreEnabled } = await import("./utils/backupUtils");
        const { Storage } = await import("./utils/storage");
        
         const token = await Storage.getItemAsync("github_token");
        if (token) {
          // Enable auto-sync by default if not set
          const syncEnabled = await isAutoSyncEnabled();
          if (syncEnabled === null || syncEnabled === undefined) {
            await setAutoSyncEnabled(true);
          }
          
          // Start polling if auto-restore is enabled
          const restoreEnabled = await isAutoRestoreEnabled();
          if (restoreEnabled) {
            await startAutoRestorePolling();
            console.log("✅ Auto-sync and polling initialized");
          } else {
            console.log("✅ Auto-sync initialized (auto-restore disabled)");
          }
        }
      } catch (err) {
        console.error("❌ Initialization failed:", err);
      }
    })();

    // Cleanup on unmount
    return () => {
      (async () => {
        const { stopAutoRestorePolling } = await import("./utils/backupUtils");
        stopAutoRestorePolling();
      })();
    };
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <FormProvider>
        <Stack>
          <Stack.Screen
            name="index"
            options={{
              headerTitle: "Accounts",
              headerBackVisible: false
            }}
          />
          <Stack.Screen
            name="setup"
            options={{
              headerTitle: "Add New Account",
            }}
          />
          <Stack.Screen
            name="add-qr"
            options={{
              headerTitle: "Scan QR Code",
            }}
          />
          <Stack.Screen
            name="add-code"
            options={{
              headerTitle: "Enter Code Manually",
            }}
          />
          <Stack.Screen
            name="details/[key]"
            options={{
              headerTitle: "Account Details",
            }}
          />
          <Stack.Screen 
            name="settings" 
            options={{ 
              title: "Settings",
              headerShown: true 
            }} 
          />
        </Stack>
      </FormProvider>
    </GestureHandlerRootView>
  );
}
