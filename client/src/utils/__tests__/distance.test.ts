import { getDistanceFromLatLonInM } from '../distance';

describe('Distance Calculator', () => {
    it('calculates the correct distance between two obvious locations', () => {
        // testing distance from New York to San Francisco
        const lat1 = 40.7128;
        const lon1 = -74.0060;
        const lat2 = 37.7749;
        const lon2 = -122.4194;

        const distance = getDistanceFromLatLonInM(lat1, lon1, lat2, lon2);

        // It is approximately 4129 km
        expect(distance).toBeGreaterThan(4000000);
        expect(distance).toBeLessThan(4200000);
    });

    it('returns 0 for the exact same coordinates', () => {
        const lat = 40.7128;
        const lon = -74.0060;
        const distance = getDistanceFromLatLonInM(lat, lon, lat, lon);
        expect(distance).toBe(0);
    });

    it('correctly calculates small distance in meters', () => {
        // ~111m per degree lat roughly. So 0.001 degrees lat is about 111 meters.
        const lat = 40.7128;
        const lon = -74.0060;
        const distance = getDistanceFromLatLonInM(lat, lon, lat + 0.001, lon);

        expect(distance).toBeGreaterThan(110);
        expect(distance).toBeLessThan(112);
    });
});
