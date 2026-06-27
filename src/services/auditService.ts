import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { db } from "../lib/firebase";

export type AuditAction =
  | "generate_report_started"
  | "generate_report_succeeded"
  | "generate_report_failed"
  | "save_report_succeeded"
  | "save_report_failed"
  | "save_receipt_succeeded"
  | "save_receipt_failed"
  | "settings_updated"
  | "auth_signin"
  | "auth_signout";

export async function logAuditEvent(params: {
  action: AuditAction;
  actorId: string;
  actorName?: string;
  customerId?: string;
  reportType?: "daily" | "accident";
  details?: string;
}) {
  await addDoc(collection(db, "auditLogs"), {
    action: params.action,
    actorId: params.actorId,
    actorName: params.actorName || "Unknown",
    customerId: params.customerId || "",
    reportType: params.reportType || "",
    details: params.details || "",
    timestamp: serverTimestamp(),
  });
}
