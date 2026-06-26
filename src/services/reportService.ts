import { collection, addDoc, serverTimestamp, query, where, getDocs, orderBy, limit, startAfter, Timestamp } from "firebase/firestore";
import { db } from "../lib/firebase";
import { Report, Receipt } from "../types";

export async function saveReport(report: Report) {
  const reportsCollection = collection(db, "reports");
  const docRef = await addDoc(reportsCollection, {
    ...report,
    timestamp: serverTimestamp()
  });
  return docRef.id;
}

export async function getReceipts(reportId: string): Promise<Receipt[]> {
  const receiptsCollection = collection(db, "receipts");
  const q = query(receiptsCollection, where("reportId", "==", reportId));
  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Receipt));
}

export async function saveReceipt(receipt: Omit<Receipt, 'id'>) {
  const receiptsCollection = collection(db, "receipts");
  return await addDoc(receiptsCollection, {
    ...receipt,
    timestamp: serverTimestamp()
  });
}

export async function getCustomerReports(customerId: string, lastTimestamp?: Timestamp): Promise<Report[]> {
  const reportsCollection = collection(db, "reports");
  let q = query(
    reportsCollection,
    where("customerId", "==", customerId),
    orderBy("timestamp", "desc"),
    limit(5)
  );
  
  if (lastTimestamp) {
    q = query(q, startAfter(lastTimestamp));
  }
  
  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Report));
}
