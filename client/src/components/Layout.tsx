import { ReactNode, useState, useEffect } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../api";

const NAV = [
  { to: "/", label: "Dashboard", icon: "📊", roles: ["SUPER_ADMIN", "BRANCH_MANAGER", "EVALUATOR", "SALES_EXECUTIVE"] },
  { to: "/stock", label: "Stock", icon: "🚗", roles: ["SUPER_ADMIN", "BRANCH_MANAGER", "EVALUATOR", "SALES_EXECUTIVE"] },
  { to: "/productivity", label: "Productivity", icon: "📈", roles: ["SUPER_ADMIN", "BRANCH_MANAGER", "EVALUATOR"] },
  { to: "/valuation", label: "Valuation", icon: "💰", roles: ["SUPER_ADMIN", "BRANCH_MANAGER", "EVALUATOR"] },
  { to: "/proposals", label: "Proposals", icon: "📝", roles: ["SUPER_ADMIN", "BRANCH_MANAGER", "EVALUATOR"] },
  { to: "/quotations", label: "Quotations", icon: "🧾", roles: ["SUPER_ADMIN", "BRANCH_MANAGER", "SALES_EXECUTIVE"] },
  { to: "/analytics", label: "Analytics", icon: "📉", roles: ["SUPER_ADMIN", "BRANCH_MANAGER"] },
  { to: "/users", label: "Users", icon: "👥", roles: ["SUPER_ADMIN"] },
  { to: "/config", label: "Valuation Config", icon: "⚙️", roles: ["SUPER_ADMIN"] },
];

export default function Layout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const [dark, setDark] = useState(() => localStorage.getItem("theme") === "dark");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    localStorage.setItem("theme", dark ? "dark" : "light");
  }, [dark]);

  const items = NAV.filter((n) => n.roles.includes(user?.role || ""));

  return (
    <div className="min-h-screen flex">
      {/* Sidebar */}
      <aside className={`${open ? "block" : "hidden"} md:block w-60 bg-prakash-ink text-white fixed md:static h-full z-40`}>
        <div className="p-5 border-b border-white/10">
          <div className="text-xl font-extrabold">U TRUST <span className="text-prakash-red">2.0</span></div>
          <div className="text-xs text-gray-400 mt-0.5">Prakash Auto Hub</div>
        </div>
        <nav className="p-3 space-y-1">
          {items.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.to === "/"}
              onClick={() => setOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-lg text-sm ${
                  isActive ? "bg-prakash-red text-white" : "text-gray-300 hover:bg-white/10"
                }`
              }>
              <span>{n.icon}</span> {n.label}
            </NavLink>
          ))}
        </nav>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="bg-white dark:bg-gray-800 border-b border-gray-100 dark:border-gray-700 px-4 py-3 flex items-center justify-between">
          <button className="md:hidden btn btn-ghost" onClick={() => setOpen(!open)}>☰</button>
          <div className="text-sm text-gray-500 dark:text-gray-400">
            {user?.branch_name || "All Branches"}
          </div>
          <div className="flex items-center gap-3">
            <button onClick={() => setDark(!dark)} className="btn btn-ghost">{dark ? "☀️" : "🌙"}</button>
            <div className="text-right">
              <div className="text-sm font-medium text-gray-900 dark:text-white">{user?.name}</div>
              <div className="text-xs text-gray-400">{(user?.role || "").replace(/_/g, " ")}</div>
            </div>
            <button onClick={logout} className="btn btn-ghost">Logout</button>
          </div>
        </header>
        <main className="p-4 md:p-6 flex-1 overflow-x-hidden">{children}</main>
      </div>
    </div>
  );
}
