import { Stack } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, AppState, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import PinUnlockScreen from "./components/PinUnlockScreen";
import { FormProvider } from "./context/FormContext";
import { ThemeProvider, useTheme } from "./context/ThemeContext";
import { hasPin, isAppLocked, lockApp } from "./utils/pinSecurity";

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider>
        <FormProvider>
          <RootContent />
        </FormProvider>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}

function RootContent() {
  const [isCheckingPin, setIsCheckingPin] = useState(true);
  const [isLocked, setIsLocked] = useState(false);
  const { colors } = useTheme();

  // Check PIN status on mount
  useEffect(() => {
    checkPinStatus();
  }, []);

  // Lock app when it goes to background
  useEffect(() => {
    const subscription = AppState.addEventListener(
      "change",
      async (nextAppState) => {
        if (nextAppState === "background" || nextAppState === "inactive") {
          // Lock app when going to background
          const pinExists = await hasPin();
          if (pinExists) {
            await lockApp();
          }
        } else if (nextAppState === "active") {
          // Check lock status when coming back to foreground
          await checkPinStatus();
        }
      },
    );

    return () => {
      subscription.remove();
    };
  }, []);

  const checkPinStatus = async () => {
    try {
      const pinExists = await hasPin();

      if (pinExists) {
        const locked = await isAppLocked();
        setIsLocked(locked);
      } else {
        setIsLocked(false);
      }
    } catch (err) {
      console.error("Failed to check PIN status:", err);
      setIsLocked(false);
    } finally {
      setIsCheckingPin(false);
    }
  };

  const handleUnlock = () => {
    setIsLocked(false);
  };

  // Initialize auto-sync
  useEffect(() => {
    (async () => {
      try {
        const {
          setAutoSyncEnabled,
          isAutoSyncEnabled,
          startAutoRestorePolling,
          isAutoRestoreEnabled,
        } = await import("./utils/backupUtils");
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

  // Show loading while checking PIN
  if (isCheckingPin) {
    return (
      <View
        style={{
          flex: 1,
          justifyContent: "center",
          alignItems: "center",
          backgroundColor: colors.background,
        }}
      >
        <ActivityIndicator size="large" color={colors.text} />
      </View>
    );
  }

  // Show PIN unlock screen if locked
  if (isLocked) {
    return <PinUnlockScreen onUnlock={handleUnlock} />;
  }

  return (
    <Stack>
      <Stack.Screen
        name="index"
        options={{
          headerTitle: "Accounts",
          headerBackVisible: false,
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
          headerShown: true,
        }}
      />
    </Stack>
  );
}
