-- ============================================================================
-- U TRUST 2.0  —  PostgreSQL Schema
-- Prakash Auto Hub | Pre-Owned Vehicle Dealership Management Platform
-- ============================================================================

-- ---------- Branches ----------
CREATE TABLE IF NOT EXISTS branches (
  id          SERIAL PRIMARY KEY,
  code        TEXT UNIQUE NOT NULL,          -- PNA, BGP, FBG
  name        TEXT NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- ---------- Users / RBAC ----------
-- roles: SUPER_ADMIN, BRANCH_MANAGER, EVALUATOR, SALES_EXECUTIVE
CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  name          TEXT NOT NULL,
  email         TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL,
  branch_id     INTEGER REFERENCES branches(id),  -- NULL for SUPER_ADMIN (all branches)
  phone         TEXT,
  active        BOOLEAN DEFAULT TRUE,
  created_at    TIMESTAMPTZ DEFAULT now()
);

-- ---------- Vehicles / Stock ----------
-- status: IN_STOCK, PURCHASED, READY_FOR_SALE, UNDER_REFURBISHMENT, RESERVED, SOLD, DELIVERED
CREATE TABLE IF NOT EXISTS vehicles (
  id              SERIAL PRIMARY KEY,
  reg_no          TEXT,
  make            TEXT NOT NULL,
  model           TEXT NOT NULL,
  variant         TEXT,
  fuel_type       TEXT,
  transmission    TEXT,
  mfg_year        INTEGER,
  odometer        INTEGER,
  color           TEXT,
  owners          INTEGER DEFAULT 1,
  purchase_date   DATE,
  purchase_cost   NUMERIC(12,2) DEFAULT 0,
  selling_price   NUMERIC(12,2) DEFAULT 0,
  insurance_valid_to DATE,
  insurance_status   TEXT,                       -- VALID / FAIL
  branch_id       INTEGER REFERENCES branches(id),
  evaluator_id    INTEGER REFERENCES users(id),
  status          TEXT DEFAULT 'IN_STOCK',
  location_note   TEXT,                          -- e.g. "BGP SHOWROOM", "USE IN SALES G.M"
  photos          JSONB DEFAULT '[]'::jsonb,
  sold_date       DATE,
  sold_price      NUMERIC(12,2),
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_vehicles_branch ON vehicles(branch_id);
CREATE INDEX IF NOT EXISTS idx_vehicles_status ON vehicles(status);

-- ---------- Daily Productivity ----------
CREATE TABLE IF NOT EXISTS daily_reports (
  id                SERIAL PRIMARY KEY,
  user_id           INTEGER REFERENCES users(id),
  branch_id         INTEGER REFERENCES branches(id),
  report_date       DATE NOT NULL,
  vehicles_evaluated INTEGER DEFAULT 0,
  customer_visits    INTEGER DEFAULT 0,
  tradein_enquiries  INTEGER DEFAULT 0,
  quotations_made    INTEGER DEFAULT 0,
  purchases_closed   INTEGER DEFAULT 0,
  followups          INTEGER DEFAULT 0,
  remarks            TEXT,
  created_at         TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, report_date)
);
CREATE INDEX IF NOT EXISTS idx_reports_date ON daily_reports(report_date);

-- ---------- Evaluations (condition + scoring) ----------
CREATE TABLE IF NOT EXISTS evaluations (
  id                SERIAL PRIMARY KEY,
  vehicle_id        INTEGER REFERENCES vehicles(id),
  evaluator_id      INTEGER REFERENCES users(id),
  branch_id         INTEGER REFERENCES branches(id),
  -- raw inputs
  brand             TEXT, model TEXT, variant TEXT,
  reg_year          INTEGER, kms INTEGER, owners INTEGER, fuel_type TEXT,
  accident_history  TEXT,           -- NONE / MINOR / MAJOR
  service_history   TEXT,           -- FULL / PARTIAL / NONE
  tyre_condition    INTEGER,        -- 1-10
  exterior_condition INTEGER,       -- 1-10
  interior_condition INTEGER,       -- 1-10
  insurance_validity TEXT,          -- VALID / EXPIRING / EXPIRED
  market_demand     TEXT,           -- HIGH / MEDIUM / LOW
  -- engine output (snapshot)
  condition_score   NUMERIC(5,2),
  base_value        NUMERIC(12,2),
  suggested_purchase NUMERIC(12,2),
  retail_min        NUMERIC(12,2),
  retail_recommended NUMERIC(12,2),
  retail_max        NUMERIC(12,2),
  breakdown         JSONB,
  created_at        TIMESTAMPTZ DEFAULT now()
);

-- ---------- Purchase Proposals (approval workflow) ----------
-- status: DRAFT, PENDING_MANAGER, PENDING_ADMIN, APPROVED, REJECTED
CREATE TABLE IF NOT EXISTS proposals (
  id                SERIAL PRIMARY KEY,
  vehicle_id        INTEGER REFERENCES vehicles(id),
  evaluation_id     INTEGER REFERENCES evaluations(id),
  evaluator_id      INTEGER REFERENCES users(id),
  branch_id         INTEGER REFERENCES branches(id),
  proposed_purchase NUMERIC(12,2),
  refurb_estimate   NUMERIC(12,2) DEFAULT 0,
  expected_resale   NUMERIC(12,2),
  gross_margin      NUMERIC(12,2),
  roi_pct           NUMERIC(6,2),
  status            TEXT DEFAULT 'PENDING_MANAGER',
  manager_id        INTEGER REFERENCES users(id),
  manager_note      TEXT,
  admin_id          INTEGER REFERENCES users(id),
  admin_note        TEXT,
  created_at        TIMESTAMPTZ DEFAULT now(),
  updated_at        TIMESTAMPTZ DEFAULT now()
);

-- ---------- Refurbishment cost lines ----------
CREATE TABLE IF NOT EXISTS refurbishments (
  id            SERIAL PRIMARY KEY,
  vehicle_id    INTEGER REFERENCES vehicles(id),
  category      TEXT,    -- MECHANICAL / DENT_PAINT / ACCESSORIES / LABOUR / MISC
  description   TEXT,
  amount        NUMERIC(12,2) DEFAULT 0,
  added_by      INTEGER REFERENCES users(id),
  created_at    TIMESTAMPTZ DEFAULT now()
);

-- ---------- Sales Quotations ----------
CREATE TABLE IF NOT EXISTS quotations (
  id              SERIAL PRIMARY KEY,
  vehicle_id      INTEGER REFERENCES vehicles(id),
  created_by      INTEGER REFERENCES users(id),
  branch_id       INTEGER REFERENCES branches(id),
  customer_name   TEXT,
  customer_phone  TEXT,
  asking_price    NUMERIC(12,2),
  negotiated_price NUMERIC(12,2),
  insurance_details TEXT,
  warranty_details  TEXT,
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- ---------- Reservations ----------
CREATE TABLE IF NOT EXISTS reservations (
  id            SERIAL PRIMARY KEY,
  vehicle_id    INTEGER REFERENCES vehicles(id),
  customer_name TEXT,
  customer_phone TEXT,
  reserved_by   INTEGER REFERENCES users(id),
  reserved_until DATE,
  active        BOOLEAN DEFAULT TRUE,
  created_at    TIMESTAMPTZ DEFAULT now()
);

-- ---------- Valuation config (Super Admin tunable) ----------
CREATE TABLE IF NOT EXISTS valuation_config (
  id    INTEGER PRIMARY KEY DEFAULT 1,
  data  JSONB NOT NULL,
  updated_by INTEGER REFERENCES users(id),
  updated_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT single_row CHECK (id = 1)
);

-- ---------- Historical trade data (seeded from Excel) ----------
CREATE TABLE IF NOT EXISTS trade_history (
  id          SERIAL PRIMARY KEY,
  direction   TEXT,        -- IN / OUT
  month       TEXT,
  customer    TEXT,
  vehicle     TEXT,
  dealer_code TEXT,
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- ---------- Audit log ----------
CREATE TABLE IF NOT EXISTS audit_log (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER REFERENCES users(id),
  action      TEXT,
  entity      TEXT,
  entity_id   INTEGER,
  detail      JSONB,
  created_at  TIMESTAMPTZ DEFAULT now()
);
