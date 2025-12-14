import { useState, useEffect, useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { db, storage } from "@/lib/firebase";
import { collection, query, where, getDocs, addDoc, serverTimestamp, onSnapshot, doc } from "firebase/firestore";
import { ref, uploadBytesResumable, getDownloadURL } from "firebase/storage";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import type { Subject, Submission } from "../../types";
import { Skeleton } from "@/components/ui/skeleton";
import { ThemeToggle } from "@/components/ThemeToggle";
import { ProfileDialog } from "@/components/ProfileDialog";
import { User, FileText, CheckCircle, Clock } from "lucide-react";

const StudentDashboard = () => {
  const { currentUser, userData, logout } = useAuth();
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Dialogs
  const [isSubmissionOpen, setIsSubmissionOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);

  // Upload State
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [selectedSubject, setSelectedSubject] = useState<string>("");

  useEffect(() => {
    if (!currentUser || !userData) return;

    // 1. Fetch Subjects
    const qSubjects = query(collection(db, "subjects"));
    const unsubSubjects = onSnapshot(qSubjects, (snapshot) => {
        const subs: Subject[] = [];
        snapshot.forEach(doc => subs.push({ id: doc.id, ...doc.data() } as Subject));
        setSubjects(subs);
    });

    // 2. Fetch My Submissions
    const qSubmissions = query(collection(db, "submissions"), where("studentId", "==", currentUser.uid));
    const unsubSubmissions = onSnapshot(qSubmissions, (snapshot) => {
        const subs: Submission[] = [];
        snapshot.forEach(doc => subs.push({ id: doc.id, ...doc.data() } as Submission));
        setSubmissions(subs);
        setLoading(false);
    });

    return () => {
        unsubSubjects();
        unsubSubmissions();
    }
  }, [currentUser, userData]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setSelectedFile(file);
      setPreviewUrl(URL.createObjectURL(file));
    }
  };

  const handleUpload = async () => {
    if (!selectedFile || !selectedSubject || !currentUser) return;
    setUploading(true);
    
    try {
        const subject = subjects.find(s => s.id === selectedSubject);
        const fileRef = ref(storage, `submissions/${currentUser.uid}/${Date.now()}_${selectedFile.name}`);
        const uploadTask = uploadBytesResumable(fileRef, selectedFile);

        uploadTask.on('state_changed', 
            (snapshot) => {
                const prog = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
                setProgress(prog);
            },
            (error) => {
                console.error("Upload failed", error);
                setUploading(false);
            },
            async () => {
                const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
                
                await addDoc(collection(db, "submissions"), {
                    studentId: currentUser.uid,
                    studentName: userData.name,
                    department: userData.department || "Unknown",
                    rollNo: userData.rollNo || "Unknown",
                    sessionYear: userData.sessionYear || "Unknown",
                    subjectId: selectedSubject,
                    subjectName: subject?.name || "Unknown",
                    originalFilePath: downloadURL,
                    status: 'pending',
                    createdAt: serverTimestamp()
                });

                setUploading(false);
                setSelectedFile(null);
                setPreviewUrl(null);
                setSelectedSubject("");
                setProgress(0);
                setIsSubmissionOpen(false);
            }
        );

    } catch (e) {
        console.error(e);
        setUploading(false);
    }
  };

  const pendingSubjects = useMemo(() => {
    return subjects
        .filter(sub => !submissions.some(s => s.subjectId === sub.id))
        .filter(sub => userData?.department ? sub.department === userData.department : true);
  }, [subjects, submissions, userData?.department]);

  const openSubmissionFor = (subjectId: string) => {
      setSelectedSubject(subjectId);
      setIsSubmissionOpen(true);
  };

  return (
    <div className="min-h-screen bg-background p-8">
      {/* Header */}
      <div className="flex justify-between items-center mb-10 border-b pb-4">
        <div>
            <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
            <p className="text-muted-foreground mt-1">Welcome back, {userData?.name}</p>
        </div>
        <div className="flex items-center gap-2">
            <ThemeToggle />
            <Button variant="ghost" size="icon" onClick={() => setIsProfileOpen(true)} title="Profile">
                <User className="h-[1.2rem] w-[1.2rem]" />
            </Button>
            <Button variant="outline" size="sm" onClick={() => logout()}>Logout</Button>
        </div>
      </div>
      
      <div className="grid lg:grid-cols-3 gap-8">
        {/* Left Column: Pending Submissions */}
        <div className="lg:col-span-2 space-y-8">
            {/* Pending Section */}
            <div>
                <h2 className="text-xl font-semibold tracking-tight mb-4 flex items-center gap-2">
                    <Clock className="h-5 w-5 text-orange-500" /> Pending Submissions
                </h2>
                <div className="bg-card border rounded-lg overflow-hidden shadow-sm">
                    {loading ? <div className="p-4"><Skeleton className="h-20 w-full" /></div> :
                    pendingSubjects.length === 0 ? (
                        <div className="p-8 text-center text-muted-foreground border-dashed">
                            <CheckCircle className="h-8 w-8 mx-auto mb-2 text-green-500 opacity-50" />
                            <p>All caught up! No pending submissions.</p>
                        </div>
                    ) : (
                        <div className="divide-y">
                            {pendingSubjects.map(sub => (
                                <div key={sub.id} className="p-4 flex items-center justify-between hover:bg-muted/50 transition-colors">
                                    <div>
                                        <p className="font-medium text-foreground">{sub.name}</p>
                                        <p className="text-sm text-muted-foreground">{sub.code}</p>
                                    </div>
                                    <Button size="sm" onClick={() => openSubmissionFor(sub.id)}>
                                        Submit Now
                                    </Button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* History Section */}
            <div>
                <h2 className="text-xl font-semibold tracking-tight mb-4 flex items-center gap-2">
                    <FileText className="h-5 w-5 text-blue-500" /> Submission History
                </h2>
                <div className="bg-card border rounded-lg overflow-hidden shadow-sm">
                     {loading ? <div className="p-4"><Skeleton className="h-20 w-full" /></div> :
                     submissions.length === 0 ? (
                        <div className="p-8 text-center text-muted-foreground">
                            No submissions history found.
                        </div>
                     ) : (
                         <div className="divide-y">
                             {/* Header Row */}
                             <div className="grid grid-cols-4 p-4 text-xs font-semibold text-muted-foreground uppercase bg-muted/40">
                                 <span className="col-span-1">Subject</span>
                                 <span className="col-span-1">Date</span>
                                 <span className="col-span-1 text-center">Status</span>
                                 <span className="col-span-1 text-right">Marks</span>
                             </div>
                             {submissions.map(sub => (
                                 <div key={sub.id} className="grid grid-cols-4 p-4 items-center text-sm hover:bg-muted/50 transition-colors">
                                     <div className="col-span-1 font-medium truncate pr-2">{sub.subjectName}</div>
                                     <div className="col-span-1 text-muted-foreground text-xs">
                                         {new Date(sub.createdAt?.seconds * 1000).toLocaleDateString()}
                                     </div>
                                     <div className="col-span-1 flex justify-center">
                                         <StatusBadge status={sub.status} />
                                     </div>
                                     <div className="col-span-1 text-right font-medium">
                                         {sub.marks ? `${sub.marks}/100` : '-'}
                                     </div>
                                 </div>
                             ))}
                         </div>
                     )}
                </div>
            </div>
        </div>

        {/* Right Column: Profile Summary (Optional, user asked for list view, but a sidebar card is nice) */}
        <div className="space-y-6">
             <Card>
                 <CardHeader>
                     <CardTitle className="text-lg">My Performance</CardTitle>
                 </CardHeader>
                 <CardContent>
                     <div className="text-3xl font-bold mb-1">
                         {submissions.filter(s => s.status === 'reviewed').length}
                         <span className="text-sm font-normal text-muted-foreground ml-2">graded</span>
                     </div>
                     <p className="text-xs text-muted-foreground">
                         total submissions: {submissions.length}
                     </p>
                 </CardContent>
             </Card>
        </div>
      </div>

      <ProfileDialog open={isProfileOpen} onOpenChange={setIsProfileOpen} />

      {/* Submission Dialog */}
      <Dialog open={isSubmissionOpen} onOpenChange={(open) => {
          if(!open) setSelectedSubject(""); 
          setIsSubmissionOpen(open);
      }}>
        <DialogContent className="max-w-4xl w-full h-[85vh] flex flex-col p-0 gap-0 overflow-hidden">
             <DialogHeader className="p-6 border-b">
                <DialogTitle>Submit Assignment</DialogTitle>
                <DialogDescription>
                    {pendingSubjects.find(s => s.id === selectedSubject)?.name || "New Submission"}
                </DialogDescription>
             </DialogHeader>

             <div className="flex-1 grid md:grid-cols-2 overflow-hidden">
                {/* Left: Form */}
                <div className="p-6 space-y-6 overflow-y-auto border-r bg-background z-10">
                    <div className="space-y-2">
                        <Label>Subject</Label>
                        <select 
                            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background disabled:opacity-50"
                            value={selectedSubject}
                            onChange={(e) => setSelectedSubject(e.target.value)}
                            // lock if clicked from list? User said "get that latest submission form".
                            // I'll allow changing, but it defaults to the clicked one.
                        >
                            <option value="">Select a subject...</option>
                             {/* Show pending subjects, plus the selected one if it's somehow not pending (re-submit? No logic for resubmit yet) */}
                            {pendingSubjects.map(sub => (
                                <option key={sub.id} value={sub.id}>{sub.name}</option>
                            ))}
                        </select>
                    </div>
                    
                    <div className="space-y-2">
                        <Label>Upload PDF</Label>
                        <div className="border-2 border-dashed rounded-lg p-6 hover:bg-muted/50 transition-colors text-center cursor-pointer relative">
                             <input 
                                type="file" 
                                accept="application/pdf" 
                                onChange={handleFileChange} 
                                className="absolute inset-0 opacity-0 cursor-pointer"
                             />
                             <div className="space-y-2">
                                <FileText className="h-8 w-8 mx-auto text-muted-foreground" />
                                <div className="text-sm font-medium">Click to browse or drag file</div>
                                <div className="text-xs text-muted-foreground">PDF only</div>
                             </div>
                        </div>
                        {selectedFile && (
                            <div className="flex items-center gap-2 text-sm text-green-600 bg-green-50 p-2 rounded border border-green-200">
                                <CheckCircle className="h-4 w-4" />
                                <span className="truncate">{selectedFile.name}</span>
                            </div>
                        )}
                    </div>
                    
                    {uploading && (
                        <div className="space-y-1 pt-4">
                            <div className="flex justify-between text-xs">
                                <span>Uploading...</span>
                                <span>{Math.round(progress)}%</span>
                            </div>
                            <div className="w-full bg-secondary h-2 rounded-full overflow-hidden">
                                <div className="bg-primary h-full transition-all" style={{ width: `${progress}%` }} />
                            </div>
                        </div>
                    )}
                </div>

                {/* Right: Preview */}
                <div className="bg-muted/30 p-6 h-full flex flex-col hidden md:flex relative">
                    <Label className="mb-2 block">Document Preview</Label>
                    <div className="flex-1 bg-background border rounded-lg shadow-sm overflow-hidden flex items-center justify-center">
                        {previewUrl ? (
                            <iframe 
                                src={previewUrl} 
                                className="w-full h-full" 
                                title="Submission Preview" 
                            />
                        ) : (
                            <div className="text-muted-foreground text-center space-y-2">
                                <p className="text-sm">No file selected</p>
                            </div>
                        )}
                    </div>
                </div>
             </div>

            <DialogFooter className="p-4 border-t bg-muted/20">
                <div className="flex gap-2 justify-end w-full">
                    <Button variant="outline" onClick={() => setIsSubmissionOpen(false)} disabled={uploading}>Cancel</Button>
                    <Button onClick={handleUpload} disabled={!selectedFile || !selectedSubject || uploading}>
                        {uploading ? "Submitting..." : "Submit Project"}
                    </Button>
                </div>
            </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

const StatusBadge = ({ status }: { status: string }) => {
    const styles = {
        pending: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-100",
        processing: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-100",
        submitted: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-100",
        reviewed: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100"
    };
    // @ts-ignore
    const style = styles[status] || "bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-100";
    return <span className={`px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide ${style}`}>{status}</span>
}

export default StudentDashboard;
