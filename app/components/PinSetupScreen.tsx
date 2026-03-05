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

interface PinSetupScreenProps {
  onPinSetup: () => void;
  onSkip?: () => void;
}

const PIN_LENGTH = 6;

export default function PinSetupScreen({
  onPinSetup,
  onSkip,
}: PinSetupScreenProps) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();

  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [step, setStep] = useState<"enter" | "confirm">("enter");
  const [error, setError] = useState("");
  const [isWorking, setIsWorking] = useState(false);

  /* ---------------- PIN INPUT ---------------- */

  const handlePinInput = (digit: string) => {
    if (step === "enter") {
      if (pin.length < PIN_LENGTH) {
        setPin(pin + digit);
        setError("");
      }
    } else {
      if (confirmPin.length < PIN_LENGTH) {
        setConfirmPin(confirmPin + digit);
        setError("");
      }
    }
  };

  const handleDelete = () => {
    if (step === "enter") {
      setPin(pin.slice(0, -1));
    } else {
      setConfirmPin(confirmPin.slice(0, -1));
    }
    setError("");
  };

  /* ---------------- CONTINUE ---------------- */

  const handleContinue = async () => {
    if (step === "enter") {
      if (pin.length !== PIN_LENGTH) {
        setError(`PIN must be exactly ${PIN_LENGTH} digits`);
        return;
      }
      setStep("confirm");
      return;
    }

    if (confirmPin.length !== PIN_LENGTH) {
      setError(`PIN must be exactly ${PIN_LENGTH} digits`);
      return;
    }

    if (confirmPin !== pin) {
      setError("PINs don't match. Try again.");
      setConfirmPin("");
      return;
    }

    setIsWorking(true);

    try {
      const { setupPin } = await import("../utils/pinSecurity");
      await setupPin(pin);

      const msg = "PIN set successfully! Your app is now protected.";

      if (Platform.OS === "web") {
        window.alert(msg);
      } else {
        Alert.alert("Success", msg);
      }

      onPinSetup();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to set PIN";
      setError(msg);

      if (Platform.OS === "web") {
        window.alert(`Error: ${msg}`);
      } else {
        Alert.alert("Error", msg);
      }
    } finally {
      setIsWorking(false);
    }
  };

  /* ---------------- PIN DOTS ---------------- */

  const renderPinDots = (value: string) => (
    <View style={{ flexDirection: "row", gap: 12, justifyContent: "center" }}>
      {Array.from({ length: PIN_LENGTH }).map((_, i) => (
        <View
          key={i}
          style={{
            width: 14,
            height: 14,
            borderRadius: 7,
            backgroundColor: i < value.length ? colors.primary : colors.border,
          }}
        />
      ))}
    </View>
  );

  const isEnterValid = pin.length === PIN_LENGTH;
  const isConfirmValid = confirmPin.length === PIN_LENGTH;
  const isButtonEnabled = step === "enter" ? isEnterValid : isConfirmValid;

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
        {step === "confirm" && (
          <TouchableOpacity
            onPress={() => {
              setStep("enter");
              setConfirmPin("");
              setError("");
            }}
            style={{ alignSelf: "flex-start", marginBottom: 20 }}
          >
            <Ionicons name="arrow-back" size={24} color={colors.text} />
          </TouchableOpacity>
        )}

        <Text
          style={{
            fontSize: 28,
            fontWeight: "700",
            color: colors.text,
            marginBottom: 8,
          }}
        >
          {step === "enter" ? "Create Security PIN" : "Confirm Your PIN"}
        </Text>

        <Text
          style={{
            fontSize: 16,
            color: colors.subText,
            lineHeight: 24,
          }}
        >
          {step === "enter"
            ? "Set a 6-digit PIN to protect your authenticator codes"
            : "Enter your 6-digit PIN again to confirm"}
        </Text>
      </View>

      {/* PIN DOTS */}
      <View style={{ paddingVertical: 40 }}>
        {renderPinDots(step === "enter" ? pin : confirmPin)}
      </View>

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
                if (key === "")
                  return <View key={colIndex} style={{ flex: 1 }} />;

                if (key === "delete") {
                  return (
                    <TouchableOpacity
                      key={colIndex}
                      onPress={handleDelete}
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

      {/* CONTINUE BUTTON */}
      <View style={{ padding: 24, gap: 12 }}>
        <TouchableOpacity
          onPress={handleContinue}
          disabled={isWorking || !isButtonEnabled}
          style={{
            backgroundColor: isButtonEnabled ? colors.primary : colors.border,
            height: 52,
            borderRadius: 12,
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          {isWorking ? (
            <ActivityIndicator color={colors.background} />
          ) : (
            <Text
              style={{
                fontSize: 16,
                fontWeight: "600",
                color: isButtonEnabled ? colors.background : colors.subText,
              }}
            >
              {step === "enter" ? "Continue" : "Confirm PIN"}
            </Text>
          )}
        </TouchableOpacity>

        {onSkip && step === "enter" && (
          <TouchableOpacity
            onPress={onSkip}
            style={{
              height: 52,
              justifyContent: "center",
              alignItems: "center",
            }}
          >
            <Text
              style={{
                fontSize: 16,
                color: colors.subText,
              }}
            >
              Skip for now
            </Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}
