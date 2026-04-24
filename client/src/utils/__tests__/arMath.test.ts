import { getRelativeARCoords } from "../arMath";
import { getDistanceFromLatLonInM } from "../distance";

describe("AR Math Utilities (US#10.7)", () => {
  it("calculates distance between coordinates accurately", () => {
    // Central Park, NYC to Times Square, NYC
    const dist = getDistanceFromLatLonInM(40.785091, -73.968285, 40.758896, -73.985130);
    expect(dist).toBeGreaterThan(2000);
    expect(dist).toBeLessThan(4000); // Rough distance
  });

  it("calculates relative AR coordinates correctly (facing North)", () => {
    // User at (0,0), facing North (0 degrees)
    // Anchor slightly North
    const coords = getRelativeARCoords(0, 0, 0, 0, 0.001, 0, 0);
    expect(coords.x).toBeCloseTo(0);
    expect(coords.y).toBe(0);
    expect(coords.z).toBeLessThan(0); // North should be negative Z in Viro
  });

  it("calculates relative AR coordinates correctly (facing East)", () => {
    // User at (0,0), facing East (90 degrees)
    // Anchor slightly North
    // If facing East, North is to the left (-X)
    const coords = getRelativeARCoords(0, 0, 0, 90, 0.001, 0, 0);
    expect(coords.x).toBeLessThan(0);
    expect(coords.z).toBeCloseTo(0);
  });
});
