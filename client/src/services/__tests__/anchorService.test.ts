import {
  getNearbyAnchorFilterOptions,
  getNearbyAnchors,
} from "../anchorService";
import { apiRequest } from "../api";

jest.mock("../api", () => ({
  apiRequest: jest.fn(),
}));

const mockedApiRequest = apiRequest as jest.MockedFunction<typeof apiRequest>;

beforeEach(() => {
  jest.clearAllMocks();
});

test("getNearbyAnchors sends repeated query params for all selected filters", async () => {
  mockedApiRequest.mockResolvedValueOnce([]);

  await getNearbyAnchors(
    {
      lat: 40.4237,
      lon: -86.9212,
      radiusKm: 50,
      visibility: ["PUBLIC", "PRIVATE"],
      anchorStatus: ["ACTIVE"],
      contentType: ["TEXT", "FILE"],
      tags: ["music", "study"],
      sortBy: "distance",
    },
    "access-token",
  );

  expect(mockedApiRequest).toHaveBeenCalledWith(
    "/anchors/nearby?lat=40.4237&lon=-86.9212&radius_km=50&sort_by=distance&visibility=PUBLIC&visibility=PRIVATE&anchor_status=ACTIVE&content_type=TEXT&content_type=FILE&tags=music&tags=study",
    {
      method: "GET",
      token: "access-token",
      useFileSystemBypass: false,
    },
  );
});

test("getNearbyAnchorFilterOptions targets the filter-options route", async () => {
  mockedApiRequest.mockResolvedValueOnce({
    visibility: [],
    anchor_status: [],
    content_type: [],
    tags: [],
  });

  await getNearbyAnchorFilterOptions(
    {
      lat: 40.4237,
      lon: -86.9212,
      radiusKm: 25,
      visibility: ["CIRCLE_ONLY"],
      tags: ["campus"],
    },
    "access-token",
  );

  expect(mockedApiRequest).toHaveBeenCalledWith(
    "/anchors/nearby/filter-options?lat=40.4237&lon=-86.9212&radius_km=25&visibility=CIRCLE_ONLY&tags=campus",
    {
      method: "GET",
      token: "access-token",
    },
  );
});
