/**
 * Cross-platform alert helper.
 *
 * On web, `Alert.alert` is not available, so we fall back to `window.alert`.
 * Use this instead of inlining the Platform.OS check everywhere.
 *
 * @example
 *   showAlert("Error", "Something went wrong");
 */

import { Alert, Platform } from "react-native";

export function showAlert(title: string, message: string): void {
  if (Platform.OS === "web") {
    // window.alert doesn't support a title, so we combine them.
    window.alert(message ? `${title}: ${message}` : title);
  } else {
    Alert.alert(title, message);
  }
}
