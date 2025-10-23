import * as Clipboard from "expo-clipboard";
import { useLocalSearchParams, useNavigation, useRouter } from "expo-router";
import * as SecureStore from "expo-secure-store";
import * as OTPAuth from "otpauth";
import { useEffect, useRef, useState } from "react";
import {
  Animated,
  Easing,
  ScrollView,
  Text,
  TouchableOpacity,
  View
} from "react-native";

export default function DetailsScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const { key } = useLocalSearchParams();

  const [data, setData] = useState<{
    accountName: string;
    username: string;
    password: string;
    value: string;
  } | null>(null);

  const [otpCode, setOtpCode] = useState<string>("Generating...");
  const [otpPeriod, setOtpPeriod] = useState<number>(30);
  const [showPassword, setShowPassword] = useState<boolean>(false);

  const progress = useRef(new Animated.Value(1)).current;
  const highlightAnim = useRef(new Animated.Value(0)).current;
  const [highlightField, setHighlightField] = useState<string | null>(null);

  // Animate progress bar smoothly
  const startProgressBar = (remainingSeconds: number) => {
    progress.stopAnimation(); // stop previous animation
    progress.setValue(remainingSeconds / otpPeriod); // start from remaining fraction
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
    if (!key) return router.replace("/");

    (async () => {
      const storedData = await SecureStore.getItemAsync(key as string);
      if (!storedData) {
        router.replace("/");
        return;
      }

      const parsed = JSON.parse(storedData);
      setData(parsed);

      if (!parsed.value) return;

      try {
        const otpDetails = OTPAuth.URI.parse(parsed.value);
        if (otpDetails instanceof OTPAuth.TOTP) {
          const totp = otpDetails;
          setOtpPeriod(totp.period);

          const updateOtp = () => {
            const code = totp.generate();
            setOtpCode(code);

            // Compute remaining fraction for progress bar
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
          // HOTP
          const hotp = otpDetails as OTPAuth.HOTP;
          setOtpPeriod(0);
          setOtpCode(hotp.generate());
          navigation.setOptions({
            headerTitle: parsed.accountName || hotp.issuer || "Account Details",
          });
        }
      } catch (err) {
        console.error("Invalid OTP URI:", err);
        setOtpCode("Invalid");
      }
    })();
  }, [key]);

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

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: "#fff", padding: 20 }}
      contentContainerStyle={{ paddingBottom: 50 }}
    >
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
      {data?.username && (
        <Text style={{ fontSize: 12, color: "#666", textAlign: "right" }}>
          Tap to copy
        </Text>
      )}

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
        onPress={() => copyToClipboard(data?.password || "", "password")}
        activeOpacity={0.8}
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
              {data?.password
                ? showPassword
                  ? data.password
                  : "••••••••"
                : "N/A"}
            </Text>
            {data?.password ? (
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
      {data?.password && (
        <Text style={{ fontSize: 12, color: "#666", textAlign: "right" }}>
          Tap to copy
        </Text>
      )}

      {/* OTP Code */}
      {data?.value && (
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
                  color: "#000",
                }}
              >
                {otpCode}
              </Text>
            </Animated.View>
          </TouchableOpacity>

          {/* Progress Bar */}
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
    </ScrollView>
  );
}
