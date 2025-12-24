import { Ionicons } from "@expo/vector-icons";
import { RelativePathString, useRouter } from "expo-router";
import * as OTPAuth from "otpauth";
import { useEffect, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import type { FormFields } from "../context/FormContext";
import { decryptText } from "../utils/crypto";
import { Storage } from "../utils/storage";

export default function AccountForm({
  accountKey,
  accountName,
  username,
  password,
  accountOtp,
  secretKey,
  notes,
  setFormData,
  resetForm,
  referer,
}: {
  accountKey?: string | undefined;
  accountName: string;
  username: string;
  password: string;
  accountOtp?: string;
  secretKey: string;
  notes: string;
  setFormData: (data: Partial<FormFields>) => void;
  resetForm: () => void;
  referer?: RelativePathString;
}) {
  const router = useRouter();
  const [isSaving, setIsSaving] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showSecret, setShowSecret] = useState(false);
  const [missingFields, setMissingFields] = useState<string[]>([]);
  const [hasToken, setHasToken] = useState(false);

// Check if GitHub token exists
  useEffect(() => {
    (async () => {
      const token = await Storage.getItemAsync("github_token");
      setHasToken(token !== null && token.trim().length > 0);
    })();
  }, []);

  /**
   * Reset form when creating a new account
   */
  useEffect(() => {
    if (!accountKey) {
      resetForm();
    }
  }, [accountKey]);

  /**
   * Decrypt password when editing an existing account
   */
  useEffect(() => {
    if (!accountKey) return; // Skip in create mode

    (async () => {
      try {
        // Get GitHub token
        const pat = await Storage.getItemAsync("github_token");
        
        if (!pat) {
          console.warn("⚠️ No GitHub token found");
          return;
        }

        if (password) {
          try {
            const decryptedPw = await decryptText(password, pat);
            setFormData({ password: decryptedPw });
            console.log("✅ Password decrypted for editing");
          } catch (err) {
            console.error("❌ Failed to decrypt password for editing:", err);
          }
        }
      } catch (err) {
        console.error("Error in edit mode setup:", err);
      }
    })();
  }, [accountKey]);

  /**
   * Submit handler - Save or update account
   */
  const handleSubmit = async () => {
  const missing: string[] = [];
  if (!accountName.trim()) missing.push("accountName");
  if (!username.trim()) missing.push("username");
  if (!password.trim()) missing.push("password");
  setMissingFields(missing);
  
  if (missing.length > 0) {
    const msg = "Please fill in all required fields";
    if (Platform.OS === 'web') {
      window.alert(msg);
    } else {
      Alert.alert("Missing Fields", msg);
    }
    return;
  }

  try {
    setIsSaving(true);

    // Get GitHub token (optional now)
    const pat = await Storage.getItemAsync("github_token");
    const hasGitHubToken = pat && pat.trim().length > 0;

    // Build OTP URI if secret key is provided
    let value = accountOtp || "";
    if (secretKey && secretKey.trim()) {
      try {
        const totp = new OTPAuth.TOTP({
          label: accountName.trim(),
          secret: OTPAuth.Secret.fromBase32(secretKey.trim()),
        });
        value = totp.toString();
      } catch (err) {
        console.error("❌ Invalid OTP secret:", err);
        const msg = "Invalid OTP secret key. Please check the format.";
        if (Platform.OS === 'web') {
          window.alert(msg);
        } else {
          Alert.alert("Invalid OTP", msg);
        }
        setIsSaving(false);
        return;
      }
    }

    const key = accountKey || `account_${Date.now()}`;
    
    let finalPassword = password.trim();
    let finalOtp = value;

    // Encrypt if we have a token
    if (hasGitHubToken) {
      console.log("🔐 Encrypting data with GitHub token...");
      const { encryptText } = await import("../utils/crypto");
      finalPassword = await encryptText(password.trim(), pat!);
      
      if (value) {
        finalOtp = await encryptText(value, pat!);
      }
    } else {
      console.log("⚠️ No GitHub token - saving data unencrypted");
    }

    const data = {
      accountName: accountName.trim(),
      username: username.trim(),
      password: finalPassword,
      value: finalOtp,
      notes: notes.trim(),
      encrypted: hasGitHubToken, // Flag to know if data is encrypted
    };

    console.log("💾 Saving account data...");
    await Storage.setItemAsync(key, JSON.stringify(data));

    // Add to account keys list if new account
    if (!accountKey) {
      const storedKeys = await Storage.getItemAsync("userAccountKeys");
      const keys = storedKeys ? JSON.parse(storedKeys) : [];
      if (!keys.includes(key)) keys.push(key);
      await Storage.setItemAsync("userAccountKeys", JSON.stringify(keys));
      console.log("✅ Account added to keys list");
    } else {
      console.log("✅ Account updated");
    }

    // Trigger auto-backup if token exists
    if (hasGitHubToken) {
      console.log("🔄 Triggering auto-backup...");
      const { triggerAutoBackup } = await import("../utils/backupUtils");
      triggerAutoBackup().catch(err => {
        console.error("Auto-backup failed:", err);
      });
    }

    resetForm();
    setMissingFields([]);

    router.replace(`/details/${key}` as RelativePathString);
  } catch (error) {
    console.error("❌ Error saving account:", error);
    const msg = `Failed to save account: ${error instanceof Error ? error.message : "Unknown error"}`;
    if (Platform.OS === 'web') {
      window.alert(msg);
    } else {
      Alert.alert("Error", msg);
    }
  } finally {
    setIsSaving(false);
  }
};

  const handleChange = (fieldName: keyof FormFields, value: string) => {
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
        {/* Warning if no token */}
          {!hasToken && (
            <View
              style={{
                backgroundColor: "#fff3cd",
                borderRadius: 8,
                padding: 12,
                marginBottom: 16,
                borderLeftWidth: 4,
                borderLeftColor: "#ff9800",
              }}
            >
              <Text style={{ color: "#856404", fontSize: 13, lineHeight: 18 }}>
                ⚠️ <Text style={{ fontWeight: "600" }}>No encryption token:</Text> Your data will be saved unencrypted. Add a GitHub token in Settings for encryption and cloud backup.
              </Text>
            </View>
          )}
        {/* Account Name */}
        <View style={styles.fieldWrapper}>
          <Text style={styles.label}>Account Name *</Text>
          <TextInput
            value={accountName}
            onChangeText={(text) => handleChange("accountName", text)}
            placeholder="e.g. GitHub"
            style={getInputStyle("accountName")}
          />
        </View>

        {/* Username */}
        <View style={styles.fieldWrapper}>
          <Text style={styles.label}>Username *</Text>
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
          <Text style={styles.label}>Password *</Text>
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

        {/* OTP */}
        <View style={styles.fieldWrapper}>
          <Text style={styles.label}>One-Time Password (Optional)</Text>
          <View style={styles.otpRow}>
            <View style={styles.otpInputContainer}>
              <TextInput
                value={secretKey}
                onChangeText={(text) => handleChange("secretKey", text)}
                placeholder="Enter manually or scan QR"
                secureTextEntry={!showSecret}
                textContentType="oneTimeCode"
                autoCapitalize="none"
                style={styles.textField}
              />
              {secretKey?.length > 0 && (
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

            <TouchableOpacity
              onPress={() => router.push("/add-qr")}
              style={styles.qrButtonAligned}
              activeOpacity={0.7}
            >
              <Ionicons name="qr-code-outline" size={22} color="#000" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Notes */}
        <View style={styles.fieldWrapper}>
          <Text style={styles.label}>Notes (Optional)</Text>
          <TextInput
            value={notes}
            onChangeText={(text) => handleChange("notes", text)}
            placeholder="Anything helpful to remember"
            multiline
            style={[
              styles.input,
              { height: 100, paddingTop: 10, textAlignVertical: "top" },
            ]}
          />
        </View>
      </ScrollView>

      {/* Save Button */}
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
