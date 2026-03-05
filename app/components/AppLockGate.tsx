import React, { useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { useTheme } from "../context/ThemeContext"; // adjust path as needed
import PinUnlockScreen from "./PinUnlockScreen"; // adjust path as needed

interface AppLockGateProps {
  children: React.ReactNode;
}

type LockState = "checking" | "locked" | "unlocked";

export default function AppLockGate({ children }: AppLockGateProps) {
  const { colors } = useTheme();
  const [lockState, setLockState] = useState<LockState>("checking");

  useEffect(() => {
    checkForPin();
  }, []);

  const checkForPin = async () => {
    try {
      const { hasPin } = await import("../utils/pinSecurity"); // adjust path
      const pinExists = await hasPin();
      setLockState(pinExists ? "locked" : "unlocked");
    } catch (err) {
      console.error("AppLockGate: failed to check PIN:", err);
      // Fail open — if we can't check, don't block the user
      setLockState("unlocked");
    }
  };

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
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (lockState === "locked") {
    return <PinUnlockScreen onUnlock={() => setLockState("unlocked")} />;
  }

  return <>{children}</>;
}
