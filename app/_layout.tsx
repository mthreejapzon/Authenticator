import { Stack } from "expo-router";
import { GestureHandlerRootView } from "react-native-gesture-handler";

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
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
    </GestureHandlerRootView>
  );
}
