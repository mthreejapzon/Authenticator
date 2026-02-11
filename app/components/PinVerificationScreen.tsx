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

interface PinVerificationScreenProps {
  onVerified: () => void;
  onCancel: () => void;
  mode?: "change" | "remove"; // Optional: specify what action will happen after verification
}

export default function PinVerificationScreen({
  onVerified,
  onCancel,
  mode = "change",
}: PinVerificationScreenProps) {
  const insets = useSafeAreaInsets();
  const [pin, setPin] = useState<string[]>([]);
  const [isVerifying, setIsVerifying] = useState(false);
  const [error, setError] = useState<string>("");
  const PIN_LENGTH = 6;

  const handleNumberPress = async (num: string) => {
    if (pin.length >= PIN_LENGTH) return;

    const newPin = [...pin, num];
    setPin(newPin);
    setError("");

    // Auto-verify when PIN is complete
    if (newPin.length === PIN_LENGTH) {
      await verifyPin(newPin.join(""));
    }
  };

  const handleDelete = () => {
    if (pin.length > 0) {
      setPin(pin.slice(0, -1));
      setError("");
    }
  };

  const verifyPin = async (enteredPin: string) => {
    setIsVerifying(true);

    try {
      console.log("🔐 Starting PIN verification...");
      console.log("🔐 Entered PIN length:", enteredPin.length);

      const { verifyPin: verifyPinUtil } = await import("../utils/pinSecurity");
      console.log("🔐 Imported verifyPin function");

      const isValid = await verifyPinUtil(enteredPin);
      console.log("🔐 PIN verification result:", isValid);
      console.log("🔐 Result type:", typeof isValid);
      console.log(
        "🔐 Strict equality check (isValid === true):",
        isValid.success === true,
      );

      // Use strict equality check
      if (isValid.success === true) {
        // PIN is correct - proceed
        console.log(`✅ PIN VERIFIED - Proceeding to ${mode} PIN`);
        setError("");

        // Add a small delay for better UX, then call onVerified
        setTimeout(() => {
          console.log("✅ Calling onVerified()");
          onVerified();
        }, 300);
      } else {
        // Wrong PIN - show error and reset
        console.log("❌ PIN INCORRECT - Result was:", isValid);
        setError("Incorrect PIN. Please try again.");
        setPin([]);

        // Show alert for wrong PIN
        if (Platform.OS !== "web") {
          setTimeout(() => {
            Alert.alert(
              "Incorrect PIN",
              "The PIN you entered is incorrect. Please try again.",
            );
          }, 100);
        } else {
          window.alert("Incorrect PIN. Please try again.");
        }
      }
    } catch (err) {
      console.error("❌ PIN verification error:", err);
      console.error("Error details:", JSON.stringify(err));

      setError("Verification failed. Please try again.");
      setPin([]);

      const msg = err instanceof Error ? err.message : "Could not verify PIN";
      if (Platform.OS === "web") {
        window.alert(`Error: ${msg}`);
      } else {
        Alert.alert("Error", msg);
      }
    } finally {
      console.log("🔐 Setting isVerifying to false");
      setIsVerifying(false);
    }
  };

  const renderPinDots = () => {
    return (
      <View style={{ flexDirection: "row", gap: 16, marginBottom: 48 }}>
        {[...Array(PIN_LENGTH)].map((_, i) => (
          <View
            key={i}
            style={{
              width: 16,
              height: 16,
              borderRadius: 8,
              backgroundColor: i < pin.length ? "#000" : "#e5e7eb",
            }}
          />
        ))}
      </View>
    );
  };

  const renderKeypad = () => {
    const numbers = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];

    return (
      <View style={{ gap: 16 }}>
        {/* Number Grid */}
        <View style={{ gap: 16 }}>
          {[0, 1, 2].map((row) => (
            <View
              key={row}
              style={{
                flexDirection: "row",
                gap: 16,
                justifyContent: "center",
              }}
            >
              {numbers.slice(row * 3, row * 3 + 3).map((num) => (
                <TouchableOpacity
                  key={num}
                  onPress={() => handleNumberPress(num)}
                  disabled={isVerifying}
                  style={{
                    width: 72,
                    height: 72,
                    borderRadius: 36,
                    backgroundColor: "#f3f4f6",
                    justifyContent: "center",
                    alignItems: "center",
                    opacity: isVerifying ? 0.5 : 1,
                  }}
                  activeOpacity={0.7}
                >
                  <Text
                    style={{ fontSize: 24, fontWeight: "600", color: "#000" }}
                  >
                    {num}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          ))}
        </View>

        {/* Bottom Row: Empty, 0, Delete */}
        <View
          style={{ flexDirection: "row", gap: 16, justifyContent: "center" }}
        >
          <View style={{ width: 72, height: 72 }} />

          <TouchableOpacity
            onPress={() => handleNumberPress("0")}
            disabled={isVerifying}
            style={{
              width: 72,
              height: 72,
              borderRadius: 36,
              backgroundColor: "#f3f4f6",
              justifyContent: "center",
              alignItems: "center",
              opacity: isVerifying ? 0.5 : 1,
            }}
            activeOpacity={0.7}
          >
            <Text style={{ fontSize: 24, fontWeight: "600", color: "#000" }}>
              0
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={handleDelete}
            disabled={isVerifying || pin.length === 0}
            style={{
              width: 72,
              height: 72,
              borderRadius: 36,
              backgroundColor: pin.length === 0 ? "#f9fafb" : "#f3f4f6",
              justifyContent: "center",
              alignItems: "center",
              opacity: isVerifying || pin.length === 0 ? 0.5 : 1,
            }}
            activeOpacity={0.7}
          >
            <Ionicons name="backspace-outline" size={24} color="#000" />
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  // Dynamic text based on mode
  const title = mode === "remove" ? "Verify PIN to Remove" : "Verify PIN";
  const subtitle =
    mode === "remove"
      ? "Enter your current PIN to remove protection"
      : "Please enter your current PIN to continue";

  return (
    <View style={{ flex: 1, backgroundColor: "#fff" }}>
      {/* Header */}
      <View
        style={{
          borderBottomWidth: 0.613,
          borderBottomColor: "#e5e7eb",
          paddingTop: insets.top,
          minHeight: 72.591,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          paddingHorizontal: 16,
          paddingBottom: 12,
        }}
      >
        {/* Cancel Button */}
        <TouchableOpacity
          onPress={onCancel}
          activeOpacity={0.8}
          style={{
            width: 36,
            height: 40,
            alignItems: "center",
            justifyContent: "center",
            borderRadius: 8,
          }}
          disabled={isVerifying}
        >
          <Ionicons name="close" size={24} color="#000" />
        </TouchableOpacity>

        {/* Title */}
        <View style={{ flex: 1, alignItems: "center" }}>
          <Text style={{ fontSize: 17, fontWeight: "600", color: "#000" }}>
            {title}
          </Text>
        </View>

        {/* Spacer */}
        <View style={{ width: 36 }} />
      </View>

      {/* Content */}
      <View
        style={{
          flex: 1,
          justifyContent: "center",
          alignItems: "center",
          paddingHorizontal: 24,
        }}
      >
        {/* Icon */}
        <View
          style={{
            width: 72,
            height: 72,
            borderRadius: 36,
            backgroundColor: mode === "remove" ? "#fee2e2" : "#f3f4f6",
            justifyContent: "center",
            alignItems: "center",
            marginBottom: 24,
          }}
        >
          <Ionicons
            name={mode === "remove" ? "lock-open" : "lock-closed"}
            size={32}
            color={mode === "remove" ? "#e7000b" : "#000"}
          />
        </View>

        {/* Instructions */}
        <Text
          style={{
            fontSize: 20,
            fontWeight: "600",
            color: "#000",
            marginBottom: 8,
            textAlign: "center",
          }}
        >
          Enter Current PIN
        </Text>
        <Text
          style={{
            fontSize: 14,
            color: "#6a7282",
            marginBottom: 48,
            textAlign: "center",
          }}
        >
          {subtitle}
        </Text>

        {/* Error Message */}
        {error ? (
          <View
            style={{
              marginBottom: 24,
              padding: 12,
              backgroundColor: "#fee2e2",
              borderRadius: 8,
              width: "100%",
              maxWidth: 300,
            }}
          >
            <Text
              style={{
                color: "#991b1b",
                fontSize: 13,
                fontWeight: "500",
                textAlign: "center",
              }}
            >
              {error}
            </Text>
          </View>
        ) : null}

        {/* Verification Loading */}
        {isVerifying && (
          <View style={{ marginBottom: 24 }}>
            <ActivityIndicator size="small" color="#000" />
          </View>
        )}

        {/* PIN Dots */}
        {renderPinDots()}

        {/* Keypad */}
        {renderKeypad()}
      </View>
    </View>
  );
}
