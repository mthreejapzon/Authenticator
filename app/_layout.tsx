import { Stack } from "expo-router";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { FormProvider } from "./context/FormContext"; // ✅ make sure this path is correct

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <FormProvider>
        <Stack>
          <Stack.Screen
            name="index"
            options={{
              headerTitle: "Accounts",
              headerBackVisible: false
            }}
          />
          <Stack.Screen
            name="setup"
            options={{
              headerTitle: "Add New Account",
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
          <Stack.Screen
            name="details/[key]"
            options={{
              headerTitle: "Account Details",
            }}
          />
          <Stack.Screen 
            name="settings" 
            options={{ 
              title: "Settings",
              headerShown: true 
            }} 
          />
        </Stack>
      </FormProvider>
    </GestureHandlerRootView>
  );
}
