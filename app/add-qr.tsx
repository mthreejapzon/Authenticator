import { BarcodeScanningResult, CameraView, useCameraPermissions } from 'expo-camera';
import { useRouter } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import * as OTPAuth from 'otpauth';
import { useState } from 'react';
import { Button, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

export default function AddQR() {
  const router = useRouter();
  const [permission, requestPermission] = useCameraPermissions();
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [name, setName] = useState<string | null>(null);

  if (!permission) {
    // Camera permissions are still loading.
    return <View />;
  }

  if (!permission.granted) {
    // Camera permissions are not granted yet.
    return (
      <View style={styles.container}>
        <Text style={styles.message}>We need your permission to show the camera</Text>
        <Button onPress={requestPermission} title="grant permission" />
      </View>
    );
  }

  function saveQrCode(result: BarcodeScanningResult) {
    if (qrCode) return;

    setQrCode(result.data);

    try {
      // Validate QR code
      OTPAuth.URI.parse(result.data);
    } catch (e) {
      alert('Invalid QR code');
      router.push('/setup');
    }
  }

  async function saveDataAndRedirect() {
    if (!qrCode || !name) return;

    const storageKey = Math.random().toString(36).substring(2);
    const authData = { name, value: qrCode };

    // We're saving two things:
    // 1. A list of all user account keys (so we can show them on the home screen)
    // 2. The actual auth data, stored using a unique key
    //
    // 
    // userAccountKeys: ["asdf1234", "qwer4567"]
    // asdf1234: { name: "My Account", data: "otpauth://totp/..." }
    // qwer4567: { name: "Another Account", data: "otpauth://totp/..." }
    
    // Store the new key in an array of user account keys
    await SecureStore.getItemAsync('userAccountKeys').then(async(storedKeys) => {
      const updatedKeys = storedKeys ? JSON.parse(storedKeys) : [];
      updatedKeys.push(storageKey);

      await SecureStore.setItemAsync('userAccountKeys', JSON.stringify(updatedKeys));
    });
    
    // Store the actual auth data using the generated key
    await SecureStore.setItemAsync(storageKey, JSON.stringify(authData));
    
    // Redirect back to home page
    router.push('/');
  }

  return (
    <View style={styles.container}>
      {qrCode ? (
        <>
          <Text
            style={{ 
              marginBottom: 5, 
              marginLeft: 12, 
              marginRight: 12,
            }}
          >
            Account Name
          </Text>

          <TextInput
            placeholder="Enter a name for this QR"
            placeholderTextColor={"gray"}
            onChangeText={(input) => setName(input)}
            style={{
              height: 40,
              borderColor: 'gray',
              borderWidth: 1,
              marginLeft: 12,
              marginRight: 12,
              padding: 10,
              backgroundColor: 'white',
              borderRadius: 8,
            }}
          />
          <View 
            style={{
              marginTop: 10,
              alignItems: 'center',
              paddingLeft: 12,
              paddingRight: 12,
            }}
          >
          </View>
          <View 
            style={{ 
              marginTop: 20,
              alignItems: 'center',
              position: 'absolute',
              bottom: 30,
              left: 13,
              right: 13,
            }}
          >
            <TouchableOpacity
                onPress={saveDataAndRedirect}
                style={{
                  backgroundColor: '#007AFF',
                  paddingVertical: 12,
                  paddingHorizontal: 32,
                  borderRadius: 8,
                  width: '100%',
                  alignItems: 'center',
                }}
              >
                <Text 
                  style={{
                    color: 'white',
                    fontWeight: 'bold',
                    fontSize: 16,
                  }}
                >
                  Submit
                </Text>
              </TouchableOpacity>
            </View>
        </>
      ) : (
        <CameraView 
          style={styles.camera} 
          facing="back"
          barcodeScannerSettings={{
            barcodeTypes: ['qr']
          }}
          onBarcodeScanned={saveQrCode}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: 25,
  },
  message: {
    textAlign: 'center',
    paddingBottom: 10,
  },
  camera: {
    flex: 1,
  },
  button: {
    flex: 1,
    alignItems: 'center',
  },
  text: {
    fontSize: 24,
    fontWeight: 'bold',
    color: 'white',
  },
});
