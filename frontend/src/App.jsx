import { Routes, Route, Navigate } from "react-router-dom";
import Login from "./pages/Login";
import MfaVerify from "./pages/MfaVerify";
import Dashboard from "./pages/Dashboard";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route path="/login" element={<Login />} />
      <Route path="/mfa" element={<MfaVerify />} />
      <Route path="/dashboard" element={<Dashboard />} />
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}