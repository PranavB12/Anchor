import * as Notifications from 'expo-notifications';
import { startBackgroundLocationTracking, LOCATION_TASK_NAME } from '../locationTask';
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';

jest.mock('expo-file-system/legacy', () => ({
    FileSystemSessionType: { BACKGROUND: 0 },
    uploadAsync: jest.fn(),
}), { virtual: true });
jest.mock('expo-task-manager', () => ({
    defineTask: jest.fn(),
}));
jest.mock('expo-location', () => ({
    hasStartedLocationUpdatesAsync: jest.fn(),
    requestForegroundPermissionsAsync: jest.fn(),
    requestBackgroundPermissionsAsync: jest.fn(),
    startLocationUpdatesAsync: jest.fn(),
    stopLocationUpdatesAsync: jest.fn(),
    Accuracy: { Balanced: 0, Highest: 1 },
}));
jest.mock('expo-notifications', () => ({
    setNotificationHandler: jest.fn(),
    scheduleNotificationAsync: jest.fn(),
}));
jest.mock('@react-native-async-storage/async-storage', () => ({
    getItem: jest.fn(),
    setItem: jest.fn(),
}));

describe('Notifications Configuration', () => {
    it('sets the notification handler properly', () => {
        expect(Notifications.setNotificationHandler).toBeDefined();
    });

    it('requests background location permissions', async () => {
        (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
        (Location.hasStartedLocationUpdatesAsync as jest.Mock).mockResolvedValue(false);
        (Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'granted' });
        (Location.requestBackgroundPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'granted' });

        await startBackgroundLocationTracking();

        expect(Location.requestBackgroundPermissionsAsync).toHaveBeenCalled();
        expect(Location.startLocationUpdatesAsync).toHaveBeenCalledWith(LOCATION_TASK_NAME, expect.objectContaining({
            distanceInterval: 10,
        }));
    });
});
