import * as LocalAuthentication from "expo-local-authentication";
import { Platform } from "react-native";
import { Storage } from "./storage";

const BIOMETRICS_ENABLED_KEY = "use_biometrics";

/**
 * Checks if the device has biometric hardware and has enrolled biometrics (Face ID/Touch ID/Fingerprint).
 */
export async function isBiometricsSupported(): Promise<boolean> {
  if (Platform.OS === "web") return false;
  try {
    const hasHardware = await LocalAuthentication.hasHardwareAsync();
    const isEnrolled = await LocalAuthentication.isEnrolledAsync();
    return hasHardware && isEnrolled;
  } catch (error) {
    console.error("Error checking biometric support:", error);
    return false;
  }
}

/**
 * Returns the types of biometrics supported by the device (e.g., Face ID, Touch ID, Iris).
 */
export async function getSupportedBiometryNames(): Promise<string[]> {
  if (Platform.OS === "web") return [];
  try {
    const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
    const names: string[] = [];
    
    types.forEach((type) => {
      if (type === LocalAuthentication.AuthenticationType.FINGERPRINT) {
        names.push(Platform.OS === "ios" ? "Touch ID" : "Fingerprint");
      } else if (type === LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION) {
        names.push(Platform.OS === "ios" ? "Face ID" : "Facial Recognition");
      } else if (type === LocalAuthentication.AuthenticationType.IRIS) {
        names.push("Iris Scan");
      }
    });
    
    return names;
  } catch (error) {
    console.error("Error getting biometry types:", error);
    return [];
  }
}

/**
 * Checks if biometrics is enabled in the app settings.
 */
export async function isBiometricsEnabled(): Promise<boolean> {
  try {
    const enabled = await Storage.getItemAsync(BIOMETRICS_ENABLED_KEY);
    return enabled === "true";
  } catch (error) {
    console.error("Error getting biometrics setting:", error);
    return false;
  }
}

/**
 * Enables or disables biometrics in the app settings.
 */
export async function setBiometricsEnabled(enabled: boolean): Promise<void> {
  try {
    await Storage.setItemAsync(BIOMETRICS_ENABLED_KEY, enabled ? "true" : "false");
  } catch (error) {
    console.error("Error setting biometrics setting:", error);
    throw error;
  }
}

/**
 * Triggers the biometric authentication prompt.
 */
export async function authenticateWithBiometrics(
  promptMessage: string = "Authenticate to unlock your vault"
): Promise<boolean> {
  if (Platform.OS === "web") return false;
  try {
    const supported = await isBiometricsSupported();
    if (!supported) return false;

    const result = await LocalAuthentication.authenticateAsync({
      promptMessage,
      fallbackLabel: "Use PIN",
      disableDeviceFallback: true, // force fallback to our custom PIN UI, not device password
    });

    return result.success;
  } catch (error) {
    console.error("Error during biometric authentication:", error);
    return false;
  }
}
