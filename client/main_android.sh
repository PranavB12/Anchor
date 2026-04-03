npx expo prebuild --platform android
cd android && ./gradlew assembleRelease && cd ..
$ADB_LOCATION install -r -d $(wslpath -w "android/app/build/outputs/apk/release/app-release.apk")
