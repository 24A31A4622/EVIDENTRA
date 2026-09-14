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
  FilePlus2,
  FileText,
  Fingerprint,
  GitBranch,
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
  getEvidenceVersions,
  simulateEvidenceTamper,
  uploadEvidence,
  uploadEvidenceVersion,
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
    VERSION_UPDATE: "Evidence version updated",
  };

  return labels[action] || action?.replaceAll("_", " ") || "System action";
}

function createFallbackVersion(evidence) {
  return {
    id: `fallback-${evidence.id}`,
    evidenceId: evidence.id,
    evidenceTitle: evidence.title,
    version: 1,
    evidenceType: evidence.evidenceType,
    originalFileName: evidence.originalFileName,
    fileSize: evidence.fileSize,
    sha256Hash: evidence.sha256Hash,
    currentSha256Hash: evidence.currentSha256Hash,
    integrityStatus: evidence.integrityStatus,
    uploadedBy: evidence.uploadedBy,
    uploadedByName: evidence.uploadedByName,
    uploadedByRole: evidence.uploadedByRole,
    uploadedAt: evidence.uploadedAt,
    isCurrentVersion: true,
    isFallback: true,
  };
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
  const [versionsLoading, setVersionsLoading] = useState(false);

  const [activeTab, setActiveTab] = useState("Overview");
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showVersionUploadModal, setShowVersionUploadModal] = useState(false);
  const [showVersionsModal, setShowVersionsModal] = useState(false);

  const [selectedEvidence, setSelectedEvidence] = useState(null);
  const [versionTarget, setVersionTarget] = useState(null);
  const [versionItems, setVersionItems] = useState([]);

  const [uploadError, setUploadError] = useState("");
  const [uploadSuccess, setUploadSuccess] = useState("");
  const [actionMessage, setActionMessage] = useState("");

  const [uploading, setUploading] = useState(false);
  const [versionUploading, setVersionUploading] = useState(false);
  const [processingEvidenceId, setProcessingEvidenceId] = useState("");

  const [title, setTitle] = useState("");
  const [evidenceType, setEvidenceType] = useState("Image");
  const [selectedFile, setSelectedFile] = useState(null);
  const [versionFile, setVersionFile] = useState(null);

  const fileInputRef = useRef(null);
  const versionFileInputRef = useRef(null);
  const navigate = useNavigate();

  const canUpload = ["Investigator", "Forensic Officer"].includes(
    profile?.role
  );

  const canVerify = [
    "Investigator",
    "Forensic Officer",
    "Administrator",
  ].includes(profile?.role);

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

  function closeVersionUploadModal() {
    setVersionFile(null);
    setVersionTarget(null);
    setUploadError("");
    setShowVersionUploadModal(false);
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

  async function handleUploadVersion(event) {
    event.preventDefault();

    if (!versionTarget || !versionFile) {
      setUploadError("Please select the revised evidence file.");
      return;
    }

    setUploadError("");
    setVersionUploading(true);

    try {
      const result = await uploadEvidenceVersion({
        evidence: versionTarget,
        file: versionFile,
        profile,
      });

      closeVersionUploadModal();

      setUploadSuccess(
        `Version ${result.newVersion} registered for ${
          versionTarget.title
        }. New SHA-256: ${shortHash(result.sha256Hash)}`
      );

      await loadEvidence();
      await loadAuditLogs();
    } catch (error) {
      console.error("Version upload failed:", error);

      setUploadError(
        "Could not register the new version. Check Firestore Rules and try again."
      );
    } finally {
      setVersionUploading(false);
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
      `Demo only: simulate tampering for "${evidence.originalFileName}"? This changes the current fingerprint and triggers an integrity mismatch.`
    );

    if (!accepted) return;

    setActionMessage("");
    setProcessingEvidenceId(evidence.id);

    try {
      await simulateEvidenceTamper({ evidence, profile });

      setActionMessage(
        `DEMO TAMPER SIMULATION COMPLETE: The current fingerprint for ${evidence.originalFileName} was changed. Click Verify to confirm the mismatch.`
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

  async function openVersionHistory(evidence) {
    setVersionTarget(evidence);
    setVersionItems([]);
    setVersionsLoading(true);
    setShowVersionsModal(true);

    try {
      const versions = await getEvidenceVersions(evidence.id);

      if (versions.length === 0) {
        setVersionItems([createFallbackVersion(evidence)]);
      } else {
        setVersionItems(versions);
      }
    } catch (error) {
      console.error("Could not load version history:", error);
      setVersionItems([createFallbackVersion(evidence)]);
    } finally {
      setVersionsLoading(false);
    }
  }

  function openVersionUpload(evidence) {
    setVersionTarget(evidence);
    setVersionFile(null);
    setUploadError("");
    setShowVersionUploadModal(true);
  }

  function closeVersionsModal() {
    setShowVersionsModal(false);
    setVersionItems([]);
    setVersionTarget(null);
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
              <strong>Evidence record registered</strong>
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
                  Every item has a SHA-256 fingerprint, preserved version
                  history, integrity status, and audit record.
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

                              <button
                                className="table-action versions"
                                title="View version history"
                                onClick={() => openVersionHistory(item)}
                              >
                                <GitBranch size={15} />
                                Versions
                              </button>

                              {canUpload && (
                                <button
                                  className="table-action version-upload"
                                  onClick={() => openVersionUpload(item)}
                                >
                                  <FilePlus2 size={15} />
                                  New version
                                </button>
                              )}

                              {canVerify && (
                                <button
                                  className="table-action verify"
                                  disabled={isProcessing}
                                  onClick={() => handleVerifyIntegrity(item)}
                                >
                                  {isProcessing ? (
                                    <LoaderCircle
                                      className="spin-icon"
                                      size={15}
                                    />
                                  ) : (
                                    <SearchCheck size={15} />
                                  )}
                                  Verify
                                </button>
                              )}

                              {canSimulateTamper && (
                                <button
                                  className="table-action tamper"
                                  disabled={
                                    isProcessing || item.tamperSimulated
                                  }
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
                  Evidence uploads, version updates, integrity checks, and
                  demo tamper events will appear here.
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
                          : log.action === "VERSION_UPDATE"
                          ? "version"
                          : "upload"
                      }`}
                    >
                      {log.action === "FILE_MODIFIED_DEMO" ? (
                        <ShieldAlert size={18} />
                      ) : log.action === "INTEGRITY_CHECK" ? (
                        <SearchCheck size={18} />
                      ) : log.action === "VERSION_UPDATE" ? (
                        <GitBranch size={18} />
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
                  Compare registered evidence fingerprints with current
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
                    One or more evidence records have a current SHA-256
                    fingerprint that differs from the original registered
                    fingerprint. Review Evidence and Audit Trail immediately.
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
              use this same secure versioning and integrity workflow.
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
                  EVIDENTRA calculates SHA-256, preserves Version 1, creates
                  audit records, and writes a prototype tamper-evident ledger
                  entry.
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

      {showVersionUploadModal && versionTarget && (
        <div className="modal-overlay">
          <div className="evidence-modal">
            <div className="modal-header">
              <div>
                <span className="card-label">NEW EVIDENCE VERSION</span>
                <h3>Upload Version {(versionTarget.version || 1) + 1}</h3>
              </div>

              <button
                className="modal-close"
                onClick={closeVersionUploadModal}
              >
                <X size={20} />
              </button>
            </div>

            <form className="evidence-form" onSubmit={handleUploadVersion}>
              <div className="version-target-card">
                <span>UPDATING EVIDENCE</span>
                <strong>{versionTarget.title}</strong>
                <small>
                  Current version: v{versionTarget.version || 1} ·{" "}
                  {versionTarget.originalFileName}
                </small>
              </div>

              <input
                ref={versionFileInputRef}
                type="file"
                className="hidden-file-input"
                onChange={(event) =>
                  setVersionFile(event.target.files?.[0] || null)
                }
              />

              <button
                type="button"
                className="file-drop-zone"
                onClick={() => versionFileInputRef.current?.click()}
              >
                <FilePlus2 size={25} />
                <strong>
                  {versionFile
                    ? versionFile.name
                    : "Select revised evidence file"}
                </strong>
                <span>
                  {versionFile
                    ? `${formatFileSize(versionFile.size)} selected`
                    : "The old version remains preserved. A new SHA-256 fingerprint will be registered."}
                </span>
              </button>

              <div className="hash-explanation">
                <GitBranch size={19} />
                <p>
                  EVIDENTRA never overwrites the prior version. This upload
                  creates Version {(versionTarget.version || 1) + 1}, a new
                  hash, a ledger record, and an audit event.
                </p>
              </div>

              {uploadError && <p className="form-error">{uploadError}</p>}

              <div className="modal-actions">
                <button
                  className="secondary-button"
                  type="button"
                  onClick={closeVersionUploadModal}
                  disabled={versionUploading}
                >
                  Cancel
                </button>

                <button
                  className="primary-button compact-button"
                  type="submit"
                  disabled={versionUploading}
                >
                  {versionUploading ? (
                    <>
                      <LoaderCircle className="spin-icon" size={17} />
                      Registering Version...
                    </>
                  ) : (
                    <>
                      <GitBranch size={17} />
                      Create new version
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showVersionsModal && versionTarget && (
        <div className="modal-overlay">
          <div className="evidence-modal details-modal">
            <div className="modal-header">
              <div>
                <span className="card-label">IMMUTABLE VERSION HISTORY</span>
                <h3>{versionTarget.title}</h3>
              </div>

              <button className="modal-close" onClick={closeVersionsModal}>
                <X size={20} />
              </button>
            </div>

            {versionsLoading ? (
              <div className="modal-loading">
                <LoaderCircle className="spin-icon" size={22} />
                Loading preserved versions...
              </div>
            ) : (
              <div className="version-history-list">
                {versionItems.map((version) => (
                  <article className="version-history-item" key={version.id}>
                    <div className="version-number">
                      <GitBranch size={17} />
                      v{version.version}
                    </div>

                    <div className="version-history-content">
                      <div className="version-history-top">
                        <strong>{version.originalFileName}</strong>

                        <span
                          className={`version-current-badge ${
                            version.isCurrentVersion ? "current" : ""
                          }`}
                        >
                          {version.isCurrentVersion
                            ? "Current version"
                            : "Preserved"}
                        </span>
                      </div>

                      <p>
                        {version.evidenceType} ·{" "}
                        {formatFileSize(version.fileSize)} ·{" "}
                        {formatDate(version.uploadedAt)}
                      </p>

                      <code>{version.sha256Hash}</code>

                      <small>
                        Uploaded by {version.uploadedByName || version.uploadedBy}{" "}
                        · {version.uploadedByRole}
                      </small>

                      {version.isFallback && (
                        <em>
                          Version 1 is displayed from the original evidence
                          record because it was uploaded before Version History
                          was enabled.
                        </em>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            )}

            <div className="modal-actions">
              {canUpload && (
                <button
                  className="secondary-button compact-button"
                  onClick={() => {
                    setShowVersionsModal(false);
                    openVersionUpload(versionTarget);
                  }}
                >
                  <FilePlus2 size={16} />
                  Upload new version
                </button>
              )}

              <button className="primary-button" onClick={closeVersionsModal}>
                Close history
              </button>
            </div>
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
                <span>CURRENT VERSION</span>
                <strong>v{selectedEvidence.version || 1}</strong>
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
            </div>

            <div className="modal-actions">
              <button
                className="secondary-button compact-button"
                onClick={() => {
                  setSelectedEvidence(null);
                  openVersionHistory(selectedEvidence);
                }}
              >
                <GitBranch size={16} />
                Version history
              </button>

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