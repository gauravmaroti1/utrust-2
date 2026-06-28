# Deployment Guide — Railway + GitHub

U TRUST 2.0 deploys as a **single Railway service** (Express serves the built React app) plus the **Railway PostgreSQL plugin**. This mirrors the setup used for the Prakash Toyota QMS and Utrust CRM.

---

## 1. Push to GitHub

```bash
cd prakash-utrust
git init
git add .
git commit -m "U TRUST 2.0 initial commit"
git branch -M main
git remote add origin https://github.com/<your-account>/utrust-2.git
git push -u origin main
```

> The repo already has a `.gitignore` that excludes `node_modules`, `dist`, and `.env`.

---

## 2. Create the Railway project

1. Go to **railway.app → New Project → Deploy from GitHub repo** and pick the repo.
2. Railway detects `nixpacks.toml` / `railway.json` and uses Nixpacks with Node 20.
3. Build command: `npm install && npm run build` (Railway runs install automatically; `railway.json` sets the build).
4. Start command: `npm start` (runs the API via `tsx`, which serves `client/dist`).

---

## 3. Add PostgreSQL

1. In the project, click **New → Database → Add PostgreSQL**.
2. Railway provisions it and exposes connection variables.
3. Open your **service → Variables** and reference the database. The simplest is to add a variable:

```
DATABASE_URL = ${{ Postgres.DATABASE_URL }}
```

Railway substitutes the live internal connection string. The server auto-detects Railway hosts and enables SSL.

---

## 4. Set environment variables

On the **service → Variables** tab:

| Variable | Value | Notes |
|----------|-------|-------|
| `DATABASE_URL` | `${{ Postgres.DATABASE_URL }}` | from the Postgres plugin |
| `JWT_SECRET` | a long random string | **required** — use `openssl rand -hex 32` |
| `ADMIN_EMAIL` | `admin@prakashautohub.com` | seeded super-admin login |
| `ADMIN_PASSWORD` | a strong password | seeded super-admin password |
| `AUTO_MIGRATE` | `true` | auto-create schema + seed on first boot |
| `PORT` | *(leave unset)* | Railway injects this automatically |

---

## 5. First boot

On deploy the server will:

1. Connect to Postgres.
2. If `AUTO_MIGRATE=true`, apply `schema.sql`.
3. If the database is empty, seed branches, users, valuation config, demo stock and trade history.
4. Start listening on Railway's `PORT`.

Watch **Deployments → View Logs** for:

```
[migrate] schema applied
[seed] 27 vehicles inserted
[server] U TRUST listening on :8080
```

Then open the generated Railway URL and log in with the admin credentials.

---

## 6. Re-seeding / migrations

- **`AUTO_MIGRATE`** runs the schema with `IF NOT EXISTS`, so it is safe to leave on; it never drops data.
- Seeding only inserts demo stock **when the vehicles table is empty**, so it will not duplicate your real data once you start entering it.
- To run a manual seed against the production DB from your machine:

```bash
DATABASE_URL="<railway external url>" npm run seed
```

---

## 7. Custom domain (optional)

Service → **Settings → Networking → Custom Domain**, then point a CNAME from your DNS to the Railway target.

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| `password authentication failed` | `DATABASE_URL` not referencing the plugin variable correctly |
| `self signed certificate` | handled automatically; the pool enables SSL for `railway`/`rlwy` hosts |
| Blank page, API 404 | ensure `npm run build` ran so `client/dist` exists; check build logs |
| `JWT_SECRET` undefined | set it in Variables; the app refuses to sign tokens without it |
| Seed didn't run | DB wasn't empty, or `AUTO_MIGRATE` unset; run `npm run seed` manually |
| Outbound network blocked | if you add external integrations later, allow their domains in Railway's network settings |
