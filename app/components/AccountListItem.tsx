import * as OTPAuth from 'otpauth';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { CountdownCircleTimer } from 'react-native-countdown-circle-timer';

export default function AccountListItem({
  account,
}: {
  account: { key: string; data: { name: string; value: string } | null };
}) {
  if (!account.data?.value) return <></>;

  const otp = OTPAuth.URI.parse(account.data?.value);
  const period = otp instanceof OTPAuth.TOTP ? otp.period : 30;
  const initialRemainingTime = otp instanceof OTPAuth.TOTP ? otp.remaining() / 1000 : 0;
  const timerKey = Math.floor(Date.now() / 1000 / period);

  const [token, setToken] = useState(otp.generate());

  const timerComplete = () => {
    setToken(otp.generate());
    return { shouldRepeat: true, delay: 0 };
  }

  return (
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
      <Text
        style={{
          fontSize: 18,
          fontWeight: '600',
          color: '#333',
          marginBottom: 8,
        }}
      >
        {account.data?.name}
      </Text>

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
          colors={[
            '#2b6db3',
            '#ffbb01',
            '#ff0101',
          ]}
          colorsTime={[period, period * 0.2, 0]}
          trailColor="#ffffffff"
          strokeWidth={6}
          size={48}
          rotation='clockwise'
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
  );
}
