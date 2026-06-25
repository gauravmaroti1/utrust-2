import { useEffect, useState } from "react";
import {
  BarChart, Bar, PieChart, Pie, Cell, LineChart, Line,
  XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, CartesianGrid,
} from "recharts";
import { api, INR } from "../api";
import { Kpi, Spinner } from "../components/ui";

const COLORS = ["#C8102E", "#1f2937", "#f59e0b", "#10b981", "#6366f1", "#ec4899", "#0ea5e9", "#84cc16"];

export default function Analytics() {
  const [o, setO] = useState<any | null>(null);
  const [evals, setEvals] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([api.get("/analytics/overview"), api.get("/analytics/evaluators")])
      .then(([a, b]) => { setO(a.data); setEvals(b.data); })
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <Spinner />;
  if (!o) return null;

  const ageingData = [
    { bucket: "0–30", count: o.ageing.d0_30 },
    { bucket: "31–60", count: o.ageing.d31_60 },
    { bucket: "61–90", count: o.ageing.d61_90 },
    { bucket: "91–120", count: o.ageing.d91_120 },
    { bucket: "120+", count: o.ageing.d120_plus },
  ];

  // Build trade trend (in vs out per month)
  const months = Array.from(new Set((o.trade_trend || []).map((t: any) => t.month)));
  const tradeData = months.map((m) => {
    const inn = (o.trade_trend || []).find((t: any) => t.month === m && t.direction === "IN");
    const out = (o.trade_trend || []).find((t: any) => t.month === m && t.direction === "OUT");
    return { month: m, "Trade-In": inn?.count || 0, "Trade-Out": out?.count || 0 };
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Analytics Dashboard</h1>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Kpi label="Units Sold" value={o.sales.units_sold} accent />
        <Kpi label="Sales Revenue" value={INR(o.sales.revenue)} />
        <Kpi label="Avg Days to Sale" value={`${Math.round(Number(o.sales.avg_days_to_sale))} d`} />
        <Kpi label="Active Branches" value={o.by_branch.length} />
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <ChartCard title="Stock Ageing Distribution">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={ageingData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
              <XAxis dataKey="bucket" fontSize={12} /><YAxis fontSize={12} allowDecimals={false} />
              <Tooltip /><Bar dataKey="count" radius={[6, 6, 0, 0]}>
                {ageingData.map((_, i) => <Cell key={i} fill={i >= 3 ? "#C8102E" : "#1f2937"} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Stock by Branch">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={o.by_branch} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" horizontal={false} />
              <XAxis type="number" fontSize={12} allowDecimals={false} />
              <YAxis type="category" dataKey="branch" fontSize={12} width={90} />
              <Tooltip /><Bar dataKey="stock" fill="#C8102E" radius={[0, 6, 6, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Make Mix (Active Stock)">
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie data={o.make_mix} dataKey="count" nameKey="make" cx="50%" cy="50%" outerRadius={90} label>
                {o.make_mix.map((_: any, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip /><Legend fontSize={11} />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Trade-In vs Trade-Out Trend">
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={tradeData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="month" fontSize={12} /><YAxis fontSize={12} allowDecimals={false} />
              <Tooltip /><Legend />
              <Line type="monotone" dataKey="Trade-In" stroke="#10b981" strokeWidth={2} />
              <Line type="monotone" dataKey="Trade-Out" stroke="#C8102E" strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <div className="card p-5">
        <h3 className="font-semibold mb-3 text-gray-900 dark:text-white">Evaluator Performance</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-gray-400 border-b border-gray-100 dark:border-gray-700">
              <th className="py-2">Evaluator</th><th>Branch</th><th>Evaluations</th>
              <th>Proposals</th><th>Approved</th><th>Avg ROI%</th>
            </tr></thead>
            <tbody>
              {evals.map((e) => (
                <tr key={e.id} className="border-b border-gray-50 dark:border-gray-700/50">
                  <td className="py-2 font-medium text-gray-900 dark:text-white">{e.name}</td>
                  <td className="text-gray-500">{e.branch}</td>
                  <td>{e.evaluations}</td><td>{e.proposals}</td><td>{e.approved}</td>
                  <td>{Number(e.avg_roi).toFixed(1)}%</td>
                </tr>
              ))}
              {evals.length === 0 && <tr><td colSpan={6} className="py-4 text-center text-gray-400">No evaluator data.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card p-5">
      <h3 className="font-semibold mb-3 text-gray-900 dark:text-white">{title}</h3>
      {children}
    </div>
  );
}
