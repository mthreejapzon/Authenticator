import { Ionicons } from "@expo/vector-icons";
import { RelativePathString, useNavigation, useRouter } from "expo-router";
import * as OTPAuth from "otpauth";
import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { FormFields } from "../context/FormContext";
import { decryptText } from "../utils/crypto";
import { Storage } from "../utils/storage";

export default function AccountForm({
  accountKey,
  accountName,
  username,
  password,
  websiteUrl,
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
  websiteUrl: string;
  accountOtp?: string;
  secretKey: string;
  notes: string;
  setFormData: (data: Partial<FormFields>) => void;
  resetForm: () => void;
  referer?: RelativePathString;
}) {
  const router = useRouter();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const [isSaving, setIsSaving] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showSecret, setShowSecret] = useState(false);
  const [missingFields, setMissingFields] = useState<string[]>([]);
  const [hasToken, setHasToken] = useState(false);
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(
    !!(secretKey && secretKey.trim().length > 0)
  );

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
  const handleSubmit = useCallback(async () => {
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
        // Clean the secret key (remove whitespace and convert to uppercase)
        const cleanSecret = secretKey.trim().replace(/\s+/g, '').toUpperCase();
        
        // Validate that it's a valid base32 string
        if (!/^[A-Z2-7]+=*$/.test(cleanSecret)) {
          throw new Error("Invalid base32 format");
        }
        
        // Create TOTP with the clean secret
        const totp = new OTPAuth.TOTP({
          issuer: accountName.trim(),
          label: username.trim() || accountName.trim(),
          algorithm: 'SHA1',
          digits: 6,
          period: 30,
          secret: cleanSecret, // Use the cleaned secret directly as a string
        });
    
    value = totp.toString();
    console.log("✅ OTP URI created successfully");
  } catch (err) {
    console.error("❌ Invalid OTP secret:", err);
    const msg = `Invalid OTP secret key: ${err instanceof Error ? err.message : 'Please check the format (should be base32: A-Z, 2-7)'}`;
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

    // Get existing data if updating
    let existingData: any = null;
    if (accountKey) {
      try {
        const stored = await Storage.getItemAsync(accountKey);
        if (stored) {
          existingData = JSON.parse(stored);
        }
      } catch (err) {
        console.error("Error reading existing data:", err);
      }
    }

    const now = new Date().toISOString();
    const data = {
      accountName: accountName.trim(),
      username: username.trim(),
      password: finalPassword,
      websiteUrl: websiteUrl.trim(),
      value: finalOtp,
      notes: notes.trim(),
      encrypted: hasGitHubToken, // Flag to know if data is encrypted
      createdAt: existingData?.createdAt || now, // Preserve original creation date or set new
      modifiedAt: now, // Always update modified date
      isFavorite: existingData?.isFavorite || false, // Preserve favorite status
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
}, [accountName, username, password, websiteUrl, secretKey, notes, accountKey, accountOtp, referer, setFormData, resetForm, router]);

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

  const handleToggleTwoFactor = (value: boolean) => {
    setTwoFactorEnabled(value);
    if (!value) {
      setFormData({ secretKey: "" });
    }
  };

  // Set up native header with Back and Save buttons (only if not in edit mode from details screen)
  // When accountKey exists, we're editing from details screen, so we'll use custom header
  useLayoutEffect(() => {
    if (!accountKey) {
      // Only set header for new account creation
      navigation.setOptions({
        headerLeft: () => (
          <TouchableOpacity
            onPress={() => router.back()}
            activeOpacity={0.8}
            style={{
              width: 36,
              height: 40,
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 8,
              marginLeft: 8,
            }}
          >
            <Ionicons name="arrow-back" size={20} color="#000" />
          </TouchableOpacity>
        ),
        headerRight: () => (
          <Pressable
            onPress={handleSubmit}
            disabled={isSaving}
            style={{
              paddingHorizontal: 12,
              paddingVertical: 6,
              backgroundColor: "#000",
              borderRadius: 8,
              opacity: isSaving ? 0.5 : 1,
              marginRight: 8,
            }}
          >
            <Text style={{ color: "#fff", fontSize: 16, fontWeight: "600" }}>
              {isSaving ? "Saving" : "Save"}
            </Text>
          </Pressable>
        ),
      });
    } else {
      // Hide header when editing from details screen (we'll use custom header)
      navigation.setOptions({
        headerShown: false,
      });
    }
  }, [navigation, isSaving, handleSubmit, router, accountKey]);

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: "#f3f4f6" }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      {/* Custom Header for Edit Mode */}
      {accountKey && (
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
            backgroundColor: "#fff",
          }}
        >
          {/* Back Button */}
          <TouchableOpacity
            onPress={() => router.back()}
            activeOpacity={0.8}
            style={{
              width: 36,
              height: 40,
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 8,
            }}
          >
            <Ionicons name="arrow-back" size={20} color="#000" />
          </TouchableOpacity>

          {/* Save Button */}
          <TouchableOpacity
            onPress={handleSubmit}
            disabled={isSaving}
            activeOpacity={0.8}
            style={{
              paddingHorizontal: 16,
              paddingVertical: 8,
              backgroundColor: "#000",
              borderRadius: 8,
              opacity: isSaving ? 0.5 : 1,
            }}
          >
            <Text style={{ color: "#fff", fontSize: 16, fontWeight: "600" }}>
              {isSaving ? "Saving..." : "Save"}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      <ScrollView
        style={styles.formScroll}
        contentContainerStyle={{ paddingBottom: 32 }}
      >
        {/* Warning if no token */}
        {!hasToken && (
          <View style={styles.warningBanner}>
            <Text style={styles.warningText}>
              ⚠️{" "}
              <Text style={{ fontWeight: "600" }}>No encryption token:</Text>{" "}
              Your data will be saved unencrypted. Add a GitHub token in
              Settings for encryption and cloud backup.
            </Text>
          </View>
        )}

        {/* Title */}
        <View style={styles.fieldWrapper}>
          <Text style={styles.label}>Title</Text>
          <TextInput
            value={accountName}
            onChangeText={(text) => handleChange("accountName", text)}
            placeholder="e.g., GitHub"
            style={getInputStyle("accountName")}
          />
        </View>

        {/* Username or Email */}
        <View style={styles.fieldWrapper}>
          <Text style={styles.label}>Username or Email</Text>
          <TextInput
            value={username}
            onChangeText={(text) => handleChange("username", text)}
            placeholder="username@example.com"
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
              style={styles.textField}
            />
            {password.length > 0 && (
              <TouchableOpacity
                onPress={() => setShowPassword(!showPassword)}
                style={styles.iconButton}
                activeOpacity={0.8}
              >
                <Ionicons
                  name={showPassword ? "eye-off-outline" : "eye-outline"}
                  size={20}
                  color="#4b5563"
                />
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Website URL */}
        <View style={styles.fieldWrapper}>
          <Text style={styles.label}>Website URL</Text>
          <TextInput
            value={websiteUrl}
            onChangeText={(text) => handleChange("websiteUrl", text)}
            placeholder="https://example.com"
            style={styles.input}
            autoCapitalize="none"
            autoCorrect={false}
          />
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

        {/* Divider */}
        <View style={styles.sectionDivider} />

        {/* Two-Factor Authentication card */}
        <View style={styles.twoFactorCard}>
          <View style={styles.twoFactorHeader}>
            <View style={styles.twoFactorTitleRow}>
              <View style={styles.twoFactorIconWrapper}>
                <Ionicons name="lock-closed-outline" size={20} color="#1d4ed8" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.twoFactorTitle}>
                  Two-Factor Authentication
                </Text>
                <Text style={styles.twoFactorSubtitle}>
                  Add TOTP for extra security
                </Text>
              </View>
            </View>
            <Switch
              value={twoFactorEnabled}
              onValueChange={handleToggleTwoFactor}
              trackColor={{ false: "#d1d5db", true: "#020617" }}
              thumbColor="#ffffff"
            />
          </View>

          {twoFactorEnabled && (
            <View style={styles.twoFactorBody}>
              <View style={styles.fieldWrapper}>
                <Text style={styles.label}>Secret Key</Text>
                <View style={styles.otpInputContainer}>
                  <TextInput
                    value={secretKey}
                    onChangeText={(text) => handleChange("secretKey", text)}
                    placeholder="JBSWY3DPEHPK3PXP"
                    secureTextEntry={!showSecret}
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
              </View>

              <TouchableOpacity
                onPress={() => router.push("/add-qr")}
                style={styles.scanQrButton}
                activeOpacity={0.8}
              >
                <Ionicons
                  name="qr-code-outline"
                  size={18}
                  color="#0a0a0a"
                  style={{ marginRight: 8 }}
                />
                <Text style={styles.scanQrText}>Scan QR Code</Text>
              </TouchableOpacity>

              <Text style={styles.helperText}>
                Scan the QR code or manually enter the secret key from your 2FA
                setup
              </Text>
            </View>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  formScroll: {
    flex: 1,
    backgroundColor: "#fff",
    paddingHorizontal: 24,
    paddingTop: 24,
  },
  fieldWrapper: {
    marginBottom: 14,
  },
  label: {
    fontWeight: "600",
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderColor: "#e5e7eb",
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
    borderColor: "#e5e7eb",
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
    borderColor: "#e5e7eb",
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
  iconButton: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff",
    marginLeft: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(0,0,0,0.1)",
  },
  sectionDivider: {
    height: 1,
    backgroundColor: "#e5e7eb",
    marginVertical: 24,
  },
  twoFactorCard: {
    backgroundColor: "#f9fafb",
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
  },
  twoFactorHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  twoFactorTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  twoFactorIconWrapper: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: "#dbeafe",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  twoFactorTitle: {
    fontSize: 14,
    fontWeight: "500",
    color: "#0a0a0a",
  },
  twoFactorSubtitle: {
    fontSize: 12,
    color: "#6a7282",
    marginTop: 2,
  },
  twoFactorBody: {
    marginTop: 16,
  },
  scanQrButton: {
    height: 44,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(0,0,0,0.1)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 12,
  },
  scanQrText: {
    fontSize: 14,
    fontWeight: "500",
    color: "#0a0a0a",
  },
  helperText: {
    marginTop: 8,
    fontSize: 12,
    color: "#6a7282",
  },
  warningBanner: {
    backgroundColor: "#fff3cd",
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
    borderLeftWidth: 4,
    borderLeftColor: "#ff9800",
  },
  warningText: {
    color: "#856404",
    fontSize: 13,
    lineHeight: 18,
  },
});
