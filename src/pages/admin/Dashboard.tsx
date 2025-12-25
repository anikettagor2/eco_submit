import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { db } from "@/lib/firebase";
import { collection, onSnapshot, doc, updateDoc, setDoc, getDoc, deleteDoc, addDoc } from "firebase/firestore";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { UserProfile, Submission, Subject } from "../../types";
import { ThemeToggle } from "@/components/ThemeToggle";
import { LogOut, ShieldAlert, Key, Users, FileText, CheckCircle, Search, Pencil, Trash2, LayoutTemplate, BookOpen, Plus } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import defaultLogo from '@/assets/mits-logo.png';

/**
 * Admin Dashboard
 * Allows:
 * 1. Manually replacing Gemini API Key (stored in Firestore 'settings/config')
 * 2. Managing Users (Edit Roles, Details)
 * 3. Managing Submissions (Edit status, marks, files)
 * 4. Managing Subjects (Add, Edit, Delete)
 */

const BLANK_PAGE_TEMPLATE = `<div style="width: 794px; height: 1123px; padding: 40px; box-sizing: border-box; background: white; font-family: sans-serif;">
    <!-- Start designing your page here -->
    <h1 style="text-align: center;">Page Title</h1>
</div>`;

const DEFAULT_COVER_TEMPLATE = ``;


const DUMMY_PREVIEW_DATA = {
    instituteName: "Madhav Institute of Technology & Science",
    tagline1: "Deemed University",
    tagline2: "(Declared under Distinct Category...)",
    tagline3: "NAAC ACCREDITED WITH A++ GRADE",
    logoUrl: defaultLogo,
    submissionType: "Assignment",
    topic: "Analysis of Linked Lists",
    subjectName: "Data Structures",
    subjectCode: "CS-101",
    name: "Rahul Sharma",
    rollNo: "0901CS211054",
    department: "Computer Science",
    professorName: "Dr. A. Kumar",
    currentDate: new Date().toLocaleDateString(),
    sessionYear: "2024-2025"
};

const LivePreview = ({ html, settings }: { html: string, settings: any }) => {
    const previewData: any = {
         ...DUMMY_PREVIEW_DATA,
    };
    
    // Merge settings if they exist (override dummy defaults)
    Object.keys(settings).forEach(key => {
        if (settings[key]) {
             previewData[key] = settings[key];
        }
    });

    // Force logo fallback logic (since input was removed)
    previewData.logoUrl = defaultLogo;

    // Ensure specific dynamic fields stay dummy for preview consistency
    previewData.name = "Rahul Sharma";
    previewData.rollNo = "0901CS211054";
    previewData.professorName = "Dr. A. Kumar";
    
    // Interpolate
    const interpolated = (html || "").replace(/\{\{(\w+)\}\}/g, (_, key) => previewData[key] || `{{${key}}}`);

    // Check if full document (starts with doctype or html tag)
    const isFullDoc = interpolated.trim().match(/^<!DOCTYPE|<html/i);
    
    const doc = isFullDoc ? interpolated : `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
             body { margin: 0; padding: 20px; background: #f3f4f6; display: flex; justify-content: center; font-family: sans-serif; }
             .page {
                width: 794px;
                height: 1123px;
                background: white;
                color: black; /* Force black for preview */
                overflow: hidden;
                box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1);
                /* Scale down to fit preview container */
                transform: scale(0.55);
                transform-origin: top center;
             }
          </style>
        </head>
        <body>
            <div class="page">
                ${interpolated}
            </div>
        </body>
      </html>
    `;

    return (
        <div className="h-[650px] w-full border rounded-lg bg-muted/20 overflow-hidden flex flex-col">
            <div className="bg-muted px-4 py-2 border-b text-xs font-semibold text-muted-foreground uppercase tracking-wider flex justify-between items-center">
                <span>Live Preview (Scaled)</span>
                <span className="text-[10px]">A4 Format</span>
            </div>
            <iframe 
                srcDoc={doc} 
                className="w-full h-full border-none bg-gray-100/50" 
                title="Live Preview" 
            />
        </div>
    );
};

const AdminDashboard = () => {
    const { currentUser, logout } = useAuth();
    
    // --- STATE ---
    const [apiKey, setApiKey] = useState("");
    const [users, setUsers] = useState<UserProfile[]>([]);
    const [submissions, setSubmissions] = useState<Submission[]>([]);
    const [subjects, setSubjects] = useState<Subject[]>([]);
    
    // Search
    const [userSearch, setUserSearch] = useState("");
    const [subSearch, setSubSearch] = useState("");
    const [subjectSearch, setSubjectSearch] = useState("");

    // Editing State
    const [editingUser, setEditingUser] = useState<UserProfile | null>(null);
    const [userForm, setUserForm] = useState<Partial<UserProfile>>({});

    const [editingSub, setEditingSub] = useState<Submission | null>(null);
    const [subForm, setSubForm] = useState<Partial<Submission>>({});

    const [isSubjectDialogOpen, setIsSubjectDialogOpen] = useState(false);
    const [editingSubject, setEditingSubject] = useState<Subject | null>(null); // If null, means creating new
    const [subjectForm, setSubjectForm] = useState<Partial<Subject>>({});

    // Template Settings
    const [templateSettings, setTemplateSettings] = useState({
        instituteName: "",
        tagline1: "",
        tagline2: "",
        tagline3: "",
        logoUrl: "",
        footerInstitute: "",
        footerUniversity: "",
        // New Pages
        htmlPage1: "",
        htmlPage2: "",
        htmlPage3: "",
        htmlPage4: "",
        useHtml: false
    });

    // --- EFFECTS ---

    useEffect(() => {
        // Fetch API Key
        const fetchSettings = async () => {
            try {
                const docRef = doc(db, "settings", "config");
                const snap = await getDoc(docRef);
                if (snap.exists() && snap.data().geminiApiKey) {
                    setApiKey(snap.data().geminiApiKey);
                }
            } catch (e) {
                console.error("Failed to fetch settings", e);
            }
        };
        fetchSettings();

        // Fetch Template Config
        const fetchTemplate = async () => {
             try {
                const docRef = doc(db, "settings", "cover_page_config");
                const snap = await getDoc(docRef);
                if (snap.exists()) {
                    setTemplateSettings(prev => ({...prev, ...snap.data()}));
                }
            } catch (e) {
                console.error("Failed to fetch template settings", e);
            }
        };
        fetchTemplate();

        // Listen to Users
        const unsubUsers = onSnapshot(collection(db, "users"), (snap) => {
            const u: UserProfile[] = [];
            snap.forEach(d => u.push({ uid: d.id, ...d.data() } as UserProfile));
            setUsers(u);
        });

        // Listen to Submissions
        const unsubSubs = onSnapshot(collection(db, "submissions"), (snap) => {
            const s: Submission[] = [];
            snap.forEach(d => s.push({ id: d.id, ...d.data() } as Submission));
            setSubmissions(s);
        });

        // Listen to Subjects
        const unsubSubjects = onSnapshot(collection(db, "subjects"), (snap) => {
            const s: Subject[] = [];
            snap.forEach(d => s.push({ id: d.id, ...d.data() } as Subject));
            setSubjects(s);
        });

        return () => {
            unsubUsers();
            unsubSubs();
            unsubSubjects();
        };
    }, []);

    // --- HANDLERS ---

    const handleSaveApiKey = async () => {
        if (!apiKey.trim()) return;
        try {
            await setDoc(doc(db, "settings", "config"), {
                geminiApiKey: apiKey.trim(),
                updatedBy: currentUser?.uid,
                updatedAt: new Date().toISOString()
            }, { merge: true });
            alert("API Key updated successfully! The system will now use this key.");
        } catch (e) {
            console.error(e);
            alert("Failed to update API Key.");
        }
    };

    const handleUpdateUser = async () => {
        if (!editingUser || !editingUser.uid) return;
        try {
            await updateDoc(doc(db, "users", editingUser.uid), userForm);
            setEditingUser(null);
        } catch (e) {
            console.error(e);
            alert("Failed to update user.");
        }
    };

    const handleDeleteUser = async (uid: string) => {
        if (!confirm("Are you sure you want to PERMANENTLY delete this user? This cannot be undone.")) return;
        try {
            await deleteDoc(doc(db, "users", uid));
        } catch (e) {
            console.error(e);
            alert("Failed to delete user profile.");
        }
    };

    const handleUpdateSub = async () => {
        if (!editingSub || !editingSub.id) return;
        try {
           const updates = { ...subForm };
           if (updates.marks) updates.marks = Number(updates.marks);
           
           await updateDoc(doc(db, "submissions", editingSub.id), updates);
           setEditingSub(null);
        } catch (e) {
            console.error(e);
            alert("Failed to update submission.");
        }
    };

    const handleDeleteSub = async (id: string) => {
        if (!confirm("Are you sure you want to PERMANENTLY delete this submission?")) return;
        try {
            await deleteDoc(doc(db, "submissions", id));
        } catch (e) {
            console.error(e);
            alert("Failed to delete submission.");
        }
    };
    
    // Subject Handlers
    const handleSaveSubject = async () => {
        if (!subjectForm.name || !subjectForm.code) {
            alert("Name and Code are required");
            return;
        }

        try {
            if (editingSubject) {
                // Update
                if (!editingSubject.id) return;
                await updateDoc(doc(db, "subjects", editingSubject.id), subjectForm);
            } else {
                // Create
                await addDoc(collection(db, "subjects"), {
                    ...subjectForm,
                    createdAt: new Date().toISOString()
                });
            }
            setIsSubjectDialogOpen(false);
            setEditingSubject(null);
            setSubjectForm({});
        } catch (e) {
            console.error(e);
            alert("Failed to save subject.");
        }
    };

    const handleDeleteSubject = async (id: string) => {
        if (!confirm("Are you sure you want to delete this subject?")) return;
        try {
            await deleteDoc(doc(db, "subjects", id));
        } catch (e) {
            console.error(e);
            alert("Failed to delete subject.");
        }
    };

    const handleSaveTemplate = async () => {
        try {
            await setDoc(doc(db, "settings", "cover_page_config"), templateSettings, { merge: true });
            alert("Template settings saved! Future submissions will use this format.");
        } catch (e) {
            console.error(e);
            alert("Failed to save template.");
        }
    };


    // Filtered Lists
    const filteredUsers = users.filter(u => 
        u.name?.toLowerCase().includes(userSearch.toLowerCase()) || 
        u.email?.toLowerCase().includes(userSearch.toLowerCase())
    );

    const filteredSubs = submissions.filter(s => 
        s.studentName?.toLowerCase().includes(subSearch.toLowerCase()) || 
        s.subjectName?.toLowerCase().includes(subSearch.toLowerCase())
    );

    const filteredSubjects = subjects.filter(s => 
        s.name.toLowerCase().includes(subjectSearch.toLowerCase()) || 
        s.code.toLowerCase().includes(subjectSearch.toLowerCase())
    );


    return (
        <div className="min-h-screen bg-background p-8 font-sans">
             {/* Header */}
            <div className="flex justify-between items-center mb-8 border-b pb-4">
                <div className="flex items-center gap-3">
                    <ShieldAlert className="h-8 w-8 text-red-600" />
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight">Admin Console</h1>
                        <p className="text-muted-foreground w-full">System Management & Override Control</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <ThemeToggle />
                    <Button variant="outline" onClick={() => logout()} className="gap-2">
                        <LogOut className="h-4 w-4" /> Logout
                    </Button>
                </div>
            </div>

            <Tabs defaultValue="system" className="space-y-6">
                <TabsList className="grid w-full grid-cols-5 lg:w-[750px]">
                    <TabsTrigger value="system">System & API</TabsTrigger>
                    <TabsTrigger value="users">Users</TabsTrigger>
                    <TabsTrigger value="submissions">Submissions</TabsTrigger>
                    <TabsTrigger value="subjects">Subjects</TabsTrigger>
                    <TabsTrigger value="template">Template</TabsTrigger>
                </TabsList>

                {/* --- TAB 1: SYSTEM --- */}
                <TabsContent value="system">
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2"><Key className="h-5 w-5"/> Gemini AI Configuration</CardTitle>
                            <CardDescription>
                                Replace the underlying API Key for the AI engine. Use this if the default key quota is exceeded or revoked.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="grid w-full max-w-sm items-center gap-1.5">
                                <Label htmlFor="apiKey">Gemini API Key</Label>
                                <div className="flex gap-2">
                                    <Input 
                                        type="password" 
                                        id="apiKey" 
                                        placeholder="AIzaSy..." 
                                        value={apiKey} 
                                        onChange={(e) => setApiKey(e.target.value)} 
                                    />
                                    <Button onClick={handleSaveApiKey}>Update Key</Button>
                                </div>
                                <p className="text-xs text-muted-foreground">Changes apply immediately to all users.</p>
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* --- TAB 2: USERS --- */}
                <TabsContent value="users">
                    <Card>
                        <CardHeader>
                            <div className="flex justify-between items-center">
                                <CardTitle className="flex items-center gap-2"><Users className="h-5 w-5"/> User Management ({users.length})</CardTitle>
                                <div className="relative w-64">
                                    <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                                    <Input placeholder="Search users..." className="pl-8" value={userSearch} onChange={e => setUserSearch(e.target.value)} />
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent>
                            <div className="h-[600px] overflow-y-auto pr-2">
                                <div className="space-y-2">
                                    {filteredUsers.map(user => (
                                        <div key={user.uid} className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50">
                                            <div className="flex items-center gap-4">
                                                <div className={`h-10 w-10 rounded-full flex items-center justify-center font-bold text-white ${
                                                    user.role === 'admin' ? 'bg-red-500' : user.role === 'professor' ? 'bg-purple-500' : 'bg-blue-500'
                                                }`}>
                                                    {user.name?.[0]?.toUpperCase()}
                                                </div>
                                                <div>
                                                    <p className="font-medium flex items-center gap-2">
                                                        {user.name}
                                                        <Badge variant="secondary" className="text-[10px]">{user.role}</Badge>
                                                    </p>
                                                    <p className="text-xs text-muted-foreground">{user.email} | {user.department || "No Dept"}</p>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-1">
                                                <Button variant="ghost" size="icon" onClick={() => {
                                                    setEditingUser(user);
                                                    setUserForm(user);
                                                }}>
                                                    <Pencil className="h-4 w-4 text-muted-foreground" />
                                                </Button>
                                                <Button variant="ghost" size="icon" onClick={() => handleDeleteUser(user.uid)} className="text-red-500 hover:text-red-700 hover:bg-red-100">
                                                    <Trash2 className="h-4 w-4" />
                                                </Button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* --- TAB 3: SUBMISSIONS --- */}
                <TabsContent value="submissions">
                    <Card>
                         <CardHeader>
                            <div className="flex justify-between items-center">
                                <CardTitle className="flex items-center gap-2"><FileText className="h-5 w-5"/> Submission Control ({submissions.length})</CardTitle>
                                <div className="relative w-64">
                                    <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                                    <Input placeholder="Search submissions..." className="pl-8" value={subSearch} onChange={e => setSubSearch(e.target.value)} />
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent>
                             <div className="h-[600px] overflow-y-auto pr-2">
                                <div className="space-y-2">
                                    {filteredSubs.map(sub => (
                                        <div key={sub.id} className="flex items-start justify-between p-3 border rounded-lg hover:bg-muted/50">
                                            <div className="flex gap-3">
                                                <div className="mt-1">
                                                    {sub.status === 'reviewed' ? <CheckCircle className="h-5 w-5 text-green-500"/> : <div className="h-3 w-3 rounded-full bg-yellow-400 mt-1"/>}
                                                </div>
                                                <div>
                                                    <p className="font-medium">{sub.subjectName} - {sub.studentName}</p>
                                                    <p className="text-xs text-muted-foreground truncate w-64">{sub.topic || "No Topic"}</p>
                                                    <div className="flex gap-2 mt-1">
                                                        <Badge variant="outline" className="text-[10px]">{sub.status}</Badge>
                                                        {sub.marks !== undefined && <Badge variant="secondary" className="text-[10px]">{sub.marks}/100</Badge>}
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-1">
                                                <Button variant="ghost" size="icon" onClick={() => {
                                                    setEditingSub(sub);
                                                    setSubForm(sub);
                                                }}>
                                                    <Pencil className="h-4 w-4 text-muted-foreground" />
                                                </Button>
                                                <Button variant="ghost" size="icon" onClick={() => handleDeleteSub(sub.id)} className="text-red-500 hover:text-red-700 hover:bg-red-100">
                                                    <Trash2 className="h-4 w-4" />
                                                </Button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* --- TAB 4: SUBJECTS --- */}
                <TabsContent value="subjects">
                    <Card>
                        <CardHeader>
                            <div className="flex justify-between items-center">
                                <CardTitle className="flex items-center gap-2"><BookOpen className="h-5 w-5"/> Subject Management ({subjects.length})</CardTitle>
                                <div className="flex gap-4">
                                    <div className="relative w-64">
                                        <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                                        <Input placeholder="Search subjects..." className="pl-8" value={subjectSearch} onChange={e => setSubjectSearch(e.target.value)} />
                                    </div>
                                    <Button onClick={() => {
                                        setEditingSubject(null);
                                        setSubjectForm({});
                                        setIsSubjectDialogOpen(true);
                                    }}>
                                        <Plus className="h-4 w-4 mr-2" /> Add Subject
                                    </Button>
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent>
                            <div className="h-[600px] overflow-y-auto pr-2">
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                    {filteredSubjects.map(sub => (
                                        <Card key={sub.id} className="border bg-card/50 hover:bg-muted/50 transition-colors">
                                            <CardContent className="p-4">
                                                <div className="flex justify-between items-start mb-2">
                                                    <div>
                                                        <h4 className="font-bold">{sub.name}</h4>
                                                        <p className="text-sm text-muted-foreground font-mono">{sub.code}</p>
                                                    </div>
                                                    <div className="flex gap-1">
                                                         <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => {
                                                            setEditingSubject(sub);
                                                            setSubjectForm(sub);
                                                            setIsSubjectDialogOpen(true);
                                                        }}>
                                                            <Pencil className="h-4 w-4" />
                                                        </Button>
                                                        <Button variant="ghost" size="icon" className="h-8 w-8 text-red-500 hover:text-red-700" onClick={() => handleDeleteSubject(sub.id)}>
                                                            <Trash2 className="h-4 w-4" />
                                                        </Button>
                                                    </div>
                                                </div>
                                                <div className="space-y-1 text-xs text-muted-foreground">
                                                    <div className="flex justify-between">
                                                        <span>Dept:</span>
                                                        <span className="font-medium text-foreground">{sub.department}</span>
                                                    </div>
                                                    <div className="flex justify-between">
                                                        <span>Sem/Sec:</span>
                                                        <span className="font-medium text-foreground">{sub.semester} {sub.section}</span>
                                                    </div>
                                                    <div className="flex justify-between">
                                                        <span>Professor:</span>
                                                        <span className="font-medium text-foreground truncate w-24 text-right">{sub.professorId}</span>
                                                    </div>
                                                </div>
                                            </CardContent>
                                        </Card>
                                    ))}
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>

                 {/* --- TAB 5: TEMPLATE --- */}
                 <TabsContent value="template">
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2"><LayoutTemplate className="h-5 w-5"/> Frontpage Template Editor</CardTitle>
                            <CardDescription>
                                Customize the automated cover page format. Leave fields empty to use system defaults.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            <div className="grid gap-4 md:grid-cols-2">
                                <div className="space-y-2">
                                    <Label>Institute Name (Header)</Label>
                                    <Input value={templateSettings.instituteName} onChange={e => setTemplateSettings({...templateSettings, instituteName: e.target.value})} placeholder="Default: Madhav Institute..." />
                                </div>
                                <div className="space-y-2">
                                    <Label>Tagline 1 (Red)</Label>
                                    <Input value={templateSettings.tagline1} onChange={e => setTemplateSettings({...templateSettings, tagline1: e.target.value})} placeholder="Default: Deemed University" />
                                </div>
                                <div className="space-y-2">
                                    <Label>Tagline 2 (Green)</Label>
                                    <Input value={templateSettings.tagline2} onChange={e => setTemplateSettings({...templateSettings, tagline2: e.target.value})} placeholder="Default: (Declared under...)" />
                                </div>
                                <div className="space-y-2">
                                    <Label>Tagline 3 (Red/NAAC)</Label>
                                    <Input value={templateSettings.tagline3} onChange={e => setTemplateSettings({...templateSettings, tagline3: e.target.value})} placeholder="Default: NAAC ACCREDITED..." />
                                </div>

                                
                                <div className="md:col-span-2 border-t pt-4">
                                    <h4 className="text-sm font-semibold mb-4">Footer Customization</h4>
                                    <div className="grid gap-4 md:grid-cols-2">
                                         <div className="space-y-2">
                                            <Label>Footer Line 1 (Institute)</Label>
                                            <Input value={templateSettings.footerInstitute} onChange={e => setTemplateSettings({...templateSettings, footerInstitute: e.target.value})} placeholder="Default: MADHAV INSTITUTE..." />
                                        </div>
                                         <div className="space-y-2">
                                            <Label>Footer Line 2 (University)</Label>
                                            <Input value={templateSettings.footerUniversity} onChange={e => setTemplateSettings({...templateSettings, footerUniversity: e.target.value})} placeholder="Default: DEEMED UNIVERSITY" />
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="border-t pt-6 mt-6">
                                <Label className="text-base font-semibold mb-2 block">Multi-Page HTML Editor</Label>
                                <p className="text-sm text-muted-foreground mb-4">Design 4 separate front pages. Each page will be inserted at the start of the submission.</p>
                                
                                <Tabs defaultValue="page1" className="w-full">
                                    <TabsList className="grid w-full grid-cols-4 bg-muted/20">
                                        <TabsTrigger value="page1" className="data-[state=active]:bg-green-500 data-[state=active]:text-white">Cover Page (Page 1)</TabsTrigger>
                                        <TabsTrigger value="page2" className="data-[state=active]:bg-blue-500 data-[state=active]:text-white">Inner Page (Page 2)</TabsTrigger>
                                        <TabsTrigger value="page3" className="data-[state=active]:bg-purple-500 data-[state=active]:text-white">Closing Page (Page 3)</TabsTrigger>
                                        <TabsTrigger value="page4" className="data-[state=active]:bg-orange-500 data-[state=active]:text-white">Review Page (Page 4)</TabsTrigger>
                                    </TabsList>
                                    
                                    {/* PAGE 1 EDITOR */}
                                    <TabsContent value="page1" className="space-y-4 pt-4">
                                            <div className="flex justify-between items-center">
                                            <Label className="text-lg font-semibold">Page 1 HTML Editor</Label>
                                            <div className="flex gap-2">
                                                 <Button variant="outline" size="sm" onClick={() => setTemplateSettings(prev => ({...prev, htmlPage1: DEFAULT_COVER_TEMPLATE, useHtml: true}))}>Load Default Template</Button>
                                                 <Button variant="destructive" size="sm" onClick={() => setTemplateSettings(prev => ({...prev, htmlPage1: ""}))}>Clear Page</Button>
                                            </div>
                                            </div>
                                            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 h-[700px]">
                                                <textarea 
                                                    className="flex h-full w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono overflow-auto resize-none"
                                                    value={templateSettings.htmlPage1 || ""}
                                                    onChange={e => setTemplateSettings({...templateSettings, htmlPage1: e.target.value, useHtml: true})}
                                                    placeholder="Paste HTML for Page 1... (Leave empty to skip)"
                                                />
                                                <LivePreview html={templateSettings.htmlPage1 || ""} settings={templateSettings} />
                                            </div>
                                    </TabsContent>
                                    
                                    {/* PAGE 2 EDITOR */}
                                    <TabsContent value="page2" className="space-y-4 pt-4">
                                             <div className="flex justify-between items-center">
                                            <Label className="text-lg font-semibold">Page 2 HTML Editor</Label>
                                            <div className="flex gap-2">
                                                <Button variant="outline" size="sm" onClick={() => setTemplateSettings(prev => ({...prev, htmlPage2: BLANK_PAGE_TEMPLATE, useHtml: true}))}>Load Starter Layout</Button>
                                                <Button variant="destructive" size="sm" onClick={() => setTemplateSettings(prev => ({...prev, htmlPage2: ""}))}>Clear Page (Remove)</Button>
                                            </div>
                                            </div>
                                            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 h-[700px]">
                                                <textarea 
                                                    className="flex h-full w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono overflow-auto resize-none"
                                                    value={templateSettings.htmlPage2 || ""}
                                                    onChange={e => setTemplateSettings({...templateSettings, htmlPage2: e.target.value, useHtml: true})}
                                                    placeholder="Paste HTML for Page 2 (e.g. Index, Acknowledgement)..."
                                                />
                                                <LivePreview html={templateSettings.htmlPage2 || ""} settings={templateSettings} />
                                            </div>
                                    </TabsContent>
                                    
                                    {/* PAGE 3 EDITOR */}
                                    <TabsContent value="page3" className="space-y-4 pt-4">
                                            <div className="flex justify-between items-center">
                                            <Label className="text-lg font-semibold">Page 3 HTML Editor</Label>
                                            <div className="flex gap-2">
                                                <Button variant="outline" size="sm" onClick={() => setTemplateSettings(prev => ({...prev, htmlPage3: BLANK_PAGE_TEMPLATE, useHtml: true}))}>Load Starter Layout</Button>
                                                <Button variant="destructive" size="sm" onClick={() => setTemplateSettings(prev => ({...prev, htmlPage3: ""}))}>Clear Page (Remove)</Button>
                                            </div>
                                            </div>
                                             <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 h-[700px]">
                                                <textarea 
                                                    className="flex h-full w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono overflow-auto resize-none"
                                                    value={templateSettings.htmlPage3 || ""}
                                                    onChange={e => setTemplateSettings({...templateSettings, htmlPage3: e.target.value, useHtml: true})}
                                                    placeholder="Paste HTML for Page 3 (e.g. Bibliography)..."
                                                />
                                                <LivePreview html={templateSettings.htmlPage3 || ""} settings={templateSettings} />
                                            </div>
                                    </TabsContent>

                                     {/* PAGE 4 EDITOR */}
                                    <TabsContent value="page4" className="space-y-4 pt-4">
                                            <div className="flex justify-between items-center">
                                            <Label className="text-lg font-semibold">Page 4 HTML Editor (Post-Review)</Label>
                                            <div className="flex gap-2">
                                                <Button variant="outline" size="sm" onClick={() => setTemplateSettings(prev => ({...prev, htmlPage4: BLANK_PAGE_TEMPLATE, useHtml: true}))}>Load Starter Layout</Button>
                                                <Button variant="destructive" size="sm" onClick={() => setTemplateSettings(prev => ({...prev, htmlPage4: ""}))}>Clear Page (Remove)</Button>
                                            </div>
                                            </div>
                                            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 h-[700px]">
                                                <textarea 
                                                    className="flex h-full w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono overflow-auto resize-none"
                                                    value={templateSettings.htmlPage4 || ""}
                                                    onChange={e => setTemplateSettings({...templateSettings, htmlPage4: e.target.value, useHtml: true})}
                                                    placeholder="Paste HTML for Page 4 (This page will be added AFTER Professor Review)..."
                                                />
                                                <LivePreview html={templateSettings.htmlPage4 || ""} settings={templateSettings} />
                                            </div>
                                    </TabsContent>
                                </Tabs>

                                <div className="text-xs text-muted-foreground mt-2 p-3 bg-muted/50 rounded-lg">
                                    <p className="font-semibold mb-1">Available Variables (Click to copy):</p>
                                    <code className="block whitespace-normal break-words leading-relaxed">
                                        {"{{instituteName}}, {{tagline1}}, {{tagline2}}, {{tagline3}}, {{logoUrl}}, {{submissionType}}, {{topic}}, {{subjectName}}, {{subjectCode}}, {{name}}, {{rollNo}}, {{department}}, {{professorName}}, {{currentDate}}, {{sessionYear}}"}
                                    </code>
                                </div>
                            </div>

                            <div className="flex justify-end pt-4">
                                <Button onClick={handleSaveTemplate}>Save Template Configuration</Button>
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>

            {/* EDIT USER DIALOG */}
            <Dialog open={!!editingUser} onOpenChange={(o) => !o && setEditingUser(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Edit User</DialogTitle>
                    </DialogHeader>
                    {editingUser && (
                        <div className="grid gap-4 py-4">
                            <div className="grid gap-2">
                                <Label>Name</Label>
                                <Input value={userForm.name || ""} onChange={e => setUserForm({...userForm, name: e.target.value})} />
                            </div>
                            <div className="grid gap-2">
                                <Label>Department</Label>
                                <Input value={userForm.department || ""} onChange={e => setUserForm({...userForm, department: e.target.value})} />
                            </div>
                            <div className="grid gap-2">
                                <Label>Role</Label>
                                <Select 
                                    value={userForm.role}
                                    onValueChange={(val) => setUserForm({...userForm, role: val as any})}
                                >
                                    <SelectTrigger>
                                        <SelectValue placeholder="Select Role" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="student">Student</SelectItem>
                                        <SelectItem value="professor">Professor</SelectItem>
                                        <SelectItem value="admin">Admin</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                    )}
                    <DialogFooter>
                        <Button onClick={handleUpdateUser}>Save Changes</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

             {/* EDIT SUBMISSION DIALOG */}
             <Dialog open={!!editingSub} onOpenChange={(o) => !o && setEditingSub(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Edit Submission</DialogTitle>
                        <DialogDescription className="text-xs font-mono">{editingSub?.id}</DialogDescription>
                    </DialogHeader>
                    {editingSub && (
                        <div className="grid gap-4 py-4">
                             <div className="grid gap-2">
                                <Label>Topic</Label>
                                <Input value={subForm.topic || ""} onChange={e => setSubForm({...subForm, topic: e.target.value})} />
                            </div>
                            <div className="grid gap-2">
                                <Label>Status</Label>
                                <Select 
                                    value={subForm.status}
                                    onValueChange={(val) => setSubForm({...subForm, status: val as any})}
                                >
                                    <SelectTrigger>
                                        <SelectValue placeholder="Status" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="pending">Pending</SelectItem>
                                        <SelectItem value="processing">Processing</SelectItem>
                                        <SelectItem value="processing_ai">AI Processing</SelectItem>
                                        <SelectItem value="submitted">Submitted</SelectItem>
                                        <SelectItem value="reviewed">Reviewed</SelectItem>
                                        <SelectItem value="error">Error</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="grid gap-2">
                                <Label>Marks</Label>
                                <Input type="number" value={subForm.marks ?? ""} onChange={e => setSubForm({...subForm, marks: Number(e.target.value)})} />
                            </div>
                             <div className="grid gap-2">
                                <Label>File URL (Override)</Label>
                                <Input value={subForm.originalFilePath || ""} onChange={e => setSubForm({...subForm, originalFilePath: e.target.value})} />
                            </div>
                        </div>
                    )}
                    <DialogFooter>
                        <Button onClick={handleUpdateSub}>Save Changes</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* EDIT/ADD SUBJECT DIALOG */}
            <Dialog open={isSubjectDialogOpen} onOpenChange={setIsSubjectDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{editingSubject ? "Edit Subject" : "Add Subject"}</DialogTitle>
                        <DialogDescription>
                            {editingSubject ? "Modify subject details." : "Create a new subject for students."}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="grid gap-2">
                            <Label>Subject Name</Label>
                            <Input value={subjectForm.name || ""} onChange={e => setSubjectForm({...subjectForm, name: e.target.value})} placeholder="e.g. Data Structures" />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="grid gap-2">
                                <Label>Subject Code</Label>
                                <Input value={subjectForm.code || ""} onChange={e => setSubjectForm({...subjectForm, code: e.target.value})} placeholder="e.g. CS-101" />
                            </div>
                             <div className="grid gap-2">
                                <Label>Professor ID/Email</Label>
                                <Input value={subjectForm.professorId || ""} onChange={e => setSubjectForm({...subjectForm, professorId: e.target.value})} placeholder="Prof. User ID" />
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                             <div className="grid gap-2">
                                <Label>Department</Label>
                                <Input value={subjectForm.department || ""} onChange={e => setSubjectForm({...subjectForm, department: e.target.value})} placeholder="CSE" />
                            </div>
                            <div className="grid gap-2">
                                <Label>Semester</Label>
                                <Input value={subjectForm.semester || ""} onChange={e => setSubjectForm({...subjectForm, semester: e.target.value})} placeholder="1, 2, 3..." />
                            </div>
                        </div>
                         <div className="grid gap-2">
                                <Label>Section</Label>
                                <Input value={subjectForm.section || ""} onChange={e => setSubjectForm({...subjectForm, section: e.target.value})} placeholder="A, B, or Combined" />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button onClick={handleSaveSubject}>Save Subject</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
};

export default AdminDashboard;
