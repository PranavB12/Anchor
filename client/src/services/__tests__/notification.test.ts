import * as Notifications from 'expo-notifications';
import { startBackgroundLocationTracking, LOCATION_TASK_NAME } from '../locationTask';
import * as TaskManager from 'expo-task-manager';
import * as Location from 'expo-location';

jest.mock('expo-task-manager', () => ({
    defineTask: jest.fn(),
    isTaskRegisteredAsync: jest.fn(),
}));
jest.mock('expo-location', () => ({
    requestForegroundPermissionsAsync: jest.fn(),
    requestBackgroundPermissionsAsync: jest.fn(),
    startLocationUpdatesAsync: jest.fn(),
    Accuracy: { Balanced: 0 },
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
        (Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'granted' });
        (Location.requestBackgroundPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'granted' });
        (TaskManager.isTaskRegisteredAsync as jest.Mock).mockResolvedValue(false);

        await startBackgroundLocationTracking();

        expect(Location.requestBackgroundPermissionsAsync).toHaveBeenCalled();
        expect(Location.startLocationUpdatesAsync).toHaveBeenCalledWith(LOCATION_TASK_NAME, expect.objectContaining({
            distanceInterval: 10,
        }));
    });
});
