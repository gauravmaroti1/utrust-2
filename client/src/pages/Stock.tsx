import { useEffect, useState } from "react";
import { api, INR, useAuth, can } from "../api";
import { Modal, Spinner, StatusBadge, Field } from "../components/ui";

const STATUSES = ["IN_STOCK","PURCHASED","READY_FOR_SALE","UNDER_REFURBISHMENT","RESERVED","SOLD","DELIVERED"];
const FUELS = ["PETROL","DIESEL","CNG","HYBRID","ELECTRIC"];

export default function Stock() {
  const { user } = useAuth();
  const [rows, setRows] = useState<any[]>([]);
  const [branches, setBranches] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [detail, setDetail] = useState<any | null>(null);
  const [editing, setEditing] = useState<any | null>(null);
  const [importing, setImporting] = useState(false);

  const canEdit = ["SUPER_ADMIN","BRANCH_MANAGER","EVALUATOR"].includes(user?.role || "");

  function load() {
    setLoading(true);
    const params: any = {};
    if (status) params.status = status;
    if (search) params.search = search;
    api.get("/stock", { params }).then((r) => setRows(r.data)).finally(() => setLoading(false));
  }
  useEffect(() => { api.get("/branches").then((r) => setBranches(r.data)); }, []);
  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [status, search]);

  async function exportXlsx() {
    const res = await api.get("/stock/export/xlsx", { responseType: "blob" });
    const url = URL.createObjectURL(res.data);
    const a = document.createElement("a"); a.href = url; a.download = "u-trust-stock.xlsx"; a.click();
    URL.revokeObjectURL(url);
  }

  async function importXlsx(file: File) {
    setImporting(true);
    const fd = new FormData(); fd.append("file", file);
    try {
      const r = await api.post("/stock/import/xlsx", fd, { headers: { "Content-Type": "multipart/form-data" } });
      alert(`Imported ${r.data.inserted ?? r.data.count ?? 0} vehicles.`);
      load();
    } catch (e: any) { alert(e.response?.data?.error || "Import failed"); }
    finally { setImporting(false); }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Stock Register</h1>
        <div className="flex gap-2 flex-wrap">
          <button onClick={exportXlsx} className="btn btn-ghost">⬇ Export</button>
          {can.manageUsers(user?.role) || user?.role === "BRANCH_MANAGER" ? (
            <label className="btn btn-ghost cursor-pointer">
              {importing ? "Importing…" : "⬆ Import Excel"}
              <input type="file" accept=".xlsx,.xls" hidden
                onChange={(e) => e.target.files?.[0] && importXlsx(e.target.files[0])} />
            </label>
          ) : null}
          {canEdit && <button onClick={() => setEditing({})} className="btn btn-primary">+ Add Vehicle</button>}
        </div>
      </div>

      <div className="flex gap-2 flex-wrap">
        <input className="input max-w-xs" placeholder="Search reg no / make / model…"
          value={search} onChange={(e) => setSearch(e.target.value)} />
        <select className="input max-w-[180px]" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All Status</option>
          {STATUSES.map((s) => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}
        </select>
      </div>

      {loading ? <Spinner /> : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-400 border-b border-gray-100 dark:border-gray-700">
                <th className="p-3">Vehicle</th><th>Reg No</th><th>Year</th><th>KM</th>
                <th>Branch</th><th>Age</th><th>Cost</th><th>Ask</th><th>Status</th><th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((v) => (
                <tr key={v.id} className="border-b border-gray-50 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30">
                  <td className="p-3 font-medium text-gray-900 dark:text-white">
                    {v.make} {v.model} <span className="text-gray-400 font-normal">{v.variant}</span>
                  </td>
                  <td className="text-gray-500">{v.reg_no}</td>
                  <td className="text-gray-500">{v.mfg_year}</td>
                  <td className="text-gray-500">{Number(v.odometer || 0).toLocaleString("en-IN")}</td>
                  <td className="text-gray-500">{v.branch_name}</td>
                  <td>
                    <span className={Number(v.age_days) > 90 ? "text-red-500 font-medium" : "text-gray-600 dark:text-gray-300"}>
                      {v.age_days ?? "—"}d
                    </span>
                  </td>
                  <td className="text-gray-500">{INR(v.purchase_cost)}</td>
                  <td className="text-gray-500">{INR(v.selling_price)}</td>
                  <td><StatusBadge status={v.status} /></td>
                  <td>
                    <button onClick={() => setDetail(v)} className="text-prakash-red text-xs hover:underline">View</button>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr><td colSpan={10} className="p-6 text-center text-gray-400">No vehicles found.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {detail && <DetailModal v={detail} onClose={() => setDetail(null)}
        onChanged={() => { setDetail(null); load(); }}
        canEdit={canEdit} onEdit={() => { setEditing(detail); setDetail(null); }} />}
      {editing && <EditModal v={editing} branches={branches}
        onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
    </div>
  );
}

function EditModal({ v, branches, onClose, onSaved }: any) {
  const [f, setF] = useState<any>({
    make: "", model: "", variant: "", reg_no: "", mfg_year: "", odometer: "",
    color: "", fuel_type: "PETROL", transmission: "MANUAL", owners: 1,
    purchase_cost: "", selling_price: "", branch_id: "", status: "IN_STOCK",
    purchase_date: new Date().toISOString().slice(0, 10), ...v,
  });
  const [saving, setSaving] = useState(false);
  const set = (k: string) => (e: any) => setF({ ...f, [k]: e.target.value });

  async function save() {
    setSaving(true);
    try {
      if (v.id) await api.patch(`/stock/${v.id}`, f);
      else await api.post("/stock", f);
      onSaved();
    } catch (e: any) { alert(e.response?.data?.error || "Save failed"); }
    finally { setSaving(false); }
  }

  return (
    <Modal open onClose={onClose} title={v.id ? "Edit Vehicle" : "Add Vehicle"} wide>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <Field label="Make"><input className="input" value={f.make} onChange={set("make")} /></Field>
        <Field label="Model"><input className="input" value={f.model} onChange={set("model")} /></Field>
        <Field label="Variant"><input className="input" value={f.variant} onChange={set("variant")} /></Field>
        <Field label="Reg No"><input className="input" value={f.reg_no} onChange={set("reg_no")} /></Field>
        <Field label="Mfg Year"><input className="input" type="number" value={f.mfg_year} onChange={set("mfg_year")} /></Field>
        <Field label="Odometer"><input className="input" type="number" value={f.odometer} onChange={set("odometer")} /></Field>
        <Field label="Color"><input className="input" value={f.color} onChange={set("color")} /></Field>
        <Field label="Fuel">
          <select className="input" value={f.fuel_type} onChange={set("fuel_type")}>
            {FUELS.map((x) => <option key={x}>{x}</option>)}
          </select>
        </Field>
        <Field label="Transmission">
          <select className="input" value={f.transmission} onChange={set("transmission")}>
            <option>MANUAL</option><option>AUTOMATIC</option>
          </select>
        </Field>
        <Field label="Owners"><input className="input" type="number" value={f.owners} onChange={set("owners")} /></Field>
        <Field label="Purchase Cost"><input className="input" type="number" value={f.purchase_cost} onChange={set("purchase_cost")} /></Field>
        <Field label="Selling Price"><input className="input" type="number" value={f.selling_price} onChange={set("selling_price")} /></Field>
        <Field label="Purchase Date"><input className="input" type="date" value={f.purchase_date?.slice?.(0,10) || f.purchase_date} onChange={set("purchase_date")} /></Field>
        <Field label="Chassis No"><input className="input" value={f.chassis_no || ""} onChange={set("chassis_no")} placeholder="full chassis" /></Field>
        <Field label="Insured?">
          <select className="input" value={f.insured ? "yes" : "no"} onChange={(e) => setF({ ...f, insured: e.target.value === "yes" })}>
            <option value="yes">YES</option><option value="no">NO</option>
          </select>
        </Field>
        <Field label="Insurance Expiry"><input className="input" type="date" value={f.insurance_valid_to?.slice?.(0,10) || f.insurance_valid_to || ""} onChange={set("insurance_valid_to")} /></Field>
        <Field label="Registration Expiry"><input className="input" type="date" value={f.registration_valid_to?.slice?.(0,10) || f.registration_valid_to || ""} onChange={set("registration_valid_to")} /></Field>
        <Field label="Branch">
          <select className="input" value={f.branch_id} onChange={set("branch_id")}>
            <option value="">Select…</option>
            {branches.map((b: any) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </Field>
        <Field label="Status">
          <select className="input" value={f.status} onChange={set("status")}>
            {STATUSES.map((s) => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}
          </select>
        </Field>
      </div>
      <div className="flex justify-end gap-2 mt-5">
        <button onClick={onClose} className="btn btn-ghost">Cancel</button>
        <button onClick={save} disabled={saving} className="btn btn-primary">{saving ? "Saving…" : "Save"}</button>
      </div>
    </Modal>
  );
}

function DetailModal({ v, onClose, onChanged, canEdit, onEdit }: any) {
  const { user } = useAuth();
  const [refurb, setRefurb] = useState<any | null>(null);
  const [addLine, setAddLine] = useState({ category: "Mechanical", description: "", amount: "" });
  const [newStatus, setNewStatus] = useState(v.status);
  const [soldPrice, setSoldPrice] = useState("");

  useEffect(() => { api.get(`/refurbishment/vehicle/${v.id}`).then((r) => setRefurb(r.data)); }, [v.id]);

  async function saveRefurb() {
    if (!addLine.amount) return;
    await api.post("/refurbishment", { vehicle_id: v.id, ...addLine, amount: Number(addLine.amount) });
    setAddLine({ category: "Mechanical", description: "", amount: "" });
    api.get(`/refurbishment/vehicle/${v.id}`).then((r) => setRefurb(r.data));
  }
  async function changeStatus() {
    await api.post(`/stock/${v.id}/status`, { status: newStatus, sold_price: soldPrice ? Number(soldPrice) : undefined });
    onChanged();
  }

  return (
    <Modal open onClose={onClose} title={`${v.make} ${v.model} ${v.variant || ""}`} wide>
      <div className="grid md:grid-cols-2 gap-4 text-sm">
        <div className="space-y-1.5">
          {[["Reg No", v.reg_no],["Year", v.mfg_year],["Fuel", v.fuel_type],["Transmission", v.transmission],
            ["Odometer", `${Number(v.odometer||0).toLocaleString("en-IN")} km`],["Owners", v.owners],
            ["Colour", v.color],["Branch", v.branch_name],["Evaluator", v.evaluator_name || "—"]].map(([k, val]) => (
            <div key={k as string} className="flex justify-between">
              <span className="text-gray-400">{k}</span>
              <span className="text-gray-800 dark:text-gray-200 font-medium">{val ?? "—"}</span>
            </div>
          ))}
        </div>
        <div className="space-y-1.5">
          <div className="flex justify-between"><span className="text-gray-400">Purchase Cost</span><span className="font-medium">{INR(v.purchase_cost)}</span></div>
          <div className="flex justify-between"><span className="text-gray-400">Asking Price</span><span className="font-medium">{INR(v.selling_price)}</span></div>
          <div className="flex justify-between"><span className="text-gray-400">Age</span><span className="font-medium">{v.age_days ?? "—"} days</span></div>
          {refurb && (
            <>
              <div className="flex justify-between"><span className="text-gray-400">Refurb Total</span><span className="font-medium">{INR(refurb.refurb_total)}</span></div>
              <div className="flex justify-between"><span className="text-gray-400">Final Cost</span><span className="font-medium">{INR(refurb.final_cost)}</span></div>
              {refurb.profit != null && <div className="flex justify-between"><span className="text-gray-400">Profit</span><span className={`font-medium ${refurb.profit>=0?"text-green-600":"text-red-600"}`}>{INR(refurb.profit)} ({refurb.roi_pct}%)</span></div>}
            </>
          )}
          <div className="flex justify-between items-center pt-1"><span className="text-gray-400">Status</span><StatusBadge status={v.status} /></div>
          {v.location_note && <div className="text-xs text-gray-400 pt-1">📍 {v.location_note}</div>}
        </div>
      </div>

      {refurb && (
        <div className="mt-5 border-t border-gray-100 dark:border-gray-700 pt-4">
          <h4 className="font-semibold text-sm mb-2 text-gray-900 dark:text-white">Refurbishment Lines</h4>
          {refurb.lines.length === 0 ? <p className="text-xs text-gray-400">No refurbishment recorded.</p> : (
            <div className="space-y-1">
              {refurb.lines.map((l: any) => (
                <div key={l.id} className="flex justify-between text-xs">
                  <span className="text-gray-600 dark:text-gray-300">{l.category} — {l.description}</span>
                  <span className="font-medium">{INR(l.amount)}</span>
                </div>
              ))}
            </div>
          )}
          {canEdit && (
            <div className="flex gap-2 mt-3 flex-wrap items-end">
              <select className="input max-w-[140px]" value={addLine.category} onChange={(e) => setAddLine({ ...addLine, category: e.target.value })}>
                {["Mechanical","Dent/Paint","Accessories","Labour","Misc"].map((c) => <option key={c}>{c}</option>)}
              </select>
              <input className="input flex-1 min-w-[120px]" placeholder="Description" value={addLine.description} onChange={(e) => setAddLine({ ...addLine, description: e.target.value })} />
              <input className="input max-w-[110px]" type="number" placeholder="₹ Amount" value={addLine.amount} onChange={(e) => setAddLine({ ...addLine, amount: e.target.value })} />
              <button onClick={saveRefurb} className="btn btn-ghost">+ Add</button>
            </div>
          )}
        </div>
      )}

      {canEdit && (
        <div className="mt-5 border-t border-gray-100 dark:border-gray-700 pt-4 flex gap-2 flex-wrap items-end">
          <Field label="Update Status">
            <select className="input max-w-[180px]" value={newStatus} onChange={(e) => setNewStatus(e.target.value)}>
              {STATUSES.map((s) => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}
            </select>
          </Field>
          {(newStatus === "SOLD" || newStatus === "DELIVERED") && (
            <Field label="Sold Price"><input className="input max-w-[140px]" type="number" value={soldPrice} onChange={(e) => setSoldPrice(e.target.value)} /></Field>
          )}
          <button onClick={changeStatus} className="btn btn-ghost">Apply</button>
          <div className="flex-1" />
          {canEdit && <button onClick={onEdit} className="btn btn-primary">Edit Details</button>}
        </div>
      )}
    </Modal>
  );
}
