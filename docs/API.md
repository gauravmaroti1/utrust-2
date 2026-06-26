# REST API Reference

Base URL: `/api`. All responses are JSON. Except for `POST /auth/login`, every endpoint requires a bearer token:

```
Authorization: Bearer <token>
```

Tokens come from login and expire after 12 hours. Branch-scoped roles only see their own branch's data; `SUPER_ADMIN` sees everything.

---

## Auth

### `POST /auth/login`
Body: `{ "email", "password" }` → `{ token, user }`.

### `GET /auth/me`
Returns the current user.

---

## Users  *(SUPER_ADMIN unless noted)*

| Method | Path | Notes |
|--------|------|-------|
| `GET` | `/users` | list (manager sees own branch) |
| `POST` | `/users` | create — `{ name, email, password, role, branch_id?, phone? }` |
| `PATCH` | `/users/:id` | update name/role/branch/phone/active/password |

### `GET /branches`
List branches (any authenticated user).

---

## Stock

| Method | Path | Notes |
|--------|------|-------|
| `GET` | `/stock` | query: `status`, `branch_id`, `search`; returns vehicles with `age_days`, `branch_name`, `evaluator_name` |
| `GET` | `/stock/kpis` | totals, stock value, avg age, ageing buckets, by-branch, by-status |
| `GET` | `/stock/:id` | vehicle + refurb lines + history |
| `POST` | `/stock` | create vehicle |
| `PATCH` | `/stock/:id` | update fields |
| `POST` | `/stock/:id/status` | `{ status, sold_price? }`; sets sold_date on SOLD/DELIVERED |
| `GET` | `/stock/export/xlsx` | Excel download (blob) |
| `POST` | `/stock/import/xlsx` | multipart `file`; auto-detects headers *(SUPER_ADMIN, BRANCH_MANAGER)* |

---

## Productivity

| Method | Path | Notes |
|--------|------|-------|
| `POST` | `/productivity/report` | upsert daily report (unique per user+date) |
| `GET` | `/productivity/my` | my last 30 reports |
| `GET` | `/productivity/team` | query `from`, `to`; branch-scoped |
| `GET` | `/productivity/leaderboard` | query `period` = `week`/`month`/`all`; returns score + conversion % |

**Leaderboard score** = `evaluated×2 + visits + quotations×2 + purchases×5 + followups`.

---

## Evaluations & Valuation

| Method | Path | Notes |
|--------|------|-------|
| `POST` | `/evaluations/preview` | run the engine without saving → full result + breakdown |
| `POST` | `/evaluations` | run & save an evaluation |
| `GET` | `/evaluations` | recent evaluations (branch-scoped) |
| `GET` | `/valuation-config` | current config JSON |
| `PUT` | `/valuation-config` | replace config *(SUPER_ADMIN)* |

Evaluation input: `{ brand, model, variant?, reg_year, kms, owners, fuel_type, accident_history, service_history, tyre_condition, exterior_condition, interior_condition, insurance_validity, market_demand, base_value? }`.

---

## Proposals (approval workflow)

| Method | Path | Notes |
|--------|------|-------|
| `POST` | `/proposals` | create — `{ vehicle_id?, proposed_purchase, refurb_estimate, expected_resale }`; computes margin & ROI; status → `PENDING_MANAGER` |
| `GET` | `/proposals` | list (evaluators see own; managers see branch; admin all) |
| `POST` | `/proposals/:id/manager` | `{ decision: "APPROVE"\|"REJECT", note? }` → `PENDING_ADMIN` / `REJECTED` *(BRANCH_MANAGER, SUPER_ADMIN)* |
| `POST` | `/proposals/:id/admin` | final `{ decision, note? }` → `APPROVED` (vehicle → PURCHASED) / `REJECTED` *(SUPER_ADMIN)* |

---

## Refurbishment

| Method | Path | Notes |
|--------|------|-------|
| `POST` | `/refurbishment` | add line `{ vehicle_id, category, description, amount }`; vehicle → UNDER_REFURBISHMENT |
| `GET` | `/refurbishment/vehicle/:vehicleId` | lines + `refurb_total`, `final_cost`, `profit`, `roi_pct` |

---

## Quotations

| Method | Path | Notes |
|--------|------|-------|
| `POST` | `/quotations` | create `{ vehicle_id, customer_name, customer_phone, asking_price, negotiated_price?, insurance_details?, warranty_details?, notes? }` |
| `GET` | `/quotations` | list (branch-scoped) |
| `GET` | `/quotations/:id/whatsapp` | `{ text, wa_link }` ready-to-share |
| `GET` | `/quotations/:id/pdf` | branded PDF (blob) |

---

## Reservations

| Method | Path | Notes |
|--------|------|-------|
| `POST` | `/reservations` | `{ vehicle_id, customer_name, customer_phone, reserved_until? }`; vehicle → RESERVED |

---

## Analytics

| Method | Path | Notes |
|--------|------|-------|
| `GET` | `/analytics/overview` | ageing buckets, by-branch, sales, make mix, trade-in/out trend |
| `GET` | `/analytics/evaluators` | per-evaluator evaluations / proposals / approved / avg ROI |

---

## Error format

Errors return an appropriate HTTP status with `{ "error": "message" }`. Common: `400` validation, `401` missing/expired token, `403` role not permitted, `404` not found, `409` duplicate (e.g. email).
