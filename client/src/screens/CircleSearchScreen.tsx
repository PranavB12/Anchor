import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";

import type { RootStackParamList } from "../navigation/AppNavigator";
import { useAuth } from "../context/AuthContext";
import {
  searchCircles,
  joinCircle,
  type CircleSearchResult,
} from "../services/circleService";

type Props = NativeStackScreenProps<RootStackParamList, "CircleSearch">;

const colors = {
  accentPink: "#F55476",
  canvas: "#FFF8F2",
  text: "#1f2937",
  muted: "#6b7280",
  lightMuted: "#9FA6B5",
  border: "#f2d9bf",
  white: "#ffffff",
  error: "#b42318",
  success: "#027a48",
};

export default function CircleSearchScreen({ navigation }: Props) {
  const { session } = useAuth();

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CircleSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [joiningId, setJoiningId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSearch = useCallback(async () => {
    if (!session?.access_token) return;
    setIsSearching(true);
    setErrorMessage(null);
    setHasSearched(true);
    try {
      const data = await searchCircles(query.trim(), session.access_token);
      setResults(data);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Search failed.";
      setErrorMessage(message);
    } finally {
      setIsSearching(false);
    }
  }, [query, session?.access_token]);

  const handleJoin = useCallback(async (circle: CircleSearchResult) => {
    if (!session?.access_token) return;
    setJoiningId(circle.circle_id);
    try {
      await joinCircle(circle.circle_id, session.access_token);
      Alert.alert("Joined!", `You are now a member of ${circle.name}.`);
      const data = await searchCircles(query.trim(), session.access_token);
      setResults(data);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to join circle.";
      Alert.alert("Error", message);
    } finally {
      setJoiningId(null);
    }
  }, [query, session?.access_token]);

  return (
    <SafeAreaView edges={["top", "left", "right", "bottom"]} style={styles.safeArea}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backButton}>
          <Text style={styles.backButtonText}>← Back</Text>
        </Pressable>
        <Text style={styles.title}>Discover Circles</Text>
        <View style={styles.backButton} />
      </View>

      <View style={styles.searchSection}>
        <View style={styles.searchRow}>
          <View style={styles.searchBar}>
            <Feather name="search" size={16} color={colors.muted} />
            <TextInput
              style={styles.searchInput}
              value={query}
              onChangeText={setQuery}
              placeholder="Search public circles..."
              placeholderTextColor={colors.lightMuted}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
              onSubmitEditing={handleSearch}
            />
            {query.length > 0 ? (
              <TouchableOpacity onPress={() => {
                setQuery("");
                setResults([]);
                setHasSearched(false);
              }}>
                <Feather name="x" size={16} color={colors.muted} />
              </TouchableOpacity>
            ) : null}
          </View>
          <TouchableOpacity
            style={styles.searchButton}
            onPress={handleSearch}
            disabled={isSearching}
          >
            {isSearching ? (
              <ActivityIndicator size="small" color={colors.white} />
            ) : (
              <Text style={styles.searchButtonText}>Search</Text>
            )}
          </TouchableOpacity>
        </View>
        {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}
      </View>

      {isSearching ? (
        <View style={styles.centerState}>
          <ActivityIndicator color={colors.accentPink} />
          <Text style={styles.centerStateText}>Searching circles...</Text>
        </View>
      ) : (
        <FlatList
          data={results}
          keyExtractor={(item) => item.circle_id}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => (
            <View style={styles.circleCard}>
              <View style={styles.circleCardTop}>
                <View style={styles.circleIconWrapper}>
                  <Feather name="users" size={20} color={colors.accentPink} />
                </View>
                <View style={styles.circleInfo}>
                  <Text style={styles.circleName}>{item.name}</Text>
                  <Text style={styles.circleMemberCount}>
                    {item.member_count} {item.member_count === 1 ? "member" : "members"}
                  </Text>
                </View>
                {item.is_member ? (
                  <View style={styles.joinedBadge}>
                    <Feather name="check" size={13} color={colors.success} />
                    <Text style={styles.joinedBadgeText}>Joined</Text>
                  </View>
                ) : (
                  <TouchableOpacity
                    style={styles.joinButton}
                    onPress={() => handleJoin(item)}
                    disabled={joiningId === item.circle_id}
                  >
                    {joiningId === item.circle_id ? (
                      <ActivityIndicator size="small" color={colors.white} />
                    ) : (
                      <Text style={styles.joinButtonText}>Join</Text>
                    )}
                  </TouchableOpacity>
                )}
              </View>
              {item.description ? (
                <Text style={styles.circleDescription} numberOfLines={2}>
                  {item.description}
                </Text>
              ) : null}
            </View>
          )}
          ListEmptyComponent={
            hasSearched ? (
              <View style={styles.centerState}>
                <Feather name="search" size={32} color={colors.lightMuted} />
                <Text style={styles.emptyText}>No public circles found.</Text>
                <Text style={styles.emptySubText}>Try a different search term.</Text>
              </View>
            ) : (
              <View style={styles.centerState}>
                <Feather name="users" size={32} color={colors.lightMuted} />
                <Text style={styles.emptyText}>Search for public circles</Text>
                <Text style={styles.emptySubText}>Type a name or keyword to get started.</Text>
              </View>
            )
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.canvas },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  backButton: { width: 80 },
  backButtonText: { color: colors.accentPink, fontWeight: "600", fontSize: 15 },
  title: { fontSize: 18, fontWeight: "700", color: colors.text },
  searchSection: { paddingHorizontal: 20, paddingBottom: 16, gap: 8 },
  searchRow: { flexDirection: "row", gap: 10 },
  searchBar: {
    flex: 1,
    height: 48,
    borderRadius: 12,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  searchInput: { flex: 1, fontSize: 15, color: colors.text },
  searchButton: {
    height: 48,
    paddingHorizontal: 18,
    borderRadius: 12,
    backgroundColor: colors.accentPink,
    alignItems: "center",
    justifyContent: "center",
  },
  searchButtonText: { color: colors.white, fontWeight: "700", fontSize: 15 },
  errorText: { color: colors.error, fontSize: 13 },
  centerState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingTop: 60,
  },
  centerStateText: { color: colors.muted, fontSize: 14 },
  emptyText: { fontSize: 16, fontWeight: "700", color: colors.text, marginTop: 8 },
  emptySubText: { fontSize: 13, color: colors.muted },
  listContent: { paddingHorizontal: 20, paddingBottom: 40 },
  circleCard: {
    backgroundColor: colors.white,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    marginBottom: 12,
    gap: 10,
  },
  circleCardTop: { flexDirection: "row", alignItems: "center", gap: 12 },
  circleIconWrapper: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#FEE8ED",
    alignItems: "center",
    justifyContent: "center",
  },
  circleInfo: { flex: 1 },
  circleName: { fontSize: 15, fontWeight: "700", color: colors.text },
  circleMemberCount: { fontSize: 12, color: colors.muted, marginTop: 2 },
  circleDescription: { fontSize: 13, color: colors.muted, lineHeight: 18 },
  joinButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: colors.accentPink,
    minWidth: 60,
    alignItems: "center",
  },
  joinButtonText: { color: colors.white, fontWeight: "700", fontSize: 13 },
  joinedBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: "#ecfdf5",
    borderWidth: 1,
    borderColor: "#6ee7b7",
  },
  joinedBadgeText: { color: colors.success, fontWeight: "700", fontSize: 13 },
});