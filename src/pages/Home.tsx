
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Leaf, Upload, Shield, Zap, GraduationCap, Users, ArrowRight, CheckCircle, Mail, MapPin, Phone, FileText, Cpu } from 'lucide-react';
import Snowfall from 'react-snowfall';
import { motion, useScroll, useTransform } from 'framer-motion';

const Home = () => {
  const navigate = useNavigate();
  const { currentUser, userRole } = useAuth();
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [_activeSection, setActiveSection] = useState('home');
  const { scrollYProgress } = useScroll();
  const opacity = useTransform(scrollYProgress, [0, 0.2], [1, 0]);
  
  const scrollToSection = (id: string) => {
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
      setActiveSection(id);
    }
  };

  const handleDashboardClick = () => {
    if (userRole === 'student') navigate('/student/dashboard');
    else if (userRole === 'professor') navigate('/professor/dashboard');
    else navigate('/role-selection');
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50 selection:bg-green-500/30 overflow-x-hidden font-sans">
      <Snowfall 
        color="#ffffff"
        snowflakeCount={60}
        style={{ position: 'fixed', zIndex: 0, opacity: 0.3 }}
      />

      {/* Background Ambience */}
      <div className="fixed top-0 left-0 w-full h-full pointer-events-none z-0">
          <div className="absolute top-[-10%] left-[-10%] w-[500px] h-[500px] bg-green-500/10 rounded-full blur-[100px]" />
          <div className="absolute bottom-[-10%] right-[-10%] w-[600px] h-[600px] bg-blue-500/10 rounded-full blur-[120px]" />
          <div className="absolute top-[40%] left-[30%] w-[300px] h-[300px] bg-emerald-500/5 rounded-full blur-[80px]" />
      </div>

      {/* NAVBAR */}
      <nav className="fixed top-0 left-0 right-0 z-50 border-b border-white/5 bg-slate-950/70 backdrop-blur-xl transition-all duration-300">
        <div className="container mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-3 cursor-pointer group" onClick={() => scrollToSection('home')}>
             <motion.div whileHover={{ rotate: 360, transition: { duration: 0.7 } }}>
                <div className="w-10 h-10 bg-gradient-to-tr from-green-400 to-emerald-600 rounded-lg flex items-center justify-center shadow-lg shadow-green-500/20">
                    <Leaf className="text-white w-6 h-6" />
                </div>
             </motion.div>
             <span className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-slate-400 group-hover:from-green-400 group-hover:to-emerald-400 transition-all">
                EcoSubmit
             </span>
          </div>

          <div className="hidden md:flex items-center gap-8 text-sm font-medium text-slate-300">
            {['About', 'Workflow', 'Why Us', 'Contact'].map((item) => (
                <button 
                    key={item}
                    onClick={() => scrollToSection(item.toLowerCase().replace(' ', '-'))}
                    className="hover:text-green-400 transition-colors relative group py-2"
                >
                    {item}
                    <span className="absolute bottom-0 left-0 w-0 h-0.5 bg-green-400 transition-all duration-300 group-hover:w-full" />
                </button>
            ))}
          </div>

          <div className="flex items-center gap-4">
            {currentUser ? (
               <Button onClick={handleDashboardClick} className="bg-green-600 hover:bg-green-700 text-white rounded-full px-6 shadow-[0_0_15px_-3px_rgba(22,163,74,0.6)] hover:shadow-[0_0_20px_0px_rgba(22,163,74,0.8)] transition-all">
                  Dashboard
               </Button>
            ) : (
              <>
                <Button variant="ghost" onClick={() => navigate('/login')} className="hidden sm:flex text-slate-300 hover:text-white hover:bg-white/10 rounded-full">Sign In</Button>
                <Button onClick={() => navigate('/register')} className="bg-white text-slate-950 hover:bg-slate-200 rounded-full px-6 font-bold shadow-lg shadow-white/10 transition-all">Get Started</Button>
              </>
            )}
          </div>
        </div>
      </nav>

      {/* HERO SECTION */}
      <section id="home" className="relative h-screen flex items-center justify-center pt-20 overflow-hidden">
         <motion.div style={{ opacity }} className="absolute inset-0 flex items-center justify-center pointer-events-none">
             <div className="w-[80vw] h-[80vw] md:w-[600px] md:h-[600px] border border-white/5 rounded-full md:animate-[spin_60s_linear_infinite]" />
             <div className="absolute w-[60vw] h-[60vw] md:w-[400px] md:h-[400px] border border-white/5 rounded-full md:animate-[spin_40s_linear_infinite_reverse]" />
         </motion.div>

         <div className="container mx-auto px-6 relative z-10 text-center">
            <motion.div
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8, ease: "easeOut" }}
                className="space-y-8 max-w-4xl mx-auto"
            >
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-xs md:text-sm text-green-400 mb-4 backdrop-blur-md">
                    <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                    v2.0 Now Live - AI-Powered Submission System
                </div>
                
                <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight leading-tight">
                    The Future of <br className="hidden md:block" />
                    <span className="bg-clip-text text-transparent bg-gradient-to-r from-green-400 via-emerald-400 to-cyan-400 inline-block py-2">
                        Academic Excellence
                    </span>
                </h1>
                
                <p className="text-lg md:text-xl text-slate-400 max-w-2xl mx-auto leading-relaxed">
                    Revolutionize how you submit, review, and grade assignments. 
                    Go completely paperless with our secure, AI-enhanced workflow designed for modern institutions.
                </p>

                <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
                    <Button size="lg" onClick={() => navigate('/register')} className="h-14 px-8 text-lg rounded-full bg-green-600 hover:bg-green-700 shadow-[0_0_25px_-5px_rgba(22,163,74,0.6)] transition-all w-full sm:w-auto">
                        Start Your Journey <ArrowRight className="ml-2 w-5 h-5" />
                    </Button>
                    <Button size="lg" variant="outline" onClick={() => scrollToSection('workflow')} className="h-14 px-8 text-lg rounded-full border-white/10 bg-white/5 hover:bg-white/10 text-slate-200 w-full sm:w-auto backdrop-blur-sm">
                        How it Works
                    </Button>
                </div>
            </motion.div>
         </div>
         
         <div className="absolute bottom-10 left-1/2 -translate-x-1/2 animate-bounce text-slate-500 bg-slate-900/50 p-2 rounded-full border border-white/5 cursor-pointer backdrop-blur-sm" onClick={() => scrollToSection('about')}>
             <ArrowRight className="w-5 h-5 rotate-90" />
         </div>
      </section>

      {/* ABOUT SECTION */}
      <section id="about" className="py-24 bg-slate-950 relative">
          <div className="container mx-auto px-6">
              <div className="grid lg:grid-cols-2 gap-16 items-center">
                  <motion.div 
                    initial={{ opacity: 0, x: -50 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.6 }}
                  >
                        <h2 className="text-green-400 font-bold tracking-wider uppercase mb-3 text-sm">About The Platform</h2>
                        <h3 className="text-3xl md:text-4xl font-bold mb-6 leading-tight">Bridging the Gap Between <br/> Innovation & Sustainability</h3>
                        <p className="text-slate-400 text-lg mb-6 leading-relaxed">
                            EcoSubmit isn't just a submission portal; it's a commitment to a greener future. Traditional academic workflows consume tons of paper annually. We replace that with a sleek, digital ecosystem.
                        </p>
                        <p className="text-slate-400 text-lg mb-8 leading-relaxed">
                            Built with advanced MERN stack technologies and powered by Firebase, we offer a seamless experience for both students and professors, ensuring that "submission day" is no longer a hassle, but a breeze.
                        </p>
                  </motion.div>
                  
                  <motion.div 
                    initial={{ opacity: 0, scale: 0.8 }}
                    whileInView={{ opacity: 1, scale: 1 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.6 }}
                    className="relative"
                  >
                      <div className="absolute inset-0 bg-gradient-to-tr from-green-500/20 to-blue-500/20 rounded-3xl blur-2xl -z-10" />
                      <img 
                        src="https://images.unsplash.com/photo-1522202176988-66273c2fd55f?q=80&w=2071&auto=format&fit=crop" 
                        alt="Team working" 
                        className="rounded-3xl border border-white/10 shadow-2xl grayscale hover:grayscale-0 transition-all duration-700 object-cover h-[400px] w-full"
                      />
                  </motion.div>
              </div>
          </div>
      </section>

      {/* IMPACT / PROBLEM SOLVING SECTION */}
      <section className="py-24 bg-slate-900 border-y border-white/5 relative overflow-hidden">
           <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-5"></div>
           <div className="container mx-auto px-6 relative z-10">
               
               <div className="text-center max-w-4xl mx-auto mb-16">
                   <h2 className="text-red-400 font-bold tracking-wider uppercase mb-3 text-sm">The Problem</h2>
                   <h3 className="text-3xl md:text-5xl font-bold mb-6 text-white">The Cost of Traditional Submissions</h3>
                   <p className="text-slate-400 text-lg leading-relaxed">
                       Indian colleges are massive consumers of paper. The frantic rush to print assignments before deadlines leads to immense stress for students and chaos for professors.
                   </p>
               </div>

               <div className="grid md:grid-cols-3 gap-8">
                   <div className="bg-red-950/20 border border-red-500/20 p-8 rounded-3xl backdrop-blur-sm">
                       <h4 className="text-2xl font-bold text-red-400 mb-4">High Stress Levels</h4>
                       <p className="text-slate-300">
                           78% of students report severe anxiety related to physical submission deadlines, printer failures, and long queues at reprographic centers.
                       </p>
                   </div>
                   <div className="bg-orange-950/20 border border-orange-500/20 p-8 rounded-3xl backdrop-blur-sm">
                       <h4 className="text-2xl font-bold text-orange-400 mb-4">Environmental Damage</h4>
                       <p className="text-slate-300">
                           A single college can consume over <span className="text-white font-bold">500,000+ sheets</span> of paper annually, contributing to massive deforestation and waste.
                       </p>
                   </div>
                   <div className="bg-yellow-950/20 border border-yellow-500/20 p-8 rounded-3xl backdrop-blur-sm">
                       <h4 className="text-2xl font-bold text-yellow-400 mb-4">Operational Inefficiency</h4>
                       <p className="text-slate-300">
                           Professors spend countless hours physically managing piles of files, leading to lost assignments and delayed grading.
                       </p>
                   </div>
               </div>

               <div className="mt-20 text-center">
                   <h2 className="text-green-400 font-bold tracking-wider uppercase mb-6 text-sm">Our Solution: The EcoSubmit Impact</h2>
                   <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                       <div className="p-6 bg-slate-800/50 rounded-2xl border border-green-500/20">
                           <div className="text-4xl font-bold text-white mb-2">12,500+</div>
                           <div className="text-green-400 text-sm font-semibold">Trees Saved</div>
                       </div>
                       <div className="p-6 bg-slate-800/50 rounded-2xl border border-blue-500/20">
                            <div className="text-4xl font-bold text-white mb-2">1.5M+</div>
                            <div className="text-blue-400 text-sm font-semibold">Pages Digitized</div>
                       </div>
                       <div className="p-6 bg-slate-800/50 rounded-2xl border border-purple-500/20">
                            <div className="text-4xl font-bold text-white mb-2">40%</div>
                            <div className="text-purple-400 text-sm font-semibold">Student Stress Reduced</div>
                       </div>
                       <div className="p-6 bg-slate-800/50 rounded-2xl border border-yellow-500/20">
                            <div className="text-4xl font-bold text-white mb-2">600+</div>
                            <div className="text-yellow-400 text-sm font-semibold">Hours Saved/Sem</div>
                       </div>
                   </div>
               </div>

           </div>
      </section>

      {/* REALITY CHECK / COMPLIANCE SECTION */}
      <section className="py-24 bg-slate-950 border-t border-white/5">
        <div className="container mx-auto px-6">
            <div className="grid lg:grid-cols-2 gap-12 items-center">
                <div>
                     <h2 className="text-orange-400 font-bold tracking-wider uppercase mb-3 text-sm">The Reality Check</h2>
                     <h3 className="text-3xl md:text-5xl font-bold mb-6 text-white">Why Do We Still Print?</h3>
                     <p className="text-slate-400 text-lg mb-6 leading-relaxed">
                         Despite AICTE's push for digital campuses, Indian colleges still rely on printed submissions. This isn't just habit; it's a systemic resistance driven by an outdated mindset.
                     </p>
                     
                     <div className="space-y-6">
                        <div className="flex gap-4">
                            <div className="mt-1"><Shield className="text-orange-500 w-5 h-5"/></div>
                            <div>
                                <h4 className="font-bold text-white">The "Audit" Myth</h4>
                                <p className="text-slate-400 text-sm">Physical papers are incorrectly viewed as "safer" for audits. In reality, they are prone to loss, fire, and pests, unlike our <span className="text-green-400">immutable, encrypted digital logs</span>.</p>
                            </div>
                        </div>
                        <div className="flex gap-4">
                             <div className="mt-1"><Zap className="text-orange-500 w-5 h-5"/></div>
                             <div>
                                 <h4 className="font-bold text-white">Administrative Control</h4>
                                 <p className="text-slate-400 text-sm">The heavy reliance on signatures and stamps keeps the paper ecosystem alive. EcoSubmit replicates this authority with <span className="text-green-400">cryptographically secure digital signatures</span>.</p>
                             </div>
                        </div>
                        <div className="flex gap-4">
                             <div className="mt-1"><Users className="text-orange-500 w-5 h-5"/></div>
                             <div>
                                 <h4 className="font-bold text-white">Infrastructure & Formality</h4>
                                 <p className="text-slate-400 text-sm">Submissions are often treated as a formality. We transform them into <span className="text-green-400">meaningful AI-driven evaluations</span>, with zero heavy infrastructure needed.</p>
                             </div>
                        </div>
                     </div>
                </div>

                <div className="bg-slate-900/50 p-8 rounded-3xl border border-white/10 hover:border-green-500/30 transition-all duration-300">
                    <h3 className="text-2xl font-bold mb-6 text-green-400 flex items-center gap-2">
                        <CheckCircle className="w-6 h-6"/> AICTE & Compliance Ready
                    </h3>
                    <p className="text-slate-300 mb-6 font-medium">
                        EcoSubmit isn't just an app; it's a partner in digital transformation, helping institutions meet modern educational standards (NEP 2020).
                    </p>
                    <div className="space-y-4">
                        <div className="bg-black/20 p-4 rounded-xl border border-white/5">
                            <h5 className="font-bold text-white mb-1">Audit-Ready Archives</h5>
                            <p className="text-xs text-slate-400">Instant retrieval of any submission from the last 5 years for AICTE/UGC inspections, eliminating physical storage costs.</p>
                        </div>
                        <div className="bg-black/20 p-4 rounded-xl border border-white/5">
                            <h5 className="font-bold text-white mb-1">Zero-Infrastructure Needed</h5>
                            <p className="text-xs text-slate-400">Cloud-native platform. No servers to buy. No complicated training. Works on basic smartphones, bypassing local infrastructure gaps.</p>
                        </div>
                        <div className="bg-black/20 p-4 rounded-xl border border-white/5">
                            <h5 className="font-bold text-white mb-1">Breaking the "Formality" Cycle</h5>
                            <p className="text-xs text-slate-400">We make submissions valuable again. Instead of a "tick mark," students get detailed AI feedback, fostering genuine learning.</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
      </section>

      {/* WORKFLOW SECTION */}
      <section id="workflow" className="py-24 bg-slate-900/30 border-y border-white/5">
            <div className="container mx-auto px-6">
                <div className="text-center max-w-3xl mx-auto mb-16">
                    <h2 className="text-green-400 font-bold tracking-wider uppercase mb-3 text-sm">Our Workflow</h2>
                    <h3 className="text-3xl md:text-5xl font-bold mb-6">Simplifying The Process</h3>
                    <p className="text-slate-400 text-lg">From the first draft to the final grade, we've optimized every step to ensure clarity and efficiency.</p>
                </div>

                <div className="grid md:grid-cols-4 gap-8 relative">
                    {/* Connecting Line (Desktop) */}
                    <div className="hidden md:block absolute top-12 left-0 w-full h-0.5 bg-gradient-to-r from-transparent via-green-500/30 to-transparent dashed-line" />

                    {[
                        { icon: Upload, title: "1. Upload", desc: "Students upload PDF/DOCX or capture images." },
                        { icon: Cpu, title: "2. AI Analysis", desc: "System checks for topic uniqueness & plagiarism." },
                        { icon: Users, title: "3. Review", desc: "Professors view generated PDFs with cover pages." },
                        { icon: CheckCircle, title: "4. Grade", desc: "Instant grading & feedback delivery." }
                    ].map((step, idx) => (
                        <motion.div 
                            key={idx}
                            initial={{ opacity: 0, y: 30 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            transition={{ delay: idx * 0.1, duration: 0.5 }}
                            className="relative flex flex-col items-center text-center group"
                        >
                            <div className="w-24 h-24 rounded-full bg-slate-950 border border-white/10 shadow-[0_0_20px_-5px_rgba(0,0,0,0.5)] flex items-center justify-center mb-6 relative z-10 group-hover:scale-110 transition-transform duration-300 group-hover:border-green-500/50">
                                <step.icon className="w-10 h-10 text-green-400" />
                            </div>
                            <h4 className="text-xl font-bold mb-3">{step.title}</h4>
                            <p className="text-slate-400 text-sm leading-relaxed max-w-[200px]">{step.desc}</p>
                        </motion.div>
                    ))}
                </div>
            </div>
      </section>

      {/* WHY US / FEATURES SECTION */}
      <section id="why-us" className="py-24 bg-slate-950 relative overflow-hidden">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-green-500/5 rounded-full blur-[120px] pointer-events-none" />
          
          <div className="container mx-auto px-6 relative z-10">
                <div className="text-center max-w-3xl mx-auto mb-16">
                    <h2 className="text-green-400 font-bold tracking-wider uppercase mb-3 text-sm">Why Choose Us</h2>
                    <h3 className="text-3xl md:text-5xl font-bold mb-6">Designed For Modern Education</h3>
                </div>

                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                    <FeatureCard icon={<Shield />} title="End-to-End Security" desc="Your academic data is encrypted and protected by enterprise-grade security protocols." delay={0.1} />
                    <FeatureCard icon={<Zap />} title="Lightning Fast" desc="Optimized cloud infrastructure ensures your uploads and reviews happen in milliseconds." delay={0.2} />
                    <FeatureCard icon={<Leaf />} title="100% Paperless" desc="Save thousands of trees annually by switching to our fully digital submission workflow." delay={0.3} />
                    <FeatureCard icon={<GraduationCap />} title="Academic Integrity" desc="Built-in AI tools help maintain high standards by checking for topic duplication." delay={0.4} />
                    <FeatureCard icon={<FileText />} title="Dynamic Cover Pages" desc="Automatically generate standardized, professional cover pages for every submission." delay={0.5} />
                    <FeatureCard icon={<Users />} title="Collaborative" desc="Seamless communication channel between students and professors for better guidance." delay={0.6} />
                </div>
          </div>
      </section>

      {/* CONTACT SECTION */}
      <section id="contact" className="py-24 bg-gradient-to-b from-slate-900/50 to-slate-950 border-t border-white/5">
         <div className="container mx-auto px-6">
            <div className="grid lg:grid-cols-2 gap-12 max-w-5xl mx-auto">
                <div>
                     <h2 className="text-green-400 font-bold tracking-wider uppercase mb-3 text-sm">Get In Touch</h2>
                     <h3 className="text-3xl font-bold mb-6">Have Questions?</h3>
                     <p className="text-slate-400 mb-8 leading-relaxed">
                         Whether you are an institution looking to adopt EcoSubmit or a student needing help, our team is ready to assist you.
                     </p>
                     
                     <div className="space-y-6">
                         <div className="flex items-center gap-4">
                             <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center text-green-400">
                                 <Mail className="w-5 h-5" />
                             </div>
                             <div>
                                 <p className="font-semibold">Email Us</p>
                                 <p className="text-slate-400 text-sm">support@ecosubmit.edu</p>
                             </div>
                         </div>
                         <div className="flex items-center gap-4">
                             <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center text-green-400">
                                 <Phone className="w-5 h-5" />
                             </div>
                             <div>
                                 <p className="font-semibold">Call Us</p>
                                 <p className="text-slate-400 text-sm">+91 123 456 7890</p>
                             </div>
                         </div>
                         <div className="flex items-center gap-4">
                             <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center text-green-400">
                                 <MapPin className="w-5 h-5" />
                             </div>
                             <div>
                                 <p className="font-semibold">Visit Us</p>
                                 <p className="text-slate-400 text-sm">MITS Gwalior Campus, MP, India</p>
                             </div>
                         </div>
                     </div>
                </div>

                <Card className="bg-slate-900 border-white/10 p-2">
                    <CardHeader>
                        <CardTitle>Send a Message</CardTitle>
                        <CardDescription>We usually respond within 24 hours.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                             <input className="bg-slate-950 border border-white/10 rounded-md px-4 py-3 text-sm focus:outline-none focus:border-green-500 transition-colors" placeholder="First Name" />
                             <input className="bg-slate-950 border border-white/10 rounded-md px-4 py-3 text-sm focus:outline-none focus:border-green-500 transition-colors" placeholder="Last Name" />
                        </div>
                        <input className="bg-slate-950 border border-white/10 rounded-md px-4 py-3 text-sm w-full focus:outline-none focus:border-green-500 transition-colors" placeholder="Email Address" />
                        <textarea className="bg-slate-950 border border-white/10 rounded-md px-4 py-3 text-sm w-full h-32 resize-none focus:outline-none focus:border-green-500 transition-colors" placeholder="Your Message..." />
                        <Button className="w-full bg-green-600 hover:bg-green-700">Send Message</Button>
                    </CardContent>
                </Card>
            </div>
         </div>
      </section>

      {/* FOOTER */}
      <footer className="py-8 border-t border-white/5 bg-slate-950 text-center text-slate-500 text-sm">
          <p>© 2024-2025 EcoSubmit. All rights reserved.</p>
          <div className="flex justify-center gap-4 mt-2">
              <a href="#" className="hover:text-green-400">Privacy Policy</a>
              <a href="#" className="hover:text-green-400">Terms of Service</a>
          </div>
      </footer>
    </div>
  );
};

const FeatureCard = ({ icon, title, desc, delay }: { icon: React.ReactNode, title: string, desc: string, delay: number }) => {
    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay, duration: 0.5 }}
            className="h-full"
        >
            <div className="group h-full p-8 rounded-3xl bg-slate-900/40 border border-white/5 hover:border-green-500/30 hover:bg-slate-800/60 hover:shadow-[0_0_30px_-10px_rgba(74,222,128,0.1)] transition-all duration-300">
                <div className="w-12 h-12 rounded-xl bg-slate-800 flex items-center justify-center text-green-400 mb-6 group-hover:scale-110 transition-transform duration-300">
                    {/* Simplified icon rendering to avoid cloneElement complexity with ReactNode */}
                    {icon}
                </div>
                <h4 className="text-xl font-bold mb-3 text-slate-100">{title}</h4>
                <p className="text-slate-400 text-sm leading-relaxed">
                    {desc}
                </p>
            </div>
        </motion.div>
    )
}

export default Home;


