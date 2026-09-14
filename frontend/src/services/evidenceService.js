import {
  addDoc,
  collection,
  serverTimestamp,
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
  const randomPart = crypto.randomUUID().replaceAll("-", "");

  return `0x${randomPart}${randomPart}`.slice(0, 66);
}

function createMockBlockNumber() {
  return Math.floor(9000000 + Math.random() * 1000000);
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