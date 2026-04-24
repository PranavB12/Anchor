import React from "react";
import { Alert } from "react-native";
import { fireEvent, render, waitFor } from "@testing-library/react-native";

import CreateCircleScreen from "../CreateCircleScreen";
import { useAuth } from "../../context/AuthContext";
import { createCircle } from "../../services/circleService";

jest.mock("../../context/AuthContext", () => ({
  useAuth: jest.fn(),
}));

jest.mock("../../services/circleService", () => ({
  createCircle: jest.fn(),
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
  };
});

const mockedUseAuth = useAuth as jest.MockedFunction<typeof useAuth>;
const mockedCreateCircle = createCircle as jest.MockedFunction<typeof createCircle>;

type ScreenProps = React.ComponentProps<typeof CreateCircleScreen>;

function buildProps(): ScreenProps {
  return {
    navigation: {
      goBack: jest.fn(),
      replace: jest.fn(),
    } as unknown as ScreenProps["navigation"],
    route: {
      key: "CreateCircle-test",
      name: "CreateCircle" as const,
      params: undefined,
    } as ScreenProps["route"],
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockedUseAuth.mockReturnValue({
    status: "authenticated",
    session: {
      user_id: "user-1",
      email: "circles@example.com",
      username: "circles-user",
      access_token: "access-token",
      refresh_token: "refresh-token",
      token_type: "bearer",
    },
    signIn: jest.fn(),
    signOut: jest.fn(),
    restoreSession: jest.fn(),
  });
  mockedCreateCircle.mockResolvedValue({
    circle_id: "circle-1",
    owner_id: "user-1",
    name: "Launch Crew",
    description: "People reviewing launch anchors",
    visibility: "PUBLIC",
    created_at: "2026-04-19T12:00:00Z",
    member_count: 1,
    is_owner: true,
  });
});

test("shows validation error and blocks submit when name is missing", async () => {
  const props = buildProps();
  const screen = render(<CreateCircleScreen {...props} />);

  fireEvent.press(screen.getByTestId("create-circle-submit"));

  expect(await screen.findByText("Circle name is required.")).toBeTruthy();
  expect(mockedCreateCircle).not.toHaveBeenCalled();
});

test("submits valid circle details and navigates to the circles list", async () => {
  const props = buildProps();
  const alertSpy = jest.spyOn(Alert, "alert").mockImplementation(
    (_title, _message, buttons) => {
      const firstButton = buttons?.[0];
      if (firstButton && typeof firstButton !== "string" && firstButton.onPress) {
        firstButton.onPress();
      }
    },
  );
  const screen = render(<CreateCircleScreen {...props} />);

  fireEvent.changeText(screen.getByTestId("circle-name-input"), "Launch Crew");
  fireEvent.changeText(
    screen.getByTestId("circle-description-input"),
    "People reviewing launch anchors",
  );
  fireEvent.press(screen.getByTestId("circle-visibility-public"));
  fireEvent.press(screen.getByTestId("create-circle-submit"));

  await waitFor(() => {
    expect(mockedCreateCircle).toHaveBeenCalledWith(
      {
        name: "Launch Crew",
        description: "People reviewing launch anchors",
        visibility: "PUBLIC",
      },
      "access-token",
    );
  });
  expect(props.navigation.replace).toHaveBeenCalledWith("Circles");

  alertSpy.mockRestore();
});
