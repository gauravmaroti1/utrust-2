import { Router } from "express";
import { query, one } from "../db.js";
import { authenticate, audit, type AuthedRequest } from "../lib.js";

export const productivityRouter = Router();
productivityRouter.use(authenticate);

// Submit / upsert a daily activity report
productivityRouter.post("/report", async (req: AuthedRequest, res) => {
  const b = req.body || {};
  const date = b.report_date || new Date().toISOString().slice(0, 10);
  const r = await one(
    `INSERT INTO daily_reports
     (user_id,branch_id,report_date,vehicles_evaluated,customer_visits,
      tradein_enquiries,quotations_made,purchases_closed,followups,remarks)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     ON CONFLICT (user_id,report_date) DO UPDATE SET
       vehicles_evaluated=EXCLUDED.vehicles_evaluated,
       customer_visits=EXCLUDED.customer_visits,
       tradein_enquiries=EXCLUDED.tradein_enquiries,
       quotations_made=EXCLUDED.quotations_made,
       purchases_closed=EXCLUDED.purchases_closed,
       followups=EXCLUDED.followups, remarks=EXCLUDED.remarks
     RETURNING *`,
    [req.user!.id, req.user!.branch_id, date,
     b.vehicles_evaluated || 0, b.customer_visits || 0, b.tradein_enquiries || 0,
     b.quotations_made || 0, b.purchases_closed || 0, b.followups || 0, b.remarks || ""]
  );
  await audit(req.user!.id, "REPORT", "daily_report", r.id);
  res.status(201).json(r);
});

// My recent reports
productivityRouter.get("/my", async (req: AuthedRequest, res) => {
  res.json(await query(
    `SELECT * FROM daily_reports WHERE user_id=$1 ORDER BY report_date DESC LIMIT 30`,
    [req.user!.id]
  ));
});

// Team reports (manager/admin) with period filter
productivityRouter.get("/team", async (req: AuthedRequest, res) => {
  const { from, to } = req.query as any;
  const u = req.user!;
  const params: any[] = [from || "2000-01-01", to || "2999-01-01"];
  let branchClause = "";
  if (u.role !== "SUPER_ADMIN") { params.push(u.branch_id); branchClause = ` AND d.branch_id=$${params.length}`; }
  const rows = await query(
    `SELECT d.*, us.name AS user_name, b.name AS branch_name
     FROM daily_reports d JOIN users us ON us.id=d.user_id
     LEFT JOIN branches b ON b.id=d.branch_id
     WHERE d.report_date BETWEEN $1 AND $2 ${branchClause}
     ORDER BY d.report_date DESC, us.name`,
    params
  );
  res.json(rows);
});

// Leaderboard / aggregated productivity (period: week, month, all)
productivityRouter.get("/leaderboard", async (req: AuthedRequest, res) => {
  const { period } = req.query as any;
  const u = req.user!;
  let dateClause = "";
  if (period === "week") dateClause = "AND d.report_date >= CURRENT_DATE - INTERVAL '7 days'";
  else if (period === "month") dateClause = "AND d.report_date >= date_trunc('month', CURRENT_DATE)";
  const params: any[] = [];
  let branchClause = "";
  if (u.role !== "SUPER_ADMIN") { params.push(u.branch_id); branchClause = `AND d.branch_id=$${params.length}`; }
  const rows = await query(
    `SELECT us.id, us.name, b.name AS branch_name,
       SUM(d.vehicles_evaluated)::int AS evaluated,
       SUM(d.customer_visits)::int AS visits,
       SUM(d.tradein_enquiries)::int AS enquiries,
       SUM(d.quotations_made)::int AS quotations,
       SUM(d.purchases_closed)::int AS purchases,
       SUM(d.followups)::int AS followups,
       CASE WHEN SUM(d.tradein_enquiries)>0
         THEN ROUND(100.0*SUM(d.purchases_closed)/SUM(d.tradein_enquiries),1) ELSE 0 END AS conversion_pct,
       (SUM(d.vehicles_evaluated)*2 + SUM(d.customer_visits) + SUM(d.quotations_made)*2
         + SUM(d.purchases_closed)*5 + SUM(d.followups))::int AS score
     FROM daily_reports d JOIN users us ON us.id=d.user_id
     LEFT JOIN branches b ON b.id=d.branch_id
     WHERE 1=1 ${dateClause} ${branchClause}
     GROUP BY us.id, us.name, b.name ORDER BY score DESC`,
    params
  );
  res.json(rows);
});
