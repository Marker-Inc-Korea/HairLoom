import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import test from 'node:test';
import {
  BIWEEKLY_TREND_ANCHOR,
  BIWEEKLY_TREND_INTERVAL_DAYS,
  isBiweeklyTrendDue
} from './scripts/checkHairTrendCadence.mjs';

test('biweekly trend cadence is deterministic across calendar boundaries', () => {
  assert.equal(BIWEEKLY_TREND_ANCHOR, '2026-08-03');
  assert.equal(BIWEEKLY_TREND_INTERVAL_DAYS, 14);
  assert.equal(isBiweeklyTrendDue('2026-08-03'), true);
  assert.equal(isBiweeklyTrendDue('2026-08-10'), false);
  assert.equal(isBiweeklyTrendDue('2026-08-17'), true);
  assert.equal(isBiweeklyTrendDue('2026-12-21'), true);
  assert.equal(isBiweeklyTrendDue('2027-01-04'), true);
  assert.equal(isBiweeklyTrendDue('2026-07-27'), false);
  assert.throws(() => isBiweeklyTrendDue('2026-02-30'), /Invalid trend cadence date/);
});

test('cadence CLI writes GitHub outputs and manual force bypasses the date gate', async () => {
  const directory = await mkdtemp(resolve(tmpdir(), 'hairloom-cadence-'));
  const outputPath = resolve(directory, 'github-output.txt');
  const result = spawnSync(process.execPath, ['scripts/checkHairTrendCadence.mjs', '--date=2026-08-10', '--force', `--github-output=${outputPath}`], {
    cwd: new URL('.', import.meta.url).pathname,
    encoding: 'utf8'
  });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), { due: true, forced: true, date: '2026-08-10', anchor: '2026-08-03', intervalDays: 14 });
  const output = await readFile(outputPath, 'utf8');
  assert.match(output, /^due=true$/m);
  assert.match(output, /^date=2026-08-10$/m);
  assert.match(output, /^anchor=2026-08-03$/m);
  const invalid = spawnSync(process.execPath, ['scripts/checkHairTrendCadence.mjs', '--date=2026-02-30', '--force'], {
    cwd: new URL('.', import.meta.url).pathname,
    encoding: 'utf8'
  });
  assert.equal(invalid.status, 1);
  assert.match(invalid.stderr, /Invalid trend cadence date/);
});

test('trend change guard accepts only allowlisted data paths', async () => {
  const directory = await mkdtemp(resolve(tmpdir(), 'hairloom-trend-guard-'));
  await mkdir(resolve(directory, 'data'), { recursive: true });
  await mkdir(resolve(directory, 'src'), { recursive: true });
  await writeFile(resolve(directory, 'data/hair-trend-signals.json'), '{}\n');
  await writeFile(resolve(directory, 'src/hairTrendData.mjs'), 'export default {};\n');
  for (const args of [
    ['init', '--quiet'],
    ['config', 'user.name', 'Hairloom Test'],
    ['config', 'user.email', 'hairloom@example.invalid'],
    ['config', 'commit.gpgsign', 'false'],
    ['add', '--', 'data/hair-trend-signals.json', 'src/hairTrendData.mjs'],
    ['commit', '--quiet', '-m', 'baseline']
  ]) {
    const git = spawnSync('git', args, { cwd: directory, encoding: 'utf8' });
    assert.equal(git.status, 0, git.stderr);
  }

  await writeFile(resolve(directory, 'data/hair-trend-signals.json'), '{"updated":true}\n');
  const checker = new URL('./scripts/checkHairTrendChanges.mjs', import.meta.url).pathname;
  const allowed = spawnSync(process.execPath, [checker], { cwd: directory, encoding: 'utf8' });
  assert.equal(allowed.status, 0, allowed.stderr);
  assert.deepEqual(JSON.parse(allowed.stdout), { changed: true, paths: ['data/hair-trend-signals.json'], staged: false });

  const stage = spawnSync('git', ['add', '--', 'data/hair-trend-signals.json'], { cwd: directory, encoding: 'utf8' });
  assert.equal(stage.status, 0, stage.stderr);
  const staged = spawnSync(process.execPath, [checker, '--staged', '--require-change'], { cwd: directory, encoding: 'utf8' });
  assert.equal(staged.status, 0, staged.stderr);

  await writeFile(resolve(directory, 'unexpected.txt'), 'blocked\n');
  const rejected = spawnSync(process.execPath, [checker], { cwd: directory, encoding: 'utf8' });
  assert.equal(rejected.status, 1);
  assert.match(rejected.stderr, /Unexpected trend refresh paths: unexpected\.txt/);
});

test('GitHub workflow gates biweekly runs and publishes data-only pull requests', async () => {
  const workflow = await readFile(new URL('./.github/workflows/hair-trend-refresh.yml', import.meta.url), 'utf8');
  assert.match(workflow, /cron: '30 0 \* \* 1'/);
  assert.match(workflow, /scripts\/checkHairTrendCadence\.mjs/);
  assert.match(workflow, /node scripts\/syncHairTrends\.mjs --live/);
  assert.match(workflow, /npm run verify/);
  assert.match(workflow, /scripts\/checkHairTrendChanges\.mjs --github-output/);
  assert.match(workflow, /git add -- data\/hair-trend-signals\.json src\/hairTrendData\.mjs/);
  assert.match(workflow, /gh pr create/);
  assert.match(workflow, /automation\/hair-trends/);
  assert.match(workflow, /github\.event\.repository\.default_branch/);
  assert.match(workflow, /contents: write/);
  assert.match(workflow, /pull-requests: write/);
  assert.match(workflow, /scripts\/checkHairTrendChanges\.mjs --staged --require-change/);
  assert.doesNotMatch(workflow, /imagen\.web|imageUrl|media_url|thumbnail|base64/);
});
