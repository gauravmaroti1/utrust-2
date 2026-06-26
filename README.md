# U TRUST 2.0 — Pre-Owned Vehicle Dealership Management Platform

A multi-location used-car operations platform for **Prakash Auto Hub** (used-car division of Prakash Janki Motors), covering stock, valuation, purchase approvals, sales quotations, refurbishment, productivity and analytics across the Purnea, Bhagalpur and Forbesganj branches.

Built as a single-service monorepo: an Express + PostgreSQL API that also serves the compiled React frontend. One Railway service + one Postgres plugin is all it needs.

---

## Modules

1. **Stock Management** — vehicle register with ageing, KPIs, branch/status breakdown, Excel import & export.
2. **Daily Productivity Tracker** — per-user activity logging and a scored leaderboard.
3. **Standardized Valuation Engine** — uniform purchase price + retail band from inspection inputs, fully admin-configurable.
4. **Purchase Proposal Workflow** — Evaluator → Branch Manager → Super Admin approval chain with margin/ROI.
5. **Sales Quotation Generator** — branded PDF + WhatsApp share text.
6. **Refurbishment Cost Tracking** — per-vehicle cost lines rolling into final cost & profit/ROI.
7. **Analytics Dashboard** — ageing distribution, make mix, sales, trade-in/out trend, evaluator performance.

## Roles

| Role | Scope |
|------|-------|
| `SUPER_ADMIN` | Everything across all branches; user management; valuation config; final proposal approval |
| `BRANCH_MANAGER` | Own branch; team productivity; manager-level proposal approval; quotations |
| `EVALUATOR` | Own branch; evaluations, proposals, stock entry, productivity |
| `SALES_EXECUTIVE` | Own branch; quotations and stock view |

---

## Tech Stack

- **Frontend:** React 18 + TypeScript + Vite + Tailwind CSS + Recharts
- **Backend:** Node.js + Express + TypeScript (run directly via `tsx`, no compile step)
- **Database:** PostgreSQL
- **Auth:** JWT (12h) with bcrypt password hashing
- **Deploy:** Railway (Nixpacks) + GitHub

---

## Quick Start (Local)

Requires Node.js 20+ and a PostgreSQL database.

```bash
# 1. install
npm install

# 2. configure
cp .env.example .env
#   edit .env -> set DATABASE_URL and JWT_SECRET

# 3. seed (creates schema, branches, users, demo stock)
npm run seed

# 4a. run API + built client (production mode)
npm run build
npm start
#   -> http://localhost:8080

# 4b. OR run with hot reload (two terminals)
npm run dev:server     # API on :8080
npm run dev:client     # Vite on :5173 (proxies /api -> :8080)
```

On first boot with `AUTO_MIGRATE=true`, the server auto-applies the schema and seeds an empty database, so a fresh Railway deploy comes up ready to use.

---

## Demo Accounts

All seeded accounts use the password from `ADMIN_PASSWORD` (default **`Prakash@123`**).

| Email | Role | Branch |
|-------|------|--------|
| `admin@prakashautohub.com` | Super Admin | — |
| `manager.pna@prakashautohub.com` | Branch Manager | Purnea |
| `manager.bgp@prakashautohub.com` | Branch Manager | Bhagalpur |
| `manager.fbg@prakashautohub.com` | Branch Manager | Forbesganj |
| `dilnawaz.pna@prakashautohub.com` | Evaluator | Purnea |
| `sales.pna@prakashautohub.com` | Sales Executive | Purnea |

> Change all seeded passwords before going live.

---

## Documentation

- [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) — Railway + GitHub deployment guide
- [`docs/SCHEMA.md`](docs/SCHEMA.md) — database schema reference
- [`docs/API.md`](docs/API.md) — REST API reference
- [`docs/VALUATION.md`](docs/VALUATION.md) — valuation algorithm explained
- [`docs/WIREFRAMES.md`](docs/WIREFRAMES.md) — screen/UI layout reference

---

## Repository Layout

```
prakash-utrust/
├── package.json            # npm workspaces root
├── railway.json            # Railway build/deploy config
├── nixpacks.toml           # Node 20 build image
├── .env.example
├── client/                 # React + Vite frontend
│   └── src/
│       ├── pages/          # Dashboard, Stock, Productivity, Valuation, Proposals, Quotations, Analytics, Users, Config
│       ├── components/     # Layout, shared UI
│       ├── api.tsx         # axios client + auth context
│       └── main.tsx
├── server/                 # Express API
│   └── src/
│       ├── routes/         # auth, stock, productivity, deals, analytics
│       ├── valuation.ts    # configurable valuation engine
│       ├── schema.sql      # PostgreSQL schema
│       ├── seed.ts         # migrate + seed
│       └── index.ts        # app entry (serves client in prod)
└── docs/
```

© Prakash Auto Hub. Internal use.
