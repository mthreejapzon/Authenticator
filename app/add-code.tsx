import { useRouter } from 'expo-router';
import * as OTPAuth from 'otpauth';
import { Storage } from './utils/storage';
import { useState } from 'react';
import { Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Dropdown } from 'react-native-element-dropdown';

export default function AddCode() {
  const router = useRouter();
  const [code, setCode] = useState<string | undefined>(undefined);
  const [keyType, setKeyType] = useState(null);
  const [name, setName] = useState<string | null>(null);

  const dropdownData = [
    { label: 'Time Based', value: 'time' },
    { label: 'Counter Based', value: 'counter' },
  ];

  async function handleSubmit() {
    if (!code || !name || !keyType) return alert('Please fill in all fields');
    if (code.match(/[^A-Za-z2-7]/)) return alert('The key you entered is not valid');

    const OTP = keyType === 'counter' ? OTPAuth.HOTP : OTPAuth.TOTP;
    const otp = new OTP({
      issuer: 'ACME',
      label: name,
      secret: code,
    });
    
    saveDataToStorage({ name, value: OTPAuth.URI.stringify(otp) });
    
    // Redirect back to home page
    router.dismissAll();
    router.replace('/');
  }

  async function saveDataToStorage(authData: { name: string; value: string }) {
    const storageKey = Math.random().toString(36).substring(2);

    // We're saving two things:
    // 1. A list of all user account keys (so we can show them on the home screen)
    // 2. The actual auth data, stored using a unique key
    //
    // 
    // userAccountKeys: ["asdf1234", "qwer4567"]
    // asdf1234: { name: "My Account", data: "otpauth://totp/..." }
    // qwer4567: { name: "Another Account", data: "otpauth://totp/..." }
    
    // Store the new key in an array of user account keys

    await Storage.getItemAsync('userAccountKeys').then(async(storedKeys) => {
      const updatedKeys = storedKeys ? JSON.parse(storedKeys) : [];
      updatedKeys.push(storageKey);

      await Storage.setItemAsync('userAccountKeys', JSON.stringify(updatedKeys));
    });

    // Store the actual auth data using the generated key
    await Storage.setItemAsync(storageKey, JSON.stringify(authData));
  }

  return (
    <View style={{ flex: 1, justifyContent: 'space-between', backgroundColor: '#f8f9fa' , padding: 12}}>
      <View>
        <View style={{ width: '100%', alignSelf: 'center' }}>
          <Text style={{ marginBottom: 4, marginTop: 15 }}>Account Name</Text>
          <TextInput
            placeholder="Enter a name for this QR"
            placeholderTextColor="gray"
            onChangeText={setName}
            style={{
              height: 40,
              borderColor: 'gray',
              borderWidth: 1,
              marginBottom: 12,
              padding: 10,
              borderRadius: 8,
              backgroundColor: 'white',
            }}
          />

          <Text style={{ marginBottom: 4, marginTop: 15 }}>Your Key</Text>
          <TextInput
            placeholder="Enter code"
            placeholderTextColor="gray"
            onChangeText={setCode}
            style={{
              height: 40,
              borderColor: 'gray',
              borderWidth: 1,
              marginBottom: 12,
              padding: 10,
              borderRadius: 8,
              backgroundColor: 'white',
            }}
          />

          <Text style={{ marginBottom: 4, marginTop: 15 }}>Type of key</Text>
          <Dropdown
            style={{
              height: 40,
              borderColor: 'gray',
              borderWidth: 1,
              borderRadius: 8,
              backgroundColor: 'white',
              paddingHorizontal: 10,
              width: '100%',
            }}
            containerStyle={{
              borderRadius: 8,
              backgroundColor: 'white',
              position: 'relative',
            }}
            itemTextStyle={{
              color: 'black',
              fontSize: 16,
            }}
            selectedTextStyle={{
              color: '#007AFF',
              fontWeight: 'bold',
              fontSize: 16,
            }}
            data={dropdownData}
            labelField="label"
            valueField="value"
            placeholder="Select option"
            value={keyType}
            onChange={item => setKeyType(item.value)}
          />
        </View>
      </View>

      <View 
        style={{
          alignItems: 'center',
          marginBottom: 25,
        }}
      >
        <TouchableOpacity
          onPress={handleSubmit}
          style={{
            backgroundColor: '#007AFF',
            paddingVertical: 12,
            paddingHorizontal: 32,
            borderRadius: 8,
            width: '100%',
            alignItems: 'center',
          }}
        >
          <Text style={{ color: 'white', fontWeight: 'bold', fontSize: 16 }}>Submit</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
