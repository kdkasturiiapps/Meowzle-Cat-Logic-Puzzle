# Meowzle: Cat Logic Puzzle

A cozy cat logic puzzle for Android. Put one cat in every colour block, one per row and column — and cats can't touch, not even diagonally.

## How it's built
- `src/game.html` — the whole game (HTML/CSS/JS); `src/engine.js` makes the puzzles (each has exactly one solution); `src/reminders.js` plans play reminders (every 3 h after last play, never 9 PM–7 AM, streak warnings at 4 PM and 6 PM local time).
- `src/cloud.js` + `src/firebase-config.js` — online scores and leaderboard (Firebase anonymous sign-in + Firestore). Security rules: `firestore.rules` (paste into Firebase console → Firestore → Rules).
- Ads: AdMob via `@capacitor-community/admob` (interstitial every 3 levels from level 6, rewarded hint, rewarded extra heart). `build.js` sets the ad mode: default **test** (Google sample ads — safe to tap); `ADS_MODE=live node build.js` uses the real Meowzle ad units (Play Store builds only). Real IDs are in `src/game.html` (`AD_IDS`); App ID in `android/app/src/main/res/values/strings.xml`.
- Global Challenge: up to 20 players race on the same 7×7 puzzle (5 min, 3 hearts, no hints). `MeowCloud.joinChallenge` finds an open room in Firestore (`rooms/`) or makes one with a 20 s lobby; empty seats are filled with bot players when the race starts. Bots race at a human pace based on the real players' own recent solve times (`CH.myPace`), so a good game can win. Offline, the race runs with bots only.
- `build.js` puts it together into `www/` (fonts bundled so it works offline).
- Android app via [Capacitor](https://capacitorjs.com) (`android/`), with Local Notifications. Reminder sound: `android/app/src/main/res/raw/meow.wav`.

## Getting the APK
Every push to `main` builds the app on GitHub (Actions tab). The APK appears under **Releases** (and as a workflow artifact). These are debug-signed test builds for installing on a phone; Play Store uploads need a signed release build (AAB) — to be added.

## Local build
```
npm ci
npm run sync          # build www/ and copy into android/
cd android && ./gradlew assembleDebug
```
