import { useEffect, useState } from "react";
import { api, INR, useAuth } from "../api";
import { Modal, Spinner, Field } from "../components/ui";

export default function Quotations() {
  const { user } = useAuth();
  const [rows, setRows] = useState<any[]>([]);
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  const canQuote = ["SALES_EXECUTIVE","BRANCH_MANAGER","SUPER_ADMIN"].includes(user?.role || "");

  function load() {
    setLoading(true);
    api.get("/quotations").then((r) => setRows(r.data)).finally(() => setLoading(false));
  }
  useEffect(() => {
    load();
    api.get("/stock", { params: { } }).then((r) =>
      setVehicles(r.data.filter((v: any) => !["SOLD","DELIVERED"].includes(v.status))));
  }, []);

  async function whatsapp(id: number) {
    const { data } = await api.get(`/quotations/${id}/whatsapp`);
    window.open(data.wa_link, "_blank");
  }
  async function pdf(id: number) {
    const res = await api.get(`/quotations/${id}/pdf`, { responseType: "blob" });
    const url = URL.createObjectURL(res.data);
    const a = document.createElement("a"); a.href = url; a.download = `quotation-${id}.pdf`; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Sales Quotations</h1>
        {canQuote && <button onClick={() => setCreating(true)} className="btn btn-primary">+ New Quotation</button>}
      </div>

      {loading ? <Spinner /> : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-gray-400 border-b border-gray-100 dark:border-gray-700">
              <th className="p-3">Customer</th><th>Vehicle</th><th>Asking</th><th>Offer</th>
              <th>By</th><th>Date</th><th>Share</th>
            </tr></thead>
            <tbody>
              {rows.map((q) => (
                <tr key={q.id} className="border-b border-gray-50 dark:border-gray-700/50">
                  <td className="p-3">
                    <div className="font-medium text-gray-900 dark:text-white">{q.customer_name}</div>
                    <div className="text-xs text-gray-400">{q.customer_phone}</div>
                  </td>
                  <td className="text-gray-600 dark:text-gray-300">{q.make} {q.model} {q.variant} <span className="text-gray-400">{q.reg_no}</span></td>
                  <td>{INR(q.asking_price)}</td>
                  <td>{INR(q.negotiated_price || q.asking_price)}</td>
                  <td className="text-gray-500">{q.created_by_name}</td>
                  <td className="text-gray-400 text-xs">{q.created_at?.slice(0, 10)}</td>
                  <td>
                    <div className="flex gap-2">
                      <button onClick={() => whatsapp(q.id)} className="text-green-600 text-xs hover:underline">WhatsApp</button>
                      <button onClick={() => pdf(q.id)} className="text-prakash-red text-xs hover:underline">PDF</button>
                    </div>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={7} className="p-6 text-center text-gray-400">No quotations yet.</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {creating && <CreateQuote vehicles={vehicles} onClose={() => setCreating(false)} onSaved={() => { setCreating(false); load(); }} />}
    </div>
  );
}

function CreateQuote({ vehicles, onClose, onSaved }: any) {
  const [f, setF] = useState<any>({
    vehicle_id: "", customer_name: "", customer_phone: "", asking_price: "", negotiated_price: "",
    insurance_details: "", warranty_details: "U TRUST Assured — 6 months / 10,000 km engine & transmission warranty",
    notes: "",
  });
  const [saving, setSaving] = useState(false);
  const set = (k: string) => (e: any) => {
    const val = e.target.value;
    setF((prev: any) => {
      const next = { ...prev, [k]: val };
      if (k === "vehicle_id") {
        const v = vehicles.find((x: any) => String(x.id) === String(val));
        if (v) next.asking_price = v.selling_price;
      }
      return next;
    });
  };

  async function save() {
    setSaving(true);
    try { await api.post("/quotations", f); onSaved(); }
    catch (e: any) { alert(e.response?.data?.error || "Failed"); }
    finally { setSaving(false); }
  }

  return (
    <Modal open onClose={onClose} title="New Sales Quotation" wide>
      <Field label="Vehicle">
        <select className="input" value={f.vehicle_id} onChange={set("vehicle_id")}>
          <option value="">Select vehicle…</option>
          {vehicles.map((v: any) => <option key={v.id} value={v.id}>{v.make} {v.model} {v.variant} · {v.reg_no} · {INR(v.selling_price)}</option>)}
        </select>
      </Field>
      <div className="grid grid-cols-2 gap-3 mt-3">
        <Field label="Customer Name"><input className="input" value={f.customer_name} onChange={set("customer_name")} /></Field>
        <Field label="Customer Phone"><input className="input" value={f.customer_phone} onChange={set("customer_phone")} placeholder="91XXXXXXXXXX" /></Field>
        <Field label="Asking Price ₹"><input className="input" type="number" value={f.asking_price} onChange={set("asking_price")} /></Field>
        <Field label="Offer / Negotiated ₹"><input className="input" type="number" value={f.negotiated_price} onChange={set("negotiated_price")} /></Field>
      </div>
      <Field label="Insurance Details"><input className="input mt-3" value={f.insurance_details} onChange={set("insurance_details")} placeholder="Comprehensive valid till…" /></Field>
      <Field label="Warranty Details"><input className="input mt-3" value={f.warranty_details} onChange={set("warranty_details")} /></Field>
      <Field label="Notes / Terms"><textarea className="input mt-3" rows={2} value={f.notes} onChange={set("notes")} /></Field>
      <div className="flex justify-end gap-2 mt-5">
        <button onClick={onClose} className="btn btn-ghost">Cancel</button>
        <button onClick={save} disabled={saving || !f.vehicle_id || !f.customer_name} className="btn btn-primary">{saving ? "Saving…" : "Create Quotation"}</button>
      </div>
    </Modal>
  );
}
