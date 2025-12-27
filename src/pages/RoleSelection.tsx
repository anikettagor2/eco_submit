import { useState, useCallback } from 'react';
import { db, storage } from '../lib/firebase';
import { doc, setDoc, collection, addDoc, query, where, getDocs } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { useAuth } from '../contexts/AuthContext';
import { motion, AnimatePresence } from 'framer-motion';
import { GraduationCap, School, ChevronLeft, Check, Loader2, ShieldAlert, Plus, Trash2, Upload } from 'lucide-react';
import { COLLEGE_DATA } from '../lib/data';
import Cropper from 'react-easy-crop';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog';

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
const DEPARTMENTS = COLLEGE_DATA.departments.map(d => d.name);

// --- CROP UTILS ---
const createImage = (url: string): Promise<HTMLImageElement> =>
    new Promise((resolve, reject) => {
        const image = new Image();
        image.addEventListener('load', () => resolve(image));
        image.addEventListener('error', (error) => reject(error));
        image.setAttribute('crossOrigin', 'anonymous');
        image.src = url;
    });

async function getCroppedImg(imageSrc: string, pixelCrop: any): Promise<Blob> {
    const image = await createImage(imageSrc);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    if (!ctx) {
        throw new Error('No 2d context');
    }

    // Set width/height to exactly 300x100 as requested
    canvas.width = 300;
    canvas.height = 100;

    // Draw the cropped area from the source image into the 300x100 canvas
    // pixelCrop contains { x, y, width, height } of the source image
    ctx.drawImage(
        image,
        pixelCrop.x,
        pixelCrop.y,
        pixelCrop.width,
        pixelCrop.height,
        0,
        0,
        300,
        100
    );

    return new Promise((resolve, reject) => {
        canvas.toBlob((blob) => {
            if (!blob) {
                reject(new Error('Canvas is empty'));
                return;
            }
            resolve(blob);
        }, 'image/png');
    });
}


const RoleSelection = () => {
    const { currentUser } = useAuth();
    const [loading, setLoading] = useState(false);
    const [selectedRole, setSelectedRole] = useState<'student' | 'professor' | 'admin' | null>(null);
    const [formData, setFormData] = useState({
        department: '',
        rollNo: '',
        sessionYear: new Date().getFullYear().toString(),
        semester: '1',
        division: ''
    });

    // Professor Subject State
    const [subjects, setSubjects] = useState<{name: string; code: string; division: string; requirements: string[]}[]>([]);
    const [newSubject, setNewSubject] = useState({ name: '', code: '', division: 'A', requirements: [] as string[] });
    const [showSuggestions, setShowSuggestions] = useState(false);

    // --- SIGNATURE STATE ---
    const [signatureFile, setSignatureFile] = useState<Blob | null>(null);
    const [signaturePreview, setSignaturePreview] = useState<string | null>(null);
    const [imageSrc, setImageSrc] = useState<string | null>(null);
    const [crop, setCrop] = useState({ x: 0, y: 0 });
    const [zoom, setZoom] = useState(1);
    const [croppedAreaPixels, setCroppedAreaPixels] = useState<any>(null);
    const [isCropOpen, setIsCropOpen] = useState(false);

    const onCropComplete = useCallback((_croppedArea: any, croppedAreaPixels: any) => {
        setCroppedAreaPixels(croppedAreaPixels);
    }, []);

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            const file = e.target.files[0];
            const reader = new FileReader();
            reader.addEventListener('load', () => {
                setImageSrc(reader.result?.toString() || null);
                setIsCropOpen(true);
            });
            reader.readAsDataURL(file);
        }
    };

    const handleCropSave = async () => {
        if (!imageSrc || !croppedAreaPixels) return;
        try {
            const croppedBlob = await getCroppedImg(imageSrc, croppedAreaPixels);
            setSignatureFile(croppedBlob);
            setSignaturePreview(URL.createObjectURL(croppedBlob));
            setIsCropOpen(false);
        } catch (e) {
            console.error(e);
            alert("Failed to crop image");
        }
    };

    const availableSubjects = formData.department 
        ? COLLEGE_DATA.departments.find(d => d.name === formData.department)?.subjects || []
        : [];
    
    // Filter suggestions: show if query exists and is not exact match
    const filteredSuggestions = newSubject.name && showSuggestions
        ? availableSubjects.filter(s => s.name.toLowerCase().includes(newSubject.name.toLowerCase()) && s.name.toLowerCase() !== newSubject.name.toLowerCase())
        : [];

    const handleAddSubject = () => {
        if (!newSubject.name) {
            alert("Please enter subject name");
            return;
        }
        setSubjects([...subjects, { ...newSubject }]);
        setNewSubject({ name: '', code: '', division: 'A', requirements: [] });
    };

    const toggleRequirement = (req: string) => {
        if (newSubject.requirements.includes(req)) {
            setNewSubject({ ...newSubject, requirements: newSubject.requirements.filter(r => r !== req) });
        } else {
            setNewSubject({ ...newSubject, requirements: [...newSubject.requirements, req] });
        }
    };

    const removeSubject = (index: number) => {
        setSubjects(subjects.filter((_, i) => i !== index));
    };

    const REQ_OPTIONS = ["Assignment", "Micro Project", "Macro Project", "Mini Skill Project"];

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
        if (selectedRole === 'professor') {
            if (subjects.length === 0) {
                 alert("Please add at least one subject you teach.");
                 return;
            }
            if (!signatureFile) {
                alert("Please upload your digital signature.");
                return;
            }

            // Validate duplicate subjects
            for (const subj of subjects) {
                try {
                    const q = query(
                        collection(db, "subjects"), 
                        where("code", "==", subj.code), 
                        where("department", "==", formData.department),
                        where("section", "==", subj.division)
                    );
                    const existing = await getDocs(q);
                    if (!existing.empty) {
                        alert(`Subject "${subj.name}" (${subj.code}) for Section ${subj.division} already exists in this department!`);
                        return;
                    }
                } catch (e) {
                    console.error("Error checking duplicates:", e);
                    // Decide whether to block or continue. Safer to block if we can't verify? 
                    // Or maybe just log and continue. I'll just log and let it try to save, Firestore rules might catch it later if enforced there.
                }
            }
        }

        setLoading(true);
        try {
            let signatureUrl = "";
            
            // Upload Signature if Professor
            if (selectedRole === 'professor' && signatureFile) {
                const storageRef = ref(storage, `signatures/${currentUser.uid}_${Date.now()}.png`);
                await uploadBytes(storageRef, signatureFile);
                signatureUrl = await getDownloadURL(storageRef);
            }

            await setDoc(doc(db, 'users', currentUser.uid), {
                uid: currentUser.uid,
                email: currentUser.email,
                name: currentUser.displayName || currentUser.email?.split('@')[0],
                role: selectedRole,
                department: formData.department,
                rollNo: selectedRole === 'student' ? formData.rollNo : null,
                sessionYear: selectedRole === 'student' ? formData.sessionYear : null,
                // Add new fields (Student specific)
                semester: selectedRole === 'student' ? formData.semester : null,
                section: selectedRole === 'student' ? formData.division : null, // Mapped to 'section' as per type definition
                signatureUrl: signatureUrl || null,
                createdAt: new Date().toISOString()
            }, { merge: true });

            // Create Subjects if Professor
            if (selectedRole === 'professor') {
                const subjectsRef = collection(db, 'subjects');
                await Promise.all(subjects.map(async (subj) => {
                    await addDoc(subjectsRef, {
                        name: subj.name,
                        code: subj.code || '', // Save Code
                        professorId: currentUser.uid,
                        department: formData.department,
                        section: subj.division,
                        requirements: subj.requirements,
                        semester: '1', 
                        createdAt: new Date().toISOString()
                    });
                }));
            }
             
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
                            
                            {/* Admin Option (Hidden/Small for Dev or Explicit) - Let's make it explicit as requested */}
                             <div className="md:col-span-2 flex justify-center mt-4">
                                <motion.button
                                    whileHover={{ scale: 1.05 }}
                                    whileTap={{ scale: 0.95 }}
                                    onClick={() => setSelectedRole('admin')}
                                    className="flex items-center gap-2 text-sm text-muted-foreground hover:text-red-600 transition-colors bg-white/50 backdrop-blur px-4 py-2 rounded-full border border-gray-200 dark:bg-black/20 dark:border-gray-800"
                                >
                                    <ShieldAlert className="h-4 w-4" />
                                    <span>Register as Administrator</span>
                                </motion.button>
                            </div>
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
                                            <Select 
                                                value={formData.department}
                                                onValueChange={(v) => setFormData({...formData, department: v})}
                                            >
                                                <SelectTrigger>
                                                    <SelectValue placeholder="Select Department" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {DEPARTMENTS.map(d => (
                                                        <SelectItem key={d} value={d}>{d}</SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
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
                                            <div className="grid grid-cols-2 gap-4">
                                                <div className="space-y-2">
                                                    <label className="text-sm font-medium">Semester</label>
                                                    <Select 
                                                        value={formData.semester}
                                                        onValueChange={(v) => setFormData({...formData, semester: v})}
                                                    >
                                                        <SelectTrigger>
                                                            <SelectValue placeholder="Sem" />
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            {[1, 2, 3, 4, 5, 6, 7, 8].map(sem => (
                                                                <SelectItem key={sem} value={sem.toString()}>{sem}</SelectItem>
                                                            ))}
                                                        </SelectContent>
                                                    </Select>
                                                </div>
                                                <div className="space-y-2">
                                                    <label className="text-sm font-medium">Division</label>
                                                    <Select 
                                                        value={formData.division} 
                                                        onValueChange={(v) => setFormData({...formData, division: v})}
                                                    >
                                                         <SelectTrigger>
                                                            <SelectValue placeholder="Select Div" />
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            <SelectItem value="A">Division A</SelectItem>
                                                            <SelectItem value="B">Division B</SelectItem>
                                                        </SelectContent>
                                                    </Select>
                                                </div>
                                            </div>
                                        </>
                                    )}

                                    {selectedRole === 'professor' && (
                                        <div className="space-y-4 pt-4 border-t">
                                            <h3 className="font-semibold text-sm">Add Subjects You Teach</h3>
                                            
                                            <div className="space-y-3 p-3 border rounded-lg bg-muted/20">
                                                <div className="grid grid-cols-3 gap-3">
                                                    <div className="col-span-2 relative">
                                                        <input 
                                                            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus:ring-2 focus:ring-ring"
                                                            placeholder="Subject Name"
                                                            value={newSubject.name}
                                                            onChange={e => {
                                                                setNewSubject({...newSubject, name: e.target.value});
                                                                setShowSuggestions(true);
                                                            }}
                                                            onFocus={() => setShowSuggestions(true)}
                                                            onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                                                        />
                                                        {filteredSuggestions.length > 0 && (
                                                            <div className="absolute z-50 w-full bg-popover text-popover-foreground border rounded-md shadow-md mt-1 max-h-40 overflow-auto">
                                                                {filteredSuggestions.map(s => (
                                                                    <div 
                                                                        key={s.code} 
                                                                        className="p-2 hover:bg-accent hover:text-accent-foreground cursor-pointer text-sm flex justify-between"
                                                                        onMouseDown={(e) => {
                                                                            e.preventDefault();
                                                                            setNewSubject({ ...newSubject, name: s.name, code: s.code }); // Set Code too
                                                                            setShowSuggestions(false);
                                                                        }}
                                                                    >
                                                                        <span>{s.name}</span>
                                                                        <span className="text-xs text-muted-foreground">{s.code}</span>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        )}
                                                    </div>
                                                    <div className="col-span-1">
                                                        <input 
                                                            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus:ring-2 focus:ring-ring"
                                                            placeholder="Code"
                                                            value={newSubject.code}
                                                            onChange={e => setNewSubject({...newSubject, code: e.target.value})}
                                                        />
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <span className="text-sm text-muted-foreground w-20">Division:</span>
                                                    <Select value={newSubject.division} onValueChange={v => setNewSubject({...newSubject, division: v})}>
                                                        <SelectTrigger className="w-32">
                                                            <SelectValue />
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            <SelectItem value="A">Div A</SelectItem>
                                                            <SelectItem value="B">Div B</SelectItem>
                                                        </SelectContent>
                                                    </Select>
                                                </div>
                                                <div className="space-y-2">
                                                    <label className="text-xs font-medium text-muted-foreground">Requirements:</label>
                                                    <div className="flex flex-wrap gap-2">
                                                        {REQ_OPTIONS.map(req => (
                                                            <Button 
                                                                key={req} 
                                                                size="sm" 
                                                                variant={newSubject.requirements.includes(req) ? "default" : "outline"}
                                                                onClick={() => toggleRequirement(req)}
                                                                className="text-xs h-7"
                                                            >
                                                                {req}
                                                            </Button>
                                                        ))}
                                                    </div>
                                                </div>
                                                <Button size="sm" onClick={handleAddSubject} className="w-full gap-2" variant="secondary">
                                                    <Plus className="h-4 w-4" /> Add Subject
                                                </Button>
                                            </div>
                                            
                                            {/* List */}
                                            {subjects.length > 0 && (
                                                <div className="space-y-2 max-h-40 overflow-y-auto">
                                                    {subjects.map((s, idx) => (
                                                        <div key={idx} className="flex items-center justify-between p-2 border rounded bg-background">
                                                            <div>
                                                                <p className="text-sm font-medium">
                                                                    {s.name} <span className="text-xs text-muted-foreground">({s.code})</span>
                                                                </p>
                                                                <p className="text-xs text-muted-foreground">Div {s.division} • {s.requirements.join(', ')}</p>
                                                            </div>
                                                            <Button size="icon" variant="ghost" onClick={() => removeSubject(idx)} className="h-6 w-6 text-red-500">
                                                                <Trash2 className="h-3 w-3" />
                                                            </Button>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}

                                            {/* Digital Signature Upload */}
                                            <div className="pt-4 border-t space-y-3">
                                                <div className="flex items-center justify-between">
                                                    <h3 className="font-semibold text-sm">Digital Signature</h3>
                                                    {signatureFile ? <Check className="h-4 w-4 text-green-500" /> : <ShieldAlert className="h-4 w-4 text-amber-500" />}
                                                </div>
                                                <p className="text-xs text-muted-foreground">Upload an image of your signature. You will crop it to 300x100px.</p>
                                                
                                                {!signaturePreview ? (
                                                    <div className="border-2 border-dashed rounded-lg p-6 flex flex-col items-center justify-center cursor-pointer hover:bg-muted/50 transition-colors relative">
                                                        <input 
                                                            type="file" 
                                                            accept="image/*"
                                                            onChange={handleFileChange}
                                                            className="absolute inset-0 opacity-0 cursor-pointer"
                                                        />
                                                        <Upload className="h-8 w-8 text-muted-foreground mb-2" />
                                                        <span className="text-sm font-medium">Click to upload image</span>
                                                    </div>
                                                ) : (
                                                    <div className="relative group border rounded-lg overflow-hidden bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800">
                                                        {/* Force exact dimensions in display to signify the result */}
                                                        <div className="w-[300px] h-[100px] mx-auto bg-white flex items-center justify-center">
                                                            <img src={signaturePreview} alt="Signature Preview" className="max-h-full max-w-full" />
                                                        </div>
                                                        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                                                            <Button size="sm" variant="destructive" onClick={() => {
                                                                setSignatureFile(null);
                                                                setSignaturePreview(null);
                                                            }}>
                                                                <Trash2 className="h-4 w-4" /> Remove
                                                            </Button>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
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
            {/* Cropping Dialog */}
            <Dialog open={isCropOpen} onOpenChange={setIsCropOpen}>
                <DialogContent className="max-w-xl">
                    <DialogHeader>
                        <DialogTitle>Adjust Signature (300 x 100)</DialogTitle>
                    </DialogHeader>
                    <div className="relative w-full h-[300px] bg-black/5 rounded-md overflow-hidden border">
                        {imageSrc && (
                            <Cropper
                                image={imageSrc}
                                crop={crop}
                                zoom={zoom}
                                aspect={3 / 1}
                                onCropChange={setCrop}
                                onCropComplete={onCropComplete}
                                onZoomChange={setZoom}
                            />
                        )}
                    </div>
                    <div className="py-4 space-y-2">
                        <div className="flex justify-between">
                            <label className="text-sm font-medium">Zoom</label>
                            <span className="text-xs text-muted-foreground">{zoom.toFixed(1)}x</span>
                        </div>
                        <input 
                            type="range" 
                            min={1} 
                            max={3} 
                            step={0.1} 
                            value={zoom} 
                            onChange={(e) => setZoom(Number(e.target.value))}
                            className="w-full h-2 bg-secondary rounded-lg appearance-none cursor-pointer" 
                        />
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsCropOpen(false)}>Cancel</Button>
                        <Button onClick={handleCropSave}>Save & Crop</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
};

const RoleCard = ({ role: _role, title, description, icon, onClick }: { role: string, title: string, description: string, icon: React.ReactNode, onClick: () => void }) => {
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
