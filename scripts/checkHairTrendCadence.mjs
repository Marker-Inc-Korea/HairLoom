import { appendFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

export const BIWEEKLY_TREND_ANCHOR = '2026-08-03';
export const BIWEEKLY_TREND_INTERVAL_DAYS = 14;

function utcDay(value) {
  const text = String(value ?? '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) throw new TypeError(`Trend cadence date must use YYYY-MM-DD: ${text}`);
  const date = new Date(`${text}T00:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== text) throw new TypeError(`Invalid trend cadence date: ${text}`);
  return date;
}

export function isBiweeklyTrendDue(date, anchor = BIWEEKLY_TREND_ANCHOR) {
  const current = utcDay(date);
  const start = utcDay(anchor);
  const differenceDays = Math.round((current - start) / 86_400_000);
  return differenceDays >= 0 && differenceDays % BIWEEKLY_TREND_INTERVAL_DAYS === 0;
}

function optionValue(argv, name) {
  const prefix = `--${name}=`;
  return argv.find((value) => value.startsWith(prefix))?.slice(prefix.length) ?? '';
}

export async function main(argv = process.argv.slice(2)) {
  const date = optionValue(argv, 'date') || new Date().toISOString().slice(0, 10);
  const anchor = optionValue(argv, 'anchor') || BIWEEKLY_TREND_ANCHOR;
  const forced = argv.includes('--force');
  const scheduled = isBiweeklyTrendDue(date, anchor);
  const due = forced || scheduled;
  const outputPath = optionValue(argv, 'github-output') || process.env.GITHUB_OUTPUT || '';
  if (outputPath) await appendFile(outputPath, `due=${due}\ndate=${date}\nanchor=${anchor}\n`);
  const result = { due, forced, date, anchor, intervalDays: BIWEEKLY_TREND_INTERVAL_DAYS };
  console.log(JSON.stringify(result));
  return result;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
