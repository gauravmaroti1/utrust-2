import axios from "axios";
import { createContext, useContext, useEffect, useState, ReactNode } from "react";

export const api = axios.create({ baseURL: "/api" });

api.interceptors.request.use((cfg) => {
  const t = localStorage.getItem("token");
  if (t) cfg.headers.Authorization = `Bearer ${t}`;
  return cfg;
});

api.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err.response?.status === 401 && !location.pathname.includes("login")) {
      localStorage.removeItem("token");
      localStorage.removeItem("user");
      location.href = "/login";
    }
    return Promise.reject(err);
  }
);

export interface User {
  id: number; name: string; email: string; role: string;
  branch_id: number | null; branch_code?: string; branch_name?: string;
}

interface AuthCtx {
  user: User | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}
const Ctx = createContext<AuthCtx>(null as any);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(() => {
    const u = localStorage.getItem("user");
    return u ? JSON.parse(u) : null;
  });

  async function login(email: string, password: string) {
    const { data } = await api.post("/auth/login", { email, password });
    localStorage.setItem("token", data.token);
    localStorage.setItem("user", JSON.stringify(data.user));
    setUser(data.user);
  }
  function logout() {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    setUser(null);
    location.href = "/login";
  }
  return <Ctx.Provider value={{ user, login, logout }}>{children}</Ctx.Provider>;
}

export const useAuth = () => useContext(Ctx);

// role helpers
export const can = {
  manageUsers: (r?: string) => r === "SUPER_ADMIN",
  approveAdmin: (r?: string) => r === "SUPER_ADMIN",
  approveManager: (r?: string) => r === "SUPER_ADMIN" || r === "BRANCH_MANAGER",
  editConfig: (r?: string) => r === "SUPER_ADMIN",
  evaluate: (r?: string) => r === "SUPER_ADMIN" || r === "EVALUATOR",
  quote: (r?: string) => r === "SUPER_ADMIN" || r === "SALES_EXECUTIVE" || r === "BRANCH_MANAGER",
};

export const INR = (n: any) =>
  "₹" + Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 });
