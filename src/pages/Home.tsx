
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Leaf, Upload, Shield, Zap, GraduationCap, Users, ArrowRight, Info } from 'lucide-react';
import Snowfall from 'react-snowfall';
import { motion } from 'framer-motion';

const Home = () => {
  const navigate = useNavigate();
  const { currentUser, userRole } = useAuth();
  const [snowColor, setSnowColor] = useState('#ffffff');

  useEffect(() => {
     setSnowColor('#ffffff');
  }, []);

  const handleDashboardClick = () => {
    if (userRole === 'student') navigate('/student/dashboard');
    else if (userRole === 'professor') navigate('/professor/dashboard');
    else navigate('/role-selection');
  };

  return (
    <div className="h-screen bg-slate-950 flex flex-col overflow-hidden relative text-slate-50 selection:bg-green-500/30">
      <Snowfall 
        color={snowColor}
        snowflakeCount={80}
        style={{ position: 'fixed', zIndex: 0, opacity: 0.5 }}
      />

      {/* Glowing Background Blobs */}
      <div className="fixed top-20 -left-20 w-96 h-96 bg-green-500/20 rounded-full blur-[128px] pointer-events-none z-0" />
      <div className="fixed bottom-20 -right-20 w-96 h-96 bg-blue-500/20 rounded-full blur-[128px] pointer-events-none z-0" />
      
      {/* Navigation Bar */}
      <nav className="border-b border-white/10 bg-slate-950/50 backdrop-blur-md h-16 flex-none z-50">
        <div className="container h-full flex items-center justify-between px-4">
          <div className="flex items-center gap-2 font-bold text-xl text-green-400 cursor-pointer" onClick={() => navigate('/')}>
             <motion.div whileHover={{ rotate: 20 }}>
                <Leaf className="h-6 w-6" />
             </motion.div>
            <span className="bg-clip-text text-transparent bg-gradient-to-r from-green-400 to-emerald-400">EcoSubmit</span>
          </div>
          <div className="flex items-center gap-4">
            {currentUser ? (
               <Button onClick={handleDashboardClick} className="bg-green-600 hover:bg-green-700 text-white border-0">Go to Dashboard</Button>
            ) : (
              <>
                <Button variant="ghost" onClick={() => navigate('/login')} className="text-slate-300 hover:text-white hover:bg-white/10">Sign In</Button>
                <Button onClick={() => navigate('/register')} className="bg-green-600 hover:bg-green-700 text-white border-0 shadow-[0_0_20px_-5px_rgba(22,163,74,0.5)]">Get Started</Button>
              </>
            )}
          </div>
        </div>
      </nav>

      {/* Main Content - Single Screen Bento Grid */}
      <main className="flex-1 container px-4 py-4 h-[calc(100vh-4rem)] z-10">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 h-full">
          
          {/* Left Col: Hero (4 cols) */}
          <motion.div 
            initial={{ opacity: 0, x: -50 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5 }}
            className="lg:col-span-4 flex flex-col justify-center space-y-6 p-8 rounded-3xl bg-slate-900/40 border border-white/10 backdrop-blur-sm shadow-2xl relative overflow-hidden group"
          >
             {/* Subtle internal glow */}
             <div className="absolute inset-0 bg-gradient-to-br from-green-500/5 to-transparent pointer-events-none" />
             
            <div className="space-y-4 relative z-10">
              <h1 className="text-4xl lg:text-5xl font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-green-400 via-emerald-400 to-cyan-400 drop-shadow-[0_0_15px_rgba(74,222,128,0.5)]">
                Future of <br/>Academic Submission
              </h1>
              <p className="text-slate-300 text-lg leading-relaxed">
                 Go paperless, save time, and embrace a sustainable, efficient grading workflow.
              </p>
            </div>
            <div className="flex flex-col gap-3 relative z-10">
              <Button size="lg" className="text-lg w-full bg-slate-100 text-slate-900 hover:bg-white hover:scale-[1.02] transition-all shadow-[0_0_20px_-5px_rgba(255,255,255,0.3)]" onClick={() => navigate('/register')}>
                Start Submission <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
              <Button size="lg" variant="outline" className="text-lg w-full border-white/10 bg-white/5 text-slate-200 hover:bg-white/10 hover:text-white" onClick={() => {}}>
                Learn More
              </Button>
            </div>
            
            {/* Mini Project Details */}
            <div className="mt-auto pt-6 border-t border-white/10 relative z-10">
                 <h3 className="font-semibold flex items-center gap-2 mb-2 text-green-400">
                    <Info className="h-4 w-4" /> Why EcoSubmit?
                 </h3>
                 <p className="text-sm text-slate-400 line-clamp-3">
                    Born from the need to modernize education. We bridge the gap between students and educators with speed, security, and sustainability.
                 </p>
            </div>
          </motion.div>

          {/* Right Col: Features Grid (8 cols) */}
          <div className="lg:col-span-8 grid grid-cols-2 md:grid-cols-3 gap-4 h-full overflow-y-auto lg:overflow-visible pr-1">
             <FeatureCard 
                icon={<Upload className="h-6 w-6 text-green-400" />}
                title="Smart Uploads"
                description="Drag & drop any file format instantly."
                delay={0.1}
             />
             <FeatureCard 
                icon={<Shield className="h-6 w-6 text-blue-400" />}
                title="Secure Storage"
                description="Encrypted and legally protected data."
                delay={0.2}
             />
             <FeatureCard 
                icon={<Zap className="h-6 w-6 text-yellow-400" />}
                title="Instant Feedback"
                description="Real-time grading and comments."
                delay={0.3}
             />
             <FeatureCard 
                icon={<GraduationCap className="h-6 w-6 text-purple-400" />}
                title="Academic Integrity"
                description="Built-in plagiarism detection."
                delay={0.4}
             />
             <FeatureCard 
                icon={<Users className="h-6 w-6 text-orange-400" />}
                title="Collaboration"
                description="Seamless connection with professors."
                delay={0.5}
             />
             <FeatureCard 
                icon={<Leaf className="h-6 w-6 text-emerald-400" />}
                title="Eco-Friendly"
                description="Zero paper waste. 100% Sustainable."
                delay={0.6}
             />
             
             {/* Visual Filler / Extra Bento Box */}
             <motion.div 
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.7 }}
                className="col-span-2 md:col-span-3 bg-gradient-to-r from-green-500/10 to-blue-500/10 rounded-3xl border border-white/10 flex items-center justify-center p-6 backdrop-blur-sm relative group overflow-hidden"
             >
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent translate-x-[-200%] group-hover:translate-x-[200%] transition-all duration-1000" />
                <div className="text-center space-y-2 relative z-10">
                    <div className="inline-flex items-center justify-center p-3 bg-slate-900/50 border border-white/10 rounded-full shadow-[0_0_15px_rgba(74,222,128,0.3)] mb-1">
                        <Leaf className="h-8 w-8 text-green-400" />
                    </div>
                    <h3 className="text-xl font-bold text-white">Join the Revolution</h3>
                    <p className="text-slate-400">Used by forward-thinking institutions worldwide.</p>
                </div>
             </motion.div>
          </div>
          
        </div>
      </main>
    </div>
  );
};

const FeatureCard = ({ icon, title, description, delay }: { icon: React.ReactNode, title: string, description: string, delay: number }) => {
  return (
    <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay }}
        className="h-full group"
    >
        <Card className="h-full border-white/5 bg-slate-900/40 hover:bg-slate-800/60 transition-all duration-300 backdrop-blur-sm flex flex-col justify-center hover:border-green-500/30 hover:shadow-[0_0_20px_-5px_rgba(74,222,128,0.15)] relative overflow-hidden">
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-green-500/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
        <CardHeader className="pb-2">
            <div className="mb-2 inline-block rounded-lg bg-slate-800/80 p-2 w-fit border border-white/5 group-hover:scale-110 transition-transform duration-300">
            {icon}
            </div>
            <CardTitle className="text-base md:text-lg text-slate-100">{title}</CardTitle>
        </CardHeader>
        <CardContent>
            <CardDescription className="text-xs md:text-sm text-slate-400 group-hover:text-slate-300 transition-colors">
            {description}
             </CardDescription>
        </CardContent>
        </Card>
    </motion.div>
  );
};

export default Home;


