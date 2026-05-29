# Millecube Ads Hub — Claude Code Context

## What this project is
Internal Meta Ads management hub for Millecube Digital agency (Malaysian digital marketing agency).
Owner: Zack (hello@millecube.com). Manages multiple client Meta Ads accounts.
Core features: generate Word reports, monitor live ad performance, track budgets, team collaboration.

---

## Stack
| Layer | Tech | URL |
|-------|------|-----|
| Frontend | React (no TypeScript) | millecube-ads-hub.vercel.app |
| Backend | Express + Node.js | millecube-ads-hub.onrender.com |
| Database | MongoDB Atlas | via MONGODB_URI env var on Render |
| Auth | JWT (7d expiry), roles: admin / member | — |
| Email | Resend API | RESEND_API_KEY on Render |
| Storage | Google Drive (personal Gmail OAuth) | GOOGLE_* env vars on Render |
| Code | GitHub | github.com/millecube/millecube-ads-hub |
| Deploy | Push to main → auto-deploy | Vercel (frontend) + Render (backend) |

## Local dev note
**No .env on this machine. Never test locally. Push to GitHub → test on live URLs.**

---

## Brand
- Colors: `#07503c` dark green, `#32cd32` green, `#6bc71f` light green
- Style: Glassmorphism dark theme (also has light mode toggle)
- Font: Montserrat
- CSS variables: `var(--bg)`, `var(--card-bg)`, `var(--text-primary)`, `var(--text-muted)`, `var(--border)`

---

## All Pages (current)

| Route | Page | Access |
|-------|------|--------|
| `/login` | Login | Public |
| `/reset-password?token=xxx` | Reset Password | Public |
| `/` | Dashboard | Protected |
| `/monitor` | Analytic (Ads Monitor) | Protected |
| `/performance` | Performance Table | Protected |
| `/budget` | Budget Manager | Protected |
| `/clients` | Client Management | Protected |
| `/generate` | Manual Report Generation | Protected |
| `/schedules` | Auto Schedule Manager | Protected |
| `/history` | Job History + Downloads | Protected |
| `/settings` | Profile, Team Members, Client Assignment | Protected |

---

## Clients (live, on MongoDB)
- **MJT** — Master Jessie Tan
- **VK** — Viking Fitness (branches: KL=Kuchai Lama, RC=Razak City, CR=Cheras)
- **MAR** — Marssenger
- More clients exist — managed in `/clients` page by admin

Each client has: `id`, `name`, `clientCode`, `adAccountId`, `accessToken`, `assignedUsers[]`, `campaignGoals[]`, `budgetEditors[]`

---

## Authentication
- Login: POST `/api/auth/login` (public)
- Forgot password: POST `/api/auth/forgot-password` (public) → sends reset email via Resend
- Reset password: POST `/api/auth/reset-password` (public) → validates token from `passwordResets` MongoDB collection (1hr expiry)
- Default admin: username `admin`, password `Admin@millecube` (created on first boot if no users exist)
- New user creation → welcome email auto-sent (fire-and-forget) to new user's email with login credentials
- JWT stored in localStorage as `token`

### Email limitation (important)
Resend domain NOT verified yet. All auth emails route to `hello@millecube.com` (admin inbox) regardless of recipient, because Resend test mode only allows sending to the verified account email. When domain is verified: remove the `effectiveTo` override in `sendAuthEmail()` in server.js.

---

## Key Files

### Backend
- `backend/server.js` — entire backend (Express routes, Meta API calls, email, Google Drive, cron jobs, MongoDB helpers)
- `backend/reportGenerator.js` — Word document generation

### Frontend
- `frontend/src/App.js` — routing
- `frontend/src/components/Sidebar.js` — nav (Dashboard, Analytic, Performance, Clients, Generate, Schedules, Budget, History, Settings)
- `frontend/src/utils/api.js` — all API calls (axios instance with JWT interceptor)
- `frontend/src/pages/AdsMonitor.js` — Analytic page (large, complex)
- `frontend/src/pages/PerformanceTable.js` — Performance Table page
- `frontend/src/pages/BudgetManager.js` — Budget page
- `frontend/src/context/AuthContext.js` — user auth state
- `frontend/src/context/ThemeContext.js` — dark/light theme
- `frontend/src/context/SidebarContext.js` — sidebar collapse state

---

## API Endpoints (backend)

### Auth (public — before authMiddleware)
- `POST /api/auth/login`
- `POST /api/auth/forgot-password` — email → passwordResets collection → Resend email
- `POST /api/auth/reset-password` — token + new password

### Auth (protected)
- `GET /api/auth/me`
- `PUT /api/auth/profile`
- `PUT /api/auth/password`
- `GET /api/auth/users` (admin only)
- `POST /api/auth/users` (admin only) → creates user + sends welcome email
- `DELETE /api/auth/users/:id` (admin only)

### Clients
- `GET /api/clients` — all (admin) or assigned (member)
- `GET /api/clients/assigned` — member's assigned clients
- `POST /api/clients`
- `PUT /api/clients/:id`
- `DELETE /api/clients/:id`
- `POST /api/clients/:id/verify` — test Meta API token
- `PUT /api/clients/:id/assign` — assign users to client
- `PUT /api/clients/:id/budget-editors` — set budget editors

### Reports
- `POST /api/reports/generate` — generates Word doc, uploads to Drive, sends email

### Monitor (Analytic page)
- `GET /api/monitor/overview` — all clients summary cards
- `GET /api/monitor/:id` — full detail for one client (campaigns, daily trends, prev period)
- `GET /api/monitor/:id/audience` — audience breakdowns
- `POST /api/monitor/:id/diagnose` — AI diagnosis (Anthropic API)
- `GET /api/monitor/:id/actions` — action board threads
- `POST /api/monitor/:id/actions` — create action/thread
- `PUT /api/monitor/actions/:actionId` — update action
- `POST /api/monitor/actions/:actionId/replies` — add reply with file attachments (base64)

### Performance Table
- `GET /api/performance/table` — campaign→adset→ad hierarchy for selected client(s), cached 30min
- `POST /api/performance/toggle` — toggle ACTIVE/PAUSED on any object via Meta API (requires ads_management permission on token)

### Budget
- `GET /api/budget` — all clients budget overview (5-month window)
- `GET /api/budget/:clientId` — single client budget history
- `POST /api/budget/:clientId/:month` — upsert budget entry
- `POST /api/budget/:clientId/:month/confirm` — mark confirmed
- `POST /api/budget/:clientId/:month/unconfirm`

### Jobs / Schedules
- `GET /api/jobs`
- `DELETE /api/jobs/:id`
- `GET /api/schedules`
- `POST /api/schedules`
- `PUT /api/schedules/:id`
- `DELETE /api/schedules/:id`

### Other
- `GET /api/health` — public, used by UptimeRobot

---

## MongoDB Collections
- `users` — auth users
- `clients` — client accounts with Meta credentials
- `jobs` — report generation history (max 200 kept)
- `schedules` — auto-schedule configs
- `monitorCache` — 30-min TTL cache for Meta API responses (key: `clientId + rangeKey`)
- `actions` — action board threads with embedded `replies[]` array (base64 file attachments)
- `budgets` — budget entries per client per month
- `passwordResets` — forgot password tokens (1hr expiry, `{ token, userId, email, expiresAt }`)

---

## Analytic Page (`/monitor`) — Key Features
- Date ranges: Today / Yesterday / 7D / 14D / 30D / This Month / Last Month / Custom
- Per-client cards with health score
- Line chart with prev period comparison toggle (dashed lines)
- Metric cards: Spend, Avg Daily Spend, Cost/Message, Frequency, Conversations, Reach, Impressions, CPM, Clicks, CTR, CPC, Active Campaigns
- Post engagement horizontal bar chart
- Video retention funnel
- Audience section: 5 charts (Gender donut, Age bar, Platform bar, Device bar, Region horizontal bar) — 3 in row 1, 2 in row 2
- Audience combo chart (ComposedChart): X-axis = breakdown dimension, bar/line toggle per metric, max 3 metrics
- Audience metric cards: Impressions / Reach / Spend / Clicks
- Action board: threaded chat (list → thread → reply with file attachments)
- AI diagnosis: manual trigger, plain English output from Anthropic API
- Cache key: `detail2_prev3_{rangeKey}` for current period (includes prevDaily for comparison)

---

## Performance Table (`/performance`) — Key Features
- Single client selector (defaults to first assigned client)
- Date ranges: Today / Yesterday / 7D / 14D / 30D / This Month / Last Month / Custom
- Summary strip: Total Spend, Impressions, Reach, Link Clicks, Convos Started
- Hierarchical table: Campaign → Ad Set → Ad (all collapsed by default)
- **Frozen Name column** (sticky left) + horizontally scrollable metric columns
- **Drag-to-reorder** columns (HTML5 drag API) — order saved to `localStorage` key `perf_col_order`
- **Resize columns** (drag right edge of header) — widths saved to `localStorage` key `perf_col_widths`
- **On/Off toggle** per row — calls Meta API to ACTIVE/PAUSED. Campaign toggle requires confirm dialog. Optimistic UI with rollback.
- **Inactive grouping**: paused/inactive items collapsed under "⏸ Paused / Inactive (N)" row
- **ⓘ Info popup**: campaign shows objective; adset shows optimization_goal, billing_event, budget, age, gender, locations, interests
- **Hierarchical sort**: each level sorts independently within its parent
- Color coding: CPM (green <RM8 / yellow RM8–15 / red >RM15), CTR Link (green >2% / yellow 1–2% / red <1%)
- Flag icons: 🔴 spending with zero results, 🟡 frequency >3
- **Results column**: shows correct metric based on campaign objective (LEAD → leads, ENGAGEMENT → post_engagement, default → messaging replies)
- Budget: Meta API returns in minor units (sen) — divided by 100 in `parseBudget()`

### Columns (19 metric columns)
On/Off, Status, Budget, Spend, Impressions, Reach, Freq, CPM, Link Clicks, CTR (Link), CPC (Link), Clicks (All), CTR (All), CPC (All), Cost/Msg, Convos Started, Replied Msgs, New Contacts, Return Contacts, Results, Cost/Result

---

## Meta API Notes
- Graph API v19.0
- All insights fetched from `/{adAccountId}/insights`
- Structure (status/budget) fetched from `/{adAccountId}/campaigns`, `/adsets`, `/ads`
- Budget returned in **minor currency units** (sen for MYR) — divide by 100 for RM
- Toggle on/off requires `ads_management` permission on access token (not just `ads_read`)
- Key action types:
  - `onsite_conversion.messaging_conversation_started_7d` — convos started
  - `onsite_conversion.messaging_first_reply` — replied messages (used as "waConvos")
  - `onsite_conversion.messaging_new_connections` — new contacts
  - `onsite_conversion.messaging_returning_connections` — returning contacts
  - `lead` — lead gen results
  - `post_engagement` — engagement objective results
  - `inline_link_clicks` — link clicks (top-level field, not in actions array)

---

## Email (Resend)
- `sendReportEmail()` — report done/failed notification
- `sendAuthEmail(type, to, data)` — types: `'welcome'` (new user) | `'reset'` (forgot password)
- From: `process.env.EMAIL_FROM` || `Millecube Ads Hub <onboarding@resend.dev>`
- To (auth emails): currently hardcoded to `process.env.EMAIL_TO || 'hello@millecube.com'` (until domain verified)
- Domain to verify on Resend: `millecube.com` (DNS managed by VPS Malaysia — add records in cPanel Zone Editor)

---

## Cron Jobs (server-side)
- Auto-schedule reports: runs per schedule config in MongoDB
- Budget reminder: weekly email if any client budget unconfirmed

---

## Key Decisions
- AI diagnosis: manual trigger only (cost control)
- No Supabase — using existing MongoDB
- Google OAuth: personal Gmail as bridge account for Drive uploads
- No client portal (future roadmap)
- Escalation: email to Zack via Resend
- Branch access: staff sees all VK branches when assigned to Viking
- Budget in minor units: Meta API returns cents/sen — always divide by 100
- Toggle ads: requires `ads_management` token permission (not just `ads_read`)
- Forgot password emails: route to admin inbox until Resend domain verified

---

## Roadmap (not yet built)
- **Phase 3** — Rule Engine: per-client thresholds, objective types (whatsapp/lead/shopee/engagement), feeds health score
- **Phase 4** — Action escalation emails via Resend when team marks "escalate"
- **Phase 6** — Google Sheets Sync: add Sheets API scope to existing Google OAuth
- **Client portal** — read-only client login view (future)
