import { Stack } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, AppState, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import PinUnlockScreen from "./components/PinUnlockScreen";
import { FormProvider } from "./context/FormContext";
import { ThemeProvider, useTheme } from "./context/ThemeContext";
import {
  hasPin,
  isAppLocked,
  lockApp,
  recordLastActiveAt,
  shouldLockOnForeground,
} from "./utils/pinSecurity";
import { GITHUB_PAT_KEY } from "./utils/constants";

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

/**
 * RootContent — single source of truth for app-lock state.
 *
 * Responsibilities:
 *  1. On mount: check if a PIN exists and if the app is currently locked.
 *  2. On AppState change: lock when going to background, re-check on foreground.
 *  3. Initialise auto-sync / auto-restore polling after unlock.
 *
 * Previously this logic was split between AppLockGate (which incorrectly
 * assumed "PIN exists → must be locked") and RootContent (which checked
 * isAppLocked() properly). Merging them into a single component removes
 * the double-lock-screen race condition on startup.
 */
function RootContent() {
  const { colors } = useTheme();

  // Three-state lock: "checking" prevents any screen flash before we know
  type LockState = "checking" | "locked" | "unlocked";
  const [lockState, setLockState] = useState<LockState>("checking");

  /* ── Mount: check current lock state ─────────────────────────────────── */
  useEffect(() => {
    checkPinStatus();
  }, []);

  /* ── AppState: record active timestamp on background, re-check on foreground ── */
  useEffect(() => {
    const subscription = AppState.addEventListener(
      "change",
      async (nextAppState) => {
        if (nextAppState === "background" || nextAppState === "inactive") {
          const pinExists = await hasPin();
          if (pinExists) {
            // Snapshot the moment we left the foreground so we can
            // measure elapsed time when we come back.
            await recordLastActiveAt();
          }
        } else if (nextAppState === "active") {
          await checkPinStatus();
        }
      },
    );

    return () => subscription.remove();
  }, []);

  /* ── Auto-sync initialisation (runs once after component mounts) ─────── */
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

        const token = await Storage.getItemAsync(GITHUB_PAT_KEY);
        if (token) {
          const syncEnabled = await isAutoSyncEnabled();
          if (syncEnabled === null || syncEnabled === undefined) {
            await setAutoSyncEnabled(true);
          }

          const restoreEnabled = await isAutoRestoreEnabled();
          if (restoreEnabled) {
            await startAutoRestorePolling();
          }
        }
      } catch (err) {
        console.error("Initialisation failed:", err);
      }
    })();

    return () => {
      (async () => {
        const { stopAutoRestorePolling } = await import("./utils/backupUtils");
        stopAutoRestorePolling();
      })();
    };
  }, []);

  /* ── Helpers ─────────────────────────────────────────────────────────── */

  const checkPinStatus = async () => {
    try {
      const pinExists = await hasPin();
      if (pinExists) {
        // If the app is already flagged as locked (e.g. first launch), show PIN.
        const locked = await isAppLocked();
        if (locked) {
          setLockState("locked");
          return;
        }
        // Otherwise apply the timeout check: did we exceed the idle threshold?
        const timedOut = await shouldLockOnForeground();
        if (timedOut) {
          await lockApp();
          setLockState("locked");
        } else {
          // Still within the grace period — record new active timestamp and stay unlocked.
          await recordLastActiveAt();
          setLockState("unlocked");
        }
      } else {
        setLockState("unlocked");
      }
    } catch (err) {
      console.error("Failed to check PIN status:", err);
      // Fail open — don't block the user if the check errors
      setLockState("unlocked");
    }
  };

  /* ── Render ──────────────────────────────────────────────────────────── */

  if (lockState === "checking") {
    return (
      <View
        style={{
          flex: 1,
          justifyContent: "center",
          alignItems: "center",
          backgroundColor: colors.background,
        }}
      >
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (lockState === "locked") {
    return (
      <PinUnlockScreen
        onUnlock={async () => {
          // Reset the idle timer on every successful unlock
          await recordLastActiveAt();
          setLockState("unlocked");
        }}
      />
    );
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
