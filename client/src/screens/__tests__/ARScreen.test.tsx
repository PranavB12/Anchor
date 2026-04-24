import React from 'react';
import { render, waitFor } from '@testing-library/react-native';
import ARScreen from '../ARScreen';
import * as Location from 'expo-location';

jest.mock('expo-location', () => ({
  requestForegroundPermissionsAsync: jest.fn(),
  getCurrentPositionAsync: jest.fn(),
  getHeadingAsync: jest.fn(),
  watchPositionAsync: jest.fn(),
  watchHeadingAsync: jest.fn(),
  Accuracy: {
    High: 4,
    BestForNavigation: 6,
  }
}));

jest.mock('@viro-community/react-viro', () => ({
  ViroARSceneNavigator: 'ViroARSceneNavigator',
  ViroARScene: 'ViroARScene',
  ViroNode: 'ViroNode',
  ViroImage: 'ViroImage',
  ViroText: 'ViroText',
  ViroQuad: 'ViroQuad',
  ViroMaterials: { createMaterials: jest.fn() },
}));

jest.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ session: { access_token: 'fake-token' } }),
}));

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ goBack: jest.fn() }),
}));

describe('ARScreen Component Tests (US#10.7 & US#11.4)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('handles location permission denial properly (US#10.7)', async () => {
    (Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'denied' });
    const { getByText } = render(<ARScreen />);
    
    await waitFor(() => {
      expect(getByText('Permissions not granted')).toBeTruthy();
    });
  });

  it('initializes AR tracking and update loops successfully (US#11.4)', async () => {
    (Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'granted' });
    (Location.getCurrentPositionAsync as jest.Mock).mockResolvedValue({ coords: { latitude: 0, longitude: 0, altitude: 0 } });
    (Location.getHeadingAsync as jest.Mock).mockResolvedValue({ trueHeading: 90 });
    
    let positionCallback: any;
    (Location.watchPositionAsync as jest.Mock).mockImplementation((opts, cb) => {
      positionCallback = cb;
      return Promise.resolve({ remove: jest.fn() });
    });
    
    (Location.watchHeadingAsync as jest.Mock).mockResolvedValue({ remove: jest.fn() });

    const { queryByText } = render(<ARScreen />);
    
    // The screen should move past "Initializing AR..." once dependencies resolve
    await waitFor(() => {
      expect(queryByText('Initializing AR...')).toBeNull();
    });

    // Verify the tracking loops were initiated
    expect(Location.watchPositionAsync).toHaveBeenCalled();
    expect(Location.watchHeadingAsync).toHaveBeenCalled();
  });
});
