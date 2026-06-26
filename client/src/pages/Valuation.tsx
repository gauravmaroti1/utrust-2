import { useEffect, useRef, useState } from "react";
import { api, INR } from "../api";
import { Field } from "../components/ui";

const FUELS = ["PETROL", "DIESEL", "CNG", "HYBRID", "ELECTRIC"];
const YEARS = Array.from({ length: 17 }, (_, i) => new Date().getFullYear() - i);

// Downscale an image file to a compact JPEG data URL (keeps DB rows small).
function fileToDataUrl(file: File, max = 1100, quality = 0.7): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * scale);
      c.height = Math.round(img.height * scale);
      const ctx = c.getContext("2d")!;
      ctx.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL("image/jpeg", quality));
    };
    img.onerror = reject;
    img.src = url;
  });
}

export default function Valuation() {
  const [makes, setMakes] = useState<string[]>([]);
  const [models, setModels] = useState<any[]>([]);
  const [manual, setManual] = useState(false);

  const [f, setF] = useState<any>({
    brand: "", model: "", variant: "", reg_no: "", customer_name: "",
    reg_year: new Date().getFullYear() - 5, kms: 50000, owners: 1, fuel_type: "PETROL",
    idv: "", accident_history: "NONE", service_history: "FULL",
    insurance_validity: "VALID", demand_level: "MEDIUM",
    tyre_condition: 7, exterior_condition: 7, interior_condition: 7,
  });
  const [photos, setPhotos] = useState<{ name: string; dataUrl: string }[]>([]);
  const [ai, setAi] = useState<any | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [aiError, setAiError] = useState("");
  const [result, setResult] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);
  const [savedId, setSavedId] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const set = (k: string) => (e: any) =>
    setF({ ...f, [k]: e.target.type === "number" || e.target.type === "range" ? Number(e.target.value) : e.target.value });

  useEffect(() => { api.get("/catalog/makes").then((r) => setMakes(r.data)); }, []);
  useEffect(() => {
    if (f.brand && !manual) api.get("/catalog/models", { params: { make: f.brand } }).then((r) => setModels(r.data));
  }, [f.brand, manual]);

  async function addPhotos(files: FileList) {
    const arr: { name: string; dataUrl: string }[] = [];
    for (const file of Array.from(files).slice(0, 8 - photos.length)) {
      arr.push({ name: file.name, dataUrl: await fileToDataUrl(file) });
    }
    setPhotos([...photos, ...arr].slice(0, 8));
  }

  async function analyze() {
    if (!photos.length) return;
    setAnalyzing(true); setAiError(""); setAi(null);
    try {
      const { data } = await api.post("/valuation/analyze-photos", {
        photos, context: { make: f.brand, model: f.model, reg_year: f.reg_year },
      });
      setAi(data);
      if (typeof data.overall_condition_score === "number")
        setF((p: any) => ({ ...p, condition_score: data.overall_condition_score }));
    } catch (e: any) {
      setAiError(e.response?.data?.detail || e.response?.data?.error || "AI analysis failed");
    } finally { setAnalyzing(false); }
  }

  function payload() {
    const p: any = { ...f, idv: f.idv ? Number(f.idv) : undefined, photos };
    if (ai) { p.condition_score = ai.overall_condition_score; p.ai_assessment = ai; }
    return p;
  }

  async function preview() {
    setLoading(true); setSavedId(null);
    try { const { data } = await api.post("/valuation/preview", payload()); setResult(data); }
    catch (e: any) { alert(e.response?.data?.error || "Failed"); }
    finally { setLoading(false); }
  }

  async function save() {
    const { data } = await api.post("/valuation", payload());
    setSavedId(data.id); setResult(data);
  }

  async function downloadPdf() {
    if (!savedId) return;
    const res = await api.get(`/valuation/${savedId}/pdf`, { responseType: "blob" });
    const url = URL.createObjectURL(res.data);
    const a = document.createElement("a"); a.href = url; a.download = `valuation-${savedId}.pdf`; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Vehicle Valuation</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          IDV-anchored pricing, blended with AI photo condition and local demand.
        </p>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* ---------------- INPUTS ---------------- */}
        <div className="space-y-4">
          <div className="card p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-gray-900 dark:text-white">Vehicle</h3>
              <label className="text-xs text-gray-500 flex items-center gap-1 cursor-pointer">
                <input type="checkbox" checked={manual} onChange={(e) => setManual(e.target.checked)} /> Manual entry
              </label>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {manual ? (
                <>
                  <Field label="Make"><input className="input" value={f.brand} onChange={set("brand")} placeholder="MAKE" /></Field>
                  <Field label="Model"><input className="input" value={f.model} onChange={set("model")} placeholder="Model" /></Field>
                </>
              ) : (
                <>
                  <Field label="Make">
                    <select className="input" value={f.brand} onChange={(e) => setF({ ...f, brand: e.target.value, model: "" })}>
                      <option value="">Select…</option>
                      {makes.map((m) => <option key={m}>{m}</option>)}
                    </select>
                  </Field>
                  <Field label="Model">
                    <select className="input" value={f.model} onChange={(e) => {
                      const m = models.find((x) => x.model === e.target.value);
                      setF({ ...f, model: e.target.value, fuel_type: m?.fuels?.split(",")[0] || f.fuel_type });
                    }}>
                      <option value="">Select…</option>
                      {models.map((m) => <option key={m.id} value={m.model}>{m.model}</option>)}
                    </select>
                  </Field>
                </>
              )}
              <Field label="Variant"><input className="input" value={f.variant} onChange={set("variant")} placeholder="VXI" /></Field>
              <Field label="Reg No"><input className="input" value={f.reg_no} onChange={set("reg_no")} placeholder="BR11…" /></Field>
              <Field label="Customer"><input className="input" value={f.customer_name} onChange={set("customer_name")} /></Field>
              <Field label="Reg Year">
                <select className="input" value={f.reg_year} onChange={set("reg_year")}>
                  {YEARS.map((y) => <option key={y}>{y}</option>)}
                </select>
              </Field>
              <Field label="KM Driven"><input className="input" type="number" value={f.kms} onChange={set("kms")} /></Field>
              <Field label="Owners"><input className="input" type="number" value={f.owners} onChange={set("owners")} /></Field>
              <Field label="Fuel">
                <select className="input" value={f.fuel_type} onChange={set("fuel_type")}>{FUELS.map((x) => <option key={x}>{x}</option>)}</select>
              </Field>
            </div>
          </div>

          <div className="card p-5 space-y-3">
            <h3 className="font-semibold text-gray-900 dark:text-white">Insurance &amp; Market</h3>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <Field label="Insurance IDV ₹">
                <input className="input" type="number" value={f.idv} onChange={set("idv")} placeholder="e.g. 520000" />
              </Field>
              <Field label="Insurance">
                <select className="input" value={f.insurance_validity} onChange={set("insurance_validity")}>
                  <option>VALID</option><option>EXPIRING</option><option>EXPIRED</option></select>
              </Field>
              <Field label="Local Demand">
                <select className="input" value={f.demand_level} onChange={set("demand_level")}>
                  <option>HIGH</option><option>MEDIUM</option><option>LOW</option></select>
              </Field>
              <Field label="Accident">
                <select className="input" value={f.accident_history} onChange={set("accident_history")}>
                  <option>NONE</option><option>MINOR</option><option>MAJOR</option></select>
              </Field>
              <Field label="Service">
                <select className="input" value={f.service_history} onChange={set("service_history")}>
                  <option>FULL</option><option>PARTIAL</option><option>NONE</option></select>
              </Field>
            </div>
            <p className="text-xs text-gray-400">Tip: IDV from the policy is the price anchor. Without it, the engine falls back to model benchmark + ageing.</p>
          </div>

          {/* ---------------- PHOTOS + AI ---------------- */}
          <div className="card p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-gray-900 dark:text-white">Condition &amp; Photos</h3>
              <button onClick={() => fileRef.current?.click()} className="btn btn-ghost text-sm" disabled={photos.length >= 8}>
                + Add Photos ({photos.length}/8)
              </button>
              <input ref={fileRef} type="file" accept="image/*" multiple hidden
                onChange={(e) => e.target.files && addPhotos(e.target.files)} />
            </div>

            {photos.length > 0 && (
              <div className="grid grid-cols-4 gap-2">
                {photos.map((p, i) => (
                  <div key={i} className="relative group">
                    <img src={p.dataUrl} className="w-full h-20 object-cover rounded-lg border border-gray-200 dark:border-gray-700" />
                    <button onClick={() => setPhotos(photos.filter((_, j) => j !== i))}
                      className="absolute -top-1 -right-1 bg-prakash-red text-white rounded-full w-5 h-5 text-xs opacity-0 group-hover:opacity-100">×</button>
                  </div>
                ))}
              </div>
            )}

            {photos.length > 0 && (
              <button onClick={analyze} disabled={analyzing} className="btn btn-primary w-full">
                {analyzing ? "Analyzing photos…" : "🔍 Analyze Condition with AI"}
              </button>
            )}
            {aiError && (
              <div className="text-xs text-amber-600 bg-amber-50 dark:bg-amber-900/20 rounded-lg p-2">
                {aiError} — scoring manually below instead.
              </div>
            )}
            {ai && (
              <div className="bg-gray-50 dark:bg-gray-900/40 rounded-lg p-3 text-sm space-y-1">
                <div className="flex justify-between font-medium">
                  <span>AI Condition Score</span>
                  <span className="text-prakash-red">{ai.overall_condition_score}/100</span>
                </div>
                <div className="flex gap-3 text-xs text-gray-500">
                  <span>Ext {ai.exterior_score}</span><span>Int {ai.interior_score}</span><span>Tyre {ai.tyre_score}</span>
                </div>
                {ai.summary && <p className="text-xs text-gray-600 dark:text-gray-300">{ai.summary}</p>}
                {ai.visible_damage?.length > 0 && (
                  <p className="text-xs text-gray-500">Damage: {ai.visible_damage.join("; ")}</p>
                )}
                {ai.recommended_refurb?.length > 0 && (
                  <p className="text-xs text-gray-500">
                    Refurb est: {ai.recommended_refurb.map((x: any) => `${x.item} (${INR(x.est_cost_inr)})`).join(", ")}
                  </p>
                )}
              </div>
            )}

            {!ai && (
              <div className="grid grid-cols-3 gap-3 pt-1">
                {[["tyre_condition", "Tyre"], ["exterior_condition", "Exterior"], ["interior_condition", "Interior"]].map(([k, label]) => (
                  <Field key={k} label={`${label}: ${f[k]}/10`}>
                    <input type="range" min={1} max={10} value={f[k]} onChange={set(k)} className="w-full accent-prakash-red" />
                  </Field>
                ))}
              </div>
            )}
          </div>

          <button onClick={preview} disabled={loading || !f.brand || !f.model} className="btn btn-primary w-full">
            {loading ? "Calculating…" : "Calculate Valuation"}
          </button>
        </div>

        {/* ---------------- RESULT ---------------- */}
        <div className="space-y-4 lg:sticky lg:top-4 self-start">
          {!result ? (
            <div className="card p-8 text-center text-gray-400 text-sm">
              Fill in the vehicle, IDV and condition, then calculate to see the valuation.
            </div>
          ) : (
            <>
              <div className="card p-5">
                <div className="text-xs text-gray-400 uppercase">Suggested Purchase Price</div>
                <div className="text-3xl font-bold text-prakash-red mt-1">{INR(result.suggested_purchase)}</div>
                <div className="text-xs text-gray-400 mt-1">{result.basis}</div>
              </div>

              <div className="card p-5">
                <div className="text-xs text-gray-400 uppercase mb-2">Estimated Market / Resale Band</div>
                <div className="flex justify-between items-end">
                  <div><div className="text-xs text-gray-400">Min</div><div className="font-semibold">{INR(result.retail_min)}</div></div>
                  <div className="text-center"><div className="text-xs text-gray-400">Market</div><div className="text-xl font-bold text-green-600">{INR(result.market_value)}</div></div>
                  <div className="text-right"><div className="text-xs text-gray-400">Max</div><div className="font-semibold">{INR(result.retail_max)}</div></div>
                </div>
              </div>

              {result.warnings?.length > 0 && (
                <div className="card p-4 bg-amber-50 dark:bg-amber-900/20 border-amber-200">
                  {result.warnings.map((w: string, i: number) => (
                    <p key={i} className="text-xs text-amber-700 dark:text-amber-400">⚠ {w}</p>
                  ))}
                </div>
              )}

              <div className="card p-5">
                <div className="text-xs text-gray-400 uppercase mb-2">Breakdown</div>
                <div className="space-y-1 text-sm">
                  {Object.entries(result.breakdown).map(([k, v]) => (
                    <div key={k} className="flex justify-between">
                      <span className="text-gray-500 capitalize">{k.replace(/_/g, " ")}</span>
                      <span className="font-medium text-gray-800 dark:text-gray-200">
                        {typeof v === "number" && (k.includes("value") || k.includes("penalty") || k === "idv") ? INR(v) : String(v)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex gap-2">
                {!savedId ? (
                  <button onClick={save} className="btn btn-primary flex-1">Save Valuation</button>
                ) : (
                  <>
                    <span className="text-sm text-green-600 self-center flex-1">✓ Saved #{savedId}</span>
                    <button onClick={downloadPdf} className="btn btn-primary">⬇ Download Report PDF</button>
                  </>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
