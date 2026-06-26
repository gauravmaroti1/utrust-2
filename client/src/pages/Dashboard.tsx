import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, INR, useAuth } from "../api";
import { Kpi, Spinner, StatusBadge } from "../components/ui";

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
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([api.get("/stock/kpis"), api.get("/stock")])
      .then(([kp, st]) => {
        setK(kp.data);
        setRecent(st.data.slice(0, 8));
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
