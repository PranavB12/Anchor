import { useEffect, useState, useCallback } from "react";
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
  getCircleMembers,
  inviteCircleMember,
  removeCircleMember,
  type CircleMember,
} from "../services/circleService";

type Props = NativeStackScreenProps<RootStackParamList, "CircleMembers">;

const colors = {
  accentPink: "#F55476",
  canvas: "#FFF8F2",
  text: "#1f2937",
  muted: "#6b7280",
  border: "#f2d9bf",
  white: "#ffffff",
  error: "#b42318",
  success: "#027a48",
};

export default function CircleMembersScreen({ route, navigation }: Props) {
  const { circleId, circleName, isOwner } = route.params;
  const { session } = useAuth();

  const [members, setMembers] = useState<CircleMember[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [inviteUsername, setInviteUsername] = useState("");
  const [isInviting, setIsInviting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadMembers = useCallback(async () => {
    if (!session?.access_token) return;
    setIsLoading(true);
    try {
      const data = await getCircleMembers(circleId, session.access_token);
      setMembers(data);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load members.";
      setErrorMessage(message);
    } finally {
      setIsLoading(false);
    }
  }, [circleId, session?.access_token]);

  useEffect(() => {
    void loadMembers();
  }, [loadMembers]);

  const handleInvite = async () => {
    if (!inviteUsername.trim() || !session?.access_token) return;
    setIsInviting(true);
    setErrorMessage(null);
    try {
      await inviteCircleMember(circleId, inviteUsername.trim(), session.access_token);
      setInviteUsername("");
      void loadMembers();
      Alert.alert("Success", `${inviteUsername.trim()} has been added to the circle.`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to invite member.";
      setErrorMessage(message);
    } finally {
      setIsInviting(false);
    }
  };

  const handleRemove = (member: CircleMember) => {
    Alert.alert(
      "Remove Member",
      `Are you sure you want to remove ${member.username} from this circle?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: async () => {
            if (!session?.access_token) return;
            try {
              await removeCircleMember(circleId, member.user_id, session.access_token);
              void loadMembers();
            } catch (err) {
              const message = err instanceof Error ? err.message : "Failed to remove member.";
              Alert.alert("Error", message);
            }
          },
        },
      ],
    );
  };

  return (
    <SafeAreaView edges={["top", "left", "right", "bottom"]} style={styles.safeArea}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backButton}>
          <Text style={styles.backButtonText}>← Back</Text>
        </Pressable>
        <Text style={styles.title}>{circleName}</Text>
        <View style={styles.backButton} />
      </View>

      {isOwner && (
        <View style={styles.inviteSection}>
          <Text style={styles.sectionLabel}>Invite by username</Text>
          <View style={styles.inviteRow}>
            <TextInput
              style={styles.inviteInput}
              value={inviteUsername}
              onChangeText={setInviteUsername}
              placeholder="Enter username..."
              placeholderTextColor={colors.muted}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <TouchableOpacity
              style={styles.inviteButton}
              onPress={handleInvite}
              disabled={isInviting || !inviteUsername.trim()}
            >
              {isInviting ? (
                <ActivityIndicator size="small" color={colors.white} />
              ) : (
                <Feather name="user-plus" size={18} color={colors.white} />
              )}
            </TouchableOpacity>
          </View>
          {errorMessage ? (
            <Text style={styles.errorText}>{errorMessage}</Text>
          ) : null}
        </View>
      )}

      <Text style={styles.membersLabel}>
        Members ({members.length})
      </Text>

      {isLoading ? (
        <View style={styles.centerState}>
          <ActivityIndicator color={colors.accentPink} />
        </View>
      ) : (
        <FlatList
          data={members}
          keyExtractor={(item) => item.user_id}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => (
            <View style={styles.memberRow}>
              <View style={styles.memberAvatar}>
                <Text style={styles.memberAvatarText}>
                  {item.username.charAt(0).toUpperCase()}
                </Text>
              </View>
              <View style={styles.memberInfo}>
                <Text style={styles.memberUsername}>{item.username}</Text>
                <Text style={styles.memberJoined}>
                  Joined {new Date(item.joined_at).toLocaleDateString()}
                </Text>
              </View>
              {isOwner && (
                <TouchableOpacity
                  style={styles.removeButton}
                  onPress={() => handleRemove(item)}
                >
                  <Feather name="user-minus" size={16} color={colors.error} />
                </TouchableOpacity>
              )}
            </View>
          )}
          ListEmptyComponent={
            <Text style={styles.emptyText}>No members yet. Invite someone!</Text>
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
  inviteSection: {
    marginHorizontal: 20,
    marginBottom: 20,
    padding: 16,
    backgroundColor: colors.white,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.muted,
    marginBottom: 10,
  },
  inviteRow: { flexDirection: "row", gap: 10 },
  inviteInput: {
    flex: 1,
    height: 44,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    fontSize: 15,
    color: colors.text,
    backgroundColor: "#fffdfb",
  },
  inviteButton: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: colors.accentPink,
    alignItems: "center",
    justifyContent: "center",
  },
  errorText: { marginTop: 8, color: colors.error, fontSize: 13 },
  membersLabel: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.text,
    marginHorizontal: 20,
    marginBottom: 10,
  },
  centerState: { flex: 1, alignItems: "center", justifyContent: "center" },
  listContent: { paddingHorizontal: 20, paddingBottom: 40 },
  memberRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.white,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    marginBottom: 10,
    gap: 12,
  },
  memberAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#FEE8ED",
    alignItems: "center",
    justifyContent: "center",
  },
  memberAvatarText: { color: colors.accentPink, fontWeight: "700", fontSize: 16 },
  memberInfo: { flex: 1 },
  memberUsername: { fontSize: 15, fontWeight: "600", color: colors.text },
  memberJoined: { fontSize: 12, color: colors.muted, marginTop: 2 },
  removeButton: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: "#fff1f4",
    borderWidth: 1,
    borderColor: "#fca5a5",
  },
  emptyText: {
    textAlign: "center",
    color: colors.muted,
    fontSize: 14,
    marginTop: 24,
  },
});