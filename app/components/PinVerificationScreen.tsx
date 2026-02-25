import { Ionicons } from "@expo/vector-icons";
import React, { useState } from "react";
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

interface PinVerificationScreenProps {
  onVerified: () => void;
  onCancel: () => void;
  mode?: "change" | "remove";
}

const PIN_LENGTH = 6;

export default function PinVerificationScreen({
  onVerified,
  onCancel,
  mode = "change",
}: PinVerificationScreenProps) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();

  const [pin, setPin] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);
  const [error, setError] = useState("");

  /* ---------------- PIN INPUT ---------------- */

  const handleNumberPress = async (num: string) => {
    if (pin.length >= PIN_LENGTH || isVerifying) return;

    const newPin = pin + num;
    setPin(newPin);
    setError("");

    if (newPin.length === PIN_LENGTH) {
      await verifyPin(newPin);
    }
  };

  const handleDelete = () => {
    if (pin.length === 0 || isVerifying) return;
    setPin(pin.slice(0, -1));
    setError("");
  };

  /* ---------------- VERIFY ---------------- */

  const verifyPin = async (enteredPin: string) => {
    setIsVerifying(true);

    try {
      const { verifyPin: verifyPinUtil } = await import("../utils/pinSecurity");
      const result = await verifyPinUtil(enteredPin);

      if (result.success === true) {
        setTimeout(() => {
          onVerified();
        }, 300);
      } else {
        setError("Incorrect PIN. Please try again.");
        setPin("");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Verification failed.";
      setError(msg);
      setPin("");

      if (Platform.OS === "web") {
        window.alert(msg);
      } else {
        Alert.alert("Error", msg);
      }
    } finally {
      setIsVerifying(false);
    }
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

  const title = mode === "remove" ? "Verify PIN to Remove" : "Verify Your PIN";

  const subtitle =
    mode === "remove"
      ? "Enter your current PIN to remove protection"
      : "Enter your current PIN to continue";

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
        <TouchableOpacity
          onPress={onCancel}
          style={{ alignSelf: "flex-start", marginBottom: 20 }}
          disabled={isVerifying}
        >
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>

        <Text
          style={{
            fontSize: 28,
            fontWeight: "700",
            color: colors.text,
            marginBottom: 8,
          }}
        >
          {title}
        </Text>

        <Text
          style={{
            fontSize: 16,
            color: colors.subText,
            lineHeight: 24,
          }}
        >
          {subtitle}
        </Text>
      </View>

      {/* PIN DOTS */}
      <View style={{ paddingVertical: 40 }}>{renderPinDots()}</View>

      {/* ERROR */}
      {error && (
        <View style={{ paddingHorizontal: 24, marginBottom: 20 }}>
          <Text
            style={{
              color: colors.danger,
              fontSize: 14,
              textAlign: "center",
            }}
          >
            {error}
          </Text>
        </View>
      )}

      {/* LOADING */}
      {isVerifying && (
        <View style={{ marginBottom: 20 }}>
          <ActivityIndicator color={colors.primary} />
        </View>
      )}

      {/* NUMBER PAD */}
      <View
        style={{
          flex: 1,
          paddingHorizontal: 24,
          justifyContent: "center",
        }}
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
                if (key === "")
                  return <View key={colIndex} style={{ flex: 1 }} />;

                if (key === "delete") {
                  return (
                    <TouchableOpacity
                      key={colIndex}
                      onPress={handleDelete}
                      disabled={isVerifying}
                      style={{
                        flex: 1,
                        height: 72,
                        borderRadius: 12,
                        backgroundColor: colors.card,
                        justifyContent: "center",
                        alignItems: "center",
                        opacity: isVerifying ? 0.5 : 1,
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
                    onPress={() => handleNumberPress(key)}
                    disabled={isVerifying}
                    style={{
                      flex: 1,
                      height: 72,
                      borderRadius: 12,
                      backgroundColor: colors.card,
                      justifyContent: "center",
                      alignItems: "center",
                      opacity: isVerifying ? 0.5 : 1,
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
    </View>
  );
}
