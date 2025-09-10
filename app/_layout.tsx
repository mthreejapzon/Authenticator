import { Stack } from "expo-router";

export default function RootLayout() {
  return (
    <Stack>
      <Stack.Screen
        name="index"
        options={{
          headerTitle: "Home",
        }}
      />
      <Stack.Screen
        name="setup"
        options={{
          headerTitle: "Add Code",
        }}
      />
      <Stack.Screen
        name="add-qr"
        options={{
          headerTitle: "Scan QR Code",
        }}
      />
      <Stack.Screen
        name="add-code"
        options={{
          headerTitle: "Enter Code Manually",
        }}
      />
    </Stack>
  );
}
