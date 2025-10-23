import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import * as SecureStore from "expo-secure-store";
import * as OTPAuth from "otpauth";
import { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useForm } from "./context/FormContext";

export default function SetupScreen() {
  const router = useRouter();
  const {
    accountName,
    username,
    password,
    secretKey,
    setFormData,
    resetForm,
  } = useForm();

  const [isSaving, setIsSaving] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showSecret, setShowSecret] = useState(false);
  const [missingFields, setMissingFields] = useState<string[]>([]);

  const handleSubmit = async () => {
    const missing: string[] = [];
    if (!accountName.trim()) missing.push("accountName");
    if (!username.trim()) missing.push("username");
    if (!password.trim()) missing.push("password");

    setMissingFields(missing);

    if (missing.length > 0) return;

    try {
      setIsSaving(true);

      let value = "";
      if (secretKey.trim()) {
        const totp = new OTPAuth.TOTP({
          label: accountName.trim(),
          secret: OTPAuth.Secret.fromBase32(secretKey.trim()),
        });
        value = totp.toString();
      }

      const key = `account_${Date.now()}`;

      const data = {
        accountName: accountName.trim(),
        username: username.trim(),
        password: password.trim(),
        value,
      };

      await SecureStore.setItemAsync(key, JSON.stringify(data));

      const storedKeys = await SecureStore.getItemAsync("userAccountKeys");
      const keys = storedKeys ? JSON.parse(storedKeys) : [];
      keys.push(key);
      await SecureStore.setItemAsync("userAccountKeys", JSON.stringify(keys));

      resetForm();
      setMissingFields([]);
      router.dismissAll();
      router.replace("/");
    } catch (error) {
      console.error(error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleChange = (fieldName: string, value: string) => {
    setFormData({ [fieldName]: value });
    if (missingFields.includes(fieldName) && value.trim() !== "") {
      setMissingFields((prev) => prev.filter((f) => f !== fieldName));
    }
  };

  const getInputStyle = (fieldName: string) => [
    styles.input,
    missingFields.includes(fieldName) && styles.inputError,
  ];

  const getInputContainerStyle = (fieldName: string) => [
    styles.inputContainer,
    missingFields.includes(fieldName) && styles.inputError,
  ];

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        style={{ flex: 1, backgroundColor: "#fff", padding: 20 }}
        contentContainerStyle={{ paddingBottom: 100 }}
      >
        {/* Account Name */}
        <View style={styles.fieldWrapper}>
          <Text style={styles.label}>Account Name</Text>
          <TextInput
            value={accountName}
            onChangeText={(text) => handleChange("accountName", text)}
            placeholder="e.g. GitHub"
            style={getInputStyle("accountName")}
          />
        </View>

        {/* Username */}
        <View style={styles.fieldWrapper}>
          <Text style={styles.label}>Username</Text>
          <TextInput
            value={username}
            onChangeText={(text) => handleChange("username", text)}
            placeholder="e.g. john.doe"
            style={getInputStyle("username")}
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>

        {/* Password */}
        <View style={styles.fieldWrapper}>
          <Text style={styles.label}>Password</Text>
          <View style={getInputContainerStyle("password")}>
            <TextInput
              value={password}
              onChangeText={(text) => handleChange("password", text)}
              placeholder="Required"
              secureTextEntry={!showPassword}
              textContentType="oneTimeCode"
              style={styles.textField}
            />
            {password.length > 0 && (
              <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
                <Text style={styles.toggleText}>
                  {showPassword ? "Hide" : "Show"}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* One-Time Password (Optional) */}
        <View style={styles.fieldWrapper}>
          <Text style={styles.label}>One-Time Password (Optional)</Text>
          <View style={styles.otpRow}>
            <View style={styles.otpInputContainer}>
              <TextInput
                value={secretKey}
                onChangeText={(text) => setFormData({ secretKey: text })}
                placeholder="Enter manually or scan QR"
                secureTextEntry={!showSecret}
                textContentType="oneTimeCode"
                autoCapitalize="none"
                style={styles.textField}
              />

              {secretKey.length > 0 && (
                <TouchableOpacity
                  onPress={() => setShowSecret(!showSecret)}
                  style={styles.toggleButton}
                >
                  <Text style={styles.toggleText}>
                    {showSecret ? "Hide" : "Show"}
                  </Text>
                </TouchableOpacity>
              )}
            </View>

            {/* QR Button beside the input */}
            <TouchableOpacity
              onPress={() => router.push("/add-qr")}
              style={styles.qrButtonAligned}
              activeOpacity={0.7}
            >
              <Ionicons name="qr-code-outline" size={22} color="#000" />
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>

      {/* Submit Button fixed at bottom */}
      <View style={styles.submitWrapper}>
        <TouchableOpacity
          onPress={handleSubmit}
          disabled={isSaving}
          style={[
            styles.submitButton,
            { backgroundColor: isSaving ? "#999" : "#007AFF" },
          ]}
        >
          <Text style={styles.submitText}>
            {isSaving ? "Saving..." : "Save Account"}
          </Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  fieldWrapper: {
    marginBottom: 14,
  },
  label: {
    fontWeight: "600",
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 10,
    padding: 10,
    fontSize: 16,
    color: "#000",
    backgroundColor: "#f9f9f9",
    height: 48,
  },
  inputError: {
    borderColor: "red",
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f9f9f9",
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 10,
    paddingHorizontal: 10,
    height: 48,
  },
  otpRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  otpInputContainer: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f9f9f9",
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 48,
  },
  textField: {
    flex: 1,
    paddingVertical: 10,
    fontSize: 16,
    color: "#000",
  },
  toggleButton: {
    marginRight: 6,
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  toggleText: {
    color: "#007AFF",
    fontWeight: "600",
    fontSize: 14,
  },
  qrButtonAligned: {
    width: 48,
    height: 48,
    borderRadius: 10,
    backgroundColor: "#f9f9f9",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#ccc",
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  submitWrapper: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    padding: 20,
    backgroundColor: "#fff",
  },
  submitButton: {
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: "center",
  },
  submitText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 16,
  },
});
