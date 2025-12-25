import { useState, useEffect, useMemo } from "react";
import { generateInsights } from "../../lib/ai";
import { useAuth } from "@/contexts/AuthContext";
import { db } from "@/lib/firebase";
import { collection, query, addDoc, serverTimestamp, onSnapshot, doc, updateDoc, deleteField } from "firebase/firestore";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import type { Subject, Submission } from "../../types";
import { COLLEGE_DATA } from "../../lib/data";

import { ThemeToggle } from "@/components/ThemeToggle";
import { ProfileDialog } from "@/components/ProfileDialog";
import { User } from "lucide-react";

const ProfessorDashboard = () => {
    const { currentUser, userData, logout } = useAuth();
    const [subjects, setSubjects] = useState<Subject[]>([]);
    const [submissions, setSubmissions] = useState<Submission[]>([]);
    
    // Create Subject State
    const [newSubject, setNewSubject] = useState<{
        name: string; code: string; department: string; semester: string; section: string; requirements: string[]; aiEnabled: boolean 
    }>({ 
        name: '', code: '', department: '', semester: '', section: '', requirements: ['Assignment'], aiEnabled: true 
    });
    const [isCreateOpen, setIsCreateOpen] = useState(false);

    // Subject Search State


    // Grading State
    const [selectedSubmission, setSelectedSubmission] = useState<Submission | null>(null);
    const [marks, setMarks] = useState<string>("");
    const [viewGroup, setViewGroup] = useState<{
        studentId: string; studentName: string; subjectId: string; subjectName: string; submissions: Submission[];
    } | null>(null);
    
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
                // Enforce Professor's Department
                department: userData?.department || newSubject.department,
                professorId: currentUser.uid,
                requirements: newSubject.requirements, // Array of required types
                aiEnabled: newSubject.aiEnabled,
                createdAt: serverTimestamp()
            });
            setIsCreateOpen(false);
            setNewSubject({ name: '', code: '', department: userData?.department || '', semester: '', section: '', requirements: ['Assignment'], aiEnabled: true });
        } catch (e) {
            console.error(e);
        }
    };
    
    // Auto-fill department when opening
    useEffect(() => {
        if (isCreateOpen && userData?.department) {
            setNewSubject(prev => ({ ...prev, department: userData.department || '' }));
        }
    }, [isCreateOpen, userData]);

    // Template Logic
    const deptTemplate = useMemo(() => COLLEGE_DATA.departments.find(d => d.name === userData?.department), [userData?.department]);

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
        // Manual AI trigger only
    };

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
                           <div className="grid gap-2">
                                <Label>Required Submissions</Label>
                                <div className="grid grid-cols-2 gap-2 border p-3 rounded-md">
                                    {['Assignment', 'Micro Project', 'Macro Project', 'Mini Skill Project'].map(type => (
                                        <div key={type} className="flex items-center gap-2">
                                            <input 
                                                type="checkbox"
                                                id={`req-${type}`}
                                                className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                                                checked={newSubject.requirements.includes(type)}
                                                onChange={(e) => {
                                                    if (e.target.checked) setNewSubject(prev => ({...prev, requirements: [...prev.requirements, type]}));
                                                    else setNewSubject(prev => ({...prev, requirements: prev.requirements.filter(r => r !== type)}));
                                                }}
                                            />
                                            <label htmlFor={`req-${type}`} className="text-sm cursor-pointer select-none">{type}</label>
                                        </div>
                                    ))}
                                </div>
                                {newSubject.requirements.length === 0 && <p className="text-[10px] text-destructive">Please select at least one requirement.</p>}
                           </div>
                           <div className="flex items-center space-x-2 pt-2">
                                <input 
                                    type="checkbox" 
                                    id="aiEnabled"
                                    className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                                    checked={newSubject.aiEnabled}
                                    onChange={e => setNewSubject({...newSubject, aiEnabled: e.target.checked})}
                                />
                                <Label htmlFor="aiEnabled" className="cursor-pointer">Enable Generative AI Analysis</Label>
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
                        <select 
                            className="flex h-10 w-[250px] rounded-md border border-input bg-background px-3 py-2 text-sm"
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

                    <div className="rounded-md border">
                        <div className="p-4 grid grid-cols-5 font-semibold border-b bg-muted">
                            <span className="col-span-1">Student</span>
                            <span className="col-span-1">Subject</span>
                            <span className="col-span-1">Last Update</span>
                            <span className="col-span-1">Status</span>
                            <span className="col-span-1 text-right">Action</span>
                        </div>
                        {mySubmissions.length === 0 ? (
                             <div className="p-8 text-center text-muted-foreground">No submissions found.</div>
                        ) : (
                            (() => {
                                // Group Submissions
                                const groups: Record<string, {
                                    studentId: string; studentName: string; subjectId: string; subjectName: string; submissions: Submission[]; lastUpdate: any;
                                }> = {};
                                mySubmissions.forEach(sub => {
                                    const key = `${sub.studentId}_${sub.subjectId}`;
                                    if (!groups[key]) {
                                        groups[key] = {
                                            studentId: sub.studentId,
                                            studentName: sub.studentName,
                                            subjectId: sub.subjectId,
                                            subjectName: sub.subjectName,
                                            submissions: [],
                                            lastUpdate: sub.createdAt
                                        };
                                    }
                                    groups[key].submissions.push(sub);
                                    if (sub.createdAt?.seconds > groups[key].lastUpdate?.seconds) groups[key].lastUpdate = sub.createdAt;
                                });
                                
                                return Object.values(groups).map(group => {
                                    const subject = subjects.find(s => s.id === group.subjectId);
                                    // @ts-ignore
                                    const reqs = subject?.requirements || (subject?.submissionType ? [subject.submissionType] : ['Assignment']);
                                    const submittedCount = new Set(group.submissions.map(s => s.submissionType)).size;
                                    const reviewedCount = group.submissions.filter(s => s.status === 'reviewed').length;
                                    const totalReqs = reqs.length;

                                    let badgeVariant: "default" | "secondary" | "destructive" | "outline" = "secondary";
                                    let statusText = `${submittedCount}/${totalReqs} Submitted`;
                                    let customClass = "";

                                    if (submittedCount === 0) {
                                        statusText = "Not Started";
                                        badgeVariant = "outline";
                                        customClass = "text-muted-foreground border-dashed";
                                    } else if (submittedCount === totalReqs) {
                                        if (reviewedCount >= totalReqs) {
                                            statusText = "All Graded";
                                            badgeVariant = "default"; 
                                            customClass = "bg-green-100 text-green-700 hover:bg-green-200 dark:bg-green-900/30 dark:text-green-400 border-transparent";
                                        } else {
                                            statusText = "Needs Review";
                                            badgeVariant = "secondary";
                                            customClass = "bg-orange-100 text-orange-700 hover:bg-orange-200 dark:bg-orange-900/30 dark:text-orange-400";
                                        }
                                    } else {
                                        statusText = `In Progress (${submittedCount}/${totalReqs})`;
                                        badgeVariant = "outline";
                                        customClass = "text-blue-600 border-blue-200 bg-blue-50 dark:bg-blue-900/20 dark:text-blue-300 dark:border-blue-800";
                                    }
                                    
                                    return (
                                        <div key={`${group.studentId}-${group.subjectId}`} className="p-4 grid grid-cols-5 items-center border-b last:border-0 hover:bg-muted/50 transition-colors">
                                            <span className="col-span-1 font-medium">{group.studentName}</span>
                                            <span className="col-span-1 text-sm text-muted-foreground">{group.subjectName}</span>
                                            <span className="col-span-1 text-sm">{new Date(group.lastUpdate?.seconds * 1000).toLocaleDateString()}</span>
                                            <span className="col-span-1">
                                                <Badge variant={badgeVariant} className={customClass}>
                                                    {statusText}
                                                </Badge>
                                            </span>
                                            <span className="col-span-1 text-right">
                                                <Button variant="outline" size="sm" onClick={() => setViewGroup(group)}>View Work</Button>
                                            </span>
                                        </div>
                                    );
                                });
                            })()
                        )}
                    </div>
                </div>
            </TabsContent>

            <TabsContent value="subjects">
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {mySubjects.map(sub => (
                         <Card key={sub.id}>
                            <CardHeader>
                                <div className="flex justify-between items-start gap-2">
                                    <div>
                                        <CardTitle>{sub.name}</CardTitle>
                                        <CardDescription>{sub.code}</CardDescription>
                                    </div>
                                    {/* @ts-ignore */}
                                    {(sub.requirements || (sub.submissionType ? [sub.submissionType] : [])).length > 0 && (
                                        <Badge variant="secondary" className="text-[10px]">
                                            {/* @ts-ignore */}
                                            {(sub.requirements || [sub.submissionType]).length} Types
                                        </Badge>
                                    )}
                                </div>
                                <CardDescription>{sub.department}</CardDescription>
                            </CardHeader>
                            <CardContent>
                                <div className="text-sm space-y-2">
                                    <div className="flex gap-4 text-muted-foreground">
                                        <span>Sem: {sub.semester}</span>
                                        <span>Sec: {sub.section}</span>
                                    </div>
                                    <div className="flex flex-wrap gap-1 mt-2">
                                        {/* @ts-ignore */}
                                        {(sub.requirements || (sub.submissionType ? [sub.submissionType] : [])).map((req: string) => (
                                            <span key={req} className="px-1.5 py-0.5 bg-muted rounded text-[10px] border">
                                                {req}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            </CardContent>
                         </Card>
                    ))}
                </div>
            </TabsContent>
        </Tabs>

        {/* Group Details Dialog */}
        <Dialog open={!!viewGroup} onOpenChange={(open) => !open && setViewGroup(null)}>
            <DialogContent className="max-w-3xl">
                <DialogHeader>
                    <DialogTitle>{viewGroup?.studentName}</DialogTitle>
                    <DialogDescription>Submission Status for {viewGroup?.subjectName}</DialogDescription>
                </DialogHeader>
                <div className="py-4 space-y-2">
                    {viewGroup && (() => {
                        const subject = subjects.find(s => s.id === viewGroup.subjectId);
                        // @ts-ignore
                        const reqs: string[] = subject?.requirements || (subject?.submissionType ? [subject.submissionType] : ['Assignment']);
                        
                        // Use live submissions data to ensure real-time updates
                        const liveGroupSubmissions = submissions.filter(s => s.studentId === viewGroup.studentId && s.subjectId === viewGroup.subjectId);

                        return reqs.map((req, idx) => {
                            const sub = liveGroupSubmissions.find(s => s.submissionType === req);
                            return (
                                <div key={idx} className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/30">
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
                        });
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
                                    Student: <span className="font-medium text-foreground">{displaySub.studentName}</span>
                                    {displaySub.topic && <span className="ml-4 inline-block text-xs text-blue-600 font-semibold bg-blue-50 dark:bg-blue-900/30 px-2 py-0.5 rounded border border-blue-100 dark:border-blue-800">Topic: {displaySub.topic}</span>}
                                </DialogDescription>
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
                            {(() => {
                                const fileUrl = displaySub.mergedFilePath || displaySub.originalFilePath;
                                return fileUrl ? (
                                    <div className="h-full bg-gray-100 dark:bg-gray-800">
                                        <iframe 
                                            src={`https://docs.google.com/viewer?url=${encodeURIComponent(fileUrl)}&embedded=true`}
                                            className="w-full h-full border-none"
                                            title="File Preview"
                                        />
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
                                            <div className="text-center py-8">
                                                 <p className="text-sm text-muted-foreground mb-4">No analysis generated yet.</p>
                                                 <Button variant="secondary" onClick={() => runAIGeneration(displaySub)}>
                                                     Generate AI Analysis
                                                 </Button>
                                            </div>
                                        )
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
