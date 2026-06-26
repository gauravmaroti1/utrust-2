import { useEffect, useState } from "react";
import { api } from "../api";
import { Spinner, Field } from "../components/ui";

export default function Config() {
  const [cfg, setCfg] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    api.get("/valuation-config").then((r) => setCfg(r.data)).finally(() => setLoading(false));
  }, []);

  async function save() {
    setSaving(true); setMsg("");
    try { await api.put("/valuation-config", cfg); setMsg("✓ Configuration saved"); }
    catch (e: any) { setMsg(e.response?.data?.error || "Save failed"); }
    finally { setSaving(false); }
  }

  if (loading) return <Spinner />;
  if (!cfg) return null;

  const num = (k: string) => (e: any) => setCfg({ ...cfg, [k]: Number(e.target.value) });
  const mapField = (group: string, key: string) => (e: any) =>
    setCfg({ ...cfg, [group]: { ...cfg[group], [key]: Number(e.target.value) } });

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Valuation Configuration</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">Tune the standardized pricing model. Changes apply to all future valuations.</p>
        </div>
        <div className="flex items-center gap-3">
          {msg && <span className="text-sm text-green-600">{msg}</span>}
          <button onClick={save} disabled={saving} className="btn btn-primary">{saving ? "Saving…" : "Save Configuration"}</button>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-5">
        <div className="card p-5">
          <h3 className="font-semibold mb-3 text-gray-900 dark:text-white">Core Parameters</h3>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Annual Depreciation (fraction)"><input className="input" type="number" step="0.01" value={cfg.annual_depreciation} onChange={num("annual_depreciation")} /></Field>
            <Field label="Min Value Floor (fraction)"><input className="input" type="number" step="0.01" value={cfg.min_value_floor_pct} onChange={num("min_value_floor_pct")} /></Field>
            <Field label="Expected KM / Year"><input className="input" type="number" value={cfg.expected_km_per_year} onChange={num("expected_km_per_year")} /></Field>
            <Field label="₹ Penalty / Excess KM"><input className="input" type="number" step="0.1" value={cfg.km_penalty_per_excess_km} onChange={num("km_penalty_per_excess_km")} /></Field>
            <Field label="Target Gross Margin (fraction)"><input className="input" type="number" step="0.01" value={cfg.target_gross_margin} onChange={num("target_gross_margin")} /></Field>
            <Field label="Refurb Buffer (fraction)"><input className="input" type="number" step="0.01" value={cfg.refurb_buffer_pct} onChange={num("refurb_buffer_pct")} /></Field>
            <Field label="Negotiation Spread (fraction)"><input className="input" type="number" step="0.01" value={cfg.negotiation_spread} onChange={num("negotiation_spread")} /></Field>
          </div>
        </div>

        <div className="card p-5">
          <h3 className="font-semibold mb-3 text-gray-900 dark:text-white">Condition Weights</h3>
          <div className="grid grid-cols-3 gap-3">
            {["tyre", "exterior", "interior"].map((k) => (
              <Field key={k} label={k[0].toUpperCase() + k.slice(1)}>
                <input className="input" type="number" step="0.05" value={cfg.condition_weights?.[k]} onChange={mapField("condition_weights", k)} />
              </Field>
            ))}
          </div>
          <p className="text-xs text-gray-400 mt-2">Weights should sum to 1.0 across the three condition inputs.</p>
        </div>
      </div>

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
        <AdjustGroup title="Owner Penalty" group="owner_penalty" cfg={cfg} onChange={mapField} />
        <AdjustGroup title="Fuel Adjustment" group="fuel_adjust" cfg={cfg} onChange={mapField} />
        <AdjustGroup title="Demand Adjustment" group="demand_adjust" cfg={cfg} onChange={mapField} />
        <AdjustGroup title="Insurance Adjustment" group="insurance_adjust" cfg={cfg} onChange={mapField} />
        <AdjustGroup title="Accident Adjustment" group="accident_adjust" cfg={cfg} onChange={mapField} />
        <AdjustGroup title="Service Adjustment" group="service_adjust" cfg={cfg} onChange={mapField} />
      </div>

      <div className="card p-5">
        <h3 className="font-semibold mb-3 text-gray-900 dark:text-white">Model Benchmark Values (₹)</h3>
        <p className="text-xs text-gray-400 mb-3">Reference ex-stock value per model; used as the depreciation base when no explicit value is supplied.</p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2 max-h-80 overflow-y-auto pr-1">
          {Object.entries(cfg.benchmarks || {}).map(([model, val]) => (
            <div key={model} className="flex items-center gap-2">
              <span className="text-xs text-gray-500 flex-1 truncate" title={model}>{model}</span>
              <input className="input max-w-[110px] py-1 text-xs" type="number" value={val as number}
                onChange={(e) => setCfg({ ...cfg, benchmarks: { ...cfg.benchmarks, [model]: Number(e.target.value) } })} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function AdjustGroup({ title, group, cfg, onChange }: any) {
  const data = cfg[group] || {};
  return (
    <div className="card p-5">
      <h3 className="font-semibold mb-3 text-gray-900 dark:text-white text-sm">{title}</h3>
      <div className="space-y-2">
        {Object.entries(data).map(([k, v]) => (
          <div key={k} className="flex items-center gap-2">
            <span className="text-xs text-gray-500 flex-1">{k}</span>
            <input className="input max-w-[100px] py-1 text-xs" type="number" step="0.01" value={v as number} onChange={onChange(group, k)} />
          </div>
        ))}
      </div>
    </div>
  );
}
