# Meowzle: Cat Logic Puzzle

A cozy cat logic puzzle for Android. Put one cat in every colour block, one per row and column — and cats can't touch, not even diagonally.

## How it's built
- `src/game.html` — the whole game (HTML/CSS/JS); `src/engine.js` makes the puzzles (each has exactly one solution); `src/reminders.js` plans play reminders (every 3 h after last play, never 9 PM–7 AM, streak warnings at 4 PM and 6 PM local time).
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
