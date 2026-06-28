import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, INR, useAuth } from "../api";
import { Kpi, Spinner, StatusBadge, Modal } from "../components/ui";

interface Kpis {
  total_stock: number; stock_value: number; avg_age: number;
  over30: number; over60: number; over90: number; over120: number; dead_stock: number;
  by_branch: { branch: string; count: number; value: number }[];
  by_status: { status: string; count: number }[];
}

export default function Dashboard() {
  const { user } = useAuth();
  const [k, setK] = useState<Kpis | null>(null);
  const [recent, setRecent] = useState<any[]>([]);
  const [alerts, setAlerts] = useState<any | null>(null);
  const [alertView, setAlertView] = useState<{ title: string; rows: any[] } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([api.get("/stock/kpis"), api.get("/stock"), api.get("/analytics/alerts")])
      .then(([kp, st, al]) => {
        setK(kp.data);
        setRecent(st.data.slice(0, 8));
        setAlerts(al.data);
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <Spinner />;
  if (!k) return null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Welcome, {user?.name?.split(" ")[0]}
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            U TRUST 2.0 — Pre-Owned Vehicle Management · {user?.branch_name || "All Branches"}
          </p>
        </div>
        <Link to="/stock" className="btn btn-primary">View Full Stock →</Link>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Kpi label="Total Stock" value={k.total_stock} accent />
        <Kpi label="Stock Value" value={INR(k.stock_value)} />
        <Kpi label="Avg Ageing" value={`${Math.round(Number(k.avg_age))} d`} />
        <Kpi label="Dead Stock (>90d)" value={k.dead_stock} sub="Needs attention" />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Kpi label="Ageing > 30 days" value={k.over30} />
        <Kpi label="Ageing > 60 days" value={k.over60} />
        <Kpi label="Ageing > 90 days" value={k.over90} />
        <Kpi label="Ageing > 120 days" value={k.over120} />
      </div>

      {alerts && (
        <div className="card p-5">
          <h3 className="font-semibold mb-3 text-gray-900 dark:text-white flex items-center gap-2">
            ⚠️ Compliance Alerts <span className="text-xs font-normal text-gray-400">(insurance &amp; registration)</span>
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {[
              ["Insurance Expired", alerts.counts.insurance_expired, alerts.insurance_expired, "text-red-600 bg-red-50 dark:bg-red-900/20"],
              ["Insurance < 30d", alerts.counts.insurance_expiring, alerts.insurance_expiring, "text-amber-600 bg-amber-50 dark:bg-amber-900/20"],
              ["Not Insured", alerts.counts.not_insured, alerts.not_insured, "text-rose-600 bg-rose-50 dark:bg-rose-900/20"],
              ["Reg Expired", alerts.counts.reg_expired, alerts.reg_expired, "text-red-600 bg-red-50 dark:bg-red-900/20"],
              ["Reg < 30d", alerts.counts.reg_expiring, alerts.reg_expiring, "text-amber-600 bg-amber-50 dark:bg-amber-900/20"],
            ].map(([label, count, rows, cls]: any) => (
              <button key={label} onClick={() => count > 0 && setAlertView({ title: label, rows })}
                className={`rounded-xl p-3 text-left transition ${cls} ${count > 0 ? "hover:ring-2 hover:ring-prakash-red/40 cursor-pointer" : "opacity-60"}`}>
                <div className="text-2xl font-bold">{count}</div>
                <div className="text-xs">{label}</div>
              </button>
            ))}
          </div>
          <p className="text-xs text-gray-400 mt-2">Tap a count to see the vehicles. Expired-registration vehicles should be scrapped or re-registered.</p>
        </div>
      )}

      <Modal open={!!alertView} onClose={() => setAlertView(null)} title={alertView?.title || ""} wide>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-gray-400 border-b">
              <th className="py-1">Vehicle</th><th>Reg No</th><th>Chassis</th><th>Insurance</th><th>Reg Valid</th><th>Days</th>
            </tr></thead>
            <tbody>
              {alertView?.rows?.map((v: any) => (
                <tr key={v.id} className="border-b border-gray-50 dark:border-gray-700/50">
                  <td className="py-1.5 font-medium">{v.make} {v.model} {v.mfg_year}</td>
                  <td className="text-gray-500">{v.reg_no || "—"}</td>
                  <td className="text-gray-500">{v.chassis_no ? `…${String(v.chassis_no).slice(-5)}` : "—"}</td>
                  <td className="text-gray-500">{v.insurance_valid_to ? String(v.insurance_valid_to).slice(0, 10) : "—"}</td>
                  <td className="text-gray-500">{v.registration_valid_to ? String(v.registration_valid_to).slice(0, 10) : "—"}</td>
                  <td className={Number(v.days) < 0 ? "text-red-500 font-medium" : "text-amber-600"}>{v.days ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Modal>

      <div className="grid md:grid-cols-2 gap-6">
        <div className="card p-5">
          <h3 className="font-semibold mb-3 text-gray-900 dark:text-white">Branch-wise Stock</h3>
          <div className="space-y-2">
            {k.by_branch.length === 0 && <p className="text-sm text-gray-400">No stock data.</p>}
            {k.by_branch.map((b) => (
              <div key={b.branch} className="flex items-center justify-between text-sm">
                <span className="text-gray-700 dark:text-gray-300">{b.branch}</span>
                <span className="flex items-center gap-3">
                  <span className="font-medium text-gray-900 dark:text-white">{b.count} units</span>
                  <span className="text-gray-400">{INR(b.value)}</span>
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="card p-5">
          <h3 className="font-semibold mb-3 text-gray-900 dark:text-white">Status Breakdown</h3>
          <div className="flex flex-wrap gap-2">
            {k.by_status.map((s) => (
              <div key={s.status} className="flex items-center gap-2">
                <StatusBadge status={s.status} />
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{s.count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="card p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-gray-900 dark:text-white">Oldest Stock</h3>
          <Link to="/stock" className="text-sm text-prakash-red hover:underline">See all</Link>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-400 border-b border-gray-100 dark:border-gray-700">
                <th className="py-2">Vehicle</th><th>Reg No</th><th>Branch</th>
                <th>Age</th><th>Cost</th><th>Status</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((v) => (
                <tr key={v.id} className="border-b border-gray-50 dark:border-gray-700/50">
                  <td className="py-2 font-medium text-gray-900 dark:text-white">
                    {v.make} {v.model} <span className="text-gray-400">{v.variant}</span>
                  </td>
                  <td className="text-gray-500">{v.reg_no}</td>
                  <td className="text-gray-500">{v.branch_name}</td>
                  <td>
                    <span className={Number(v.age_days) > 90 ? "text-red-500 font-medium" : "text-gray-600 dark:text-gray-300"}>
                      {v.age_days ?? "—"} d
                    </span>
                  </td>
                  <td className="text-gray-500">{INR(v.purchase_cost)}</td>
                  <td><StatusBadge status={v.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
