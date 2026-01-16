import { Ionicons } from "@expo/vector-icons";
import { RelativePathString, useLocalSearchParams, useNavigation, useRouter } from "expo-router";
import * as OTPAuth from "otpauth";
import { useEffect, useRef, useState } from "react";
import {
  Alert,
  Animated,
  Easing,
  Linking,
  Platform,
  ScrollView,
  Text,
  TouchableOpacity,
  View
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
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
  const insets = useSafeAreaInsets();
  const {
    accountName,
    username,
    password,
    websiteUrl,
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
    websiteUrl?: string;
    createdAt?: string;
    modifiedAt?: string;
    isFavorite?: boolean;
  } | null>(null);

  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [otpCode, setOtpCode] = useState<string>("Generating...");
  const [otpPeriod, setOtpPeriod] = useState<number>(30);
  const [remainingSeconds, setRemainingSeconds] = useState<number>(30);
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [decryptedPassword, setDecryptedPassword] = useState<string>("");
  const [notesText, setNotesText] = useState<string>("");
  const [decryptionError, setDecryptionError] = useState<string | null>(null);
  const [isFavorite, setIsFavorite] = useState<boolean>(false);

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

        // Set favorite status
        setIsFavorite(parsed.isFavorite || false);

        // Set created/modified dates (backward compatible)
        const now = new Date().toISOString();
        const accountData = {
          ...parsed,
          value: decryptedOtpValue,
          createdAt: parsed.createdAt || now,
          modifiedAt: parsed.modifiedAt || now,
        };

        setData(accountData);
        setFormData(parsed);
        setNotesText(parsed.notes || "");
        setDecryptedPassword(decryptedPw);

        // Generate OTP if we have a secret
        if (decryptedOtpValue) {
          try {
            let otpDetails;
            
            // Check if it's a valid OTP URI or just a secret
            if (decryptedOtpValue.startsWith('otpauth://')) {
              // It's a full OTP URI
              otpDetails = OTPAuth.URI.parse(decryptedOtpValue);
            } else {
              // It's just a secret key, create a TOTP object manually
              otpDetails = new OTPAuth.TOTP({
                issuer: parsed.accountName || 'Account',
                label: parsed.username || 'User',
                algorithm: 'SHA1',
                digits: 6,
                period: 30,
                secret: decryptedOtpValue.replace(/\s+/g, ''), // Remove any whitespace
              });
            }

            if (otpDetails instanceof OTPAuth.TOTP) {
              const totp = otpDetails;
              setOtpPeriod(totp.period);

              const updateOtp = () => {
                const code = totp.generate();
                setOtpCode(code);

                const epoch = Math.floor(Date.now() / 1000);
                const remaining = totp.period - (epoch % totp.period);
                setRemainingSeconds(remaining);
                startProgressBar(remaining);
              };

              updateOtp();

              navigation.setOptions({
                headerTitle: parsed.accountName || totp.issuer || "Account Details",
              });

              const interval = setInterval(updateOtp, 1000);
              return () => clearInterval(interval);
            } else if (otpDetails instanceof OTPAuth.HOTP) {
              const hotp = otpDetails;
              setOtpPeriod(0);
              setOtpCode(hotp.generate());
              navigation.setOptions({
                headerTitle: parsed.accountName || hotp.issuer || "Account Details",
              });
            }
          } catch (err) {
            console.error("❌ Invalid OTP configuration:", err);
            setOtpCode("Invalid OTP");
            setDecryptionError("Invalid OTP configuration. The secret key format may be incorrect.");
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

  // Toggle favorite
  const toggleFavorite = async () => {
    if (!key || !data) return;
    
    const newFavoriteStatus = !isFavorite;
    setIsFavorite(newFavoriteStatus);
    
    try {
      const storedData = await Storage.getItemAsync(key as string);
      if (storedData) {
        const parsed = JSON.parse(storedData);
        parsed.isFavorite = newFavoriteStatus;
        parsed.modifiedAt = new Date().toISOString();
        await Storage.setItemAsync(key as string, JSON.stringify(parsed));
        setData({ ...data, isFavorite: newFavoriteStatus, modifiedAt: parsed.modifiedAt });
      }
    } catch (err) {
      console.error("Error toggling favorite:", err);
    }
  };

  // Delete account
  const handleDelete = () => {
    if (!key) return;

    Alert.alert(
      "Delete Account",
      "Are you sure you want to delete this account? This action cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              // Remove from keys list
              const storedKeys = await Storage.getItemAsync("userAccountKeys");
              const keys = storedKeys ? JSON.parse(storedKeys) : [];
              const updatedKeys = keys.filter((k: string) => k !== key);
              await Storage.setItemAsync("userAccountKeys", JSON.stringify(updatedKeys));
              
              // Delete account data
              await Storage.deleteItemAsync(key as string);
              
              router.replace("/");
            } catch (err) {
              console.error("Error deleting account:", err);
              Alert.alert("Error", "Failed to delete account");
            }
          },
        },
      ]
    );
  };

  // Header config
  useEffect(() => {
    navigation.setOptions({
      headerShown: false,
    });
  }, [navigation, isEditing, data?.accountName]);

  const formatDate = (dateString?: string) => {
    if (!dateString) return "";
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString("en-US", { month: "numeric", day: "numeric", year: "numeric" });
    } catch {
      return "";
    }
  };

  const openWebsite = async (url?: string) => {
    if (!url) return;
    let finalUrl = url;
    if (!url.startsWith("http://") && !url.startsWith("https://")) {
      finalUrl = `https://${url}`;
    }
    try {
      const canOpen = await Linking.canOpenURL(finalUrl);
      if (canOpen) {
        await Linking.openURL(finalUrl);
      }
    } catch (err) {
      console.error("Error opening URL:", err);
    }
  };

  // Split OTP code for display (first 3 digits blue, rest gray)
  const getOtpDisplay = (code: string) => {
    if (code.length >= 6) {
      return {
        firstPart: code.substring(0, 3),
        secondPart: code.substring(3),
      };
    }
    return { firstPart: code, secondPart: "" };
  };

  if (isEditing) {
    return (
      <AccountForm
        accountKey={key as string}
        accountName={accountName}
        username={username}
        password={password}
        websiteUrl={websiteUrl}
        accountOtp={data?.value}
        secretKey={secretKey}
        notes={notes}
        setFormData={setFormData}
        resetForm={resetForm}
        referer={`/details/${key}` as RelativePathString}
      />
    );
  }

  const otpDisplay = getOtpDisplay(otpCode);
  const progressBarWidth = progress.interpolate({
    inputRange: [0, 1],
    outputRange: ["0%", "100%"],
  });

  return (
    <View style={{ flex: 1, backgroundColor: "#fff" }}>
      {/* Custom Header */}
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

        {/* Action Buttons */}
        <View style={{ flexDirection: "row", gap: 8 }}>
          {/* Favorite Button */}
          <TouchableOpacity
            onPress={toggleFavorite}
            activeOpacity={0.8}
            style={{
              width: 40,
              height: 40,
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 8,
            }}
          >
            <Ionicons
              name={isFavorite ? "star" : "star-outline"}
              size={20}
              color={isFavorite ? "#FFC107" : "#000"}
            />
          </TouchableOpacity>

          {/* Edit Button */}
          <TouchableOpacity
            onPress={() => setIsEditing(true)}
            activeOpacity={0.8}
            style={{
              width: 40,
              height: 40,
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 8,
            }}
          >
            <Ionicons name="pencil-outline" size={20} color="#000" />
          </TouchableOpacity>

          {/* Delete Button */}
          <TouchableOpacity
            onPress={handleDelete}
            activeOpacity={0.8}
            style={{
              width: 40,
              height: 40,
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 8,
            }}
          >
            <Ionicons name="trash-outline" size={20} color="#EF4444" />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 50 }}
      >
        {/* Decryption Error Banner */}
        {decryptionError && (
          <View
            style={{
              backgroundColor: "#fff3cd",
              borderRadius: 8,
              padding: 12,
              margin: 16,
              borderLeftWidth: 4,
              borderLeftColor: "#ff9800",
            }}
          >
            <Text style={{ color: "#856404", fontWeight: "600", fontSize: 14 }}>
              ⚠️ {decryptionError}
            </Text>
          </View>
        )}

        <View style={{ padding: 24, gap: 24 }}>
          {/* Account Header Section */}
          <View
            style={{
              borderBottomWidth: 0.613,
              borderBottomColor: "#e5e7eb",
              paddingBottom: 16,
              flexDirection: "row",
              gap: 16,
              alignItems: "flex-start",
            }}
          >
            {/* Account Icon */}
            <View
              style={{
                width: 76,
                height: 76,
                borderRadius: 16,
                backgroundColor: "#f3f4f6",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
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
                        borderRadius: 8,
                        backgroundColor: `#${providerIcon.hex}`,
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Svg width={28} height={28} viewBox="0 0 24 24">
                        <Path fill="#fff" d={providerIcon.path} />
                      </Svg>
                    </View>
                  );
                }

                const initials = providerName
                  ? providerName.replace(/[^A-Za-z0-9]/g, "").slice(0, 2).toUpperCase()
                  : "??";
                return (
                  <Text style={{ color: "#555", fontWeight: "700", fontSize: 24 }}>
                    {initials}
                  </Text>
                );
              })()}
            </View>

            {/* Account Name and Email */}
            <View style={{ flex: 1, justifyContent: "center" }}>
              <Text
                style={{
                  fontSize: 24,
                  color: "#0a0a0a",
                  fontWeight: "500",
                  lineHeight: 32,
                  marginBottom: 4,
                }}
              >
                {data?.accountName || "N/A"}
              </Text>
              <Text
                style={{
                  fontSize: 16,
                  color: "#6a7282",
                  lineHeight: 24,
                }}
              >
                {data?.username || ""}
              </Text>
            </View>
          </View>

          {/* OTP Card Section */}
          {data?.value && otpCode !== "N/A" && otpCode !== "Invalid OTP" && otpCode !== "Generating..." ? (
            <View
              style={{
                borderWidth: 0.613,
                borderColor: "#dbeafe",
                borderRadius: 14,
                padding: 24.609,
                backgroundColor: "#eff6ff",
                gap: 16,
              }}
            >
              {/* OTP Header */}
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <View
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: 4,
                      backgroundColor: "#155dfc",
                      opacity: 0.64,
                    }}
                  />
                  <Text
                    style={{
                      fontSize: 14,
                      color: "#364153",
                      lineHeight: 20,
                    }}
                  >
                    Authentication Code
                  </Text>
                </View>
                <View
                  style={{
                    backgroundColor: "#dbeafe",
                    borderRadius: 20,
                    paddingHorizontal: 12,
                    paddingVertical: 4,
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  <Ionicons name="time-outline" size={12} color="#1447e6" />
                  <Text
                    style={{
                      fontSize: 12,
                      color: "#1447e6",
                      fontWeight: "500",
                      lineHeight: 16,
                    }}
                  >
                    {remainingSeconds}s
                  </Text>
                </View>
              </View>

              {/* OTP Code Display */}
              <View style={{ gap: 16 }}>
                <View
                  style={{
                    height: 48,
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Text
                    style={{
                      fontSize: 48,
                      color: "#155dfc",
                      lineHeight: 48,
                      letterSpacing: 4.8,
                      fontWeight: "400",
                    }}
                  >
                    {otpDisplay.firstPart}
                  </Text>
                  <Text
                    style={{
                      fontSize: 48,
                      color: "#99a1af",
                      lineHeight: 48,
                      letterSpacing: 4.8,
                      fontWeight: "400",
                    }}
                  >
                    {otpDisplay.secondPart}
                  </Text>
                </View>

                {/* Progress Bar */}
                <View
                  style={{
                    height: 8,
                    backgroundColor: "#e5e7eb",
                    borderRadius: 4,
                    overflow: "hidden",
                  }}
                >
                  <Animated.View
                    style={{
                      height: "100%",
                      width: progressBarWidth,
                      backgroundColor: "#155dfc",
                      borderRadius: 4,
                    }}
                  />
                </View>

                {/* Copy Code Button */}
                <TouchableOpacity
                  onPress={() => copyToClipboard(otpCode, "otp")}
                  activeOpacity={0.8}
                  style={{
                    height: 32,
                    backgroundColor: "#fff",
                    borderWidth: 0.613,
                    borderColor: "#bedbff",
                    borderRadius: 8,
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 8,
                  }}
                >
                  <Ionicons name="copy-outline" size={16} color="#0a0a0a" />
                  <Text
                    style={{
                      fontSize: 14,
                      color: "#0a0a0a",
                      fontWeight: "500",
                      lineHeight: 20,
                    }}
                  >
                    Copy Code
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : null}

          {/* Fields Section */}
          <View style={{ gap: 16 }}>
            {/* Password Field */}
            <View style={{ gap: 8 }}>
              <Text
                style={{
                  fontSize: 14,
                  color: "#4a5565",
                  fontWeight: "500",
                  lineHeight: 20,
                }}
              >
                Password
              </Text>
              <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
                <View
                  style={{
                    flex: 1,
                    height: 44,
                    backgroundColor: "#f9fafb",
                    borderRadius: 10,
                    paddingHorizontal: 16,
                    justifyContent: "center",
                  }}
                >
                  <Text
                    style={{
                      fontSize: 14,
                      color: "#0a0a0a",
                      lineHeight: 20,
                    }}
                  >
                    {decryptedPassword
                      ? showPassword
                        ? decryptedPassword
                        : "••••••••••••"
                      : decryptionError
                      ? "Failed to decrypt"
                      : "N/A"}
                  </Text>
                </View>
                {decryptedPassword && (
                  <>
                    <TouchableOpacity
                      onPress={() => setShowPassword(!showPassword)}
                      activeOpacity={0.8}
                      style={{
                        width: 48,
                        height: 44,
                        backgroundColor: "#fff",
                        borderWidth: 0.613,
                        borderColor: "rgba(0,0,0,0.1)",
                        borderRadius: 8,
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Ionicons
                        name={showPassword ? "eye-off-outline" : "eye-outline"}
                        size={20}
                        color="#000"
                      />
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => copyToClipboard(decryptedPassword, "password")}
                      activeOpacity={0.8}
                      style={{
                        width: 48,
                        height: 44,
                        backgroundColor: "#fff",
                        borderWidth: 0.613,
                        borderColor: "rgba(0,0,0,0.1)",
                        borderRadius: 8,
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Ionicons name="copy-outline" size={20} color="#000" />
                    </TouchableOpacity>
                  </>
                )}
              </View>
            </View>

            {/* Website Field */}
            {data?.websiteUrl && (
              <View style={{ gap: 8 }}>
                <Text
                  style={{
                    fontSize: 14,
                    color: "#4a5565",
                    fontWeight: "500",
                    lineHeight: 20,
                  }}
                >
                  Website
                </Text>
                <TouchableOpacity
                  onPress={() => openWebsite(data?.websiteUrl)}
                  activeOpacity={0.8}
                  style={{
                    height: 48,
                    backgroundColor: "#f9fafb",
                    borderRadius: 10,
                    paddingHorizontal: 16,
                    justifyContent: "center",
                  }}
                >
                  <Text
                    style={{
                      fontSize: 14,
                      color: "#155dfc",
                      lineHeight: 20,
                    }}
                  >
                    {data.websiteUrl}
                  </Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Username Field */}
            <View style={{ gap: 8 }}>
              <Text
                style={{
                  fontSize: 14,
                  color: "#4a5565",
                  fontWeight: "500",
                  lineHeight: 20,
                }}
              >
                Username
              </Text>
              <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
                <View
                  style={{
                    flex: 1,
                    height: 44,
                    backgroundColor: "#f9fafb",
                    borderRadius: 10,
                    paddingHorizontal: 16,
                    justifyContent: "center",
                  }}
                >
                  <Text
                    style={{
                      fontSize: 14,
                      color: "#0a0a0a",
                      lineHeight: 20,
                    }}
                  >
                    {data?.username || "N/A"}
                  </Text>
                </View>
                {data?.username && (
                  <TouchableOpacity
                    onPress={() => copyToClipboard(data.username, "username")}
                    activeOpacity={0.8}
                    style={{
                      width: 48,
                      height: 44,
                      backgroundColor: "#fff",
                      borderWidth: 0.613,
                      borderColor: "rgba(0,0,0,0.1)",
                      borderRadius: 8,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Ionicons name="copy-outline" size={20} color="#000" />
                  </TouchableOpacity>
                )}
              </View>
            </View>

            {/* Notes Field */}
            <View style={{ gap: 8 }}>
              <Text
                style={{
                  fontSize: 14,
                  color: "#4a5565",
                  fontWeight: "500",
                  lineHeight: 20,
                }}
              >
                Notes
              </Text>
              <View
                style={{
                  minHeight: 44,
                  backgroundColor: "#f9fafb",
                  borderRadius: 10,
                  paddingHorizontal: 16,
                  paddingVertical: 12,
                }}
              >
                <Text
                  style={{
                    fontSize: 14,
                    color: "#0a0a0a",
                    lineHeight: 20,
                  }}
                >
                  {notesText || ""}
                </Text>
              </View>
            </View>

            {/* Created/Modified Dates */}
            {(data?.createdAt || data?.modifiedAt) && (
              <View
                style={{
                  borderTopWidth: 0.613,
                  borderTopColor: "#e5e7eb",
                  paddingTop: 16.6,
                  gap: 4,
                }}
              >
                {data.createdAt && (
                  <Text
                    style={{
                      fontSize: 12,
                      color: "#99a1af",
                      lineHeight: 16,
                    }}
                  >
                    Created: {formatDate(data.createdAt)}
                  </Text>
                )}
                {data.modifiedAt && (
                  <Text
                    style={{
                      fontSize: 12,
                      color: "#99a1af",
                      lineHeight: 16,
                    }}
                  >
                    Modified: {formatDate(data.modifiedAt)}
                  </Text>
                )}
              </View>
            )}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}
