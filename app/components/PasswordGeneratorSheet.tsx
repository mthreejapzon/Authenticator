import Slider from "@react-native-community/slider";
import { useState } from "react";
import { Modal, Switch, Text, TouchableOpacity, View } from "react-native";
import { useTheme } from "../context/ThemeContext";

function generatePassword(
  length: number,
  useNumbers: boolean,
  useSymbols: boolean,
): string {
  const letters = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const numbers = "0123456789";
  const symbols = "!@#$%^&*()_+-=[]{}|;:,.<>?";

  let charset = letters;
  if (useNumbers) charset += numbers;
  if (useSymbols) charset += symbols;

  return Array.from({ length }, () =>
    charset.charAt(Math.floor(Math.random() * charset.length)),
  ).join("");
}

export default function PasswordGeneratorSheet({
  visible,
  onClose,
  onUse,
}: {
  visible: boolean;
  onClose: () => void;
  onUse: (password: string) => void;
}) {
  const { colors } = useTheme();
  const [length, setLength] = useState(16);
  const [useNumbers, setUseNumbers] = useState(true);
  const [useSymbols, setUseSymbols] = useState(false);
  const [generated, setGenerated] = useState(() =>
    generatePassword(16, true, false),
  );

  const regenerate = (
    len = length,
    numbers = useNumbers,
    symbols = useSymbols,
  ) => {
    setGenerated(generatePassword(len, numbers, symbols));
  };

  return (
    <Modal visible={visible} transparent animationType="slide">
      <View
        style={{
          flex: 1,
          justifyContent: "flex-end",
          backgroundColor: "rgba(0,0,0,0.4)",
        }}
      >
        <View
          style={{
            backgroundColor: colors.card,
            borderTopLeftRadius: 20,
            borderTopRightRadius: 20,
            padding: 20,
            gap: 16,
          }}
        >
          {/* Header */}
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <TouchableOpacity onPress={onClose}>
              <Text style={{ fontSize: 16, color: colors.subText }}>
                Cancel
              </Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={() => regenerate()}>
              <Text style={{ fontSize: 22, color: colors.text }}>↺</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => {
                onUse(generated);
                onClose();
              }}
              style={{
                backgroundColor: "#007AFF",
                paddingHorizontal: 20,
                paddingVertical: 8,
                borderRadius: 10,
              }}
            >
              <Text style={{ color: "#fff", fontWeight: "600", fontSize: 16 }}>
                Use
              </Text>
            </TouchableOpacity>
          </View>

          {/* Generated Password */}
          <View
            style={{
              backgroundColor: colors.background,
              borderRadius: 12,
              padding: 14,
            }}
          >
            <Text
              style={{
                fontSize: 20,
                fontWeight: "500",
                color: colors.text,
                letterSpacing: 1,
              }}
            >
              {generated}
            </Text>
          </View>

          {/* Length Slider */}
          <View>
            <Text style={{ color: colors.text, fontWeight: "500" }}>
              {length} Characters
            </Text>
            <Slider
              minimumValue={8}
              maximumValue={32}
              step={1}
              value={length}
              minimumTrackTintColor="#007AFF"
              maximumTrackTintColor={colors.subText}
              onValueChange={(val) => {
                setLength(val);
                regenerate(val, useNumbers, useSymbols);
              }}
            />
          </View>

          {/* Numbers Toggle */}
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
              borderTopWidth: 1,
              borderTopColor: colors.border,
              paddingTop: 12,
            }}
          >
            <Text style={{ color: colors.text, fontSize: 16 }}>Numbers</Text>
            <Switch
              value={useNumbers}
              onValueChange={(val) => {
                setUseNumbers(val);
                regenerate(length, val, useSymbols);
              }}
            />
          </View>

          {/* Symbols Toggle */}
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
              borderTopWidth: 1,
              borderTopColor: colors.border,
              paddingTop: 12,
            }}
          >
            <Text style={{ color: colors.text, fontSize: 16 }}>Symbols</Text>
            <Switch
              value={useSymbols}
              onValueChange={(val) => {
                setUseSymbols(val);
                regenerate(length, useNumbers, val);
              }}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}
