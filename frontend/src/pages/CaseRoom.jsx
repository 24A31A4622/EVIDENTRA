import { useEffect, useRef, useState } from "react";
import {
  collection,
  getDocs,
  orderBy,
  query,
  where,
} from "firebase/firestore";
import { doc, getDoc } from "firebase/firestore";
import { useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  ClipboardList,
  Eye,
  FileText,
  Fingerprint,
  History,
  LoaderCircle,
  Plus,
  ShieldCheck,
  Upload,
  Users,
  X,
} from "lucide-react";
import { auth, db } from "../firebaseConfig";
import AppShell from "../components/AppShell";
import { uploadEvidence } from "../services/evidenceService";

function formatFileSize(bytes) {
  if (!bytes) return "0 B";

  const units = ["B", "KB", "MB", "GB"];
  const unitIndex = Math.floor(Math.log(bytes) / Math.log(1024));

  return `${(bytes / 1024 ** unitIndex).toFixed(
    unitIndex === 0 ? 0 : 1
  )} ${units[unitIndex]}`;
}

function formatDate(timestamp) {
  if (!timestamp?.toDate) return "Just now";

  return timestamp.toDate().toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function shortHash(hash) {
  if (!hash) return "Pending";
  return `${hash.slice(0, 12)}...${hash.slice(-10)}`;
}

export default function CaseRoom() {
  const { caseId } = useParams();

  const [profile, setProfile] = useState(null);
  const [caseData, setCaseData] = useState(null);
  const [evidenceItems, setEvidenceItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [evidenceLoading, setEvidenceLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("Overview");
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [selectedEvidence, setSelectedEvidence] = useState(null);
  const [uploadError, setUploadError] = useState("");
  const [uploadSuccess, setUploadSuccess] = useState("");
  const [uploading, setUploading] = useState(false);

  const [title, setTitle] = useState("");
  const [evidenceType, setEvidenceType] = useState("Image");
  const [selectedFile, setSelectedFile] = useState(null);

  const fileInputRef = useRef(null);
  const navigate = useNavigate();

  const canUpload = [
    "Investigator",
    "Forensic Officer",
  ].includes(profile?.role);

  async function loadEvidence() {
    setEvidenceLoading(true);

    try {
      const evidenceQuery = query(
        collection(db, "evidence"),
        where("caseId", "==", caseId),
        orderBy("uploadedAt", "desc")
      );

      const evidenceSnapshot = await getDocs(evidenceQuery);

      setEvidenceItems(
        evidenceSnapshot.docs.map((evidenceDocument) => ({
          id: evidenceDocument.id,
          ...evidenceDocument.data(),
        }))
      );
    } catch (error) {
      console.error("Could not load evidence:", error);

      try {
        const fallbackQuery = query(
          collection(db, "evidence"),
          where("caseId", "==", caseId)
        );

        const fallbackSnapshot = await getDocs(fallbackQuery);

        setEvidenceItems(
          fallbackSnapshot.docs.map((evidenceDocument) => ({
            id: evidenceDocument.id,
            ...evidenceDocument.data(),
          }))
        );
      } catch (fallbackError) {
        console.error("Evidence fallback query failed:", fallbackError);
      }
    } finally {
      setEvidenceLoading(false);
    }
  }

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

        const loadedProfile = {
          uid: currentUser.uid,
          ...profileSnapshot.data(),
        };

        setProfile(loadedProfile);
        setCaseData(caseSnapshot.data());
      } catch (error) {
        console.error("Could not load Case Room:", error);
      } finally {
        setLoading(false);
      }
    }

    loadCaseRoom();
  }, [caseId, navigate]);

  useEffect(() => {
    if (profile && (activeTab === "Evidence" || activeTab === "Overview")) {
      loadEvidence();
    }
  }, [profile, activeTab]);

  function resetUploadForm() {
    setTitle("");
    setEvidenceType("Image");
    setSelectedFile(null);
    setUploadError("");
  }

  function closeUploadModal() {
    resetUploadForm();
    setShowUploadModal(false);
  }

  async function handleUpload(event) {
    event.preventDefault();
    setUploadError("");
    setUploadSuccess("");

    if (!selectedFile) {
      setUploadError("Please select an evidence file first.");
      return;
    }

    if (!title.trim()) {
      setUploadError("Please enter an evidence title.");
      return;
    }

    setUploading(true);

    try {
      const result = await uploadEvidence({
        caseId,
        title: title.trim(),
        evidenceType,
        file: selectedFile,
        profile,
      });

      setUploadSuccess(
        `Evidence registered successfully. SHA-256: ${shortHash(
          result.sha256Hash
        )}`
      );

      closeUploadModal();
      await loadEvidence();
    } catch (error) {
      console.error("Evidence upload failed:", error);
      setUploadError(
        "Could not register evidence. Check Firestore Rules and try again."
      );
    } finally {
      setUploading(false);
    }
  }

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

        {uploadSuccess && (
          <div className="success-banner">
            <ShieldCheck size={20} />
            <div>
              <strong>Evidence integrity registered</strong>
              <p>{uploadSuccess}</p>
            </div>
            <button onClick={() => setUploadSuccess("")}>
              <X size={17} />
            </button>
          </div>
        )}

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

        {activeTab === "Evidence" && (
          <section>
            <div className="module-header">
              <div>
                <span className="card-label">EVIDENCE REGISTER</span>
                <h3>Case evidence</h3>
                <p>
                  Every evidence item receives a SHA-256 fingerprint and a
                  tamper-evident ledger registration record.
                </p>
              </div>

              {canUpload && (
                <button
                  className="primary-button compact-button"
                  onClick={() => setShowUploadModal(true)}
                >
                  <Plus size={18} />
                  Upload evidence
                </button>
              )}
            </div>

            {evidenceLoading ? (
              <div className="evidence-loading">
                <LoaderCircle size={23} />
                Loading registered evidence...
              </div>
            ) : evidenceItems.length === 0 ? (
              <div className="empty-state">
                <Fingerprint size={35} />
                <h3>No evidence registered</h3>
                <p>
                  Upload the first evidence item to create its cryptographic
                  fingerprint and integrity record.
                </p>

                {canUpload && (
                  <button
                    className="primary-button compact-button"
                    onClick={() => setShowUploadModal(true)}
                  >
                    <Upload size={17} />
                    Register first evidence
                  </button>
                )}
              </div>
            ) : (
              <div className="evidence-table-wrapper">
                <table className="evidence-table">
                  <thead>
                    <tr>
                      <th>Evidence</th>
                      <th>Version</th>
                      <th>Integrity</th>
                      <th>SHA-256 fingerprint</th>
                      <th>Uploaded</th>
                      <th />
                    </tr>
                  </thead>

                  <tbody>
                    {evidenceItems.map((item) => (
                      <tr key={item.id}>
                        <td>
                          <div className="evidence-name">
                            <div className="evidence-file-icon">
                              <FileText size={18} />
                            </div>
                            <div>
                              <strong>{item.title}</strong>
                              <span>
                                {item.evidenceType} · {item.originalFileName} ·{" "}
                                {formatFileSize(item.fileSize)}
                              </span>
                            </div>
                          </div>
                        </td>

                        <td>v{item.version || 1}</td>

                        <td>
                          <span
                            className={`integrity-badge ${
                              item.integrityStatus === "Verified"
                                ? "verified"
                                : "mismatch"
                            }`}
                          >
                            <ShieldCheck size={14} />
                            {item.integrityStatus || "Not checked"}
                          </span>
                        </td>

                        <td>
                          <code className="hash-text">
                            {shortHash(item.sha256Hash)}
                          </code>
                        </td>

                        <td>
                          <span className="uploaded-info">
                            {item.uploadedByName || item.uploadedBy}
                            <small>{formatDate(item.uploadedAt)}</small>
                          </span>
                        </td>

                        <td>
                          <button
                            className="icon-action-button"
                            title="View evidence registration"
                            onClick={() => setSelectedEvidence(item)}
                          >
                            <Eye size={17} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}

        {activeTab !== "Overview" && activeTab !== "Evidence" && (
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

      {showUploadModal && (
        <div className="modal-overlay">
          <div className="evidence-modal">
            <div className="modal-header">
              <div>
                <span className="card-label">EVIDENCE REGISTRATION</span>
                <h3>Register new evidence</h3>
              </div>

              <button className="modal-close" onClick={closeUploadModal}>
                <X size={20} />
              </button>
            </div>

            <form className="evidence-form" onSubmit={handleUpload}>
              <label>
                Evidence title
                <input
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder="Example: WhatsApp chat screenshot"
                  required
                />
              </label>

              <label>
                Evidence type
                <select
                  value={evidenceType}
                  onChange={(event) => setEvidenceType(event.target.value)}
                >
                  <option>Image</option>
                  <option>Document</option>
                  <option>Chat Log</option>
                  <option>Audio</option>
                  <option>Video</option>
                  <option>Forensic Report</option>
                  <option>Other</option>
                </select>
              </label>

              <input
                ref={fileInputRef}
                type="file"
                className="hidden-file-input"
                onChange={(event) => setSelectedFile(event.target.files?.[0] || null)}
              />

              <button
                type="button"
                className="file-drop-zone"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload size={25} />
                <strong>
                  {selectedFile
                    ? selectedFile.name
                    : "Select an evidence file"}
                </strong>
                <span>
                  {selectedFile
                    ? `${formatFileSize(selectedFile.size)} selected`
                    : "The original file is hashed locally before registration."}
                </span>
              </button>

              <div className="hash-explanation">
                <Fingerprint size={19} />
                <p>
                  EVIDENTRA will calculate a real SHA-256 digital fingerprint,
                  save evidence metadata, create an audit entry, and register a
                  prototype ledger record.
                </p>
              </div>

              {uploadError && <p className="form-error">{uploadError}</p>}

              <div className="modal-actions">
                <button
                  className="secondary-button"
                  type="button"
                  onClick={closeUploadModal}
                  disabled={uploading}
                >
                  Cancel
                </button>

                <button
                  className="primary-button compact-button"
                  type="submit"
                  disabled={uploading}
                >
                  {uploading ? (
                    <>
                      <LoaderCircle className="spin-icon" size={17} />
                      Registering evidence...
                    </>
                  ) : (
                    <>
                      <Fingerprint size={17} />
                      Hash and register
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {selectedEvidence && (
        <div className="modal-overlay">
          <div className="evidence-modal details-modal">
            <div className="modal-header">
              <div>
                <span className="card-label">EVIDENCE REGISTRATION DETAILS</span>
                <h3>{selectedEvidence.title}</h3>
              </div>

              <button
                className="modal-close"
                onClick={() => setSelectedEvidence(null)}
              >
                <X size={20} />
              </button>
            </div>

            <div className="evidence-detail-list">
              <div>
                <span>ORIGINAL FILE</span>
                <strong>{selectedEvidence.originalFileName}</strong>
              </div>

              <div>
                <span>EVIDENCE TYPE</span>
                <strong>{selectedEvidence.evidenceType}</strong>
              </div>

              <div>
                <span>INTEGRITY STATUS</span>
                <strong className="verified-text">
                  ✓ {selectedEvidence.integrityStatus}
                </strong>
              </div>

              <div>
                <span>SHA-256 FINGERPRINT</span>
                <code>{selectedEvidence.sha256Hash}</code>
              </div>

              <div>
                <span>STORAGE MODE</span>
                <strong>{selectedEvidence.storageStatus}</strong>
              </div>

              <div>
                <span>UPLOADED BY</span>
                <strong>
                  {selectedEvidence.uploadedByName} (
                  {selectedEvidence.uploadedByRole})
                </strong>
              </div>
            </div>

            <div className="modal-actions">
              <button
                className="primary-button"
                onClick={() => setSelectedEvidence(null)}
              >
                Close details
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}