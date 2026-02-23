cd android && ./gradlew assembleDebug && cd ..
$ADB_LOCATION install -r -d "C:\\Users\\Aryan Jumani\\projects\\Anchor\\client\\android\\app\\build\\outputs\\apk\\debug\\app-debug.apk"
npx expo start -c
