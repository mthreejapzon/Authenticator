import { useRouter } from "expo-router";
import { useRef } from "react";
import {
  Alert,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import Swipeable from "react-native-gesture-handler/Swipeable";
import Svg, { Path } from "react-native-svg";
import * as icons from "simple-icons";

function getProviderIcon(providerName: string) {
  if (!providerName) return null;
  const formatted = providerName.toLowerCase().replace(/\s+/g, "");
  const iconKey = `si${formatted.charAt(0).toUpperCase()}${formatted.slice(1)}`;
  return (icons as any)[iconKey] || null;
}

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
    } | null;
  };
  onDelete: (key: string) => void;
}) {
  const router = useRouter();
  const swipeableRef = useRef<Swipeable>(null);

  if (!account.data) return null;

  const providerName = account.data.accountName || "";
  const providerIcon = getProviderIcon(providerName);

  // Delete confirmation
  const confirmDelete = () => {
    Alert.alert(
      "Delete Account",
      `Are you sure you want to delete "${providerName}"?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => onDelete(account.key),
        },
      ]
    );
  };

  // Swipeable actions
  const renderRightActions = () => (
    <View
      style={{
        flexDirection: "row",
        marginVertical: 12,
        borderRadius: 12,
        overflow: "hidden",
      }}
    >
      <TouchableOpacity
        onPress={confirmDelete}
        style={{
          backgroundColor: "#FF3B30",
          justifyContent: "center",
          alignItems: "center",
          width: 80,
        }}
      >
        <Text style={{ color: "white", fontWeight: "600" }}>Delete</Text>
      </TouchableOpacity>
    </View>
  );

  // Generate fallback initials if no icon
  const initials = providerName
    ? providerName
        .replace(/[^A-Za-z0-9]/g, "")
        .slice(0, 2)
        .toUpperCase()
    : "??";

  return (
    <>
      <Swipeable ref={swipeableRef} renderRightActions={renderRightActions}>
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={() =>
            router.push({
              pathname: "/details/[key]",
              params: {
                key: account.key,
                accountName: providerName,
                username: account.data?.username || "N/A",
                password: account.data?.password || "",
                value: account.data?.value || "",
              },
            })
          }
        >
          <View
            style={{
              backgroundColor: "#fff",
              padding: 16,
              borderRadius: 12,
              marginBottom: 12,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              shadowColor: "#000",
              shadowOpacity: 0.05,
              shadowRadius: 5,
              shadowOffset: { width: 0, height: 2 },
              elevation: 3,
            }}
          >
            {/* Left section: icon or initials + name */}
            <View style={{ flexDirection: "row", alignItems: "center", flex: 1 }}>
              {providerIcon ? (
                <Svg
                  width={28}
                  height={28}
                  viewBox="0 0 24 24"
                  style={{ marginRight: 12 }}
                >
                  <Path fill={`#${providerIcon.hex}`} d={providerIcon.path} />
                </Svg>
              ) : (
                <View
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 8,
                    backgroundColor: "#e0e0e0",
                    marginRight: 12,
                    justifyContent: "center",
                    alignItems: "center",
                  }}
                >
                  <Text
                    style={{
                      color: "#555",
                      fontWeight: "700",
                      fontSize: 14,
                    }}
                  >
                    {initials}
                  </Text>
                </View>
              )}

              <View style={{ flex: 1 }}>
                <Text
                  style={{
                    fontSize: 18,
                    fontWeight: "600",
                    color: "#333",
                    flexShrink: 1,
                  }}
                >
                  {providerName}
                </Text>

                {account.data?.username && (
                  <Text style={{ color: "#999" }}>
                    {account.data.username}
                  </Text>
                )}
              </View>
            </View>

            {/* Right arrow */}
            <Text
              style={{
                fontSize: 22,
                color: "#999",
                marginLeft: 8,
                fontWeight: "300",
              }}
            >
              ›
            </Text>
          </View>
        </TouchableOpacity>
      </Swipeable>
    </>
  );
}
