import { useState, useEffect, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { renderAsync } from "docx-preview";
import { useAuth } from "@/contexts/AuthContext";
import { db, storage } from "@/lib/firebase";
import { collection, query, where, addDoc, serverTimestamp, onSnapshot, getDocs } from "firebase/firestore";
import { ref, uploadBytesResumable, getDownloadURL } from "firebase/storage";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { Subject, Submission } from "../../types";
import { Skeleton } from "@/components/ui/skeleton";
import { ThemeToggle } from "@/components/ThemeToggle";
import { ProfileDialog } from "@/components/ProfileDialog";
import { User, FileText, CheckCircle, Clock, Search, AlertTriangle, Lightbulb, Camera, Trash2 } from "lucide-react";
import { checkTopicSimilarity } from "@/lib/ai";
import { jsPDF } from "jspdf";

const StudentDashboard = () => {
    const navigate = useNavigate();
    const { currentUser, userData, logout } = useAuth();
    const [subjects, setSubjects] = useState<Subject[]>([]);
    const [submissions, setSubmissions] = useState<Submission[]>([]);
    const [loading, setLoading] = useState(true);



    // Upload & Preview State
    const [selectedSubject, setSelectedSubject] = useState("");
    const [selectedReqType, setSelectedReqType] = useState(""); // Track which requirement we are submitting
    const [isSubmissionOpen, setIsSubmissionOpen] = useState(false);
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [uploading, setUploading] = useState(false);
    const [progress, setProgress] = useState(0);

    // Topic Verification State
    const [topic, setTopic] = useState("");
    const [topicStatus, setTopicStatus] = useState<'idle' | 'checking' | 'valid' | 'invalid'>('idle');
    const [topicMessage, setTopicMessage] = useState("");
    const [topicSuggestions, setTopicSuggestions] = useState<string[]>([]);
    const [capturedImages, setCapturedImages] = useState<string[]>([]);

    // Subject Details View State
    const [viewSubject, setViewSubject] = useState<Subject | null>(null);
    const [isProfileOpen, setIsProfileOpen] = useState(false);
    
    
    const docxPreviewRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!selectedFile || !previewUrl || selectedFile.type === 'application/pdf') return;

        // Render DOCX if container is ready
        if (docxPreviewRef.current) {
            const reader = new FileReader();
            reader.onloadend = () => {
                if (reader.result instanceof ArrayBuffer) {
                    renderAsync(reader.result, docxPreviewRef.current!, undefined, {
                        className: "docx-preview-wrapper",
                        inWrapper: true,
                        ignoreWidth: true,
                        ignoreHeight: false
                    }).catch(err => console.error("DOCX Preview Failed", err));
                }
            };
            reader.readAsArrayBuffer(selectedFile);
        }
    }, [selectedFile, previewUrl, isSubmissionOpen]);

    useEffect(() => {
        if (!currentUser || !userData) return;

        // 1. Fetch Subjects
        const qSubjects = query(collection(db, "subjects"));
        const unsubSubjects = onSnapshot(qSubjects, (snapshot) => {
            const subs: Subject[] = [];
            snapshot.forEach(doc => subs.push({ id: doc.id, ...doc.data() } as Subject));
            setSubjects(subs);
        });

        // 2. Fetch User's Submissions
        const qSubmissions = query(collection(db, "submissions"), where("studentId", "==", currentUser.uid));
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

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            const validTypes = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/msword'];
            if (!validTypes.includes(file.type)) {
                alert('Please upload PDF or DOCX files only');
                return;
            }
            setSelectedFile(file);
            setPreviewUrl(URL.createObjectURL(file));
            // Reset Topic Status so user must re-verify with the new file
            setTopicStatus('idle');
            setTopicMessage("");
        }
    };

    const handleCheckTopic = async () => {
        if (!topic.trim()) return;
        setTopicStatus('checking');
        setTopicMessage("");
        setTopicSuggestions([]);

        try {
            // 1. Fetch all existing topics for this subject & type
            const q = query(
                collection(db, "submissions"), 
                where("subjectId", "==", selectedSubject),
                where("submissionType", "==", selectedReqType)
            );
            const snapshot = await getDocs(q);
            const existingTopics = snapshot.docs
                .map(doc => doc.data().topic)
                .filter(t => t && typeof t === 'string'); // Filter valid strings
            
            // 2. AI Check
            const subjectName = subjects.find(s => s.id === selectedSubject)?.name || "Unknown Subject";
            const result = await checkTopicSimilarity(topic, subjectName, existingTopics, previewUrl || undefined);

            if (result.isUnique) {
                setTopicStatus('valid');
                // @ts-ignore
                if (result.isOfflineBypass) {
                    setTopicMessage("⚠️ " + (result.message || "AI Verification Unavailable. Submission Allowed."));
                } else {
                    setTopicMessage("Topic is unique and approved!");
                }
            } else {
                setTopicStatus('invalid');
                setTopicMessage(result.message || "Topic is too similar to an existing submission.");
                setTopicSuggestions(result.suggestions || []);
            }
        } catch (e) {
            console.error("Topic check failed", e);
            setTopicStatus('idle'); // Allow retry or ignore?
            setTopicMessage("Failed to verify topic. Please try again.");
        }
    };

    const handleCaptureImage = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            const reader = new FileReader();
            reader.onloadend = () => {
                if (reader.result && typeof reader.result === 'string') {
                    setCapturedImages(prev => [...prev, reader.result as string]);
                }
            };
            reader.readAsDataURL(file);
        }
    };

    const handleUpload = async () => {
        if (!currentUser || !userData) return;
        
        let fileToUpload: File | null = selectedFile;
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        let fileName = selectedFile?.name || `assignment_${Date.now()}.pdf`;

        // Check Logic for Assignment (Camera Flow)
        if (selectedReqType === 'Assignment') {
            if (capturedImages.length > 0) {
                setUploading(true);
                try {
                    // Generate PDF from images
                    const doc = new jsPDF();
                    const width = doc.internal.pageSize.getWidth();
                    const height = doc.internal.pageSize.getHeight();
                    
                    capturedImages.forEach((img, i) => {
                        if (i > 0) doc.addPage();
                        doc.addImage(img, 0, 0, width, height);
                    });
                    
                    const pdfBlob = doc.output('blob');
                    fileToUpload = new File([pdfBlob], `assignment_${Date.now()}.pdf`, { type: "application/pdf" });
                    fileName = fileToUpload.name;
                } catch (e) {
                    console.error("PDF Generation Failed", e);
                    setUploading(false);
                    return;
                }
            } else if (!selectedFile) {
                 // No Images captured AND No file selected -> Invalid
                 return;
            }
        } else {
             // Non-Assignment (Project) -> check Topic
             if (topicStatus !== 'valid') return;
             if (!selectedFile) return;
        }

        if (!fileToUpload) return;
        
        setUploading(true);

        try {
            const subject = subjects.find(s => s.id === selectedSubject);
                    // --- COVER PAGE LOGIC (PDF ONLY) ---
                    let finalBlob = (await fileToUpload.arrayBuffer()) as unknown as ArrayBuffer; // Default to original
                    let finalFileType = fileToUpload.type;

                    if (fileToUpload.type === 'application/pdf') {
                         // We upload the original PDF directly.
                         // The cover page will be generated dynamically when the professor views it.
                         finalBlob = (await fileToUpload.arrayBuffer()) as unknown as ArrayBuffer;
                    }

                    const storageRef = ref(storage, `submissions/${currentUser.uid}/${selectedSubject}/${fileName}`);
                    // Wrap in Uint8Array to ensure compatibility
                    const uploadTask = uploadBytesResumable(storageRef, new Uint8Array(finalBlob), { contentType: finalFileType });

                    uploadTask.on('state_changed', 
                (snapshot) => {
                    const p = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
                    setProgress(p);
                }, 
                (error) => {
                    console.error(error);
                    setUploading(false);
                }, 
                async () => {
                    const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
                    
                    // Create Submission Record
                    await addDoc(collection(db, "submissions"), {
                        studentId: currentUser.uid,
                        studentName: userData.name,
                        department: userData.department || "Unknown",
                        rollNo: userData.rollNo || "Unknown",
                        sessionYear: userData.sessionYear || "Unknown",
                        subjectId: selectedSubject,
                        subjectName: subject?.name || "Unknown",
                        submissionType: selectedReqType || "Assignment", // Use specific requirement type
                        topic: selectedReqType !== 'Assignment' ? topic : null,
                        originalFilePath: downloadURL,
                        status: 'pending',
                        createdAt: serverTimestamp()
                    });

                    setUploading(false);
                    setSelectedFile(null);
                    setPreviewUrl(null);
                    setCapturedImages([]);
                    setSelectedSubject("");
                    setSelectedReqType("");
                    setProgress(0);
                    setIsSubmissionOpen(false);
                    // Keep ViewSubject Open so user sees update
                }
            );

        } catch (e) {
            console.error(e);
            setUploading(false);
        }
    };

    // Filter subjects for the student's department
    const mySubjects = useMemo(() => {
        if (!userData?.department) return [];
        return subjects.filter(sub => sub.department === userData.department);
    }, [subjects, userData?.department]);

    // Helper to find submission status for a specific requirement
    const getSubmissionStatus = (subjectId: string, reqType: string) => {
        return submissions.find(s => s.subjectId === subjectId && s.submissionType === reqType);
    };

    const openUploadDialog = (subjectId: string, reqType: string) => {
        const subject = subjects.find(s => s.id === subjectId);
        if (subject?.vivaDate) {
            const vivaDate = new Date(subject.vivaDate);
            // Deadline is 1 day before Viva
            const deadline = new Date(vivaDate);
            deadline.setDate(deadline.getDate() - 1);
            // Set deadline to end of day? Or same time? Let's assume end of day (23:59:59)
            deadline.setHours(23, 59, 59, 999);

            if (new Date() > deadline) {
                alert(`Submission Window Closed!\nDeadline: ${deadline.toLocaleDateString()} ${deadline.toLocaleTimeString()}`);
                return;
            }
        }

        setSelectedSubject(subjectId);
        setSelectedReqType(reqType);
        // Reset State
        setTopic("");
        setTopicStatus('idle');
        setTopicMessage("");
        setTopicSuggestions([]);
        setSelectedFile(null);
        setPreviewUrl(null);
        setCapturedImages([]);
        setProgress(0);
        setIsSubmissionOpen(true);
    };

    return (
      <div className="min-h-screen bg-background p-8">
        {/* Header */}
        <div className="flex justify-between items-center mb-10 border-b pb-4">
          <div>
              <h1 className="text-3xl font-bold tracking-tight">Student Dashboard</h1>
              <p className="text-muted-foreground mt-1">Welcome back, {userData?.name}</p>
          </div>
          <div className="flex items-center gap-2">
              <ThemeToggle />
              <Button variant="ghost" size="icon" onClick={() => setIsProfileOpen(true)} title="Profile">
                  <User className="h-[1.2rem] w-[1.2rem]" />
              </Button>
              <Button variant="outline" size="sm" onClick={() => { logout(); navigate('/'); }}>Logout</Button>
          </div>
        </div>
        
        {/* Main Grid: My Subjects */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {loading ? Array(3).fill(0).map((_, i) => <Skeleton key={i} className="h-40 w-full" />) :
             mySubjects.length === 0 ? (
                 <div className="col-span-full text-center p-12 border-dashed border-2 rounded-lg text-muted-foreground">
                     No subjects found for your department ({userData?.department}).
                 </div>
             ) : (
                 mySubjects.map(sub => {
                     // Backward compatibility for old subjects without 'requirements' array
                     // @ts-ignore
                     const reqs: string[] = sub.requirements || (sub.submissionType ? [sub.submissionType] : ['Assignment']);
                     const completedCount = reqs.filter(r => getSubmissionStatus(sub.id, r)).length;
                     const progress = Math.round((completedCount / reqs.length) * 100);

                      const userSlot = sub.schedule?.[currentUser!.uid];

                      return (
                          <Card key={sub.id} className="hover:border-primary/50 transition-colors cursor-pointer group relative overflow-hidden" onClick={() => setViewSubject(sub)}>
                              <div className="absolute top-0 left-0 w-1 h-full bg-primary/20 group-hover:bg-primary transition-colors"></div>
                              <CardHeader className="pb-2">
                                  <div className="flex justify-between items-start">
                                      <div>
                                          <CardTitle>{sub.name}</CardTitle>
                                          <CardDescription className="font-mono text-xs mt-1">{sub.code}</CardDescription>
                                      </div>
                                      <Badge variant="outline">{reqs.length} Tasks</Badge>
                                  </div>
                              </CardHeader>
                              <CardContent>
                                  <div className="space-y-3">
                                      {sub.vivaDate && (
                                          <div className="bg-muted/40 p-2 rounded text-xs space-y-1">
                                              <div className="flex justify-between font-semibold">
                                                  <span>Viva Date:</span>
                                                  <span>{new Date(sub.vivaDate).toLocaleDateString()}</span>
                                              </div>
                                              {userSlot ? (
                                                  <div className="flex justify-between text-blue-600 dark:text-blue-400">
                                                      <span>Your Slot:</span>
                                                      <span>{new Date(userSlot.startTime).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                                                  </div>
                                              ) : (
                                                  <div className="text-orange-500 text-[10px]">Slot Pending / Not Assigned</div>
                                              )}
                                              <div className="flex justify-between text-muted-foreground border-t pt-1 mt-1 border-dashed">
                                                 <span>Upload Deadline:</span>
                                                 <span>{(() => {
                                                     const d = new Date(sub.vivaDate);
                                                     d.setDate(d.getDate() - 1);
                                                     return d.toLocaleDateString();
                                                 })()}</span>
                                              </div>
                                          </div>
                                      )}
                                      
                                      <div className="space-y-2">
                                          <div className="flex justify-between text-xs text-muted-foreground">
                                              <span>Progress</span>
                                              <span>{progress}%</span>
                                          </div>
                                          <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                                              <div className="h-full bg-green-500 transition-all duration-500" style={{ width: `${progress}%` }}></div>
                                          </div>
                                          <div className="pt-2 text-xs flex gap-2">
                                            <Badge variant={progress === 100 ? "default" : "secondary"} className={progress===100 ? "bg-green-600 hover:bg-green-700" : ""}>
                                                {progress === 100 ? "Completed" : "In Progress"}
                                            </Badge>
                                         </div>
                                      </div>
                                  </div>
                              </CardContent>
                          </Card>
                      );
                 })
             )
            }
        </div>

        {/* Subject Details Dialog */}
        <Dialog open={!!viewSubject} onOpenChange={(open) => !open && setViewSubject(null)}>
            <DialogContent className="max-w-3xl">
                <DialogHeader>
                    <DialogTitle className="text-2xl flex items-center gap-2">
                        {viewSubject?.name}
                        <Badge variant="outline" className="text-sm font-normal">{viewSubject?.code}</Badge>
                    </DialogTitle>
                    <DialogDescription>
                        Department of {viewSubject?.department}
                    </DialogDescription>
                </DialogHeader>
                
                <div className="py-6">
                    <h3 className="text-sm font-semibold mb-4 uppercase tracking-wider text-muted-foreground">Course Submissions</h3>
                    <div className="border rounded-lg divide-y">
                        {viewSubject && (() => {
                             // @ts-ignore
                             const reqs: string[] = viewSubject.requirements || (viewSubject.submissionType ? [viewSubject.submissionType] : ['Assignment']);
                             return reqs.map((req, idx) => {
                                 const sub = getSubmissionStatus(viewSubject.id, req);
                                 return (
                                     <div key={idx} className="p-4 flex items-center justify-between hover:bg-muted/30">
                                         <div className="flex items-center gap-3">
                                             <div className={`h-8 w-8 rounded-full flex items-center justify-center ${sub ? 'bg-green-100 text-green-600' : 'bg-orange-100 text-orange-600'}`}>
                                                 {sub ? <CheckCircle className="h-5 w-5" /> : <Clock className="h-5 w-5" />}
                                             </div>
                                             <div>
                                                 <p className="font-medium text-sm">{req}</p>
                                                 <p className="text-xs text-muted-foreground">
                                                     {sub ? `Submitted on ${new Date(sub.createdAt?.seconds * 1000).toLocaleDateString()}` : "Pending Submission"}
                                                 </p>
                                             </div>
                                         </div>
                                         
                                          <div className="flex items-center gap-3">
                                              {sub ? (
                                                  <div className="text-right">
                                                      <StatusBadge status={sub.status} />
                                                      {sub.marks && <div className="text-xs font-bold mt-1 text-green-600">{sub.marks}/100</div>}
                                                  </div>
                                              ) : (
                                                  <Button size="sm" onClick={() => openUploadDialog(viewSubject.id, req)}
                                                    disabled={(() => {
                                                        if (viewSubject.vivaDate) {
                                                            const deadline = new Date(viewSubject.vivaDate);
                                                            deadline.setDate(deadline.getDate() - 1);
                                                            deadline.setHours(23, 59, 59);
                                                            return new Date() > deadline;
                                                        }
                                                        return false;
                                                    })()}
                                                  >
                                                      {(() => {
                                                           if (viewSubject.vivaDate) {
                                                                const deadline = new Date(viewSubject.vivaDate);
                                                                deadline.setDate(deadline.getDate() - 1);
                                                                deadline.setHours(23, 59, 59);
                                                                if (new Date() > deadline) return "Deadline Exceeded";
                                                           }
                                                           return "Upload File";
                                                      })()}
                                                  </Button>
                                              )}
                                          </div>
                                     </div>
                                 );
                             });
                        })()}
                    </div>
                </div>
            </DialogContent>
        </Dialog>

        {/* File Upload Dialog */}
        <Dialog open={isSubmissionOpen} onOpenChange={setIsSubmissionOpen}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>New Submission: {selectedReqType}</DialogTitle>
                    <DialogDescription>
                        Upload for <strong>{subjects.find(s => s.id === selectedSubject)?.name}</strong>.
                    </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                     {selectedReqType === 'Assignment' ? (
                        <div className="space-y-4">
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                                {capturedImages.map((img, idx) => (
                                    <div key={idx} className="relative aspect-[3/4] border rounded-lg overflow-hidden group">
                                        <img src={img} alt={`Page ${idx + 1}`} className="w-full h-full object-cover" />
                                        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                            <Button variant="destructive" size="icon" onClick={() => setCapturedImages(prev => prev.filter((_, i) => i !== idx))}>
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        </div>
                                        <div className="absolute bottom-1 right-1 bg-black/70 text-white text-[10px] px-1.5 rounded">
                                            {idx + 1}
                                        </div>
                                    </div>
                                ))}
                                <label className="flex flex-col items-center justify-center aspect-[3/4] border-2 border-dashed rounded-lg hover:bg-muted/50 cursor-pointer transition-colors">
                                    <Camera className="h-8 w-8 text-muted-foreground mb-2" />
                                    <span className="text-xs font-medium text-muted-foreground">Add Page</span>
                                    {/* @ts-ignore */}
                                    <input type="file" accept="image/*" capture="environment" onChange={handleCaptureImage} className="hidden" />
                                </label>
                            </div>
                            <p className="text-xs text-muted-foreground text-center">
                                Capture detailed images of your assignment pages in order.
                            </p>
                        </div>
                     ) : (
                        <div className="border-2 border-dashed rounded-lg p-8 text-center hover:bg-muted/50 transition-colors cursor-pointer relative">
                             <input 
                                type="file" 
                                accept=".pdf,.doc,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/msword"
                                onChange={handleFileSelect}
                                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                            />
                            <div className="flex flex-col items-center gap-2">
                                <FileText className="h-10 w-10 text-muted-foreground" />
                                {selectedFile ? (
                                    <p className="font-medium text-foreground">{selectedFile.name}</p>
                                ) : (
                                    <>
                                    <p className="font-medium">Click to upload PDF or DOCX</p>
                                    <p className="text-sm text-muted-foreground">or drag and drop</p>
                                    </>
                                )}
                            </div>
                        </div>
                     )}


                    {selectedReqType !== 'Assignment' && (
                        <div className="space-y-3 p-4 border rounded-md bg-muted/20">
                            <Label>Project Topic</Label>
                            <div className="flex gap-2">
                                <Input 
                                    placeholder="Enter your unique project topic..." 
                                    value={topic}
                                    onChange={(e) => {
                                        setTopic(e.target.value);
                                        setTopicStatus('idle');
                                        setTopicMessage("");
                                    }}
                                    disabled={topicStatus === 'valid' || uploading}
                                />
                                {topicStatus !== 'valid' && (
                                    <Button onClick={handleCheckTopic} disabled={!topic || topicStatus === 'checking'} size="icon">
                                        {topicStatus === 'checking' ? <Clock className="animate-spin h-4 w-4"/> : <Search className="h-4 w-4" />}
                                    </Button>
                                )}
                                {topicStatus === 'valid' && (
                                    <Button variant="ghost" size="icon" className="text-green-600" disabled>
                                        <CheckCircle className="h-4 w-4" />
                                    </Button>
                                )}
                            </div>
                            
                            {topicMessage && (
                                <div className={`text-xs p-2 rounded flex items-start gap-2 ${
                                    topicStatus === 'valid' 
                                        ? (topicMessage.includes("⚠️") ? 'bg-yellow-100 text-yellow-800 border border-yellow-200' : 'bg-green-100 text-green-700') 
                                        : 'bg-red-100 text-red-700'
                                }`}>
                                    {topicStatus === 'invalid' && <AlertTriangle className="h-4 w-4 shrink-0" />}
                                    {topicMessage.includes("⚠️") && <AlertTriangle className="h-4 w-4 shrink-0 text-yellow-600" />}
                                    <span>{topicMessage}</span>
                                </div>
                            )}

                            {topicSuggestions.length > 0 && (
                                <div className="space-y-2 pt-2">
                                    <p className="text-xs font-semibold flex items-center gap-1"><Lightbulb className="h-3 w-3" /> AI Suggestions for Unique Topics:</p>
                                    <div className="flex flex-wrap gap-2">
                                        {topicSuggestions.map((s, i) => (
                                            <Badge key={i} variant="outline" className="cursor-pointer hover:bg-primary/10" onClick={() => setTopic(s)}>
                                                {s}
                                            </Badge>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {progress > 0 && <progress value={progress} max="100" className="w-full h-2" />}
                    
                    {previewUrl && (
                        <div className="h-[300px] border rounded-md overflow-hidden bg-muted flex flex-col">
                            {selectedFile?.type === 'application/pdf' ? (
                                <iframe src={previewUrl} className="w-full h-full" title="Preview" />
                            ) : (
                                <div className="flex-1 w-full h-full overflow-auto bg-white p-4" ref={docxPreviewRef}>
                                    {/* DOCX Render Container */}
                                </div>
                            )}
                        </div>
                    )}
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => setIsSubmissionOpen(false)}>Cancel</Button>
                    <Button onClick={handleUpload} disabled={uploading || (selectedReqType === 'Assignment' ? capturedImages.length === 0 : (!selectedFile || topicStatus !== 'valid'))}>
                        {uploading ? "Uploading..." : "Submit Assignment"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>

        <ProfileDialog open={isProfileOpen} onOpenChange={setIsProfileOpen} />
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
