# HCM Lite — AI-assisted Human Capital Management

Saylani Hackathon (24 Oct 2026). Web app with three roles (Admin, HR, Employee), 9 modules, AI assistant.
The system starts **empty**: no seed or dummy data. Everything shown comes from what people do in the app.

**Stack:** Node.js + Express + MongoDB (Mongoose) + JWT/bcrypt + pdfkit · React (Vite) + Recharts · Groq LLM (OpenAI-compatible tool calling).

## Run locally (Windows PowerShell / any OS)
```powershell
npm run install:all
copy server\.env.example server\.env      # then edit server\.env (MONGO_URI, JWT_SECRET, AI_API_KEY)
npm --prefix server run dev               # API on http://localhost:5000
npm --prefix client run dev               # UI on  http://localhost:5173 (proxies /api to :5000)
```
Needs MongoDB running locally or a MongoDB Atlas URI in `MONGO_URI`.

## Create the first Admin
Open the app on a fresh database: the **first-run setup** screen asks for the company name and Admin account.
Alternative: set `ADMIN_EMAIL`, `ADMIN_PASSWORD` (and `COMPANY_NAME`) in `server/.env`; the Admin is created at startup.
Then: Admin creates departments, designations, holidays, leave types (defaults annual 14 / sick 8 / casual 10 / unpaid) and an HR login → HR registers employees (a temporary password is shown once; the employee must change it on first sign-in).

## AI key
Put the key only in the backend env: `AI_API_KEY` (free key from console.groq.com). Optional `AI_BASE_URL`, `AI_MODEL`.
The browser never calls the AI provider. Without a key the app works normally and the AI panel shows a friendly message.

## Deploy (single service, e.g. Render)
- Build: `npm run install:all && npm run build`   · Start: `npm start`
- Env: `MONGO_URI` (Atlas), `JWT_SECRET`, `AI_API_KEY`, `TZ_NAME=Asia/Karachi`. The API also serves the built React app, so one URL is enough.
- Commit only `.env.example`, never real secrets.

## Structure
```
server/src
  routes/      thin HTTP layer + role guards (auth, org, employees, attendance, leave, payroll, dashboard, ai, comms)
  services/    business rules: context (day status), leave (balance/overlap), payroll, analytics (all KPIs), ai (tools)
  utils.js     pure rules (late/half-day, working days, tax slab, haversine, CSV) — unit tested
  models.js · middleware.js (JWT + role guard + mustChangePassword) · app.js · index.js
client/src     React app: pages per module, role-based menu, generic Form/Table helpers
```
Tests: `npm test` (rules: grace/late, working days, tax slabs, Haversine, CSV).

## Rules implemented (from the brief)
Roles/scope checked **on the server** for every request · one attendance record per day (409 on second check-in), server-stamped time ·
late after 09:15, half day under 5 h, missing checkout, absent derived · leave counts working days only, overlap/over-balance = 422 ·
payroll gross 1.5×basic, per-day deductions (absent, unpaid, 0.5 half day), prorated joiners/leavers, tax slab, Admin finalize locks the run ·
append-only audit log (actor, action, entity, before/after) · notifications · announcements.

AI: tools `get_headcount, get_attendance_summary, get_late_comers, get_leave_summary, get_my_leave_balance, get_payroll_summary, search_employees`
reuse the same analytics services as the dashboards and are **filtered by role** (an Employee has no access to colleague data or salaries).
Dashboard summary, smart leave (validated JSON, one retry, then normal form; user confirms), policy Q&A from the rules, 15 s timeout,
20 requests/user/hour, every call logged in `ailogs`, "AI-generated" label, understands Roman Urdu.

## Done / not done
**Done:** all 25 checklist functionalities on the web, 3 dashboards with filters, AI features, dark mode (follows system theme).
**Server-side only (no UI yet):** camera check-in rules — `POST /api/attendance/check-in` with `source:"camera"`, `faceCount`, `lat`, `lng`, `accuracy` enforces one face, ≤100 m GPS accuracy and the office radius (Haversine).
**Not done:** mobile app, in-browser face detection UI, face matching/liveness, attrition risk score, anomaly flags, late-penalty rule, PWA.
Dashboard numbers use MongoDB aggregation for headcount/gender; attendance metrics are derived per day in the service layer.
