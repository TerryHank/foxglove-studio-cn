#!/usr/bin/env python3
"""Package three independent apps from the existing, already-built features."""
import os
from pathlib import Path
import shutil
import subprocess
import zipfile

app = Path(__file__).resolve().parents[1]
build = app / 'build'
sdk = Path(os.environ.get('ANDROID_SDK_ROOT') or os.environ['ANDROID_HOME'])
tools = sdk / 'build-tools/35.0.0'
android = sdk / 'platforms/android-35/android.jar'
java = app / 'src/main/java/dev/terryhank/foxglove/cn'
namespace = 'dev.terryhank.foxglove.cn'
variants = [
    ('navigation', '机器人导航', 'MainActivity', '#7864C4', 'M54,18L86,86L54,70L22,86Z'),
    ('wifi', '机器人 Wi-Fi', 'RobotWifiActivity', '#7864C4', 'M18,40Q54,10 90,40L82,50Q54,28 26,50ZM32,58Q54,40 76,58L67,68Q54,58 41,68ZM46,78A8,8 0,1 0,62 78A8,8 0,1 0,46 78'),
    ('follow', '视觉跟随', 'VisionFollowActivity', '#7864C4', 'M20,44V24H40V32H28V44ZM68,24H88V44H80V32H68ZM20,64H28V76H40V84H20ZM80,64H88V84H68V76H80ZM54,38A16,16 0,1 0,54 70A16,16 0,1 0,54 38'),
]
versions = {
    'navigation': ('6', '1.3.2-low-latency'),
    'wifi': ('3', '1.2-foxglove-theme'),
    'follow': ('9', '1.7-follow-filters'),
}
def run(*args, **kwargs):
    return subprocess.run([str(a) for a in args], check=True, **kwargs)

for name, label, activity, color, symbol in variants:
    stage = build / name
    for folder in ('res', 'generated', 'classes', 'dex', 'assets/www'):
        (stage / folder).mkdir(parents=True, exist_ok=True)
    shutil.copytree(app / 'src/main/res', stage / 'res', dirs_exist_ok=True)
    strings = stage / 'res/values/strings.xml'
    strings.write_text(strings.read_text().replace('Foxglove 中文测试版', label))
    (stage / 'res/drawable/ic_launcher.xml').write_text(
        '<vector xmlns:android="http://schemas.android.com/apk/res/android" android:width="108dp" android:height="108dp" android:viewportWidth="108" android:viewportHeight="108">'
        f'<path android:fillColor="{color}" android:pathData="M0,0H108V108H0Z"/>'
        f'<path android:fillColor="#FFFFFF" android:pathData="{symbol}"/></vector>')
    assets = stage / 'assets/www'
    if name == 'navigation':
        shutil.copytree(app / 'src/main/assets/www', assets, dirs_exist_ok=True,
                        ignore=shutil.ignore_patterns('vision-follow.*', 'vision-reference.js'))
    elif name == 'follow':
        for file in ('vision-follow.html', 'vision-follow.js', 'vision-reference.js', 'LICENSE', 'NOTICE', 'NOTICE.android.txt'):
            shutil.copy2(app / 'src/main/assets/www' / file, assets / file)
    manifest = stage / 'AndroidManifest.xml'
    manifest.write_text(f'''<manifest xmlns:android="http://schemas.android.com/apk/res/android" package="dev.terryhank.robot.{name}">
<uses-permission android:name="android.permission.INTERNET"/>
<application android:label="@string/app_name" android:icon="@drawable/ic_launcher" android:theme="@style/AppTheme" android:hardwareAccelerated="true" android:usesCleartextTraffic="true" android:allowBackup="false" android:debuggable="false" android:enableOnBackInvokedCallback="false">
<activity android:name="{namespace}.{activity}" android:exported="true" android:launchMode="singleTask" android:configChanges="orientation|screenSize|smallestScreenSize|keyboardHidden|uiMode" android:windowSoftInputMode="adjustResize">
<intent-filter><action android:name="android.intent.action.MAIN"/><category android:name="android.intent.category.LAUNCHER"/></intent-filter>
</activity></application></manifest>''')
    run(tools / 'aapt2', 'compile', '--dir', stage / 'res', '-o', stage / 'resources.zip')
    run(tools / 'aapt2', 'link', '-I', android, '--manifest', manifest, '--java', stage / 'generated',
        '--custom-package', namespace, '--min-sdk-version', '26', '--target-sdk-version', '35',
        '--version-code', versions[name][0], '--version-name', versions[name][1], '-A', stage / 'assets',
        '-o', stage / 'resources.apk', stage / 'resources.zip')
    sources = list(java.glob('*.java')) if name == 'navigation' else [java / (activity + '.java')]
    if name == 'follow': sources.append(java / 'LocalAssetServer.java')
    sources += list((stage / 'generated').rglob('*.java'))
    run('javac', '-encoding', 'UTF-8', '-source', '8', '-target', '8', '-Xlint:-options',
        '-classpath', android, '-d', stage / 'classes', *sources)
    run(tools / 'd8', '--lib', android, '--min-api', '26', '--output', stage / 'dex', *list((stage / 'classes').rglob('*.class')))
    shutil.copy2(stage / 'resources.apk', stage / 'unsigned.apk')
    with zipfile.ZipFile(stage / 'unsigned.apk', 'a', compression=zipfile.ZIP_DEFLATED) as archive:
        for dex in (stage / 'dex').glob('*.dex'): archive.write(dex, dex.name)
    run(tools / 'zipalign', '-p', '-f', '4', stage / 'unsigned.apk', stage / 'aligned.apk')
    output = build / 'out' / f'robot-{name}-android.apk'
    run(tools / 'apksigner', 'sign', '--ks', build / 'debug.keystore', '--ks-key-alias', 'androiddebugkey',
        '--ks-pass', 'pass:android', '--key-pass', 'pass:android', '--out', output, stage / 'aligned.apk')
    with (build / 'out' / f'{name}-signature.txt').open('w') as report:
        run(tools / 'apksigner', 'verify', '--verbose', '--print-certs', output, stdout=report)
    with (build / 'out' / f'{name}-metadata.txt').open('w') as report:
        run(tools / 'aapt2', 'dump', 'badging', output, stdout=report)
