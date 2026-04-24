# Millecube Ads Hub
**Meta Ads Report Automation — Millecube Digital**

---

## What This Does

A full-stack web app that:
- Manages multiple client Meta Ads accounts (each with their own Access Token)
- Pulls data from the Meta Graph API (Platform/Day + Age/Gender breakdowns)
- Generates professional Word (.docx) reports per client with 9 sections + Millecube branding
- Auto-schedules recurring monthly reports (runs on selected day of month at 08:00 MYT)
- Stores all reports in `/reports/[CLIENT_CODE]/` with standardised file naming

---

## Setup

### 1. Install dependencies
```bash
cd millecube-ads-hub
npm install          # root (installs concurrently)
npm run install:all  # installs backend + frontend deps
```

### 2. Copy brand assets (IMPORTANT)
The report generator and sidebar need Millecube logo assets. They are already embedded as base64 in:
```
frontend/src/assets/brandAssets.js
```
If you update logos, re-run:
```bash
python3 scripts/export-assets.py
```

### 3. Start development
```bash
npm run dev
```
This starts:
- Backend: http://localhost:3001
- Frontend: http://localhost:3000

---

## Project Structure

```
millecube-ads-hub/
├── backend/
│   ├── server.js           ← Express API (clients, reports, schedules, jobs)
│   ├── reportGenerator.js  ← Word .docx builder (9 sections, Millecube brand)
│   └── package.json
├── frontend/
│   ├── public/index.html
│   └── src/
│       ├── App.js                    ← Router + layout
│       ├── index.js / index.css      ← Entry + global Millecube dark theme
│       ├── assets/brandAssets.js     ← Logo + bg as base64
│       ├── components/Sidebar.js     ← Glassmorphism nav
│       ├── hooks/useToast.js         ← Notification system
│       ├── utils/api.js              ← Axios API wrapper
│       └── pages/
│           ├── Dashboard.js    ← Overview + live job feed
│           ├── Clients.js      ← Onboard + manage clients
│           ├── Generate.js     ← Manual report generation
│           ├── Schedules.js    ← Auto-schedule manager
│           └── History.js      ← All jobs + download
├── data/
│   ├── clients.json    ← Client records (persisted)
│   ├── schedules.json  ← Schedule records (persisted)
│   └── jobs.json       ← Job history (persisted)
├── reports/
│   └── [CLIENT_CODE]/  ← Report .docx files
│       └── VF-VikingFitness-Meta-Ads-Report-March2026.docx
└── package.json        ← Monorepo runner
```

---

## Onboarding a New Client

1. Go to **Clients** → **Onboard Client**
2. Fill in:
   - **Client Code** — short uppercase ID (e.g. `VF`, `PF`, `MJ`). Used as folder name and file prefix
   - **Client Name** — full name for the report cover
   - **Ad Account ID** — from Meta Business Manager (format: `act_123456789`)
   - **Access Token** — from Meta Graph API Explorer (needs `ads_read`, `read_insights`)
   - **Campaign Goal Patterns** — map campaign name keywords to goals (WhatsApp / Post Engagement / Reach / Leads)
3. Click **Verify Connection** after saving to confirm the token works

---

## How to Get a Meta Access Token

1. Go to [developers.facebook.com](https://developers.facebook.com) → Tools → Graph API Explorer
2. Select your Meta App
3. Click **Generate Access Token** and grant permissions:
   - `ads_read`
   - `ads_management`
   - `read_insights`
4. For production: use a **System User Token** from Business Manager (never expires)
   - Business Manager → Settings → Users → System Users → Generate Token

---

## Generating a Report

### Manual
1. Go to **Generate**
2. Select one or more clients
3. Choose period: by calendar month or custom date range
4. Click **Generate Report**
5. Track progress in **History** — download when Done

### Auto Schedule
1. Go to **Schedules** → **New Schedule**
2. Select client + day of month
3. Each month on that day at 08:00 MYT, the system will automatically:
   - Call the Meta API for the previous full month
   - Generate the Word report
   - Save to `/reports/[CLIENT_CODE]/`

---

## Report Structure (9 Sections)

| # | Section | Contents |
|---|---|---|
| 01 | Executive Summary | 4 KPI boxes + narrative |
| 02 | Overall Account Performance | Totals table |
| 03 | Campaign Performance | Per-campaign table + best performer callout |
| 04 | Daily Performance Trends | Spend + conversions by day summary |
| 05 | Platform Analysis | Facebook vs Instagram comparison |
| 06 | Audience Analysis | Age breakdown + Gender breakdown |
| 07 | Video Performance | Completion funnel (if video data present) |
| 08 | Analysis & Insights | 4–6 data-driven insight cards |
| 09 | Recommendations | 4–6 action items (What / Why / Impact) |

---

## Output File Naming

```
[CLIENT_CODE]-[ClientName]-Meta-Ads-Report-[Period].docx
```

Examples:
```
VF-VikingFitness-Meta-Ads-Report-March2026.docx
PF-PetiteFleur-Meta-Ads-Report-April2026.docx
MJ-MasterJessie-Meta-Ads-Report-March2026.docx
```

---

## API Endpoints

| Method | Path | Description |
|---|---|---|
| GET | /api/clients | List all clients |
| POST | /api/clients | Add new client |
| PUT | /api/clients/:id | Update client |
| DELETE | /api/clients/:id | Remove client |
| POST | /api/clients/:id/verify | Verify Meta API connection |
| POST | /api/reports/generate | Trigger report generation |
| GET | /api/schedules | List schedules |
| POST | /api/schedules | Create schedule |
| PUT | /api/schedules/:id | Update schedule |
| DELETE | /api/schedules/:id | Remove schedule |
| GET | /api/jobs | Job history |

---

## Brand

**Millecube Digital** — Built by Business Owners. Driven by ROI.  
Colors: `#07503c` (dark green) · `#32cd32` (green) · `#6bc71f` (light green)  
Fonts: Montserrat (UI) · Codec Cold Trial (headlines in reports)
