import { Router } from "express";
import { query, one } from "../db.js";
import { authenticate, authorize, audit, type AuthedRequest } from "../lib.js";

// ===================== ANALYTICS =====================
export const analyticsRouter = Router();
analyticsRouter.use(authenticate);

function branchFilter(req: AuthedRequest, col = "branch_id", startIdx = 0) {
  const u = req.user!;
  if (u.role === "SUPER_ADMIN") return { clause: "", params: [] as any[] };
  return { clause: ` AND ${col}=$${startIdx + 1}`, params: [u.branch_id] };
}

analyticsRouter.get("/overview", async (req: AuthedRequest, res) => {
  const f = branchFilter(req, "v.branch_id");
  // Ageing buckets
  const ageing = await query(
    `SELECT
       COUNT(*) FILTER (WHERE (CURRENT_DATE-purchase_date) BETWEEN 0 AND 30)::int AS d0_30,
       COUNT(*) FILTER (WHERE (CURRENT_DATE-purchase_date) BETWEEN 31 AND 60)::int AS d31_60,
       COUNT(*) FILTER (WHERE (CURRENT_DATE-purchase_date) BETWEEN 61 AND 90)::int AS d61_90,
       COUNT(*) FILTER (WHERE (CURRENT_DATE-purchase_date) BETWEEN 91 AND 120)::int AS d91_120,
       COUNT(*) FILTER (WHERE (CURRENT_DATE-purchase_date) > 120)::int AS d120_plus
     FROM vehicles v WHERE status NOT IN ('SOLD','DELIVERED') ${f.clause}`, f.params);

  const byBranch = await query(
    `SELECT b.name AS branch, COUNT(*)::int AS stock,
            COALESCE(SUM(v.purchase_cost),0)::numeric AS value
     FROM vehicles v JOIN branches b ON b.id=v.branch_id
     WHERE v.status NOT IN ('SOLD','DELIVERED') ${f.clause}
     GROUP BY b.name ORDER BY stock DESC`, f.params);

  const sales = await query(
    `SELECT COUNT(*) FILTER (WHERE status IN ('SOLD','DELIVERED'))::int AS units_sold,
            COALESCE(SUM(sold_price) FILTER (WHERE status IN ('SOLD','DELIVERED')),0)::numeric AS revenue,
            COALESCE(AVG(sold_date - purchase_date) FILTER (WHERE status IN ('SOLD','DELIVERED')),0)::numeric AS avg_days_to_sale
     FROM vehicles v WHERE 1=1 ${f.clause}`, f.params);

  const makeMix = await query(
    `SELECT make, COUNT(*)::int AS count FROM vehicles v
     WHERE status NOT IN ('SOLD','DELIVERED') ${f.clause}
     GROUP BY make ORDER BY count DESC LIMIT 8`, f.params);

  // Trade trend from historical data (in vs out by month)
  const tradeTrend = await query(
    `SELECT month, direction, COUNT(*)::int AS count
     FROM trade_history GROUP BY month, direction`);

  res.json({ ageing: ageing[0], by_branch: byBranch, sales: sales[0], make_mix: makeMix, trade_trend: tradeTrend });
});

// Insurance + registration expiry alerts (dashboard)
analyticsRouter.get("/alerts", async (req: AuthedRequest, res) => {
  const f = branchFilter(req, "branch_id");
  const within = Number(req.query.days || 30);
  const rows = await query(
    `SELECT id, reg_no, chassis_no, make, model, mfg_year, status, insured,
            insurance_valid_to, insurance_status, registration_valid_to, branch_id
     FROM vehicles
     WHERE status NOT IN ('SOLD','SCRAPPED') ${f.clause}
     ORDER BY COALESCE(insurance_valid_to, registration_valid_to) NULLS LAST`, f.params
  );
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const days = (d: any) => d ? Math.ceil((new Date(d).getTime() - today.getTime()) / 86400000) : null;

  const insurance_expired: any[] = [], insurance_expiring: any[] = [];
  const not_insured: any[] = [], reg_expired: any[] = [], reg_expiring: any[] = [];
  for (const v of rows) {
    const insD = days(v.insurance_valid_to);
    const regD = days(v.registration_valid_to);
    if (v.insured === false || (!v.insurance_valid_to && v.insurance_status !== "VALID")) not_insured.push(v);
    if (insD !== null) { if (insD < 0) insurance_expired.push({ ...v, days: insD }); else if (insD <= within) insurance_expiring.push({ ...v, days: insD }); }
    if (regD !== null) { if (regD < 0) reg_expired.push({ ...v, days: regD }); else if (regD <= within) reg_expiring.push({ ...v, days: regD }); }
  }
  res.json({
    counts: {
      insurance_expired: insurance_expired.length, insurance_expiring: insurance_expiring.length,
      not_insured: not_insured.length, reg_expired: reg_expired.length, reg_expiring: reg_expiring.length,
    },
    insurance_expired, insurance_expiring, not_insured, reg_expired, reg_expiring,
  });
});

// Evaluator performance (purchases via proposals + productivity)
analyticsRouter.get("/evaluators", async (req: AuthedRequest, res) => {
  const u = req.user!;
  const params: any[] = [];
  let where = "WHERE u.role='EVALUATOR'";
  if (u.role !== "SUPER_ADMIN") { params.push(u.branch_id); where += ` AND u.branch_id=$${params.length}`; }
  res.json(await query(
    `SELECT u.id, u.name, b.name AS branch,
       COUNT(DISTINCT e.id)::int AS evaluations,
       COUNT(DISTINCT p.id)::int AS proposals,
       COUNT(DISTINCT p.id) FILTER (WHERE p.status='APPROVED')::int AS approved,
       COALESCE(AVG(p.roi_pct),0)::numeric AS avg_roi
     FROM users u
     LEFT JOIN evaluations e ON e.evaluator_id=u.id
     LEFT JOIN proposals p ON p.evaluator_id=u.id
     LEFT JOIN branches b ON b.id=u.branch_id
     ${where} GROUP BY u.id, u.name, b.name ORDER BY approved DESC`, params));
});

// ===================== VALUATION CONFIG =====================
export const configRouter = Router();
configRouter.use(authenticate);

configRouter.get("/", async (_req, res) => {
  const row = await one(`SELECT data FROM valuation_config WHERE id=1`);
  res.json(row?.data || {});
});

configRouter.put("/", authorize("SUPER_ADMIN"), async (req: AuthedRequest, res) => {
  const row = await one(
    `UPDATE valuation_config SET data=$1, updated_by=$2, updated_at=now()
     WHERE id=1 RETURNING data`,
    [JSON.stringify(req.body), req.user!.id]);
  await audit(req.user!.id, "CONFIG_UPDATE", "valuation_config", 1);
  res.json(row?.data);
});
