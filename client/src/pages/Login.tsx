import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../api";

export default function Login() {
  const { login } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState("admin@prakashautohub.com");
  const [password, setPassword] = useState("Prakash@123");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    setErr(""); setBusy(true);
    try {
      await login(email, password);
      nav("/");
    } catch (e: any) {
      setErr(e.response?.data?.error || "Login failed");
    } finally { setBusy(false); }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-prakash-ink p-4">
      <div className="card p-8 w-full max-w-md">
        <div className="text-center mb-6">
          <div className="text-3xl font-extrabold">U TRUST <span className="text-prakash-red">2.0</span></div>
          <div className="text-sm text-gray-500 mt-1">Prakash Auto Hub — Pre-Owned Vehicle Management</div>
        </div>
        {err && <div className="bg-red-50 text-red-600 text-sm rounded-lg p-3 mb-4">{err}</div>}
        <div className="space-y-3">
          <div>
            <label className="label">Email</label>
            <input className="input" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div>
            <label className="label">Password</label>
            <input className="input" type="password" value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()} />
          </div>
          <button className="btn btn-primary w-full" disabled={busy} onClick={submit}>
            {busy ? "Signing in…" : "Sign In"}
          </button>
        </div>
        <div className="mt-6 text-xs text-gray-400 border-t pt-4">
          <div className="font-medium mb-1">Demo accounts (password: Prakash@123)</div>
          <div>Super Admin · admin@prakashautohub.com</div>
          <div>Branch Manager · manager.pna@prakashautohub.com</div>
          <div>Evaluator · dilnawaz.pna@prakashautohub.com</div>
          <div>Sales · sales.pna@prakashautohub.com</div>
        </div>
      </div>
    </div>
  );
}
