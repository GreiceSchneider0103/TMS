import fs from 'node:fs';
import path from 'node:path';

/**
 * Minimal local .env loader for running workers outside Render (e.g. from
 * Windows Task Scheduler). Reads workers/.env, if present, and fills in any
 * process.env keys that aren't already set. Real values never appear in a
 * Task Scheduler command line or its logs this way -- they live only in
 * this gitignored file.
 *
 * Deliberately dependency-free (no dotenv package) to avoid an extra
 * install; the format supported is intentionally simple: KEY=value lines,
 * optional quotes, # comments, blank lines ignored.
 */
const envPath = path.resolve(process.cwd(), '.env');

if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, 'utf8');
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const eq = line.indexOf('=');
    if (eq === -1) continue;

    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (key && !(key in process.env)) {
      process.env[key] = value;
    }
  }
}
