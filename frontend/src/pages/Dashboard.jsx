import { useEffect, useState } from "react";
import { doc, getDoc, collection, getDocs, query, where } from "firebase/firestore";
import { useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  ArrowRight,
  FolderKanban,
  Plus,
  ShieldCheck,
} from "lucide-react";
import { auth, db } from "../firebaseConfig";
import AppShell from "../components/AppShell";

export default function Dashboard() {
  const [profile, setProfile] = useState(null);
  const [cases, setCases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const navigate = useNavigate();

  useEffect(() => {
    async function loadDashboard() {
      const currentUser = auth.currentUser;
      const mfaVerified = sessionStorage.getItem("evidentraMfaVerified");

      if (!currentUser || mfaVerified !== "true") {
        navigate("/login");
        return;
      }

      try {
        const profileSnapshot = await getDoc(
          doc(db, "users", currentUser.uid)
        );

        if (!profileSnapshot.exists()) {
          setError("No secure user profile was found for this account.");
          return;
        }

        const currentProfile = profileSnapshot.data();

        if (currentProfile.active !== true) {
          setError("This account has been deactivated.");
          return;
        }

        setProfile(currentProfile);

        const casesQuery = query(
          collection(db, "cases"),
          where("assignedUserIds", "array-contains", currentUser.uid)
        );

        const casesSnapshot = await getDocs(casesQuery);

        setCases(
          casesSnapshot.docs.map((caseDocument) => ({
            id: caseDocument.id,
            ...caseDocument.data(),
          }))
        );
      } catch (err) {
        console.error("Could not load dashboard:", err);
        setError(
          "Could not load case data. Check your Firestore Rules and make sure this user's UID is inside assignedUserIds."
        );
      } finally {
        setLoading(false);
      }
    }

    loadDashboard();
  }, [navigate]);

  if (loading) {
    return <main className="loading-screen">Loading secure workspace...</main>;
  }

  if (error || !profile) {
    return (
      <main className="dashboard-placeholder">
        <section>
          <h2>Dashboard access needs attention</h2>
          <p>{error}</p>
        </section>
      </main>
    );
  }

  return (
    <AppShell profile={profile}>
      <div className="page-container">
        <header className="dashboard-header">
          <div>
            <span className="eyebrow">SECURE CASE WORKSPACE</span>
            <h2>Welcome back, {profile.displayName}</h2>
            <p>
              Access your assigned investigation records and evidence securely.
            </p>
          </div>

          {profile.role === "Investigator" && (
            <button className="primary-button compact-button">
              <Plus size={18} />
              Create new case
            </button>
          )}
        </header>

        <section className="security-banner">
          <ShieldCheck size={24} />

          <div>
            <strong>Secure workspace access verified</strong>
            <p>
              Your session is protected by role-based access and MFA
              verification.
            </p>
          </div>
        </section>

        <section className="dashboard-section-heading">
          <div>
            <span className="card-label">MY ASSIGNED CASES</span>
            <h3>Active investigations</h3>
          </div>

          <span className="case-count">
            {cases.length} case{cases.length !== 1 ? "s" : ""}
          </span>
        </section>

        {cases.length === 0 ? (
          <div className="empty-state">
            <FolderKanban size={35} />
            <h3>No cases assigned</h3>
            <p>No investigation case has been assigned to this account yet.</p>
          </div>
        ) : (
          <section className="case-card-grid">
            {cases.map((item) => (
              <article className="case-card" key={item.id}>
                <div className="case-card-top">
                  <div className="case-folder-icon">
                    <FolderKanban size={21} />
                  </div>

                  <span className="status-badge open">{item.status}</span>
                </div>

                <p className="case-id-text">{item.caseId}</p>
                <h3>{item.title}</h3>
                <p>{item.description}</p>

                <div className="case-card-footer">
                  <span>
                    <AlertTriangle size={15} />
                    High priority
                  </span>

                  <button onClick={() => navigate(`/cases/${item.id}`)}>
                    Open case room
                    <ArrowRight size={16} />
                  </button>
                </div>
              </article>
            ))}
          </section>
        )}
      </div>
    </AppShell>
  );
}