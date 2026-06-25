import { useEffect, useState } from "react";
import { api, INR, useAuth, can } from "../api";
import { Modal, Spinner, StatusBadge, Field } from "../components/ui";

export default function Proposals() {
  const { user } = useAuth();
  const [rows, setRows] = useState<any[]>([]);
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  const canCreate = ["EVALUATOR","SUPER_ADMIN"].includes(user?.role || "");

  function load() {
    setLoading(true);
    api.get("/proposals").then((r) => setRows(r.data)).finally(() => setLoading(false));
  }
  useEffect(() => {
    load();
    api.get("/stock").then((r) => setVehicles(r.data));
  }, []);

  async function decide(p: any, level: "manager" | "admin", decision: "APPROVE" | "REJECT") {
    const note = decision === "REJECT" ? prompt("Reason for rejection (optional):") || "" : "";
    await api.post(`/proposals/${p.id}/${level}`, { decision, note });
    load();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Purchase Proposals</h1>
        {canCreate && <button onClick={() => setCreating(true)} className="btn btn-primary">+ New Proposal</button>}
      </div>

      {loading ? <Spinner /> : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-gray-400 border-b border-gray-100 dark:border-gray-700">
              <th className="p-3">Vehicle</th><th>Evaluator</th><th>Branch</th><th>Purchase</th>
              <th>Refurb</th><th>Resale</th><th>Margin</th><th>ROI%</th><th>Status</th><th>Action</th>
            </tr></thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id} className="border-b border-gray-50 dark:border-gray-700/50">
                  <td className="p-3 font-medium text-gray-900 dark:text-white">
                    {p.make ? `${p.make} ${p.model}` : `Proposal #${p.id}`}
                    {p.reg_no && <span className="text-gray-400 font-normal"> · {p.reg_no}</span>}
                  </td>
                  <td className="text-gray-500">{p.evaluator_name}</td>
                  <td className="text-gray-500">{p.branch_name}</td>
                  <td>{INR(p.proposed_purchase)}</td>
                  <td className="text-gray-500">{INR(p.refurb_estimate)}</td>
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
              {rows.length === 0 && <tr><td colSpan={10} className="p-6 text-center text-gray-400">No proposals yet.</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {creating && <CreateProposal vehicles={vehicles} onClose={() => setCreating(false)} onSaved={() => { setCreating(false); load(); }} />}
    </div>
  );
}

function CreateProposal({ vehicles, onClose, onSaved }: any) {
  const [f, setF] = useState<any>({ vehicle_id: "", proposed_purchase: "", refurb_estimate: "", expected_resale: "" });
  const [saving, setSaving] = useState(false);
  const set = (k: string) => (e: any) => setF({ ...f, [k]: e.target.value });

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

  return (
    <Modal open onClose={onClose} title="New Purchase Proposal" wide>
      <Field label="Vehicle (optional — link existing stock)">
        <select className="input" value={f.vehicle_id} onChange={set("vehicle_id")}>
          <option value="">— Not linked / new acquisition —</option>
          {vehicles.map((v: any) => <option key={v.id} value={v.id}>{v.make} {v.model} {v.variant} · {v.reg_no}</option>)}
        </select>
      </Field>
      <div className="grid grid-cols-3 gap-3 mt-3">
        <Field label="Proposed Purchase ₹"><input className="input" type="number" value={f.proposed_purchase} onChange={set("proposed_purchase")} /></Field>
        <Field label="Refurb Estimate ₹"><input className="input" type="number" value={f.refurb_estimate} onChange={set("refurb_estimate")} /></Field>
        <Field label="Expected Resale ₹"><input className="input" type="number" value={f.expected_resale} onChange={set("expected_resale")} /></Field>
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
