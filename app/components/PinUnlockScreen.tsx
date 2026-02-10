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

interface PinUnlockScreenProps {
  onUnlock: () => void;
}

const PIN_LENGTH = 6;

export default function PinUnlockScreen({ onUnlock }: PinUnlockScreenProps) {
  const insets = useSafeAreaInsets();

  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);
  const [lockoutRemainingMs, setLockoutRemainingMs] = useState<number | null>(null);
  const [attemptsRemaining, setAttemptsRemaining] = useState<number | null>(null);

  /*
   * LOCKOUT COUNTDOWN TIMER
   */
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

  /*
   * CHECK LOCKOUT STATUS ON MOUNT
   */
  useEffect(() => {
    checkLockoutStatus();
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

  /*
   * PIN INPUT
   */
  const handlePinInput = (digit: string) => {
    if (pin.length < PIN_LENGTH && !lockoutRemainingMs) {
      const newPin = pin + digit;
      setPin(newPin);
      setError("");
      setAttemptsRemaining(null);

      // STRICT 6 DIGIT VERIFY
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

  /*
   * VERIFY PIN
   */
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

  /*
   * FORMAT LOCKOUT TIME
   */
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

  const renderPinDots = () => (
    <View style={{ flexDirection: "row", gap: 12, justifyContent: "center" }}>
      {Array.from({ length: PIN_LENGTH }).map((_, i) => (
        <View
          key={i}
          style={{
            width: 14,
            height: 14,
            borderRadius: 7,
            backgroundColor: i < pin.length ? "#000" : "#e5e7eb",
          }}
        />
      ))}
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: "#fff", paddingTop: insets.top }}>
      {/* Header */}
      <View style={{ paddingHorizontal: 24, paddingVertical: 40, alignItems: "center" }}>
        <View
          style={{
            width: 80,
            height: 80,
            backgroundColor: "#000",
            borderRadius: 20,
            justifyContent: "center",
            alignItems: "center",
            marginBottom: 24,
          }}
        >
          <Ionicons name="lock-closed" size={40} color="#fff" />
        </View>

        <Text style={{ fontSize: 28, fontWeight: "700", color: "#000", marginBottom: 8 }}>
          Enter PIN
        </Text>

        <Text style={{ fontSize: 16, color: "#6a7282", textAlign: "center" }}>
          Unlock your authenticator to view codes
        </Text>
      </View>

      {/* PIN dots */}
      <View style={{ paddingVertical: 40 }}>{renderPinDots()}</View>

      {/* STATUS */}
      <View style={{ paddingHorizontal: 24, minHeight: 60, justifyContent: "center" }}>
        {lockoutRemainingMs && (
          <View style={{ backgroundColor: "#fee2e2", padding: 16, borderRadius: 8 }}>
            <Text style={{ color: "#991b1b", fontSize: 14, textAlign: "center", fontWeight: "600" }}>
              Locked out
            </Text>
            <Text style={{ color: "#991b1b", fontSize: 13, textAlign: "center", marginTop: 4 }}>
              Try again in {formatRemaining()}
            </Text>
          </View>
        )}

        {!lockoutRemainingMs && error !== "" && (
          <View>
            <Text style={{ color: "#e7000b", fontSize: 14, textAlign: "center", fontWeight: "500" }}>
              {error}
            </Text>

            {attemptsRemaining !== null && (
              <Text style={{ color: "#6a7282", fontSize: 13, textAlign: "center", marginTop: 4 }}>
                {attemptsRemaining} remaining
              </Text>
            )}
          </View>
        )}

        {isVerifying && (
          <View style={{ alignItems: "center" }}>
            <ActivityIndicator color="#000" />
          </View>
        )}
      </View>

      {/* NUMBER PAD */}
      <View style={{ flex: 1, paddingHorizontal: 24, justifyContent: "center" }}>
        <View style={{ gap: 16 }}>
          {[
            ["1", "2", "3"],
            ["4", "5", "6"],
            ["7", "8", "9"],
            ["", "0", "delete"],
          ].map((row, rowIndex) => (
            <View key={rowIndex} style={{ flexDirection: "row", gap: 16 }}>
              {row.map((key, colIndex) => {
                if (key === "") return <View key={colIndex} style={{ flex: 1 }} />;

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
                        backgroundColor: "#f9fafb",
                        justifyContent: "center",
                        alignItems: "center",
                      }}
                    >
                      <Ionicons name="backspace-outline" size={28} />
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
                      backgroundColor: "#f9fafb",
                      justifyContent: "center",
                      alignItems: "center",
                    }}
                  >
                    <Text style={{ fontSize: 28, fontWeight: "600" }}>{key}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          ))}
        </View>
      </View>

      {/* FOOTER */}
      <View style={{ padding: 24, paddingBottom: insets.bottom + 24 }}>
        <Text style={{ fontSize: 12, color: "#9ca3af", textAlign: "center" }}>
          Forgot your PIN? You'll need to clear app data and set up again.
        </Text>
      </View>
    </View>
  );
}
