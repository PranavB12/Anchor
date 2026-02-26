# Anchor

<p align="center">
<img src="https://lh3.googleusercontent.com/u/0/d/1UpvuvLZFYagXFWX23WueKyBAzzaFXHX5" alt="Anchor Logo" width="200"/>
</p>

### **Digital content. Physical locations. Right place, right time.**

Anchor is a context-aware sharing platform that binds data to the real world. Unlike generic cloud drives, Anchor ensures your files, links, and messages are only accessible when a user is physically present at the source.

---

## Key Features

* **Geofenced Unlocking:** Digital content stays locked until you are within a set radius.
* **Circles:** Share privately with specific groups or go public for the world to see.
* **Life Cycles:** Set expiration timers or maximum unlock counts for temporary info.
* **Encrypted Proximity:** Secure, spatial-indexed backend for verified location access.
* **Ghost Mode:** Toggle location tracking for total privacy.

---

## Tech Stack

* **Frontend:** React Native
* **Backend:** FastAPI
* **Database:** MySQL & AWS S3 buckets

---

## iOS Development Build (Personal iPhone via Xcode)

### Prerequisites

* macOS with Xcode installed
* iPhone connected to your Mac (USB)
* Apple ID signed into Xcode (`Xcode > Settings > Accounts`)
* iPhone Developer Mode enabled (`Settings > Privacy & Security > Developer Mode`)

### Steps (from `client/`)

```bash
cd /Users/annshnavle/Desktop/Anchor/Anchor/client
```

1. Install Expo dev client (one-time)
```bash
npx expo install expo-dev-client
```

2. Generate native iOS project (one-time, or after native/plugin changes)
```bash
npx expo prebuild -p ios
```

3. Install CocoaPods dependencies (if needed)
```bash
cd ios
pod install
cd ..
```

4. Open the iOS workspace in Xcode (`.xcworkspace`, not `.xcodeproj`)
```bash
open ios/*.xcworkspace
```

### Xcode Setup

1. Select the app target (not `Pods`)
2. Go to `Signing & Capabilities`
3. Enable `Automatically manage signing`
4. Choose your `Personal Team`
5. Set a unique bundle identifier (example: `com.annshnavle.anchor.dev`)
6. Select your iPhone as the run destination
7. Press `Run` (`Product > Run`) to build/install on your phone

### iPhone Trust / Developer Setup (if prompted)

* Tap `Trust This Computer`
* Enable `Developer Mode` (if not already enabled)
* Trust your developer profile in:
  * `Settings > General > VPN & Device Management` (or `Device Management`)

### Start Metro for the Dev Client

Back in terminal (inside `client/`):

```bash
npx expo start --dev-client
```

### Run the App on the Phone

* Open the installed app on your iPhone
* It should connect to Metro automatically
* If not, scan the QR code shown by Expo

---

## Team 21

**Project Manager:** Rachit Kumar  
**Developers:** Aryan Jumani • Annsh Navle • Pranav Bansal • Shriyan Bachigari
