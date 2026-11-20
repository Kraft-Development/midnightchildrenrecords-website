# Midnight Children Records website

Static Astro site for https://midnightchildrenrecords.com, hosted on Cloudflare Pages and deployed from `main`. Its design system (fonts, colours, buttons, forms, legal pages) is shared with timoodv.com; the label adds the red moon and the children silhouette from its logo.

## Content (the only files owners and the caretaker edit)

| File | What it holds |
|---|---|
| `src/content/label.json` | Label name, tagline, company details, socials, demo rules, and the `launched` switch |
| `src/content/artists.json` | One entry per roster artist (card + artist page) |
| `src/content/releases.json` | One entry per release (catalogue card + release page). Newest first is automatic |
| `src/content/about.md` | The About text. Plain paragraphs, no links or HTML |
| `src/content/legal.json` | Legal pages' "last updated" date and draft flag |

Images go in `public/img/artists/` and `public/img/releases/` and are referenced as `/img/...`.

`npm test` checks every content file (valid links per platform, real dates, known artists, no HTML, files exist) and runs on every pull request. While `launched` is `false`, every page is `noindex` and shows a preview banner; at launch, sample entries are rejected.

## Rules

- No secrets, tokens or private email addresses in this repository. They live in Cloudflare (Pages → Settings → Variables and Secrets) or GitHub Actions secrets.
- Changes go through small pull requests. Check the production deployment after every merge.
