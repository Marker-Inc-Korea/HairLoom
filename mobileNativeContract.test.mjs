import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('mobile asset packager is explicit and excludes secret/private surfaces', async () => {
  const [source, configText] = await Promise.all([
    read('./scripts/prepareMobileAssets.mjs'),
    read('./capacitor.config.json')
  ]);
  const config = JSON.parse(configText);
  assert.match(source, /const PUBLIC_ASSETS = Object\.freeze/);
  assert.match(source, /src\/mobileProviderBridge\.mjs/);
  assert.match(source, /consultation\/app\.mjs/);
  assert.match(source, /location\.replace\('\.\/consultation\/index\.html'\)/);
  assert.doesNotMatch(source, /['"]imagen\.web\.js['"]/);
  assert.doesNotMatch(source, /['"]explore\/index\.html['"]/);
  assert.doesNotMatch(source, /model-previews\/index\.html/);
  assert.doesNotMatch(source, /test-subjects/);
  assert.equal(config.ios.contentInset, 'never');
  assert.equal(config.android.allowMixedContent, false);
  assert.equal(Object.hasOwn(config.server, 'url'), false);
});

test('Android provider uses Keystore, private SQLite queue, fixed HTTPS host and no backup', async () => {
  const [plugin, manifest] = await Promise.all([
    read('./android/app/src/main/java/com/markerinc/hairloom/HairloomProviderPlugin.java'),
    read('./android/app/src/main/AndroidManifest.xml')
  ]);
  assert.match(plugin, /AndroidKeyStore/);
  assert.match(plugin, /AES\/GCM\/NoPadding/);
  assert.match(plugin, /SQLiteOpenHelper/);
  assert.match(plugin, /SLOT_COUNT = 100/);
  assert.match(plugin, /https:\/\/api\.openai\.com\/v1\/images\/edits/);
  assert.match(plugin, /generated-input|source-ownership/);
  assert.match(plugin, /status='retryable'.*WHERE status='running'/);
  assert.match(plugin, /outputId/);
  assert.match(plugin, /context\.json/);
  assert.match(plugin, /readSource/);
  assert.match(plugin, /runAnalysis/);
  assert.match(plugin, /https:\/\/api\.openai\.com\/v1\/responses/);
  assert.match(plugin, /Never infer or describe identity/);
  assert.match(plugin, /lastEventId/);
  assert.match(plugin, /status IN \('queued','running','retryable'\)/);
  assert.match(plugin, /CUSTOMER_DATA_TTL_MS/);
  assert.match(plugin, /cleanupExpired/);
  assert.match(plugin, /releaseForCredentialClear/);
  assert.match(plugin, /validDimensions/);
  assert.match(plugin, /image\/jpeg/);
  assert.ok(plugin.indexOf('validateTypedOpaque(call.getString("sourceId"), "source")') < plugin.indexOf('String apiKey = vault.read()'));
  assert.match(plugin, /Thread\.sleep/);
  assert.doesNotMatch(plugin, /Log\.[diewv]\s*\(/);
  assert.match(manifest, /android:allowBackup="false"/);
  assert.match(manifest, /android:usesCleartextTraffic="false"/);
});

test('iOS provider uses device-only Keychain, protected private files and SQLite recovery', async () => {
  const [plugin, info, storyboard] = await Promise.all([
    read('./ios/App/App/HairloomProviderPlugin.swift'),
    read('./ios/App/App/Info.plist'),
    read('./ios/App/App/Base.lproj/Main.storyboard')
  ]);
  assert.match(plugin, /kSecAttrAccessibleWhenUnlockedThisDeviceOnly/);
  assert.match(plugin, /completeFileProtection/);
  assert.match(plugin, /isExcludedFromBackup = true/);
  assert.match(plugin, /import SQLite3/);
  assert.match(plugin, /status='retryable'.*WHERE status='running'/);
  assert.match(plugin, /https:\/\/api\.openai\.com\/v1\/images\/edits/);
  assert.match(plugin, /source-ownership/);
  assert.match(plugin, /context\.json/);
  assert.match(plugin, /readSource/);
  assert.match(plugin, /runAnalysis/);
  assert.match(plugin, /https:\/\/api\.openai\.com\/v1\/responses/);
  assert.match(plugin, /Never infer or describe identity/);
  assert.match(plugin, /lastEventId/);
  assert.match(plugin, /status IN \('queued','running','retryable'\)/);
  assert.match(plugin, /customerDataTTL/);
  assert.match(plugin, /cleanupExpired/);
  assert.match(plugin, /releaseForCredentialClear/);
  assert.match(plugin, /validDimensions/);
  assert.match(plugin, /image\/jpeg/);
  assert.ok(plugin.indexOf('let request = try call.decode(AnalysisRequest.self)') < plugin.indexOf('HairloomKeychain.read()'));
  assert.match(plugin, /asyncAfter/);
  assert.doesNotMatch(plugin, /print\s*\(/);
  assert.match(info, /NSCameraUsageDescription/);
  assert.match(info, /NSPhotoLibraryUsageDescription/);
  assert.match(info, /<key>UIFileSharingEnabled<\/key>\s*<false\/>/);
  assert.match(storyboard, /customClass="HairloomBridgeViewController" customModule="App"/);
});

test('public web surfaces contain no browser credential transport', async () => {
  const sources = (await Promise.all([
    read('./consultation/app.mjs'),
    read('./consultation/index.html'),
    read('./explore/index.html')
  ])).join('\n');
  assert.doesNotMatch(sources, /HAIR_IMAGEN_KEY|Authorization:|\/images\/edits|imagen\.web\.js|id="cfgKey"/);
  assert.match(sources, /createNativeBatch/);
  assert.match(sources, /Hairloom 모바일 앱/);
  assert.match(sources, /restoreNativeBatchSession/);
  assert.match(sources, /readPreparedSource/);
  assert.match(sources, /generationAxes: preparedSlots\.map/);
  assert.match(sources, /runNativeAnalysis/);
  assert.match(sources, /eventId <= Number\(slot\?\.nativeEventId/);
  assert.match(sources, /deleteAllCustomerData/);
  assert.match(sources, /모든 고객 데이터 삭제/);
});

test('Android release workflow publishes only the versioned APK and checksum', async () => {
  const workflow = await read('./.github/workflows/mobile-android-preview.yml');
  assert.match(workflow, /^name: Mobile Android Release$/m);
  assert.match(workflow, /tags:\n\s+- 'v\*'/);
  assert.match(workflow, /actions\/checkout@v7/);
  assert.match(workflow, /actions\/setup-node@v7[\s\S]*node-version: 20/);
  assert.match(workflow, /actions\/setup-java@v5[\s\S]*distribution: temurin[\s\S]*java-version: 21/);
  assert.match(workflow, /actions\/upload-artifact@v7/);
  assert.match(workflow, /actions\/download-artifact@v8/);
  assert.match(workflow, /npm run mobile:prepare/);
  assert.match(workflow, /npx cap sync android/);
  assert.match(workflow, /\.\/android\/gradlew -p android assembleDebug --no-daemon/);
  assert.match(workflow, /package-version-mismatch/);
  assert.match(workflow, /versionName \\"\$VERSION\\"/);
  assert.match(workflow, /Hairloom-\$\{VERSION\}-android\.apk/);
  assert.match(workflow, /sha256sum "\$APK_NAME" > "\$APK_NAME\.sha256"/);
  assert.match(workflow, /sha256sum --check "\$CHECKSUM_NAME"/);
  assert.match(workflow, /find \. -maxdepth 1 -type f/);
  assert.match(workflow, /retention-days: 30/);
  assert.match(workflow, /if: github\.event_name == 'push' && startsWith\(github\.ref, 'refs\/tags\/'\)/);
  assert.match(workflow, /Release \$GITHUB_REF_NAME already exists; refusing to overwrite release assets/);
  assert.match(workflow, /Missing stable release notes/);
  assert.match(workflow, /--verify-tag/);
  assert.match(workflow, /RELEASE_ARGS\+=\(--prerelease\)/);
  assert.match(workflow, /dist\/\$APK_NAME#Hairloom Android APK/);
  assert.match(workflow, /dist\/\$CHECKSUM_NAME#SHA-256 checksum/);
  const uploadPaths = workflow.match(/- uses: actions\/upload-artifact@v7[\s\S]*?retention-days: 30/)?.[0] || '';
  const releaseAssets = workflow.match(/gh release create[\s\S]*?--notes-file "\$NOTES_FILE"/)?.[0] || '';
  assert.doesNotMatch(uploadPaths, /\.jks|keystore|signing|customer|credential|mobile-dist/i);
  assert.doesNotMatch(releaseAssets, /\.jks|keystore|signing|customer|credential|mobile-dist/i);
});

test('release metadata is aligned at noncommercial version 1.0.0', async () => {
  const [packageText, lockText, android, iosProject] = await Promise.all([
    read('./package.json'),
    read('./package-lock.json'),
    read('./android/app/build.gradle'),
    read('./ios/App/App.xcodeproj/project.pbxproj')
  ]);
  const packageJson = JSON.parse(packageText);
  const packageLock = JSON.parse(lockText);
  assert.equal(packageJson.version, '1.0.0');
  assert.equal(packageJson.private, true);
  assert.equal(packageJson.license, 'PolyForm-Noncommercial-1.0.0');
  assert.equal(packageLock.version, '1.0.0');
  assert.equal(packageLock.packages[''].version, '1.0.0');
  assert.equal(packageLock.packages[''].license, 'PolyForm-Noncommercial-1.0.0');
  assert.match(android, /versionCode 1/);
  assert.match(android, /versionName "1\.0\.0"/);
  assert.equal((iosProject.match(/MARKETING_VERSION = 1\.0\.0;/g) || []).length, 2);
  assert.equal((iosProject.match(/CURRENT_PROJECT_VERSION = 1;/g) || []).length, 2);
});

test('public release license and guidance remain noncommercial source-available', async () => {
  const [license, commercial, security, readmeKo, readmeEn, releaseNotes] = await Promise.all([
    read('./LICENSE'),
    read('./COMMERCIAL-LICENSE.md'),
    read('./SECURITY.md'),
    read('./README.md'),
    read('./README.en.md'),
    read('./docs/releases/v1.0.0.md')
  ]);
  assert.match(license, /^# PolyForm Noncommercial License 1\.0\.0/m);
  assert.match(license, /^Required Notice: Copyright 2026 NomaDamas\.$/m);
  assert.match(license, /## Noncommercial Purposes/);
  assert.match(license, /## No Liability/);
  assert.match(commercial, /separate written commercial license from NomaDamas/);
  assert.match(commercial, /별도의 서면 상업 라이선스/);
  assert.match(security, /Security → Report a vulnerability/);
  assert.match(security, /API keys, customer photos, generated outputs/);
  for (const document of [readmeKo, readmeEn, releaseNotes]) {
    assert.match(document, /1\.0\.0/);
    assert.match(document, /PolyForm Noncommercial License 1\.0\.0/);
    assert.match(document, /source-available/);
  }
  assert.match(readmeKo, /OSI 승인 오픈소스 라이선스가 아닙니다/);
  assert.match(readmeEn, /not an OSI-approved open-source license/);
  assert.match(releaseNotes, /컴퓨터.*Android APK/s);
  assert.match(releaseNotes, /실제 Provider 분석·생성은 실행하지 않습니다/);
});

test('launch announcement preserves public distribution and security claims', async () => {
  const [launch, readmeKo, readmeEn, releaseNotes] = await Promise.all([
    read('./docs/releases/v1.0.0-launch.md'),
    read('./README.md'),
    read('./README.en.md'),
    read('./docs/releases/v1.0.0.md')
  ]);
  assert.match(launch, /Hairloom 1\.0\.0 공개/);
  assert.match(launch, /Hairloom 1\.0\.0 is public/);
  assert.match(launch, /https:\/\/github\.com\/Marker-Inc-Korea\/HairLoom/);
  assert.match(launch, /https:\/\/github\.com\/Marker-Inc-Korea\/HairLoom\/releases\/tag\/v1\.0\.0/);
  assert.match(launch, /컴퓨터.*Android/s);
  assert.match(launch, /별도 과금 OpenAI API 키/);
  assert.match(launch, /separately billed OpenAI API key/);
  assert.match(launch, /PolyForm Noncommercial 1\.0\.0/);
  assert.match(launch, /비상업적 source-available/);
  assert.match(launch, /noncommercial source-available/);
  assert.match(launch, /Play Store와 App Store 배포는 보류/);
  assert.match(launch, /debug-signed sideload/);
  assert.doesNotMatch(launch, /API key[:=]|sk-[A-Za-z0-9_-]{20,}|~\/\.codex\/auth\.json|ChatGPT 비밀번호|ChatGPT password/i);
  assert.match(readmeKo, /docs\/releases\/v1\.0\.0-launch\.md/);
  assert.match(readmeEn, /docs\/releases\/v1\.0\.0-launch\.md/);
  assert.match(releaseNotes, /\(v1\.0\.0-launch\.md\)/);
});
