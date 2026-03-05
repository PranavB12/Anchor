import AsyncStorage from "@react-native-async-storage/async-storage";

import {
  clearAuthSession,
  loadAuthSession,
  saveAuthSession,
  type StoredAuthSession,
} from "../authStorage";

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);

const mockedAsyncStorage = AsyncStorage as jest.Mocked<typeof AsyncStorage>;

const session: StoredAuthSession = {
  user_id: "user-1",
  email: "logout-storage@example.com",
  username: "logout_storage",
  access_token: "access-token",
  refresh_token: "refresh-token",
  token_type: "bearer",
};

beforeEach(async () => {
  mockedAsyncStorage.clear();
  jest.clearAllMocks();
});

test("clearAuthSession removes persisted auth tokens", async () => {
  await saveAuthSession(session);

  const beforeClear = await loadAuthSession();
  expect(beforeClear).toEqual(session);

  await clearAuthSession();

  const afterClear = await loadAuthSession();
  expect(afterClear).toBeNull();
  expect(mockedAsyncStorage.removeItem).toHaveBeenCalledWith("anchor.auth.session.v1");
});
