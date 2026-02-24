# F1 Top 10 API proxy files

These files are required for production on Vercel because the frontend calls same-origin `/api/*` routes:

- `years.js` -> proxies `/years`
- `rounds.js` -> proxies `/rounds?year=...`
- `sessions.js` -> proxies `/sessions?year=...&round=...`
- `session_results.js` -> proxies `/session_results?year=...&round=...&session=...`

- `health.js` -> proxies `/health`
- `refresh_session_results.js` -> proxies `/refresh_session_results?year=...&round=...&session=...`

If these files are deleted, setup health checks and manual refresh actions can fail with a network error.
