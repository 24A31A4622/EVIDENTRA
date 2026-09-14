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

  const transactionHash = createMockTransactionHash();
  const blockNumber = createMockBlockNumber();

  await addDoc(collection(db, "blockchainRecords"), {
    caseId,
    entityType: "Evidence",
    entityId: evidenceReference.id,
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