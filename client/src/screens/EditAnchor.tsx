import React, { useState } from "react";
import {
    KeyboardAvoidingView,
    Modal,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
    Alert,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../navigation/AppNavigator";
import DateTimePicker, {
    DateTimePickerAndroid,
    DateTimePickerEvent,
} from "@react-native-community/datetimepicker";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "../context/AuthContext";
import { updateAnchor } from "../services/anchorService";

type Props = NativeStackScreenProps<RootStackParamList, "EditAnchor">;

// ─── Dummy Circles ─────────────────────────────────────────────────────────
const DUMMY_CIRCLES = [
    { id: "1", name: "Friends", emoji: "🔥", memberCount: 8 },
    { id: "2", name: "Work", emoji: "💼", memberCount: 14 },
    { id: "3", name: "Club", emoji: "📷", memberCount: 23 },
];

// ─── Suggested tags ────────────────────────────────────────────────────────
const SUGGESTED_TAGS = ["nature", "chill", "secret", "food", "art", "music", "study", "event", "surprise", "local"];

type ContentType = "text" | "file" | "link";

function backendToFrontendVisibility(v: string): "Public" | "Circle" | "Private" {
    if (v === "PUBLIC") return "Public";
    if (v === "CIRCLE_ONLY") return "Circle";
    return "Private";
}

function frontendToBackendVisibility(v: "Public" | "Circle" | "Private") {
    if (v === "Public") return "PUBLIC";
    if (v === "Circle") return "CIRCLE_ONLY";
    return "PRIVATE";
}

export default function EditAnchor({ navigation, route }: Props) {
    const { anchor, radius } = route.params;
    const { session } = useAuth();
    const insets = useSafeAreaInsets();

    const [title, setTitle] = useState(anchor.title);
    const [content, setContent] = useState(anchor.description ?? "");
    const [visibility, setVisibility] = useState<"Public" | "Circle" | "Private">(
        backendToFrontendVisibility(anchor.visibility)
    );
    const [maxUnlock, setMaxUnlock] = useState(anchor.max_unlock != null ? String(anchor.max_unlock) : "");
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Dates
    const [creationManuallySet, setCreationManuallySet] = useState(anchor.activation_time != null);
    const [creationTime, setCreationTime] = useState<Date>(
        anchor.activation_time ? new Date(anchor.activation_time) : new Date()
    );
    const [expiryTime, setExpiryTime] = useState<Date | null>(
        anchor.expiration_time ? new Date(anchor.expiration_time) : null
    );
    const [dateError, setDateError] = useState<string | null>(null);
    const [showCreationPicker, setShowCreationPicker] = useState(false);
    const [showExpiryPicker, setShowExpiryPicker] = useState(false);

    // Circles
    const [showCircleModal, setShowCircleModal] = useState(false);
    const [selectedCircles, setSelectedCircles] = useState<string[]>([]);

    // Content type
    const [showContentTypeModal, setShowContentTypeModal] = useState(false);
    const [contentType, setContentType] = useState<ContentType>("text");

    // Tags
    const [tags, setTags] = useState<string[]>(anchor.tags ?? []);
    const [tagInput, setTagInput] = useState("");
    const [tagInputFocused, setTagInputFocused] = useState(false);

    // ─── Helpers ──────────────────────────────────────────────────────────────
    const formatDateTime = (date: Date) =>
        date.toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });

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

    const showAndroidPicker = (type: "creation" | "expiry") => {
        const isCreation = type === "creation";
        const initialDate = isCreation ? creationTime : expiryTime || new Date();
        DateTimePickerAndroid.open({
            value: initialDate,
            mode: "date",
            display: "calendar",
            minimumDate: isCreation ? undefined : new Date(),
            onChange: (event, date) => {
                if (event.type === "set" && date) {
                    DateTimePickerAndroid.open({
                        value: date,
                        mode: "time",
                        is24Hour: true,
                        onChange: (timeEvent, finalDateTime) => {
                            if (timeEvent.type === "set" && finalDateTime) {
                                if (isCreation) handleSetCreation(finalDateTime);
                                else handleSetExpiry(finalDateTime);
                            }
                        },
                    });
                }
            },
        });
    };

    const handlePressCreation = () => {
        if (Platform.OS === "android") showAndroidPicker("creation");
        else setShowCreationPicker(true);
    };
    const handlePressExpiry = () => {
        if (Platform.OS === "android") showAndroidPicker("expiry");
        else setShowExpiryPicker(true);
    };

    // ─── Circles ──────────────────────────────────────────────────────────────
    const toggleCircle = (id: string) =>
        setSelectedCircles((prev) =>
            prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]
        );

    const handleVisibilityPress = (id: "Public" | "Circle" | "Private") => {
        setVisibility(id);
        if (id === "Circle") setShowCircleModal(true);
    };

    // ─── Tags ─────────────────────────────────────────────────────────────────
    const addTag = (tag: string) => {
        const cleaned = tag.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
        if (cleaned && !tags.includes(cleaned) && tags.length < 8) {
            setTags([...tags, cleaned]);
        }
        setTagInput("");
    };

    const removeTag = (tag: string) => setTags(tags.filter((t) => t !== tag));

    const handleTagInputSubmit = () => {
        if (tagInput.trim()) addTag(tagInput);
    };

    // ─── Save ─────────────────────────────────────────────────────────────────
    const handleSave = async () => {
        if (dateError) return;
        if (!title.trim()) {
            Alert.alert("Missing Title", "Please give your anchor a name.");
            return;
        }
        if (!session?.access_token) return;
        setIsSubmitting(true);
        try {
            await updateAnchor(anchor.anchor_id, {
                title: title.trim(),
                description: content.trim() || null,
                visibility: frontendToBackendVisibility(visibility),
                unlock_radius: radius,
                max_unlock: maxUnlock.trim() ? parseInt(maxUnlock, 10) : null,
                activation_time: creationManuallySet ? creationTime.toISOString() : null,
                expiration_time: expiryTime ? expiryTime.toISOString() : null,
                tags,
            }, session.access_token);
            navigation.goBack();
        } catch (err) {
            Alert.alert("Error", err instanceof Error ? err.message : "Failed to save anchor.");
        } finally {
            setIsSubmitting(false);
        }
    };

    // ─── Content type config ──────────────────────────────────────────────────
    const contentTypeLabel: Record<ContentType, string> = { text: "Text", file: "File", link: "Link" };
    const contentTypeIcon: Record<ContentType, keyof typeof Feather.glyphMap> = {
        text: "align-left",
        file: "paperclip",
        link: "link",
    };

    // ─── Visibility option component ──────────────────────────────────────────
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
            id === "Circle" && selectedCircles.length > 0
                ? DUMMY_CIRCLES.filter((c) => selectedCircles.includes(c.id)).map((c) => c.name).join(", ")
                : null;
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
                        {id === "Circle" && selectedCircleNames ? selectedCircleNames : subtitle}
                    </Text>
                </View>
                {id === "Circle" && isSelected && (
                    <TouchableOpacity onPress={() => setShowCircleModal(true)} style={styles.editCirclesBtn}>
                        <Text style={styles.editCirclesBtnText}>
                            {selectedCircles.length > 0 ? `${selectedCircles.length} selected` : "Choose"}
                        </Text>
                        <Feather name="chevron-right" size={14} color={colors.accentPink} />
                    </TouchableOpacity>
                )}
            </TouchableOpacity>
        );
    };

    // ─── Render ───────────────────────────────────────────────────────────────
    return (
        <SafeAreaView edges={["top", "left", "right"]} style={styles.screen}>
            <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.screen}>
                <ScrollView
                    contentContainerStyle={styles.scrollContent}
                    keyboardShouldPersistTaps="handled"
                    showsVerticalScrollIndicator={false}
                >

                    {/* ── Anchor ID badge ── */}
                    <View style={styles.anchorIdRow}>
                        <Feather name="anchor" size={13} color={colors.muted} />
                        <Text style={styles.anchorIdText}>Editing anchor · {anchor.anchor_id}</Text>
                    </View>

                    {/* TITLE */}
                    <Text style={styles.label}>Title</Text>
                    <TextInput
                        style={styles.input}
                        placeholder="Give your anchor a name"
                        placeholderTextColor={colors.lightMuted}
                        value={title}
                        onChangeText={setTitle}
                    />

                    {/* CONTENT */}
                    <View style={styles.contentLabelRow}>
                        <Text style={styles.label}>Content</Text>
                        <TouchableOpacity
                            style={styles.contentTypeBadge}
                            onPress={() => setShowContentTypeModal(true)}
                            activeOpacity={0.7}
                        >
                            <Feather name={contentTypeIcon[contentType]} size={13} color={colors.accentPink} style={{ marginRight: 4 }} />
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
                            placeholderTextColor={colors.lightMuted}
                            value={content}
                            onChangeText={setContent}
                            keyboardType="url"
                            autoCapitalize="none"
                        />
                    )}

                    {/* VISIBILITY */}
                    <Text style={styles.sectionLabel}>Who can unlock this?</Text>
                    <VisibilityOption id="Public" title="Public" subtitle="Anyone can unlock" icon="globe" />
                    <VisibilityOption id="Circle" title="Circle" subtitle="Only specific groups" icon="users" />
                    <VisibilityOption id="Private" title="Private" subtitle="Only you" icon="lock" />

                    {/* EXPIRY SETTINGS */}
                    <Text style={styles.sectionLabel}>Expiry Settings</Text>
                    {dateError && (
                        <View style={styles.errorBanner}>
                            <Feather name="alert-circle" size={14} color={colors.error} />
                            <Text style={styles.errorText}>{dateError}</Text>
                        </View>
                    )}

                    {/* Creation date */}
                    <View style={[styles.optionCard, creationManuallySet && styles.optionCardSelected]}>
                        <TouchableOpacity style={styles.dateCardMain} onPress={handlePressCreation} activeOpacity={0.7}>
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

                    {Platform.OS === "ios" && showCreationPicker && (
                        <DateTimePicker
                            value={creationTime}
                            mode="datetime"
                            display="default"
                            onChange={(e, d) => {
                                if (e.type === "set" && d) handleSetCreation(d);
                                setShowCreationPicker(false);
                            }}
                        />
                    )}

                    {/* Expiry date */}
                    <View style={[styles.optionCard, !!expiryTime && styles.optionCardSelected]}>
                        <TouchableOpacity style={styles.dateCardMain} onPress={handlePressExpiry} activeOpacity={0.7}>
                            <View style={[styles.iconContainer, expiryTime ? styles.iconContainerSelected : styles.iconContainerOutline]}>
                                <Feather name="clock" size={20} color={expiryTime ? colors.white : colors.accentWarm} />
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

                    {Platform.OS === "ios" && showExpiryPicker && (
                        <DateTimePicker
                            value={expiryTime || new Date()}
                            mode="datetime"
                            display="default"
                            minimumDate={new Date()}
                            onChange={(e, d) => {
                                if (e.type === "set" && d) handleSetExpiry(d);
                                setShowExpiryPicker(false);
                            }}
                        />
                    )}

                    {/* MAX UNLOCK */}
                    <Text style={styles.label}>Max Unlock Count</Text>
                    <TextInput
                        style={styles.input}
                        placeholder="Unlimited (leave blank)"
                        placeholderTextColor={colors.lightMuted}
                        value={maxUnlock}
                        onChangeText={setMaxUnlock}
                        keyboardType="number-pad"
                    />

                    {/* ── TAGS ──────────────────────────────────────────────────────── */}
                    <View style={styles.tagsHeader}>
                        <Text style={styles.tagsTitle}>Tags</Text>
                        <Text style={styles.tagsCount}>{tags.length}/8</Text>
                    </View>

                    {/* Current tags */}
                    <View style={styles.tagChipsRow}>
                        {tags.map((tag) => (
                            <View key={tag} style={styles.tagChip}>
                                <Text style={styles.tagChipText}>#{tag}</Text>
                                <TouchableOpacity onPress={() => removeTag(tag)} hitSlop={6} style={styles.tagRemoveBtn}>
                                    <Feather name="x" size={11} color={colors.accentPink} />
                                </TouchableOpacity>
                            </View>
                        ))}
                    </View>

                    {/* Tag input */}
                    {tags.length < 8 && (
                        <View style={[styles.tagInputWrapper, tagInputFocused && styles.tagInputWrapperFocused]}>
                            <Feather name="hash" size={15} color={colors.accentPink} style={{ marginRight: 6 }} />
                            <TextInput
                                style={styles.tagInput}
                                placeholder="Add a tag…"
                                placeholderTextColor={colors.lightMuted}
                                value={tagInput}
                                onChangeText={setTagInput}
                                onFocus={() => setTagInputFocused(true)}
                                onBlur={() => setTagInputFocused(false)}
                                onSubmitEditing={handleTagInputSubmit}
                                returnKeyType="done"
                                autoCapitalize="none"
                            />
                            {tagInput.trim().length > 0 && (
                                <TouchableOpacity onPress={handleTagInputSubmit} style={styles.tagAddBtn}>
                                    <Text style={styles.tagAddBtnText}>Add</Text>
                                </TouchableOpacity>
                            )}
                        </View>
                    )}

                    {/* Suggested tags */}
                    <Text style={styles.suggestedLabel}>Suggested</Text>
                    <View style={styles.suggestedRow}>
                        {SUGGESTED_TAGS.filter((t) => !tags.includes(t)).map((tag) => (
                            <TouchableOpacity
                                key={tag}
                                style={styles.suggestedChip}
                                onPress={() => addTag(tag)}
                                activeOpacity={0.7}
                                disabled={tags.length >= 8}
                            >
                                <Feather name="plus" size={11} color={colors.muted} style={{ marginRight: 3 }} />
                                <Text style={styles.suggestedChipText}>{tag}</Text>
                            </TouchableOpacity>
                        ))}
                    </View>

                </ScrollView>

                {/* FOOTER */}
                <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, Platform.OS === "ios" ? 34 : 24) }]}>
                    {/* Danger zone - delete */}
                    <TouchableOpacity
                        style={styles.deleteButton}
                        onPress={() =>
                            Alert.alert(
                                "Delete Anchor",
                                "This anchor will be permanently removed.",
                                [
                                    { text: "Cancel", style: "cancel" },
                                    { text: "Delete", style: "destructive", onPress: () => navigation.navigate("Map") },
                                ]
                            )
                        }
                        activeOpacity={0.8}
                    >
                        <Feather name="trash-2" size={16} color={colors.error} />
                        <Text style={styles.deleteButtonText}>Delete Anchor</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={[styles.submitButton, (!!dateError || isSubmitting) && styles.submitButtonDisabled]}
                        onPress={handleSave}
                        activeOpacity={0.8}
                    >
                        <Text style={styles.submitButtonText}>
                            {isSubmitting ? "Saving…" : "Save Changes"}
                        </Text>
                    </TouchableOpacity>
                </View>

                {/* ── CIRCLE MODAL ────────────────────────────────────────────────── */}
                <Modal visible={showCircleModal} transparent animationType="slide" onRequestClose={() => setShowCircleModal(false)}>
                    <Pressable style={styles.modalOverlay} onPress={() => setShowCircleModal(false)}>
                        <Pressable style={styles.bottomSheet} onPress={(e) => e.stopPropagation()}>
                            <View style={styles.sheetHandle} />
                            <View style={styles.sheetHeader}>
                                <Text style={styles.sheetTitle}>Share with Circles</Text>
                                <TouchableOpacity onPress={() => setShowCircleModal(false)}>
                                    <Feather name="x" size={20} color={colors.muted} />
                                </TouchableOpacity>
                            </View>
                            <Text style={styles.sheetSubtitle}>Select the circles that can unlock this anchor</Text>
                            <ScrollView style={styles.circleList} showsVerticalScrollIndicator={false}>
                                {DUMMY_CIRCLES.map((circle) => {
                                    const isChosen = selectedCircles.includes(circle.id);
                                    return (
                                        <TouchableOpacity key={circle.id} style={styles.circleRow} onPress={() => toggleCircle(circle.id)} activeOpacity={0.7}>
                                            <View style={styles.circleAvatar}>
                                                <Text style={styles.circleEmoji}>{circle.emoji}</Text>
                                            </View>
                                            <View style={styles.circleInfo}>
                                                <Text style={styles.circleName}>{circle.name}</Text>
                                                <Text style={styles.circleMeta}>{circle.memberCount} members</Text>
                                            </View>
                                            <View style={[styles.circleCheckbox, isChosen && styles.circleCheckboxSelected]}>
                                                {isChosen && <Feather name="check" size={13} color={colors.white} />}
                                            </View>
                                        </TouchableOpacity>
                                    );
                                })}
                            </ScrollView>
                            <TouchableOpacity
                                style={[styles.sheetDoneBtn, selectedCircles.length === 0 && styles.sheetDoneBtnDisabled]}
                                onPress={() => setShowCircleModal(false)}
                                activeOpacity={0.8}
                            >
                                <Text style={styles.sheetDoneBtnText}>
                                    {selectedCircles.length === 0 ? "Select at least one circle" : `Done · ${selectedCircles.length} selected`}
                                </Text>
                            </TouchableOpacity>
                        </Pressable>
                    </Pressable>
                </Modal>

                {/* ── CONTENT TYPE MODAL ──────────────────────────────────────────── */}
                <Modal visible={showContentTypeModal} transparent animationType="slide" onRequestClose={() => setShowContentTypeModal(false)}>
                    <Pressable style={styles.modalOverlay} onPress={() => setShowContentTypeModal(false)}>
                        <Pressable style={styles.bottomSheetSmall} onPress={(e) => e.stopPropagation()}>
                            <View style={styles.sheetHandle} />
                            <Text style={[styles.sheetTitle, { marginBottom: 4, marginTop: 4 }]}>Content Type</Text>
                            <Text style={[styles.sheetSubtitle, { marginBottom: 16 }]}>Choose how to share your anchor's content</Text>
                            {(["text", "file", "link"] as ContentType[]).map((type) => {
                                const isActive = contentType === type;
                                const labels: Record<ContentType, string> = { text: "Text", file: "File Attachment", link: "Link / URL" };
                                const descs: Record<ContentType, string> = {
                                    text: "Write a message or note",
                                    file: "Attach a document, image, or audio",
                                    link: "Share a URL",
                                };
                                return (
                                    <TouchableOpacity
                                        key={type}
                                        style={[styles.contentTypeRow, isActive && styles.contentTypeRowActive]}
                                        onPress={() => { setContentType(type); setContent(""); setShowContentTypeModal(false); }}
                                        activeOpacity={0.7}
                                    >
                                        <View style={[styles.iconContainer, isActive ? styles.iconContainerSelected : styles.iconContainerOutline]}>
                                            <Feather name={contentTypeIcon[type]} size={20} color={isActive ? colors.white : colors.accentPink} />
                                        </View>
                                        <View style={styles.optionTextContainer}>
                                            <Text style={styles.optionTitle}>{labels[type]}</Text>
                                            <Text style={styles.optionSubtitle}>{descs[type]}</Text>
                                        </View>
                                        {isActive && <Feather name="check-circle" size={20} color={colors.accentPink} />}
                                    </TouchableOpacity>
                                );
                            })}
                        </Pressable>
                    </Pressable>
                </Modal>

            </KeyboardAvoidingView>
        </SafeAreaView>
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
    screen: { flex: 1, backgroundColor: colors.canvas },
    scrollContent: { paddingHorizontal: 20, paddingTop: 10, paddingBottom: 40 },

    anchorIdRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        marginBottom: 20,
        backgroundColor: "#f3f4f6",
        paddingHorizontal: 12,
        paddingVertical: 7,
        borderRadius: 8,
        alignSelf: "flex-start",
    },
    anchorIdText: { fontSize: 12, color: colors.muted, fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace" },

    label: { fontSize: 15, fontWeight: "600", color: colors.text, marginBottom: 8 },
    sectionLabel: { fontSize: 15, fontWeight: "600", color: colors.text, marginBottom: 12 },

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
    textArea: { minHeight: 120, paddingTop: 16 },

    contentLabelRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
    contentTypeBadge: {
        flexDirection: "row", alignItems: "center", backgroundColor: "#FEE8ED",
        borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5, gap: 3,
    },
    contentTypeBadgeText: { fontSize: 13, fontWeight: "600", color: colors.accentPink },

    filePlaceholder: { alignItems: "center", justifyContent: "center", minHeight: 120, gap: 8, borderStyle: "dashed" },
    filePlaceholderText: { fontSize: 15, fontWeight: "600", color: colors.text },
    filePlaceholderSub: { fontSize: 13, color: colors.muted },

    optionCard: {
        flexDirection: "row", alignItems: "center", borderWidth: 1,
        borderColor: colors.border, borderRadius: 12, padding: 16,
        marginBottom: 12, backgroundColor: colors.canvas,
    },
    optionCardSelected: { borderColor: colors.accentPink, backgroundColor: colors.selectedCanvas },
    iconContainer: {
        width: 44, height: 44, borderRadius: 22, backgroundColor: "#f3f4f6",
        alignItems: "center", justifyContent: "center", marginRight: 14,
    },
    iconContainerOutline: { backgroundColor: "transparent", borderWidth: 1, borderColor: colors.accentPink },
    iconContainerSelected: { backgroundColor: colors.accentPink, borderWidth: 0 },
    optionTextContainer: { flex: 1 },
    optionTitle: { fontSize: 16, fontWeight: "600", color: colors.text, marginBottom: 2 },
    optionSubtitle: { fontSize: 13, color: colors.muted },

    editCirclesBtn: { flexDirection: "row", alignItems: "center", gap: 2, paddingLeft: 8 },
    editCirclesBtnText: { fontSize: 13, color: colors.accentPink, fontWeight: "600" },

    dateCardMain: { flex: 1, flexDirection: "row", alignItems: "center" },
    clearBtn: { padding: 4, marginLeft: 8, backgroundColor: "#f3f4f6", borderRadius: 20 },

    errorBanner: {
        flexDirection: "row", alignItems: "center", gap: 6,
        backgroundColor: "#fef2f2", borderWidth: 1, borderColor: "#fecaca",
        borderRadius: 10, padding: 12, marginBottom: 12,
    },
    errorText: { fontSize: 13, color: colors.error, flex: 1 },

    // Tags
    tagsHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
    tagsTitle: { fontSize: 18, fontWeight: "700", color: colors.text },
    tagsCount: { fontSize: 13, color: colors.lightMuted },

    tagChipsRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 12 },
    tagChip: {
        flexDirection: "row", alignItems: "center", gap: 4,
        backgroundColor: colors.selectedCanvas, borderWidth: 1,
        borderColor: colors.accentPink, paddingHorizontal: 10,
        paddingVertical: 6, borderRadius: 20,
    },
    tagChipText: { fontSize: 13, color: colors.accentPink, fontWeight: "500" },
    tagRemoveBtn: { marginLeft: 2 },

    tagInputWrapper: {
        flexDirection: "row", alignItems: "center", borderWidth: 1,
        borderColor: colors.border, borderRadius: 12,
        paddingHorizontal: 14, paddingVertical: 10, marginBottom: 12,
        backgroundColor: colors.canvas,
    },
    tagInputWrapperFocused: { borderColor: colors.accentPink },
    tagInput: { flex: 1, fontSize: 15, color: colors.text },
    tagAddBtn: {
        backgroundColor: colors.accentPink, paddingHorizontal: 12,
        paddingVertical: 5, borderRadius: 12,
    },
    tagAddBtnText: { color: colors.white, fontSize: 13, fontWeight: "600" },

    suggestedLabel: { fontSize: 13, color: colors.muted, marginBottom: 8 },
    suggestedRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 24 },
    suggestedChip: {
        flexDirection: "row", alignItems: "center",
        borderWidth: 1, borderColor: colors.border,
        paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20,
        backgroundColor: colors.canvas,
    },
    suggestedChipText: { fontSize: 12, color: colors.muted },

    // Footer
    footer: {
        paddingHorizontal: 20, paddingTop: 12,
        backgroundColor: colors.canvas, borderTopWidth: 1,
        borderColor: colors.border, gap: 10,
    },
    deleteButton: {
        flexDirection: "row", alignItems: "center", justifyContent: "center",
        gap: 6, paddingVertical: 13, borderRadius: 12,
        borderWidth: 1, borderColor: "#fecaca", backgroundColor: "#fef2f2",
    },
    deleteButtonText: { fontSize: 15, fontWeight: "600", color: colors.error },
    submitButton: {
        backgroundColor: colors.accentPink, borderRadius: 12,
        paddingVertical: 16, alignItems: "center",
    },
    submitButtonDisabled: { opacity: 0.5 },
    submitButtonText: { color: colors.white, fontSize: 16, fontWeight: "600" },

    // Modals
    modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" },
    bottomSheet: {
        backgroundColor: colors.white, borderTopLeftRadius: 24, borderTopRightRadius: 24,
        paddingHorizontal: 20, paddingBottom: Platform.OS === "ios" ? 40 : 28, maxHeight: "75%",
    },
    bottomSheetSmall: {
        backgroundColor: colors.white, borderTopLeftRadius: 24, borderTopRightRadius: 24,
        paddingHorizontal: 20, paddingBottom: Platform.OS === "ios" ? 40 : 28,
    },
    sheetHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: "#e5e7eb", alignSelf: "center", marginTop: 12, marginBottom: 16 },
    sheetHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 4 },
    sheetTitle: { fontSize: 18, fontWeight: "700", color: colors.text },
    sheetSubtitle: { fontSize: 14, color: colors.muted, marginBottom: 16 },
    circleList: { marginBottom: 16 },
    circleRow: { flexDirection: "row", alignItems: "center", paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: "#f9fafb" },
    circleAvatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.selectedCanvas, alignItems: "center", justifyContent: "center", marginRight: 14 },
    circleEmoji: { fontSize: 22 },
    circleInfo: { flex: 1 },
    circleName: { fontSize: 16, fontWeight: "600", color: colors.text },
    circleMeta: { fontSize: 13, color: colors.muted, marginTop: 2 },
    circleCheckbox: { width: 26, height: 26, borderRadius: 13, borderWidth: 2, borderColor: colors.border, alignItems: "center", justifyContent: "center" },
    circleCheckboxSelected: { backgroundColor: colors.accentPink, borderColor: colors.accentPink },
    sheetDoneBtn: { backgroundColor: colors.accentPink, borderRadius: 12, paddingVertical: 15, alignItems: "center", marginTop: 4 },
    sheetDoneBtnDisabled: { backgroundColor: "#f3a3b5" },
    sheetDoneBtnText: { color: colors.white, fontSize: 15, fontWeight: "600" },
    contentTypeRow: {
        flexDirection: "row", alignItems: "center", borderWidth: 1,
        borderColor: colors.border, borderRadius: 12, padding: 14, marginBottom: 10, backgroundColor: colors.canvas,
    },
    contentTypeRowActive: { borderColor: colors.accentPink, backgroundColor: colors.selectedCanvas },
});