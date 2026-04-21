# Oarena MVP Operations

Last updated: 2026-04-21

This document is the backend and website operations reference for the current Oarena MVP stack.

Current PM5 testing note:

- browser PM5 validation now happens through the core web app in `oarena_mvp/client`
- the browser client stages PM5 race setup from `race_state.countdown`
- the old `program_workout at T-15` race-start path has been removed from the server state machine
- `erg-talk` is vendored into this repo via `oarena_mvp/erg_talk_dist` and aliased as `erg-talk` in the Vite client

## Repositories

- Backend/web app repo: [https://github.com/ZarretKieran/oarena-mvp](https://github.com/ZarretKieran/oarena-mvp)
  - Local path: `/Users/zarretkieran/Desktop/Oarena_Prototype_2026/oarena_mvp`
  - Current branch at time of writing: `master`
  - Current repo commit at time of writing: `99eb43caec5469e979ca6fcf9123b0397b8da8c5`
- iOS app workspace:
  - Local path: `/Users/zarretkieran/Desktop/Oarena_Prototype_2026/oarena_ios`
- Animated marketing site workspace:
  - Local path: `/Users/zarretkieran/Desktop/Oarena_Prototype_2026/landing_page`
- Minimal marketing site workspace:
  - Local path: `/Users/zarretkieran/Desktop/Oarena_Prototype_2026/minimal_website`

## Railway Project

- Railway project: `reliable-creation`
- Environment: `production`
- Backend service: `oarena-mvp`
- Minimal website service: `minimal-website`

## Live URLs

- Backend base URL: [https://oarena-mvp-production.up.railway.app](https://oarena-mvp-production.up.railway.app)
- Backend health: [https://oarena-mvp-production.up.railway.app/api/health](https://oarena-mvp-production.up.railway.app/api/health)
- Backend websocket: `wss://oarena-mvp-production.up.railway.app/ws`
- Minimal marketing site: [https://minimal-website-production.up.railway.app](https://minimal-website-production.up.railway.app)

## Deployments

### Backend

- Deployment model: GitHub push to `ZarretKieran/oarena-mvp` triggers Railway deploy automatically.
- Railway service name: `oarena-mvp`
- Local repo root for deployment source: `/Users/zarretkieran/Desktop/Oarena_Prototype_2026/oarena_mvp`

Useful commands:

```bash
cd /Users/zarretkieran/Desktop/Oarena_Prototype_2026/oarena_mvp
git push origin master
railway status
curl -sf https://oarena-mvp-production.up.railway.app/api/health
```

PM5 web-client verification:

```bash
cd /Users/zarretkieran/Desktop/Oarena_Prototype_2026/oarena_mvp/client
npm install
npm run build
```

### Minimal website

- Deployment model: manual Railway deploy from the local `minimal_website` folder.
- Railway service name: `minimal-website`
- Important: deploy this folder with `--path-as-root` so Railway does not accidentally upload the workspace root.

Useful commands:

```bash
cd /Users/zarretkieran/Desktop/Oarena_Prototype_2026
railway up /Users/zarretkieran/Desktop/Oarena_Prototype_2026/minimal_website --path-as-root -c -s minimal-website
railway domain -s minimal-website
curl -sf https://minimal-website-production.up.railway.app
```

## Website Routing And Waitlist Flow

### Minimal website

- Source path: `/Users/zarretkieran/Desktop/Oarena_Prototype_2026/minimal_website`
- Frontend stack: Vite + React + TypeScript
- Production API target: `VITE_API_BASE_URL=https://oarena-mvp-production.up.railway.app`
- Waitlist submit target in production: `https://oarena-mvp-production.up.railway.app/api/waitlist`
- Waitlist `source` value sent by this site: `minimal_website`

### Animated landing page

- Source path: `/Users/zarretkieran/Desktop/Oarena_Prototype_2026/landing_page`
- Frontend stack: Vite + React + TypeScript + Motion
- Waitlist `source` value sent by this site: `landing_page`
- This site exists locally as a richer marketing variant and is not currently documented as a live Railway deployment.

## Backend Runtime

- Runtime: Bun
- Framework: Hono
- Default local port: `3001`
- Entry point: `/Users/zarretkieran/Desktop/Oarena_Prototype_2026/oarena_mvp/server/index.ts`
- Server package file: `/Users/zarretkieran/Desktop/Oarena_Prototype_2026/oarena_mvp/server/package.json`

Local commands:

```bash
cd /Users/zarretkieran/Desktop/Oarena_Prototype_2026/oarena_mvp/server
bun install
bun run dev
bun test ./tests
```

## PM5 Race Flow

Current countdown and PM5 behavior:

- race state still transitions `open -> warmup -> ready_check -> countdown -> racing -> finished|canceled`
- the server now broadcasts full PM5-relevant race config on every `race_state`
- the browser lobby and race screens derive PM5 setup directly from `race_state`
- browser PM5 control stages:
  - prepare workout once at countdown start
  - arm fixed distance/time race start at `T-15`
  - trigger race start at `T-0`
- if the browser reconnects during countdown, the websocket bootstrap path now includes current countdown and full config so PM5 staging can recover

Important implementation files:

- `/Users/zarretkieran/Desktop/Oarena_Prototype_2026/oarena_mvp/client/src/erg.ts`
- `/Users/zarretkieran/Desktop/Oarena_Prototype_2026/oarena_mvp/client/src/screens/lobby.ts`
- `/Users/zarretkieran/Desktop/Oarena_Prototype_2026/oarena_mvp/client/src/screens/race.ts`
- `/Users/zarretkieran/Desktop/Oarena_Prototype_2026/oarena_mvp/server/race/state-machine.ts`
- `/Users/zarretkieran/Desktop/Oarena_Prototype_2026/oarena_mvp/server/ws/handler.ts`

## Database

### Local

- Default DB path: `/Users/zarretkieran/Desktop/Oarena_Prototype_2026/oarena_mvp/oarena.db`
- DB path can be overridden with `DB_PATH`

### Production

- DB path env var: `DB_PATH=/data/oarena.db`
- Backing storage: Railway volume mounted at `/data`
- WAL files in production:
  - `/data/oarena.db`
  - `/data/oarena.db-shm`
  - `/data/oarena.db-wal`

## Waitlist Schema

Table: `waitlist_signups`

Columns:

- `id TEXT PRIMARY KEY`
- `name TEXT NOT NULL`
- `email TEXT NOT NULL UNIQUE`
- `source TEXT`
- `created_at INTEGER NOT NULL`

Behavior:

- emails are normalized to lowercase
- names are trimmed and collapsed for whitespace
- duplicate emails are idempotent because inserts use `INSERT OR IGNORE`
- successful and duplicate submissions both return `{ "ok": true }`

## Test Data Marker

Operational tables now support an `is_test INTEGER NOT NULL DEFAULT 0` marker for seeded mock data.

Tables with `is_test`:

- `users`
- `races`
- `race_participants`
- `user_stats`
- `personal_bests`
- `user_achievements`
- `daily_challenges`
- `wod_entries`

This marker exists specifically so production mock/demo data can be inserted, queried, and deleted safely later without relying on fragile username or ID patterns.

## Waitlist Integrations

### API

- Route: `POST /api/waitlist`
- Mounted from: `/Users/zarretkieran/Desktop/Oarena_Prototype_2026/oarena_mvp/server/routes/waitlist.ts`
- Request body:

```json
{
  "name": "Jane Rower",
  "email": "jane@example.com",
  "source": "minimal_website"
}
```

- Success response:

```json
{ "ok": true }
```

### Google Sheets mirror

- Implementation file: `/Users/zarretkieran/Desktop/Oarena_Prototype_2026/oarena_mvp/server/google-sheets.ts`
- Default spreadsheet ID: `1c5rRsicPo4VLYykHe9loW-Lpx1mPXMkFjoMlyxFD7D8`
- Default range: `Sheet1!A:E`

Sheet columns appended:

1. ISO timestamp
2. name
3. email
4. source
5. raw `created_at` epoch milliseconds

Required env vars:

- `GOOGLE_SHEETS_CLIENT_EMAIL`
- `GOOGLE_SHEETS_PRIVATE_KEY`
- optional `GOOGLE_SHEETS_SPREADSHEET_ID`
- optional `GOOGLE_SHEETS_RANGE`

## Waitlist Query Script

Script path:

- `/Users/zarretkieran/Desktop/Oarena_Prototype_2026/oarena_mvp/server/scripts/query-waitlist.ts`

Purpose:

- list current waitlist rows from SQLite
- works locally
- works inside the Railway backend container over SSH
- redacts emails by default

### Local usage

```bash
cd /Users/zarretkieran/Desktop/Oarena_Prototype_2026/oarena_mvp/server
bun ./scripts/query-waitlist.ts
bun ./scripts/query-waitlist.ts --limit 20 --json
bun ./scripts/query-waitlist.ts --limit 20 --raw-emails
```

### Production usage over Railway SSH

```bash
railway ssh -s oarena-mvp bun /app/server/scripts/query-waitlist.ts
railway ssh -s oarena-mvp bun /app/server/scripts/query-waitlist.ts --limit 50 --json
railway ssh -s oarena-mvp bun /app/server/scripts/query-waitlist.ts --limit 50 --raw-emails
```

## Production Test-Data Scripts

Seed a fully marked production test universe:

```bash
railway ssh -s oarena-mvp bun /app/server/scripts/seed-test-data.ts
```

Optional custom login username/password for the seeded self account:

```bash
railway ssh -s oarena-mvp bun /app/server/scripts/seed-test-data.ts --self-username test_zarret --password oarena-demo-password
```

Clear all mock data later:

```bash
railway ssh -s oarena-mvp bun /app/server/scripts/clear-test-data.ts
```

What the production test seed creates:

- 1 dedicated test self user
- 30 additional test users
- open, finished, and canceled test races
- test leaderboard and progression rows
- test PBs and achievements
- test WOD entries
- every inserted row marked with `is_test = 1`

Current seeded production demo login:

- username: `test_zarret`
- password: `oarena-demo-password`

Current seeded production counts at time of writing:

- `users`: 31
- `races`: 27
- `race_participants`: 109
- `user_stats`: 31
- `personal_bests`: 43
- `user_achievements`: 527
- `wod_entries`: 85

Notes:

- test WOD entries are marked with `is_test = 1`
- `daily_challenges` may remain real production rows for the same dates when they already exist, so the current seeded run may show `0` test-marked `daily_challenges` while still exposing fully test-marked WOD entries

## Environment Variables

Documented in:

- `/Users/zarretkieran/Desktop/Oarena_Prototype_2026/oarena_mvp/.env.example`

Current known vars:

- `JWT_SECRET`
- `DB_PATH`
- `GOOGLE_SHEETS_CLIENT_EMAIL`
- `GOOGLE_SHEETS_PRIVATE_KEY`
- `GOOGLE_SHEETS_SPREADSHEET_ID`
- `GOOGLE_SHEETS_RANGE`

## Operational Verification Commands

Backend:

```bash
curl -sf https://oarena-mvp-production.up.railway.app/api/health
```

Minimal site:

```bash
curl -sf https://minimal-website-production.up.railway.app
```

Waitlist production smoke test:

```bash
curl -sf -X POST https://oarena-mvp-production.up.railway.app/api/waitlist \
  -H 'Content-Type: application/json' \
  -d '{"name":"Smoke Test","email":"smoke-test@example.com","source":"minimal_website"}'
```

## Notes

- The backend service serves the core PM5 web app from `oarena_mvp/client/dist` when those assets are built and present.
- the browser app is the preferred short-loop PM5 validation surface for current CSAFE/race-start work
- The minimal marketing site is a separate Railway service and URL.
- The animated `landing_page` and minimal `minimal_website` are separate local workspaces with different positioning and presentation styles but the same waitlist backend.
