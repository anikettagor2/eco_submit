import { useState } from 'react';
import { db } from '../lib/firebase';
import { doc, setDoc } from 'firebase/firestore';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { useAuth } from '../contexts/AuthContext';
import { motion, AnimatePresence } from 'framer-motion';
import { GraduationCap, School, ChevronLeft, Check, Loader2 } from 'lucide-react';
import { COLLEGE_DATA } from '../lib/data';

const DEPARTMENTS = COLLEGE_DATA.departments.map(d => d.name);

const RoleSelection = () => {
    const { currentUser } = useAuth();
    const [loading, setLoading] = useState(false);
    const [selectedRole, setSelectedRole] = useState<'student' | 'professor' | null>(null);
    const [formData, setFormData] = useState({
        department: '',
        rollNo: '',
        sessionYear: new Date().getFullYear().toString()
    });

    const handleSaveProfile = async () => {
        if (!currentUser || !selectedRole) return;
        if (!formData.department) {
            alert("Please select a department");
            return;
        }
        if (selectedRole === 'student' && (!formData.rollNo || !formData.sessionYear)) {
            alert("Please fill in all fields");
            return;
        }

        setLoading(true);
        try {
            await setDoc(doc(db, 'users', currentUser.uid), {
                uid: currentUser.uid,
                email: currentUser.email,
                name: currentUser.displayName || currentUser.email?.split('@')[0],
                role: selectedRole,
                department: formData.department,
                rollNo: selectedRole === 'student' ? formData.rollNo : null,
                sessionYear: selectedRole === 'student' ? formData.sessionYear : null,
                createdAt: new Date().toISOString()
            }, { merge: true });
            
            window.location.reload(); 
        } catch (error) {
            console.error("Error setting role:", error);
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex flex-col items-center justify-center p-4 relative overflow-hidden bg-slate-50 dark:bg-slate-950">
             {/* Background decoration */ }
             <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
                <div className="absolute -top-[20%] -left-[10%] w-[50%] h-[50%] rounded-full bg-green-500/10 blur-3xl" />
                <div className="absolute top-[40%] -right-[10%] w-[40%] h-[40%] rounded-full bg-blue-500/10 blur-3xl" />
            </div>

            <div className="relative z-10 w-full max-w-4xl">
                 <div className="text-center mb-12">
                    <motion.h1 
                        initial={{ opacity: 0, y: -20 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="text-4xl font-extrabold tracking-tight lg:text-5xl mb-4 bg-clip-text text-transparent bg-gradient-to-r from-green-600 to-blue-600 dark:from-green-400 dark:to-blue-400"
                    >
                        Choose Your Path
                    </motion.h1>
                    <motion.p 
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.2 }}
                        className="text-lg text-muted-foreground"
                    >
                        Tell us how you'll be using EcoSubmit
                    </motion.p>
                 </div>

                 <AnimatePresence mode='wait'>
                    {!selectedRole ? (
                        <motion.div 
                            key="selection"
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            transition={{ duration: 0.3 }}
                            className="grid gap-8 md:grid-cols-2"
                        >
                            <RoleCard 
                                role="student"
                                title="Student"
                                description="Submit assignments, track grades, and build your digital portfolio."
                                icon={<GraduationCap className="h-20 w-20 text-green-500" />}
                                onClick={() => setSelectedRole('student')}
                            />
                            <RoleCard 
                                role="professor"
                                title="Professor"
                                description="Manage classes, grade submissions, and mentor students efficiently."
                                icon={<School className="h-20 w-20 text-blue-500" />}
                                onClick={() => setSelectedRole('professor')}
                            />
                        </motion.div>
                    ) : (
                        <motion.div
                            key="form"
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -20 }}
                            className="max-w-md mx-auto"
                        >
                            <Card className="border-2 border-muted/50 shadow-xl backdrop-blur-sm bg-background/95">
                                <CardHeader>
                                    <div className="flex items-center gap-4 mb-2">
                                        <Button size="icon" variant="ghost" onClick={() => setSelectedRole(null)}>
                                            <ChevronLeft className="h-4 w-4" />
                                        </Button>
                                        <div>
                                            <CardTitle>Complete Profile</CardTitle>
                                            <CardDescription>
                                                Registering as <span className="font-bold capitalize text-primary">{selectedRole}</span>
                                            </CardDescription>
                                        </div>
                                    </div>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    <div className="space-y-2">
                                        <label className="text-sm font-medium">Department</label>
                                        <select 
                                            className="flex h-10 w-full rounded-md border border-input bg-background/50 px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                            value={formData.department}
                                            onChange={e => setFormData({...formData, department: e.target.value})}
                                        >
                                            <option value="">Select Department</option>
                                            {DEPARTMENTS.map(d => (
                                                <option key={d} value={d}>{d}</option>
                                            ))}
                                        </select>
                                    </div>

                                    {selectedRole === 'student' && (
                                        <>
                                            <div className="space-y-2">
                                                <label className="text-sm font-medium">Roll Number</label>
                                                <input 
                                                    className="flex h-10 w-full rounded-md border border-input bg-background/50 px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                                    placeholder="e.g. 12345"
                                                    value={formData.rollNo}
                                                    onChange={e => setFormData({...formData, rollNo: e.target.value})}
                                                />
                                            </div>
                                            <div className="space-y-2">
                                                <label className="text-sm font-medium">Session Year</label>
                                                <input 
                                                    className="flex h-10 w-full rounded-md border border-input bg-background/50 px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                                    placeholder="e.g. 2025"
                                                    value={formData.sessionYear}
                                                    onChange={e => setFormData({...formData, sessionYear: e.target.value})}
                                                />
                                            </div>
                                        </>
                                    )}

                                    <Button onClick={handleSaveProfile} disabled={loading} className="w-full mt-6">
                                        {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}
                                        {loading ? 'Setting up...' : 'Complete Registration'}
                                    </Button>
                                </CardContent>
                            </Card>
                        </motion.div>
                    )}
                 </AnimatePresence>
            </div>
        </div>
    );
};

const RoleCard = ({ role, title, description, icon, onClick }: { role: string, title: string, description: string, icon: React.ReactNode, onClick: () => void }) => {
    return (
        <motion.div
            whileHover={{ y: -5 }}
            whileTap={{ scale: 0.98 }}
        >
            <Card 
                className="h-full cursor-pointer hover:border-primary transition-colors duration-300 relative overflow-hidden group"
                onClick={onClick}
            >
                <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                <CardHeader>
                    <div className="mb-4 flex justify-center">
                        <div className="p-4 rounded-full bg-secondary/50 group-hover:bg-secondary transition-colors">
                            {icon}
                        </div>
                    </div>
                    <CardTitle className="text-center text-2xl">{title}</CardTitle>
                    <CardDescription className="text-center text-base mt-2">
                        {description}
                    </CardDescription>
                </CardHeader>
                <CardContent className="pb-8">
                     <Button className="w-full mt-4 group-hover:bg-primary group-hover:text-primary-foreground transition-colors" variant="secondary">
                        Select {title}
                     </Button>
                </CardContent>
            </Card>
        </motion.div>
    );
}

export default RoleSelection;
