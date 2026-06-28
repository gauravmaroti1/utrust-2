import { useEffect, useState } from "react";
import { api, useAuth } from "../api";
import { Spinner, Field } from "../components/ui";

export default function Productivity() {
  const { user } = useAuth();
  const isEvaluator = ["EVALUATOR","SALES_EXECUTIVE","SUPER_ADMIN"].includes(user?.role || "");
  const isManager = ["SUPER_ADMIN","BRANCH_MANAGER"].includes(user?.role || "");
  const [tab, setTab] = useState<"report" | "leaderboard" | "team" | "enquiries" | "targets">(isEvaluator ? "report" : "leaderboard");

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Productivity Tracker</h1>
      <div className="flex gap-2 border-b border-gray-100 dark:border-gray-700 flex-wrap">
        {isEvaluator && <Tab id="report" tab={tab} setTab={setTab}>My Daily Report</Tab>}
        <Tab id="enquiries" tab={tab} setTab={setTab}>Enquiries</Tab>
        <Tab id="targets" tab={tab} setTab={setTab}>Targets</Tab>
        <Tab id="leaderboard" tab={tab} setTab={setTab}>Leaderboard</Tab>
        {isManager && <Tab id="team" tab={tab} setTab={setTab}>Team Reports</Tab>}
      </div>
      {tab === "report" && <DailyReport />}
      {tab === "enquiries" && <EnquiriesTab />}
      {tab === "targets" && <TargetsTab isManager={isManager} />}
      {tab === "leaderboard" && <Leaderboard />}
      {tab === "team" && <TeamReports />}
    </div>
  );
}

function Tab({ id, tab, setTab, children }: any) {
  return (
    <button onClick={() => setTab(id)}
      className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
        tab === id ? "border-prakash-red text-prakash-red" : "border-transparent text-gray-500 hover:text-gray-700"}`}>
      {children}
    </button>
  );
}

const FIELDS = [
  ["vehicles_evaluated", "Vehicles Evaluated"],
  ["customer_visits", "Customer Visits"],
  ["tradein_enquiries", "Trade-In Enquiries"],
  ["quotations_made", "Quotations Generated"],
  ["purchases_closed", "Purchases Closed"],
  ["followups", "Follow-ups Done"],
] as const;

function DailyReport() {
  const today = new Date().toISOString().slice(0, 10);
  const [f, setF] = useState<any>({ report_date: today, remarks: "" });
  const [mine, setMine] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  function load() { api.get("/productivity/my").then((r) => setMine(r.data)); }
  useEffect(load, []);

  async function submit() {
    setSaving(true); setMsg("");
    try {
      await api.post("/productivity/report", f);
      setMsg("✓ Report saved for " + f.report_date);
      load();
    } catch { setMsg("Failed to save"); }
    finally { setSaving(false); }
  }

  return (
    <div className="grid lg:grid-cols-2 gap-6">
      <div className="card p-5">
        <h3 className="font-semibold mb-4 text-gray-900 dark:text-white">Submit Daily Activity</h3>
        <Field label="Date">
          <input className="input max-w-[200px]" type="date" value={f.report_date}
            onChange={(e) => setF({ ...f, report_date: e.target.value })} />
        </Field>
        <div className="grid grid-cols-2 gap-3 mt-3">
          {FIELDS.map(([k, label]) => (
            <Field key={k} label={label}>
              <input className="input" type="number" min={0} value={f[k] ?? ""}
                onChange={(e) => setF({ ...f, [k]: Number(e.target.value) })} />
            </Field>
          ))}
        </div>
        <Field label="Remarks">
          <textarea className="input mt-3" rows={2} value={f.remarks}
            onChange={(e) => setF({ ...f, remarks: e.target.value })} />
        </Field>
        <div className="flex items-center gap-3 mt-4">
          <button onClick={submit} disabled={saving} className="btn btn-primary">{saving ? "Saving…" : "Submit Report"}</button>
          {msg && <span className="text-sm text-green-600">{msg}</span>}
        </div>
      </div>

      <div className="card p-5">
        <h3 className="font-semibold mb-3 text-gray-900 dark:text-white">My Recent Reports</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-gray-400 border-b border-gray-100 dark:border-gray-700">
              <th className="py-2">Date</th><th>Eval</th><th>Visits</th><th>Quotes</th><th>Closed</th><th>F/U</th>
            </tr></thead>
            <tbody>
              {mine.map((r) => (
                <tr key={r.id} className="border-b border-gray-50 dark:border-gray-700/50">
                  <td className="py-2">{r.report_date?.slice(0, 10)}</td>
                  <td>{r.vehicles_evaluated}</td><td>{r.customer_visits}</td>
                  <td>{r.quotations_made}</td><td>{r.purchases_closed}</td><td>{r.followups}</td>
                </tr>
              ))}
              {mine.length === 0 && <tr><td colSpan={6} className="py-4 text-center text-gray-400">No reports yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Leaderboard() {
  const [period, setPeriod] = useState("month");
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    setLoading(true);
    api.get("/productivity/leaderboard", { params: { period } }).then((r) => setRows(r.data)).finally(() => setLoading(false));
  }, [period]);

  const medal = (i: number) => (i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}`);

  return (
    <div className="card p-5">
      <div className="flex justify-between items-center mb-4">
        <h3 className="font-semibold text-gray-900 dark:text-white">Performance Leaderboard</h3>
        <select className="input max-w-[160px]" value={period} onChange={(e) => setPeriod(e.target.value)}>
          <option value="week">This Week</option><option value="month">This Month</option><option value="all">All Time</option>
        </select>
      </div>
      {loading ? <Spinner /> : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-gray-400 border-b border-gray-100 dark:border-gray-700">
              <th className="py-2 w-12">#</th><th>Name</th><th>Branch</th><th>Eval</th><th>Visits</th>
              <th>Quotes</th><th>Closed</th><th>Conv%</th><th>Score</th>
            </tr></thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.id} className="border-b border-gray-50 dark:border-gray-700/50">
                  <td className="py-2 text-lg">{medal(i)}</td>
                  <td className="font-medium text-gray-900 dark:text-white">{r.name}</td>
                  <td className="text-gray-500">{r.branch_name}</td>
                  <td>{r.evaluated}</td><td>{r.visits}</td><td>{r.quotations}</td><td>{r.purchases}</td>
                  <td>{r.conversion_pct}%</td>
                  <td><span className="badge bg-prakash-red/10 text-prakash-red">{r.score}</span></td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={9} className="py-4 text-center text-gray-400">No data for this period.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function TeamReports() {
  const [rows, setRows] = useState<any[]>([]);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [loading, setLoading] = useState(true);
  function load() {
    setLoading(true);
    api.get("/productivity/team", { params: { from, to } }).then((r) => setRows(r.data)).finally(() => setLoading(false));
  }
  useEffect(load, [from, to]);

  return (
    <div className="card p-5">
      <div className="flex gap-2 items-end mb-4 flex-wrap">
        <Field label="From"><input className="input max-w-[160px]" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
        <Field label="To"><input className="input max-w-[160px]" type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
      </div>
      {loading ? <Spinner /> : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-gray-400 border-b border-gray-100 dark:border-gray-700">
              <th className="py-2">Date</th><th>Name</th><th>Branch</th><th>Eval</th><th>Visits</th>
              <th>Enq</th><th>Quotes</th><th>Closed</th><th>F/U</th><th>Remarks</th>
            </tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-gray-50 dark:border-gray-700/50">
                  <td className="py-2">{r.report_date?.slice(0, 10)}</td>
                  <td className="font-medium text-gray-900 dark:text-white">{r.user_name}</td>
                  <td className="text-gray-500">{r.branch_name}</td>
                  <td>{r.vehicles_evaluated}</td><td>{r.customer_visits}</td><td>{r.tradein_enquiries}</td>
                  <td>{r.quotations_made}</td><td>{r.purchases_closed}</td><td>{r.followups}</td>
                  <td className="text-gray-400 text-xs max-w-[160px] truncate">{r.remarks}</td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={10} className="py-4 text-center text-gray-400">No reports in range.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ---------------- Enquiries (trade-in / trade-out) ---------------- */
const ENQ_FIELDS: [string, string, string?][] = [
  ["customer_name", "Customer Name"], ["mobile", "Mobile"], ["address", "Address"],
  ["pincode", "Pincode"], ["maker", "Maker"], ["model", "Model"],
  ["reg_year", "Reg Year", "number"], ["chassis_last5", "Chassis (last 5)"],
  ["asking_price", "Asking Price", "number"], ["price_given", "Price Given", "number"],
];

function EnquiriesTab() {
  const [type, setType] = useState<"TRADEIN" | "TRADEOUT">("TRADEIN");
  const [f, setF] = useState<any>({});
  const [rows, setRows] = useState<any[]>([]);
  const [msg, setMsg] = useState("");
  const set = (k: string) => (e: any) => setF({ ...f, [k]: e.target.value });

  function load() { api.get(`/enquiries?type=${type}`).then((r) => setRows(r.data)); }
  useEffect(load, [type]);

  async function submit() {
    setMsg("");
    try {
      await api.post("/enquiries", { ...f, type });
      setMsg("✓ Enquiry saved"); setF({}); load();
    } catch (e: any) { setMsg(e.response?.data?.error || "Failed"); }
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        {(["TRADEIN", "TRADEOUT"] as const).map((t) => (
          <button key={t} onClick={() => setType(t)}
            className={`px-3 py-1.5 rounded-lg text-sm ${type === t ? "bg-prakash-red text-white" : "bg-gray-100 dark:bg-gray-800 text-gray-600"}`}>
            {t === "TRADEIN" ? "Trade-In" : "Trade-Out"} Enquiry
          </button>
        ))}
      </div>

      <div className="card p-5">
        <h3 className="font-semibold mb-3 text-gray-900 dark:text-white">New {type === "TRADEIN" ? "Trade-In" : "Trade-Out"} Enquiry</h3>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {ENQ_FIELDS.map(([k, label, t]) => (
            <Field key={k} label={label}>
              <input className="input" type={t || "text"} value={f[k] || ""} onChange={set(k)} />
            </Field>
          ))}
        </div>
        <div className="flex items-center gap-3 mt-4">
          <button onClick={submit} disabled={!f.customer_name} className="btn btn-primary">Save Enquiry</button>
          {msg && <span className="text-sm text-green-600">{msg}</span>}
        </div>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="text-left text-gray-400 border-b border-gray-100 dark:border-gray-700">
            <th className="p-3">Date</th><th>Customer</th><th>Mobile</th><th>Vehicle</th>
            <th>Chassis5</th><th>Asking</th><th>Given</th><th>Status</th>
          </tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-gray-50 dark:border-gray-700/50">
                <td className="p-3 text-gray-500">{String(r.created_at).slice(0, 10)}</td>
                <td className="font-medium text-gray-900 dark:text-white">{r.customer_name}</td>
                <td className="text-gray-500">{r.mobile}</td>
                <td className="text-gray-500">{r.maker} {r.model} {r.reg_year}</td>
                <td className="text-gray-500">{r.chassis_last5}</td>
                <td>{INRl(r.asking_price)}</td>
                <td>{INRl(r.price_given)}</td>
                <td className="text-gray-500">{r.status}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={8} className="p-6 text-center text-gray-400">No enquiries logged yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ---------------- Targets ---------------- */
function TargetsTab({ isManager }: { isManager: boolean }) {
  const month = new Date().toISOString().slice(0, 7);
  const [rows, setRows] = useState<any[]>([]);
  const [edit, setEdit] = useState<any | null>(null);
  function load() { api.get(`/targets?month=${month}`).then((r) => setRows(r.data)); }
  useEffect(load, []);

  async function saveTarget() {
    await api.post("/targets", { ...edit, month });
    setEdit(null); load();
  }

  const pct = (done: number, target: number) => target > 0 ? Math.min(100, Math.round((done / target) * 100)) : 0;

  return (
    <div className="space-y-3">
      <p className="text-sm text-gray-500">Monthly targets for {month}. {isManager ? "Set each evaluator's target at the start of the month." : "Your target vs achievement this month."}</p>
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="text-left text-gray-400 border-b border-gray-100 dark:border-gray-700">
            <th className="p-3">Evaluator</th><th>Branch</th><th>Evaluations</th><th>Purchases</th><th>Purchase Value</th>{isManager && <th>Set</th>}
          </tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.evaluator_id} className="border-b border-gray-50 dark:border-gray-700/50">
                <td className="p-3 font-medium text-gray-900 dark:text-white">{r.evaluator_name}</td>
                <td className="text-gray-500">{r.branch_name}</td>
                <td>
                  <div className="flex items-center gap-2">
                    <span>{r.done_evaluations}/{r.target_evaluations || "—"}</span>
                    {r.target_evaluations > 0 && <Bar pct={pct(r.done_evaluations, r.target_evaluations)} />}
                  </div>
                </td>
                <td>
                  <div className="flex items-center gap-2">
                    <span>{r.done_purchases}/{r.target_purchases || "—"}</span>
                    {r.target_purchases > 0 && <Bar pct={pct(r.done_purchases, r.target_purchases)} />}
                  </div>
                </td>
                <td className="text-gray-500">{INRl(r.target_purchase_value)}</td>
                {isManager && <td><button onClick={() => setEdit({ evaluator_id: r.evaluator_id, target_evaluations: r.target_evaluations, target_purchases: r.target_purchases, target_purchase_value: r.target_purchase_value, name: r.evaluator_name })} className="text-xs text-prakash-red hover:underline">Set</button></td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {edit && (
        <Modal2 onClose={() => setEdit(null)} title={`Set target — ${edit.name} (${month})`}>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Evaluations"><input className="input" type="number" value={edit.target_evaluations || ""} onChange={(e) => setEdit({ ...edit, target_evaluations: Number(e.target.value) })} /></Field>
            <Field label="Purchases"><input className="input" type="number" value={edit.target_purchases || ""} onChange={(e) => setEdit({ ...edit, target_purchases: Number(e.target.value) })} /></Field>
            <Field label="Purchase Value ₹"><input className="input" type="number" value={edit.target_purchase_value || ""} onChange={(e) => setEdit({ ...edit, target_purchase_value: Number(e.target.value) })} /></Field>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <button onClick={() => setEdit(null)} className="btn btn-ghost">Cancel</button>
            <button onClick={saveTarget} className="btn btn-primary">Save Target</button>
          </div>
        </Modal2>
      )}
    </div>
  );
}

function Bar({ pct }: { pct: number }) {
  return (
    <div className="w-16 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
      <div className={`h-full ${pct >= 100 ? "bg-green-500" : pct >= 60 ? "bg-amber-500" : "bg-prakash-red"}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

// tiny inline number formatter (avoid extra import churn)
function INRl(n: any) { return n ? "₹" + Math.round(Number(n)).toLocaleString("en-IN") : "—"; }

function Modal2({ title, children, onClose }: any) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-semibold mb-4 text-gray-900 dark:text-white">{title}</h3>
        {children}
      </div>
    </div>
  );
}
