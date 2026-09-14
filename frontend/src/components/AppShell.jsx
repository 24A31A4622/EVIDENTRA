import { LayoutDashboard, FolderKanban, ShieldCheck, LogOut } from "lucide-react";
import { signOut } from "firebase/auth";
import { useLocation, useNavigate } from "react-router-dom";
import { auth } from "../firebaseConfig";

export default function AppShell({ profile, children }) {
  const navigate = useNavigate();
  const location = useLocation();

  async function handleLogout() {
    await signOut(auth);
    sessionStorage.clear();
    navigate("/login");
  }

  const navItems = [
    {
      label: "Dashboard",
      icon: LayoutDashboard,
      path: "/dashboard",
    },
    {
      label: "My Cases",
      icon: FolderKanban,
      path: "/dashboard",
    },
  ];

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="brand-mark">E</div>

          <div>
            <h1>EVIDENTRA</h1>
            <p>SECURE CASE SYSTEM</p>
          </div>
        </div>

        <nav className="sidebar-nav">
          <span className="nav-label">WORKSPACE</span>

          {navItems.map((item) => {
            const Icon = item.icon;

            const active =
              item.path === "/dashboard"
                ? location.pathname === "/dashboard"
                : location.pathname.startsWith(item.path);

            return (
              <button
                className={`nav-item ${active ? "active" : ""}`}
                key={item.label}
                onClick={() => navigate(item.path)}
              >
                <Icon size={18} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="sidebar-footer">
          <div className="role-chip">
            <ShieldCheck size={16} />
            <span>{profile.role}</span>
          </div>

          <div className="sidebar-user">
            <div className="user-avatar">
              {profile.displayName?.charAt(0) || "U"}
            </div>

            <div>
              <strong>{profile.displayName}</strong>
              <span>{profile.email}</span>
            </div>
          </div>

          <button className="logout-button" onClick={handleLogout}>
            <LogOut size={17} />
            Secure logout
          </button>
        </div>
      </aside>

      <main className="app-content">{children}</main>
    </div>
  );
}