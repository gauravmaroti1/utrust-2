import { useEffect, useState } from "react";
import { api } from "../api";
import { Modal, Spinner, Field } from "../components/ui";

const ROLES = ["SUPER_ADMIN", "BRANCH_MANAGER", "EVALUATOR", "SALES_EXECUTIVE"];

export default function Users() {
  const [rows, setRows] = useState<any[]>([]);
  const [branches, setBranches] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<any | null>(null);

  function load() {
    setLoading(true);
    api.get("/users").then((r) => setRows(r.data)).finally(() => setLoading(false));
  }
  useEffect(() => { load(); api.get("/branches").then((r) => setBranches(r.data)); }, []);

  async function toggleActive(u: any) {
    await api.patch(`/users/${u.id}`, { active: !u.active });
    load();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">User Management</h1>
        <button onClick={() => setEditing({})} className="btn btn-primary">+ Add User</button>
      </div>

      {loading ? <Spinner /> : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-gray-400 border-b border-gray-100 dark:border-gray-700">
              <th className="p-3">Name</th><th>Email</th><th>Role</th><th>Branch</th><th>Phone</th><th>Active</th><th></th>
            </tr></thead>
            <tbody>
              {rows.map((u) => (
                <tr key={u.id} className="border-b border-gray-50 dark:border-gray-700/50">
                  <td className="p-3 font-medium text-gray-900 dark:text-white">{u.name}</td>
                  <td className="text-gray-500">{u.email}</td>
                  <td><span className="badge bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">{u.role.replace(/_/g, " ")}</span></td>
                  <td className="text-gray-500">{u.branch_name || "—"}</td>
                  <td className="text-gray-500">{u.phone || "—"}</td>
                  <td>
                    <button onClick={() => toggleActive(u)}
                      className={`badge ${u.active ? "bg-green-100 text-green-700" : "bg-gray-200 text-gray-500"}`}>
                      {u.active ? "Active" : "Inactive"}
                    </button>
                  </td>
                  <td><button onClick={() => setEditing(u)} className="text-prakash-red text-xs hover:underline">Edit</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing && <UserModal u={editing} branches={branches} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
    </div>
  );
}

function UserModal({ u, branches, onClose, onSaved }: any) {
  const isNew = !u.id;
  const [f, setF] = useState<any>({ name: "", email: "", password: "", role: "EVALUATOR", branch_id: "", phone: "", ...u });
  const [saving, setSaving] = useState(false);
  const set = (k: string) => (e: any) => setF({ ...f, [k]: e.target.value });

  async function save() {
    setSaving(true);
    try {
      if (isNew) await api.post("/users", f);
      else await api.patch(`/users/${u.id}`, {
        name: f.name, role: f.role, branch_id: f.branch_id || null, phone: f.phone,
        ...(f.password ? { password: f.password } : {}),
      });
      onSaved();
    } catch (e: any) { alert(e.response?.data?.error || "Save failed"); }
    finally { setSaving(false); }
  }

  return (
    <Modal open onClose={onClose} title={isNew ? "Add User" : `Edit ${u.name}`}>
      <div className="space-y-3">
        <Field label="Name"><input className="input" value={f.name} onChange={set("name")} /></Field>
        {isNew && <Field label="Email"><input className="input" type="email" value={f.email} onChange={set("email")} /></Field>}
        <Field label={isNew ? "Password" : "New Password (leave blank to keep)"}>
          <input className="input" type="text" value={f.password || ""} onChange={set("password")} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Role">
            <select className="input" value={f.role} onChange={set("role")}>
              {ROLES.map((r) => <option key={r} value={r}>{r.replace(/_/g, " ")}</option>)}
            </select>
          </Field>
          <Field label="Branch">
            <select className="input" value={f.branch_id || ""} onChange={set("branch_id")}>
              <option value="">— None (HQ) —</option>
              {branches.map((b: any) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </Field>
        </div>
        <Field label="Phone"><input className="input" value={f.phone || ""} onChange={set("phone")} /></Field>
      </div>
      <div className="flex justify-end gap-2 mt-5">
        <button onClick={onClose} className="btn btn-ghost">Cancel</button>
        <button onClick={save} disabled={saving} className="btn btn-primary">{saving ? "Saving…" : "Save"}</button>
      </div>
    </Modal>
  );
}
