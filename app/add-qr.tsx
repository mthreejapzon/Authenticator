import { Camera, CameraView } from "expo-camera";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Alert, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useForm } from "./context/FormContext";

export default function AddQR() {
  const router = useRouter();
  const { setFormData, resetForm } = useForm();
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);

  // ✅ useRef instead of useState for instant, synchronous updates
  const hasScannedRef = useRef(false);

  useEffect(() => {
    (async () => {
      const { status } = await Camera.requestCameraPermissionsAsync();
      setHasPermission(status === "granted");
    })();
  }, []);

  const handleBarCodeScanned = async ({ data }: { data: string }) => {
    // ✅ Prevent multiple triggers immediately
    if (hasScannedRef.current) return;
    hasScannedRef.current = true;

    try {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      // ✅ Extract secret key
      const match = data.match(/secret=([^&]+)/);
      const secret = match ? match[1] : "";
      if (!secret) throw new Error("Invalid QR format");

      setFormData({ secretKey: secret });

      // ✅ Show alert once, then go back to setup
      Alert.alert("QR Scanned", "Secret key added successfully.", [
        {
          text: "OK",
          onPress: () => {
            router.back();
          },
        },
      ]);
    } catch (error) {
      console.error(error);
      Alert.alert("Error", "Failed to scan QR code.", [
        { text: "OK", onPress: () => router.back() },
      ]);
    }
  };

  if (hasPermission === null) {
    return (
      <View style={styles.center}>
        <Text>Requesting camera permission...</Text>
      </View>
    );
  }

  if (hasPermission === false) {
    return (
      <View style={styles.center}>
        <Text>No access to camera</Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      {/* ✅ Camera only renders when not scanned */}
      {!hasScannedRef.current && (
        <CameraView onBarcodeScanned={handleBarCodeScanned} style={{ flex: 1 }} />
      )}

      {/* Cancel button */}
      <TouchableOpacity
        style={styles.cancelButton}
        onPress={() => {
          resetForm();
          router.replace("/setup");
        }}
      >
        <Text style={styles.cancelText}>Cancel</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  cancelButton: {
    position: "absolute",
    bottom: 40,
    alignSelf: "center",
    backgroundColor: "#00000088",
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 10,
  },
  cancelText: {
    color: "white",
    fontWeight: "600",
  },
});
