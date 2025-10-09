import * as OTPAuth from 'otpauth';
import { useRef, useState } from 'react';
import {
  Alert,
  Modal,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { CountdownCircleTimer } from 'react-native-countdown-circle-timer';
import Swipeable from 'react-native-gesture-handler/Swipeable';
import Svg, { Path } from 'react-native-svg';
import * as icons from 'simple-icons';

function getProviderIcon(providerName: string) {
  if (!providerName) return null;
  const formatted = providerName.toLowerCase().replace(/\s+/g, '');
  const iconKey = `si${formatted.charAt(0).toUpperCase()}${formatted.slice(1)}`;
  return (icons as any)[iconKey] || null;
}

export default function AccountListItem({
  account,
  onDelete,
  onEdit,
}: {
  account: { key: string; data: { name: string; value: string } | null };
  onDelete: (key: string) => void;
  onEdit: (key: string, newName: string) => void;
}) {
  if (!account.data?.value) return <></>;

  const otp = OTPAuth.URI.parse(account.data?.value);
  const period = otp instanceof OTPAuth.TOTP ? otp.period : 30;
  const initialRemainingTime =
    otp instanceof OTPAuth.TOTP ? otp.remaining() / 1000 : 0;
  const timerKey = Math.floor(Date.now() / 1000 / period);

  const [token, setToken] = useState(otp.generate());
  const [isEditing, setIsEditing] = useState(false);
  const [newName, setNewName] = useState(account.data?.name || '');
  const swipeableRef = useRef<Swipeable>(null);

  const timerComplete = () => {
    setToken(otp.generate());
    return { shouldRepeat: true, delay: 0 };
  };

  // Delete confirmation
  const confirmDelete = () => {
    Alert.alert(
      'Delete Account',
      `Are you sure you want to delete "${account.data?.name}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => onDelete(account.key),
        },
      ]
    );
  };

  // Edit name confirmation modal
  const saveEdit = () => {
    if (!newName.trim()) return;
    onEdit(account.key, newName.trim());
    setIsEditing(false);
    swipeableRef.current?.close(); // close swipe automatically
  };

  // Right swipe action buttons
  const renderRightActions = () => (
    <View
      style={{
        flexDirection: 'row',
        marginVertical: 12,
        borderRadius: 12,
        overflow: 'hidden',
      }}
    >
      <TouchableOpacity
        onPress={() => setIsEditing(true)}
        style={{
          backgroundColor: '#007AFF',
          justifyContent: 'center',
          alignItems: 'center',
          width: 80,
        }}
      >
        <Text style={{ color: 'white', fontWeight: '600' }}>Edit</Text>
      </TouchableOpacity>

      <TouchableOpacity
        onPress={confirmDelete}
        style={{
          backgroundColor: '#FF3B30',
          justifyContent: 'center',
          alignItems: 'center',
          width: 80,
        }}
      >
        <Text style={{ color: 'white', fontWeight: '600' }}>Delete</Text>
      </TouchableOpacity>
    </View>
  );

  const providerIcon = getProviderIcon(account.data?.name || '');

  return (
    <>
      <Swipeable ref={swipeableRef} renderRightActions={renderRightActions}>
        <View
          style={{
            backgroundColor: '#fff',
            padding: 16,
            borderRadius: 12,
            marginBottom: 12,
            shadowColor: '#000',
            shadowOpacity: 0.05,
            shadowRadius: 5,
            shadowOffset: { width: 0, height: 2 },
            elevation: 3,
          }}
        >
          {/* Provider Icon + Name */}
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
            {providerIcon ? (
              <Svg
                width={28}
                height={28}
                viewBox="0 0 24 24"
                style={{ marginRight: 8 }}
              >
                <Path fill={`#${providerIcon.hex}`} d={providerIcon.path} />
              </Svg>
            ) : (
              <View
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 6,
                  backgroundColor: '#e0e0e0',
                  marginRight: 8,
                }}
              />
            )}

            <Text
              style={{
                fontSize: 18,
                fontWeight: '600',
                color: '#333',
                flexShrink: 1,
              }}
            >
              {account.data?.name}
            </Text>
          </View>

          {/* Token + Timer */}
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
            <Text
              style={{
                fontSize: 32,
                fontWeight: 'bold',
                color: '#007AFF',
                letterSpacing: 4,
                flex: 1,
              }}
            >
              {token}
            </Text>

            <CountdownCircleTimer
              key={timerKey}
              isPlaying
              duration={period}
              initialRemainingTime={initialRemainingTime}
              colors={['#2b6db3', '#ffbb01', '#ff0101']}
              colorsTime={[period, period * 0.2, 0]}
              trailColor="#ffffffff"
              strokeWidth={6}
              size={48}
              rotation="clockwise"
              onComplete={timerComplete}
            >
              {({ remainingTime }) => (
                <Text
                  style={{
                    fontSize: 14,
                    color: remainingTime <= 5 ? '#FF3B30' : '#666',
                    fontWeight: '500',
                  }}
                >
                  {remainingTime}
                </Text>
              )}
            </CountdownCircleTimer>
          </View>
        </View>
      </Swipeable>

      {/* Edit Modal */}
      <Modal visible={isEditing} transparent animationType="fade">
        <View
          style={{
            flex: 1,
            justifyContent: 'center',
            alignItems: 'center',
            backgroundColor: 'rgba(0,0,0,0.4)',
          }}
        >
          <View
            style={{
              backgroundColor: '#fff',
              padding: 20,
              borderRadius: 12,
              width: '80%',
            }}
          >
            <Text style={{ fontSize: 18, fontWeight: '600', marginBottom: 12 }}>
              Edit Account Name
            </Text>
            <TextInput
              value={newName}
              onChangeText={setNewName}
              placeholder="Enter new name"
              style={{
                borderWidth: 1,
                borderColor: '#ccc',
                borderRadius: 8,
                padding: 10,
                marginBottom: 16,
              }}
            />
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'flex-end',
                gap: 12,
              }}
            >
              <TouchableOpacity onPress={() => setIsEditing(false)}>
                <Text style={{ color: '#666', fontSize: 16 }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={saveEdit}>
                <Text style={{ color: '#007AFF', fontSize: 16 }}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}
