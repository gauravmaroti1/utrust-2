import { Router } from "express";
import { query, one } from "../db.js";
import { authenticate, authorize, audit, type AuthedRequest } from "../lib.js";

const thisMonth = () => new Date().toISOString().slice(0, 7); // YYYY-MM

/* ===================== EVALUATOR TARGETS ===================== */
export const targetRouter = Router();
targetRouter.use(authenticate);

// List targets for a month with achievement (evaluations done + purchases closed)
targetRouter.get("/", async (req: AuthedRequest, res) => {
  const u = req.user!;
  const month = String(req.query.month || thisMonth());
  const start = `${month}-01`;
  const params: any[] = [month, start];
  let scope = "";
  if (u.role !== "SUPER_ADMIN") { params.push(u.branch_id); scope = `AND us.branch_id = $${params.length}`; }

  const rows = await query(
    `SELECT us.id AS evaluator_id, us.name AS evaluator_name, b.name AS branch_name,
            t.month, COALESCE(t.target_evaluations,0) AS target_evaluations,
            COALESCE(t.target_purchases,0) AS target_purchases,
            COALESCE(t.target_purchase_value,0) AS target_purchase_value,
            (SELECT count(*) FROM evaluations e
               WHERE e.evaluator_id=us.id AND e.created_at >= $2::date
               AND e.created_at < ($2::date + INTERVAL '1 month'))::int AS done_evaluations,
            (SELECT count(*) FROM proposals p
               WHERE p.evaluator_id=us.id AND p.type='PURCHASE' AND p.status='APPROVED'
               AND p.created_at >= $2::date
               AND p.created_at < ($2::date + INTERVAL '1 month'))::int AS done_purchases
     FROM users us
     LEFT JOIN branches b ON b.id=us.branch_id
     LEFT JOIN evaluator_targets t ON t.evaluator_id=us.id AND t.month=$1
     WHERE us.role IN ('EVALUATOR','SALES_EXECUTIVE','BRANCH_MANAGER') ${scope}
     ORDER BY us.name`, params
  );
  res.json(rows);
});

// Set / update a target (managers + admin)
targetRouter.post("/", authorize("BRANCH_MANAGER", "SUPER_ADMIN"), async (req: AuthedRequest, res) => {
  const b = req.body || {};
  if (!b.evaluator_id) return res.status(400).json({ error: "evaluator_id required" });
  const month = b.month || thisMonth();
  const ev = await one(`SELECT branch_id FROM users WHERE id=$1`, [b.evaluator_id]);
  const row = await one(
    `INSERT INTO evaluator_targets
       (evaluator_id,branch_id,month,target_evaluations,target_purchases,target_purchase_value,set_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     ON CONFLICT (evaluator_id,month) DO UPDATE SET
       target_evaluations=EXCLUDED.target_evaluations,
       target_purchases=EXCLUDED.target_purchases,
       target_purchase_value=EXCLUDED.target_purchase_value,
       set_by=EXCLUDED.set_by RETURNING *`,
    [b.evaluator_id, ev?.branch_id || null, month, Number(b.target_evaluations) || 0,
     Number(b.target_purchases) || 0, Number(b.target_purchase_value) || 0, req.user!.id]
  );
  await audit(req.user!.id, "SET_TARGET", "evaluator_target", row.id);
  res.status(201).json(row);
});

/* ===================== ENQUIRIES (trade-in / trade-out) ===================== */
export const enquiryRouter = Router();
enquiryRouter.use(authenticate);

enquiryRouter.get("/", async (req: AuthedRequest, res) => {
  const u = req.user!;
  const params: any[] = [];
  let where = "WHERE 1=1";
  if (req.query.type) { params.push(String(req.query.type).toUpperCase()); where += ` AND e.type=$${params.length}`; }
  if (u.role !== "SUPER_ADMIN") { params.push(u.branch_id); where += ` AND e.branch_id=$${params.length}`; }
  if (u.role === "EVALUATOR" || u.role === "SALES_EXECUTIVE") { params.push(u.id); where += ` AND e.evaluator_id=$${params.length}`; }
  const rows = await query(
    `SELECT e.*, us.name AS evaluator_name, b.name AS branch_name
     FROM enquiries e LEFT JOIN users us ON us.id=e.evaluator_id
     LEFT JOIN branches b ON b.id=e.branch_id ${where}
     ORDER BY e.created_at DESC LIMIT 300`, params
  );
  res.json(rows);
});

enquiryRouter.post("/", async (req: AuthedRequest, res) => {
  const b = req.body || {};
  const type = String(b.type || "TRADEIN").toUpperCase();
  if (!["TRADEIN", "TRADEOUT"].includes(type)) return res.status(400).json({ error: "type must be TRADEIN or TRADEOUT" });
  const chassis5 = (b.chassis_last5 || "").toString().slice(-5);
  const row = await one(
    `INSERT INTO enquiries
       (type,evaluator_id,branch_id,customer_name,mobile,address,pincode,maker,model,reg_year,
        chassis_last5,asking_price,price_given,status,remarks)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *`,
    [type, req.user!.id, req.user!.branch_id, b.customer_name || null, b.mobile || null,
     b.address || null, b.pincode || null, b.maker || null, b.model || null, b.reg_year || null,
     chassis5 || null, b.asking_price || null, b.price_given || null, b.status || "OPEN", b.remarks || null]
  );
  await audit(req.user!.id, "ENQUIRY", "enquiry", row.id);
  res.status(201).json(row);
});

enquiryRouter.patch("/:id", async (req: AuthedRequest, res) => {
  const b = req.body || {};
  const row = await one(
    `UPDATE enquiries SET status=COALESCE($2,status), price_given=COALESCE($3,price_given),
       remarks=COALESCE($4,remarks) WHERE id=$1 RETURNING *`,
    [req.params.id, b.status || null, b.price_given ?? null, b.remarks || null]
  );
  res.json(row);
});

// Quick counts for productivity widgets
enquiryRouter.get("/summary", async (req: AuthedRequest, res) => {
  const u = req.user!;
  const month = String(req.query.month || thisMonth());
  const params: any[] = [month];
  let scope = "";
  if (u.role !== "SUPER_ADMIN") { params.push(u.branch_id); scope = `AND branch_id=$${params.length}`; }
  const rows = await query(
    `SELECT type, status, count(*)::int AS n FROM enquiries
     WHERE to_char(created_at,'YYYY-MM')=$1 ${scope} GROUP BY type, status`, params
  );
  res.json(rows);
});
