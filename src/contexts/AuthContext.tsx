import React, { createContext, useContext, useEffect, useState } from 'react';
import { type User, onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';

interface AuthContextType {
  currentUser: User | null;
  userRole: 'student' | 'professor' | 'admin' | null;
  loading: boolean;
  logout: () => Promise<void>;
  userData: any | null;
}

const AuthContext = createContext<AuthContextType>({
  currentUser: null,
  userRole: null,
  loading: true,
  logout: async () => {},
  userData: null
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [userRole, setUserRole] = useState<'student' | 'professor' | 'admin' | null>(null);
  const [userData, setUserData] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      if (user) {
        // Fetch user role and data from Firestore
        try {
          const userDoc = await getDoc(doc(db, 'users', user.uid));
          
          // HARDCODED ADMIN OVERRIDE
          if (user.email === 'admin@ain.com' || user.email === 'admin@ani.com') {
             const adminData = {
                 uid: user.uid,
                 email: user.email,
                 name: "System Admin",
                 role: 'admin' as const,
                 department: 'Administration'
             };
             // Ensure DB reflects this
             if (!userDoc.exists() || userDoc.data()?.role !== 'admin') {
                 await setDoc(doc(db, 'users', user.uid), adminData, { merge: true });
                 setUserRole('admin');
                 setUserData(adminData);
             } else {
                 setUserRole('admin');
                 setUserData(userDoc.data());
             }
          } 
          else if (userDoc.exists()) {
            const data = userDoc.data();
            setUserRole(data.role);
            setUserData(data);
          } else {
             // Handle case where user exists in Auth but not Firestore (incomplete signup)
             setUserRole(null);
             setUserData(null);
          }
        } catch (error) {
          console.error("Error fetching user data:", error);
        }
      } else {
        setUserRole(null);
        setUserData(null);
      }
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  const logout = () => {
    return auth.signOut();
  }

  const value = {
    currentUser,
    userRole,
    loading,
    logout,
    userData
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
};
