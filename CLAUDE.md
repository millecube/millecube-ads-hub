# millecube-ads-hub

Millecube Digital's internal tool to automate monthly Meta Ads performance reports for clients. Pulls from Meta Graph API and generates branded Word (.docx) reports.

## How to run

```bash
npm run dev   # starts backend (port 3001) + frontend (port 3000) concurrently
```

## Stack

- **Backend:** Node.js/Express — `backend/server.js`, `backend/reportGenerator.js`
- **Frontend:** React (CRA) — `frontend/src/`
- **Data:** JSON flat files — `data/clients.json`, `data/schedules.json`, `data/jobs.json`, `data/users.json`
- **Reports output:** `reports/[CLIENT_CODE]/`

## Key files

- `backend/server.js` — Express API (clients, reports, schedules, jobs endpoints)
- `backend/reportGenerator.js` — Word .docx builder (9 sections, Millecube brand)
- `frontend/src/pages/` — Dashboard, Clients, Generate, Schedules, History, Settings, Login
- `frontend/src/components/Sidebar.js` — main nav component
- `frontend/src/assets/` — brand assets (logos as base64)
- `SKILL-meta-ads-report.md` — full report generation spec (goals, charts, Word rules)

## Brand colours

| Role | Hex |
|---|---|
| Dark green (headers) | `#07503c` |
| Green accent | `#32cd32` |
| Light green | `#6bc71f` |

Always apply these colours for UI or report changes.

## Context

- Owner: Zack Kho, founder of Millecube Digital (hello@millecube.com), Malaysia
- Currency: Malaysian Ringgit (RM)
- Meta Ads agency — Malaysia benchmarks apply
- When editing `reportGenerator.js`, follow the docx-js rules in `SKILL-meta-ads-report.md`
