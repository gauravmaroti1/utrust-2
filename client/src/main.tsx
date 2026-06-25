import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./api";
import Layout from "./components/Layout";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Stock from "./pages/Stock";
import Productivity from "./pages/Productivity";
import Valuation from "./pages/Valuation";
import Proposals from "./pages/Proposals";
import Quotations from "./pages/Quotations";
import Analytics from "./pages/Analytics";
import Users from "./pages/Users";
import Config from "./pages/Config";
import "./index.css";

function Protected({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  return <Layout>{children}</Layout>;
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<Protected><Dashboard /></Protected>} />
        <Route path="/stock" element={<Protected><Stock /></Protected>} />
        <Route path="/productivity" element={<Protected><Productivity /></Protected>} />
        <Route path="/valuation" element={<Protected><Valuation /></Protected>} />
        <Route path="/proposals" element={<Protected><Proposals /></Protected>} />
        <Route path="/quotations" element={<Protected><Quotations /></Protected>} />
        <Route path="/analytics" element={<Protected><Analytics /></Protected>} />
        <Route path="/users" element={<Protected><Users /></Protected>} />
        <Route path="/config" element={<Protected><Config /></Protected>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </React.StrictMode>
);
