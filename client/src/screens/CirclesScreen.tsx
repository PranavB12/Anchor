import { useCallback, useState } from "react";
import { useFocusEffect } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";

import type { RootStackParamList } from "../navigation/AppNavigator";
import { useAuth } from "../context/AuthContext";
import { getUserCircles, type UserCircle } from "../services/circleService";

type Props = NativeStackScreenProps<RootStackParamList, "Circles">;

const colors = {
  accentPink: "#F55476",
  canvas: "#FFF8F2",
  selectedCanvas: "#F5E6DA",
  text: "#1f2937",
  muted: "#6b7280",
  lightMuted: "#9FA6B5",
  border: "#f2d9bf",
  white: "#ffffff",
  error: "#b42318",
};

function formatVisibility(value: UserCircle["visibility"]) {
  return value === "PUBLIC" ? "Public" : "Private";
}

export default function CirclesScreen({ navigation }: Props) {
  const { session } = useAuth();
  const [circles, setCircles] = useState<UserCircle[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadCircles = useCallback(async () => {
    if (!session?.access_token) {
      return;
    }
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const data = await getUserCircles(session.access_token);
      setCircles(data);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load circles.";
      setErrorMessage(message);
    } finally {
      setIsLoading(false);
    }
  }, [session?.access_token]);

  useFocusEffect(
    useCallback(() => {
      void loadCircles();
    }, [loadCircles]),
  );

  const ownedCircles = circles.filter((circle) => circle.is_owner);
  const joinedCircles = circles.filter((circle) => !circle.is_owner);

  const renderCircleCard = (circle: UserCircle) => (
    <TouchableOpacity
      key={circle.circle_id}
      style={styles.circleCard}
      activeOpacity={0.85}
      onPress={() =>
        navigation.navigate("CircleMembers", {
          circleId: circle.circle_id,
          circleName: circle.name,
          isOwner: circle.is_owner,
        })
      }
    >
      <View style={styles.circleCardTop}>
        <View style={styles.circleIcon}>
          <Feather name="users" size={18} color={colors.accentPink} />
        </View>
        <View style={styles.circleMeta}>
          <Text style={styles.circleName}>{circle.name}</Text>
          <Text style={styles.circleSubMeta}>
            {formatVisibility(circle.visibility)} · {circle.member_count}{" "}
            {circle.member_count === 1 ? "member" : "members"}
          </Text>
        </View>
        {circle.is_owner ? (
          <View style={styles.ownerBadge}>
            <Text style={styles.ownerBadgeText}>Owner</Text>
          </View>
        ) : null}
      </View>
      {circle.description ? (
        <Text style={styles.circleDescription}>{circle.description}</Text>
      ) : (
        <Text style={styles.emptyDescription}>No description yet.</Text>
      )}
    </TouchableOpacity>
  );

  return (
    <SafeAreaView edges={["top", "left", "right", "bottom"]} style={styles.safeArea}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backButton}>
          <Text style={styles.backButtonText}>← Back</Text>
        </Pressable>
        <Text style={styles.title}>My Circles</Text>
        <View style={styles.backButton} />
      </View>

      <View style={styles.actionRow}>
        <TouchableOpacity
          style={styles.primaryAction}
          onPress={() => navigation.navigate("CreateCircle")}
          activeOpacity={0.85}
        >
          <Feather name="plus" size={16} color={colors.white} />
          <Text style={styles.primaryActionText}>Create Circle</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.secondaryAction}
          onPress={() => navigation.navigate("CircleSearch")}
          activeOpacity={0.85}
        >
          <Text style={styles.secondaryActionText}>Discover</Text>
        </TouchableOpacity>
      </View>

      {isLoading ? (
        <View style={styles.centerState}>
          <ActivityIndicator color={colors.accentPink} />
          <Text style={styles.centerStateText}>Loading circles...</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Owned by You</Text>
            {ownedCircles.length > 0 ? (
              ownedCircles.map(renderCircleCard)
            ) : (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyCardTitle}>No circles yet</Text>
                <Text style={styles.emptyCardText}>
                  Create one to start sharing anchors with a specific group.
                </Text>
              </View>
            )}
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Joined Circles</Text>
            {joinedCircles.length > 0 ? (
              joinedCircles.map(renderCircleCard)
            ) : (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyCardTitle}>Nothing joined yet</Text>
                <Text style={styles.emptyCardText}>
                  Public circles you join will appear here.
                </Text>
              </View>
            )}
          </View>
        </ScrollView>
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
  actionRow: {
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  primaryAction: {
    flex: 1,
    minHeight: 46,
    borderRadius: 12,
    backgroundColor: colors.accentPink,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 6,
  },
  primaryActionText: { color: colors.white, fontSize: 15, fontWeight: "700" },
  secondaryAction: {
    minWidth: 112,
    minHeight: 46,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: "#fffdfb",
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryActionText: { color: colors.accentPink, fontSize: 15, fontWeight: "700" },
  scrollContent: { paddingHorizontal: 20, paddingBottom: 40, gap: 18 },
  centerState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  centerStateText: { color: colors.muted, fontSize: 14 },
  errorText: { color: colors.error, fontSize: 13 },
  section: { gap: 10 },
  sectionTitle: { color: colors.text, fontSize: 16, fontWeight: "800" },
  circleCard: {
    backgroundColor: colors.white,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    gap: 10,
  },
  circleCardTop: { flexDirection: "row", alignItems: "center", gap: 12 },
  circleIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.selectedCanvas,
    alignItems: "center",
    justifyContent: "center",
  },
  circleMeta: { flex: 1 },
  circleName: { color: colors.text, fontSize: 16, fontWeight: "700" },
  circleSubMeta: { marginTop: 2, color: colors.muted, fontSize: 12 },
  ownerBadge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: colors.selectedCanvas,
  },
  ownerBadgeText: { color: colors.accentPink, fontSize: 12, fontWeight: "700" },
  circleDescription: { color: colors.text, fontSize: 13, lineHeight: 19 },
  emptyDescription: { color: colors.lightMuted, fontSize: 13 },
  emptyCard: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    padding: 16,
    backgroundColor: "#fffdfb",
    gap: 6,
  },
  emptyCardTitle: { color: colors.text, fontSize: 15, fontWeight: "700" },
  emptyCardText: { color: colors.muted, fontSize: 13, lineHeight: 19 },
});
