import { RelativePathString, useLocalSearchParams, useNavigation, useRouter } from "expo-router";
import * as OTPAuth from "otpauth";
import { useEffect, useRef, useState } from "react";
import {
  Alert,
  Animated,
  Easing,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import Svg, { Path } from "react-native-svg";
import * as icons from "simple-icons";
import AccountForm from "../components/AccountForm";
import { useForm } from "../context/FormContext";
import { decryptText } from "../utils/crypto";
import { Clipboard, Storage } from "../utils/storage";

export default function DetailsScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const { key } = useLocalSearchParams();
  const {
    accountName,
    username,
    password,
    secretKey,
    notes,
    setFormData,
    resetForm,
  } = useForm();

  const [data, setData] = useState<{
    accountName: string;
    username: string;
    password: string;
    secretKey: string;
    value: string;
  } | null>(null);

  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [otpCode, setOtpCode] = useState<string>("Generating...");
  const [otpPeriod, setOtpPeriod] = useState<number>(30);
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [decryptedPassword, setDecryptedPassword] = useState<string>("");
  const [notesText, setNotesText] = useState<string>("");
  const [decryptionError, setDecryptionError] = useState<string | null>(null);

  const progress = useRef(new Animated.Value(1)).current;
  const highlightAnim = useRef(new Animated.Value(0)).current;
  const [highlightField, setHighlightField] = useState<string | null>(null);

  const startProgressBar = (remainingSeconds: number) => {
    progress.stopAnimation();
    progress.setValue(remainingSeconds / otpPeriod);
    Animated.timing(progress, {
      toValue: 0,
      duration: remainingSeconds * 1000,
      easing: Easing.linear,
      useNativeDriver: false,
    }).start();
  };

  const triggerHighlight = (field: string) => {
    setHighlightField(field);
    highlightAnim.setValue(1);
    Animated.timing(highlightAnim, {
      toValue: 0,
      duration: 600,
      useNativeDriver: false,
    }).start(() => setHighlightField(null));
  };

  const copyToClipboard = async (text: string, field: string) => {
    if (!text) return;
    await Clipboard.setStringAsync(text);
    triggerHighlight(field);
  };

  useEffect(() => {
    if (!key) {
      router.replace("/");
      return;
    }

    (async () => {
      try {
        const storedData = await Storage.getItemAsync(key as string);
        if (!storedData) {
          router.replace("/");
          return;
        }

        const parsed = JSON.parse(storedData);

        // Get GitHub token for decryption
        const pat = await Storage.getItemAsync("github_token");
        
        // Validate PAT more thoroughly
        if (!pat || pat.trim().length === 0) {
          console.warn("⚠️ Missing GitHub token");
          setDecryptionError("GitHub token not configured");
          
          // Show data without decryption
          setData(parsed);
          setFormData(parsed);
          setNotesText(parsed.notes || "");
          setDecryptedPassword("");
          
          // Show alert to user
          const message = "GitHub token not found. Please add your GitHub token in Settings to decrypt passwords and OTP codes.";
          if (Platform.OS === 'web') {
            window.alert(message);
          } else {
            Alert.alert("Token Required", message);
          }
          return;
        }

        let decryptedPw = "";
        let decryptedOtpValue = parsed.value;
        let hasDecryptionError = false;

        // Check if data is encrypted (default true for backward compatibility)
        const isEncrypted = parsed.encrypted !== false;

        if (isEncrypted && pat) {
          // Try to decrypt password
          if (parsed.password) {
            try {
              decryptedPw = await decryptText(parsed.password, pat);
              console.log("✅ Password decrypted successfully");
            } catch (e) {
              console.error("❌ Password decrypt failed:", e);
              hasDecryptionError = true;
              setDecryptionError("Failed to decrypt password. Check your GitHub token in Settings.");
              decryptedPw = "";
            }
          }

          // Try to decrypt OTP secret
          if (parsed.value) {
            try {
              decryptedOtpValue = await decryptText(parsed.value, pat);
              console.log("✅ OTP secret decrypted successfully");
            } catch (e) {
              console.error("❌ OTP decrypt failed:", e);
              hasDecryptionError = true;
              setDecryptionError("Failed to decrypt OTP secret. Check your GitHub token in Settings.");
              decryptedOtpValue = "";
            }
          }
        } else if (!isEncrypted) {
          // Data is not encrypted, use as-is
          console.log("ℹ️ Account data is not encrypted");
          decryptedPw = parsed.password || "";
          decryptedOtpValue = parsed.value || "";
        } else {
          // Encrypted but no token
          console.warn("⚠️ Data is encrypted but no token available");
          setDecryptionError("GitHub token required to decrypt this account");
        }


        // Show error alert if decryption failed
        if (hasDecryptionError) {
          const message = "Decryption failed. This usually means:\n\n1. Your GitHub token is incorrect\n2. The data was encrypted with a different token\n3. The backup data is corrupted\n\nPlease verify your GitHub token in Settings.";
          if (Platform.OS === 'web') {
            window.alert(message);
          } else {
            Alert.alert("Decryption Error", message);
          }
        }

        setData({ ...parsed, value: decryptedOtpValue });
        setFormData(parsed);
        setNotesText(parsed.notes || "");
        setDecryptedPassword(decryptedPw);

        // Generate OTP if we have a secret
        if (decryptedOtpValue) {
          try {
            const otpDetails = OTPAuth.URI.parse(decryptedOtpValue);

            if (otpDetails instanceof OTPAuth.TOTP) {
              const totp = otpDetails;
              setOtpPeriod(totp.period);

              const updateOtp = () => {
                const code = totp.generate();
                setOtpCode(code);

                const epoch = Math.floor(Date.now() / 1000);
                const remaining = totp.period - (epoch % totp.period);
                startProgressBar(remaining);
              };

              updateOtp();

              navigation.setOptions({
                headerTitle: parsed.accountName || totp.issuer || "Account Details",
              });

              const interval = setInterval(updateOtp, 1000);
              return () => clearInterval(interval);
            } else {
              const hotp = otpDetails as OTPAuth.HOTP;
              setOtpPeriod(0);
              setOtpCode(hotp.generate());
              navigation.setOptions({
                headerTitle: parsed.accountName || hotp.issuer || "Account Details",
              });
            }
          } catch (err) {
            console.error("❌ Invalid OTP URI:", err);
            setOtpCode("Invalid OTP");
            setDecryptionError("Invalid OTP configuration");
          }
        } else {
          // No OTP secret available
          setOtpCode("N/A");
        }
      } catch (err) {
        console.error("❌ Error loading account details:", err);
        const message = `Failed to load account: ${err instanceof Error ? err.message : 'Unknown error'}`;
        if (Platform.OS === 'web') {
          window.alert(message);
        } else {
          Alert.alert("Error", message);
        }
        router.replace("/");
      }
    })();
  }, [key]);

  // Header config
  useEffect(() => {
    navigation.setOptions({
      headerBackTitle: "Accounts",
      headerTitle: data?.accountName || "Account Details",
      headerRight: () =>
        !isEditing ? (
          <TouchableOpacity onPress={() => setIsEditing(true)} activeOpacity={0.8}>
            <View style={{ backgroundColor: "#007AFF", paddingVertical: 6, paddingHorizontal: 12, borderRadius: 8 }}>
              <Text style={{ color: "#fff", fontWeight: "600" }}>Edit</Text>
            </View>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity onPress={() => setIsEditing(false)} activeOpacity={0.8}>
            <View style={{ backgroundColor: "#f2f2f2", paddingVertical: 6, paddingHorizontal: 12, borderRadius: 8 }}>
              <Text style={{ color: "#333", fontWeight: "600" }}>Cancel</Text>
            </View>
          </TouchableOpacity>
        ),
    });
  }, [navigation, isEditing, data?.accountName]);

  const barWidth = progress.interpolate({
    inputRange: [0, 1],
    outputRange: ["0%", "100%"],
  });

  const getBackgroundColor = (field: string) => {
    const isActive = highlightField === field;
    return isActive
      ? highlightAnim.interpolate({
          inputRange: [0, 1],
          outputRange: ["#f2f2f2", "#d9f8d9"],
        })
      : "#f2f2f2";
  };

  if (isEditing) {
    return (
      <AccountForm
        accountKey={key as string}
        accountName={accountName}
        username={username}
        password={password}
        accountOtp={data?.value}
        secretKey={secretKey}
        notes={notes}
        setFormData={setFormData}
        resetForm={resetForm}
        referer={`/details/${key}` as RelativePathString}
      />
    );
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: "#fff", padding: 20 }}
      contentContainerStyle={{ paddingBottom: 50 }}
    >
      {/* Decryption Error Banner */}
      {decryptionError && (
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
          <Text style={{ color: "#856404", fontWeight: "600", fontSize: 14 }}>
            ⚠️ {decryptionError}
          </Text>
        </View>
      )}

      {/* Account Name */}
      <Animated.View
        style={{
          backgroundColor: "#f9f9f9",
          borderRadius: 12,
          paddingVertical: 16,
          paddingHorizontal: 14,
          marginBottom: 20,
          shadowColor: "#000",
          shadowOpacity: 0.05,
          shadowOffset: { width: 0, height: 1 },
          shadowRadius: 4,
          elevation: 1,
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          {(() => {
            const providerName = data?.accountName || "";
            const formatted = providerName.toLowerCase().replace(/\s+/g, "");
            const iconKey = `si${formatted.charAt(0).toUpperCase()}${formatted.slice(1)}`;
            const providerIcon: any = (icons as any)[iconKey] || null;

            if (providerIcon) {
              return (
                <View
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: 10,
                    backgroundColor: `#${providerIcon.hex}`,
                    alignItems: "center",
                    justifyContent: "center",
                    marginRight: 14,
                  }}
                >
                  <Svg width={26} height={26} viewBox="0 0 24 24">
                    <Path fill="#fff" d={providerIcon.path} />
                  </Svg>
                </View>
              );
            }

            const initials = providerName
              ? providerName.replace(/[^A-Za-z0-9]/g, "").slice(0, 2).toUpperCase()
              : "??";
            return (
              <View
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: 10,
                  backgroundColor: "#e0e0e0",
                  alignItems: "center",
                  justifyContent: "center",
                  marginRight: 14,
                }}
              >
                <Text style={{ color: "#555", fontWeight: "700", fontSize: 18 }}>
                  {initials}
                </Text>
              </View>
            );
          })()}

          <View style={{ flex: 1 }}>
            <Text
              style={{
                fontSize: 20,
                color: "#000",
                fontWeight: "700",
                letterSpacing: 0.3,
              }}
            >
              {data?.accountName || "N/A"}
            </Text>
          </View>
        </View>
      </Animated.View>

      {/* Username */}
      <Text style={{ fontWeight: "600", fontSize: 15, color: "#333" }}>
        Username
      </Text>
      <TouchableOpacity
        onPress={() => copyToClipboard(data?.username || "", "username")}
        activeOpacity={0.8}
      >
        <Animated.View
          style={{
            backgroundColor: getBackgroundColor("username"),
            borderRadius: 8,
            padding: 10,
            marginTop: 4,
            marginBottom: 6,
          }}
        >
          <Text style={{ fontSize: 16, color: "#000", fontWeight: "500" }}>
            {data?.username || "N/A"}
          </Text>
        </Animated.View>
      </TouchableOpacity>
      {data?.username ? (
        <Text style={{ fontSize: 12, color: "#666", textAlign: "right" }}>
          Tap to copy
        </Text>
      ) : null}

      {/* Password */}
      <Text
        style={{
          fontWeight: "600",
          fontSize: 15,
          color: "#333",
          marginTop: 16,
        }}
      >
        Password
      </Text>
      <TouchableOpacity
        onPress={() => copyToClipboard(decryptedPassword || "", "password")}
        activeOpacity={0.8}
        disabled={!decryptedPassword}
      >
        <Animated.View
          style={{
            backgroundColor: getBackgroundColor("password"),
            borderRadius: 8,
            padding: 10,
            marginTop: 4,
            marginBottom: 6,
          }}
        >
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <Text style={{ fontSize: 16, color: "#000", fontWeight: "500" }}>
              {decryptedPassword
                ? showPassword
                  ? decryptedPassword
                  : "••••••••"
                : decryptionError
                ? "Failed to decrypt"
                : "N/A"}
            </Text>
            {decryptedPassword ? (
              <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
                <Text
                  style={{
                    color: "#007AFF",
                    fontWeight: "600",
                    fontSize: 14,
                  }}
                >
                  {showPassword ? "Hide" : "Show"}
                </Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </Animated.View>
      </TouchableOpacity>
      {decryptedPassword ? (
        <Text style={{ fontSize: 12, color: "#666", textAlign: "right" }}>
          Tap to copy
        </Text>
      ) : null}

      {/* OTP Code */}
      {data?.value ? (
        <>
          <Text
            style={{
              fontWeight: "600",
              fontSize: 15,
              color: "#333",
              marginTop: 24,
            }}
          >
            One-Time Password
          </Text>
          <TouchableOpacity
            onPress={() => copyToClipboard(otpCode, "otp")}
            activeOpacity={0.8}
            disabled={otpCode === "N/A" || otpCode === "Invalid OTP" || otpCode === "Generating..."}
          >
            <Animated.View
              style={{
                backgroundColor: getBackgroundColor("otp"),
                borderRadius: 8,
                paddingVertical: 18,
                alignItems: "center",
                marginTop: 4,
              }}
            >
              <Text
                style={{
                  fontSize: 32,
                  letterSpacing: 3,
                  fontWeight: "bold",
                  color: otpCode === "Invalid OTP" || otpCode === "N/A" ? "#999" : "#000",
                }}
              >
                {otpCode}
              </Text>
            </Animated.View>
          </TouchableOpacity>

          {/* Progress Bar */}
          {otpCode !== "N/A" && otpCode !== "Invalid OTP" && otpCode !== "Generating..." && (
            <>
              <View
                style={{
                  height: 6,
                  backgroundColor: "#ddd",
                  borderRadius: 4,
                  overflow: "hidden",
                  marginTop: 8,
                }}
              >
                <Animated.View
                  style={{
                    height: "100%",
                    width: barWidth,
                    backgroundColor: "#007AFF",
                    borderRadius: 4,
                  }}
                />
              </View>

              <Text
                style={{
                  fontSize: 12,
                  textAlign: "center",
                  color: "#666",
                  marginTop: 4,
                }}
              >
                Refreshes every {otpPeriod}s • Tap any field to copy
              </Text>
            </>
          )}
        </>
      ) : null}

      {/* Notes */}
      <Text
        style={{
          fontWeight: "600",
          fontSize: 15,
          color: "#333",
          marginTop: 24,
        }}
      >
        Notes
      </Text>
      <Animated.View
        style={{
          backgroundColor: getBackgroundColor("notes"),
          borderRadius: 8,
          padding: 10,
          marginTop: 4,
        }}
      >
        <TextInput
          value={notesText}
          onChangeText={setNotesText}
          placeholder="Add notes..."
          placeholderTextColor="#999"
          multiline
          numberOfLines={4}
          editable={false}
          style={{
            minHeight: 88,
            textAlignVertical: "top",
            color: "#000",
            fontSize: 15,
          }}
        />
      </Animated.View>
    </ScrollView>
  );
}
