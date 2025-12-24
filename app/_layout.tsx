import { Stack } from "expo-router";
import { useEffect } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { FormProvider } from "./context/FormContext";

export default function RootLayout() {

  // Initialize auto-sync on app startup
    useEffect(() => {
      (async () => {
        try {
          const { setAutoSyncEnabled, isAutoSyncEnabled } = await import("./utils/backupUtils");
          const { Storage } = await import("./utils/storage");
          
          const token = await Storage.getItemAsync("github_token");
          if (token) {
            // Enable auto-sync by default if not set
            const enabled = await isAutoSyncEnabled();
            if (enabled === null || enabled === undefined) {
              await setAutoSyncEnabled(true);
            }
            console.log("✅ Auto-sync initialized");
          }
        } catch (err) {
          console.error("❌ Auto-sync initialization failed:", err);
        }
      })();
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
