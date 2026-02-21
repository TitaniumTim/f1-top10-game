# F1 Top 10 API proxy files

These files are required for production on Vercel because the frontend calls same-origin `/api/*` routes:

- `years.js` -> proxies `/years`
- `rounds.js` -> proxies `/rounds?year=...`
- `sessions.js` -> proxies `/sessions?year=...&round=...`
- `session_results.js` -> proxies `/session_results?year=...&round=...&session=...`

If these files are deleted, the frontend session picker will fail with a network error.
