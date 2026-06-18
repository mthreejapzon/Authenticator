/**
 * PinPad — shared numeric keypad for PIN entry screens.
 *
 * Renders a 4×3 grid (1-9, blank/biometrics, 0, delete).
 * The bottom-left cell is either empty or a biometrics button,
 * controlled by the optional `biometricsSlot` prop.
 */

import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useTheme } from "../context/ThemeContext";

const ROWS = [
  ["1", "2", "3"],
  ["4", "5", "6"],
  ["7", "8", "9"],
  ["", "0", "delete"],
] as const;

interface PinPadProps {
  onPress: (digit: string) => void;
  onDelete: () => void;
  disabled?: boolean;
  /** Optional element to render in the bottom-left cell (e.g. a biometrics button). */
  biometricsSlot?: React.ReactNode;
}

export default function PinPad({
  onPress,
  onDelete,
  disabled = false,
  biometricsSlot,
}: PinPadProps) {
  const { colors } = useTheme();

  return (
    <View style={styles.grid}>
      {ROWS.map((row, rowIndex) => (
        <View key={rowIndex} style={styles.row}>
          {row.map((key, colIndex) => {
            // Bottom-left cell — biometrics slot or empty spacer
            if (key === "") {
              return biometricsSlot ? (
                <View key={colIndex} style={styles.cell}>
                  {biometricsSlot}
                </View>
              ) : (
                <View key={colIndex} style={styles.cell} />
              );
            }

            // Delete key
            if (key === "delete") {
              return (
                <TouchableOpacity
                  key={colIndex}
                  onPress={onDelete}
                  disabled={disabled}
                  style={[styles.key, { backgroundColor: colors.card }]}
                >
                  <Ionicons
                    name="backspace-outline"
                    size={28}
                    color={colors.text}
                  />
                </TouchableOpacity>
              );
            }

            // Digit key
            return (
              <TouchableOpacity
                key={colIndex}
                onPress={() => onPress(key)}
                disabled={disabled}
                style={[styles.key, { backgroundColor: colors.card }]}
              >
                <Text style={[styles.digit, { color: colors.text }]}>
                  {key}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    gap: 16,
  },
  row: {
    flexDirection: "row",
    gap: 16,
  },
  cell: {
    flex: 1,
    height: 72,
  },
  key: {
    flex: 1,
    height: 72,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  digit: {
    fontSize: 28,
    fontWeight: "600",
  },
});
