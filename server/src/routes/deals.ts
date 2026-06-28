import { Router } from "express";
import PDFDocument from "pdfkit";
import { query, one } from "../db.js";
import { authenticate, authorize, audit, type AuthedRequest } from "../lib.js";
import { evaluate, DEFAULT_CONFIG, type ValuationConfig } from "../valuation.js";

async function getConfig(): Promise<ValuationConfig> {
  const row = await one(`SELECT data FROM valuation_config WHERE id=1`);
  return (row?.data as ValuationConfig) || DEFAULT_CONFIG;
}

// ===================== EVALUATIONS =====================
export const evalRouter = Router();
evalRouter.use(authenticate);

// Run the valuation engine (preview, no save)
evalRouter.post("/preview", async (req, res) => {
  const cfg = await getConfig();
  res.json(evaluate(req.body, cfg));
});

// Save an evaluation (optionally linked to a vehicle)
evalRouter.post("/", async (req: AuthedRequest, res) => {
  const b = req.body || {};
  const cfg = await getConfig();
  const result = evaluate(b, cfg);
  const e = await one(
    `INSERT INTO evaluations
     (vehicle_id,evaluator_id,branch_id,brand,model,variant,reg_year,kms,owners,fuel_type,
      accident_history,service_history,tyre_condition,exterior_condition,interior_condition,
      insurance_validity,market_demand,condition_score,base_value,suggested_purchase,
      retail_min,retail_recommended,retail_max,breakdown)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24)
     RETURNING *`,
    [b.vehicle_id || null, req.user!.id, req.user!.branch_id, b.brand, b.model, b.variant,
     b.reg_year, b.kms, b.owners, b.fuel_type, b.accident_history, b.service_history,
     b.tyre_condition, b.exterior_condition, b.interior_condition, b.insurance_validity,
     b.market_demand, result.condition_score, result.base_value, result.suggested_purchase,
     result.retail_min, result.retail_recommended, result.retail_max,
     JSON.stringify(result.breakdown)]
  );
  await audit(req.user!.id, "EVALUATE", "evaluation", e.id);
  res.status(201).json(e);
});

evalRouter.get("/", async (req: AuthedRequest, res) => {
  const u = req.user!;
  const params: any[] = [];
  let where = "";
  if (u.role !== "SUPER_ADMIN") { params.push(u.branch_id); where = `WHERE e.branch_id=$1`; }
  res.json(await query(
    `SELECT e.*, us.name AS evaluator_name FROM evaluations e
     LEFT JOIN users us ON us.id=e.evaluator_id ${where}
     ORDER BY e.created_at DESC LIMIT 100`, params));
});

// ===================== PROPOSALS (approval workflow) =====================
export const proposalRouter = Router();
proposalRouter.use(authenticate);

proposalRouter.post("/", async (req: AuthedRequest, res) => {
  const b = req.body || {};
  const refurb = Number(b.refurb_estimate) || 0;
  const purchase = Number(b.proposed_purchase) || 0;
  const resale = Number(b.expected_resale) || 0;
  const margin = resale - purchase - refurb;
  const roi = purchase + refurb > 0 ? (margin / (purchase + refurb)) * 100 : 0;
  const type = String(b.type || "PURCHASE").toUpperCase() === "SALE" ? "SALE" : "PURCHASE";
  const p = await one(
    `INSERT INTO proposals
     (vehicle_id,evaluation_id,evaluator_id,branch_id,proposed_purchase,refurb_estimate,
      expected_resale,gross_margin,roi_pct,status,type,customer_name,customer_mobile,
      customer_address,customer_pincode)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'PENDING_MANAGER',$10,$11,$12,$13,$14) RETURNING *`,
    [b.vehicle_id || null, b.evaluation_id || null, req.user!.id, req.user!.branch_id,
     purchase, refurb, resale, margin, Math.round(roi * 100) / 100, type,
     b.customer_name || null, b.customer_mobile || null, b.customer_address || null,
     b.customer_pincode || null]
  );
  await audit(req.user!.id, "PROPOSE", "proposal", p.id);
  res.status(201).json(p);
});

proposalRouter.get("/", async (req: AuthedRequest, res) => {
  const u = req.user!;
  const params: any[] = [];
  let where = "WHERE 1=1";
  if (u.role !== "SUPER_ADMIN") { params.push(u.branch_id); where += ` AND p.branch_id=$${params.length}`; }
  if (u.role === "EVALUATOR") { params.push(u.id); where += ` AND p.evaluator_id=$${params.length}`; }
  if (req.query.type) { params.push(String(req.query.type).toUpperCase()); where += ` AND p.type=$${params.length}`; }
  res.json(await query(
    `SELECT p.*, us.name AS evaluator_name, b.name AS branch_name,
            COALESCE(v.reg_no, ev.reg_no) AS reg_no,
            COALESCE(v.make, ev.brand) AS make,
            COALESCE(v.model, ev.model) AS model,
            COALESCE(v.mfg_year, ev.reg_year) AS year,
            COALESCE(v.chassis_no, ev.chassis_no) AS chassis_no
     FROM proposals p
     LEFT JOIN users us ON us.id=p.evaluator_id
     LEFT JOIN vehicles v ON v.id=p.vehicle_id
     LEFT JOIN evaluations ev ON ev.id=p.evaluation_id
     LEFT JOIN branches b ON b.id=p.branch_id ${where}
     ORDER BY p.created_at DESC`, params));
});

// Manager decision: APPROVE -> PENDING_ADMIN, REJECT -> REJECTED
proposalRouter.post("/:id/manager", authorize("BRANCH_MANAGER", "SUPER_ADMIN"),
  async (req: AuthedRequest, res) => {
    const { decision, note } = req.body || {};
    const status = decision === "APPROVE" ? "PENDING_ADMIN" : "REJECTED";
    const p = await one(
      `UPDATE proposals SET status=$2, manager_id=$3, manager_note=$4, updated_at=now()
       WHERE id=$1 RETURNING *`,
      [req.params.id, status, req.user!.id, note || null]
    );
    await audit(req.user!.id, "MANAGER_" + decision, "proposal", Number(req.params.id));
    res.json(p);
  });

// Super admin final decision
proposalRouter.post("/:id/admin", authorize("SUPER_ADMIN"),
  async (req: AuthedRequest, res) => {
    const { decision, note } = req.body || {};
    const status = decision === "APPROVE" ? "APPROVED" : "REJECTED";
    const p = await one(
      `UPDATE proposals SET status=$2, admin_id=$3, admin_note=$4, updated_at=now()
       WHERE id=$1 RETURNING *`,
      [req.params.id, status, req.user!.id, note || null]
    );
    // On final approval, move vehicle to PURCHASED
    if (status === "APPROVED" && p?.vehicle_id) {
      await query(`UPDATE vehicles SET status='PURCHASED' WHERE id=$1`, [p.vehicle_id]);
    }
    await audit(req.user!.id, "ADMIN_" + decision, "proposal", Number(req.params.id));
    res.json(p);
  });

// ===================== REFURBISHMENT =====================
export const refurbRouter = Router();
refurbRouter.use(authenticate);

refurbRouter.post("/", async (req: AuthedRequest, res) => {
  const b = req.body || {};
  const r = await one(
    `INSERT INTO refurbishments(vehicle_id,category,description,amount,added_by)
     VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [b.vehicle_id, b.category, b.description || "", Number(b.amount) || 0, req.user!.id]
  );
  // bump vehicle status if currently in stock
  await query(
    `UPDATE vehicles SET status='UNDER_REFURBISHMENT'
     WHERE id=$1 AND status IN ('IN_STOCK','PURCHASED')`, [b.vehicle_id]);
  await audit(req.user!.id, "REFURB_ADD", "vehicle", b.vehicle_id, { amount: b.amount });
  res.status(201).json(r);
});

refurbRouter.get("/vehicle/:vehicleId", async (req, res) => {
  const lines = await query(
    `SELECT r.*, u.name AS added_by_name FROM refurbishments r
     LEFT JOIN users u ON u.id=r.added_by WHERE vehicle_id=$1 ORDER BY created_at`,
    [req.params.vehicleId]);
  const v = await one(`SELECT purchase_cost, sold_price, selling_price FROM vehicles WHERE id=$1`,
    [req.params.vehicleId]);
  const refurbTotal = lines.reduce((s: number, l: any) => s + Number(l.amount), 0);
  const finalCost = Number(v?.purchase_cost || 0) + refurbTotal;
  const sale = Number(v?.sold_price || v?.selling_price || 0);
  res.json({
    lines, refurb_total: refurbTotal, purchase_cost: Number(v?.purchase_cost || 0),
    final_cost: finalCost, sale_price: sale,
    profit: sale ? sale - finalCost : null,
    roi_pct: finalCost > 0 && sale ? Math.round(((sale - finalCost) / finalCost) * 10000) / 100 : null,
  });
});

// ===================== QUOTATIONS =====================
export const quoteRouter = Router();
quoteRouter.use(authenticate);

quoteRouter.post("/", async (req: AuthedRequest, res) => {
  const b = req.body || {};
  const q = await one(
    `INSERT INTO quotations
     (vehicle_id,created_by,branch_id,customer_name,customer_phone,asking_price,
      negotiated_price,insurance_details,warranty_details,notes)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
    [b.vehicle_id, req.user!.id, req.user!.branch_id, b.customer_name, b.customer_phone,
     b.asking_price, b.negotiated_price, b.insurance_details, b.warranty_details, b.notes]
  );
  await audit(req.user!.id, "QUOTE", "quotation", q.id);
  res.status(201).json(q);
});

quoteRouter.get("/", async (req: AuthedRequest, res) => {
  const u = req.user!;
  const params: any[] = [];
  let where = "WHERE 1=1";
  if (u.role !== "SUPER_ADMIN") { params.push(u.branch_id); where += ` AND q.branch_id=$${params.length}`; }
  res.json(await query(
    `SELECT q.*, v.reg_no, v.make, v.model, v.variant, v.mfg_year, v.color, v.odometer,
            us.name AS created_by_name
     FROM quotations q LEFT JOIN vehicles v ON v.id=q.vehicle_id
     LEFT JOIN users us ON us.id=q.created_by ${where} ORDER BY q.created_at DESC`, params));
});

// WhatsApp share text
quoteRouter.get("/:id/whatsapp", async (req, res) => {
  const q = await one(
    `SELECT q.*, v.reg_no,v.make,v.model,v.variant,v.mfg_year,v.color,v.odometer,v.fuel_type
     FROM quotations q LEFT JOIN vehicles v ON v.id=q.vehicle_id WHERE q.id=$1`,
    [req.params.id]);
  if (!q) return res.status(404).json({ error: "Not found" });
  const fmt = (n: any) => "₹" + Number(n || 0).toLocaleString("en-IN");
  const text =
`*PRAKASH AUTO HUB — U TRUST Certified Pre-Owned*

🚗 *${q.make} ${q.model} ${q.variant || ""}* (${q.mfg_year})
• Reg No: ${q.reg_no}
• Colour: ${q.color}
• Odometer: ${Number(q.odometer).toLocaleString("en-IN")} km
• Fuel: ${q.fuel_type}

💰 *Asking Price:* ${fmt(q.asking_price)}
🤝 *Offer Price:* ${fmt(q.negotiated_price || q.asking_price)}

🛡️ ${q.warranty_details || "U TRUST Assured Warranty available"}
📄 ${q.insurance_details || "Insurance transfer assistance provided"}

${q.notes || ""}

For booking, contact Prakash Auto Hub.`;
  res.json({ text, wa_link: `https://wa.me/?text=${encodeURIComponent(text)}` });
});

// PDF quotation with branding
quoteRouter.get("/:id/pdf", async (req, res) => {
  const q = await one(
    `SELECT q.*, v.reg_no,v.make,v.model,v.variant,v.mfg_year,v.color,v.odometer,
            v.fuel_type,v.transmission,v.owners, b.name AS branch_name, us.name AS exec_name
     FROM quotations q LEFT JOIN vehicles v ON v.id=q.vehicle_id
     LEFT JOIN branches b ON b.id=q.branch_id LEFT JOIN users us ON us.id=q.created_by
     WHERE q.id=$1`, [req.params.id]);
  if (!q) return res.status(404).json({ error: "Not found" });
  const fmt = (n: any) => "Rs. " + Number(n || 0).toLocaleString("en-IN");

  const doc = new PDFDocument({ size: "A4", margin: 50 });
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename=quotation-${q.id}.pdf`);
  doc.pipe(res);

  // Header band
  doc.rect(0, 0, doc.page.width, 90).fill("#C8102E");
  doc.fillColor("#fff").fontSize(22).font("Helvetica-Bold")
    .text("PRAKASH AUTO HUB", 50, 28);
  doc.fontSize(11).font("Helvetica")
    .text("U TRUST — Certified Pre-Owned Vehicles", 50, 56);
  doc.fontSize(9).text(`${q.branch_name || ""} Branch`, 50, 70);
  doc.fillColor("#000");

  doc.moveDown(4);
  doc.fontSize(16).font("Helvetica-Bold")
    .text("SALES QUOTATION", 50, 120);
  doc.fontSize(9).font("Helvetica").fillColor("#666")
    .text(`Quotation #${q.id}  |  Date: ${new Date(q.created_at).toLocaleDateString("en-IN")}`, 50, 142);
  doc.fillColor("#000");

  // Customer
  doc.fontSize(11).font("Helvetica-Bold").text("Customer", 50, 170);
  doc.font("Helvetica").fontSize(10)
    .text(`${q.customer_name || "-"}    ${q.customer_phone || ""}`, 50, 188);

  // Vehicle box
  let y = 220;
  doc.font("Helvetica-Bold").fontSize(13)
    .text(`${q.make} ${q.model} ${q.variant || ""} (${q.mfg_year})`, 50, y);
  y += 24;
  const rows: [string, string][] = [
    ["Registration No", q.reg_no || "-"],
    ["Colour", q.color || "-"],
    ["Odometer", `${Number(q.odometer || 0).toLocaleString("en-IN")} km`],
    ["Fuel / Transmission", `${q.fuel_type || "-"} / ${q.transmission || "-"}`],
    ["Ownership", `${q.owners || 1} owner`],
  ];
  doc.fontSize(10).font("Helvetica");
  rows.forEach(([k, v]) => {
    doc.fillColor("#666").text(k, 50, y, { width: 180 });
    doc.fillColor("#000").text(v, 240, y);
    y += 18;
  });

  // Pricing box
  y += 14;
  doc.rect(50, y, doc.page.width - 100, 70).fill("#F4F4F4");
  doc.fillColor("#000").font("Helvetica-Bold").fontSize(11);
  doc.text("Asking Price", 65, y + 14);
  doc.text(fmt(q.asking_price), 350, y + 14, { align: "right", width: 130 });
  doc.fillColor("#C8102E").fontSize(14);
  doc.text("Offer Price", 65, y + 40);
  doc.text(fmt(q.negotiated_price || q.asking_price), 350, y + 40, { align: "right", width: 130 });
  doc.fillColor("#000");

  // Terms
  y += 95;
  doc.font("Helvetica-Bold").fontSize(10).text("Warranty & Insurance", 50, y);
  doc.font("Helvetica").fontSize(9).fillColor("#444")
    .text(q.warranty_details || "U TRUST Assured Warranty available on request.", 50, y + 16)
    .text(q.insurance_details || "Insurance transfer assistance provided.", 50, y + 30);
  y += 56;
  doc.font("Helvetica-Bold").fontSize(10).fillColor("#000").text("Terms & Conditions", 50, y);
  doc.font("Helvetica").fontSize(8).fillColor("#666")
    .text("• Prices are valid for 7 days from the date of quotation. • Vehicle sold subject to availability. " +
      "• RTO transfer and processing charges extra as applicable. • This is a computer-generated quotation.",
      50, y + 14, { width: doc.page.width - 100 });

  doc.fontSize(8).fillColor("#999")
    .text(`Prepared by ${q.exec_name || "Sales Team"} — Prakash Auto Hub`, 50, doc.page.height - 60);

  doc.end();
});

// ===================== RESERVATIONS =====================
export const reserveRouter = Router();
reserveRouter.use(authenticate);
reserveRouter.post("/", async (req: AuthedRequest, res) => {
  const b = req.body || {};
  const r = await one(
    `INSERT INTO reservations(vehicle_id,customer_name,customer_phone,reserved_by,reserved_until)
     VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [b.vehicle_id, b.customer_name, b.customer_phone, req.user!.id, b.reserved_until || null]);
  await query(`UPDATE vehicles SET status='RESERVED' WHERE id=$1`, [b.vehicle_id]);
  await audit(req.user!.id, "RESERVE", "vehicle", b.vehicle_id);
  res.status(201).json(r);
});
