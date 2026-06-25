import { ReactNode } from "react";

export const STATUS_COLORS: Record<string, string> = {
  IN_STOCK: "bg-blue-100 text-blue-700",
  PURCHASED: "bg-indigo-100 text-indigo-700",
  READY_FOR_SALE: "bg-green-100 text-green-700",
  UNDER_REFURBISHMENT: "bg-amber-100 text-amber-700",
  RESERVED: "bg-purple-100 text-purple-700",
  SOLD: "bg-gray-200 text-gray-700",
  DELIVERED: "bg-gray-300 text-gray-800",
  PENDING_MANAGER: "bg-amber-100 text-amber-700",
  PENDING_ADMIN: "bg-orange-100 text-orange-700",
  APPROVED: "bg-green-100 text-green-700",
  REJECTED: "bg-red-100 text-red-700",
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`badge ${STATUS_COLORS[status] || "bg-gray-100 text-gray-600"}`}>
      {(status || "").replace(/_/g, " ")}
    </span>
  );
}

export function Kpi({ label, value, sub, accent }: { label: string; value: ReactNode; sub?: string; accent?: boolean }) {
  return (
    <div className={`card p-4 ${accent ? "ring-2 ring-prakash-red/20" : ""}`}>
      <div className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">{label}</div>
      <div className="text-2xl font-bold mt-1 text-gray-900 dark:text-white">{value}</div>
      {sub && <div className="text-xs text-gray-400 mt-1">{sub}</div>}
    </div>
  );
}

export function Modal({ open, onClose, title, children, wide }: {
  open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-start justify-center p-4 overflow-y-auto">
      <div className={`card p-6 w-full ${wide ? "max-w-3xl" : "max-w-lg"} my-8`}>
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-bold text-gray-900 dark:text-white">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Spinner() {
  return (
    <div className="flex justify-center py-12">
      <div className="animate-spin h-8 w-8 border-3 border-prakash-red border-t-transparent rounded-full" />
    </div>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <label className="label">{label}</label>
      {children}
    </div>
  );
}
