import { useState } from "react";
import { api, INR } from "../api";
import { Field } from "../components/ui";

const FUELS = ["PETROL","DIESEL","CNG","HYBRID","ELECTRIC"];

export default function Valuation() {
  const [f, setF] = useState<any>({
    brand: "", model: "", variant: "", reg_year: new Date().getFullYear() - 5,
    kms: 50000, owners: 1, fuel_type: "PETROL",
    accident_history: "NONE", service_history: "FULL",
    tyre_condition: 7, exterior_condition: 7, interior_condition: 7,
    insurance_validity: "VALID", market_demand: "MEDIUM",
  });
  const [result, setResult] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState("");
  const set = (k: string) => (e: any) =>
    setF({ ...f, [k]: e.target.type === "number" || e.target.type === "range" ? Number(e.target.value) : e.target.value });

  async function evaluate() {
    setLoading(true); setSaved("");
    try {
      const { data } = await api.post("/evaluations/preview", f);
      setResult(data);
    } catch (e: any) { alert(e.response?.data?.error || "Evaluation failed"); }
    finally { setLoading(false); }
  }
  async function save() {
    await api.post("/evaluations", f);
    setSaved("✓ Evaluation saved. You can now raise a purchase proposal.");
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Standardized Valuation Engine</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">Uniform purchase &amp; retail pricing driven by the admin-configured model.</p>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <div className="card p-5 space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <Field label="Brand"><input className="input" value={f.brand} onChange={set("brand")} placeholder="MARUTI" /></Field>
            <Field label="Model"><input className="input" value={f.model} onChange={set("model")} placeholder="SWIFT" /></Field>
            <Field label="Variant"><input className="input" value={f.variant} onChange={set("variant")} placeholder="VXI" /></Field>
            <Field label="Reg Year"><input className="input" type="number" value={f.reg_year} onChange={set("reg_year")} /></Field>
            <Field label="KM Driven"><input className="input" type="number" value={f.kms} onChange={set("kms")} /></Field>
            <Field label="Owners"><input className="input" type="number" value={f.owners} onChange={set("owners")} /></Field>
            <Field label="Fuel">
              <select className="input" value={f.fuel_type} onChange={set("fuel_type")}>{FUELS.map((x) => <option key={x}>{x}</option>)}</select>
            </Field>
            <Field label="Accident">
              <select className="input" value={f.accident_history} onChange={set("accident_history")}>
                <option>NONE</option><option>MINOR</option><option>MAJOR</option></select>
            </Field>
            <Field label="Service">
              <select className="input" value={f.service_history} onChange={set("service_history")}>
                <option>FULL</option><option>PARTIAL</option><option>NONE</option></select>
            </Field>
            <Field label="Insurance">
              <select className="input" value={f.insurance_validity} onChange={set("insurance_validity")}>
                <option>VALID</option><option>EXPIRING</option><option>EXPIRED</option></select>
            </Field>
            <Field label="Market Demand">
              <select className="input" value={f.market_demand} onChange={set("market_demand")}>
                <option>HIGH</option><option>MEDIUM</option><option>LOW</option></select>
            </Field>
          </div>

          <div className="grid grid-cols-3 gap-3 pt-1">
            {[["tyre_condition","Tyre"],["exterior_condition","Exterior"],["interior_condition","Interior"]].map(([k, label]) => (
              <Field key={k} label={`${label}: ${f[k]}/10`}>
                <input type="range" min={1} max={10} value={f[k]} onChange={set(k)} className="w-full accent-prakash-red" />
              </Field>
            ))}
          </div>

          <button onClick={evaluate} disabled={loading || !f.brand || !f.model} className="btn btn-primary w-full mt-2">
            {loading ? "Calculating…" : "Calculate Valuation"}
          </button>
        </div>

        <div className="space-y-4">
          {!result ? (
            <div className="card p-8 text-center text-gray-400 text-sm">
              Enter vehicle details and calculate to see the standardized valuation.
            </div>
          ) : (
            <>
              <div className="card p-5">
                <div className="text-xs text-gray-400 uppercase">Suggested Purchase Price</div>
                <div className="text-3xl font-bold text-prakash-red mt-1">{INR(result.suggested_purchase)}</div>
                <div className="text-xs text-gray-400 mt-1">Condition Score: {result.condition_score}/100</div>
              </div>
              <div className="card p-5">
                <div className="text-xs text-gray-400 uppercase mb-2">Recommended Retail Band</div>
                <div className="flex justify-between items-end">
                  <div><div className="text-xs text-gray-400">Minimum</div><div className="font-semibold">{INR(result.retail_min)}</div></div>
                  <div className="text-center"><div className="text-xs text-gray-400">Recommended</div><div className="text-xl font-bold text-green-600">{INR(result.retail_recommended)}</div></div>
                  <div className="text-right"><div className="text-xs text-gray-400">Max Negotiation</div><div className="font-semibold">{INR(result.retail_max)}</div></div>
                </div>
              </div>
              <div className="card p-5">
                <div className="text-xs text-gray-400 uppercase mb-2">Calculation Breakdown</div>
                <div className="space-y-1 text-sm">
                  {Object.entries(result.breakdown).map(([k, v]) => (
                    <div key={k} className="flex justify-between">
                      <span className="text-gray-500 capitalize">{k.replace(/_/g, " ")}</span>
                      <span className="font-medium text-gray-800 dark:text-gray-200">
                        {typeof v === "number" && (k.includes("value") || k.includes("penalty")) ? INR(v) : String(v)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="flex gap-2 items-center">
                <button onClick={save} className="btn btn-ghost">Save Evaluation</button>
                {saved && <span className="text-sm text-green-600">{saved}</span>}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
