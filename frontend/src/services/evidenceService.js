import {
  addDoc,
  collection,
  doc,
  getDocs,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { db } from "../firebaseConfig";

function bytesToHex(buffer) {
  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function calculateSha256(file) {
  const fileBuffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest("SHA-256", fileBuffer);
  return bytesToHex(hashBuffer);
}

function createMockTransactionHash() {
  const firstPart = crypto.randomUUID().replaceAll("-", "");
  const secondPart = crypto.randomUUID().replaceAll("-", "");
  return `0x${firstPart}${secondPart}`.slice(0, 66);
}

function createMockBlockNumber() {
  return Math.floor(9000000 + Math.random() * 1000000);
}

function createTamperedHash(originalHash) {
  const randomHash = crypto.randomUUID().replaceAll("-", "");
  const additionalPart = crypto.randomUUID().replaceAll("-", "");
  const differentHash = `${randomHash}${additionalPart}`.slice(0, 64);

  if (differentHash === originalHash) {
    return `0${originalHash.slice(1)}`;
  }

  return differentHash;
}

export async function addAuditLog({
  caseId,
  userId,
  userName,
  userRole,
  action,
  entityType,
  entityId,
  details,
}) {
  await addDoc(collection(db, "auditLogs"), {
    caseId,
    userId,
    userName,
    userRole,
    action,
    entityType,
    entityId,
    details,
    timestamp: serverTimestamp(),
  });
}

function getVersionRecordFromEvidence(evidence, version) {
  return {
    caseId: evidence.caseId,
    evidenceId: evidence.id,
    evidenceTitle: evidence.title,
    version,
    evidenceType: evidence.evidenceType,
    originalFileName: evidence.originalFileName,
    mimeType: evidence.mimeType,
    fileSize: evidence.fileSize,
    sha256Hash: evidence.sha256Hash,
    currentSha256Hash: evidence.currentSha256Hash || evidence.sha256Hash,
    integrityStatus: evidence.integrityStatus || "Verified",
    uploadedBy: evidence.uploadedBy,
    uploadedByName: evidence.uploadedByName,
    uploadedByRole: evidence.uploadedByRole,
    uploadedAt: evidence.uploadedAt || serverTimestamp(),
    storageStatus: evidence.storageStatus || "Browser prototype only",
    isCurrentVersion: true,
  };
}

export async function uploadEvidence({
  caseId,
  title,
  evidenceType,
  file,
  profile,
}) {
  const sha256Hash = await calculateSha256(file);

  const evidenceRecord = {
    caseId,
    title,
    evidenceType,
    originalFileName: file.name,
    mimeType: file.type || "application/octet-stream",
    fileSize: file.size,
    sha256Hash,
    currentSha256Hash: sha256Hash,
    integrityStatus: "Verified",
    version: 1,
    uploadedBy: profile.email,
    uploadedByName: profile.displayName,
    uploadedByRole: profile.role,
    uploadedAt: serverTimestamp(),
    storageStatus: "Browser prototype only",
    tamperSimulated: false,
    lastVerifiedAt: serverTimestamp(),
    lastVerifiedBy: profile.email,
  };

  const evidenceReference = await addDoc(
    collection(db, "evidence"),
    evidenceRecord
  );

  await addDoc(collection(db, "evidenceVersions"), {
    ...evidenceRecord,
    evidenceId: evidenceReference.id,
    version: 1,
    isCurrentVersion: true,
    createdAt: serverTimestamp(),
  });

  const transactionHash = createMockTransactionHash();
  const blockNumber = createMockBlockNumber();

  await addDoc(collection(db, "blockchainRecords"), {
    caseId,
    entityType: "Evidence",
    entityId: evidenceReference.id,
    version: 1,
    sha256Hash,
    action: "EVIDENCE_REGISTERED",
    transactionHash,
    blockNumber,
    createdBy: profile.email,
    createdAt: serverTimestamp(),
    ledgerType: "Prototype Permissioned Ledger",
  });

  await addAuditLog({
    caseId,
    userId: profile.uid,
    userName: profile.displayName,
    userRole: profile.role,
    action: "UPLOAD",
    entityType: "Evidence",
    entityId: evidenceReference.id,
    details: `Uploaded ${file.name}; SHA-256 fingerprint registered; version 1 created.`,
  });

  return {
    id: evidenceReference.id,
    sha256Hash,
    transactionHash,
    blockNumber,
  };
}

export async function uploadEvidenceVersion({
  evidence,
  file,
  profile,
}) {
  const newVersion = (evidence.version || 1) + 1;
  const sha256Hash = await calculateSha256(file);

  const previousVersionsQuery = query(
    collection(db, "evidenceVersions"),
    where("evidenceId", "==", evidence.id)
  );

  const previousVersionsSnapshot = await getDocs(previousVersionsQuery);

  await Promise.all(
    previousVersionsSnapshot.docs.map((versionDocument) =>
      updateDoc(doc(db, "evidenceVersions", versionDocument.id), {
        isCurrentVersion: false,
      })
    )
  );

  const newVersionRecord = {
    caseId: evidence.caseId,
    evidenceId: evidence.id,
    evidenceTitle: evidence.title,
    version: newVersion,
    evidenceType: evidence.evidenceType,
    originalFileName: file.name,
    mimeType: file.type || "application/octet-stream",
    fileSize: file.size,
    sha256Hash,
    currentSha256Hash: sha256Hash,
    integrityStatus: "Verified",
    uploadedBy: profile.email,
    uploadedByName: profile.displayName,
    uploadedByRole: profile.role,
    uploadedAt: serverTimestamp(),
    storageStatus: "Browser prototype only",
    isCurrentVersion: true,
    createdAt: serverTimestamp(),
  };

  await addDoc(collection(db, "evidenceVersions"), newVersionRecord);

  await updateDoc(doc(db, "evidence", evidence.id), {
    originalFileName: file.name,
    mimeType: file.type || "application/octet-stream",
    fileSize: file.size,
    sha256Hash,
    currentSha256Hash: sha256Hash,
    integrityStatus: "Verified",
    version: newVersion,
    uploadedBy: profile.email,
    uploadedByName: profile.displayName,
    uploadedByRole: profile.role,
    uploadedAt: serverTimestamp(),
    tamperSimulated: false,
    lastVerifiedAt: serverTimestamp(),
    lastVerifiedBy: profile.email,
  });

  const transactionHash = createMockTransactionHash();
  const blockNumber = createMockBlockNumber();

  await addDoc(collection(db, "blockchainRecords"), {
    caseId: evidence.caseId,
    entityType: "Evidence",
    entityId: evidence.id,
    version: newVersion,
    sha256Hash,
    action: "EVIDENCE_VERSION_REGISTERED",
    transactionHash,
    blockNumber,
    createdBy: profile.email,
    createdAt: serverTimestamp(),
    ledgerType: "Prototype Permissioned Ledger",
  });

  await addAuditLog({
    caseId: evidence.caseId,
    userId: profile.uid,
    userName: profile.displayName,
    userRole: profile.role,
    action: "VERSION_UPDATE",
    entityType: "Evidence",
    entityId: evidence.id,
    details: `Uploaded version ${newVersion} for ${evidence.title}. New file: ${file.name}; new SHA-256 fingerprint registered.`,
  });

  return {
    newVersion,
    sha256Hash,
    transactionHash,
    blockNumber,
  };
}

export async function verifyEvidenceIntegrity({ evidence, profile }) {
  const isVerified =
    evidence.sha256Hash === evidence.currentSha256Hash;

  const integrityStatus = isVerified ? "Verified" : "Mismatch";

  await updateDoc(doc(db, "evidence", evidence.id), {
    integrityStatus,
    lastVerifiedAt: serverTimestamp(),
    lastVerifiedBy: profile.email,
  });

  await addAuditLog({
    caseId: evidence.caseId,
    userId: profile.uid,
    userName: profile.displayName,
    userRole: profile.role,
    action: "INTEGRITY_CHECK",
    entityType: "Evidence",
    entityId: evidence.id,
    details: isVerified
      ? `Integrity check passed for ${evidence.originalFileName}. Current SHA-256 matches the registered original fingerprint.`
      : `INTEGRITY MISMATCH detected for ${evidence.originalFileName}. Current SHA-256 differs from the registered original fingerprint.`,
  });

  return {
    integrityStatus,
    isVerified,
  };
}

export async function simulateEvidenceTamper({ evidence, profile }) {
  const tamperedHash = createTamperedHash(evidence.sha256Hash);

  await updateDoc(doc(db, "evidence", evidence.id), {
    currentSha256Hash: tamperedHash,
    integrityStatus: "Mismatch",
    tamperSimulated: true,
    tamperedAt: serverTimestamp(),
    tamperedBy: profile.email,
  });

  await addAuditLog({
    caseId: evidence.caseId,
    userId: profile.uid,
    userName: profile.displayName,
    userRole: profile.role,
    action: "FILE_MODIFIED_DEMO",
    entityType: "Evidence",
    entityId: evidence.id,
    details: `DEMO TAMPER SIMULATION: Current file fingerprint was altered for ${evidence.originalFileName}.`,
  });

  return tamperedHash;
}

export async function getEvidenceVersions(evidenceId) {
  const versionsQuery = query(
    collection(db, "evidenceVersions"),
    where("evidenceId", "==", evidenceId)
  );

  const versionsSnapshot = await getDocs(versionsQuery);

  const versions = versionsSnapshot.docs.map((versionDocument) => ({
    id: versionDocument.id,
    ...versionDocument.data(),
  }));

  return versions.sort((firstVersion, secondVersion) => {
    return (secondVersion.version || 0) - (firstVersion.version || 0);
  });
}

export async function getAuditLogsForCase(caseId) {
  const auditQuery = query(
    collection(db, "auditLogs"),
    where("caseId", "==", caseId)
  );

  const auditSnapshot = await getDocs(auditQuery);

  const logs = auditSnapshot.docs.map((logDocument) => ({
    id: logDocument.id,
    ...logDocument.data(),
  }));

  return logs.sort((firstLog, secondLog) => {
    const firstTime = firstLog.timestamp?.toMillis?.() || 0;
    const secondTime = secondLog.timestamp?.toMillis?.() || 0;

    return secondTime - firstTime;
  });
}