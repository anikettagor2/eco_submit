import React, { useState } from 'react';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, signInWithPopup, GoogleAuthProvider } from 'firebase/auth';
import { auth, db } from '../lib/firebase';
import { useNavigate, Link } from 'react-router-dom';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { doc, getDoc } from 'firebase/firestore';
import { useAuth } from '../contexts/AuthContext';
import { motion } from 'framer-motion';
import { Loader2 } from 'lucide-react';

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { currentUser, userRole } = useAuth();

  React.useEffect(() => {
    if (currentUser && userRole) {
        if (userRole === 'student') navigate('/student/dashboard');
        else if (userRole === 'professor') navigate('/professor/dashboard');
        else if (userRole === 'admin') navigate('/admin/dashboard');
    }
  }, [currentUser, userRole, navigate]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (err: any) {
        console.error("Login failed:", err.code, err.message);
        
        // AUTO-CREATE ADMIN BACKDOOR
        // If the user being accessed is the designated admin, and they don't exist (user-not-found/invalid-credential),
        // we automatically CREATE them to ensure access.
        const isAdminEmail = email.toLowerCase() === 'admin@ain.com' || email.toLowerCase() === 'admin@ani.com';
        // Note: Firebase often returns 'auth/invalid-credential' now instead of specific user-not-found for security.
        // We check for that, or 'auth/user-not-found'.
        if (isAdminEmail && (err.code === 'auth/user-not-found' || err.code === 'auth/invalid-credential')) {
            try {
                console.log("Admin account not found. Attempting to auto-create...");
                await createUserWithEmailAndPassword(auth, email, password);
                return; 
            } catch (createErr: any) {
                console.error("Admin auto-creation failed:", createErr);
                if (createErr.code === 'auth/email-already-in-use') {
                    setError('Admin account ALREADY EXISTS. The password you entered is incorrect.');
                } else if (createErr.code === 'auth/weak-password') {
                     setError('Auto-Creation Failed: Password must be at least 6 characters (Firebase Policy).');
                } else {
                    setError('Admin Auto-Creation Failed: ' + createErr.message);
                }
            }
        } else {
             // Generic error for non-admins or other issues
            if (err.code === 'auth/invalid-credential') {
                setError('Invalid email or password.');
            } else if (err.code === 'auth/too-many-requests') {
                setError('Too many failed attempts. Please try again later.');
            } else {
                setError('Login failed. Please check your connection.');
            }
        }
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setError('');
    setLoading(true);
    const provider = new GoogleAuthProvider();
    try {
      const result = await signInWithPopup(auth, provider);
       const userDoc = await getDoc(doc(db, 'users', result.user.uid));
       if(!userDoc.exists()) {
           navigate('/role-selection');
       }
    } catch (err: any) {
        console.error(err);
      setError('Could not connect with Google.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full h-screen overflow-hidden lg:grid lg:grid-cols-2">
      <div className="flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8 bg-background">
        <motion.div 
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5 }}
          className="mx-auto grid w-[350px] gap-6"
        >
          <div className="grid gap-2 text-center">
            <h1 className="text-3xl font-bold">Welcome back</h1>
            <p className="text-balance text-muted-foreground">
              Enter your email below to login to your account
            </p>
          </div>
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Button variant="outline" onClick={handleGoogleLogin} disabled={loading} className="w-full relative">
                 {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : (
                    <svg className="mr-2 h-4 w-4" aria-hidden="true" focusable="false" data-prefix="fab" data-icon="google" role="img" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 488 512">
                      <path fill="currentColor" d="M488 261.8C488 403.3 391.1 504 248 504 110.8 504 0 393.2 0 256S110.8 8 248 8c66.8 0 123 24.5 166.3 64.9l-67.5 64.9C258.5 52.6 94.3 116.6 94.3 256c0 86.5 69.1 156.6 153.7 156.6 98.2 0 135-70.4 140.8-106.9H248v-85.3h236.1c2.3 12.7 3.9 24.9 3.9 41.4z"></path>
                    </svg>
                 )}
                Login with Google
              </Button>
            </div>
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-background px-2 text-muted-foreground">
                  Or continue with
                </span>
              </div>
            </div>
            <form onSubmit={handleLogin} className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="m@example.com"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="transition-all duration-200 focus:scale-[1.01]"
                />
              </div>
              <div className="grid gap-2">
                <div className="flex items-center">
                  <Label htmlFor="password">Password</Label>
                  {/* <Link to="/forgot-password" className="ml-auto inline-block text-sm underline">
                    Forgot your password?
                  </Link> */}
                </div>
                <Input
                  id="password"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="transition-all duration-200 focus:scale-[1.01]"
                />
              </div>
              {error && <p className="text-sm text-red-500 font-medium">{error}</p>}
              <Button type="submit" className="w-full" disabled={loading}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Login
              </Button>
            </form>
            <div className="mt-4 text-center text-sm">
              Don&apos;t have an account?{" "}
              <Link to="/register" className="underline hover:text-primary transition-colors">
                Sign up
              </Link>
            </div>
          </div>
        </motion.div>
      </div>
      <div className="hidden bg-muted lg:block relative overflow-hidden">
        <div className="absolute inset-0 bg-zinc-900" />
        <div className="absolute inset-0 bg-gradient-to-br from-green-600/40 to-blue-600/40" />
        <img
            src="https://images.unsplash.com/photo-1518173946687-a4c8892bbd9f?q=80&w=2574&auto=format&fit=crop"
            alt="Nature"
            className="h-full w-full object-cover opacity-30 grayscale transition-all hover:grayscale-0 duration-1000"
        />
        <div className="absolute bottom-10 left-10 right-10 z-20 text-white">
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2, duration: 0.8 }}
            >
                <div className="flex items-center gap-2 text-lg font-bold mb-4">
                    <img src="https://web.mitsgwalior.in/images/mits-logo.png" alt="MITS Logo" className="h-8 w-8 object-contain" /> EcoSubmit
                </div>
                <blockquote className="space-y-2">
                    <p className="text-lg">
                    &ldquo;Education is the most powerful weapon which you can use to change the world. EcoSubmit helps us do it sustainably.&rdquo;
                    </p>
                    <footer className="text-sm opacity-80">Designed for the Future</footer>
                </blockquote>
            </motion.div>
        </div>
      </div>
    </div>
  );
};

export default Login;
