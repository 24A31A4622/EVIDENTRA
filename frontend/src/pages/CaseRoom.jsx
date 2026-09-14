import { useEffect, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  ClipboardList,
  FileText,
  Fingerprint,
  History,
  ShieldCheck,
  Users,
} from "lucide-react";
import { auth, db } from "../firebaseConfig";
import AppShell from "../components/AppShell";

export default function CaseRoom() {
  const { caseId } = useParams();

  const [profile, setProfile] = useState(null);
  const [caseData, setCaseData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("Overview");

  const navigate = useNavigate();

  useEffect(() => {
    async function loadCaseRoom() {
      const currentUser = auth.currentUser;
      const mfaVerified = sessionStorage.getItem("evidentraMfaVerified");

      if (!currentUser || mfaVerified !== "true") {
        navigate("/login");
        return;
      }

      try {
        const [profileSnapshot, caseSnapshot] = await Promise.all([
          getDoc(doc(db, "users", currentUser.uid)),
          getDoc(doc(db, "cases", caseId)),
        ]);

        if (!profileSnapshot.exists() || !caseSnapshot.exists()) {
          navigate("/dashboard");
          return;
        }

        setProfile(profileSnapshot.data());
        setCaseData(caseSnapshot.data());
      } catch (error) {
        console.error("Could not load Case Room:", error);
      } finally {
        setLoading(false);
      }
    }

    loadCaseRoom();
  }, [caseId, navigate]);

  if (loading) {
    return <main className="loading-screen">Opening secure Case Room...</main>;
  }

  if (!profile || !caseData) {
    return null;
  }

  const tabs = [
    { name: "Overview", icon: ClipboardList },
    { name: "Evidence", icon: Fingerprint },
    { name: "Documents", icon: FileText },
    { name: "Audit Trail", icon: History },
    { name: "Integrity Report", icon: ShieldCheck },
  ];

  return (
    <AppShell profile={profile}>
      <div className="page-container">
        <button className="back-link" onClick={() => navigate("/dashboard")}>
          <ArrowLeft size={17} />
          Back to My Cases
        </button>

        <header className="case-header">
          <div>
            <span className="eyebrow">SECURE CASE ROOM</span>
            <h2>{caseData.title}</h2>
            <p className="case-id-text">{caseData.caseId}</p>
          </div>

          <span className="status-badge open">{caseData.status}</span>
        </header>

        <div className="case-tabs">
          {tabs.map((tab) => {
            const Icon = tab.icon;

            return (
              <button
                className={`case-tab ${
                  activeTab === tab.name ? "selected" : ""
                }`}
                key={tab.name}
                onClick={() => setActiveTab(tab.name)}
              >
                <Icon size={16} />
                {tab.name}
              </button>
            );
          })}
        </div>

        {activeTab === "Overview" && (
          <section className="case-overview-grid">
            <article className="content-card case-description-card">
              <span className="card-label">CASE SUMMARY</span>
              <h3>Investigation overview</h3>

              <p>{caseData.description}</p>

              <div className="case-meta-grid">
                <div>
                  <span>CASE STATUS</span>
                  <strong>{caseData.status}</strong>
                </div>

                <div>
                  <span>CASE TYPE</span>
                  <strong>Cybercrime</strong>
                </div>

                <div>
                  <span>PRIORITY</span>
                  <strong className="amber-text">High</strong>
                </div>
              </div>
            </article>

            <article className="content-card">
              <div className="card-title-row">
                <div>
                  <span className="card-label">ASSIGNED PERSONNEL</span>
                  <h3>Case access</h3>
                </div>

                <Users size={20} />
              </div>

              <div className="assigned-list">
                <div>
                  <span className="person-dot investigator" />
                  <p>
                    <strong>Investigator</strong>
                    <small>Case management and evidence upload</small>
                  </p>
                </div>

                <div>
                  <span className="person-dot forensic" />
                  <p>
                    <strong>Forensic Officer</strong>
                    <small>Evidence verification and forensic reports</small>
                  </p>
                </div>

                <div>
                  <span className="person-dot legal" />
                  <p>
                    <strong>Legal Officer</strong>
                    <small>Legal document review</small>
                  </p>
                </div>

                <div>
                  <span className="person-dot admin" />
                  <p>
                    <strong>Administrator</strong>
                    <small>System oversight and audit access</small>
                  </p>
                </div>
              </div>
            </article>
          </section>
        )}

        {activeTab !== "Overview" && (
          <section className="content-card empty-tab">
            <span className="card-label">{activeTab.toUpperCase()}</span>
            <h3>{activeTab} module</h3>
            <p>
              This module will be implemented next. It is connected to case{" "}
              {caseData.caseId}.
            </p>
          </section>
        )}
      </div>
    </AppShell>
  );
}