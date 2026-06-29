import { useState, useEffect, createContext, useContext, ReactNode } from "react";
import { User, signInWithPopup, signInWithRedirect, signOut, onAuthStateChanged, AuthError } from "firebase/auth";
import { auth, googleProvider } from "../lib/firebase";
import { logAuditEvent } from "../services/auditService";

interface AuthContextType {
  user: User | null;
  loading: boolean;
  signingIn: boolean;
  signIn: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [signingIn, setSigningIn] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(
      auth,
      (user) => {
        setUser(user);
        setLoading(false);
      },
      async (error) => {
        console.error("Auth state observer error", error);
        if (import.meta.env.DEV) {
          try {
            await signOut(auth);
          } catch {
            // Ignore cleanup failures in local emulator mode.
          }
        }
        setUser(null);
        setLoading(false);
      },
    );

    return () => unsubscribe();
  }, []);

  const signIn = async () => {
    if (signingIn) {
      return;
    }

    setSigningIn(true);
    try {
      const result = await signInWithPopup(auth, googleProvider);
      await logAuditEvent({
        action: "auth_signin",
        actorId: result.user.uid,
        actorName: result.user.displayName || "Unknown",
      });
    } catch (error) {
      const authError = error as AuthError;
      if (authError.code === "auth/popup-blocked") {
        // Popup blocked environments (or strict browsers) should use redirect flow.
        await signInWithRedirect(auth, googleProvider);
        return;
      }

      if (authError.code === "auth/cancelled-popup-request" || authError.code === "auth/popup-closed-by-user") {
        // Ignore expected user/collision cases to avoid noisy assertions in dev logs.
        return;
      }

      console.error("Error signing in with Google", authError);
    } finally {
      setSigningIn(false);
    }
  };

  const logout = async () => {
    try {
      if (auth.currentUser) {
        await logAuditEvent({
          action: "auth_signout",
          actorId: auth.currentUser.uid,
          actorName: auth.currentUser.displayName || "Unknown",
        });
      }
      await signOut(auth);
    } catch (error) {
      console.error("Error signing out", error);
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, signingIn, signIn, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
