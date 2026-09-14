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
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ClipboardList,
  Eye,
  FileText,
  Fingerprint,
  History,
  LoaderCircle,
  Plus,
  SearchCheck,
  ShieldAlert,
  ShieldCheck,
  Upload,
  Users,
  X,
} from "lucide-react";
import { auth, db } from "../firebaseConfig";
import AppShell from "../components/AppShell";
import {
  getAuditLogsForCase,
  simulateEvidenceTamper,
  uploadEvidence,
  verifyEvidenceIntegrity,
} from "../services/evidenceService";

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

function getActionLabel(action) {
  const labels = {
    UPLOAD: "Evidence uploaded",
    INTEGRITY_CHECK: "Integrity verification",
    FILE_MODIFIED_DEMO: "Demo tamper simulation",
  };

  return labels[action] || action?.replaceAll("_", " ") || "System action";
}

export default function CaseRoom() {
  const { caseId } = useParams();

  const [profile, setProfile] = useState(null);
  const [caseData, setCaseData] = useState(null);
  const [evidenceItems, setEvidenceItems] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);

  const [loading, setLoading] = useState(true);
  const [evidenceLoading, setEvidenceLoading] = useState(false);
  const [auditLoading, setAuditLoading] = useState(false);

  const [activeTab, setActiveTab] = useState("Overview");
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [selectedEvidence, setSelectedEvidence] = useState(null);
  const [uploadError, setUploadError] = useState("");
  const [uploadSuccess, setUploadSuccess] = useState("");
  const [actionMessage, setActionMessage] = useState("");
  const [uploading, setUploading] = useState(false);
  const [processingEvidenceId, setProcessingEvidenceId] = useState("");

  const [title, setTitle] = useState("");
  const [evidenceType, setEvidenceType] = useState("Image");
  const [selectedFile, setSelectedFile] = useState(null);

  const fileInputRef = useRef(null);
  const navigate = useNavigate();

  const canUpload = ["Investigator", "Forensic Officer"].includes(
    profile?.role
  );

  const canVerify = ["Investigator", "Forensic Officer", "Administrator"].includes(
    profile?.role
  );

  const canSimulateTamper = ["Investigator", "Administrator"].includes(
    profile?.role
  );

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
      console.warn("Ordered evidence query failed, using fallback:", error);

      try {
        const fallbackQuery = query(
          collection(db, "evidence"),
          where("caseId", "==", caseId)
        );

        const fallbackSnapshot = await getDocs(fallbackQuery);

        const items = fallbackSnapshot.docs.map((evidenceDocument) => ({
          id: evidenceDocument.id,
          ...evidenceDocument.data(),
        }));

        items.sort((firstItem, secondItem) => {
          const firstTime = firstItem.uploadedAt?.toMillis?.() || 0;
          const secondTime = secondItem.uploadedAt?.toMillis?.() || 0;
          return secondTime - firstTime;
        });

        setEvidenceItems(items);
      } catch (fallbackError) {
        console.error("Could not load evidence:", fallbackError);
      }
    } finally {
      setEvidenceLoading(false);
    }
  }

  async function loadAuditLogs() {
    setAuditLoading(true);

    try {
      const logs = await getAuditLogsForCase(caseId);
      setAuditLogs(logs);
    } catch (error) {
      console.error("Could not load audit logs:", error);
    } finally {
      setAuditLoading(false);
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

        setProfile({
          uid: currentUser.uid,
          ...profileSnapshot.data(),
        });

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
    if (profile) {
      loadEvidence();
    }
  }, [profile]);

  useEffect(() => {
    if (profile && activeTab === "Audit Trail") {
      loadAuditLogs();
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

      closeUploadModal();
      setUploadSuccess(
        `Evidence registered. SHA-256 fingerprint: ${shortHash(
          result.sha256Hash
        )}`
      );

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

  async function handleVerifyIntegrity(evidence) {
    setActionMessage("");
    setProcessingEvidenceId(evidence.id);

    try {
      const result = await verifyEvidenceIntegrity({ evidence, profile });

      setActionMessage(
        result.isVerified
          ? `Integrity verified: ${evidence.originalFileName} matches its registered SHA-256 fingerprint.`
          : `INTEGRITY MISMATCH: ${evidence.originalFileName} differs from its registered SHA-256 fingerprint.`
      );

      await loadEvidence();
      await loadAuditLogs();
    } catch (error) {
      console.error("Integrity verification failed:", error);
      setActionMessage("Integrity verification could not be completed.");
    } finally {
      setProcessingEvidenceId("");
    }
  }

  async function handleTamperSimulation(evidence) {
    const accepted = window.confirm(
      `Demo only: simulate tampering for "${evidence.originalFileName}"? This will change the current fingerprint and trigger an integrity mismatch.`
    );

    if (!accepted) return;

    setActionMessage("");
    setProcessingEvidenceId(evidence.id);

    try {
      await simulateEvidenceTamper({ evidence, profile });

      setActionMessage(
        `DEMO TAMPER SIMULATION COMPLETE: The current fingerprint for ${evidence.originalFileName} was changed. Run Verify Integrity to see the mismatch.`
      );

      await loadEvidence();
      await loadAuditLogs();
    } catch (error) {
      console.error("Tamper simulation failed:", error);
      setActionMessage("Tamper simulation could not be completed.");
    } finally {
      setProcessingEvidenceId("");
    }
  }

  if (loading) {
    return <main className="loading-screen">Opening secure Case Room...</main>;
  }

  if (!profile || !caseData) {
    return null;
  }

  const verifiedCount = evidenceItems.filter(
    (item) => item.integrityStatus === "Verified"
  ).length;

  const mismatchCount = evidenceItems.filter(
    (item) => item.integrityStatus === "Mismatch"
  ).length;

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

        {actionMessage && (
          <div
            className={`integrity-message ${
              actionMessage.includes("MISMATCH") ||
              actionMessage.includes("TAMPER")
                ? "danger"
                : "safe"
            }`}
          >
            {actionMessage.includes("MISMATCH") ||
            actionMessage.includes("TAMPER") ? (
              <ShieldAlert size={21} />
            ) : (
              <CheckCircle2 size={21} />
            )}

            <div>
              <strong>
                {actionMessage.includes("MISMATCH")
                  ? "Integrity alert"
                  : actionMessage.includes("TAMPER")
                  ? "Demo tamper event"
                  : "Integrity verification"}
              </strong>
              <p>{actionMessage}</p>
            </div>

            <button onClick={() => setActionMessage("")}>
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
                  Every item has a registered SHA-256 fingerprint, version
                  metadata, integrity status, and audit record.
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
                      <th>Actions</th>
                    </tr>
                  </thead>

                  <tbody>
                    {evidenceItems.map((item) => {
                      const isProcessing = processingEvidenceId === item.id;

                      return (
                        <tr key={item.id}>
                          <td>
                            <div className="evidence-name">
                              <div className="evidence-file-icon">
                                <FileText size={18} />
                              </div>
                              <div>
                                <strong>{item.title}</strong>
                                <span>
                                  {item.evidenceType} · {item.originalFileName}{" "}
                                  · {formatFileSize(item.fileSize)}
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
                              {item.integrityStatus === "Verified" ? (
                                <ShieldCheck size={14} />
                              ) : (
                                <ShieldAlert size={14} />
                              )}
                              {item.integrityStatus || "Not checked"}
                            </span>
                          </td>

                          <td>
                            <code className="hash-text">
                              {shortHash(item.sha256Hash)}
                            </code>
                          </td>

                          <td>
                            <div className="evidence-actions">
                              <button
                                className="table-action view"
                                title="View evidence details"
                                onClick={() => setSelectedEvidence(item)}
                              >
                                <Eye size={15} />
                                Details
                              </button>

                              {canVerify && (
                                <button
                                  className="table-action verify"
                                  disabled={isProcessing}
                                  onClick={() => handleVerifyIntegrity(item)}
                                >
                                  {isProcessing ? (
                                    <LoaderCircle className="spin-icon" size={15} />
                                  ) : (
                                    <SearchCheck size={15} />
                                  )}
                                  Verify
                                </button>
                              )}

                              {canSimulateTamper && (
                                <button
                                  className="table-action tamper"
                                  disabled={isProcessing || item.tamperSimulated}
                                  onClick={() => handleTamperSimulation(item)}
                                >
                                  <AlertTriangle size={15} />
                                  {item.tamperSimulated
                                    ? "Tampered"
                                    : "Demo Tamper"}
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}

        {activeTab === "Audit Trail" && (
          <section>
            <div className="module-header">
              <div>
                <span className="card-label">CHAIN OF CUSTODY</span>
                <h3>Case audit trail</h3>
                <p>
                  A chronological record of who performed what action, when,
                  and on which case evidence.
                </p>
              </div>

              <button
                className="secondary-button compact-button"
                onClick={loadAuditLogs}
              >
                <History size={16} />
                Refresh log
              </button>
            </div>

            {auditLoading ? (
              <div className="evidence-loading">
                <LoaderCircle size={23} />
                Loading audit records...
              </div>
            ) : auditLogs.length === 0 ? (
              <div className="empty-state">
                <History size={35} />
                <h3>No audit events yet</h3>
                <p>
                  Evidence uploads, integrity checks, and demo tamper events
                  will be recorded here.
                </p>
              </div>
            ) : (
              <div className="audit-list">
                {auditLogs.map((log) => (
                  <article className="audit-item" key={log.id}>
                    <div
                      className={`audit-icon ${
                        log.action === "FILE_MODIFIED_DEMO"
                          ? "danger"
                          : log.action === "INTEGRITY_CHECK"
                          ? "verify"
                          : "upload"
                      }`}
                    >
                      {log.action === "FILE_MODIFIED_DEMO" ? (
                        <ShieldAlert size={18} />
                      ) : log.action === "INTEGRITY_CHECK" ? (
                        <SearchCheck size={18} />
                      ) : (
                        <Upload size={18} />
                      )}
                    </div>

                    <div className="audit-body">
                      <div className="audit-title-row">
                        <strong>{getActionLabel(log.action)}</strong>
                        <span>{formatDate(log.timestamp)}</span>
                      </div>

                      <p>{log.details}</p>

                      <small>
                        Performed by {log.userName || log.userId} ·{" "}
                        {log.userRole}
                      </small>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        )}

        {activeTab === "Integrity Report" && (
          <section>
            <div className="module-header">
              <div>
                <span className="card-label">INTEGRITY MONITOR</span>
                <h3>Evidence integrity report</h3>
                <p>
                  Compare registered evidence fingerprints with their current
                  fingerprints to identify possible tampering.
                </p>
              </div>
            </div>

            <div className="integrity-summary-grid">
              <article className="integrity-summary-card total">
                <span>Total evidence</span>
                <strong>{evidenceItems.length}</strong>
                <small>Registered in this case</small>
              </article>

              <article className="integrity-summary-card safe">
                <span>Verified</span>
                <strong>{verifiedCount}</strong>
                <small>Fingerprints match</small>
              </article>

              <article className="integrity-summary-card danger">
                <span>Mismatch</span>
                <strong>{mismatchCount}</strong>
                <small>Requires review</small>
              </article>
            </div>

            {mismatchCount > 0 ? (
              <div className="integrity-alert-card">
                <ShieldAlert size={28} />
                <div>
                  <strong>Integrity mismatch requires attention</strong>
                  <p>
                    One or more evidence records have a current SHA-256 hash
                    that differs from the original registered fingerprint.
                    Review the Evidence tab and Audit Trail immediately.
                  </p>
                </div>
              </div>
            ) : (
              <div className="integrity-safe-card">
                <ShieldCheck size={28} />
                <div>
                  <strong>All registered evidence is currently verified</strong>
                  <p>
                    Current evidence fingerprints match their original
                    registered SHA-256 fingerprints.
                  </p>
                </div>
              </div>
            )}
          </section>
        )}

        {activeTab === "Documents" && (
          <section className="content-card empty-tab">
            <span className="card-label">DOCUMENTS</span>
            <h3>Case documents module</h3>
            <p>
              FIRs, forensic reports, charge sheets, and legal documents will
              use the same SHA-256 and audit workflow in the next phase.
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
                onChange={(event) =>
                  setSelectedFile(event.target.files?.[0] || null)
                }
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
                    : "The file is hashed locally before evidence registration."}
                </span>
              </button>

              <div className="hash-explanation">
                <Fingerprint size={19} />
                <p>
                  EVIDENTRA calculates a SHA-256 fingerprint, saves evidence
                  metadata, creates an audit record, and writes a prototype
                  tamper-evident ledger entry.
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
                      Registering...
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
                <strong
                  className={
                    selectedEvidence.integrityStatus === "Mismatch"
                      ? "mismatch-text"
                      : "verified-text"
                  }
                >
                  {selectedEvidence.integrityStatus === "Mismatch"
                    ? "⚠ "
                    : "✓ "}
                  {selectedEvidence.integrityStatus}
                </strong>
              </div>

              <div>
                <span>REGISTERED SHA-256 FINGERPRINT</span>
                <code>{selectedEvidence.sha256Hash}</code>
              </div>

              <div>
                <span>CURRENT SHA-256 FINGERPRINT</span>
                <code
                  className={
                    selectedEvidence.integrityStatus === "Mismatch"
                      ? "mismatch-hash"
                      : ""
                  }
                >
                  {selectedEvidence.currentSha256Hash}
                </code>
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

              <div>
                <span>LAST VERIFIED</span>
                <strong>
                  {selectedEvidence.lastVerifiedBy || "Not verified yet"}
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