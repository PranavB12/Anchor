import React from 'react';
import { render, waitFor, cleanup, act } from '@testing-library/react-native';
import ARScreen from '../ARScreen';
import * as Location from 'expo-location';

// 1. Prevent "worker process failed to exit gracefully" by cleaning up the component tree
afterEach(cleanup);

// 2. Mock Location thoroughly
jest.mock('expo-location', () => ({
  requestForegroundPermissionsAsync: jest.fn(),
  getCurrentPositionAsync: jest.fn(),
  getHeadingAsync: jest.fn(),
  watchPositionAsync: jest.fn(),
  watchHeadingAsync: jest.fn(),
  Accuracy: {
    Lowest: 1, Low: 2, Balanced: 3, High: 4, Highest: 5, BestForNavigation: 6,
  }
}));

// 3. Mock Viro components as dummy React components to prevent deep-render crashes
jest.mock('@viro-community/react-viro', () => ({
  ViroARSceneNavigator: () => null,
  ViroARScene: () => null,
  ViroNode: () => null,
  ViroImage: () => null,
  ViroText: () => null,
  ViroQuad: () => null,
  ViroMaterials: { createMaterials: jest.fn() },
}));

// 4. Mock Auth & Navigation
jest.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ session: { access_token: 'fake-token' } }),
}));

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ goBack: jest.fn() }),
}));

// 5. CRITICAL FIX: Mock API/Services to prevent silent unhandled promise rejections blocking the useEffect
jest.mock('../../services/anchorService', () => ({
  getNearbyAnchors: jest.fn().mockResolvedValue([]),
}));
jest.mock('../../services/api', () => ({
  apiRequest: jest.fn().mockResolvedValue([]),
}));

describe('ARScreen Component Tests (US#10.7 & US#11.4)', () => {
  
  // 6. Strict Timer Management for React Native leaks
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers(); 
  });

  afterEach(() => {
    // Flush any pending setTimeout/setInterval in your AR loop
    act(() => {
      jest.runOnlyPendingTimers();
    });
    jest.useRealTimers(); 
  });

  it('handles location permission denial properly (US#10.7)', async () => {
    (Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'denied' });
    const { getByText, unmount } = render(<ARScreen />);

    await waitFor(() => {
      expect(getByText('Permissions not granted')).toBeTruthy();
    });

    unmount();
  });

  it('initializes AR tracking and update loops successfully (US#11.4)', async () => {
    (Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'granted' });
    (Location.getCurrentPositionAsync as jest.Mock).mockResolvedValue({ coords: { latitude: 0, longitude: 0, altitude: 0 } });
    (Location.getHeadingAsync as jest.Mock).mockResolvedValue({ trueHeading: 90 });

    (Location.watchPositionAsync as jest.Mock).mockResolvedValue({ remove: jest.fn() });
    (Location.watchHeadingAsync as jest.Mock).mockResolvedValue({ remove: jest.fn() });

    const { queryByText, unmount } = render(<ARScreen />);

    // Fast-forward any initial timeouts (e.g., loading states)
    act(() => {
      jest.advanceTimersByTime(1000);
    });

    await waitFor(() => {
      expect(queryByText('Initializing AR...')).toBeNull();
    });

    await waitFor(() => {
      expect(Location.watchPositionAsync).toHaveBeenCalled();
    });

    await waitFor(() => {
      expect(Location.watchHeadingAsync).toHaveBeenCalled();
    });

    unmount();
  });
});
