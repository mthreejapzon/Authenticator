/**
 * PinDots — shared PIN entry progress indicator.
 * Renders a row of dots where filled dots represent entered digits.
 */

import { StyleSheet, View } from "react-native";
import { useTheme } from "../context/ThemeContext";
import { PIN_LENGTH } from "../utils/constants";

interface PinDotsProps {
  /** The digits entered so far. */
  pin: string;
  /** Total number of dots to display. Defaults to PIN_LENGTH. */
  length?: number;
}

export default function PinDots({ pin, length = PIN_LENGTH }: PinDotsProps) {
  const { colors } = useTheme();

  return (
    <View style={styles.row}>
      {Array.from({ length }).map((_, i) => (
        <View
          key={i}
          style={[
            styles.dot,
            { backgroundColor: i < pin.length ? colors.primary : colors.border },
          ]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    gap: 12,
    justifyContent: "center",
  },
  dot: {
    width: 14,
    height: 14,
    borderRadius: 7,
  },
});
