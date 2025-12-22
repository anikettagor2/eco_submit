import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { useAuth } from "@/contexts/AuthContext"
import { User, Mail, Building, Hash, Calendar } from "lucide-react"

export function ProfileDialog({ open, onOpenChange }: { open: boolean, onOpenChange: (open: boolean) => void }) {
    const { userData } = useAuth(); // Assume AuthContext is available
    if (!userData) return null;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>User Profile</DialogTitle>
                    <DialogDescription>Your account details.</DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                    <div className="flex items-center gap-3">
                        <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-lg border">
                            {userData.name?.charAt(0).toUpperCase() || "U"}
                        </div>
                        <div>
                            <p className="font-medium text-lg">{userData.name}</p>
                            <p className="text-sm text-muted-foreground capitalize flex items-center gap-1">
                                <User className="h-3 w-3" /> {userData.role}
                            </p>
                        </div>
                    </div>
                    
                    <div className="grid gap-4 border-t pt-4">
                        <div className="flex items-center gap-3 text-sm">
                            <Mail className="h-4 w-4 text-muted-foreground" />
                            <span>{userData.email}</span>
                        </div>
                        {userData.department && (
                            <div className="flex items-center gap-3 text-sm">
                                <Building className="h-4 w-4 text-muted-foreground" />
                                <span>{userData.department}</span>
                            </div>
                        )}
                        {userData.rollNo && (
                            <div className="flex items-center gap-3 text-sm">
                                <Hash className="h-4 w-4 text-muted-foreground" />
                                <span>Roll No: {userData.rollNo}</span>
                            </div>
                        )}
                         {userData.sessionYear && (
                            <div className="flex items-center gap-3 text-sm">
                                <Calendar className="h-4 w-4 text-muted-foreground" />
                                <span>Session: {userData.sessionYear}</span>
                            </div>
                        )}
                        {userData.semester && (
                            <div className="flex items-center gap-3 text-sm">
                                <Calendar className="h-4 w-4 text-muted-foreground" />
                                <span>Semester: {userData.semester}</span>
                            </div>
                        )}
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    )
}
