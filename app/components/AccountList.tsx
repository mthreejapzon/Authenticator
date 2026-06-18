import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { SectionList, Text, TextInput, TouchableOpacity, View } from "react-native";
import { useTheme } from "../context/ThemeContext";
import AccountListItem from "./AccountListItem";

type SortMode = "alphabetical" | "date";
type SortOrder = "asc" | "desc";

export default function AccountList(props: {
  accounts: {
    key: string;
    data: {
      accountName: string;
      username: string;
      password: string;
      value: string;
      isFavorite?: boolean;
      createdAt?: string;
      tags?: string[];
    } | null;
  }[];
  onDelete: (key: string) => void;
  onEdit: (key: string, newName: string) => void;
}) {
  const { accounts, onDelete } = props;
  const { colors } = useTheme();
  const [sortMode, setSortMode] = useState<SortMode>("alphabetical");
  const [sortOrder, setSortOrder] = useState<SortOrder>("asc");
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [showSortSheet, setShowSortSheet] = useState(false);

  const activeFilterCount =
    (selectedTag ? 1 : 0) +
    (sortMode !== "alphabetical" || sortOrder !== "asc" ? 1 : 0);

  const allTags = Array.from(
    new Set(accounts.flatMap((acc) => acc.data?.tags ?? [])),
  ).sort((a, b) => a.localeCompare(b));

  // 1. Filter by search query (name or username)
  const searchedAccounts = searchQuery.trim()
    ? accounts.filter((acc) => {
        const q = searchQuery.trim().toLowerCase();
        return (
          acc.data?.accountName?.toLowerCase().includes(q) ||
          acc.data?.username?.toLowerCase().includes(q)
        );
      })
    : accounts;

  // 2. Filter by selected tag
  const filteredAccounts = selectedTag
    ? searchedAccounts.filter((acc) => acc.data?.tags?.includes(selectedTag))
    : searchedAccounts;

  const sortAccounts = (
    list: typeof accounts,
    mode: SortMode,
    order: SortOrder,
  ): typeof accounts => {
    const direction = order === "asc" ? 1 : -1;

    if (mode === "alphabetical") {
      return [...list].sort(
        (a, b) =>
          direction *
          (a.data?.accountName
            .toLowerCase()
            .localeCompare(b.data?.accountName.toLowerCase() ?? "") ?? 0),
      );
    }

    return [...list].sort((a, b) => {
      const dateA = a.data?.createdAt
        ? new Date(a.data.createdAt).getTime()
        : Infinity;
      const dateB = b.data?.createdAt
        ? new Date(b.data.createdAt).getTime()
        : Infinity;
      return direction * (dateA - dateB);
    });
  };

  const favoriteAccounts = sortAccounts(
    filteredAccounts.filter((acc) => acc.data?.isFavorite),
    sortMode,
    sortOrder,
  );

  const regularAccounts = sortAccounts(
    filteredAccounts.filter((acc) => !acc.data?.isFavorite),
    sortMode,
    sortOrder,
  );

  const sections = [];
  if (favoriteAccounts.length > 0) {
    sections.push({ title: "Favorites", data: favoriteAccounts });
  }
  if (regularAccounts.length > 0) {
    sections.push({
      title: favoriteAccounts.length > 0 ? "All Accounts" : "",
      data: regularAccounts,
    });
  }

  const sortModeLabels: Record<SortMode, string> = {
    alphabetical: "A → Z",
    date: "Date Created",
  };

  const sortOrderLabels: Record<SortMode, Record<SortOrder, string>> = {
    alphabetical: { asc: "A → Z", desc: "Z → A" },
    date: { asc: "Oldest first", desc: "Newest first" },
  };

  return (
    <View style={{ flex: 1 }}>

      {/* ── Search Bar ── */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          backgroundColor: colors.input,
          borderRadius: 12,
          borderWidth: 1,
          borderColor: colors.inputBorder,
          paddingHorizontal: 12,
          marginBottom: 8,
          height: 44,
          gap: 8,
        }}
      >
        <Ionicons name="search-outline" size={18} color={colors.subText} />
        <TextInput
          placeholder="Search accounts..."
          placeholderTextColor={colors.subText}
          value={searchQuery}
          onChangeText={setSearchQuery}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          style={{
            flex: 1,
            fontSize: 15,
            color: colors.text,
            paddingVertical: 0,
          }}
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery("")} hitSlop={8}>
            <Ionicons name="close-circle" size={18} color={colors.subText} />
          </TouchableOpacity>
        )}
      </View>

      {/* ── Sort & Filter Row ── */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          paddingHorizontal: 4,
          paddingVertical: 8,
          minHeight: 44,
        }}
      >
        {/* Active tag pill — left side */}
        {selectedTag ? (
          <TouchableOpacity
            onPress={() => setSelectedTag(null)}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 6,
              paddingHorizontal: 12,
              paddingVertical: 5,
              borderRadius: 20,
              backgroundColor: colors.tagChipBg ?? colors.card,
              borderWidth: 1,
              borderColor: colors.tagChipBorder ?? colors.border,
            }}
          >
            <Text
              style={{
                fontSize: 12,
                fontWeight: "600",
                color: colors.tagChipText ?? colors.text,
              }}
            >
              {selectedTag}
            </Text>
            <Text
              style={{ fontSize: 12, color: colors.tagChipText ?? colors.text }}
            >
              ✕
            </Text>
          </TouchableOpacity>
        ) : (
          <View />
        )}

        {/* Sort & Filter button — right side */}
        <TouchableOpacity
          onPress={() => setShowSortSheet(true)}
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 6,
            paddingHorizontal: 12,
            paddingVertical: 6,
            borderRadius: 20,
            borderWidth: 1,
            borderColor: activeFilterCount > 0 ? colors.primary : colors.border,
            backgroundColor:
              activeFilterCount > 0 ? colors.primary : colors.card,
          }}
        >
          <Text
            style={{
              fontSize: 14,
              color: activeFilterCount > 0 ? colors.background : colors.subText,
            }}
          >
            ⇅
          </Text>
          <Text
            style={{
              fontSize: 13,
              fontWeight: "500",
              color: activeFilterCount > 0 ? colors.background : colors.subText,
            }}
          >
            Sort & Filter
            {activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}
          </Text>
        </TouchableOpacity>
      </View>

      {/* ── Search empty state ── */}
      {searchQuery.trim() !== "" && filteredAccounts.length === 0 ? (
        <View
          style={{
            flex: 1,
            alignItems: "center",
            justifyContent: "center",
            paddingBottom: 60,
            gap: 8,
          }}
        >
          <Ionicons name="search-outline" size={40} color={colors.subText} />
          <Text
            style={{
              fontSize: 16,
              fontWeight: "600",
              color: colors.text,
              marginTop: 4,
            }}
          >
            No results found
          </Text>
          <Text style={{ fontSize: 14, color: colors.subText, textAlign: "center" }}>
            No accounts match{" "}
            <Text style={{ fontWeight: "600" }}>"{searchQuery}"</Text>
          </Text>
          <TouchableOpacity
            onPress={() => setSearchQuery("")}
            style={{
              marginTop: 8,
              paddingHorizontal: 20,
              paddingVertical: 10,
              borderRadius: 10,
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: colors.card,
            }}
          >
            <Text style={{ fontSize: 14, color: colors.subText, fontWeight: "500" }}>
              Clear search
            </Text>
          </TouchableOpacity>
        </View>
      ) : (
        <SectionList
          sections={sections}
          renderItem={({ item }) => (
            <AccountListItem account={item} onDelete={onDelete} />
          )}
          renderSectionHeader={({ section: { title } }) =>
            title ? (
              <View
                style={{ paddingHorizontal: 4, paddingVertical: 8, marginTop: 8 }}
              >
                <Text
                  style={{
                    fontSize: 14,
                    fontWeight: "600",
                    color: colors.subText,
                    textTransform: "uppercase",
                    letterSpacing: 0.5,
                  }}
                >
                  {title}
                </Text>
              </View>
            ) : null
          }
          keyExtractor={(item) => item.key}
          stickySectionHeadersEnabled={false}
        />
      )}

      {/* Sort & Filter Bottom Sheet */}
      {showSortSheet && (
        <TouchableOpacity
          activeOpacity={1}
          onPress={() => setShowSortSheet(false)}
          style={{
            position: "absolute",
            inset: 0,
            backgroundColor: "rgba(0,0,0,0.4)",
            justifyContent: "flex-end",
          }}
        >
          <TouchableOpacity activeOpacity={1}>
            <View
              style={{
                backgroundColor: colors.card,
                borderTopLeftRadius: 20,
                borderTopRightRadius: 20,
                padding: 20,
                gap: 20,
              }}
            >
              {/* Handle */}
              <View style={{ alignItems: "center" }}>
                <View
                  style={{
                    width: 36,
                    height: 4,
                    borderRadius: 2,
                    backgroundColor: colors.border,
                  }}
                />
              </View>

              {/* Sort by */}
              <View style={{ gap: 10 }}>
                <Text
                  style={{
                    fontSize: 13,
                    fontWeight: "600",
                    color: colors.subText,
                    textTransform: "uppercase",
                    letterSpacing: 0.5,
                  }}
                >
                  Sort By
                </Text>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  {(["alphabetical", "date"] as SortMode[]).map((mode) => (
                    <TouchableOpacity
                      key={mode}
                      onPress={() => setSortMode(mode)}
                      style={{
                        flex: 1,
                        paddingVertical: 10,
                        borderRadius: 12,
                        alignItems: "center",
                        backgroundColor:
                          sortMode === mode
                            ? colors.primary
                            : colors.background,
                        borderWidth: 1,
                        borderColor:
                          sortMode === mode ? colors.primary : colors.border,
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 13,
                          fontWeight: "600",
                          color:
                            sortMode === mode
                              ? colors.background
                              : colors.subText,
                        }}
                      >
                        {sortModeLabels[mode]}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Order */}
              <View style={{ gap: 10 }}>
                <Text
                  style={{
                    fontSize: 13,
                    fontWeight: "600",
                    color: colors.subText,
                    textTransform: "uppercase",
                    letterSpacing: 0.5,
                  }}
                >
                  Order
                </Text>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  {(["asc", "desc"] as SortOrder[]).map((order) => (
                    <TouchableOpacity
                      key={order}
                      onPress={() => setSortOrder(order)}
                      style={{
                        flex: 1,
                        paddingVertical: 10,
                        borderRadius: 12,
                        alignItems: "center",
                        backgroundColor:
                          sortOrder === order
                            ? colors.primary
                            : colors.background,
                        borderWidth: 1,
                        borderColor:
                          sortOrder === order ? colors.primary : colors.border,
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 13,
                          fontWeight: "600",
                          color:
                            sortOrder === order
                              ? colors.background
                              : colors.subText,
                        }}
                      >
                        {sortOrderLabels[sortMode][order]}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Tags */}
              {allTags.length > 0 && (
                <View style={{ gap: 10 }}>
                  <Text
                    style={{
                      fontSize: 13,
                      fontWeight: "600",
                      color: colors.subText,
                      textTransform: "uppercase",
                      letterSpacing: 0.5,
                    }}
                  >
                    Filter by Tag
                  </Text>
                  <View
                    style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}
                  >
                    {allTags.map((tag) => (
                      <TouchableOpacity
                        key={tag}
                        onPress={() =>
                          setSelectedTag(selectedTag === tag ? null : tag)
                        }
                        style={{
                          paddingHorizontal: 14,
                          paddingVertical: 7,
                          borderRadius: 20,
                          backgroundColor:
                            selectedTag === tag
                              ? (colors.tagChipBg ?? colors.card)
                              : colors.background,
                          borderWidth: 1,
                          borderColor:
                            selectedTag === tag
                              ? (colors.tagChipBorder ?? colors.border)
                              : colors.border,
                        }}
                      >
                        <Text
                          style={{
                            fontSize: 13,
                            fontWeight: "500",
                            color:
                              selectedTag === tag
                                ? (colors.tagChipText ?? colors.text)
                                : colors.subText,
                          }}
                        >
                          {tag}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              )}

              {/* Reset */}
              <TouchableOpacity
                onPress={() => {
                  setSortMode("alphabetical");
                  setSortOrder("asc");
                  setSelectedTag(null);
                }}
                style={{
                  paddingVertical: 12,
                  borderRadius: 12,
                  alignItems: "center",
                  borderWidth: 1,
                  borderColor: colors.border,
                  backgroundColor: colors.background,
                }}
              >
                <Text
                  style={{
                    fontSize: 14,
                    fontWeight: "600",
                    color: colors.subText,
                  }}
                >
                  Reset
                </Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      )}
    </View>
  );
}
