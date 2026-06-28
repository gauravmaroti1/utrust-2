import { useEffect, useState } from "react";
import { api, INR, useAuth, can } from "../api";
import { Modal, Spinner, StatusBadge, Field } from "../components/ui";

export default function Proposals() {
  const { user } = useAuth();
  const [rows, setRows] = useState<any[]>([]);
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [evaluations, setEvaluations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState<null | "PURCHASE" | "SALE">(null);
  const [tab, setTab] = useState<"ALL" | "PURCHASE" | "SALE">("ALL");

  const canCreate = ["EVALUATOR", "SALES_EXECUTIVE", "SUPER_ADMIN", "BRANCH_MANAGER"].includes(user?.role || "");

  function load() {
    setLoading(true);
    const q = tab === "ALL" ? "" : `?type=${tab}`;
    api.get(`/proposals${q}`).then((r) => setRows(r.data)).finally(() => setLoading(false));
  }
  useEffect(() => { load(); }, [tab]);
  useEffect(() => {
    api.get("/stock").then((r) => setVehicles(r.data));
    api.get("/valuation").then((r) => setEvaluations(r.data));
  }, []);

  async function decide(p: any, level: "manager" | "admin", decision: "APPROVE" | "REJECT") {
    const note = decision === "REJECT" ? prompt("Reason for rejection (optional):") || "" : "";
    await api.post(`/proposals/${p.id}/${level}`, { decision, note });
    load();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Proposals</h1>
        {canCreate && (
          <div className="flex gap-2">
            <button onClick={() => setCreating("PURCHASE")} className="btn btn-primary">+ Purchase Proposal</button>
            <button onClick={() => setCreating("SALE")} className="btn btn-ghost border border-prakash-red text-prakash-red">+ Sale Proposal</button>
          </div>
        )}
      </div>

      <div className="flex gap-1">
        {(["ALL", "PURCHASE", "SALE"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-3 py-1.5 rounded-lg text-sm ${tab === t ? "bg-prakash-red text-white" : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300"}`}>
            {t === "ALL" ? "All" : t === "PURCHASE" ? "Purchase" : "Sale"}
          </button>
        ))}
      </div>

      {loading ? <Spinner /> : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-gray-400 border-b border-gray-100 dark:border-gray-700">
              <th className="p-3">Type</th><th>Vehicle</th><th>Chassis</th><th>Customer</th><th>Branch</th>
              <th>Purchase</th><th>Resale</th><th>Margin</th><th>ROI%</th><th>Status</th><th>Action</th>
            </tr></thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id} className="border-b border-gray-50 dark:border-gray-700/50">
                  <td className="p-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${p.type === "SALE" ? "bg-blue-100 text-blue-700" : "bg-emerald-100 text-emerald-700"}`}>{p.type || "PURCHASE"}</span>
                  </td>
                  <td className="font-medium text-gray-900 dark:text-white">
                    {p.make ? `${p.make} ${p.model}` : `#${p.id}`}
                    {p.year && <span className="text-gray-400 font-normal"> {p.year}</span>}
                  </td>
                  <td className="text-gray-500">{p.chassis_no ? `…${String(p.chassis_no).slice(-5)}` : "—"}</td>
                  <td className="text-gray-500">{p.customer_name || "—"}{p.customer_mobile ? <div className="text-xs text-gray-400">{p.customer_mobile}</div> : null}</td>
                  <td className="text-gray-500">{p.branch_name}</td>
                  <td>{INR(p.proposed_purchase)}</td>
                  <td>{INR(p.expected_resale)}</td>
                  <td className={Number(p.gross_margin) >= 0 ? "text-green-600" : "text-red-600"}>{INR(p.gross_margin)}</td>
                  <td className="font-medium">{p.roi_pct}%</td>
                  <td><StatusBadge status={p.status} /></td>
                  <td>
                    <div className="flex gap-1">
                      {p.status === "PENDING_MANAGER" && can.approveManager(user?.role) && (
                        <>
                          <button onClick={() => decide(p, "manager", "APPROVE")} className="text-green-600 text-xs hover:underline">Approve</button>
                          <button onClick={() => decide(p, "manager", "REJECT")} className="text-red-500 text-xs hover:underline">Reject</button>
                        </>
                      )}
                      {p.status === "PENDING_ADMIN" && can.approveAdmin(user?.role) && (
                        <>
                          <button onClick={() => decide(p, "admin", "APPROVE")} className="text-green-600 text-xs hover:underline">Final Approve</button>
                          <button onClick={() => decide(p, "admin", "REJECT")} className="text-red-500 text-xs hover:underline">Reject</button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={11} className="p-6 text-center text-gray-400">No proposals yet.</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {creating && (
        <CreateProposal type={creating} vehicles={vehicles} evaluations={evaluations}
          onClose={() => setCreating(null)} onSaved={() => { setCreating(null); load(); }} />
      )}
    </div>
  );
}

function CreateProposal({ type, vehicles, evaluations, onClose, onSaved }: any) {
  const isPurchase = type === "PURCHASE";
  const [f, setF] = useState<any>({
    type, source_id: "", proposed_purchase: "", refurb_estimate: "", expected_resale: "",
    customer_name: "", customer_mobile: "", customer_address: "", customer_pincode: "",
  });
  const [saving, setSaving] = useState(false);
  const set = (k: string) => (e: any) => setF({ ...f, [k]: e.target.value });

  // When a source is picked, prefill the vehicle + price fields.
  function pickSource(id: string) {
    if (isPurchase) {
      const e = evaluations.find((x: any) => String(x.id) === id);
      setF((p: any) => ({
        ...p, source_id: id, evaluation_id: id, vehicle_id: "",
        proposed_purchase: e?.suggested_purchase || "", expected_resale: e?.market_value || "",
        customer_name: e?.customer_name || p.customer_name,
        _label: e ? `${e.brand} ${e.model} ${e.reg_year} · …${String(e.chassis_no || "").slice(-5)}` : "",
      }));
    } else {
      const v = vehicles.find((x: any) => String(x.id) === id);
      setF((p: any) => ({
        ...p, source_id: id, vehicle_id: id, evaluation_id: "",
        proposed_purchase: v?.purchase_cost || "", expected_resale: v?.selling_price || "",
        _label: v ? `${v.make} ${v.model} ${v.mfg_year} · ${v.reg_no || ""}` : "",
      }));
    }
  }

  const purchase = Number(f.proposed_purchase) || 0;
  const refurb = Number(f.refurb_estimate) || 0;
  const resale = Number(f.expected_resale) || 0;
  const margin = resale - purchase - refurb;
  const roi = purchase + refurb > 0 ? ((margin / (purchase + refurb)) * 100).toFixed(1) : "0";

  async function save() {
    setSaving(true);
    try { await api.post("/proposals", f); onSaved(); }
    catch (e: any) { alert(e.response?.data?.error || "Failed"); }
    finally { setSaving(false); }
  }

  const sourceList = isPurchase ? evaluations : vehicles.filter((v: any) => ["IN_STOCK", "REFURBISHING", "READY"].includes(v.status));

  return (
    <Modal open onClose={onClose} title={isPurchase ? "New Purchase Proposal" : "New Sale Proposal"} wide>
      <Field label={isPurchase ? "Evaluated Vehicle (from valuation list)" : "Stock Vehicle (in-stock / purchased)"}>
        <select className="input" value={f.source_id} onChange={(e) => pickSource(e.target.value)}>
          <option value="">— Select —</option>
          {sourceList.map((s: any) => (
            <option key={s.id} value={s.id}>
              {isPurchase
                ? `${s.brand} ${s.model} ${s.reg_year || ""} · ${s.chassis_no ? "…" + String(s.chassis_no).slice(-5) : "no chassis"} · ${INR(s.suggested_purchase)}`
                : `${s.make} ${s.model} ${s.mfg_year || ""} · ${s.reg_no || "no reg"}`}
            </option>
          ))}
        </select>
      </Field>
      {f._label && <p className="text-xs text-gray-500 mt-1">Selected: {f._label}</p>}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
        <Field label="Customer Name"><input className="input" value={f.customer_name} onChange={set("customer_name")} /></Field>
        <Field label="Mobile"><input className="input" value={f.customer_mobile} onChange={set("customer_mobile")} /></Field>
        <Field label="Address"><input className="input" value={f.customer_address} onChange={set("customer_address")} /></Field>
        <Field label="Pincode"><input className="input" value={f.customer_pincode} onChange={set("customer_pincode")} /></Field>
      </div>

      <div className="grid grid-cols-3 gap-3 mt-3">
        <Field label={isPurchase ? "Proposed Purchase ₹" : "Cost / Purchase ₹"}><input className="input" type="number" value={f.proposed_purchase} onChange={set("proposed_purchase")} /></Field>
        <Field label="Refurb Estimate ₹"><input className="input" type="number" value={f.refurb_estimate} onChange={set("refurb_estimate")} /></Field>
        <Field label={isPurchase ? "Expected Resale ₹" : "Sale Price ₹"}><input className="input" type="number" value={f.expected_resale} onChange={set("expected_resale")} /></Field>
      </div>

      <div className="grid grid-cols-2 gap-3 mt-4 bg-gray-50 dark:bg-gray-900/40 rounded-lg p-3">
        <div className="flex justify-between text-sm"><span className="text-gray-500">Gross Margin</span><span className={`font-bold ${margin >= 0 ? "text-green-600" : "text-red-600"}`}>{INR(margin)}</span></div>
        <div className="flex justify-between text-sm"><span className="text-gray-500">ROI</span><span className="font-bold text-gray-900 dark:text-white">{roi}%</span></div>
      </div>

      <div className="flex justify-end gap-2 mt-5">
        <button onClick={onClose} className="btn btn-ghost">Cancel</button>
        <button onClick={save} disabled={saving || !purchase} className="btn btn-primary">{saving ? "Submitting…" : "Submit for Approval"}</button>
      </div>
    </Modal>
  );
}
