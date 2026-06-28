# Database Schema Reference

PostgreSQL schema for U TRUST 2.0. The canonical source is [`server/src/schema.sql`](../server/src/schema.sql), applied automatically on boot when `AUTO_MIGRATE=true`. All tables use `CREATE TABLE IF NOT EXISTS`, so re-running is safe and non-destructive.

## Entity overview

```
branches ──< users ──< daily_reports
   │           │
   │           └──< evaluations ──< proposals
   │
   └──< vehicles ──< refurbishments
            │     ──< quotations
            │     ──< reservations
            └──< proposals

valuation_config (single row)   trade_history   audit_log
```

---

## branches
Dealership locations.

| Column | Type | Notes |
|--------|------|-------|
| `id` | serial PK | |
| `code` | text unique | `PNA`, `BGP`, `FBG` |
| `name` | text | Purnea / Bhagalpur / Forbesganj |

## users
Accounts with role-based access.

| Column | Type | Notes |
|--------|------|-------|
| `id` | serial PK | |
| `name`, `email` | text | email unique |
| `password_hash` | text | bcrypt |
| `role` | text | `SUPER_ADMIN`, `BRANCH_MANAGER`, `EVALUATOR`, `SALES_EXECUTIVE` |
| `branch_id` | fk → branches | `NULL` for Super Admin (all branches) |
| `phone`, `active` | text / bool | |

## vehicles
Core stock register.

| Column | Type | Notes |
|--------|------|-------|
| `id` | serial PK | |
| `reg_no`, `make`, `model`, `variant` | text | make & model required |
| `fuel_type`, `transmission`, `color` | text | |
| `mfg_year`, `odometer`, `owners` | int | |
| `purchase_date` | date | drives ageing (`CURRENT_DATE - purchase_date`) |
| `purchase_cost`, `selling_price` | numeric | |
| `insurance_valid_to` | date | |
| `insurance_status` | text | `VALID` / `FAIL` |
| `branch_id`, `evaluator_id` | fk | |
| `status` | text | `IN_STOCK`, `PURCHASED`, `READY_FOR_SALE`, `UNDER_REFURBISHMENT`, `RESERVED`, `SOLD`, `DELIVERED` |
| `location_note` | text | e.g. "BGP SHOWROOM", "USE IN SALES G.M" |
| `sold_date`, `sold_price` | date / numeric | set on status → SOLD/DELIVERED |

Indexed on `branch_id` and `status`.

## daily_reports
One row per user per day (`UNIQUE(user_id, report_date)`; upserted).

Counters: `vehicles_evaluated`, `customer_visits`, `tradein_enquiries`, `quotations_made`, `purchases_closed`, `followups`, plus `remarks`.

## evaluations
Inspection inputs + a snapshot of the valuation engine output (`condition_score`, `base_value`, `suggested_purchase`, `retail_min/recommended/max`, and a JSON `breakdown`).

## proposals
Purchase approval workflow.

| Column | Notes |
|--------|-------|
| `proposed_purchase`, `refurb_estimate`, `expected_resale` | inputs |
| `gross_margin`, `roi_pct` | computed = resale − purchase − refurb |
| `status` | `DRAFT` → `PENDING_MANAGER` → `PENDING_ADMIN` → `APPROVED` / `REJECTED` |
| `manager_id`, `manager_note`, `admin_id`, `admin_note` | decision trail |

On final `APPROVED`, the linked vehicle moves to `PURCHASED`.

## refurbishments
Per-vehicle cost lines (`category`, `description`, `amount`). Adding a line moves an `IN_STOCK`/`PURCHASED` vehicle to `UNDER_REFURBISHMENT`. Totals roll into final cost & ROI.

## quotations
Customer quotes (`customer_name`, `customer_phone`, `asking_price`, `negotiated_price`, `insurance_details`, `warranty_details`, `notes`). Drive the PDF + WhatsApp share.

## reservations
Vehicle holds; creating one sets the vehicle to `RESERVED`.

## valuation_config
Single JSON row (`id = 1`, enforced by a CHECK constraint) holding the entire tunable valuation model. See [VALUATION.md](VALUATION.md).

## trade_history
Historical trade-in / trade-out records (`direction` IN/OUT, `month`, `customer`, `vehicle`, `dealer_code`) seeded from the uploaded Excel; powers the analytics trend.

## audit_log
Append-only trail: `user_id`, `action`, `entity`, `entity_id`, JSON `detail`.
