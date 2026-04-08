import { Ionicons } from "@expo/vector-icons";
import { RelativePathString, useNavigation, useRouter } from "expo-router";
import * as OTPAuth from "otpauth";
import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import type { TextStyle } from "react-native";
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
import { useTheme } from "../context/ThemeContext";
import { decryptText } from "../utils/crypto";
import { Storage } from "../utils/storage";
import PasswordStrengthIndicator from "./PasswordStrengthIndicator";

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
  accountKey?: string;
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

  const { colors } = useTheme();
  const styles = createStyles(colors);
  const [isSaving, setIsSaving] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showSecret, setShowSecret] = useState(false);
  const [, setMissingFields] = useState<string[]>([]);
  const [hasToken, setHasToken] = useState(false);
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(!!secretKey?.trim());

  /**
   * 🔒 Disable native navigation bar completely
   */
  useLayoutEffect(() => {
    navigation.setOptions({
      headerShown: false,
    });
  }, [navigation]);

  /**
   * Check GitHub token
   */
  useEffect(() => {
    (async () => {
      const token = await Storage.getItemAsync("github_token");
      setHasToken(!!token?.trim());
    })();
  }, []);

  /**
   * Reset form when creating new account
   */
  useEffect(() => {
    if (!accountKey) resetForm();
  }, [accountKey]);

  /**
   * Decrypt password in edit mode
   */
  useEffect(() => {
    if (!accountKey || !password) return;

    (async () => {
      const pat = await Storage.getItemAsync("github_token");
      if (!pat) return;

      try {
        const decrypted = await decryptText(password, pat);
        setFormData({ password: decrypted });
      } catch (err) {
        console.error("Password decrypt failed:", err);
      }
    })();
  }, [accountKey]);

  /**
   * Save handler
   */
  const handleSubmit = useCallback(async () => {
    const missing: string[] = [];
    if (!accountName.trim()) missing.push("accountName");
    if (!username.trim()) missing.push("username");
    if (!password.trim()) missing.push("password");

    setMissingFields(missing);

    if (missing.length) {
      Alert.alert("Missing Fields", "Please fill all required fields");
      return;
    }

    try {
      setIsSaving(true);

      const pat = await Storage.getItemAsync("github_token");
      const encrypted = !!pat?.trim();

      let otpValue = accountOtp || "";

      if (twoFactorEnabled && secretKey.trim()) {
        const clean = secretKey.replace(/\s+/g, "").toUpperCase();
        const totp = new OTPAuth.TOTP({
          issuer: accountName,
          label: username,
          secret: clean,
        });
        otpValue = totp.toString();
      }

      const key = accountKey || `account_${Date.now()}`;
      let finalPassword = password.trim();
      let finalOtp = otpValue;

      if (encrypted) {
        const { encryptText } = await import("../utils/crypto");
        finalPassword = await encryptText(finalPassword, pat!);
        if (finalOtp) finalOtp = await encryptText(finalOtp, pat!);
      }

      const now = new Date().toISOString();
      const stored = accountKey ? await Storage.getItemAsync(accountKey) : null;

      const existing = stored ? JSON.parse(stored) : {};

      const data = {
        accountName: accountName.trim(),
        username: username.trim(),
        password: finalPassword,
        websiteUrl: websiteUrl.trim(),
        value: finalOtp,
        notes: notes.trim(),
        encrypted,
        createdAt: existing.createdAt || now,
        modifiedAt: now,
        isFavorite: existing.isFavorite || false,
      };

      await Storage.setItemAsync(key, JSON.stringify(data));

      if (!accountKey) {
        const keys = JSON.parse(
          (await Storage.getItemAsync("userAccountKeys")) || "[]",
        );
        if (!keys.includes(key)) keys.push(key);
        await Storage.setItemAsync("userAccountKeys", JSON.stringify(keys));
      }

      const target = referer ?? (`/details/${key}` as RelativePathString);
      router.replace(target);
    } catch (err) {
      Alert.alert("Error", "Failed to save account");
      console.error(err);
    } finally {
      setIsSaving(false);
    }
  }, [
    accountName,
    username,
    password,
    websiteUrl,
    secretKey,
    notes,
    accountKey,
    twoFactorEnabled,
    referer,
  ]);

  const handleChange = (field: keyof FormFields, value: string) => {
    setFormData({ [field]: value });
    if (value.trim()) {
      setMissingFields((prev) => prev.filter((f) => f !== field));
    }
  };

  const handleToggleTwoFactor = (value: boolean) => {
    setTwoFactorEnabled(value);
    if (!value) {
      setFormData({ secretKey: "" });
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.background }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      {/* 🔥 Custom Header */}
      <View
        style={{
          paddingTop: insets.top,
          height: 56 + insets.top,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          paddingHorizontal: 16,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: colors.border,
        }}
      >
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="arrow-back" size={20} color={colors.text} />
        </Pressable>

        <Text style={{ fontSize: 17, fontWeight: "600", color: colors.text }}>
          {accountKey ? "Edit Account" : "Add New Account"}
        </Text>

        <Pressable
          onPress={handleSubmit}
          disabled={isSaving}
          style={{
            paddingHorizontal: 12,
            paddingVertical: 6,
            backgroundColor: colors.background,
            borderRadius: 8,
            opacity: isSaving ? 0.5 : 1,
          }}
        >
          <Text style={{ color: colors.text, fontWeight: "600", fontSize: 15 }}>
            {isSaving ? "Saving…" : "Save"}
          </Text>
        </Pressable>
      </View>

      {/* 📄 Form */}
      <ScrollView contentContainerStyle={styles.form}>
        {!hasToken && (
          <View style={styles.warning}>
            <Text style={styles.warningText}>
              ⚠️ No encryption token. Data will be stored unencrypted.
            </Text>
          </View>
        )}

        <Field label="Title" labelStyle={{ color: colors.text }}>
          <TextInput
            value={accountName}
            onChangeText={(t) => handleChange("accountName", t)}
            style={styles.input}
          />
        </Field>

        <Field label="Username or Email" labelStyle={{ color: colors.text }}>
          <TextInput
            value={username}
            onChangeText={(t) => handleChange("username", t)}
            style={styles.input}
            autoCapitalize="none"
          />
        </Field>

        <Field label="Password" labelStyle={{ color: colors.text }}>
          <View style={styles.inputRow}>
            <TextInput
              value={password}
              onChangeText={(t) => handleChange("password", t)}
              secureTextEntry={!showPassword}
              style={styles.textField}
            />
            <Pressable onPress={() => setShowPassword(!showPassword)}>
              <Ionicons
                name={showPassword ? "eye-off-outline" : "eye-outline"}
                size={20}
                color={colors.text}
              />
            </Pressable>
          </View>
          <PasswordStrengthIndicator password={password} />
        </Field>

        <Field label="Website URL" labelStyle={{ color: colors.text }}>
          <TextInput
            value={websiteUrl}
            onChangeText={(t) => handleChange("websiteUrl", t)}
            style={styles.input}
            autoCapitalize="none"
            autoCorrect={false}
          />
        </Field>

        <Field label="Notes" labelStyle={{ color: colors.text }}>
          <TextInput
            value={notes}
            onChangeText={(t) => handleChange("notes", t)}
            multiline
            style={[styles.input, { height: 90 }]}
          />
        </Field>

        <View style={styles.divider} />

        {/* Two-Factor Authentication card */}
        <View style={styles.twoFactorCard}>
          <View style={styles.twoFactorHeader}>
            <View style={styles.twoFactorTitleRow}>
              <View style={styles.twoFactorIconWrapper}>
                <Ionicons
                  name="lock-closed-outline"
                  size={20}
                  color={colors.text}
                />
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
                  color={colors.text}
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

/* ---------- Helpers ---------- */

function Field({
  label,
  children,
  labelStyle,
}: {
  label: string;
  children: React.ReactNode;
  labelStyle?: TextStyle;
}) {
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={[{ fontWeight: "600", marginBottom: 6 }, labelStyle]}>
        {label}
      </Text>
      {children}
    </View>
  );
}

/* ---------- Styles ---------- */

const createStyles = (colors: any) =>
  StyleSheet.create({
    form: {
      padding: 24,
      paddingBottom: 40,
    },
    input: {
      height: 48,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 12,
      backgroundColor: colors.card,
      color: colors.text,
    },
    inputRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 10,
      paddingHorizontal: 12,
      backgroundColor: colors.card,
    },
    textField: {
      flex: 1,
      color: colors.text,
      height: 48,
    },
    divider: {
      height: 1,
      backgroundColor: colors.border,
      marginVertical: 24,
    },
    warning: {
      backgroundColor: colors.card,
      padding: 12,
      borderRadius: 8,
      marginBottom: 16,
    },
    warningText: {
      fontSize: 13,
      color: colors.danger,
    },
    // Two-Factor Authentication styles
    twoFactorCard: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 12,
      backgroundColor: colors.background,
    },
    twoFactorHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      padding: 16,
    },
    twoFactorTitleRow: {
      flexDirection: "row",
      alignItems: "center",
      flex: 1,
      gap: 12,
    },
    twoFactorIconWrapper: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: colors.card,
      alignItems: "center",
      justifyContent: "center",
    },
    twoFactorTitle: {
      fontSize: 16,
      fontWeight: "600",
      color: colors.text,
    },
    twoFactorSubtitle: {
      fontSize: 13,
      color: colors.subText,
      marginTop: 2,
    },
    twoFactorBody: {
      padding: 16,
      paddingTop: 0,
      gap: 12,
    },
    fieldWrapper: {
      gap: 8,
    },
    label: {
      fontSize: 14,
      fontWeight: "600",
      color: colors.text,
    },
    otpInputContainer: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 10,
      paddingHorizontal: 12,
      backgroundColor: colors.card,
    },
    toggleButton: {
      paddingHorizontal: 12,
      paddingVertical: 6,
    },
    toggleText: {
      fontSize: 14,
      fontWeight: "600",
      color: colors.primary,
    },
    scanQrButton: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      paddingVertical: 12,
      paddingHorizontal: 16,
      backgroundColor: colors.card,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.border,
    },
    scanQrText: {
      fontSize: 15,
      fontWeight: "600",
      color: colors.text,
    },
    helperText: {
      fontSize: 13,
      color: colors.subText,
      lineHeight: 18,
    },
  });
