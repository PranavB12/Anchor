import React, { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../navigation/AppNavigator";

type Props = NativeStackScreenProps<RootStackParamList, "AnchorCreation">;

export default function AnchorCreation({ navigation }: Props) {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [visibility, setVisibility] = useState<"Public" | "Circle" | "Private">("Public");
  const [expiry, setExpiry] = useState(false);

  const handleDropAnchor = () => {
    // Add anchor submission logic here
    navigation.navigate("Map");
  };

  const VisibilityOption = ({
    id,
    title,
    subtitle,
    icon,
  }: {
    id: "Public" | "Circle" | "Private";
    title: string;
    subtitle: string;
    icon: keyof typeof Feather.glyphMap;
  }) => {
    const isSelected = visibility === id;
    return (
      <TouchableOpacity
        style={[styles.optionCard, isSelected && styles.optionCardSelected]}
        onPress={() => setVisibility(id)}
        activeOpacity={0.7}
      >
        <View style={[styles.iconContainer, isSelected && styles.iconContainerSelected]}>
          <Feather name={icon} size={20} color={isSelected ? "#ffffff" : "#6b7280"} />
        </View>
        <View style={styles.optionTextContainer}>
          <Text style={styles.optionTitle}>{title}</Text>
          <Text style={styles.optionSubtitle}>{subtitle}</Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={styles.screen}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.stepText}>Step 2 of 2</Text>

        <Text style={styles.label}>Title</Text>
        <TextInput
          style={styles.input}
          placeholder="Give your anchor a name"
          placeholderTextColor="#9ca3af"
          value={title}
          onChangeText={setTitle}
        />

        <Text style={styles.label}>Content</Text>
        <TextInput
          style={[styles.input, styles.textArea]}
          placeholder="What do you want to share?"
          placeholderTextColor="#9ca3af"
          value={content}
          onChangeText={setContent}
          multiline
          textAlignVertical="top"
        />

        <Text style={styles.sectionLabel}>Who can unlock this?</Text>
        <VisibilityOption id="Public" title="Public" subtitle="Anyone can unlock" icon="globe" />
        <VisibilityOption id="Circle" title="Circle" subtitle="Only specific groups" icon="users" />
        <VisibilityOption id="Private" title="Private" subtitle="Only you" icon="lock" />

        <Text style={styles.sectionLabel}>Expiry Settings</Text>
        <TouchableOpacity
          style={[styles.optionCard, expiry && styles.optionCardSelected]}
          onPress={() => setExpiry(!expiry)}
          activeOpacity={0.7}
        >
          <View style={[styles.iconContainer, expiry ? styles.iconContainerSelected : styles.iconContainerOutline]}>
            <Feather name="calendar" size={20} color={expiry ? "#ffffff" : "#3b82f6"} />
          </View>
          <View style={styles.optionTextContainer}>
            <Text style={styles.optionTitle}>Date & Time</Text>
            <Text style={styles.optionSubtitle}>Set specific expiry</Text>
          </View>
        </TouchableOpacity>
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity style={styles.submitButton} onPress={handleDropAnchor} activeOpacity={0.8}>
          <Text style={styles.submitButtonText}>Drop Anchor</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const colors = {
  accentWarm: "#F4BB7E",
  accentPink: "#F55476",
  canvas: "#FFF8F2",
  selectedCanvas: "#F5E6DA",
  text: "#1f2937",
  muted: "#6b7280",
  lightMuted: "#9FA6B5",
  border: "#f2d9bf",
  white: "#ffffff",
  error: "#b42318",
  success: "#027a48",
};

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.canvas,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 40,
  },
  stepText: {
    fontSize: 14,
    color: colors.muted, //TODO: change to lighter
    marginBottom: 20,
  },
  label: {
    fontSize: 15,
    fontWeight: "600",
    color: colors.text,
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: colors.text,
    marginBottom: 24,
  },
  textArea: {
    minHeight: 120,
    paddingTop: 16,
  },
  sectionLabel: {
    fontSize: 15,
    fontWeight: "600",
    color: colors.text,
    marginBottom: 12,
  },
  optionCard: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    backgroundColor: colors.canvas,
  },
  optionCardSelected: {
    borderColor: colors.accentPink,
    backgroundColor: colors.selectedCanvas,
  },
  iconContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#f3f4f6",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 14,
  },
  iconContainerOutline: {
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: colors.accentPink,
  },
  iconContainerSelected: {
    backgroundColor: colors.accentPink,
    borderWidth: 0,
  },
  optionTextContainer: {
    flex: 1,
  },
  optionTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.text,
    marginBottom: 2,
  },
  optionSubtitle: {
    fontSize: 13,
    color: colors.muted,
  },
  footer: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: Platform.OS === "ios" ? 34 : 24,
    backgroundColor: colors.canvas,
    borderTopWidth: 1,
    borderColor: colors.border,
  },
  submitButton: {
    backgroundColor: colors.accentPink,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: "center",
  },
  submitButtonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "600",
  },
});