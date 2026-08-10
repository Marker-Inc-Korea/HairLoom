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
