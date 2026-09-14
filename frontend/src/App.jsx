import { Routes, Route, Navigate } from "react-router-dom";
import Login from "./pages/Login";
import MfaVerify from "./pages/MfaVerify";
import Dashboard from "./pages/Dashboard";
import CaseRoom from "./pages/CaseRoom";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route path="/login" element={<Login />} />
      <Route path="/mfa" element={<MfaVerify />} />
      <Route path="/dashboard" element={<Dashboard />} />
      <Route path="/cases/:caseId" element={<CaseRoom />} />
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}