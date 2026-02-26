npx expo prebuild --platform android
cd android && ./gradlew assembleDebug && cd ..
$ADB_LOCATION install -r -d $(wslpath -w "android/app/build/outputs/apk/debug/app-debug.apk")
npx expo start -c
