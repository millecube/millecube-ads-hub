# Millecube Ads Hub — Claude Code Context

## What this project is
Internal Meta Ads report hub for Millecube Digital agency.
Manages 11 client Meta Ads accounts, generates Word reports, tracks performance.

## Stack
- Frontend: React → deployed on Vercel (millecube-ads-hub.vercel.app)
- Backend: Express + Node.js → deployed on Render (millecube-ads-hub.onrender.com)
- Database: MongoDB Atlas (via MONGODB_URI on Render)
- Auth: JWT, roles: admin / member
- Email: Resend
- Storage: Google Drive (personal Gmail OAuth)
- Code: GitHub → github.com/millecube/millecube-ads-hub
- Deploy: push to main → Vercel + Render auto-deploy

## Local dev note
No .env on this machine. Don't test locally.
Push to GitHub → test on live URLs.

## Current pages
- /login — public
- / — Dashboard
- /clients — Client management
- /generate — Manual report generation
- /schedules — Auto schedule manager
- /history — Job history + downloads
- /settings — Profile, team members, client assignment

## Phase 1 — COMPLETED
Client assignment to staff. Members only see assigned clients.
Commit: c6cab9e

## Next: Phase 2 — Ads Monitor Dashboard
New page /monitor — live Meta Ads data for all assigned clients.
Key features:
- All client cards with health score (green/yellow/red)
- Per-client metric vs threshold comparison
- Branch tracking for Viking Fitness (KL, RC, CR)
- Treemap spend distribution
- Drill-down table (campaign → adset → ad level)
- Manual AI diagnosis trigger (Anthropic API)
- Action board (team marks done/escalate)

## Phase 3 — Rule Engine
Per-client thresholds. Objective types: whatsapp, lead, shopee, engagement.
Feeds health score into Phase 2.

## Phase 4 — Action Board
Team actions, escalation to Zack via email (Resend).

## Phase 5 — AI Diagnosis
Manual trigger only. Anthropic API. Plain language output.

## Phase 6 — Google Sheets Sync
Add Sheets API scope to existing Google OAuth (personal Gmail).
Client strategy sheets stored in Millecube company Drive, shared to personal Gmail.

## Clients (live, on MongoDB)
- MJT — Master Jessie Tan
- VK — Viking Fitness (branches: KL=Kuchai Lama, RC=Razak City, CR=Cheras)
- MAR — Marssenger

## Key decisions made
- AI diagnosis: manual trigger only (cost control)
- Daily 9AM email digest: data only, no AI
- Supabase: decided against, using existing MongoDB
- Google OAuth: personal Gmail as bridge account
- No client login view yet (Phase 2 of future roadmap)
- Escalation: email to Zack via Resend
- Branch access: staff sees all branches when assigned to Viking

## Brand
Millecube Digital — #07503c dark green, #32cd32 green, #6bc71f light green
Glassmorphism dark theme. Montserrat font.
