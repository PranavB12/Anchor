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
  Modal,
  Pressable,
  Animated,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../navigation/AppNavigator";
import DateTimePicker, {
  DateTimePickerAndroid,
  DateTimePickerEvent
} from "@react-native-community/datetimepicker";
type Props = NativeStackScreenProps<RootStackParamList, "AnchorCreation">;
import { useSafeAreaInsets } from "react-native-safe-area-context";


// Dummy circle. TODO: CHANGE THEM LATER TO GET FROM BACKEND!!!
const DUMMY_CIRCLES = [
  { id: "1", name: "Friends", emoji: "🔥", memberCount: 8 },
  { id: "2", name: "Work", emoji: "💼", memberCount: 14 },
  { id: "3", name: "Club", emoji: "📷", memberCount: 23 },
];

type ContentType = "text" | "file" | "link";


export default function AnchorCreation({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [visibility, setVisibility] = useState<"Public" | "Circle" | "Private">("Public");

  // Date Entry
  const [creationManuallySet, setCreationManuallySet] = useState(false);
  const [creationTime, setCreationTime] = useState<Date>(new Date());
  const [expiryTime, setExpiryTime] = useState<Date | null>(null);
  const [dateError, setDateError] = useState<string | null>(null);

  const [showCreationPicker, setShowCreationPicker] = useState(false);
  const [showExpiryPicker, setShowExpiryPicker] = useState(false);

  // Cirlce entry
  const [showCircleModal, setShowCircleModal] = useState(false);
  const [selectedCircles, setSelectedCircles] = useState<string[]>([]);

  // Content entry
  const [showContentTypeModal, setShowContentTypeModal] = useState(false);
  const [contentType, setContentType] = useState<ContentType>("text");

  // helpers
  const formatDateTime = (date: Date) => {
    return date.toLocaleString([], {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
    });
  };

  const validateDates = (creation: Date, expiry: Date | null) => {
    if (expiry && creation >= expiry) {
      setDateError("Creation time must be before expiry time.");
      return false;
    }
    setDateError(null);
    return true;
  };

  const handleSetCreation = (date: Date) => {
    setCreationTime(date);
    setCreationManuallySet(true);
    validateDates(date, expiryTime);
  };

  const handleSetExpiry = (date: Date) => {
    setExpiryTime(date);
    validateDates(creationTime, date);
  };

  const handleClearCreation = () => {
    const now = new Date();
    setCreationTime(now);
    setCreationManuallySet(false);
    setDateError(null);
    if (expiryTime) validateDates(now, expiryTime);
  };

  const handleClearExpiry = () => {
    setExpiryTime(null);
    setDateError(null);
  };

  // Android date picker. iOS will probably need a different one, will have to test on iOS with an iOS device.
  const showAndroidPicker = (type: 'creation' | 'expiry') => {
    const isCreation = type === 'creation';
    const initialDate = isCreation ? creationTime : expiryTime || new Date();
    DateTimePickerAndroid.open({
      value: initialDate,
      mode: 'date',
      display: 'calendar',
      minimumDate: isCreation ? undefined : new Date(),
      onChange: (event, date) => {
        if (event.type === 'set' && date) {
          // 2. Once date is selected, open Time Picker
          DateTimePickerAndroid.open({
            value: date,
            mode: 'time',
            is24Hour: true,
            onChange: (timeEvent, finalDateTime) => {
              if (timeEvent.type === 'set' && finalDateTime) {
                if (isCreation) {
                  handleSetCreation(finalDateTime);
                } else {
                  handleSetExpiry(finalDateTime);
                }
              }
            }
          });
        }
      },
    });
  };

  const handlePressCreation = () => {
    if (Platform.OS === 'android') {
      showAndroidPicker('creation');
    } else {
      setShowCreationPicker(true);
    }
  };

  const handlePressExpiry = () => {
    if (Platform.OS === 'android') {
      showAndroidPicker('expiry');
    } else {
      setShowExpiryPicker(true);
    }
  };

  // Circles Logic
  const toggleCircle = (id: string) => {
    setSelectedCircles((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]
    );
  };

  const handleVisibilityPress = (id: "Public" | "Circle" | "Private") => {
    setVisibility(id);
    if (id === "Circle") setShowCircleModal(true);
  };


  // Submitting logic
  const handleDropAnchor = () => {
    // Add anchor submission logic here
    if (dateError) return;
    navigation.navigate("Map");
  };

  // content
  const contentTypeLabel: Record<ContentType, string> = {
    text: "Text",
    file: "File",
    link: "Link",
  };
  const contentTypeIcon: Record<ContentType, keyof typeof Feather.glyphMap> = {
    text: "align-left",
    file: "paperclip",
    link: "link",
  };

  const VisibilityOption = ({
    id,
    title: optTitle,
    subtitle,
    icon,
  }: {
    id: "Public" | "Circle" | "Private";
    title: string;
    subtitle: string;
    icon: keyof typeof Feather.glyphMap;
  }) => {
    const isSelected = visibility === id;
    const selectedCircleNames =
      id === "Circle" && selectedCircles.length > 0 ? DUMMY_CIRCLES.filter((c) => selectedCircles.includes(c.id)).map((c) => c.name).join(", ") : null;
    return (
      <TouchableOpacity
        style={[styles.optionCard, isSelected && styles.optionCardSelected]}
        onPress={() => handleVisibilityPress(id)}
        activeOpacity={0.7}
      >
        <View style={[styles.iconContainer, isSelected && styles.iconContainerSelected]}>
          <Feather name={icon} size={20} color={isSelected ? colors.white : colors.muted} />
        </View>
        <View style={styles.optionTextContainer}>
          <Text style={styles.optionTitle}>{optTitle}</Text>
          <Text style={styles.optionSubtitle} numberOfLines={1}>
            {
              id === "Circle" && selectedCircleNames ? selectedCircleNames : subtitle
            }
          </Text>
        </View>
        {
          id === "Circle" && isSelected && (
            <TouchableOpacity
              onPress={() => setShowCircleModal(true)}
              style={styles.editCirclesBtn}
            >
              <Text style={styles.editCirclesBtnText}>
                {selectedCircles.length > 0 ? `${selectedCircles.length} selected` : "Choose"}
              </Text>
              <Feather name="chevron-right" size={14} color={colors.accentPink} />
            </TouchableOpacity>
          )
        }
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
        {/* TITLE UI */}
        <Text style={styles.label}>Title</Text>
        <TextInput
          style={styles.input}
          placeholder="Give your anchor a name"
          placeholderTextColor={colors.lightMuted}
          value={title}
          onChangeText={setTitle}
        />

        {/* CONTENT UI */}
        <View style={styles.contentLabelRow}>
          <Text style={styles.label}>Content</Text>
          <TouchableOpacity
            style={styles.contentTypeBadge}
            onPress={() => setShowContentTypeModal(true)}
            activeOpacity={0.7}
          >
            <Feather
              name={contentTypeIcon[contentType]}
              size={13}
              color={colors.accentPink}
              style={{ marginRight: 4 }}
            />
            <Text style={styles.contentTypeBadgeText}>{contentTypeLabel[contentType]}</Text>
            <Feather name="chevron-down" size={13} color={colors.accentPink} />
          </TouchableOpacity>
        </View>
        {contentType === "text" && (
          <TextInput
            style={[styles.input, styles.textArea]}
            placeholder="What do you want to share?"
            placeholderTextColor={colors.lightMuted}
            value={content}
            onChangeText={setContent}
            multiline
            textAlignVertical="top"
          />
        )}
        {contentType === "file" && (
          <TouchableOpacity style={[styles.input, styles.filePlaceholder]} activeOpacity={0.7}>
            <Feather name="upload" size={22} color={colors.accentPink} />
            <Text style={styles.filePlaceholderText}>Tap to attach a file</Text>
            <Text style={styles.filePlaceholderSub}>PDF, image, audio, etc.</Text>
          </TouchableOpacity>
        )}
        {contentType === "link" && (
          <TextInput
            style={styles.input}
            placeholder="https://..."
            placeholderTextColor="#9ca3af"
            value={content}
            onChangeText={setContent}
            keyboardType="url"
            autoCapitalize="none"
          />
        )}

        {/* VISIBILITY UI */}
        <Text style={styles.sectionLabel}>Who can unlock this?</Text>
        <VisibilityOption id="Public" title="Public" subtitle="Anyone can unlock" icon="globe" />
        <VisibilityOption id="Circle" title="Circle" subtitle="Only specific groups" icon="users" />
        <VisibilityOption id="Private" title="Private" subtitle="Only you" icon="lock" />


        {/* DATE AND TIME FOR CREATION/EXPIRY UI */}
        <Text style={styles.sectionLabel}>Expiry Settings</Text>
        {dateError && (
          <View style={styles.errorBanner}>
            <Feather name="alert-circle" size={14} color={colors.error} />
            <Text style={styles.errorText}>{dateError}</Text>
          </View>
        )}


        <View style={[styles.optionCard, creationManuallySet && styles.optionCardSelected]}>
          <TouchableOpacity
            style={styles.dateCardMain}
            onPress={handlePressCreation}
            activeOpacity={0.7}
          >
            <View style={[styles.iconContainer, creationManuallySet ? styles.iconContainerSelected : styles.iconContainerOutline]}>
              <Feather name="calendar" size={20} color={creationManuallySet ? colors.white : colors.accentPink} />
            </View>
            <View style={styles.optionTextContainer}>
              <Text style={styles.optionTitle}>Creation Date & Time</Text>
              <Text style={styles.optionSubtitle}>
                {!creationManuallySet ? "Current time (tap to change)" : formatDateTime(creationTime)}
              </Text>
            </View>
          </TouchableOpacity>
          {creationManuallySet && (
            <TouchableOpacity onPress={handleClearCreation} style={styles.clearBtn} hitSlop={8}>
              <Feather name="x" size={16} color={colors.muted} />
            </TouchableOpacity>
          )}
        </View>

        {Platform.OS === 'ios' && showCreationPicker && (
          <DateTimePicker
            value={creationTime}
            mode="datetime"
            display="default"
            onChange={(e, d) => {
              if (e.type === 'set' && d) {
                handleSetCreation(d);
              }
              setShowCreationPicker(false);
            }}
          />
        )}

        <View style={[styles.optionCard, !!expiryTime && styles.optionCardSelected]}>
          <TouchableOpacity
            style={styles.dateCardMain}
            onPress={handlePressExpiry}
            activeOpacity={0.7}
          >
            <View style={[styles.iconContainer, expiryTime ? styles.iconContainerSelected : styles.iconContainerOutline]}>
              <Feather name="calendar" size={20} color={expiryTime ? colors.white : colors.accentPink} />
            </View>
            <View style={styles.optionTextContainer}>
              <Text style={styles.optionTitle}>Expiry Date & Time</Text>
              <Text style={styles.optionSubtitle}>
                {expiryTime ? formatDateTime(expiryTime) : "Set specific expiry (optional)"}
              </Text>
            </View>
          </TouchableOpacity>
          {expiryTime && (
            <TouchableOpacity onPress={handleClearExpiry} style={styles.clearBtn} hitSlop={8}>
              <Feather name="x" size={16} color={colors.muted} />
            </TouchableOpacity>
          )}
        </View>

        {Platform.OS === 'ios' && showExpiryPicker && (
          <DateTimePicker
            value={expiryTime || new Date()}
            mode="datetime"
            display="default"
            minimumDate={new Date()}
            onChange={(e, d) => {
              if (e.type === 'set' && d) handleSetExpiry(d);
              setShowExpiryPicker(false);
            }}
          />
        )}

        {/* TAGS UI TODO*/}
        <View style={styles.tagsHeader}>
          <Text style={styles.tagsTitle}>Tags</Text>
          <Text style={styles.optionalText}>(Optional)</Text>
        </View>
      </ScrollView>

      {/* DROP ANCHOR AND HANDLE REST */}
      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, Platform.OS === "ios" ? 34 : 24) }]}>
        <TouchableOpacity
          style={[styles.submitButton, !!dateError && styles.submitButtonDisabled]}
          onPress={handleDropAnchor}
          activeOpacity={0.8}
        >
          <Text style={styles.submitButtonText}>Drop Anchor</Text>
        </TouchableOpacity>
      </View>

      {/* CIRCLE PICKER MODAL */}
      <Modal
        visible={showCircleModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowCircleModal(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setShowCircleModal(false)}>
          <Pressable style={styles.bottomSheet} onPress={(e) => e.stopPropagation()}>
            {/* Handle */}
            <View style={styles.sheetHandle} />

            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Share with Circles</Text>
              <TouchableOpacity onPress={() => setShowCircleModal(false)}>
                <Feather name="x" size={20} color={colors.muted} />
              </TouchableOpacity>
            </View>

            <Text style={styles.sheetSubtitle}>
              Select the circles that can unlock this anchor
            </Text>

            <ScrollView style={styles.circleList} showsVerticalScrollIndicator={false}>
              {DUMMY_CIRCLES.map((circle) => {
                const isChosen = selectedCircles.includes(circle.id);
                return (
                  <TouchableOpacity
                    key={circle.id}
                    style={styles.circleRow}
                    onPress={() => toggleCircle(circle.id)}
                    activeOpacity={0.7}
                  >
                    {/* Avatar */}
                    <View style={styles.circleAvatar}>
                      <Text style={styles.circleEmoji}>{circle.emoji}</Text>
                    </View>
                    {/* Info */}
                    <View style={styles.circleInfo}>
                      <Text style={styles.circleName}>{circle.name}</Text>
                      <Text style={styles.circleMeta}>{circle.memberCount} members</Text>
                    </View>
                    {/* Checkbox */}
                    <View
                      style={[
                        styles.circleCheckbox,
                        isChosen && styles.circleCheckboxSelected,
                      ]}
                    >
                      {isChosen && <Feather name="check" size={13} color={colors.white} />}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {/* Done button */}
            <TouchableOpacity
              style={[
                styles.sheetDoneBtn,
                selectedCircles.length === 0 && styles.sheetDoneBtnDisabled,
              ]}
              onPress={() => setShowCircleModal(false)}
              activeOpacity={0.8}
            >
              <Text style={styles.sheetDoneBtnText}>
                {selectedCircles.length === 0
                  ? "Select at least one circle"
                  : `Done · ${selectedCircles.length} selected`}
              </Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      {/* CONTENT TYPE MODAL */}
      <Modal
        visible={showContentTypeModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowContentTypeModal(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setShowContentTypeModal(false)}>
          <Pressable style={styles.bottomSheetSmall} onPress={(e) => e.stopPropagation()}>
            <View style={styles.sheetHandle} />
            <Text style={[styles.sheetTitle, { marginBottom: 4, marginTop: 4 }]}>
              Content Type
            </Text>
            <Text style={[styles.sheetSubtitle, { marginBottom: 16 }]}>
              Choose how to share your anchor's content
            </Text>

            {(["text", "file", "link"] as ContentType[]).map((type) => {
              const isActive = contentType === type;
              const labels: Record<ContentType, string> = {
                text: "Text",
                file: "File Attachment",
                link: "Link / URL",
              };
              const descs: Record<ContentType, string> = {
                text: "Write a message or note",
                file: "Attach a document, image, or audio",
                link: "Share a URL",
              };
              return (
                <TouchableOpacity
                  key={type}
                  style={[styles.contentTypeRow, isActive && styles.contentTypeRowActive]}
                  onPress={() => {
                    setContentType(type);
                    setContent("");
                    setShowContentTypeModal(false);
                  }}
                  activeOpacity={0.7}
                >
                  <View
                    style={[
                      styles.iconContainer,
                      isActive ? styles.iconContainerSelected : styles.iconContainerOutline,
                    ]}
                  >
                    <Feather
                      name={contentTypeIcon[type]}
                      size={20}
                      color={isActive ? colors.white : colors.accentPink}
                    />
                  </View>
                  <View style={styles.optionTextContainer}>
                    <Text style={styles.optionTitle}>{labels[type]}</Text>
                    <Text style={styles.optionSubtitle}>{descs[type]}</Text>
                  </View>
                  {isActive && (
                    <Feather name="check-circle" size={20} color={colors.accentPink} />
                  )}
                </TouchableOpacity>
              );
            })}
          </Pressable>
        </Pressable>
      </Modal>
    </KeyboardAvoidingView>
  );
}

// TODO: Clear creation/expiry. Creation b4 expiry. iOS checks. adding circle options to visibility options. Option to change from text to file/link. Tags

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
  label: {
    fontSize: 15,
    fontWeight: "600",
    color: colors.text,
    marginBottom: 8,
  },
  sectionLabel: {
    fontSize: 15,
    fontWeight: "600",
    color: colors.text,
    marginBottom: 12,
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
  contentLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  contentTypeBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FEE8ED",
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 5,
    gap: 3,
  },
  contentTypeBadgeText: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.accentPink,
  },
  filePlaceholder: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: 120,
    gap: 8,
    borderStyle: "dashed",
  },
  filePlaceholderText: {
    fontSize: 15,
    fontWeight: "600",
    color: colors.text
  },
  filePlaceholderSub: {
    fontSize: 13,
    color: colors.muted,
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
  editCirclesBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    paddingLeft: 8,
  },
  editCirclesBtnText: {
    fontSize: 13,
    color: colors.accentPink,
    fontWeight: "600",
  },
  dateCardMain: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
  },
  clearBtn: {
    padding: 4,
    marginLeft: 8,
    backgroundColor: "#f3f4f6",
    borderRadius: 20,
  },
  errorBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#fef2f2",
    borderWidth: 1,
    borderColor: "#fecaca",
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
  },
  errorText: { fontSize: 13, color: colors.error, flex: 1 },

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
  submitButtonDisabled: { opacity: 0.5 },
  submitButtonText: {
    color: colors.white,
    fontSize: 16,
    fontWeight: "600",
  },
  tagsHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 24,
    marginBottom: 12,
  },
  tagsTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.text,
  },
  optionalText: {
    fontSize: 14,
    color: colors.lightMuted,
    marginLeft: 8,
    fontStyle: "italic",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "flex-end",
  },
  bottomSheet: {
    backgroundColor: colors.white,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingBottom: Platform.OS === "ios" ? 40 : 28,
    maxHeight: "75%",
  },
  bottomSheetSmall: {
    backgroundColor: colors.white,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingBottom: Platform.OS === "ios" ? 40 : 28,
  },
  sheetHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#e5e7eb",
    alignSelf: "center",
    marginTop: 12,
    marginBottom: 16,
  },
  sheetHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  sheetTitle: { fontSize: 18, fontWeight: "700", color: colors.text },
  sheetSubtitle: { fontSize: 14, color: colors.muted, marginBottom: 16 },
  circleList: { marginBottom: 16 },
  circleRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#f9fafb",
  },
  circleAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.selectedCanvas,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 14,
  },
  circleEmoji: { fontSize: 22 },
  circleInfo: { flex: 1 },
  circleName: { fontSize: 16, fontWeight: "600", color: colors.text },
  circleMeta: { fontSize: 13, color: colors.muted, marginTop: 2 },
  circleCheckbox: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  circleCheckboxSelected: { backgroundColor: colors.accentPink, borderColor: colors.accentPink },
  sheetDoneBtn: {
    backgroundColor: colors.accentPink,
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: "center",
    marginTop: 4,
  },
  sheetDoneBtnDisabled: { backgroundColor: "#f3a3b5" },
  sheetDoneBtnText: { color: colors.white, fontSize: 15, fontWeight: "600" },
  contentTypeRow: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    backgroundColor: colors.canvas,
  },
  contentTypeRowActive: { borderColor: colors.accentPink, backgroundColor: colors.selectedCanvas },
});