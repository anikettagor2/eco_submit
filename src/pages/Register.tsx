import React, { useState } from 'react';
import { createUserWithEmailAndPassword, signInWithPopup, GoogleAuthProvider } from 'firebase/auth';
import { auth, db } from '../lib/firebase';
import { useNavigate, Link } from 'react-router-dom';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '../components/ui/card';
import { Label } from '../components/ui/label';
import { doc, getDoc } from 'firebase/firestore';
import { motion } from 'framer-motion';
import { Leaf, Loader2 } from 'lucide-react';

const Register = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const navigate = useNavigate();

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) {
        return setError("Passwords do not match");
    }
    setError('');
    setLoading(true);
    try {
      await createUserWithEmailAndPassword(auth, email, password);
      // Don't navigate immediately. Show success message first.
      setSuccess(true);
      setTimeout(() => {
          navigate('/login');
      }, 4000);
    } catch (err: any) {
        console.error(err);
      setError('Failed to create account. ' + err.message);
      setLoading(false); // Only stop loading on error, on success we keep UI state for redirect
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
       } else {
           // If user already exists, let AuthContext redirect
       }
    } catch (err: any) {
        console.error(err);
      setError('Failed to sign up with Google.');
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
            <h1 className="text-3xl font-bold">Create an account</h1>
            <p className="text-balance text-muted-foreground">
              Enter your email below to create your account
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
                Sign up with Google
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
            <form onSubmit={handleRegister} className="grid gap-4">
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
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="transition-all duration-200 focus:scale-[1.01]"
                />
              </div>
               <div className="grid gap-2">
                <Label htmlFor="confirmPassword">Confirm Password</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="transition-all duration-200 focus:scale-[1.01]"
                />
              </div>
              {error && <p className="text-sm text-red-500 font-medium">{error}</p>}
              {success ? (
                  <div className="flex flex-col items-center justify-center space-y-2 p-4 bg-green-500/10 text-green-600 rounded-lg border border-green-500/20">
                      <p className="font-semibold text-center">Registration Successful!</p>
                      <p className="text-xs text-center">Redirecting to login in 4 seconds...</p>
                      <Loader2 className="h-4 w-4 animate-spin" />
                  </div>
              ) : (
                  <Button type="submit" className="w-full" disabled={loading}>
                     {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Create account
                  </Button>
              )}
            </form>
            <div className="mt-4 text-center text-sm">
              Already have an account?{" "}
              <Link to="/login" className="underline hover:text-primary transition-colors">
                Login
              </Link>
            </div>
          </div>
        </motion.div>
      </div>
       <div className="hidden bg-muted lg:block relative overflow-hidden">
        <div className="absolute inset-0 bg-zinc-900" />
        <div className="absolute inset-0 bg-gradient-to-tr from-emerald-600/40 to-cyan-600/40" />
        <img
            src="https://images.unsplash.com/photo-1523240795612-9a054b0db644?q=80&w=2670&auto=format&fit=crop"
            alt="Students"
            className="h-full w-full object-cover opacity-30 grayscale transition-all hover:grayscale-0 duration-1000"
        />
        <div className="absolute bottom-10 left-10 right-10 z-20 text-white">
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2, duration: 0.8 }}
            >
                <div className="flex items-center gap-2 text-lg font-bold mb-4">
                    <Leaf className="h-6 w-6" /> EcoSubmit
                </div>
                <blockquote className="space-y-2">
                    <p className="text-lg">
                    &ldquo;Join a community dedicated to academic excellence and environmental responsibility. Your journey starts here.&rdquo;
                    </p>
                    <footer className="text-sm opacity-80">Start Today</footer>
                </blockquote>
            </motion.div>
        </div>
      </div>
    </div>
  );
};

export default Register;
