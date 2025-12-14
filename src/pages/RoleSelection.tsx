import { useState } from 'react';
import { db } from '../lib/firebase';
import { doc, setDoc } from 'firebase/firestore';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { useAuth } from '../contexts/AuthContext';

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

    if (selectedRole) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-background p-4">
                <Card className="max-w-md w-full">
                    <CardHeader>
                        <CardTitle>Complete Your Profile</CardTitle>
                        <CardDescription>
                            You are registering as a <span className="font-bold capitalize">{selectedRole}</span>
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="space-y-2">
                            <label className="text-sm font-medium">Department</label>
                            <select 
                                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
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
                                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                                        placeholder="e.g. 12345"
                                        value={formData.rollNo}
                                        onChange={e => setFormData({...formData, rollNo: e.target.value})}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-sm font-medium">Session Year</label>
                                    <input 
                                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                                        placeholder="e.g. 2025"
                                        value={formData.sessionYear}
                                        onChange={e => setFormData({...formData, sessionYear: e.target.value})}
                                    />
                                </div>
                            </>
                        )}

                        <div className="flex gap-2 pt-4">
                            <Button variant="outline" onClick={() => setSelectedRole(null)} className="flex-1">Back</Button>
                            <Button onClick={handleSaveProfile} disabled={loading} className="flex-1">
                                {loading ? 'Saving...' : 'Complete Registration'}
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            </div>
        );
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-background p-4">
            <div className="max-w-4xl w-full grid gap-8 md:grid-cols-2">
                <Card className="hover:border-primary/50 transition-colors cursor-pointer" onClick={() => setSelectedRole('student')}>
                    <CardHeader>
                        <CardTitle className="text-3xl text-center">Student</CardTitle>
                        <CardDescription className="text-center">Submit projects and view grades</CardDescription>
                    </CardHeader>
                    <CardContent className="flex justify-center pb-8">
                        <div className="h-32 w-32 bg-secondary rounded-full flex items-center justify-center text-4xl">
                            🎓
                        </div>
                    </CardContent>
                    <div className="p-6 pt-0">
                         <Button className="w-full" disabled={loading}>Select Student Role</Button>
                    </div>
                </Card>

                <Card className="hover:border-primary/50 transition-colors cursor-pointer" onClick={() => setSelectedRole('professor')}>
                    <CardHeader>
                        <CardTitle className="text-3xl text-center">Professor</CardTitle>
                        <CardDescription className="text-center">Create subjects and grade submissions</CardDescription>
                    </CardHeader>
                    <CardContent className="flex justify-center pb-8">
                        <div className="h-32 w-32 bg-secondary rounded-full flex items-center justify-center text-4xl">
                            👨‍🏫
                        </div>
                    </CardContent>
                     <div className="p-6 pt-0">
                         <Button className="w-full" variant="outline" disabled={loading}>Select Professor Role</Button>
                    </div>
                </Card>
            </div>
        </div>
    );
};

export default RoleSelection;
