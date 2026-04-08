import { Text, View } from "react-native";

type StrengthLevel = "Too Short" | "Weak" | "Fair" | "Strong" | "Very Strong";

function getStrength(password: string): {
  level: StrengthLevel;
  score: number;
  color: string;
} {
  if (password.length < 6)
    return { level: "Too Short", score: 1, color: "#e53935" };

  let score = 0;
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (/[A-Z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;

  if (score <= 1) return { level: "Weak", score: 2, color: "#e53935" };
  if (score === 2) return { level: "Fair", score: 3, color: "#FB8C00" };
  if (score === 3) return { level: "Strong", score: 4, color: "#43A047" };
  return { level: "Very Strong", score: 5, color: "#2E7D32" };
}

export default function PasswordStrengthIndicator({
  password,
}: {
  password: string;
}) {
  if (!password) return null;

  const { level, score, color } = getStrength(password);
  const totalBars = 5;

  return (
    <View style={{ marginTop: 8 }}>
      {/* Bars */}
      <View style={{ flexDirection: "row", gap: 4 }}>
        {Array.from({ length: totalBars }).map((_, i) => (
          <View
            key={i}
            style={{
              flex: 1,
              height: 4,
              borderRadius: 2,
              backgroundColor: i < score ? color : "#e0e0e0",
            }}
          />
        ))}
      </View>

      {/* Label */}
      <Text style={{ marginTop: 4, fontSize: 12, fontWeight: "600", color }}>
        {level}
      </Text>
    </View>
  );
}
