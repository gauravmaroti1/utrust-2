import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { pool, query, one } from "./db.js";
import { hashPassword } from "./lib.js";
import { DEFAULT_CONFIG } from "./valuation.js";
import { STOCK_SEED, TRADE_SEED } from "./seedData.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function migrate() {
  const schema = fs.readFileSync(path.join(__dirname, "schema.sql"), "utf-8");
  await pool.query(schema);
  console.log("[migrate] schema applied");
}

function parseInsDate(ins: string): { to: string | null; status: string } {
  if (!ins || ins.toUpperCase() === "FAIL")
    return { to: null, status: "FAIL" };
  // format dd-mm-yy
  const m = ins.match(/(\d{2})-(\d{2})-(\d{2})/);
  if (!m) return { to: null, status: "UNKNOWN" };
  const [_, dd, mm, yy] = m;
  const iso = `20${yy}-${mm}-${dd}`;
  const valid = new Date(iso) >= new Date();
  return { to: iso, status: valid ? "VALID" : "EXPIRED" };
}

export async function seed() {
  // ---- Branches ----
  const branchMap: Record<string, number> = {};
  for (const [code, name] of [
    ["PNA", "Purnea"],
    ["BGP", "Bhagalpur"],
    ["FBG", "Forbesganj"],
  ]) {
    const row = await one(
      `INSERT INTO branches(code,name) VALUES ($1,$2)
       ON CONFLICT (code) DO UPDATE SET name=EXCLUDED.name RETURNING id`,
      [code, name]
    );
    branchMap[code] = row.id;
  }

  // ---- Users ----
  const adminEmail = process.env.ADMIN_EMAIL || "admin@prakashautohub.com";
  const adminPw = process.env.ADMIN_PASSWORD || "Prakash@123";
  const users: [string, string, string, string | null][] = [
    ["Super Admin", adminEmail, "SUPER_ADMIN", null],
    // Branch managers
    ["Purnea Manager", "manager.pna@prakashautohub.com", "BRANCH_MANAGER", "PNA"],
    ["Bhagalpur Manager", "manager.bgp@prakashautohub.com", "BRANCH_MANAGER", "BGP"],
    ["Forbesganj Manager", "manager.fbg@prakashautohub.com", "BRANCH_MANAGER", "FBG"],
    // Purnea evaluators (3)
    ["Dilnawaz Khan", "dilnawaz.pna@prakashautohub.com", "EVALUATOR", "PNA"],
    ["Evaluator PNA-2", "eval2.pna@prakashautohub.com", "EVALUATOR", "PNA"],
    ["Evaluator PNA-3", "eval3.pna@prakashautohub.com", "EVALUATOR", "PNA"],
    // Bhagalpur evaluators (2)
    ["Evaluator BGP-1", "eval1.bgp@prakashautohub.com", "EVALUATOR", "BGP"],
    ["Evaluator BGP-2", "eval2.bgp@prakashautohub.com", "EVALUATOR", "BGP"],
    // Forbesganj evaluators (2)
    ["Evaluator FBG-1", "eval1.fbg@prakashautohub.com", "EVALUATOR", "FBG"],
    ["Evaluator FBG-2", "eval2.fbg@prakashautohub.com", "EVALUATOR", "FBG"],
    // Sales executives
    ["Sales Exec PNA", "sales.pna@prakashautohub.com", "SALES_EXECUTIVE", "PNA"],
    ["Sales Exec BGP", "sales.bgp@prakashautohub.com", "SALES_EXECUTIVE", "BGP"],
  ];
  const hash = hashPassword(adminPw);
  const userMap: Record<string, number> = {};
  for (const [name, email, role, branch] of users) {
    const row = await one(
      `INSERT INTO users(name,email,password_hash,role,branch_id)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (email) DO UPDATE SET name=EXCLUDED.name RETURNING id`,
      [name, email, hash, role, branch ? branchMap[branch] : null]
    );
    userMap[email] = row.id;
  }

  // ---- Valuation config ----
  await query(
    `INSERT INTO valuation_config(id,data) VALUES (1,$1)
     ON CONFLICT (id) DO NOTHING`,
    [JSON.stringify(DEFAULT_CONFIG)]
  );

  // ---- Stock (only if empty) ----
  const existing = await one(`SELECT COUNT(*)::int AS c FROM vehicles`);
  if (existing.c === 0) {
    // pick a default evaluator per branch
    const evalByBranch: Record<string, number> = {
      PNA: userMap["dilnawaz.pna@prakashautohub.com"],
      BGP: userMap["eval1.bgp@prakashautohub.com"],
      FBG: userMap["eval1.fbg@prakashautohub.com"],
    };
    for (const s of STOCK_SEED as any[]) {
      const ins = parseInsDate(s.insurance);
      // synthesise a plausible purchase date 30-150 days back for ageing demo
      const daysBack = 25 + Math.floor(Math.random() * 130);
      const pd = new Date();
      pd.setDate(pd.getDate() - daysBack);
      await query(
        `INSERT INTO vehicles
         (reg_no,make,model,variant,fuel_type,mfg_year,odometer,color,owners,
          purchase_date,purchase_cost,selling_price,insurance_valid_to,insurance_status,
          branch_id,evaluator_id,status,location_note)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)`,
        [
          s.reg_no, s.make, s.model, s.variant, s.fuel_type, s.mfg_year,
          s.odometer, s.color, s.owners, pd.toISOString().slice(0, 10),
          s.purchase_cost, s.selling_price, ins.to, ins.status,
          branchMap[s.branch], evalByBranch[s.branch], s.status, s.note,
        ]
      );
    }
    console.log(`[seed] ${STOCK_SEED.length} vehicles inserted`);
  }

  // ---- Trade history ----
  const th = await one(`SELECT COUNT(*)::int AS c FROM trade_history`);
  if (th.c === 0) {
    for (const t of TRADE_SEED as any[]) {
      await query(
        `INSERT INTO trade_history(direction,month,customer,vehicle,dealer_code)
         VALUES ($1,$2,$3,$4,$5)`,
        [t.direction, t.month, t.customer, t.vehicle, t.dealer_code]
      );
    }
    console.log(`[seed] ${TRADE_SEED.length} trade-history rows inserted`);
  }

  // ---- Demo daily reports (last 7 days for a few evaluators) ----
  const dr = await one(`SELECT COUNT(*)::int AS c FROM daily_reports`);
  if (dr.c === 0) {
    const evals = [
      ["dilnawaz.pna@prakashautohub.com", "PNA"],
      ["eval2.pna@prakashautohub.com", "PNA"],
      ["eval1.bgp@prakashautohub.com", "BGP"],
      ["eval1.fbg@prakashautohub.com", "FBG"],
    ];
    for (let d = 6; d >= 0; d--) {
      const day = new Date();
      day.setDate(day.getDate() - d);
      for (const [email, branch] of evals) {
        await query(
          `INSERT INTO daily_reports
           (user_id,branch_id,report_date,vehicles_evaluated,customer_visits,
            tradein_enquiries,quotations_made,purchases_closed,followups,remarks)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
           ON CONFLICT (user_id,report_date) DO NOTHING`,
          [
            userMap[email], branchMap[branch], day.toISOString().slice(0, 10),
            1 + Math.floor(Math.random() * 5),
            2 + Math.floor(Math.random() * 6),
            1 + Math.floor(Math.random() * 4),
            Math.floor(Math.random() * 4),
            Math.floor(Math.random() * 2),
            2 + Math.floor(Math.random() * 5),
            "Auto-seeded demo activity",
          ]
        );
      }
    }
    console.log("[seed] demo daily reports inserted");
  }

  console.log("[seed] complete");
}

// Allow running `npm run seed` standalone
const isMain = process.argv[1] && process.argv[1].endsWith("seed.ts");
if (isMain) {
  (async () => {
    await migrate();
    await seed();
    process.exit(0);
  })();
}
