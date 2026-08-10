import { access, readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const strict = process.argv.includes('--strict');
const checks = [];

function record(name, ok, detail) {
  checks.push({ name, ok, detail });
}

async function exists(relativePath) {
  return access(resolve(root, relativePath)).then(() => true, () => false);
}

function command(name, args) {
  const result = spawnSync(name, args, { cwd: root, encoding: 'utf8' });
  return { ok: result.status === 0, detail: String(result.stdout || result.stderr || '').trim().split('\n')[0] || 'not available' };
}

const packageJson = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
record('Capacitor core', packageJson.dependencies?.['@capacitor/core'] === '^7.6.8', packageJson.dependencies?.['@capacitor/core'] || 'missing');
record('Capacitor iOS', packageJson.devDependencies?.['@capacitor/ios'] === '^7.6.8', packageJson.devDependencies?.['@capacitor/ios'] || 'missing');
record('Capacitor Android', packageJson.devDependencies?.['@capacitor/android'] === '^7.6.8', packageJson.devDependencies?.['@capacitor/android'] || 'missing');
record('iOS project', await exists('ios/App/App.xcodeproj/project.pbxproj'), 'run npm run mobile:add:ios when missing');
record('Android project', await exists('android/app/build.gradle'), 'run npm run mobile:add:android when missing');

const xcode = command('xcodebuild', ['-version']);
const java = command(process.env.JAVA_HOME ? resolve(process.env.JAVA_HOME, 'bin/java') : 'java', ['-version']);
record('Xcode', xcode.ok, xcode.detail);
record('Java', java.ok, java.detail);

const forbidden = ['imagen.web.js', 'HAIR_IMAGEN_KEY', 'Authorization:', '/images/edits'];
const consultation = await readFile(resolve(root, 'consultation/app.mjs'), 'utf8');
const html = await readFile(resolve(root, 'consultation/index.html'), 'utf8');
const explore = await readFile(resolve(root, 'explore/index.html'), 'utf8');
const browserSources = `${consultation}\n${html}\n${explore}`;
for (const marker of forbidden) record(`Browser secret marker absent: ${marker}`, !browserSources.includes(marker), marker);

for (const check of checks) console.log(`${check.ok ? 'OK' : 'WARN'} ${check.name}: ${check.detail}`);
const securityFailure = checks.some((check) => check.name.startsWith('Browser secret marker') && !check.ok);
const strictFailure = strict && checks.some((check) => !check.ok);
if (securityFailure || strictFailure) process.exitCode = 1;
