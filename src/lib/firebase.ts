import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, connectAuthEmulator } from "firebase/auth";
import { getFirestore, connectFirestoreEmulator } from "firebase/firestore";
import firebaseConfig from "../../firebase-applet-config.json";

const app = initializeApp(firebaseConfig);

// Firestore emulator export/import is most reliable with the default database.
// Keep production behavior on the configured named database.
const firestoreDatabaseId = import.meta.env.DEV
  ? "(default)"
  : firebaseConfig.firestoreDatabaseId;

export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
export const db = getFirestore(app, firestoreDatabaseId);

if (import.meta.env.DEV) {
  connectFirestoreEmulator(db, "localhost", 8080);
  connectAuthEmulator(auth, "http://localhost:9099", { disableWarnings: true });
}
