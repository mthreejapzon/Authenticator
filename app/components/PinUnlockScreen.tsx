import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../context/ThemeContext";
import { APP_LOCKED_KEY, FAILED_ATTEMPTS_KEY, LOCKOUT_UNTIL_KEY, PIN_LENGTH } from "../utils/constants";
import { showAlert } from "../utils/alert";
import PinDots from "./PinDots";
import PinPad from "./PinPad";

interface PinUnlockScreenProps {
  onUnlock: () => void;
}

export default function PinUnlockScreen({ onUnlock }: PinUnlockScreenProps) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();

  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);
  const [biometricsEnabled, setBiometricsEnabled] = useState(false);
  const [biometricsName, setBiometricsName] = useState("Biometrics");
  const [lockoutRemainingMs, setLockoutRemainingMs] = useState<number | null>(null);
  const [attemptsRemaining, setAttemptsRemaining] = useState<number | null>(null);

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

  /* ---------------- CHECK LOCKOUT + BIOMETRICS ---------------- */

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
        await Storage.setItemAsync(APP_LOCKED_KEY, "false");
        await Storage.deleteItemAsync(FAILED_ATTEMPTS_KEY);
        await Storage.deleteItemAsync(LOCKOUT_UNTIL_KEY);
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
      showAlert("Error", msg);
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

  /* ---------------- BIOMETRICS SLOT ---------------- */

  const biometricsSlot = biometricsEnabled ? (
    <TouchableOpacity
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
  ) : undefined;

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
      <View style={{ paddingVertical: 40 }}>
        <PinDots pin={pin} />
      </View>

      {/* ERROR / LOCKOUT */}
      <View style={{ paddingHorizontal: 24, marginBottom: 20 }}>
        {lockoutRemainingMs ? (
          <Text style={{ color: colors.danger, fontSize: 14, textAlign: "center" }}>
            Locked. Try again in {formatRemaining()}
          </Text>
        ) : error ? (
          <>
            <Text style={{ color: colors.danger, fontSize: 14, textAlign: "center" }}>
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
      <View style={{ flex: 1, paddingHorizontal: 24, justifyContent: "center" }}>
        <PinPad
          onPress={handlePinInput}
          onDelete={handleDelete}
          disabled={!!lockoutRemainingMs}
          biometricsSlot={biometricsSlot}
        />
      </View>

      {/* FOOTER */}
      <View style={{ padding: 24, paddingBottom: insets.bottom + 24 }}>
        <Text style={{ fontSize: 12, color: colors.subText, textAlign: "center" }}>
          {"Forgot your PIN? You'll need to clear app data and set up again."}
        </Text>
      </View>
    </View>
  );
}
