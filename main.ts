// Token launch radar: the program the grader runs.
//
// Reads the sealed snapshot (--input <file|dir>, default /input), ranks the
// pre-token protocols with the model in lib/model.ts, and writes into the
// output directory (--output, else $MAKEFUN_OUTPUT_DIR, else /output):
//
//   board.json    the ranked board in the gate's shape
//   data.js       the same board, dressed for the dashboard page
//   dashboard/    a copy of this repository's dashboard/
//   screenshots/  a copy of this repository's screenshots/
//   dossier.json  the judge's dossier, written last with the vendored library
//
// Standard library only, no network, and pure functions of the snapshot:
// two runs over the same snapshot write the same bytes.

import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { boardIssue, buildBoard, dataScript, parseSnapshot } from './lib/model.ts';
import { buildDossier } from './vendor/makefun-board.ts';

const repoRoot = fileURLToPath(new URL('.', import.meta.url));

/** The gate's caps, as RULES.txt states them; the dossier is rebuilt to these. */
const DOSSIER_TEXT_MAX = 65_536;
const SCREENSHOT_CAPS = { max: 4, max_bytes: 524_288 };
const DASHBOARD_CAPS = { max_files: 400, max_bytes: 4_194_304 };
const PLAIN_NAME = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/;

/** Read `--name value` or `--name=value` from the arguments, else the fallback. */
function argument(name: string, fallback: string): string {
  const args = process.argv.slice(2);
  const at = args.indexOf(`--${name}`);
  if (at >= 0 && at + 1 < args.length) return args[at + 1]!;
  const joined = args.find((a) => a.startsWith(`--${name}=`));
  return joined === undefined ? fallback : joined.slice(name.length + 3);
}

function fail(message: string): never {
  process.stderr.write(`token-radar: ${message}\n`);
  process.exit(1);
}

const inputArg = argument('input', '/input');
const snapshotFile = inputArg.endsWith('.json') ? inputArg : join(inputArg, 'snapshot.json');
if (!existsSync(snapshotFile)) {
  fail(`no snapshot at ${snapshotFile}: pass --input <snapshot.json|directory> or mount the sealed /input`);
}
const outDir = argument('output', process.env.MAKEFUN_OUTPUT_DIR ?? '/output');

const snapshot = parseSnapshot(readFileSync(snapshotFile, 'utf8'));
const { board, data } = buildBoard(snapshot);
const issue = boardIssue(board, snapshot);
if (issue !== null) fail(`the model wrote a board the gate refuses: ${issue}`);

mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'board.json'), `${JSON.stringify({ rows: board }, null, 1)}\n`);
writeFileSync(join(outDir, 'data.js'), dataScript(data));

/** Copy a directory tree of plain files, skipping any name that starts with a dot. Returns the file count. */
function copyTree(from: string, to: string): number {
  if (!existsSync(from)) return 0;
  mkdirSync(to, { recursive: true });
  let count = 0;
  for (const name of readdirSync(from).sort()) {
    if (name.startsWith('.')) continue;
    const source = join(from, name);
    const target = join(to, name);
    if (statSync(source).isDirectory()) count += copyTree(source, target);
    else if (statSync(source).isFile()) {
      copyFileSync(source, target);
      count += 1;
    }
  }
  return count;
}

const dashboardFiles = copyTree(join(repoRoot, 'dashboard'), join(outDir, 'dashboard'));
const shotNames = existsSync(join(repoRoot, 'screenshots'))
  ? readdirSync(join(repoRoot, 'screenshots')).filter((n) => !n.startsWith('.')).sort()
  : [];
const shotFiles = copyTree(join(repoRoot, 'screenshots'), join(outDir, 'screenshots'));
if (shotFiles < 3) fail(`screenshots/ holds ${shotFiles} image(s): hand in 3, the board, a detail view and a filtered view`);
for (const name of shotNames) {
  if (!PLAIN_NAME.test(name)) fail(`screenshots/${name}: a name is letters, digits and . _ -, 1 to 128 characters`);
}

// Written last: the scorer rebuilds the dossier from this same output and
// compares it byte for byte, so nothing may be written after it.
writeFileSync(
  join(outDir, 'dossier.json'),
  buildDossier(outDir, { text_max_bytes: DOSSIER_TEXT_MAX, screenshots: SCREENSHOT_CAPS, dashboard: DASHBOARD_CAPS }),
);

process.stdout.write(
  `token-radar: ${data.counts.protocols} protocols read, ${data.counts.live} already trading, ` +
    `${data.counts.products} products set aside, ${data.counts.ranked} ranked, watchlist ${data.counts.watchlist}/${data.counts.watchlist} covered\n` +
    `token-radar: wrote board.json (${board.length} rows), data.js, dashboard/ (${dashboardFiles} files), ` +
    `screenshots/ (${shotFiles} images) and dossier.json in ${outDir}\n`,
);
