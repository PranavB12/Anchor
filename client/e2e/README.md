# Logout E2E (Maestro)

This flow verifies logout token clearing and post-relaunch unauthenticated state.

## Prereqs
- Maestro CLI installed: `curl -Ls "https://get.maestro.mobile.dev" | bash`
- App installed on simulator/device
- A valid test user account

## Run

```bash
cd client
MAESTRO_APP_ID=com.your.bundle.id \
TEST_USER_EMAIL=your_test_user@example.com \
TEST_USER_PASSWORD=your_password \
maestro test e2e/logout_flow.yaml
```

What it validates:
- Login succeeds
- User can open profile and logout
- App returns to Login screen
- Relaunch keeps user logged out (persisted token removed)
