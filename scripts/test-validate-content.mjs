// Feeds deliberately broken content to the validator and checks each problem is caught.
import { mkdtempSync, mkdirSync, cpSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const script = join(root, 'scripts/validate-content.mjs');
let failed = 0;

function run(mutate) {
  const dir = mkdtempSync(join(tmpdir(), 'mcr-'));
  mkdirSync(join(dir, 'src'), { recursive: true });
  cpSync(join(root, 'src/content'), join(dir, 'src/content'), { recursive: true });
  mkdirSync(join(dir, 'public/img'), { recursive: true });
  const read = (f) => JSON.parse(readFileSync(join(dir, 'src/content', f), 'utf8'));
  const write = (f, v) => writeFileSync(join(dir, 'src/content', f), typeof v === 'string' ? v : JSON.stringify(v));
  mutate?.({ read, write });
  return spawnSync(process.execPath, [script], { env: { ...process.env, CONTENT_ROOT: dir }, encoding: 'utf8' });
}
function expect(name, mutate, ok, pattern) {
  const r = run(mutate);
  const out = r.stdout + r.stderr;
  const pass = (r.status === 0) === ok && (!pattern || pattern.test(out));
  if (!pass) { failed++; console.error(`FAIL ${name}\n${out}`); } else console.log(`ok   ${name}`);
}
const edit = (file, fn) => ({ read, write }) => { const v = read(file); fn(v); write(file, v); };

expect('current content passes', null, true);
expect('unknown artist on a release', edit('releases.json', (r) => { r[0].artists = ['nobody']; }), false, /not in artists\.json/);
expect('duplicate release slug', edit('releases.json', (r) => { r[1].slug = r[0].slug; }), false, /used twice/);
expect('bad date', edit('releases.json', (r) => { r[0].date = '2026-02-30'; }), false, /real date/);
expect('html in a title', edit('releases.json', (r) => { r[0].title = '<script>x</script>'; }), false, /HTML/);
expect('half-cut emoji', edit('artists.json', (a) => { a[0].short = 'Hello \uD83D'; }), false, /invalid characters/);
expect('wrong host for spotify link', edit('releases.json', (r) => { r[0].links.spotify = 'https://evil.example/x'; }), false, /open\.spotify\.com/);
expect('http link', edit('artists.json', (a) => { a[0].links.instagram = 'http://instagram.com/x'; }), false, /https/);
expect('lookalike host', edit('artists.json', (a) => { a[0].links.instagram = 'https://instagram.com.evil.example/x'; }), false, /instagram/);
expect('missing cover file', edit('releases.json', (r) => { r[0].cover = '/img/releases/none.jpg'; }), false, /does not exist/);
expect('bad release type', edit('releases.json', (r) => { r[0].type = 'Mixtape'; }), false, /must be one of/);
expect('link in about.md', ({ write }) => write('about.md', 'See [here](https://x.example)'), false, /links/);
expect('invalid JSON', ({ write }) => write('artists.json', '[{'), false, /not valid JSON/);
expect('samples blocked at launch', edit('label.json', (l) => { l.launched = true; l.company = { legalName: 'X', registrationNumber: '1', registeredAddress: '', informationOfficer: 'Y' }; }), false, /removed before launch/);

if (failed) { console.error(`\n${failed} validator test(s) failed.`); process.exit(1); }
console.log('Validator tests passed.');
