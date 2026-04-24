import React from 'react';
import { render, fireEvent, waitFor, cleanup } from '@testing-library/react-native';
import AnchorCreation from '../AnchorCreation';
import * as DocumentPicker from "expo-document-picker";
import { Alert } from 'react-native';
import { AuthProvider } from '../../context/AuthContext';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';

afterEach(cleanup);

jest.mock('expo-document-picker');

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
    SafeAreaProvider: ({ children }: { children?: React.ReactNode }) =>
      React.createElement(View, null, children),
  };
});

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

jest.mock('../../context/AuthContext', () => ({
  ...jest.requireActual('../../context/AuthContext'),
  AuthProvider: ({ children }: any) => children,
  useAuth: () => ({ session: { access_token: "test", user_id: "u1" } })
}));

describe('AnchorCreation File Attachments', () => {
  let alertSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    // Safely spy on Alert without breaking TurboModules
    alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  });

  afterEach(() => {
    alertSpy.mockRestore();
  });

  it('shows alert if file exceeds 10MB', async () => {
    (DocumentPicker.getDocumentAsync as jest.Mock).mockResolvedValueOnce({
      canceled: false,
      assets: [{ uri: 'file://too-big.png', name: 'big.png', size: 10 * 1024 * 1024 + 10 }],
    });

    const { getByText, unmount } = render(
      <SafeAreaProvider>
        <NavigationContainer>
          <AnchorCreation route={{ params: { latitude: 0, longitude: 0, radius: 10 } }} navigation={{ navigate: jest.fn() } as any} />
        </NavigationContainer>
      </SafeAreaProvider>
    );

    // switch to file content type
    fireEvent.press(getByText("Text"));
    fireEvent.press(getByText("File Attachment"));

    // press 'Tap to attach a file'
    fireEvent.press(getByText('Tap to attach a file'));

    // Wait for async validation and Alert
    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith(
        "File too large",
        "Please select a file smaller than 10MB."
      );
    });

    // Clean up component to prevent memory leaks in test
    unmount();
  });
});
