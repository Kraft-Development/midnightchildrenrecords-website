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
  mkdirSync(join(dir, 'public'), { recursive: true });
  cpSync(join(root, 'public/img'), join(dir, 'public/img'), { recursive: true });
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
expect('duplicate release slug', edit('releases.json', (r) => { r.push({ ...r[0], catalogue: 'MCR099' }); }), false, /used twice/);
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
expect('event with bad date', edit('events.json', (e) => { e[0].date = '2026-13-01'; }), false, /real date/);
expect('event with bad time', edit('events.json', (e) => { e[0].time = '25:00'; }), false, /24-hour/);
expect('event ticket link not https', edit('events.json', (e) => { e[0].url = 'http://howler.co.za/x'; }), false, /https link/);
expect('event line-up unknown artist', edit('events.json', (e) => { e[0].lineup = ['nobody']; }), false, /not in artists\.json/);
expect('event html in name', edit('events.json', (e) => { e[0].event = '<b>x</b>'; }), false, /contains < >/);
expect('duplicate event', edit('events.json', (e) => { e.push({ ...e[0] }); }), false, /duplicate/);
expect('release year only is allowed', edit('releases.json', (r) => { r[0].date = '2026'; }), true);
expect('gallery outside our domain', ({ write }) => write('gallery.json', [{ src: 'https://cdn.example/x.jpg', alt: '', url: '' }]), false, /ig-N/);
expect('company details required at launch', edit('label.json', (l) => { l.launched = true; }), false, /required before launch/);

if (failed) { console.error(`\n${failed} validator test(s) failed.`); process.exit(1); }
console.log('Validator tests passed.');
