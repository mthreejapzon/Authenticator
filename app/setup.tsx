import { Link } from "expo-router";
import { Text, TouchableOpacity, View } from "react-native";

export default function Setup() {
  return (
    <View 
      style={{
        flex: 1,
        backgroundColor: "#f8f9fa",
        padding: 20,
        justifyContent: "center",
      }}
    >
      {/* Header */}
      <Text
        style={{
          fontSize: 24,
          fontWeight: "600",
          textAlign: "center",
          marginBottom: 10,
          color: "#333",
        }}
      >
        Add a New Account
      </Text>

      {/* Subtext */}
      <Text
        style={{
          fontSize: 16,
          textAlign: "center",
          color: "#666",
          marginBottom: 30,
        }}
      >
        Choose how you want to add your 2FA account
      </Text>

      {/* Add QR Button */}
      <Link href="/add-qr" asChild>
      <TouchableOpacity
        style={{
          backgroundColor: "#007AFF",
          paddingVertical: 14,
          borderRadius: 12,
          marginBottom: 15,
          alignItems: "center",
        }}
      >
        <Text
          style={{
            color: "white",
            fontSize: 16,
            fontWeight: "500",
          }}
        >
          📷 Scan QR Code
        </Text>
      </TouchableOpacity>
      </Link>

      {/* Add Manual Button */}
      <Link href="/add-code" asChild >
        <TouchableOpacity
          style={{
            backgroundColor: "#34C759",
            paddingVertical: 14,
            borderRadius: 12,
            alignItems: "center",
          }}
        >
          <Text
            style={{
            color: "white",
            fontSize: 16,
            fontWeight: "500",
          }}>
            ✍️ Enter Code Manually
          </Text>
        </TouchableOpacity>
      </Link>
    </View>
  );
}
