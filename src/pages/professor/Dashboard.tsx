import { useState, useEffect, useMemo } from "react";
import { generateInsights } from "../../lib/ai";
import { useAuth } from "@/contexts/AuthContext";
import { db } from "@/lib/firebase";
import { collection, query, getDocs, addDoc, serverTimestamp, onSnapshot, doc, updateDoc, deleteField } from "firebase/firestore";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import type { Subject, Submission } from "../../types";
import { Skeleton } from "@/components/ui/skeleton";
import { COLLEGE_DATA } from "../../lib/data";

import { ThemeToggle } from "@/components/ThemeToggle";
import { ProfileDialog } from "@/components/ProfileDialog";
import { User } from "lucide-react";

const ProfessorDashboard = () => {
    const { currentUser, userData, logout } = useAuth();
    const [subjects, setSubjects] = useState<Subject[]>([]);
    const [submissions, setSubmissions] = useState<Submission[]>([]);
    const [loading, setLoading] = useState(true);
    
    // Create Subject State
    const [newSubject, setNewSubject] = useState({ name: '', code: '', department: '', semester: '', section: '' });
    const [isCreateOpen, setIsCreateOpen] = useState(false);

    // Subject Search State
    const [searchTerm, setSearchTerm] = useState("");
    const [showDropdown, setShowDropdown] = useState(false);

    // Grading State
    const [selectedSubmission, setSelectedSubmission] = useState<Submission | null>(null);
    const [marks, setMarks] = useState<string>("");
    
    // Profile State
    const [isProfileOpen, setIsProfileOpen] = useState(false);

    useEffect(() => {
        if (!currentUser || !userData) return;

        // 1. Fetch Subjects
        const qSubjects = query(collection(db, "subjects"));
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
            setLoading(false);
        });

        return () => {
            unsubSubjects();
            unsubscribeSubmissions();
        };
    }, [currentUser, userData]);

    const handleCreateSubject = async () => {
        if (!currentUser) return;
        try {
            await addDoc(collection(db, "subjects"), {
                ...newSubject,
                // Enforce Professor's Department
                department: userData?.department || newSubject.department,
                professorId: currentUser.uid,
                createdAt: serverTimestamp()
            });
            setIsCreateOpen(false);
            setNewSubject({ name: '', code: '', department: userData?.department || '', semester: '', section: '' });
            setSearchTerm("");
        } catch (e) {
            console.error(e);
        }
    };
    
    // Auto-fill department when opening
    useEffect(() => {
        if (isCreateOpen && userData?.department) {
            setNewSubject(prev => ({ ...prev, department: userData.department || '' }));
            setSearchTerm("");
            setShowDropdown(false);
        }
    }, [isCreateOpen, userData]);

    // Template Logic
    const deptTemplate = useMemo(() => COLLEGE_DATA.departments.find(d => d.name === userData?.department), [userData?.department]);
    const availableTemplates = useMemo(() => {
       if (!deptTemplate || !searchTerm) return [];
       return deptTemplate.subjects.filter(s => s.name.toLowerCase().includes(searchTerm.toLowerCase()));
    }, [deptTemplate, searchTerm]);

    const handleSelectTemplate = (s: {name: string, code: string}) => {
        setNewSubject(prev => ({ ...prev, name: s.name, code: s.code }));
        setSearchTerm(s.name);
        setShowDropdown(false);
    };

    const handleGrade = async () => {
        if (!selectedSubmission) return;
        try {
            const subRef = doc(db, "submissions", selectedSubmission.id);
            await updateDoc(subRef, {
                marks: Number(marks),
                status: 'reviewed',
                professorSignature: true,
                // Cleanup AI fields after grading
                summary: deleteField(),
                questions: deleteField(),
                justification: deleteField(),
                creativity_analysis: deleteField(),
                suggested_marks: deleteField()
            });
            // Automatically close the dialog after grading
            setSelectedSubmission(null);
            setMarks("");
        } catch (e) {
            console.error(e);
        }
    };

    const handleSelectSubmission = async (sub: Submission) => {
        setSelectedSubmission(sub);
        setMarks(sub.marks ? sub.marks.toString() : "");

        // Trigger AI if missing OR if it contains old "Offline" data
        if (!sub.summary || !sub.questions || sub.questions.length === 0 || sub.summary.includes("[AI Offline")) {
            await runAIGeneration(sub);
        }
    };

    const runAIGeneration = async (sub: Submission) => {
        try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const insights: any = await generateInsights(sub.subjectName, sub.studentName, sub.originalFilePath);
            
            const finalUpdates = {
                summary: insights.summary || [],
                questions: insights.questions || [],
                suggested_marks: insights.suggested_marks || 0,
                justification: insights.justification || "Analysis completed.",
                creativity_analysis: insights.justification || insights.creativity_analysis || "Analysis completed.",
                analyzedAt: serverTimestamp()
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
                creativity_analysis: "Analysis failed."
            };
            setSelectedSubmission(prev => prev ? ({...prev, ...updates}) : null);
        }
    };

    const [filterSubjectId, setFilterSubjectId] = useState<string>("all");

    // Filter Subjects by Department
    const mySubjects = useMemo(() => {
        if (!userData?.department) return subjects;
        return subjects.filter(s => s.department === userData.department);
    }, [subjects, userData?.department]);

    // Filter Submissions by Department AND Selected Subject
    const mySubmissions = useMemo(() => {
        let subs = submissions;
        
        // 1. Filter by Department (If Prof has one)
        if (userData?.department) {
            subs = subs.filter(s => s.department === userData.department);
        }

        // 2. Filter by Selected Subject (Class/Section)
        if (filterSubjectId && filterSubjectId !== "all") {
            subs = subs.filter(s => s.subjectId === filterSubjectId);
        }

        return subs;
    }, [submissions, userData?.department, filterSubjectId]);

    const displaySub = selectedSubmission;

    return (
      <div className="min-h-screen bg-background p-8">
        <div className="flex justify-between items-center mb-8">
            <div>
                <h1 className="text-3xl font-bold tracking-tight">Professor Dashboard</h1>
                <p className="text-muted-foreground">Welcome, Professor {userData?.name}</p>
                {userData?.department && <Badge variant="outline" className="mt-2">{userData.department}</Badge>}
            </div>
          <div className="flex items-center gap-2">
              <ThemeToggle />
              <Button variant="ghost" size="icon" onClick={() => setIsProfileOpen(true)} title="Profile">
                  <User className="h-[1.2rem] w-[1.2rem]" />
              </Button>
              <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
                  <DialogTrigger asChild><Button>Create Subject</Button></DialogTrigger>
                  <DialogContent className="overflow-visible"> 
                      <DialogHeader>
                          <DialogTitle>Create New Subject</DialogTitle>
                          <DialogDescription>Create a subject to categorize student submissions.</DialogDescription>
                      </DialogHeader>
                      <div className="grid gap-4 py-4">
                          <div className="grid gap-2 relative">
                              <Label>Subject (Select from Syllabus)</Label>
                              <select 
                                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                                  value={newSubject.code}
                                  onChange={(e) => {
                                      const code = e.target.value;
                                      const sub = deptTemplate?.subjects.find(s => s.code === code);
                                      // If manually clearing or not found, keep leftovers or clear? Clear is safer.
                                      setNewSubject(prev => ({
                                          ...prev,
                                          code: code,
                                          name: sub ? sub.name : ""
                                      }));
                                  }}
                              >
                                  <option value="">Select a Subject from Syllabus</option>
                                  {deptTemplate ? (
                                      deptTemplate.subjects.map(s => (
                                          <option key={s.code} value={s.code}>{s.name}</option>
                                      ))
                                  ) : (
                                      <option value="" disabled>No syllabus found for {userData?.department}</option>
                                  )}
                              </select>
                                {!deptTemplate && (
                                    <p className="text-[10px] text-destructive">
                                        Your department "{userData?.department}" does not match any syllabus records.
                                    </p>
                                )}
                          </div>
                           <div className="grid gap-2">
                              <Label>Subject Code</Label>
                              <Input value={newSubject.code} disabled placeholder="Auto-filled" />
                          </div>
                          <div className="grid gap-2">
                              <Label>Department</Label>
                              <select 
                                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm opacity-50 cursor-not-allowed"
                                disabled
                                value={newSubject.department}
                              >
                                <option value={userData?.department}>{userData?.department}</option>
                              </select>
                          </div>
                           <div className="grid grid-cols-2 gap-4">
                                <div className="grid gap-2">
                                    <Label>Semester</Label>
                                    <Input value={newSubject.semester} onChange={e => setNewSubject({...newSubject, semester: e.target.value})} placeholder="e.g. 4" />
                                </div>
                                <div className="grid gap-2">
                                    <Label>Section</Label>
                                    <Input value={newSubject.section} onChange={e => setNewSubject({...newSubject, section: e.target.value})} placeholder="e.g. A" />
                                </div>
                           </div>
                      </div>
                      <DialogFooter>
                          <Button onClick={handleCreateSubject}>Create Subject</Button>
                      </DialogFooter>
                  </DialogContent>
              </Dialog>
              <Button variant="outline" onClick={() => logout()}>Logout</Button>
          </div>
        </div>
        
        <Tabs defaultValue="submissions" className="space-y-4">
            <TabsList>
                <TabsTrigger value="submissions">Submissions</TabsTrigger>
                <TabsTrigger value="subjects">My Subjects</TabsTrigger>
            </TabsList>
            
            <TabsContent value="submissions">
                <div className="space-y-4">
                    {/* Filter Bar */}
                    <div className="flex items-center gap-4">
                        <div className="w-[250px]">
                            <select 
                                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                                value={filterSubjectId}
                                onChange={(e) => setFilterSubjectId(e.target.value)}
                            >
                                <option value="all">All Subjects</option>
                                {mySubjects.map(sub => (
                                    <option key={sub.id} value={sub.id}>
                                        {sub.name} ({sub.semester}-{sub.section})
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div className="text-sm text-muted-foreground">
                            Showing {mySubmissions.length} submissions
                        </div>
                    </div>

                    <div className="rounded-md border">
                        <div className="p-4 grid grid-cols-5 font-semibold border-b bg-muted">
                            <span>Student</span>
                            <span>Subject</span>
                            <span>Date</span>
                            <span>Status</span>
                            <span>Action</span>
                        </div>
                    {mySubmissions.length === 0 ? (
                         <div className="p-8 text-center text-muted-foreground">No submissions found for your department.</div>
                    ) : (
                        mySubmissions.map(sub => (
                             <div key={sub.id} className="p-4 grid grid-cols-5 items-center border-b last:border-0 hover:bg-muted/50 transition-colors">
                                <span>{sub.studentName}</span>
                                <span>{sub.subjectName}</span>
                                <span>{new Date(sub.createdAt?.seconds * 1000).toLocaleDateString()}</span>
                                <span>
                                    <Badge variant={sub.status === 'reviewed' ? 'default' : 'secondary'}>{sub.status}</Badge>
                                </span>
                                <span>
                                    <Button variant="outline" size="sm" onClick={() => handleSelectSubmission(sub)}>Review</Button>
                                </span>
                            </div>
                        ))
                    )}
                    </div>
                </div>
            </TabsContent>

            <TabsContent value="subjects">
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {mySubjects.map(sub => (
                         <Card key={sub.id}>
                            <CardHeader>
                                <CardTitle>{sub.name}</CardTitle>
                                <CardDescription>{sub.code} • {sub.department}</CardDescription>
                            </CardHeader>
                            <CardContent>
                                <div className="text-sm">
                                    <p>Semester: {sub.semester}</p>
                                    <p>Section: {sub.section}</p>
                                </div>
                            </CardContent>
                         </Card>
                    ))}
                </div>
            </TabsContent>
        </Tabs>

        {/* Global Review Dialog */}
        <Dialog open={!!selectedSubmission} onOpenChange={(open) => !open && setSelectedSubmission(null)}>
            <DialogContent className="max-w-[95vw] w-full h-[95vh] flex flex-col p-0 gap-0">
                {displaySub && (
                    <>
                    <DialogHeader className="p-6 border-b">
                        <div className="flex items-center justify-between">
                            <div>
                                <DialogTitle className="text-xl">Review Submission: {displaySub.subjectName}</DialogTitle>
                                <DialogDescription className="mt-1">Student: <span className="font-medium text-foreground">{displaySub.studentName}</span></DialogDescription>
                            </div>
                            <div className="flex items-center gap-4">
                                <div className="flex items-center gap-2">
                                    <Input 
                                        type="number" 
                                        max={100} 
                                        value={marks} 
                                        onChange={e => setMarks(e.target.value)} 
                                        placeholder="Marks (0-100)" 
                                        className="w-32 h-9"
                                    />
                                    <Button onClick={handleGrade} disabled={!marks || displaySub.status === 'reviewed'} size="sm">
                                        {displaySub.status === 'reviewed' ? 'Graded' : 'Submit Grade'}
                                    </Button>
                                </div>
                            </div>
                        </div>
                    </DialogHeader>
                    
                    <div className="flex-1 overflow-hidden grid grid-cols-12 h-full">
                        {/* Left Panel: PDF Preview (Narrower) */}
                        <div className="col-span-12 lg:col-span-5 bg-muted/30 border-r h-full relative">
                            {displaySub.originalFilePath ? (
                                <iframe 
                                    src={displaySub.originalFilePath} 
                                    className="w-full h-full"
                                    title="PDF Preview"
                                />
                            ) : (
                                <div className="flex items-center justify-center h-full text-muted-foreground">
                                    No PDF attached
                                </div>
                            )}
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
                                        <div className="text-center text-sm text-muted-foreground py-8">
                                            Generating analysis...
                                        </div>
                                    ) : (
                                    <>
                                    <div className="flex items-center justify-between border-b border-border/50 pb-2">
                                        <span className="text-sm font-medium">Suggested Grade</span>
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
