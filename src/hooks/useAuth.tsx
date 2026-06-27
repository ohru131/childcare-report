import { useState, useEffect, createContext, useContext, ReactNode } from "react";
import { User, signInWithPopup, signOut, onAuthStateChanged } from "firebase/auth";
import { auth, googleProvider } from "../lib/firebase";
import { logAuditEvent } from "../services/auditService";

interface AuthContextType {
  user: User | null;
  loading: boolean;
  signIn: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

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
    try {
      const result = await signInWithPopup(auth, googleProvider);
      await logAuditEvent({
        action: "auth_signin",
        actorId: result.user.uid,
        actorName: result.user.displayName || "Unknown",
      });
    } catch (error) {
      console.error("Error signing in with Google", error);
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
    <AuthContext.Provider value={{ user, loading, signIn, logout }}>
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
