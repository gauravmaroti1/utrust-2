import { Router } from "express";
import PDFDocument from "pdfkit";
import { query, one } from "../db.js";
import { authenticate, audit, type AuthedRequest } from "../lib.js";
import { evaluateBlend, DEFAULT_CONFIG, type ValuationConfig } from "../valuation.js";
import { saveDataUrls, resolveUploadPath } from "../storage.js";

async function getConfig(): Promise<ValuationConfig> {
  const row = await one(`SELECT data FROM valuation_config WHERE id=1`);
  return (row?.data as ValuationConfig) || DEFAULT_CONFIG;
}
const INR = (n: any) => "Rs " + Math.round(Number(n) || 0).toLocaleString("en-IN");

/* ============================= CATALOG ============================= */
export const catalogRouter = Router();
catalogRouter.use(authenticate);

catalogRouter.get("/makes", async (_req, res) => {
  const rows = await query(`SELECT DISTINCT make FROM vehicle_catalog ORDER BY make`);
  res.json(rows.map((r: any) => r.make));
});

catalogRouter.get("/models", async (req, res) => {
  const make = String(req.query.make || "");
  const rows = await query(
    `SELECT id, model, body, segment, fuels, year_from, year_to
     FROM vehicle_catalog WHERE make=$1 ORDER BY model`, [make]
  );
  res.json(rows);
});

catalogRouter.get("/", async (req, res) => {
  const search = String(req.query.search || "").trim();
  if (search) {
    const rows = await query(
      `SELECT * FROM vehicle_catalog
       WHERE make ILIKE $1 OR model ILIKE $1 ORDER BY make, model LIMIT 100`,
      [`%${search}%`]
    );
    return res.json(rows);
  }
  const rows = await query(`SELECT * FROM vehicle_catalog ORDER BY make, model`);
  res.json(rows);
});

// Manual add (any evaluator+). Keeps the catalog open-ended.
catalogRouter.post("/", async (req: AuthedRequest, res) => {
  const b = req.body || {};
  if (!b.make || !b.model) return res.status(400).json({ error: "make and model required" });
  const row = await one(
    `INSERT INTO vehicle_catalog(make,model,body,segment,fuels,year_from,year_to,source)
     VALUES ($1,$2,$3,$4,$5,$6,$7,'MANUAL')
     ON CONFLICT (make,model) DO UPDATE SET body=EXCLUDED.body, segment=EXCLUDED.segment,
       fuels=EXCLUDED.fuels RETURNING *`,
    [String(b.make).toUpperCase(), b.model, b.body || null, b.segment || null,
     Array.isArray(b.fuels) ? b.fuels.join(",") : (b.fuels || null), b.year_from || null, b.year_to || null]
  );
  res.status(201).json(row);
});

/* ===================== VALUATION (IDV blend) ===================== */
export const valuationRouter = Router();
valuationRouter.use(authenticate);

// Live preview, no save
valuationRouter.post("/preview", async (req, res) => {
  const cfg = await getConfig();
  res.json(evaluateBlend(req.body, cfg));
});

/**
 * Photo condition analysis via Claude vision.
 * Requires ANTHROPIC_API_KEY in the environment (the dealer's own key).
 * Body: { photos: [{ name, dataUrl }], context?: {make,model,reg_year} }
 * Returns a structured condition assessment incl. overall_condition_score 0-100.
 */
valuationRouter.post("/analyze-photos", async (req: AuthedRequest, res) => {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    return res.status(503).json({
      error: "AI photo scoring not configured",
      detail: "Set ANTHROPIC_API_KEY in Railway to enable AI condition scoring. You can still score manually.",
    });
  }
  const photos: { name: string; dataUrl: string }[] = (req.body?.photos || []).slice(0, 8);
  if (!photos.length) return res.status(400).json({ error: "No photos provided" });
  const ctx = req.body?.context || {};

  const imageBlocks = photos.map((p) => {
    const m = /^data:(image\/[a-zA-Z+]+);base64,(.*)$/.exec(p.dataUrl || "");
    const media = m ? m[1] : "image/jpeg";
    const data = m ? m[2] : (p.dataUrl || "").replace(/^data:.*;base64,/, "");
    return { type: "image", source: { type: "base64", media_type: media, data } };
  });

  const prompt = `You are a senior used-car inspector at an Indian dealership. Assess the vehicle in these photos` +
    (ctx.make ? ` (${ctx.make} ${ctx.model || ""} ${ctx.reg_year || ""})` : "") +
    `. Judge visible condition only. Respond with ONLY a JSON object, no markdown, no preamble, in this exact shape:
{
  "overall_condition_score": <integer 0-100>,
  "exterior_score": <0-100>,
  "interior_score": <0-100>,
  "tyre_score": <0-100>,
  "visible_damage": [<short strings>],
  "observations": [<short strings>],
  "recommended_refurb": [{"item": <string>, "est_cost_inr": <integer>}],
  "summary": <one-sentence string>
}
Scoring guide: 90-100 showroom/excellent, 75-89 good, 60-74 average with wear, 40-59 below average needing work, <40 poor. Be realistic and specific to what you can see.`;

  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: process.env.VISION_MODEL || "claude-sonnet-4-6",
        max_tokens: 1024,
        messages: [{ role: "user", content: [...imageBlocks, { type: "text", text: prompt }] }],
      }),
    });
    if (!r.ok) {
      const t = await r.text();
      return res.status(502).json({ error: "Vision API error", detail: t.slice(0, 300) });
    }
    const data: any = await r.json();
    const text = (data.content || []).filter((c: any) => c.type === "text").map((c: any) => c.text).join("\n");
    const clean = text.replace(/```json|```/g, "").trim();
    let parsed: any;
    try { parsed = JSON.parse(clean); }
    catch { return res.status(502).json({ error: "Could not parse AI response", raw: clean.slice(0, 300) }); }
    res.json(parsed);
  } catch (e: any) {
    res.status(502).json({ error: "Vision request failed", detail: (e as Error).message });
  }
});

// Save a full valuation (blend result + photos + AI assessment)
valuationRouter.post("/", async (req: AuthedRequest, res) => {
  const b = req.body || {};
  const cfg = await getConfig();
  const result = evaluateBlend(b, cfg);
  // Persist photos to the volume; store only URLs in the DB.
  const storedPhotos = saveDataUrls(b.photos, "eval");
  const e = await one(
    `INSERT INTO evaluations
     (vehicle_id,evaluator_id,branch_id,brand,model,variant,reg_year,kms,owners,fuel_type,
      accident_history,service_history,tyre_condition,exterior_condition,interior_condition,
      insurance_validity,market_demand,idv,demand_level,condition_score,base_value,market_value,
      suggested_purchase,retail_min,retail_recommended,retail_max,basis,breakdown,warnings,
      ai_assessment,photos,customer_name,reg_no,chassis_no)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,
      $24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34) RETURNING id`,
    [b.vehicle_id || null, req.user!.id, req.user!.branch_id, b.brand, b.model, b.variant,
     b.reg_year, b.kms, b.owners, b.fuel_type, b.accident_history, b.service_history,
     b.tyre_condition, b.exterior_condition, b.interior_condition, b.insurance_validity,
     b.market_demand, b.idv || null, result.demand_level, result.condition_score, result.base_value,
     result.market_value, result.suggested_purchase, result.retail_min, result.retail_recommended,
     result.retail_max, result.basis, JSON.stringify(result.breakdown), JSON.stringify(result.warnings),
     b.ai_assessment ? JSON.stringify(b.ai_assessment) : null,
     JSON.stringify(storedPhotos), b.customer_name || null, b.reg_no || null, b.chassis_no || null]
  );
  await audit(req.user!.id, "VALUATE", "evaluation", e.id);
  res.status(201).json({ id: e.id, ...result });
});

valuationRouter.get("/", async (req: AuthedRequest, res) => {
  const u = req.user!;
  const scoped = u.role === "SUPER_ADMIN" ? "" : `WHERE e.branch_id = ${Number(u.branch_id) || 0}`;
  const rows = await query(
    `SELECT e.id,e.brand,e.model,e.variant,e.reg_year,e.reg_no,e.customer_name,e.idv,
            e.condition_score,e.market_value,e.suggested_purchase,e.basis,e.chassis_no,e.created_at,
            u.name AS evaluator_name, b.name AS branch_name
     FROM evaluations e LEFT JOIN users u ON u.id=e.evaluator_id
     LEFT JOIN branches b ON b.id=e.branch_id ${scoped}
     ORDER BY e.created_at DESC LIMIT 100`
  );
  res.json(rows);
});

valuationRouter.get("/:id", async (req, res) => {
  const e = await one(
    `SELECT e.*, u.name AS evaluator_name, b.name AS branch_name
     FROM evaluations e LEFT JOIN users u ON u.id=e.evaluator_id
     LEFT JOIN branches b ON b.id=e.branch_id WHERE e.id=$1`, [req.params.id]
  );
  if (!e) return res.status(404).json({ error: "Not found" });
  res.json(e);
});

// Branded valuation report PDF (details + photos + quoted purchase price)
valuationRouter.get("/:id/pdf", async (req, res) => {
  const e = await one(
    `SELECT e.*, u.name AS evaluator_name, b.name AS branch_name
     FROM evaluations e LEFT JOIN users u ON u.id=e.evaluator_id
     LEFT JOIN branches b ON b.id=e.branch_id WHERE e.id=$1`, [req.params.id]
  );
  if (!e) return res.status(404).json({ error: "Not found" });

  const doc = new PDFDocument({ size: "A4", margin: 40 });
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename="valuation-${e.id}.pdf"`);
  doc.pipe(res);

  const RED = "#C8102E", INK = "#1f2937", GREY = "#6b7280";
  const W = doc.page.width - 80;

  // Header
  doc.rect(40, 40, W, 56).fill(RED);
  doc.fill("#fff").fontSize(20).font("Helvetica-Bold").text("PRAKASH AUTO HUB", 54, 54);
  doc.fontSize(10).font("Helvetica").text("U TRUST 2.0  -  Vehicle Valuation Report", 54, 78);
  doc.fontSize(9).fillColor("#fff").text(`Report #${e.id}`, 40, 58, { width: W - 14, align: "right" });
  doc.fontSize(9).text(new Date(e.created_at).toLocaleDateString("en-IN"), 40, 72, { width: W - 14, align: "right" });
  doc.moveDown(2);

  let y = 112;
  const veh = `${e.brand || ""} ${e.model || ""} ${e.variant || ""}`.trim();
  doc.fillColor(INK).font("Helvetica-Bold").fontSize(15).text(veh || "Vehicle", 40, y);
  y += 22;
  if (e.reg_no) { doc.fillColor(GREY).font("Helvetica").fontSize(10).text(`Reg: ${e.reg_no}`, 40, y); }
  if (e.customer_name) { doc.fillColor(GREY).fontSize(10).text(`Customer: ${e.customer_name}`, 200, y); }
  y += 22;

  // Spec grid
  const spec: [string, any][] = [
    ["Mfg / Reg Year", e.reg_year], ["Odometer", `${Number(e.kms || 0).toLocaleString("en-IN")} km`],
    ["Owners", e.owners], ["Fuel", e.fuel_type], ["Chassis No", e.chassis_no || "-"], ["Insurance IDV", e.idv ? INR(e.idv) : "-"],
    ["Insurance", e.insurance_validity || "-"], ["Accident", e.accident_history || "-"],
    ["Service", e.service_history || "-"], ["Demand", e.demand_level || "-"],
  ];
  doc.fontSize(9.5);
  const colW = W / 3;
  spec.forEach(([k, v], i) => {
    const col = i % 3, row = Math.floor(i / 3);
    const x = 40 + col * colW, yy = y + row * 30;
    doc.fillColor(GREY).font("Helvetica").text(String(k), x, yy);
    doc.fillColor(INK).font("Helvetica-Bold").text(String(v ?? "-"), x, yy + 12);
  });
  y += Math.ceil(spec.length / 3) * 30 + 8;

  // Condition + AI summary
  doc.moveTo(40, y).lineTo(40 + W, y).strokeColor("#e5e7eb").stroke();
  y += 12;
  doc.fillColor(INK).font("Helvetica-Bold").fontSize(11).text(`Condition Score: ${e.condition_score ?? "-"} / 100`, 40, y);
  y += 18;
  const ai = e.ai_assessment || null;
  if (ai && ai.summary) {
    doc.fillColor(GREY).font("Helvetica").fontSize(9.5).text(`AI inspection: ${ai.summary}`, 40, y, { width: W });
    y += doc.heightOfString(`AI inspection: ${ai.summary}`, { width: W }) + 4;
    if (Array.isArray(ai.visible_damage) && ai.visible_damage.length) {
      doc.fillColor(GREY).text("Visible: " + ai.visible_damage.join("; "), 40, y, { width: W });
      y += doc.heightOfString("Visible: " + ai.visible_damage.join("; "), { width: W }) + 6;
    }
  }

  // Valuation box
  doc.roundedRect(40, y, W, 70, 6).fill("#fbeaec");
  doc.fillColor(RED).font("Helvetica-Bold").fontSize(11).text("SUGGESTED PURCHASE PRICE", 54, y + 12);
  doc.fontSize(24).text(INR(e.suggested_purchase), 54, y + 28);
  doc.fillColor(INK).font("Helvetica").fontSize(9).text("Est. Market / Resale", 54 + W / 2, y + 14);
  doc.font("Helvetica-Bold").fontSize(13).text(INR(e.market_value), 54 + W / 2, y + 28);
  doc.font("Helvetica").fontSize(8).fillColor(GREY).text(`Basis: ${e.basis || "-"}`, 54 + W / 2, y + 48);
  y += 84;

  // Warnings
  const warns: string[] = Array.isArray(e.warnings) ? e.warnings : [];
  if (warns.length) {
    doc.fillColor("#b45309").font("Helvetica-Oblique").fontSize(8.5);
    warns.forEach((wn) => { doc.text("! " + wn, 40, y, { width: W }); y += doc.heightOfString("! " + wn, { width: W }) + 2; });
    y += 4;
  }

  // Photos grid (downscaled data URLs)
  const photos: any[] = Array.isArray(e.photos) ? e.photos : [];
  if (photos.length) {
    if (y > doc.page.height - 200) { doc.addPage(); y = 50; }
    doc.fillColor(INK).font("Helvetica-Bold").fontSize(11).text("Inspection Photos", 40, y);
    y += 18;
    const pw = (W - 16) / 3, ph = pw * 0.72;
    photos.slice(0, 9).forEach((p, i) => {
      const col = i % 3, row = Math.floor(i / 3);
      const x = 40 + col * (pw + 8), yy = y + row * (ph + 8);
      if (yy + ph > doc.page.height - 50) return;
      try {
        const disk = resolveUploadPath((p as any).url || "");
        if (disk) {
          doc.image(disk, x, yy, { width: pw, height: ph, fit: [pw, ph], align: "center" });
        } else if ((p as any).dataUrl) {
          const b64 = ((p as any).dataUrl || "").replace(/^data:.*;base64,/, "");
          doc.image(Buffer.from(b64, "base64"), x, yy, { width: pw, height: ph, fit: [pw, ph], align: "center" });
        }
        doc.rect(x, yy, pw, ph).strokeColor("#e5e7eb").stroke();
      } catch { /* skip bad image */ }
    });
    y += Math.ceil(Math.min(photos.length, 9) / 3) * (ph + 8);
  }

  // Footer
  const fy = doc.page.height - 46;
  doc.moveTo(40, fy).lineTo(40 + W, fy).strokeColor("#e5e7eb").stroke();
  doc.fillColor(GREY).font("Helvetica").fontSize(8)
    .text(`Evaluated by ${e.evaluator_name || "-"} (${e.branch_name || "-"})  -  Prakash Auto Hub  -  This is an internal valuation estimate, not a binding offer.`,
      40, fy + 6, { width: W, align: "center" });

  doc.end();
});
