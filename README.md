# Midnight Children Records website

Static Astro site for https://midnightchildrenrecords.com, hosted on Cloudflare Pages and deployed from `main`.

- Content will live in `src/content/` (artists, releases, about, legal). The caretaker edits only those files, through pull requests.
- No secrets, tokens or private email addresses in this repository. They are set in Cloudflare (Pages → Settings → Variables and Secrets) or GitHub Actions secrets.
- `npm test` and `npm run build` run on every pull request.

Status: holding page while the full site is built.
