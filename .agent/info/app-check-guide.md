# Beginner's Guide to Firebase App Check

App Check protects your Firebase resources (like Storage or Firestore) from unauthorized clients, even if your rules allow public access. It ensures that only **your** app can talk to your backend.

## 1. Why do I need this?
Even if you require login (`if request.auth != null`), a hacker could still use a script to log in as themselves and then scrape your entire stock list. App Check makes sure the request is coming from a real device running your official, untampered app.

## 2. Console Setup (Do this once)
1.  Go to the [Firebase Console](https://console.firebase.google.com/).
2.  Navigate to **Build > App Check**.
3.  **Register your Apps**:
    *   **iOS**: Register for **App Attest** or **DeviceCheck**.
    *   **Android**: Register for **Play Integrity**.
4.  **Enforce Storage**: Go to the "APIs" tab in App Check, find "Cloud Storage", and click **Enforce**. 
    *   *Warning: Do not click Enforce until your app code is ready, or it will block your mobile app!*

## 3. App Code Setup (Flutter)
You need the App Check SDK in your frontend app.

1.  Add the dependency: `flutter pub add firebase_app_check`
2.  Initialize it in your `main.dart` or `bootstrap.dart` BEFORE your storage calls:

```dart
import 'package:firebase_app_check/firebase_app_check.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await Firebase.initializeApp();
  
  // Initialize App Check
  await FirebaseAppCheck.instance.activate(
    // For iOS, use App Attest (preferred) or DeviceCheck
    appleProvider: AppleProvider.appAttest,
    // For Android, use Play Integrity
    androidProvider: AndroidProvider.playIntegrity,
  );
  
  runApp(MyApp());
}
```

## 4. Updates to Security Rules
Once App Check is enforced, you can *optionally* add a rule to make it explicit, though the console toggle handles most of it:

```javascript
match /system_data/{allPaths=**} {
  allow read: if request.auth != null && request.appCheck != null;
}
```

## 📋 Best Practice for Bizzie
*   **Step 1**: Get Authentication working first.
*   **Step 2**: Use App Check for that extra "only my official app" layer.
*   **Debug Tip**: When testing on simulators, you'll need a **Debug Token**. Check the [official docs](https://firebase.google.com/docs/app-check/flutter/debug-provider) on how to add a debug token to the console so your simulator doesn't get blocked.
