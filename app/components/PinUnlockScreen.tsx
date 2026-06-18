import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../context/ThemeContext";

interface PinUnlockScreenProps {
  onUnlock: () => void;
}

const PIN_LENGTH = 6;

export default function PinUnlockScreen({ onUnlock }: PinUnlockScreenProps) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();

  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);
  const [biometricsEnabled, setBiometricsEnabled] = useState(false);
  const [biometricsName, setBiometricsName] = useState("Biometrics");
  const [lockoutRemainingMs, setLockoutRemainingMs] = useState<number | null>(
    null,
  );
  const [attemptsRemaining, setAttemptsRemaining] = useState<number | null>(
    null,
  );

  /* ---------------- LOCKOUT TIMER ---------------- */

  useEffect(() => {
    if (!lockoutRemainingMs) return;

    const timer = setInterval(() => {
      setLockoutRemainingMs((prev) => {
        if (!prev) return null;
        if (prev <= 1000) {
          clearInterval(timer);
          setError("");
          return null;
        }
        return prev - 1000;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [lockoutRemainingMs]);

  /* ---------------- CHECK LOCKOUT ---------------- */

  useEffect(() => {
    (async () => {
      await checkLockoutStatus();

      try {
        const { isBiometricsSupported, isBiometricsEnabled, getSupportedBiometryNames } =
          await import("../utils/biometrics");
        const supported = await isBiometricsSupported();
        const enabled = await isBiometricsEnabled();

        if (supported && enabled) {
          setBiometricsEnabled(true);
          const names = await getSupportedBiometryNames();
          if (names.length > 0) {
            setBiometricsName(names[0]);
          }

          // Check if locked out before auto-triggering
          const { isInLockout } = await import("../utils/pinSecurity");
          const lockout = await isInLockout();
          if (!lockout.locked) {
            setTimeout(() => {
              triggerBiometricUnlock();
            }, 300);
          }
        }
      } catch (err) {
        console.error("Failed to setup biometrics in lock screen:", err);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const checkLockoutStatus = async () => {
    try {
      const { isInLockout } = await import("../utils/pinSecurity");
      const lockout = await isInLockout();

      if (lockout.locked && lockout.remainingMs) {
        setLockoutRemainingMs(lockout.remainingMs);
        setError("Too many failed attempts");
      }
    } catch (err) {
      console.error("Failed to check lockout:", err);
    }
  };

  const triggerBiometricUnlock = async () => {
    try {
      const { authenticateWithBiometrics } = await import("../utils/biometrics");
      const success = await authenticateWithBiometrics(`Unlock with ${biometricsName}`);

      if (success) {
        const { Storage } = await import("../utils/storage");
        await Storage.setItemAsync("app_locked", "false");
        await Storage.deleteItemAsync("failed_pin_attempts");
        await Storage.deleteItemAsync("lockout_until");
        onUnlock();
      }
    } catch (err) {
      console.error("Biometric unlock failed:", err);
    }
  };

  /* ---------------- PIN INPUT ---------------- */

  const handlePinInput = (digit: string) => {
    if (pin.length < PIN_LENGTH && !lockoutRemainingMs) {
      const newPin = pin + digit;
      setPin(newPin);
      setError("");
      setAttemptsRemaining(null);

      if (newPin.length === PIN_LENGTH) {
        verifyPin(newPin);
      }
    }
  };

  const handleDelete = () => {
    setPin(pin.slice(0, -1));
    setError("");
    setAttemptsRemaining(null);
  };

  /* ---------------- VERIFY ---------------- */

  const verifyPin = async (pinToVerify: string) => {
    setIsVerifying(true);

    try {
      const { verifyPin: verify } = await import("../utils/pinSecurity");
      const result = await verify(pinToVerify);

      if (result.success) {
        onUnlock();
      } else {
        setError(result.error || "Incorrect PIN");
        setPin("");

        if (result.attemptsRemaining !== undefined) {
          setAttemptsRemaining(result.attemptsRemaining);
        }

        if (result.lockoutRemainingMs) {
          setLockoutRemainingMs(result.lockoutRemainingMs);
        }

        if (result.error?.includes("locked")) {
          await checkLockoutStatus();
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Verification failed";
      setError(msg);
      setPin("");

      if (Platform.OS === "web") {
        window.alert(`Error: ${msg}`);
      } else {
        Alert.alert("Error", msg);
      }
    } finally {
      setIsVerifying(false);
    }
  };

  /* ---------------- FORMAT TIME ---------------- */

  const formatRemaining = () => {
    if (!lockoutRemainingMs) return "";

    const totalSeconds = Math.ceil(lockoutRemainingMs / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;

    if (minutes > 0) {
      return `${minutes}:${seconds.toString().padStart(2, "0")}`;
    }

    return `${seconds}s`;
  };

  /* ---------------- PIN DOTS ---------------- */

  const renderPinDots = () => (
    <View style={{ flexDirection: "row", gap: 12, justifyContent: "center" }}>
      {Array.from({ length: PIN_LENGTH }).map((_, i) => (
        <View
          key={i}
          style={{
            width: 14,
            height: 14,
            borderRadius: 7,
            backgroundColor: i < pin.length ? colors.primary : colors.border,
          }}
        />
      ))}
    </View>
  );

  /* ---------------- UI ---------------- */

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: colors.background,
        paddingTop: insets.top,
      }}
    >
      {/* HEADER */}
      <View style={{ paddingHorizontal: 24, paddingVertical: 20 }}>
        <Text
          style={{
            fontSize: 28,
            fontWeight: "700",
            color: colors.text,
            marginBottom: 8,
          }}
        >
          Enter Security PIN
        </Text>

        <Text
          style={{
            fontSize: 16,
            color: colors.subText,
            lineHeight: 24,
          }}
        >
          Enter your 6-digit PIN to unlock your authenticator
        </Text>
      </View>

      {/* PIN DOTS */}
      <View style={{ paddingVertical: 40 }}>{renderPinDots()}</View>

      {/* ERROR / LOCKOUT */}
      <View style={{ paddingHorizontal: 24, marginBottom: 20 }}>
        {lockoutRemainingMs ? (
          <Text
            style={{
              color: colors.danger,
              fontSize: 14,
              textAlign: "center",
            }}
          >
            Locked. Try again in {formatRemaining()}
          </Text>
        ) : error ? (
          <>
            <Text
              style={{
                color: colors.danger,
                fontSize: 14,
                textAlign: "center",
              }}
            >
              {error}
            </Text>

            {attemptsRemaining !== null && (
              <Text
                style={{
                  color: colors.subText,
                  fontSize: 13,
                  textAlign: "center",
                  marginTop: 4,
                }}
              >
                {attemptsRemaining} attempts remaining
              </Text>
            )}
          </>
        ) : null}
      </View>

      {isVerifying && (
        <View style={{ alignItems: "center", marginBottom: 20 }}>
          <ActivityIndicator color={colors.primary} />
        </View>
      )}

      {/* NUMBER PAD */}
      <View
        style={{ flex: 1, paddingHorizontal: 24, justifyContent: "center" }}
      >
        <View style={{ gap: 16 }}>
          {[
            ["1", "2", "3"],
            ["4", "5", "6"],
            ["7", "8", "9"],
            ["", "0", "delete"],
          ].map((row, rowIndex) => (
            <View key={rowIndex} style={{ flexDirection: "row", gap: 16 }}>
              {row.map((key, colIndex) => {
                if (key === "") {
                  if (biometricsEnabled) {
                    return (
                      <TouchableOpacity
                        key={colIndex}
                        onPress={triggerBiometricUnlock}
                        disabled={!!lockoutRemainingMs}
                        style={{
                          flex: 1,
                          height: 72,
                          borderRadius: 12,
                          backgroundColor: colors.card,
                          justifyContent: "center",
                          alignItems: "center",
                        }}
                      >
                        <Ionicons
                          name={biometricsName.includes("Face") ? "scan-outline" : "finger-print-outline"}
                          size={28}
                          color={colors.text}
                        />
                      </TouchableOpacity>
                    );
                  }
                  return <View key={colIndex} style={{ flex: 1 }} />;
                }

                if (key === "delete") {
                  return (
                    <TouchableOpacity
                      key={colIndex}
                      onPress={handleDelete}
                      disabled={!!lockoutRemainingMs}
                      style={{
                        flex: 1,
                        height: 72,
                        borderRadius: 12,
                        backgroundColor: colors.card,
                        justifyContent: "center",
                        alignItems: "center",
                      }}
                    >
                      <Ionicons
                        name="backspace-outline"
                        size={28}
                        color={colors.text}
                      />
                    </TouchableOpacity>
                  );
                }

                return (
                  <TouchableOpacity
                    key={colIndex}
                    onPress={() => handlePinInput(key)}
                    disabled={!!lockoutRemainingMs}
                    style={{
                      flex: 1,
                      height: 72,
                      borderRadius: 12,
                      backgroundColor: colors.card,
                      justifyContent: "center",
                      alignItems: "center",
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 28,
                        fontWeight: "600",
                        color: colors.text,
                      }}
                    >
                      {key}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          ))}
        </View>
      </View>

      {/* FOOTER */}
      <View style={{ padding: 24, paddingBottom: insets.bottom + 24 }}>
        <Text
          style={{
            fontSize: 12,
            color: colors.subText,
            textAlign: "center",
          }}
        >
          {"Forgot your PIN? You'll need to clear app data and set up again."}
        </Text>
      </View>
    </View>
  );
}
