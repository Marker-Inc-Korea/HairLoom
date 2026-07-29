import { spawnSync } from 'node:child_process';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const HAIR_TREND_SCHEDULE_LABEL = 'com.hairloom.trend-update';
export const DEFAULT_TREND_INTERVAL_HOURS = 24;
const managedMarker = 'Managed by Hairloom scripts/manageHairTrendSchedule.mjs';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const liveScriptPath = resolve(root, 'scripts/syncHairTrends.mjs');
const allowedEnvKeys = new Set(['HAIRLOOM_META_ACCESS_TOKEN', 'HAIRLOOM_META_IG_USER_ID', 'HAIRLOOM_META_API_VERSION', 'HAIRLOOM_NAVER_CLIENT_ID', 'HAIRLOOM_NAVER_CLIENT_SECRET']);

const xmlEscape = (value) => String(value).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[character]);

export function parseIntervalHours(argv = []) {
  const raw = argv.find((value) => value.startsWith('--interval-hours='));
  const hours = raw ? Number(raw.slice('--interval-hours='.length)) : DEFAULT_TREND_INTERVAL_HOURS;
  if (!Number.isInteger(hours) || hours < 1 || hours > 168) throw new TypeError('Trend schedule interval must be an integer from 1 to 168 hours');
  return hours;
}

export function parseTrendEnv(content = '') {
  const values = {};
  for (const rawLine of String(content).split(/\r?\n/)) {
    const line = rawLine.trim().replace(/^export\s+/, '');
    if (!line || line.startsWith('#')) continue;
    const match = /^([A-Z_][A-Z0-9_]*)=(.*)$/.exec(line);
    if (!match || !allowedEnvKeys.has(match[1])) continue;
    const rawValue = match[2].trim();
    const quoted = /^(?:"([\s\S]*)"|'([\s\S]*)')$/.exec(rawValue);
    values[match[1]] = quoted ? quoted[1] ?? quoted[2] ?? '' : rawValue;
  }
  return values;
}

export function trendCredentialStatus(fileValues = {}, processValues = process.env) {
  const value = (key) => String(processValues[key] ?? fileValues[key] ?? '').trim();
  const meta = Boolean(value('HAIRLOOM_META_ACCESS_TOKEN') && value('HAIRLOOM_META_IG_USER_ID'));
  const naver = Boolean(value('HAIRLOOM_NAVER_CLIENT_ID') && value('HAIRLOOM_NAVER_CLIENT_SECRET'));
  return { ready: meta || naver, providers: [meta ? 'meta' : '', naver ? 'naver' : ''].filter(Boolean) };
}

export function buildLaunchAgentPlist({ nodePath, repoPath, intervalHours = DEFAULT_TREND_INTERVAL_HOURS, stdoutPath, stderrPath }) {
  const hours = parseIntervalHours([`--interval-hours=${intervalHours}`]);
  const intervalSeconds = hours * 60 * 60;
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<!-- ${managedMarker} -->
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${HAIR_TREND_SCHEDULE_LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${xmlEscape(nodePath)}</string>
    <string>${xmlEscape(resolve(repoPath, 'scripts/syncHairTrends.mjs'))}</string>
    <string>--live</string>
  </array>
  <key>WorkingDirectory</key>
  <string>${xmlEscape(repoPath)}</string>
  <key>StartInterval</key>
  <integer>${intervalSeconds}</integer>
  <key>RunAtLoad</key>
  <false/>
  <key>ProcessType</key>
  <string>Background</string>
  <key>LowPriorityIO</key>
  <true/>
  <key>StandardOutPath</key>
  <string>${xmlEscape(stdoutPath)}</string>
  <key>StandardErrorPath</key>
  <string>${xmlEscape(stderrPath)}</string>
</dict>
</plist>
`;
}

export function isManagedTrendPlist(content) {
  const value = String(content ?? '');
  return value.includes(managedMarker) && value.includes(`<string>${HAIR_TREND_SCHEDULE_LABEL}</string>`) && value.includes('scripts/syncHairTrends.mjs');
}

function schedulePaths(home = homedir()) {
  const launchAgentsDir = resolve(home, 'Library/LaunchAgents');
  const logDir = resolve(root, '.gjc/logs');
  return {
    launchAgentsDir,
    plistPath: resolve(launchAgentsDir, `${HAIR_TREND_SCHEDULE_LABEL}.plist`),
    logDir,
    stdoutPath: resolve(logDir, 'hair-trends.log'),
    stderrPath: resolve(logDir, 'hair-trends.error.log')
  };
}

function launchDomain() {
  return `gui/${process.getuid()}`;
}

function launchctl(args, { allowFailure = false } = {}) {
  const result = spawnSync('launchctl', args, { encoding: 'utf8' });
  if (!allowFailure && result.status !== 0) throw new Error((result.stderr || result.stdout || `launchctl ${args[0]} failed`).trim());
  return result;
}

async function readOptional(path) {
  return readFile(path, 'utf8').catch((error) => error?.code === 'ENOENT' ? null : Promise.reject(error));
}

async function credentialStatus() {
  const content = await readOptional(resolve(root, '.env'));
  return trendCredentialStatus(parseTrendEnv(content ?? ''), process.env);
}

function printResult(payload) {
  console.log(JSON.stringify(payload, null, 2));
  return payload;
}

async function install(argv) {
  const dryRun = argv.includes('--dry-run');
  const intervalHours = parseIntervalHours(argv);
  if (process.platform !== 'darwin' && !dryRun) throw new Error('Hairloom periodic trend scheduling currently requires macOS launchd');
  const paths = schedulePaths();
  const existing = await readOptional(paths.plistPath);
  if (existing && !isManagedTrendPlist(existing)) throw new Error(`Refusing to overwrite unmanaged launch agent: ${paths.plistPath}`);
  const credentials = await credentialStatus();
  if (!credentials.ready && !dryRun) throw new Error('Trend schedule requires a complete Meta or Naver credential pair in .env or the process environment');
  const plist = buildLaunchAgentPlist({ nodePath: process.execPath, repoPath: root, intervalHours, stdoutPath: paths.stdoutPath, stderrPath: paths.stderrPath });
  if (dryRun) return printResult({ action: 'install', dryRun: true, label: HAIR_TREND_SCHEDULE_LABEL, intervalHours, plistPath: paths.plistPath, providers: credentials.providers, embedsSecrets: false, plist });
  await mkdir(paths.launchAgentsDir, { recursive: true });
  await mkdir(paths.logDir, { recursive: true });
  const temporaryPath = `${paths.plistPath}.tmp-${process.pid}`;
  await writeFile(temporaryPath, plist, { mode: 0o600 });
  await rename(temporaryPath, paths.plistPath);
  launchctl(['bootout', `${launchDomain()}/${HAIR_TREND_SCHEDULE_LABEL}`], { allowFailure: true });
  launchctl(['bootstrap', launchDomain(), paths.plistPath]);
  return printResult({ action: 'install', installed: true, label: HAIR_TREND_SCHEDULE_LABEL, intervalHours, plistPath: paths.plistPath, providers: credentials.providers, logs: { stdout: paths.stdoutPath, stderr: paths.stderrPath } });
}

async function status() {
  const paths = schedulePaths();
  const existing = await readOptional(paths.plistPath);
  if (existing && !isManagedTrendPlist(existing)) throw new Error(`Unmanaged launch agent occupies Hairloom trend label: ${paths.plistPath}`);
  const result = process.platform === 'darwin' ? launchctl(['print', `${launchDomain()}/${HAIR_TREND_SCHEDULE_LABEL}`], { allowFailure: true }) : { status: 1 };
  return printResult({ action: 'status', installed: Boolean(existing), loaded: result.status === 0, label: HAIR_TREND_SCHEDULE_LABEL, plistPath: paths.plistPath });
}

async function removeSchedule() {
  if (process.platform !== 'darwin') throw new Error('Hairloom periodic trend scheduling currently requires macOS launchd');
  const paths = schedulePaths();
  const existing = await readOptional(paths.plistPath);
  if (!existing) return printResult({ action: 'remove', removed: false, reason: 'not-installed', plistPath: paths.plistPath });
  if (!isManagedTrendPlist(existing)) throw new Error(`Refusing to remove unmanaged launch agent: ${paths.plistPath}`);
  launchctl(['bootout', `${launchDomain()}/${HAIR_TREND_SCHEDULE_LABEL}`], { allowFailure: true });
  await rm(paths.plistPath);
  return printResult({ action: 'remove', removed: true, label: HAIR_TREND_SCHEDULE_LABEL, plistPath: paths.plistPath });
}

async function runOnce() {
  const credentials = await credentialStatus();
  if (!credentials.ready) throw new Error('Trend update requires a complete Meta or Naver credential pair in .env or the process environment');
  const result = spawnSync(process.execPath, [liveScriptPath, '--live'], { cwd: root, stdio: 'inherit', env: process.env });
  if (result.status !== 0) throw new Error(`Trend update failed with exit code ${result.status ?? 'unknown'}`);
  return printResult({ action: 'run-once', completed: true, providers: credentials.providers });
}

export async function main(argv = process.argv.slice(2)) {
  const command = argv[0] || 'status';
  if (command === 'install') return install(argv.slice(1));
  if (command === 'status') return status();
  if (command === 'remove' || command === 'uninstall') return removeSchedule();
  if (command === 'run-once') return runOnce();
  throw new TypeError('Usage: manageHairTrendSchedule.mjs install [--dry-run] [--interval-hours=24] | status | remove | run-once');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
