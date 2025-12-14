export interface UserProfile {
    uid: string;
    email: string;
    name: string;
    role: 'student' | 'professor';
    department?: string;
    semester?: string;
    section?: string;
}

export interface Subject {
    id: string;
    name: string;
    code: string;
    professorId: string;
    department: string;
    semester: string;
    section: string;
    createdAt: any;
}

export interface Submission {
    id: string;
    studentId: string;
    studentName: string;
    subjectId: string;
    subjectName: string;
    originalFilePath: string;
    mergedFilePath?: string;
    summary?: string;
    questions?: string[]; // Array of strings for questions
    status: 'pending' | 'processing' | 'submitted' | 'reviewed';
    timeslot?: string;
    marks?: number;
    professorSignature?: boolean;
    suggested_marks?: number;
    creativity_analysis?: string;
    justification?: string;
    department?: string;
    rollNo?: string;
    sessionYear?: string;
    createdAt: any;
}
