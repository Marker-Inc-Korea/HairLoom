import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import test from 'node:test';
import {
  DEFAULT_TREND_INTERVAL_HOURS,
  HAIR_TREND_SCHEDULE_LABEL,
  buildLaunchAgentPlist,
  isManagedTrendPlist,
  parseIntervalHours,
  parseTrendEnv,
  trendCredentialStatus
} from './scripts/manageHairTrendSchedule.mjs';

test('trend schedule interval is bounded from one hour to two weeks', () => {
  assert.equal(parseIntervalHours([]), DEFAULT_TREND_INTERVAL_HOURS);
  assert.equal(DEFAULT_TREND_INTERVAL_HOURS, 336);
  assert.equal(parseIntervalHours(['--interval-hours=6']), 6);
  assert.throws(() => parseIntervalHours(['--interval-hours=0']), /1 to 336 hours/);
  assert.throws(() => parseIntervalHours(['--interval-hours=337']), /1 to 336 hours/);
  assert.throws(() => parseIntervalHours(['--interval-hours=1.5']), /1 to 336 hours/);
});

test('trend credential readiness requires one complete provider pair', () => {
  const parsed = parseTrendEnv('HAIRLOOM_META_ACCESS_TOKEN="meta-secret"\nHAIRLOOM_META_IG_USER_ID=123\nIGNORED=value\n');
  assert.deepEqual(parsed, { HAIRLOOM_META_ACCESS_TOKEN: 'meta-secret', HAIRLOOM_META_IG_USER_ID: '123' });
  assert.deepEqual(trendCredentialStatus(parsed, {}), { ready: true, providers: ['meta'] });
  assert.deepEqual(trendCredentialStatus({ HAIRLOOM_NAVER_CLIENT_ID: 'id' }, {}), { ready: false, providers: [] });
  assert.deepEqual(trendCredentialStatus({ HAIRLOOM_NAVER_CLIENT_ID: 'id', HAIRLOOM_NAVER_CLIENT_SECRET: 'secret' }, {}), { ready: true, providers: ['naver'] });
});

test('launch agent plist contains only executable metadata and no credentials', () => {
  const plist = buildLaunchAgentPlist({
    nodePath: '/opt/Hair & Node/bin/node',
    repoPath: '/Users/test/Hairloom & Trends',
    intervalHours: DEFAULT_TREND_INTERVAL_HOURS,
    stdoutPath: '/Users/test/logs/out.log',
    stderrPath: '/Users/test/logs/error.log'
  });
  assert.match(plist, new RegExp(HAIR_TREND_SCHEDULE_LABEL));
  assert.match(plist, /<integer>1209600<\/integer>/);
  assert.match(plist, /Hair &amp; Node/);
  assert.match(plist, /Hairloom &amp; Trends/);
  assert.match(plist, /scripts\/syncHairTrends\.mjs/);
  assert.match(plist, /<string>--live<\/string>/);
  assert.doesNotMatch(plist, /ACCESS_TOKEN|CLIENT_SECRET|meta-secret|naver-secret/);
});

test('managed launch agent detection rejects label collisions', () => {
  const plist = buildLaunchAgentPlist({ nodePath: '/usr/bin/node', repoPath: '/repo', intervalHours: 24, stdoutPath: '/tmp/out', stderrPath: '/tmp/error' });
  assert.equal(isManagedTrendPlist(plist), true);
  assert.equal(isManagedTrendPlist(plist.replace('Managed by Hairloom scripts/manageHairTrendSchedule.mjs', 'User launch agent')), false);
  assert.equal(isManagedTrendPlist(plist.replace(HAIR_TREND_SCHEDULE_LABEL, 'com.example.other')), false);
});

test('scheduler dry-run is side-effect free and never prints secret values', async () => {
  const home = await mkdtemp(resolve(tmpdir(), 'hairloom-trend-schedule-'));
  const result = spawnSync(process.execPath, ['scripts/manageHairTrendSchedule.mjs', 'install', '--dry-run', '--interval-hours=12'], {
    cwd: new URL('.', import.meta.url).pathname,
    encoding: 'utf8',
    env: { ...process.env, HOME: home, HAIRLOOM_META_ACCESS_TOKEN: 'do-not-print-this-secret', HAIRLOOM_META_IG_USER_ID: '123' }
  });
  assert.equal(result.status, 0, result.stderr);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.dryRun, true);
  assert.equal(payload.intervalHours, 12);
  assert.deepEqual(payload.providers, ['meta']);
  assert.equal(payload.embedsSecrets, false);
  assert.doesNotMatch(result.stdout, /do-not-print-this-secret/);
});
