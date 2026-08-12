import { appendFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const ALLOWED_TREND_CHANGE_PATHS = Object.freeze([
  'data/hair-trend-signals.json',
  'src/hairTrendData.mjs'
]);

const allowedPaths = new Set(ALLOWED_TREND_CHANGE_PATHS);

export function validateTrendChangePaths(paths, { requireChange = false } = {}) {
  const uniquePaths = [...new Set(paths.map((value) => String(value).trim()).filter(Boolean))].sort();
  const unexpected = uniquePaths.filter((value) => !allowedPaths.has(value));
  if (unexpected.length) throw new TypeError(`Unexpected trend refresh paths: ${unexpected.join(', ')}`);
  if (requireChange && !uniquePaths.length) throw new TypeError('Trend refresh did not stage a data change');
  return { changed: uniquePaths.length > 0, paths: uniquePaths };
}

function gitPaths(args, cwd = process.cwd()) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr.trim() || `git ${args.join(' ')} failed`);
  return result.stdout.split('\0').filter(Boolean);
}

export function collectTrendChangePaths({ cwd = process.cwd(), staged = false } = {}) {
  const tracked = gitPaths(['diff', ...(staged ? ['--cached'] : []), '--name-only', '-z', '--'], cwd);
  const untracked = staged ? [] : gitPaths(['ls-files', '--others', '--exclude-standard', '-z'], cwd);
  return [...tracked, ...untracked];
}

function optionValue(argv, name) {
  const prefix = `--${name}=`;
  return argv.find((value) => value.startsWith(prefix))?.slice(prefix.length) ?? '';
}

export async function main(argv = process.argv.slice(2)) {
  const staged = argv.includes('--staged');
  const requireChange = argv.includes('--require-change');
  const result = validateTrendChangePaths(collectTrendChangePaths({ staged }), { requireChange });
  const outputPath = optionValue(argv, 'github-output') || process.env.GITHUB_OUTPUT || '';
  if (outputPath) await appendFile(outputPath, `changed=${result.changed}\n`);
  console.log(JSON.stringify({ ...result, staged }));
  return result;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
