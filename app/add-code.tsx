import { useRouter } from "expo-router";
import * as OTPAuth from "otpauth";
import { useState } from "react";
import { Alert, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Dropdown } from "react-native-element-dropdown";
import { useTheme } from "./context/ThemeContext";
import { USER_ACCOUNT_KEYS } from "./utils/constants";
import { showAlert } from "./utils/alert";
import { Storage } from "./utils/storage";

export default function AddCode() {
  const router = useRouter();
  const [code, setCode] = useState<string | undefined>(undefined);
  const [keyType, setKeyType] = useState<string | null>(null);
  const [name, setName] = useState<string | null>(null);
  const { colors } = useTheme();

  const dropdownData = [
    { label: "Time Based", value: "time" },
    { label: "Counter Based", value: "counter" },
  ];

  async function handleSubmit() {
    if (!code || !name || !keyType) {
      return showAlert("Missing fields", "Please fill in all fields");
    }
    if (code.match(/[^A-Za-z2-7]/)) {
      return showAlert("Invalid key", "The key you entered is not valid");
    }

    const OTP = keyType === "counter" ? OTPAuth.HOTP : OTPAuth.TOTP;
    const otp = new OTP({
      issuer: name,
      label: name,
      secret: code,
    });

    await saveDataToStorage({ name, value: OTPAuth.URI.stringify(otp) });

    // Redirect back to home page
    router.dismissAll();
    router.replace("/");
  }

  async function saveDataToStorage(authData: { name: string; value: string }) {
    const storageKey = `account_${Date.now()}_${Math.random().toString(36).substring(2)}`;

    const storedKeys = await Storage.getItemAsync(USER_ACCOUNT_KEYS);
    const updatedKeys = storedKeys ? JSON.parse(storedKeys) : [];
    updatedKeys.push(storageKey);

    await Storage.setItemAsync(USER_ACCOUNT_KEYS, JSON.stringify(updatedKeys));
    await Storage.setItemAsync(storageKey, JSON.stringify(authData));
  }

  return (
    <View
      style={{
        flex: 1,
        justifyContent: "space-between",
        backgroundColor: colors.background,
        padding: 12,
      }}
    >
      <View>
        <View style={{ width: "100%", alignSelf: "center" }}>
          <Text style={{ marginBottom: 4, marginTop: 15, color: colors.text }}>
            Account Name
          </Text>
          <TextInput
            placeholder="Enter a name for this account"
            placeholderTextColor={colors.subText}
            onChangeText={setName}
            style={{
              height: 40,
              borderColor: colors.inputBorder,
              borderWidth: 1,
              marginBottom: 12,
              padding: 10,
              borderRadius: 8,
              backgroundColor: colors.input,
              color: colors.text,
            }}
          />

          <Text style={{ marginBottom: 4, marginTop: 15, color: colors.text }}>
            Your Key
          </Text>
          <TextInput
            placeholder="Enter code"
            placeholderTextColor={colors.subText}
            onChangeText={setCode}
            style={{
              height: 40,
              borderColor: colors.inputBorder,
              borderWidth: 1,
              marginBottom: 12,
              padding: 10,
              borderRadius: 8,
              backgroundColor: colors.input,
              color: colors.text,
            }}
          />

          <Text style={{ marginBottom: 4, marginTop: 15, color: colors.text }}>
            Type of key
          </Text>
          <Dropdown
            style={{
              height: 40,
              borderColor: colors.inputBorder,
              borderWidth: 1,
              borderRadius: 8,
              backgroundColor: colors.input,
              paddingHorizontal: 10,
              width: "100%",
            }}
            containerStyle={{
              borderRadius: 8,
              backgroundColor: colors.card,
            }}
            itemTextStyle={{
              color: colors.text,
              fontSize: 16,
            }}
            selectedTextStyle={{
              color: colors.otpPrimary,
              fontWeight: "bold",
              fontSize: 16,
            }}
            data={dropdownData}
            labelField="label"
            valueField="value"
            placeholder="Select option"
            placeholderStyle={{ color: colors.subText }}
            value={keyType}
            onChange={(item) => setKeyType(item.value)}
          />
        </View>
      </View>

      <View style={{ alignItems: "center", marginBottom: 25 }}>
        <TouchableOpacity
          onPress={handleSubmit}
          style={{
            backgroundColor: colors.primary,
            paddingVertical: 12,
            paddingHorizontal: 32,
            borderRadius: 8,
            width: "100%",
            alignItems: "center",
          }}
        >
          <Text
            style={{ color: colors.background, fontWeight: "bold", fontSize: 16 }}
          >
            Submit
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
