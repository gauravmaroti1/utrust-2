import { Router } from "express";
import multer from "multer";
import ExcelJS from "exceljs";
import { query, one } from "../db.js";
import { authenticate, authorize, audit, type AuthedRequest } from "../lib.js";

export const stockRouter = Router();
stockRouter.use(authenticate);

const upload = multer({ storage: multer.memoryStorage() });

// Helper: branch filter for non-super-admins
function scope(req: AuthedRequest) {
  const u = req.user!;
  if (u.role === "SUPER_ADMIN") return { where: "", params: [] as any[] };
  return { where: " AND v.branch_id = $B", params: [u.branch_id] };
}
function bind(sql: string, baseParamCount: number) {
  return sql.replace("$B", `$${baseParamCount + 1}`);
}

// ---- List with filters ----
stockRouter.get("/", async (req: AuthedRequest, res) => {
  const { status, branch_id, search } = req.query as any;
  const s = scope(req);
  const params: any[] = [];
  let sql = `SELECT v.*, b.name AS branch_name, u.name AS evaluator_name,
             (CURRENT_DATE - v.purchase_date) AS age_days
             FROM vehicles v
             LEFT JOIN branches b ON b.id=v.branch_id
             LEFT JOIN users u ON u.id=v.evaluator_id WHERE 1=1`;
  if (status) { params.push(status); sql += ` AND v.status=$${params.length}`; }
  if (branch_id) { params.push(branch_id); sql += ` AND v.branch_id=$${params.length}`; }
  if (search) {
    params.push(`%${search}%`);
    sql += ` AND (v.reg_no ILIKE $${params.length} OR v.make ILIKE $${params.length} OR v.model ILIKE $${params.length})`;
  }
  if (s.where) { sql += bind(s.where, params.length); params.push(...s.params); }
  sql += ` ORDER BY v.purchase_date ASC NULLS LAST`;
  res.json(await query(sql, params));
});

// ---- KPIs ----
stockRouter.get("/kpis", async (req: AuthedRequest, res) => {
  const s = scope(req);
  const params: any[] = [];
  let w = "WHERE status NOT IN ('SOLD','DELIVERED')";
  if (s.where) { w += s.where.replace(" AND v.branch_id", " AND branch_id"); params.push(...s.params.length ? s.params : []); }
  // rebind $B
  if (s.params.length) { w = w.replace("$B", "$1"); }

  const rows = await query(
    `SELECT
       COUNT(*)::int AS total_stock,
       COALESCE(SUM(purchase_cost),0)::numeric AS stock_value,
       COALESCE(AVG(CURRENT_DATE - purchase_date),0)::numeric AS avg_age,
       COUNT(*) FILTER (WHERE (CURRENT_DATE - purchase_date) > 30)::int AS over30,
       COUNT(*) FILTER (WHERE (CURRENT_DATE - purchase_date) > 60)::int AS over60,
       COUNT(*) FILTER (WHERE (CURRENT_DATE - purchase_date) > 90)::int AS over90,
       COUNT(*) FILTER (WHERE (CURRENT_DATE - purchase_date) > 120)::int AS over120,
       COUNT(*) FILTER (WHERE (CURRENT_DATE - purchase_date) > 90)::int AS dead_stock
     FROM vehicles v ${w}`,
    params
  );
  const byBranch = await query(
    `SELECT b.name AS branch, COUNT(*)::int AS count, COALESCE(SUM(v.purchase_cost),0)::numeric AS value
     FROM vehicles v JOIN branches b ON b.id=v.branch_id
     WHERE v.status NOT IN ('SOLD','DELIVERED') ${s.where ? bind(s.where, 0) : ""}
     GROUP BY b.name ORDER BY count DESC`,
    s.params
  );
  const byStatus = await query(
    `SELECT status, COUNT(*)::int AS count FROM vehicles v
     WHERE 1=1 ${s.where ? bind(s.where, 0) : ""} GROUP BY status`,
    s.params
  );
  res.json({ ...rows[0], by_branch: byBranch, by_status: byStatus });
});

// ---- Single vehicle + history ----
stockRouter.get("/:id", async (req, res) => {
  const v = await one(
    `SELECT v.*, b.name AS branch_name, u.name AS evaluator_name,
            (CURRENT_DATE - v.purchase_date) AS age_days
     FROM vehicles v LEFT JOIN branches b ON b.id=v.branch_id
     LEFT JOIN users u ON u.id=v.evaluator_id WHERE v.id=$1`,
    [req.params.id]
  );
  if (!v) return res.status(404).json({ error: "Vehicle not found" });
  const refurb = await query(
    `SELECT * FROM refurbishments WHERE vehicle_id=$1 ORDER BY created_at`,
    [req.params.id]
  );
  const history = await query(
    `SELECT action, detail, created_at FROM audit_log
     WHERE entity='vehicle' AND entity_id=$1 ORDER BY created_at DESC LIMIT 30`,
    [req.params.id]
  );
  res.json({ ...v, refurbishments: refurb, history });
});

// ---- Create ----
stockRouter.post("/", async (req: AuthedRequest, res) => {
  const b = req.body || {};
  const branch = req.user!.role === "SUPER_ADMIN" ? b.branch_id : req.user!.branch_id;
  const v = await one(
    `INSERT INTO vehicles
     (reg_no,make,model,variant,fuel_type,transmission,mfg_year,odometer,color,owners,
      purchase_date,purchase_cost,selling_price,insurance_valid_to,insurance_status,
      branch_id,evaluator_id,status,location_note)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19) RETURNING *`,
    [b.reg_no, b.make, b.model, b.variant, b.fuel_type, b.transmission, b.mfg_year,
     b.odometer, b.color, b.owners || 1, b.purchase_date || new Date(), b.purchase_cost || 0,
     b.selling_price || 0, b.insurance_valid_to || null, b.insurance_status || null,
     branch, b.evaluator_id || req.user!.id, b.status || "IN_STOCK", b.location_note || null]
  );
  await audit(req.user!.id, "CREATE", "vehicle", v.id, { reg_no: v.reg_no });
  res.status(201).json(v);
});

// ---- Update ----
stockRouter.patch("/:id", async (req: AuthedRequest, res) => {
  const b = req.body || {};
  const fields = ["reg_no","make","model","variant","fuel_type","transmission","mfg_year",
    "odometer","color","owners","purchase_cost","selling_price","insurance_valid_to",
    "insurance_status","status","location_note","evaluator_id","sold_price","sold_date"];
  const sets: string[] = [];
  const params: any[] = [req.params.id];
  for (const f of fields) {
    if (b[f] !== undefined) { params.push(b[f]); sets.push(`${f}=$${params.length}`); }
  }
  if (!sets.length) return res.status(400).json({ error: "No fields to update" });
  sets.push(`updated_at=now()`);
  const v = await one(
    `UPDATE vehicles SET ${sets.join(",")} WHERE id=$1 RETURNING *`, params
  );
  await audit(req.user!.id, "UPDATE", "vehicle", Number(req.params.id), b);
  res.json(v);
});

// ---- Quick status change (with sold handling) ----
stockRouter.post("/:id/status", async (req: AuthedRequest, res) => {
  const { status, sold_price } = req.body || {};
  const extra = status === "SOLD" || status === "DELIVERED"
    ? `, sold_date=CURRENT_DATE, sold_price=COALESCE($3, sold_price)` : "";
  const params: any[] = [req.params.id, status];
  if (extra) params.push(sold_price || null);
  const v = await one(
    `UPDATE vehicles SET status=$2 ${extra}, updated_at=now() WHERE id=$1 RETURNING *`,
    params
  );
  await audit(req.user!.id, "STATUS", "vehicle", Number(req.params.id), { status });
  res.json(v);
});

// ---- Excel export ----
stockRouter.get("/export/xlsx", async (req: AuthedRequest, res) => {
  const s = scope(req);
  const rows = await query(
    `SELECT v.reg_no,v.make,v.model,v.variant,v.mfg_year,v.color,v.odometer,v.owners,
            v.fuel_type,v.purchase_cost,v.selling_price,v.status,b.name AS branch,
            (CURRENT_DATE - v.purchase_date) AS age_days
     FROM vehicles v LEFT JOIN branches b ON b.id=v.branch_id
     WHERE 1=1 ${s.where ? bind(s.where, 0) : ""} ORDER BY b.name, v.purchase_date`,
    s.params
  );
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Stock");
  ws.columns = [
    { header: "Reg No", key: "reg_no", width: 14 },
    { header: "Make", key: "make", width: 12 },
    { header: "Model", key: "model", width: 16 },
    { header: "Variant", key: "variant", width: 12 },
    { header: "Year", key: "mfg_year", width: 8 },
    { header: "Color", key: "color", width: 14 },
    { header: "Odometer", key: "odometer", width: 10 },
    { header: "Owners", key: "owners", width: 8 },
    { header: "Fuel", key: "fuel_type", width: 10 },
    { header: "Purchase Cost", key: "purchase_cost", width: 14 },
    { header: "Selling Price", key: "selling_price", width: 14 },
    { header: "Status", key: "status", width: 18 },
    { header: "Branch", key: "branch", width: 12 },
    { header: "Age (days)", key: "age_days", width: 10 },
  ];
  ws.getRow(1).font = { bold: true };
  rows.forEach((r) => ws.addRow(r));
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", "attachment; filename=utrust-stock.xlsx");
  await wb.xlsx.write(res);
  res.end();
});

// ---- Excel import ----
stockRouter.post("/import/xlsx", authorize("SUPER_ADMIN", "BRANCH_MANAGER"),
  upload.single("file"), async (req: AuthedRequest, res) => {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(req.file.buffer as any);
    const ws = wb.worksheets[0];
    const branches = await query(`SELECT id,code,name FROM branches`);
    const branchByName: Record<string, number> = {};
    branches.forEach((b: any) => {
      branchByName[b.name.toUpperCase()] = b.id;
      branchByName[b.code.toUpperCase()] = b.id;
    });
    // detect header row
    let headerRow = 1;
    ws.eachRow((row, i) => {
      const vals = (row.values as any[]).map((v) => String(v || "").toUpperCase());
      if (vals.some((v) => v.includes("REG")) && vals.some((v) => v.includes("MAKE")))
        headerRow = i;
    });
    const headers: Record<number, string> = {};
    (ws.getRow(headerRow).values as any[]).forEach((v, i) => {
      headers[i] = String(v || "").trim().toUpperCase();
    });
    const colOf = (...names: string[]) => {
      for (const [idx, name] of Object.entries(headers))
        if (names.some((n) => name.includes(n))) return Number(idx);
      return -1;
    };
    const c = {
      reg: colOf("REG"), make: colOf("MAKE"), model: colOf("MODEL"),
      variant: colOf("GRADE", "VARIANT"), year: colOf("YEAR"), color: colOf("COLOR"),
      odo: colOf("ODOMETER", "KILOMET", "KM"), owners: colOf("OWNER"),
      fuel: colOf("FUEL"), pc: colOf("PURCHASE"), sp: colOf("SELLING"),
      branch: colOf("LOCATION", "BRANCH"), status: colOf("STATUS"),
    };
    let inserted = 0;
    const errors: string[] = [];
    for (let i = headerRow + 1; i <= ws.rowCount; i++) {
      const row = ws.getRow(i);
      const get = (idx: number) => (idx > 0 ? row.getCell(idx).value : null);
      const make = String(get(c.make) || "").trim();
      const model = String(get(c.model) || "").trim();
      if (!make || !model) continue;
      const branchTxt = String(get(c.branch) || "").toUpperCase();
      let branchId = req.user!.role === "SUPER_ADMIN" ? null : req.user!.branch_id;
      for (const [name, id] of Object.entries(branchByName))
        if (branchTxt.includes(name)) branchId = id;
      try {
        await query(
          `INSERT INTO vehicles
           (reg_no,make,model,variant,mfg_year,color,odometer,owners,fuel_type,
            purchase_cost,selling_price,branch_id,evaluator_id,status,purchase_date)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,CURRENT_DATE)`,
          [
            String(get(c.reg) || "").trim(), make, model,
            String(get(c.variant) || "").trim(), Number(get(c.year)) || null,
            String(get(c.color) || "").trim(), Number(get(c.odo)) || 0,
            Number(get(c.owners)) || 1, String(get(c.fuel) || "").trim().toUpperCase(),
            Number(String(get(c.pc) || "0").replace(/[^0-9.]/g, "")) || 0,
            Number(String(get(c.sp) || "0").replace(/[^0-9.]/g, "")) || 0,
            branchId, req.user!.id, "IN_STOCK",
          ]
        );
        inserted++;
      } catch (e: any) {
        errors.push(`Row ${i}: ${e.message}`);
      }
    }
    await audit(req.user!.id, "IMPORT", "vehicle", null, { inserted });
    res.json({ inserted, errors });
  });
