import { useState, useEffect, useMemo } from "react";
import { generateInsights } from "../../lib/ai";
import { useAuth } from "@/contexts/AuthContext";
import { db, storage } from "@/lib/firebase";
import { addCoverPageToPDF, addReviewStampToPDF } from "../../lib/pdfUtils";
import { COLLEGE_DATA } from "../../lib/data";

import { ref, uploadBytesResumable, getDownloadURL } from "firebase/storage";
import { collection, query, where, getDocs, addDoc, serverTimestamp, onSnapshot, doc, updateDoc, deleteField } from "firebase/firestore";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import type { Subject, Submission, UserProfile } from "../../types";

import { ThemeToggle } from "@/components/ThemeToggle";
import { ProfileDialog } from "@/components/ProfileDialog";
import { User, BookOpen, Clock, CheckCircle2, Pencil, Search, LogOut, FileText } from "lucide-react";

const ProfessorDashboard = () => {
    const { currentUser, userData, logout } = useAuth();
    const [subjects, setSubjects] = useState<Subject[]>([]);
    const [submissions, setSubmissions] = useState<Submission[]>([]);
    
    // Create Subject State
    const [newSubject, setNewSubject] = useState<{
        name: string; code: string; department: string; semester: string; section: string; requirements: string[]; aiEnabled: boolean; vivaDate: string 
    }>({ 
        name: '', code: '', department: '', semester: '', section: '', requirements: ['Assignment'], aiEnabled: true, vivaDate: '' 
    });
    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const [editingSubjectId, setEditingSubjectId] = useState<string | null>(null);
    
    // Division Selection State
    const [selectedGroup, setSelectedGroup] = useState<Subject[] | null>(null);
    const [isDivisionSelectOpen, setIsDivisionSelectOpen] = useState(false);

    // Subject Search State
    const [searchTerm, setSearchTerm] = useState("");
    const [isSearchOpen, setIsSearchOpen] = useState(false);
    
    const syllabusSubjects = useMemo(() => {
        if (!userData?.department) return [];
        const dept = COLLEGE_DATA.departments.find(d => d.name === userData.department);
        return dept ? dept.subjects : [];
    }, [userData?.department]);    // Grading State
    const [selectedSubmission, setSelectedSubmission] = useState<Submission | null>(null);
    const [marks, setMarks] = useState<string>("");
    const [viewGroup, setViewGroup] = useState<{
        studentId: string; studentName: string; submissions: Submission[]; subjectIds: string[];
    } | null>(null);
    const [activeSubjectTab, setActiveSubjectTab] = useState<string>("");

    // Update active tab when group opens
    useEffect(() => {
        if (viewGroup && viewGroup.subjectIds.length > 0) {
            setActiveSubjectTab(viewGroup.subjectIds[0]);
        }
    }, [viewGroup]);
    
    // Profile State
    const [isProfileOpen, setIsProfileOpen] = useState(false);

    // Template & Preview State
    const [templateConfig, setTemplateConfig] = useState<any>(null);
    const [previewPdfUrl, setPreviewPdfUrl] = useState<string | null>(null);
    const [isGeneratingPreview, setIsGeneratingPreview] = useState(false);

    useEffect(() => {
        if (!currentUser || !userData) return;

        // 0. Fetch Template Config (Real-time)
        const unsubTemplates = onSnapshot(doc(db, "settings", "cover_page_config"), (doc) => {
            if (doc.exists()) {
                setTemplateConfig(doc.data());
            }
        });

        // 1. Fetch Subjects (Only MY subjects)
        const qSubjects = query(collection(db, "subjects"), where("professorId", "==", currentUser.uid));
        const unsubSubjects = onSnapshot(qSubjects, (snapshot) => {
            const subs: Subject[] = [];
            snapshot.forEach(doc => subs.push({ id: doc.id, ...doc.data() } as Subject));
            setSubjects(subs);
        });

        // 2. Fetch Submissions
        const qSubmissions = query(collection(db, "submissions"));
        const unsubscribeSubmissions = onSnapshot(qSubmissions, (snapshot) => {
            const subs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Submission));
            setSubmissions(subs.sort((a, b) => b.createdAt?.seconds - a.createdAt?.seconds));
        });

        return () => {
            unsubTemplates();
            unsubSubjects();
            unsubscribeSubmissions();
        };
    }, [currentUser, userData]);

    const handleCreateSubject = async () => {
        if (!newSubject.name || !newSubject.code) return;
        
        try {
             // Generate Schedule if Viva Date is set
            let schedule: Record<string, { startTime: string; endTime: string; status: 'pending'|'present'|'absent' }> = {};
            
            if (newSubject.vivaDate) {
                // 1. Fetch Students
                const q = query(collection(db, "users"), 
                    where("role", "==", "student"),
                    where("department", "==", newSubject.department || userData?.department),
                    where("semester", "==", newSubject.semester),
                    where("section", "==", newSubject.section)
                );
                
                const snapshot = await getDocs(q);
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                const students = snapshot.docs.map(d => ({ uid: d.id, ...d.data() } as UserProfile));
                
                // Sort by Name
                students.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
                
                // 2. Assign Slots (10 mins each, starting 10:00 AM)
                const startTime = new Date(`${newSubject.vivaDate}T10:00:00`);
                let currentSlot = startTime.getTime();
                
                students.forEach(student => {
                    const startInfo = new Date(currentSlot);
                    const endInfo = new Date(currentSlot + 10 * 60000); // 10 mins
                    
                    // Simple logic: If > 18:00, stop scheduling
                    if (startInfo.getHours() >= 18) return; 

                    schedule[student.uid] = {
                        startTime: startInfo.toISOString(),
                        endTime: endInfo.toISOString(),
                        status: 'pending'
                    };
                    
                    currentSlot += 10 * 60000;
                });
            }

            const subjectData = {
                name: newSubject.name,
                code: newSubject.code,
                department: newSubject.department || userData?.department,
                semester: newSubject.semester,
                section: newSubject.section,
                requirements: newSubject.requirements,
                aiEnabled: newSubject.aiEnabled,
                vivaDate: newSubject.vivaDate,
                schedule: Object.keys(schedule).length > 0 ? schedule : undefined, // Only update if generated
                professorId: currentUser!.uid,
                createdAt: serverTimestamp()
            };

            if (editingSubjectId) {
                // Merge update
                await updateDoc(doc(db, "subjects", editingSubjectId), subjectData);
            } else {
                // Check for duplicate subject
                const q = query(
                    collection(db, "subjects"), 
                    where("code", "==", newSubject.code), 
                    where("department", "==", newSubject.department || userData?.department),
                    where("section", "==", newSubject.section)
                );
                const existing = await getDocs(q);
                if (!existing.empty) {
                    alert("Subject with this code, department, and section already exists!");
                    return;
                }
                await addDoc(collection(db, "subjects"), subjectData);
            }
            setIsCreateOpen(false);
            setNewSubject({ name: '', code: '', department: userData?.department || '', semester: '', section: '', requirements: ['Assignment'], aiEnabled: true, vivaDate: '' });
            setEditingSubjectId(null);
        } catch (e) {
            console.error("Error saving subject:", e);
            alert("Failed to save subject.");
        }
    };
    
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const handleEditClick = (sub: any) => {
        setEditingSubjectId(sub.id);
        setNewSubject({
            name: sub.name,
            code: sub.code,
            department: sub.department,
            semester: sub.semester,
            section: sub.section,
            requirements: sub.requirements || ['Assignment'],
            aiEnabled: sub.aiEnabled !== false,
            vivaDate: sub.vivaDate || ''
        });
        setIsCreateOpen(true);
    };


    
    // Auto-fill department when opening
    useEffect(() => {
        if (isCreateOpen && userData?.department) {
            setNewSubject(prev => ({ ...prev, department: userData.department || '' }));
        }
    }, [isCreateOpen, userData]);


    
    const [filterSubjectId, setFilterSubjectId] = useState<string>("all");

    // Filter Subjects by Department (and Group them)
    const mySubjects = useMemo(() => {
        if (!userData?.department) return subjects;
        return subjects.filter(s => s.department === userData.department);
    }, [subjects, userData?.department]);

    const groupedSubjects = useMemo(() => {
        const groups: Record<string, Subject[]> = {};
        mySubjects.forEach(s => {
            const key = s.code; // Group by Code
            if (!groups[key]) groups[key] = [];
            groups[key].push(s);
        });
        return Object.values(groups);
    }, [mySubjects]);

    // Filter Submissions by Department AND Selected Subject
    const mySubmissions = useMemo(() => {
        let subs = submissions;
        
        // 1. Filter by Department (If Prof has one) - Redundant if we validly link to subjects, but safe keep
        if (userData?.department) {
            subs = subs.filter(s => s.department === userData.department);
        }

        // 2. Strict Access Control: Only show submissions for My Subjects
        const mySubjectIds = new Set(mySubjects.map(s => s.id));
        subs = subs.filter(s => mySubjectIds.has(s.subjectId));

        // 3. Filter by Selected Subject (Class/Section)
        if (filterSubjectId && filterSubjectId !== "all") {
            subs = subs.filter(s => s.subjectId === filterSubjectId);
        }

        return subs;
    }, [submissions, userData?.department, filterSubjectId]);



    const handleGrade = async () => {
        if (!selectedSubmission) return;
        try {
            // 1. Get the PDF to stamp (Merged or Original)
            const sourceUrl = selectedSubmission.mergedFilePath || selectedSubmission.originalFilePath;
            
            if (!sourceUrl) {
                alert("No file found to stamp.");
                return;
            }

            // 2. Fetch the file
            const existingPdfBytes = await fetch(sourceUrl).then(res => res.arrayBuffer());

            // 2. Prepare Data for Dynamic Page 4 (if used)
            const subject = subjects.find(s => s.id === selectedSubmission.subjectId);
            const coverData = {
                ...templateConfig, 
                name: selectedSubmission.studentName,
                rollNo: selectedSubmission.rollNo || "N/A",
                department: selectedSubmission.department || userData?.department || "N/A",
                sessionYear: selectedSubmission.sessionYear || "2025-26",
                subjectName: selectedSubmission.subjectName,
                subjectCode: subject?.code,
                topic: selectedSubmission.topic,
                submissionType: selectedSubmission.submissionType || "Assignment",
                marks: marks, // Add marks as a variable for the review page
                currentDate: new Date().toLocaleString(),
                professorSignatureUrl: userData?.signatureUrl || "" // Pass signature URL for template
            };

            // 3. Add Stamp (+ Page 4 if configured)
            const stampedPdfBytes = await addReviewStampToPDF(existingPdfBytes, {
                professorName: userData?.name || "Professor",
                collegeName: "Madhav Institute of Technology & Science",
                logoUrl: "https://raw.githubusercontent.com/anikettagor2/eco_submit/main/mits-logo.png", 
                date: new Date().toLocaleString(),
                templateSettings: templateConfig, // Pass the global config containing htmlPage4
                subData: coverData // Pass data to fill variables in htmlPage4
            });

            // 4. Upload Stamped PDF
            const fileName = `reviewed_${selectedSubmission.id}_${Date.now()}.pdf`;
            const storageRef = ref(storage, `submissions/reviewed/${fileName}`);
            
            // Upload
            const uploadTask = uploadBytesResumable(storageRef, stampedPdfBytes);
            await uploadTask;
            const downloadURL = await getDownloadURL(storageRef);

            // 5. Update Firestore
            const subRef = doc(db, "submissions", selectedSubmission.id);
            await updateDoc(subRef, {
                marks: Number(marks),
                status: 'reviewed',
                professorSignature: true,
                professorSignatureUrl: userData?.signatureUrl || "", 
                reviewedFilePath: downloadURL, // Point to the new stamped file
                
                // Cleanup AI fields
                summary: deleteField(),
                questions: deleteField(),
                justification: deleteField(),
                creativity_analysis: deleteField(),
                suggested_marks: deleteField(),
                // Keep original files for record
            });

            setSelectedSubmission(null);
            setMarks("");
        } catch (e: any) {
            console.error("Error grading submission:", e);
            alert("Failed to grade submission. " + e.message);
        }
    };

    const handleSelectSubmission = async (sub: Submission) => {
        setSelectedSubmission(sub);
        setMarks(sub.marks ? sub.marks.toString() : "");
        setPreviewPdfUrl(null); // Reset previous URL

        // Manual AI trigger check is in useEffect below
        
        // --- Merge Preview Generation ---
        if (!sub.mergedFilePath && sub.originalFilePath) {
            setIsGeneratingPreview(true);
            try {
                // 1. Fetch Original PDF
                const response = await fetch(sub.originalFilePath);
                const originalBytes = await response.arrayBuffer();

                // 2. Prepare Data
                const subject = subjects.find(s => s.id === sub.subjectId);
                const coverData = {
                    ...templateConfig, // Merge institute details (instituteName, taglines, logoUrl, etc.)
                    name: sub.studentName,
                    rollNo: sub.rollNo || "N/A",
                    department: sub.department || userData?.department || "N/A",
                    sessionYear: sub.sessionYear || "2025-26",
                    subjectName: sub.subjectName,
                    subjectCode: subject?.code,
                    professorName: userData?.name || "Professor",
                    topic: sub.topic,
                    submissionType: sub.submissionType || "Assignment"
                };

                // 3. Generate Merged PDF w/ Templates
                // We pass templateConfig fetched earlier
                const mergedBytes = await addCoverPageToPDF(originalBytes, coverData, templateConfig || {});
                
                // 4. Create Blob URL
                const blob = new Blob([mergedBytes as any], { type: 'application/pdf' });
                const url = URL.createObjectURL(blob);
                setPreviewPdfUrl(url);
            } catch (err) {
                console.error("Failed to generate preview PDF", err);
            } finally {
                setIsGeneratingPreview(false);
            }
        }
    };
    
    // Cleanup Effect for Blob URLs
    useEffect(() => {
        if (!selectedSubmission && previewPdfUrl) {
            URL.revokeObjectURL(previewPdfUrl);
            setPreviewPdfUrl(null);
        }
    }, [selectedSubmission, previewPdfUrl]);

    // Auto-Run AI when submission is selected and no analysis exists
    useEffect(() => {
        if (!selectedSubmission) return;

        // Check if analysis is missing (and not already in progress/error state which we might track via summary text or status)
        // If summary is "Generating Analysis..." or similar, don't re-run.
        // Assuming empty string or null means not run.
        const isNotAnalyzed = !selectedSubmission.summary && !selectedSubmission.questions;
        
        if (isNotAnalyzed) {
             const subject = subjects.find(s => s.id === selectedSubmission.subjectId);
             // Default to true if aiEnabled is undefined
             if (subject?.aiEnabled !== false) {
                 runAIGeneration(selectedSubmission);
             }
        }
    }, [selectedSubmission?.id]);

    const runAIGeneration = async (sub: Submission) => {
        try {
            // Optimistic Update
            setSelectedSubmission(prev => prev ? ({...prev, summary: "Generating Analysis...", status: "processing_ai" as const}) : null);

            // Client-Side Call
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const insights: any = await generateInsights(sub.subjectName, sub.studentName, sub.originalFilePath, sub.topic);
            
            const finalUpdates = {
                summary: insights.summary || [],
                questions: insights.questions || [],
                suggested_marks: insights.suggested_marks || 0,
                justification: insights.justification || "Analysis completed.",
                creativity_analysis: insights.justification || insights.creativity_analysis || "Analysis completed.",
                plagiarism_analysis: insights.plagiarism_analysis || { score: 0, note: "Data unavailable" },
                analyzedAt: serverTimestamp(),
                status: "processing_ai" as const // Keep it in processing state until Prof reviews? Or maybe reviewed? 
                // Let's keep it 'processing_ai' or upgrade to 'processed' if we had that status.
                // Reverting to earlier logic which didn't rely on 'processed' status as strictly.
            };
            
            await updateDoc(doc(db, "submissions", sub.id), finalUpdates);
            
            // Update local state to show new data immediately in the open dialog
            setSelectedSubmission(prev => prev ? ({...prev, ...finalUpdates}) : null);
        } catch (e: any) {
            console.error("Failed to generate AI insights", e);
            const errorMessage = e.message || "AI Generation Failed.";
            const updates = {
                summary: errorMessage,
                questions: ["Unable to generate questions."],
                suggested_marks: 0,
                creativity_analysis: "Analysis failed.",
                status: "error" as const
            };
            setSelectedSubmission(prev => prev ? ({...prev, ...updates}) : null);
            // Optionally update DB with error
        }
    };



    const displaySub = selectedSubmission;

    return (
        <div className="min-h-screen bg-background relative overflow-hidden transition-colors duration-500">
             {/* Background Decoration */}
             <div className="fixed top-0 right-0 -z-10 w-[600px] h-[600px] bg-primary/5 rounded-full blur-[120px] pointer-events-none animate-in-fade" />
             <div className="fixed bottom-0 left-0 -z-10 w-[500px] h-[500px] bg-blue-500/5 rounded-full blur-[100px] pointer-events-none animate-in-fade delay-300" />

            {/* Top Navigation Bar */}
            <div className="glass-effect px-6 py-4 flex justify-between items-center sticky top-0 z-50">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-primary/10 rounded-xl shadow-sm">
                        <BookOpen className="h-6 w-6 text-primary" />
                    </div>
                    <div>
                        <h1 className="text-xl font-bold tracking-tight bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">Professor Dashboard</h1>
                        <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-widest">Academic Session 2025-26</p>
                    </div>
                </div>
                <div className="flex items-center gap-4">
                    <div className="hidden md:flex flex-col items-end mr-2">
                        <span className="text-sm font-semibold">{userData?.name}</span>
                        <span className="text-xs text-muted-foreground">{userData?.department} Department</span>
                    </div>
                    
                    <Button variant="ghost" size="icon" onClick={() => setIsProfileOpen(true)} className="rounded-full hover:bg-primary/10 transition-colors">
                        <User className="h-5 w-5" />
                    </Button>
                    
                    <Dialog open={isCreateOpen} onOpenChange={(open) => {
                            setIsCreateOpen(open);
                            if (!open) {
                                setEditingSubjectId(null);
                                setNewSubject({ name: '', code: '', department: userData?.department || '', semester: '', section: '', requirements: ['Assignment'], aiEnabled: true, vivaDate: '' });
                            }
                    }}>
                        <DialogTrigger asChild>
                            <Button className="rounded-full shadow-lg shadow-primary/20 hover:shadow-primary/30 transition-all active:scale-95">
                                <span className="mr-2 text-lg">+</span> Create Subject
                            </Button>
                        </DialogTrigger>
                        <DialogContent className="overflow-visible sm:max-w-[500px] glass-card border-0 p-6"> 
                            <DialogHeader>
                                <DialogTitle className="text-2xl font-bold">{editingSubjectId ? "Edit Subject" : "Create New Subject"}</DialogTitle>
                                <DialogDescription className="text-base">{editingSubjectId ? "Update subject details." : "Create a subject to categorize student submissions."}</DialogDescription>
                            </DialogHeader>
                            <div className="grid gap-6 py-4">
                                <div className="grid gap-2 relative">
                                    <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Subject Name</Label>
                                    <div className="relative"> 
                                         <Input 
                                            placeholder="e.g. Data Structures" 
                                            value={newSubject.name} 
                                            onChange={(e) => {
                                                setNewSubject({ ...newSubject, name: e.target.value });
                                                // Only show dropdown if typing
                                                if (e.target.value.length > 0) setIsSearchOpen(true);
                                                setSearchTerm(e.target.value);
                                            }}
                                            className="bg-muted/50 border-0 focus-visible:ring-2 focus-visible:ring-primary/20 h-11"
                                        />
                                        {/* Dropdown styling */}
                                        {isSearchOpen && syllabusSubjects.length > 0 && newSubject.name.length > 0 && (
                                            <div className="absolute z-50 w-full mt-2 bg-popover/95 backdrop-blur-xl border rounded-xl shadow-2xl max-h-60 overflow-y-auto custom-scrollbar animate-in-fade">
                                                {syllabusSubjects.map((sub, i) => (
                                                    <div key={i} 
                                                        className="px-4 py-3 hover:bg-primary/5 cursor-pointer text-sm transition-colors border-b last:border-0 border-border/50"
                                                        onClick={() => {
                                                            setNewSubject({ 
                                                                ...newSubject, 
                                                                name: sub.name.trim(), 
                                                                code: sub.code.trim(),
                                                                department: userData?.department || newSubject.department 
                                                            });
                                                            setSearchTerm(''); 
                                                            setIsSearchOpen(false); 
                                                        }}
                                                    >
                                                        <div className="font-semibold text-foreground">{sub.name}</div>
                                                        <div className="text-xs text-muted-foreground flex justify-between mt-1">
                                                            <span>{sub.code}</span>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="grid gap-2">
                                        <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Subject Code</Label>
                                        <Input value={newSubject.code} readOnly className="bg-muted/30 border-dashed" placeholder="Auto-filled" />
                                    </div>
                                     <div className="grid gap-2">
                                        <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Department</Label>
                                        <Input value={newSubject.department || userData?.department || ''} disabled className="bg-muted/30" />
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                     <div className="grid gap-2">
                                        <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Semester</Label>
                                        <Input placeholder="e.g. 5" value={newSubject.semester} onChange={e => setNewSubject({...newSubject, semester: e.target.value})} className="bg-muted/50 border-0 h-10" />
                                    </div>
                                    <div className="grid gap-2">
                                        <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Section</Label>
                                        <Input placeholder="e.g. A" value={newSubject.section} onChange={e => setNewSubject({...newSubject, section: e.target.value})} className="bg-muted/50 border-0 h-10" />
                                    </div>
                                </div>
                                 <div className="grid gap-3">
                                      <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Submission Types</Label>
                                      <div className="flex flex-wrap gap-2 p-4 bg-muted/20 rounded-xl border border-dashed border-border/60">
                                          {["Assignment", "Lab Report", "Project", "Presentation", "Mini Skill Project", "Macro Project"].map(type => (
                                              <Badge 
                                                  key={type}
                                                  variant={newSubject.requirements?.includes(type) ? "default" : "outline"}
                                                  className={`cursor-pointer transition-all px-3 py-1.5 text-xs ${newSubject.requirements?.includes(type) ? 'shadow-md shadow-primary/20 scale-105' : 'hover:bg-muted bg-background'}`}
                                                  onClick={() => {
                                                      const current = newSubject.requirements || [];
                                                      const updated = current.includes(type) 
                                                          ? current.filter(t => t !== type)
                                                          : [...current, type];
                                                      setNewSubject({ ...newSubject, requirements: updated });
                                                  }}
                                              >
                                                  {type}
                                              </Badge>
                                          ))}
                                      </div>
                                 </div>
                                 <div className="flex items-center space-x-3 p-4 bg-blue-50 dark:bg-blue-900/10 rounded-xl border border-blue-100 dark:border-blue-900/20">
                                      <div className="relative flex items-center">
                                        <input 
                                            type="checkbox" 
                                            id="aiEnabled"
                                            checked={newSubject.aiEnabled !== false} 
                                            onChange={(e) => setNewSubject({...newSubject, aiEnabled: e.target.checked})}
                                            className="h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500 transition-all cursor-pointer"
                                        />
                                      </div>
                                      <div className="flex flex-col cursor-pointer" onClick={() => setNewSubject({...newSubject, aiEnabled: !newSubject.aiEnabled})}>
                                          <span className="text-sm font-semibold text-blue-700 dark:text-blue-300">Enable AI Analysis</span>
                                          <span className="text-xs text-blue-600/80 dark:text-blue-400">Automatically generate grading suggestions & insights.</span>
                                      </div>
                                 </div>
                                 
                                 <div className="grid gap-2">
                                    <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Viva / Submission Date</Label>
                                    <div className="flex gap-2">
                                        <Input 
                                            type="date" 
                                            value={newSubject.vivaDate} 
                                            onChange={(e) => setNewSubject({ ...newSubject, vivaDate: e.target.value })} 
                                            className="bg-muted/50 border-0"
                                        />
                                    </div>
                                    <p className="text-[10px] text-muted-foreground">
                                        Setting this date will automatically schedule 10-minute slots for all registered students (10 AM - 6 PM).
                                    </p>
                                 </div>
                            </div>
                            <DialogFooter>
                                <Button onClick={handleCreateSubject} className="w-full sm:w-auto shadow-lg shadow-primary/20">{editingSubjectId ? "Update Subject" : "Create Subject"}</Button>
                            </DialogFooter>
                        </DialogContent>
                    </Dialog>
                    
                    <ThemeToggle />
                    <Button variant="ghost" size="icon" onClick={logout} className="text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors rounded-full">
                        <LogOut className="h-5 w-5" />
                    </Button>
                </div>
            </div>

            <div className="max-w-7xl mx-auto p-6 sm:p-10 space-y-10">
                
                {/* Stats Overview */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 animate-in-slide-up">
                    {[
                        { label: "Active Subjects", value: mySubjects.length, icon: BookOpen, color: "text-blue-500", bg: "bg-blue-500/10", border: "border-blue-200", progress: 0 },
                        { label: "Total Submissions", value: mySubmissions.length, icon: FileText, color: "text-purple-500", bg: "bg-purple-500/10", border: "border-purple-200", progress: 0 },
                        { label: "Pending Review", value: mySubmissions.filter(s => s.status !== 'reviewed').length, icon: Clock, color: "text-orange-500", bg: "bg-orange-500/10", border: "border-orange-200", progress: mySubmissions.length ? (mySubmissions.filter(s => s.status !== 'reviewed').length / mySubmissions.length) * 100 : 0 },
                        { label: "Graded", value: mySubmissions.filter(s => s.status === 'reviewed').length, icon: CheckCircle2, color: "text-emerald-500", bg: "bg-emerald-500/10", border: "border-emerald-200", progress: mySubmissions.length ? (mySubmissions.filter(s => s.status === 'reviewed').length / mySubmissions.length) * 100 : 0 }
                    ].map((stat, i) => (
                        <Card key={i} className={`glass-card border-2 border-white animate-hover-scale relative overflow-hidden group`}>
                             <div className="shimmer" />
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                                    {stat.label}
                                </CardTitle>
                                <div className={`p-2.5 rounded-xl ${stat.bg}`}>
                                    <stat.icon className={`h-5 w-5 ${stat.color}`} />
                                </div>
                            </CardHeader>
                            <CardContent>
                                <div className="text-3xl font-bold tracking-tight">{stat.value}</div>
                                {stat.progress > 0 && (
                                    <div className="mt-2 h-1 w-full bg-muted/50 rounded-full overflow-hidden">
                                         <div className={`h-full ${stat.bg.replace('/10', '')} rounded-full transition-all duration-1000`} style={{ width: `${stat.progress}%` }} />
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    ))}
                </div>

                {/* Main Content Tabs */}
                <Tabs defaultValue="subjects" className="space-y-8">
                    <div className="flex flex-col sm:flex-row items-center justify-between pb-6 border-b border-border/40 gap-4">
                         <TabsList className="bg-muted/30 p-1.5 rounded-full border border-white/20 dark:border-white/5 backdrop-blur-sm self-start">
                            <TabsTrigger value="subjects" className="rounded-full px-6 py-2 data-[state=active]:bg-background data-[state=active]:shadow-md data-[state=active]:text-primary text-muted-foreground transition-all duration-300">My Subjects</TabsTrigger>
                            <TabsTrigger value="submissions" className="rounded-full px-6 py-2 data-[state=active]:bg-background data-[state=active]:shadow-md data-[state=active]:text-primary text-muted-foreground transition-all duration-300">
                                Submissions 
                                {mySubmissions.filter(s => s.status !== 'reviewed').length > 0 && (
                                    <span className="ml-2 bg-orange-500 text-white text-[10px] h-5 w-5 flex items-center justify-center rounded-full shadow-sm animate-pulse">
                                        {mySubmissions.filter(s => s.status !== 'reviewed').length}
                                    </span>
                                )}
                            </TabsTrigger>
                        </TabsList>
                        
                        <div className="flex items-center gap-3 w-full sm:w-auto">
                             <div className="relative w-full sm:w-auto group">
                                <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
                                <Input 
                                    placeholder="Search..." 
                                    className="pl-10 w-full sm:w-[280px] bg-white/50 dark:bg-black/20 border-0 focus-visible:ring-2 focus-visible:ring-primary/30 rounded-full shadow-sm"
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                />
                             </div>
                        </div>
                    </div>

                    <TabsContent value="subjects" className="animate-in-slide-up delay-100 outline-none">
                        {mySubjects.length === 0 ? (
                            <div className="text-center py-24 flex flex-col items-center justify-center space-y-6 opacity-60">
                                <div className="p-8 bg-muted/30 rounded-full ring-1 ring-border/50">
                                    <BookOpen className="h-14 w-14 text-muted-foreground/50" />
                                </div>
                                <div>
                                    <h3 className="text-xl font-semibold mb-2">No Subjects Created</h3>
                                    <p className="text-muted-foreground max-w-sm mx-auto">Get started by creating your first subject to categorize submissions.</p>
                                </div>
                                <Button variant="outline" onClick={() => setIsCreateOpen(true)} className="rounded-full px-8">Create Subject</Button>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                {groupedSubjects.filter(group => group[0].name.toLowerCase().includes(searchTerm.toLowerCase())).map((group, index) => {
                                    const sub = group[0]; // Representative
                                    return (
                                    <Card 
                                        key={sub.code} 
                                        className="glass-card border-0 animate-hover-scale group cursor-pointer relative overflow-hidden"
                                        style={{ animationDelay: `${index * 50}ms` }} 
                                        onClick={() => {
                                            if (group.length === 1) {
                                                // If only 1, go direct? Or still show choice? User said "allow him to choose divisions".
                                                // If only 1, selecting that 1 is the only choice.
                                                // But let's verify if user wants to VIEW submissions or EDIT.
                                                // Let's open the Division Selection Dialog always for consistency
                                                setSelectedGroup(group);
                                                setIsDivisionSelectOpen(true);
                                            } else {
                                                setSelectedGroup(group);
                                                setIsDivisionSelectOpen(true);
                                            }
                                        }}
                                    >
                                        <div className="absolute top-0 left-0 w-1.5 h-full bg-gradient-to-b from-primary to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                                        
                                        <CardHeader className="pb-3 relative z-10">
                                            <div className="flex justify-between items-start">
                                                <div>
                                                    <CardTitle className="text-lg font-bold tracking-tight text-foreground/90 group-hover:text-primary transition-colors">{sub.name}</CardTitle>
                                                    <CardDescription className="font-mono text-xs opacity-70 mt-1 bg-muted/50 px-2 py-0.5 rounded w-fit">{sub.code}</CardDescription>
                                                </div>
                                                <Badge variant="outline" className="bg-primary/5">{group.length} Divs</Badge>
                                            </div>
                                        </CardHeader>
                                        <CardContent className="py-4 relative z-10">
                                            <div className="flex items-center gap-4 mb-4">
                                                <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/30 px-3 py-1.5 rounded-lg border border-border/30">
                                                    <User className="h-3.5 w-3.5" />
                                                    <span className="font-medium">Divs: {group.map(g => g.section).sort().join(', ')}</span>
                                                </div>
                                            </div>
                                            <div className="flex flex-wrap gap-1.5">
                                                 {/* @ts-ignore */}
                                                {(sub.requirements || (sub.submissionType ? [sub.submissionType] : [])).slice(0, 3).map((req: string) => (
                                                    <Badge key={req} variant="secondary" className="text-[9px] font-medium bg-secondary/40 border-0">
                                                        {req}
                                                    </Badge>
                                                ))}
                                            </div>
                                        </CardContent>
                                    </Card>
                                )})}
                            </div>
                        )}
                    </TabsContent>

                    {/* Dialog for Division Selection */}
                    <Dialog open={isDivisionSelectOpen} onOpenChange={(open) => !open && setIsDivisionSelectOpen(false)}>
                        <DialogContent>
                            <DialogHeader>
                                <DialogTitle>{selectedGroup?.[0]?.name}</DialogTitle>
                                <DialogDescription>Select a Division to View or Edit</DialogDescription>
                            </DialogHeader>
                            <div className="grid gap-4 py-4">
                                {selectedGroup?.map(sub => (
                                    <div key={sub.id} className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors">
                                        <div className="flex items-center gap-4">
                                            <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center font-bold text-primary">
                                                {sub.section}
                                            </div>
                                            <div>
                                                <p className="font-medium">Division {sub.section}</p>
                                                <p className="text-xs text-muted-foreground">{sub.department} • Sem {sub.semester}</p>
                                            </div>
                                        </div>
                                        <div className="flex gap-2">
                                            <Button size="sm" variant="outline" onClick={() => {
                                                handleEditClick(sub);
                                                setIsDivisionSelectOpen(false);
                                            }}>
                                                <Pencil className="h-4 w-4 mr-2" /> Edit
                                            </Button>
                                            <Button size="sm" onClick={() => {
                                                setFilterSubjectId(sub.id);
                                                // Trigger Tab Switch
                                                const tabs = document.querySelector('[role="tablist"]');
                                                if (tabs) {
                                                    const subTab = tabs.querySelector('[data-value="submissions"]') as HTMLElement;
                                                    if (subTab) subTab.click();
                                                }
                                                setIsDivisionSelectOpen(false);
                                            }}>
                                                View Submissions
                                            </Button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </DialogContent>
                    </Dialog>

                    <TabsContent value="submissions" className="animate-in-slide-up delay-100 outline-none">
                        <Card className="glass-card border-0 overflow-hidden shadow-2xl">
                              <div className="p-0">
                                {/* Table Header */}
                                <div className="grid grid-cols-5 p-5 text-xs font-bold uppercase tracking-wider text-muted-foreground/60 border-b border-border/40 bg-muted/20 backdrop-blur-sm sticky top-0 z-20">
                                    <div className="col-span-1 pl-2">Student Name</div>
                                    <div className="col-span-1">Subjects</div>
                                    <div className="col-span-1">Last Activity</div>
                                    <div className="col-span-1">Overall Status</div>
                                    <div className="col-span-1 text-right pr-2">Action</div>
                                </div>
                                
                                <div className="max-h-[600px] overflow-y-auto custom-scrollbar bg-white/30 dark:bg-black/20">
                                    {mySubmissions.length === 0 ? (
                                        <div className="py-20 text-center text-muted-foreground flex flex-col items-center justify-center opacity-70">
                                            <FileText className="h-12 w-12 mb-4 opacity-20" />
                                            <span className="text-lg font-medium">No submissions yet</span>
                                        </div>
                                    ) : (
                                          (() => {
                                // Group Submissions by STUDENT
                                const groups: Record<string, {
                                    studentId: string; studentName: string; submissions: Submission[]; lastUpdate: any; subjectIds: Set<string>;
                                }> = {};
                                
                                mySubmissions.filter(sub => 
                                    sub.studentName.toLowerCase().includes(searchTerm.toLowerCase()) || 
                                    (filterSubjectId !== 'all' && sub.subjectId === filterSubjectId)
                                ).forEach(sub => {
                                    const key = sub.studentId;
                                    if (!groups[key]) {
                                        groups[key] = {
                                            studentId: sub.studentId,
                                            studentName: sub.studentName,
                                            submissions: [],
                                            lastUpdate: sub.createdAt,
                                            subjectIds: new Set()
                                        };
                                    }
                                    groups[key].submissions.push(sub);
                                    groups[key].subjectIds.add(sub.subjectId);
                                    if (sub.createdAt?.seconds > groups[key].lastUpdate?.seconds) groups[key].lastUpdate = sub.createdAt;
                                });
                                
                                const sortedGroups = Object.values(groups).sort((a,b) => b.lastUpdate.seconds - a.lastUpdate.seconds);

                                return sortedGroups.map((group, idx) => {
                                    const subIds = Array.from(group.subjectIds);
                                    const subjectNames = subIds.map(sid => mySubjects.find(s => s.id === sid)?.name || "Unknown").join(", ");
                                    
                                    const totalPending = group.submissions.filter(s => s.status !== 'reviewed').length;
                                    
                                    let badgeVariant: "default" | "secondary" | "outline" = "outline";
                                    let statusText = "All Graded";
                                    let customClass = "bg-emerald-100/60 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400 border-emerald-200/50";
                                    let rowClass = "hover:bg-primary/5";

                                    if (totalPending > 0) {
                                        statusText = `${totalPending} Pending`;
                                        badgeVariant = "secondary";
                                        customClass = "bg-orange-100/60 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400 border-orange-200/50 animate-pulse-subtle";
                                        rowClass = "bg-orange-50/20 hover:bg-orange-50/50 dark:bg-orange-900/5 dark:hover:bg-orange-900/10";
                                    }

                                    return (
                                        <div key={group.studentId} 
                                            className={`p-4 grid grid-cols-5 items-center border-b border-border/30 last:border-0 transition-all duration-300 ${rowClass} group`}
                                            style={{ animationDelay: `${idx * 30}ms` }}
                                        >
                                            <div className="col-span-1 pl-2 flex items-center gap-3">
                                                <div className="h-9 w-9 rounded-full bg-gradient-to-br from-primary to-primary/60 text-primary-foreground shadow-md flex items-center justify-center text-xs font-bold">
                                                    {group.studentName.charAt(0)}
                                                </div>
                                                <span className="font-semibold text-sm text-foreground/90">{group.studentName}</span>
                                            </div>
                                            <span className="col-span-1 text-xs text-muted-foreground truncate font-medium max-w-[90%]" title={subjectNames}>{subjectNames}</span>
                                            <span className="col-span-1 text-xs text-muted-foreground font-mono">{new Date(group.lastUpdate?.seconds * 1000).toLocaleDateString()}</span>
                                            <span className="col-span-1">
                                                <Badge variant={badgeVariant} className={`text-[10px] uppercase font-bold tracking-wider border shadow-sm ${customClass}`}>
                                                    {statusText}
                                                </Badge>
                                            </span>
                                            <span className="col-span-1 text-right pr-2">
                                                <Button size="sm" onClick={() => setViewGroup({
                                                    ...group,
                                                    subjectIds: subIds
                                                })} className="h-8 px-4 text-xs font-semibold rounded-full shadow-sm hover:shadow-md hover:scale-105 transition-all bg-white dark:bg-zinc-800 border text-foreground hover:bg-primary hover:text-primary-foreground">
                                                    View Work
                                                </Button>
                                            </span>
                                        </div>
                                    );
                                });
                            })()
                                    )}
                                </div>
                              </div>
                        </Card>
                    </TabsContent>
                </Tabs>
            </div>

            {/* Group Details Dialog */}
        <Dialog open={!!viewGroup} onOpenChange={(open) => !open && setViewGroup(null)}>
            <DialogContent className="max-w-3xl">
                <DialogHeader>
                    <DialogTitle>{viewGroup?.studentName}</DialogTitle>
                    <DialogDescription>
                        Submissions for 
                        {viewGroup?.subjectIds.length === 1 
                            ? ` ${mySubjects.find(s => s.id === viewGroup.subjectIds[0])?.name}` 
                            : " Multiple Subjects"}
                    </DialogDescription>
                </DialogHeader>
                
                <div className="py-4 space-y-4">
                    {/* Subject Selector Tabs */}
                    {viewGroup && viewGroup.subjectIds.length > 1 && (
                        <div className="flex gap-2 overflow-x-auto pb-2">
                            {viewGroup.subjectIds.map(sid => {
                                const subName = mySubjects.find(s => s.id === sid)?.name || "Unknown";
                                return (
                                    <Button 
                                        key={sid} 
                                        variant={activeSubjectTab === sid ? "default" : "outline"} 
                                        size="sm"
                                        onClick={() => setActiveSubjectTab(sid)}
                                        className="whitespace-nowrap"
                                    >
                                        {subName}
                                    </Button>
                                );
                            })}
                        </div>
                    )}

                    {viewGroup && activeSubjectTab && (() => {
                        const subject = subjects.find(s => s.id === activeSubjectTab);
                        if(!subject) return <div className="text-center text-muted-foreground">Subject not found.</div>;

                        // @ts-ignore
                        const reqs: string[] = subject?.requirements || (subject?.submissionType ? [subject.submissionType] : ['Assignment']);
                        
                        // Use live submissions data filtered by active tab
                        const liveGroupSubmissions = submissions.filter(s => s.studentId === viewGroup.studentId && s.subjectId === activeSubjectTab);

                        return (
                            <div className="border rounded-md divide-y">
                                <div className="p-3 bg-muted/50 font-medium text-sm flex justify-between items-center">
                                    <span>Requirements for {subject.name}</span>
                                    <Badge variant="outline">{subject.code}</Badge>
                                </div>
                                {reqs.map((req, idx) => {
                                    const sub = liveGroupSubmissions.find(s => s.submissionType === req);
                                    return (
                                        <div key={idx} className="flex items-center justify-between p-4 hover:bg-muted/30">
                                            <div className="flex items-center gap-3">
                                                <div className={`h-8 w-8 rounded-full flex items-center justify-center ${sub ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-400'}`}>
                                                    <span className="text-xs font-bold">{idx + 1}</span>
                                                </div>
                                                <div>
                                                    <p className="font-medium text-sm">{req}</p>
                                                    {sub?.topic && <p className="text-xs text-blue-600 truncate max-w-[200px] font-medium" title={sub.topic}>Topic: {sub.topic}</p>}
                                                    <p className="text-xs text-muted-foreground">{sub ? "Submitted" : "Pending"}</p>
                                                </div>
                                            </div>
                                            <div>
                                                {sub ? (
                                                    <div className="flex items-center gap-2">
                                                        <Badge variant={sub.status === 'reviewed' ? 'default' : 'secondary'}>{sub.status}</Badge>
                                                        {sub.marks && <span className="text-sm font-bold ml-2">{sub.marks}/100</span>}
                                                        <Button size="sm" variant="outline" onClick={() => handleSelectSubmission(sub)}>
                                                            Review
                                                        </Button>
                                                    </div>
                                                ) : (
                                                    <Badge variant="outline" className="text-muted-foreground border-dashed">Not Submitted</Badge>
                                                )}
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                        );
                    })()}
                </div>
            </DialogContent>
        </Dialog>

        {/* Global Review Dialog */}
        <Dialog open={!!selectedSubmission} onOpenChange={(open) => !open && setSelectedSubmission(null)}>
            <DialogContent className="max-w-[95vw] w-full h-[95vh] flex flex-col p-0 gap-0">
                {displaySub && (
                    <>
                    <DialogHeader className="p-6 border-b">
                        <div className="flex items-center justify-between">
                            <div>
                                <DialogTitle className="text-xl flex items-center gap-3">
                                    <span>Review: {displaySub.subjectName}</span>
                                    {displaySub.submissionType && (
                                        <Badge variant="outline" className="text-xs font-normal">
                                            {displaySub.submissionType}
                                        </Badge>
                                    )}
                                </DialogTitle>
                                <DialogDescription className="mt-1">
                                    Student: <span className="font-medium text-foreground">
                                        {displaySub.submissionType === 'Assignment' && displaySub.rollNo 
                                            ? `Anonymized (Roll: ${displaySub.rollNo})` 
                                            : displaySub.studentName
                                        }
                                    </span>
                                    {displaySub.topic && <span className="ml-4 inline-block text-xs text-blue-600 font-semibold bg-blue-50 dark:bg-blue-900/30 px-2 py-0.5 rounded border border-blue-100 dark:border-blue-800">Topic: {displaySub.topic}</span>}
                                </DialogDescription>
                            </div>
                            <div className="flex items-center gap-4">
                                {(() => {
                                    // Check Slot Constraints
                                    const sub = subjects.find(s => s.id === displaySub.subjectId);
                                    const slot = sub?.schedule?.[displaySub.studentId];
                                    let isLocked = false;
                                    let slotMessage = "";
                                    
                                    if (slot) {
                                        const now = new Date();
                                        const start = new Date(slot.startTime);
                                        const end = new Date(slot.endTime);
                                        if (now < start || now > end) {
                                            isLocked = true;
                                            slotMessage = `Slot: ${start.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})} - ${end.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}`;
                                        }
                                    }

                                    return (
                                        <>
                                            {isLocked && (
                                                 <div className="flex items-center gap-2 px-3 py-1.5 bg-red-100 text-red-700 border border-red-200 rounded-md text-xs font-bold animate-pulse">
                                                    <Clock className="h-3.5 w-3.5" />
                                                    <span>Grading Locked ({slotMessage})</span>
                                                 </div>
                                            )}
                                            <div className="flex items-center gap-2">
                                                <Label htmlFor="marks" className="sr-only">Marks</Label>
                                                <Input 
                                                    id="marks"
                                                    type="number" 
                                                    min="0" 
                                                    max="100" 
                                                    value={marks} 
                                                    onChange={e => setMarks(e.target.value)} 
                                                    placeholder="Marks (0-100)" 
                                                    className="w-32 h-9"
                                                    disabled={isLocked || displaySub.status === 'reviewed'} 
                                                />
                                                <Button onClick={handleGrade} disabled={!marks || displaySub.status === 'reviewed' || isLocked} size="sm">
                                                    {displaySub.status === 'reviewed' ? 'Graded' : 'Submit Grade'}
                                                </Button>
                                            </div>
                                        </>
                                    );
                                })()}
                            </div>
                        </div>
                    </DialogHeader>
                    
                    <div className="flex-1 overflow-hidden grid grid-cols-12 h-full">
                        {/* Left Panel: PDF Preview (Narrower) */}
                        <div className="col-span-12 lg:col-span-5 bg-muted/30 border-r h-full relative">
                            {(() => {
                                // Prefer dynamically generated preview, then stored merged file, then original
                                const fileUrl = previewPdfUrl || displaySub.mergedFilePath || displaySub.originalFilePath;
                                const isPdf = fileUrl?.toLowerCase().includes('.pdf') || previewPdfUrl; // Blob urls for pdf count as pdf

                                if (isGeneratingPreview) {
                                    return (
                                        <div className="flex flex-col items-center justify-center h-full gap-3 bg-background/50 backdrop-blur-sm">
                                            <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
                                            <p className="text-sm font-medium text-muted-foreground animate-pulse">Generating Merged Preview...</p>
                                            <p className="text-xs text-muted-foreground opacity-70">Adding cover page templates...</p>
                                        </div>
                                    );
                                }

                                return fileUrl ? (
                                    <div className="h-full bg-gray-100 dark:bg-gray-800">
                                        {isPdf ? (
                                            <iframe 
                                                src={fileUrl}
                                                className="w-full h-full border-none"
                                                title="PDF Preview"
                                            />
                                        ) : (
                                            <iframe 
                                                src={`https://docs.google.com/viewer?url=${encodeURIComponent(fileUrl)}&embedded=true`}
                                                className="w-full h-full border-none"
                                                title="File Preview"
                                            />
                                        )}
                                    </div>
                                ) : (
                                    <div className="flex items-center justify-center h-full text-muted-foreground">
                                        No file attached
                                    </div>
                                );
                            })()}
                        </div>

                        {/* Right Panel: AI Insights & Details (Wider) */}
                        <div className="col-span-12 lg:col-span-7 h-full overflow-y-auto bg-background p-6 space-y-6">
                            <div className="space-y-3">
                                <div className="flex items-center justify-between">
                                    <h3 className="font-semibold flex items-center gap-2">
                                        AI Analysis
                                    </h3>
                                </div>
                                <div className="bg-muted/50 rounded-lg p-4 space-y-4">
                                    {!displaySub.summary && !displaySub.questions ? (
                                        subjects.find(s => s.id === displaySub.subjectId)?.aiEnabled === false ? (
                                            <div className="text-center text-sm text-muted-foreground py-12 border-2 border-dashed rounded-lg bg-muted/10 opacity-70">
                                                <span className="text-2xl block mb-2">🚫</span>
                                                AI Analysis Disabled
                                            </div>
                                        ) : (
                                            <div className="text-center py-8 flex flex-col items-center justify-center animate-pulse">
                                                 <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin mb-3"></div>
                                                 <p className="text-sm text-primary font-medium">Generating Analysis...</p>
                                                 <p className="text-xs text-muted-foreground">This may take a few seconds.</p>
                                            </div>
                                        )
                                    ) : (
                                    <>
                                    <div className="flex items-center justify-between border-b border-border/50 pb-2">
                                        <div className="flex flex-col">
                                            <span className="text-sm font-medium">Suggested Grade</span>
                                            <span className="text-[10px] text-muted-foreground uppercase tracking-widest">Powered by Gemini 2.0 (PDF & DOCX)</span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <Badge variant="outline" className="bg-background text-sm font-bold text-green-600 border-green-200">
                                                {displaySub.suggested_marks ? `${displaySub.suggested_marks}/100` : "Pending..."}
                                            </Badge>
                                            {displaySub.suggested_marks !== undefined && (
                                                <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setMarks(displaySub.suggested_marks!.toString())} title="Accept AI Grade">
                                                    <span className="text-green-600">✓</span>
                                                </Button>
                                            )}
                                        </div>
                                    </div>
                                    <div>
                                        <h4 className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-2">Summary</h4>
                                        <div className="text-sm leading-relaxed text-foreground">
                                            {Array.isArray(displaySub.summary) ? (
                                                <ul className="list-disc pl-4 space-y-1">
                                                    {displaySub.summary.map((point: string, i: number) => <li key={i}>{point}</li>)}
                                                </ul>
                                            ) : (
                                                displaySub.summary || "Generating..."
                                            )}
                                        </div>
                                    </div>
                                    <div className="h-px bg-border/50" />
                                    <div>
                                        <h4 className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-2">Justification</h4>
                                            <p className="text-sm leading-relaxed text-foreground italic">
                                            {displaySub.justification || displaySub.creativity_analysis || "Analyzing..."}
                                            </p>
                                        </div>
                                    <div className="h-px bg-border/50" />
                                    <div>
                                        <h4 className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-2 flex justify-between">
                                            Plagiarism Estimate (AI)
                                            {displaySub.plagiarism_analysis && (
                                                <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${displaySub.plagiarism_analysis.score > 30 ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                                                    {displaySub.plagiarism_analysis.score}% Similarity
                                                </span>
                                            )}
                                        </h4>
                                        <p className="text-sm leading-relaxed text-foreground">
                                            {displaySub.plagiarism_analysis?.note || "Analysis pending..."}
                                        </p>
                                    </div>
                                    <div className="h-px bg-border/50" />
                                        <div>
                                            <h4 className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-2">Viva Questions</h4>
                                            <ul className="text-sm space-y-2 list-none m-0 p-0">
                                                {displaySub.questions ? displaySub.questions.map((q, i) => (
                                                    <li key={i} className="flex gap-2 items-start">
                                                        <span className="text-primary font-bold text-xs mt-1">{i+1}.</span>
                                                        <span className="text-muted-foreground">{q}</span>
                                                    </li>
                                                )) : (
                                                    <li className="text-muted-foreground italic">Generating...</li>
                                                )}
                                            </ul>
                                        </div>
                                        </>
                                    )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </>
                )}
            </DialogContent>
        </Dialog>
        <ProfileDialog open={isProfileOpen} onOpenChange={setIsProfileOpen} />
      </div>
    );
};

export default ProfessorDashboard;
