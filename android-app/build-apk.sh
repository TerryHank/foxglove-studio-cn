#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP="$ROOT/android-app"
SDK="${ANDROID_SDK_ROOT:-${ANDROID_HOME:-}}"
: "${SDK:?Set ANDROID_SDK_ROOT or ANDROID_HOME}"
TOOLS="$SDK/build-tools/35.0.0"
ANDROID_JAR="$SDK/platforms/android-35/android.jar"
for command in "$TOOLS/aapt2" "$TOOLS/d8" "$TOOLS/zipalign" "$TOOLS/apksigner"; do
  [[ -x "$command" ]] || { echo "Missing Android SDK tool: $command" >&2; exit 1; }
done
[[ -f "$ANDROID_JAR" ]] || { echo "Missing SDK platform android-35" >&2; exit 1; }
python3 "$APP/scripts/prepare-assets.py"
BUILD="$APP/build"
rm -rf "$BUILD"
mkdir -p "$BUILD/classes" "$BUILD/generated" "$BUILD/dex" "$BUILD/out"
"$TOOLS/aapt2" compile --dir "$APP/src/main/res" -o "$BUILD/resources.zip"
"$TOOLS/aapt2" link -I "$ANDROID_JAR" --manifest "$APP/src/main/AndroidManifest.xml" \
  --java "$BUILD/generated" --min-sdk-version 26 --target-sdk-version 35 \
  --version-code 9 --version-name "1.86.0-cn.8-android.9" \
  -A "$APP/src/main/assets" -o "$BUILD/resources.apk" "$BUILD/resources.zip"
find "$APP/src/main/java" "$BUILD/generated" -name '*.java' > "$BUILD/sources.txt"
javac -encoding UTF-8 -source 8 -target 8 -Xlint:-options -classpath "$ANDROID_JAR" \
  -d "$BUILD/classes" @"$BUILD/sources.txt"
find "$BUILD/classes" -name '*.class' > "$BUILD/classes.txt"
"$TOOLS/d8" --lib "$ANDROID_JAR" --min-api 26 --output "$BUILD/dex" @"$BUILD/classes.txt"
cp "$BUILD/resources.apk" "$BUILD/unsigned.apk"
(cd "$BUILD/dex" && zip -q "$BUILD/unsigned.apk" classes*.dex)
"$TOOLS/zipalign" -p -f 4 "$BUILD/unsigned.apk" "$BUILD/aligned.apk"
# Ephemeral test key, never a production signing identity. Not included in artifacts.
KEY="$BUILD/debug.keystore"
keytool -genkeypair -keystore "$KEY" -alias androiddebugkey -storepass android -keypass android \
  -keyalg RSA -keysize 2048 -validity 3650 -dname "CN=Android Debug,O=Android,C=US" -noprompt
APK="$BUILD/out/foxglove-studio-cn-android-test.apk"
"$TOOLS/apksigner" sign --ks "$KEY" --ks-key-alias androiddebugkey \
  --ks-pass pass:android --key-pass pass:android --out "$APK" "$BUILD/aligned.apk"
"$TOOLS/apksigner" verify --verbose --print-certs "$APK" | tee "$BUILD/out/signature-verification.txt"
"$TOOLS/aapt2" dump badging "$APK" > "$BUILD/out/apk-metadata.txt"
(cd "$BUILD/out" && sha256sum foxglove-studio-cn-android-test.apk > SHA256SUMS.txt)
cp "$APP/README.zh-CN.md" "$BUILD/out/安装说明.txt"
git -C "$ROOT" rev-parse HEAD > "$BUILD/out/source-commit.txt"
echo "Built: $APK"
