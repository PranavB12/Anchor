import React, { useState } from "react";
import { Feather } from "@expo/vector-icons";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const colors = {
  accentPink: "#F55476",
  canvas: "#FFF8F2",
  selectedCanvas: "#F5E6DA",
  text: "#1f2937",
  muted: "#6b7280",
  lightMuted: "#9FA6B5",
  border: "#f2d9bf",
  white: "#ffffff",
};

type ReportReason = "SPAM" | "INAPPROPRIATE" | "HARASSMENT" | "MISINFORMATION" | "OTHER";

const REASONS: { value: ReportReason; label: string; subtitle: string; icon: string }[] = [
  { value: "SPAM",          label: "Spam",            subtitle: "Irrelevant or repetitive content",    icon: "alert-octagon" },
  { value: "INAPPROPRIATE", label: "Inappropriate",   subtitle: "Offensive or adult content",          icon: "eye-off" },
  { value: "HARASSMENT",    label: "Harassment",      subtitle: "Targeting or threatening behavior",   icon: "user-x" },
  { value: "MISINFORMATION",label: "Misinformation",  subtitle: "False or misleading information",     icon: "alert-triangle" },
  { value: "OTHER",         label: "Other",           subtitle: "Something else entirely",             icon: "more-horizontal" },
];

type Props = {
  visible: boolean;
  anchorTitle: string;
  onClose: () => void;
  onSubmit: (reason: ReportReason, description: string) => void;
};

export default function ReportAnchorModal({ visible, anchorTitle, onClose, onSubmit }: Props) {
  const insets = useSafeAreaInsets();

  const [selectedReason, setSelectedReason] = useState<ReportReason | null>(null);
  const [description, setDescription] = useState("");

  function handleClose() {
    setSelectedReason(null);
    setDescription("");
    onClose();
  }

  function handleSubmit() {
    if (!selectedReason) return;
    onSubmit(selectedReason, description.trim());
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <Pressable style={styles.overlay} onPress={handleClose}>
        <Pressable style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 24) }]} onPress={(e) => e.stopPropagation()}>
          <View style={styles.handle} />

          <View style={styles.header}>
            <View>
              <Text style={styles.title}>Report Anchor</Text>
              <Text style={styles.subtitle} numberOfLines={1}>"{anchorTitle}"</Text>
            </View>
            <TouchableOpacity onPress={handleClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Feather name="x" size={20} color={colors.muted} />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
            <Text style={styles.sectionLabel}>Why are you reporting this?</Text>

            {REASONS.map((reason) => {
              const isSelected = selectedReason === reason.value;
              return (
                <TouchableOpacity
                  key={reason.value}
                  style={[styles.reasonCard, isSelected && styles.reasonCardSelected]}
                  onPress={() => setSelectedReason(reason.value)}
                  activeOpacity={0.75}
                >
                  <View style={[styles.iconWrap, isSelected && styles.iconWrapSelected]}>
                    <Feather
                      name={reason.icon as any}
                      size={18}
                      color={isSelected ? colors.white : colors.muted}
                    />
                  </View>
                  <View style={styles.reasonText}>
                    <Text style={[styles.reasonLabel, isSelected && styles.reasonLabelSelected]}>
                      {reason.label}
                    </Text>
                    <Text style={styles.reasonSubtitle}>{reason.subtitle}</Text>
                  </View>
                  {isSelected && (
                    <Feather name="check-circle" size={18} color={colors.accentPink} />
                  )}
                </TouchableOpacity>
              );
            })}

            <Text style={styles.sectionLabel}>Additional details (optional)</Text>
            <TextInput
              style={styles.textArea}
              placeholder="Describe the issue..."
              placeholderTextColor={colors.lightMuted}
              value={description}
              onChangeText={setDescription}
              multiline
              numberOfLines={3}
              textAlignVertical="top"
            />

            <TouchableOpacity
              style={[styles.submitButton, !selectedReason && styles.submitButtonDisabled]}
              onPress={handleSubmit}
              activeOpacity={0.8}
              disabled={!selectedReason}
            >
              <Text style={styles.submitButtonText}>Submit Report</Text>
            </TouchableOpacity>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: colors.white,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: "85%",
    paddingTop: 12,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    alignSelf: "center",
    marginBottom: 16,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingHorizontal: 20,
    marginBottom: 20,
  },
  title: {
    fontSize: 17,
    fontWeight: "700",
    color: colors.text,
  },
  subtitle: {
    fontSize: 13,
    color: colors.muted,
    marginTop: 2,
    maxWidth: 260,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.muted,
    marginBottom: 10,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  reasonCard: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    backgroundColor: colors.canvas,
  },
  reasonCardSelected: {
    borderColor: colors.accentPink,
    backgroundColor: colors.selectedCanvas,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#f3f4f6",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  iconWrapSelected: {
    backgroundColor: colors.accentPink,
  },
  reasonText: {
    flex: 1,
  },
  reasonLabel: {
    fontSize: 15,
    fontWeight: "600",
    color: colors.text,
  },
  reasonLabelSelected: {
    color: colors.accentPink,
  },
  reasonSubtitle: {
    fontSize: 12,
    color: colors.muted,
    marginTop: 1,
  },
  textArea: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 14,
    fontSize: 15,
    color: colors.text,
    backgroundColor: colors.canvas,
    minHeight: 88,
    marginBottom: 20,
  },
  submitButton: {
    backgroundColor: colors.accentPink,
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: "center",
  },
  submitButtonDisabled: {
    opacity: 0.4,
  },
  submitButtonText: {
    color: colors.white,
    fontSize: 16,
    fontWeight: "700",
  },
});
