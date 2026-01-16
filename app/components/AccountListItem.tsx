import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Platform, Text, TouchableOpacity, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { getProviderIcon, type IconData } from "../utils/getProviderIcon";

export default function AccountListItem({
  account,
  onDelete,
}: {
  account: {
    key: string;
    data: {
      accountName: string;
      username: string;
      password: string;
      value: string;
      isFavorite?: boolean;
    } | null;
  };
  onDelete: (key: string) => void;
}) {
  const router = useRouter();
  const [isHovered, setIsHovered] = useState(false);

  if (!account.data) return null;

  const providerName = account.data.accountName || "";
  const iconData: IconData = getProviderIcon(providerName);
  const isFavorite = account.data.isFavorite || false;

  /**
   * Render icon based on type
   */
  const renderIcon = () => {
    switch (iconData.type) {
      case "simple-icon":
        return (
          <View
            style={{
              width: 40,
              height: 40,
              borderRadius: 10,
              backgroundColor: iconData.color,
              justifyContent: "center",
              alignItems: "center",
              marginRight: 12,
            }}
          >
            <Svg width={24} height={24} viewBox="0 0 24 24">
              <Path fill="#fff" d={iconData.value.path} />
            </Svg>
          </View>
        );

      case "emoji":
        return (
          <View
            style={{
              width: 40,
              height: 40,
              borderRadius: 10,
              backgroundColor: "#f0f0f0",
              justifyContent: "center",
              alignItems: "center",
              marginRight: 12,
            }}
          >
            <Text style={{ fontSize: 24 }}>{iconData.value}</Text>
          </View>
        );

      case "initials":
      default:
        return (
          <View
            style={{
              width: 40,
              height: 40,
              borderRadius: 10,
              backgroundColor: iconData.color || "#e0e0e0",
              justifyContent: "center",
              alignItems: "center",
              marginRight: 12,
            }}
          >
            <Text
              style={{
                color: "#fff",
                fontWeight: "700",
                fontSize: 16,
              }}
            >
              {iconData.value}
            </Text>
          </View>
        );
    }
  };

  const cardContent = (
    <TouchableOpacity
      activeOpacity={0.8}
      onPress={() =>
        router.push({
          pathname: "/details/[key]",
          params: {
            key: account.key,
          },
        })
      }
      // @ts-ignore - web-only hover events
      onMouseEnter={() => Platform.OS === 'web' && setIsHovered(true)}
      onMouseLeave={() => Platform.OS === 'web' && setIsHovered(false)}
    >
      <View
        style={{
          paddingHorizontal: 16,
          paddingVertical: 14,
          marginBottom: 4,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          borderRadius: 10,
          backgroundColor: isHovered && Platform.OS === "web" ? "#f9fafb" : "#ffffff",
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", flex: 1 }}>
          {/* Leading icon container to match Figma style */}
          <View
            style={{
              width: 48,
              height: 48,
              borderRadius: 14,
              backgroundColor: "#f3f4f6",
              justifyContent: "center",
              alignItems: "center",
              marginRight: 16,
            }}
          >
            {renderIcon()}
          </View>

          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Text
                style={{
                  fontSize: 18,
                  fontWeight: "600",
                  color: "#0a0a0a",
                  flexShrink: 1,
                }}
              >
                {providerName}
              </Text>
              
              {/* Favorite Star Icon */}
              {isFavorite && (
                <Ionicons name="star" size={16} color="#FFC107" />
              )}
            </View>

            {account.data?.username && (
              <Text style={{ color: "#999", fontSize: 14 }}>
                {account.data.username}
              </Text>
            )}

            {/* Status label - only show if 2FA is actually enabled */}
            {account.data?.value && account.data.value.trim().length > 0 && (
              <Text
                style={{
                  marginTop: 2,
                  fontSize: 12,
                  fontWeight: "500",
                  color: "#155dfc",
                }}
              >
                2FA Enabled
              </Text>
            )}
          </View>
        </View>

        {/* Chevron to match mobile list design (no inline delete) */}
        <Text
          style={{
            fontSize: 20,
            color: "#c4c7d0",
            marginLeft: 8,
            fontWeight: "500",
          }}
        >
          ›
        </Text>
      </View>
    </TouchableOpacity>
  );
  
  return cardContent;
}
