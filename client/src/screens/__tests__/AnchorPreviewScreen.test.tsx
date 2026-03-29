import React from "react";
import { render, fireEvent, waitFor } from "@testing-library/react-native";

import AnchorPreviewScreen from "../AnchorPreviewScreen";
import { useAuth } from "../../context/AuthContext";
import { createAnchor, type AnchorDraft } from "../../services/anchorService";

jest.mock("@rnmapbox/maps", () => {
  const React = require("react");
  const { View } = require("react-native");

  const createComponent = (name: string) => {
    return ({ children }: { children?: React.ReactNode }) =>
      React.createElement(View, { accessibilityLabel: name }, children);
  };

  return {
    __esModule: true,
    default: {
      setAccessToken: jest.fn(),
      StyleURL: { Light: "light" },
      MapView: createComponent("MapView"),
      Camera: createComponent("Camera"),
      ShapeSource: createComponent("ShapeSource"),
      FillLayer: createComponent("FillLayer"),
      LineLayer: createComponent("LineLayer"),
      MarkerView: createComponent("MarkerView"),
    },
  };
});

jest.mock("../../context/AuthContext", () => ({
  useAuth: jest.fn(),
}));

jest.mock("@expo/vector-icons", () => {
  const React = require("react");
  const { Text } = require("react-native");

  return {
    Feather: ({ name }: { name: string }) => React.createElement(Text, null, name),
  };
});

jest.mock("react-native-safe-area-context", () => {
  const React = require("react");
  const { View } = require("react-native");

  return {
    SafeAreaView: ({ children }: { children?: React.ReactNode }) =>
      React.createElement(View, null, children),
    useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
  };
});

jest.mock("../../services/anchorService", () => ({
  createAnchor: jest.fn(),
}));

const mockedUseAuth = useAuth as jest.MockedFunction<typeof useAuth>;
const mockedCreateAnchor = createAnchor as jest.MockedFunction<typeof createAnchor>;

const draft: AnchorDraft = {
  title: "Sunset Spot",
  description: "Best place to watch the river at golden hour.",
  latitude: 40.4237,
  longitude: -86.9212,
  visibility: "PUBLIC",
  unlock_radius: 50,
  max_unlock: null,
  activation_time: "2026-03-28T18:00:00.000Z",
  expiration_time: null,
  always_active: true,
  tags: ["nature", "chill"],
};

type ScreenProps = React.ComponentProps<typeof AnchorPreviewScreen>;

function buildProps(): ScreenProps {
  return {
    navigation: {
      goBack: jest.fn(),
      navigate: jest.fn(),
    } as unknown as ScreenProps["navigation"],
    route: {
      key: "AnchorPreview-test",
      name: "AnchorPreview" as const,
      params: { draft },
    } as ScreenProps["route"],
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockedUseAuth.mockReturnValue({
    status: "authenticated",
    session: {
      user_id: "user-1",
      email: "preview@example.com",
      username: "preview-user",
      access_token: "access-token",
      refresh_token: "refresh-token",
      token_type: "bearer",
    },
    signIn: jest.fn(),
    signOut: jest.fn(),
    restoreSession: jest.fn(),
  });
  mockedCreateAnchor.mockResolvedValue({
    anchor_id: "anchor-1",
    creator_id: "user-1",
    title: draft.title,
    description: draft.description,
    latitude: draft.latitude,
    longitude: draft.longitude,
    altitude: null,
    status: "ACTIVE",
    visibility: draft.visibility,
    unlock_radius: draft.unlock_radius,
    max_unlock: draft.max_unlock,
    current_unlock: 0,
    activation_time: draft.activation_time,
    expiration_time: draft.expiration_time,
    always_active: draft.always_active,
    content_type: null,
    tags: draft.tags,
  });
});

test("renders preview details from the anchor draft", () => {
  const props = buildProps();
  const screen = render(<AnchorPreviewScreen {...props} />);

  expect(screen.getByText("Preview your Anchor")).toBeTruthy();
  expect(screen.getByText("Sunset Spot")).toBeTruthy();
  expect(screen.getByText("Best place to watch the river at golden hour.")).toBeTruthy();
  expect(screen.getByText("Public · Radius 50m")).toBeTruthy();
  expect(screen.getByText("Unlimited")).toBeTruthy();
  expect(screen.getByText("#nature")).toBeTruthy();
  expect(screen.getByText("#chill")).toBeTruthy();
});

test("edit details returns to the creation screen", () => {
  const props = buildProps();
  const screen = render(<AnchorPreviewScreen {...props} />);

  fireEvent.press(screen.getByText("Edit Details"));

  expect(props.navigation.goBack).toHaveBeenCalledTimes(1);
});

test("publishing from preview creates the anchor and navigates to discovery", async () => {
  const props = buildProps();
  const screen = render(<AnchorPreviewScreen {...props} />);

  fireEvent.press(screen.getByText("Publish Anchor"));

  await waitFor(() => {
    expect(mockedCreateAnchor).toHaveBeenCalledWith(draft, "access-token");
  });
  expect(props.navigation.navigate).toHaveBeenCalledWith("Discovery");
});
