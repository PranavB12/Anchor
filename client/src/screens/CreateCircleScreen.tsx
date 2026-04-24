import { useState } from "react";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import type { RootStackParamList } from "../navigation/AppNavigator";
import { useAuth } from "../context/AuthContext";
import { createCircle } from "../services/circleService";

type Props = NativeStackScreenProps<RootStackParamList, "CreateCircle">;
type VisibilityValue = "PUBLIC" | "PRIVATE";

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

export default function CreateCircleScreen({ navigation }: Props) {
  const { session } = useAuth();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [visibility, setVisibility] = useState<VisibilityValue>("PRIVATE");
  const [nameError, setNameError] = useState<string | null>(null);
  const [descriptionError, setDescriptionError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const descriptionRemaining = 500 - description.length;

  const validate = () => {
    let isValid = true;
    const trimmedName = name.trim();

    if (!trimmedName) {
      setNameError("Circle name is required.");
      isValid = false;
    } else {
      setNameError(null);
    }

    if (description.length > 500) {
      setDescriptionError("Description must be 500 characters or less.");
      isValid = false;
    } else {
      setDescriptionError(null);
    }

    return isValid;
  };

  const handleSubmit = async () => {
    if (!validate()) {
      return;
    }
    if (!session?.access_token) {
      setFormError("Please log in again to create a circle.");
      return;
    }

    setIsSubmitting(true);
    setFormError(null);
    try {
      await createCircle(
        {
          name: name.trim(),
          description: description.trim() || null,
          visibility,
        },
        session.access_token,
      );
      Alert.alert("Circle Created", "Your new circle is ready.", [
        {
          text: "OK",
          onPress: () => navigation.replace("Circles"),
        },
      ]);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to create circle.";
      setFormError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <SafeAreaView edges={["top", "left", "right", "bottom"]} style={styles.safeArea}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.screen}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.header}>
            <Pressable onPress={() => navigation.goBack()} style={styles.backButton}>
              <Text style={styles.backButtonText}>← Back</Text>
            </Pressable>
            <Text style={styles.title}>Create Circle</Text>
            <View style={styles.backButton} />
          </View>

          <View style={styles.card}>
            <Text style={styles.heroTitle}>Share anchors with the right people</Text>
            <Text style={styles.heroSubtitle}>
              Choose a name, add context, and decide whether the circle is discoverable.
            </Text>

            <Text style={styles.label}>Name</Text>
            <TextInput
              testID="circle-name-input"
              style={[styles.input, nameError && styles.inputError]}
              value={name}
              onChangeText={(value) => {
                setName(value);
                if (nameError) {
                  setNameError(value.trim() ? null : nameError);
                }
              }}
              placeholder="Study group, close friends, club officers..."
              placeholderTextColor={colors.lightMuted}
              maxLength={255}
            />
            {nameError ? <Text style={styles.errorText}>{nameError}</Text> : null}

            <View style={styles.descriptionHeader}>
              <Text style={styles.label}>Description</Text>
              <Text style={styles.counterText}>{descriptionRemaining}</Text>
            </View>
            <TextInput
              testID="circle-description-input"
              style={[styles.textArea, descriptionError && styles.inputError]}
              value={description}
              onChangeText={(value) => {
                setDescription(value);
                if (descriptionError && value.length <= 500) {
                  setDescriptionError(null);
                }
              }}
              placeholder="What is this circle for?"
              placeholderTextColor={colors.lightMuted}
              multiline
              maxLength={500}
              textAlignVertical="top"
            />
            {descriptionError ? <Text style={styles.errorText}>{descriptionError}</Text> : null}

            <Text style={styles.label}>Privacy</Text>
            <View style={styles.visibilityGrid}>
              {[
                {
                  value: "PRIVATE" as const,
                  title: "Private",
                  subtitle: "Invite-only. Members can’t join on their own.",
                },
                {
                  value: "PUBLIC" as const,
                  title: "Public",
                  subtitle: "Discoverable and joinable, but still used for circle-only sharing.",
                },
              ].map((option) => {
                const isSelected = visibility === option.value;
                return (
                  <TouchableOpacity
                    key={option.value}
                    testID={`circle-visibility-${option.value.toLowerCase()}`}
                    style={[styles.visibilityCard, isSelected && styles.visibilityCardSelected]}
                    onPress={() => setVisibility(option.value)}
                    activeOpacity={0.8}
                  >
                    <View style={styles.visibilityTopRow}>
                      <Text style={styles.visibilityTitle}>{option.title}</Text>
                      <View style={[styles.radioOuter, isSelected && styles.radioOuterSelected]}>
                        {isSelected ? <View style={styles.radioInner} /> : null}
                      </View>
                    </View>
                    <Text style={styles.visibilitySubtitle}>{option.subtitle}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {formError ? <Text style={styles.errorText}>{formError}</Text> : null}

            <TouchableOpacity
              testID="create-circle-submit"
              style={[styles.submitButton, isSubmitting && styles.submitButtonDisabled]}
              onPress={handleSubmit}
              disabled={isSubmitting}
              activeOpacity={0.85}
            >
              {isSubmitting ? (
                <ActivityIndicator color={colors.white} />
              ) : (
                <Text style={styles.submitButtonText}>Create Circle</Text>
              )}
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.canvas },
  screen: { flex: 1 },
  scrollContent: { paddingHorizontal: 20, paddingBottom: 32 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 16,
  },
  backButton: { width: 80 },
  backButtonText: { color: colors.accentPink, fontWeight: "600", fontSize: 15 },
  title: { fontSize: 18, fontWeight: "700", color: colors.text },
  card: {
    backgroundColor: colors.white,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 18,
  },
  heroTitle: { fontSize: 22, fontWeight: "800", color: colors.text },
  heroSubtitle: {
    marginTop: 8,
    marginBottom: 20,
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
  },
  label: {
    marginTop: 6,
    marginBottom: 8,
    color: colors.muted,
    fontSize: 13,
    fontWeight: "700",
  },
  input: {
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 14,
    fontSize: 15,
    color: colors.text,
    backgroundColor: "#fffdfb",
  },
  textArea: {
    minHeight: 120,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: colors.text,
    backgroundColor: "#fffdfb",
  },
  inputError: {
    borderColor: colors.error,
  },
  errorText: {
    marginTop: 8,
    color: colors.error,
    fontSize: 13,
  },
  descriptionHeader: {
    marginTop: 6,
    marginBottom: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  counterText: {
    color: colors.lightMuted,
    fontSize: 12,
    fontWeight: "600",
  },
  visibilityGrid: {
    gap: 12,
  },
  visibilityCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: "#fffdfb",
    padding: 14,
  },
  visibilityCardSelected: {
    borderColor: colors.accentPink,
    backgroundColor: colors.selectedCanvas,
  },
  visibilityTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  visibilityTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "700",
  },
  visibilitySubtitle: {
    marginTop: 8,
    color: colors.muted,
    fontSize: 13,
    lineHeight: 19,
  },
  radioOuter: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.white,
  },
  radioOuterSelected: {
    borderColor: colors.accentPink,
  },
  radioInner: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.accentPink,
  },
  submitButton: {
    marginTop: 22,
    minHeight: 50,
    borderRadius: 14,
    backgroundColor: colors.accentPink,
    alignItems: "center",
    justifyContent: "center",
  },
  submitButtonDisabled: {
    opacity: 0.7,
  },
  submitButtonText: {
    color: colors.white,
    fontSize: 16,
    fontWeight: "800",
  },
});
