import { openapi } from '@/lib/openapi';

const BASE_URL = import.meta.env.VITE_BASE_URL || 'http://localhost:3141/api';

export interface AnnouncementDTO {
  _id: string;
  classroom_id: string;
  author_id: string;
  authorName?: string;
  content: string;
  attachments?: string[];
  createdAt: string;
  updatedAt: string;
}

export interface AssignmentDTO {
  _id: string;
  classroom_id: string;
  instructor_id: string;
  title: string;
  description?: string;
  points: number;
  due_date: string;
  attachments?: string[];
  createdAt: string;
  updatedAt: string;
}

export interface SubmissionDTO {
  _id: string;
  assignment_id: string;
  classroom_id: string;
  student_id: string;
  studentName?: string;
  studentEmail?: string;
  status: 'pending' | 'submitted' | 'graded' | 'returned';
  submitted_files?: string[];
  grade?: number;
  teacher_feedback?: string;
  submitted_at?: string;
  graded_at?: string;
}

export interface StudentInsightSubmissionDTO {
  assignmentId: string;
  assignmentTitle: string;
  points: number;
  dueDate: string;
  status: 'pending' | 'submitted' | 'graded' | 'returned';
  grade?: number;
  submittedAt?: string;
}

export interface StudentInsightsDTO {
  studentId: string;
  studentName: string;
  studentEmail: string;
  totalAssignments: number;
  submittedCount: number;
  missingCount: number;
  gradedCount: number;
  averageGrade: number;
  submissions: StudentInsightSubmissionDTO[];
}

export interface DailyJournalDTO {
  _id?: string;
  classroom_id: string;
  day_number: number;
  date: string;
  title?: string;
  content_link?: string;
  journal_entry?: string;
  updatedAt?: string;
}

export interface InternshipCalendarDayDTO {
  day_number: number;
  date: string;
  journal?: DailyJournalDTO | null;
}

export interface InternshipCalendarDTO {
  classroom_id: string;
  internship_start_date: string;
  internship_end_date: string;
  days: InternshipCalendarDayDTO[];
}

export interface NotificationDTO {
  _id: string;
  user_id: string;
  classroom_id?: string;
  type: 'new_assignment' | 'new_announcement' | 'approval_request' | 'due_soon';
  message: string;
  link: string;
  is_read: boolean;
  createdAt: string;
}

function getAuthHeaders() {
  const token = localStorage.getItem('firebase-auth-token') || localStorage.getItem('auth-store');
  return {
    Authorization: token ? `Bearer ${token}` : '',
  };
}

export const classroomLmsApi = {
  // Stream / Announcements
  getAnnouncements: async (classroomId: string): Promise<AnnouncementDTO[]> => {
    const res = await fetch(`${BASE_URL}/classroom/${classroomId}/announcements`, {
      headers: getAuthHeaders(),
    });
    if (!res.ok) throw new Error('Failed to fetch announcements');
    return res.json();
  },

  getPendingAnnouncements: async (classroomId: string): Promise<AnnouncementDTO[]> => {
    const res = await fetch(`${BASE_URL}/classroom/${classroomId}/announcements/pending`, {
      headers: getAuthHeaders(),
    });
    if (!res.ok) throw new Error('Failed to fetch pending announcements');
    return res.json();
  },

  moderateAnnouncement: async (
    classroomId: string,
    announcementId: string,
    action: 'approve' | 'reject'
  ): Promise<AnnouncementDTO> => {
    const res = await fetch(`${BASE_URL}/classroom/${classroomId}/announcements/${announcementId}/moderate`, {
      method: 'PATCH',
      headers: {
        ...getAuthHeaders(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ action }),
    });
    if (!res.ok) throw new Error('Failed to moderate announcement');
    return res.json();
  },

  createAnnouncement: async (classroomId: string, content: string, files: File[]): Promise<AnnouncementDTO & { status?: string }> => {
    const formData = new FormData();
    formData.append('content', content);
    files.forEach(f => formData.append('files', f));

    const res = await fetch(`${BASE_URL}/classroom/${classroomId}/announcements`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: formData,
    });
    if (!res.ok) throw new Error('Failed to post announcement');
    return res.json();
  },

  // Classwork / Assignments
  getAssignments: async (classroomId: string): Promise<AssignmentDTO[]> => {
    const res = await fetch(`${BASE_URL}/classroom/${classroomId}/assignments`, {
      headers: getAuthHeaders(),
    });
    if (!res.ok) throw new Error('Failed to fetch assignments');
    return res.json();
  },

  createAssignment: async (
    classroomId: string,
    data: { title: string; instructions?: string; description?: string; points?: number; dueDate?: string; due_date?: string },
    attachments: File[],
  ): Promise<AssignmentDTO> => {
    const formData = new FormData();
    formData.append('title', data.title);
    const instructions = data.instructions || data.description || '';
    if (instructions) {
      formData.append('instructions', instructions);
      formData.append('description', instructions);
    }
    if (data.points !== undefined) formData.append('points', String(data.points));
    const due = data.dueDate || data.due_date || '';
    formData.append('dueDate', due);
    formData.append('due_date', due);
    (attachments || []).forEach(f => {
      formData.append('attachments', f);
      formData.append('files', f);
    });

    const res = await fetch(`${BASE_URL}/classroom/${classroomId}/assignments`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: formData,
    });
    if (!res.ok) throw new Error('Failed to create assignment');
    return res.json();
  },

  // Submissions & Grading
  submitAssignment: async (
    classroomId: string,
    assignmentId: string,
    files: File[],
  ): Promise<SubmissionDTO> => {
    const formData = new FormData();
    files.forEach(f => formData.append('files', f));

    const res = await fetch(
      `${BASE_URL}/classroom/${classroomId}/assignments/${assignmentId}/submit`,
      {
        method: 'POST',
        headers: getAuthHeaders(),
        body: formData,
      },
    );
    if (!res.ok) throw new Error('Failed to submit assignment');
    return res.json();
  },

  getSubmissionsByAssignment: async (
    classroomId: string,
    assignmentId: string,
  ): Promise<SubmissionDTO[]> => {
    const res = await fetch(
      `${BASE_URL}/classroom/${classroomId}/assignments/${assignmentId}/submissions`,
      {
        headers: getAuthHeaders(),
      },
    );
    if (!res.ok) throw new Error('Failed to fetch submissions');
    return res.json();
  },

  gradeSubmission: async (
    classroomId: string,
    submissionId: string,
    grade: number,
    feedback?: string,
  ): Promise<SubmissionDTO> => {
    const res = await fetch(
      `${BASE_URL}/classroom/${classroomId}/submissions/${submissionId}/grade`,
      {
        method: 'PATCH',
        headers: {
          ...getAuthHeaders(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ grade, teacher_feedback: feedback }),
      },
    );
    if (!res.ok) throw new Error('Failed to grade submission');
    return res.json();
  },

  // Student Insights
  getStudentInsights: async (
    classroomId: string,
    studentId: string,
  ): Promise<StudentInsightsDTO> => {
    const res = await fetch(
      `${BASE_URL}/classroom/${classroomId}/students/${studentId}/insights`,
      {
        headers: getAuthHeaders(),
      },
    );
    if (!res.ok) throw new Error('Failed to fetch student insights');
    return res.json();
  },

  // Internship Calendar & Journals
  getInternshipCalendar: async (classroomId: string): Promise<InternshipCalendarDTO> => {
    const res = await fetch(`${BASE_URL}/classroom/${classroomId}/calendar`, {
      headers: getAuthHeaders(),
    });
    if (!res.ok) throw new Error('Failed to fetch internship calendar');
    return res.json();
  },

  upsertDailyJournal: async (
    classroomId: string,
    dayNumber: number,
    data: { title?: string; content_link?: string; journal_entry?: string }
  ): Promise<DailyJournalDTO> => {
    const res = await fetch(`${BASE_URL}/classroom/${classroomId}/calendar/journal`, {
      method: 'POST',
      headers: {
        ...getAuthHeaders(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ day_number: dayNumber, ...data }),
    });
    if (!res.ok) throw new Error('Failed to update daily journal');
    return res.json();
  },

  markJournalComplete: async (
    classroomId: string,
    dayNumber: number,
  ): Promise<{ success: boolean; submission: any }> => {
    const res = await fetch(`${BASE_URL}/classroom/${classroomId}/journal/${dayNumber}/complete`, {
      method: 'POST',
      headers: getAuthHeaders(),
    });
    if (!res.ok) throw new Error('Failed to mark journal as filled');
    return res.json();
  },

  getCompletedJournals: async (classroomId: string): Promise<{ completedDays: number[] }> => {
    const res = await fetch(`${BASE_URL}/classroom/${classroomId}/journal/completed`, {
      headers: getAuthHeaders(),
    });
    if (!res.ok) throw new Error('Failed to fetch completed journals');
    return res.json();
  },

  // Notifications
  getNotifications: async (classroomId?: string): Promise<NotificationDTO[]> => {
    const url = classroomId
      ? `${BASE_URL}/notifications?classroomId=${encodeURIComponent(classroomId)}`
      : `${BASE_URL}/notifications`;
    const res = await fetch(url, {
      headers: getAuthHeaders(),
    });
    if (!res.ok) throw new Error('Failed to fetch notifications');
    return res.json();
  },

  markNotificationRead: async (id: string): Promise<void> => {
    const res = await fetch(`${BASE_URL}/notifications/${id}/read`, {
      method: 'PATCH',
      headers: getAuthHeaders(),
    });
    if (!res.ok) throw new Error('Failed to mark notification as read');
  },

  // Push Course & Student Analytics
  getMyVibeCourses: async (): Promise<VibeCourseDTO[]> => {
    const res = await fetch(`${BASE_URL}/courses/my-courses`, {
      headers: getAuthHeaders(),
    });
    if (!res.ok) throw new Error('Failed to fetch instructor Vibe courses');
    return res.json();
  },

  pushCourseToClassroom: async (classroomId: string, payload: PushCoursePayload): Promise<{ success: boolean; enrolledCount: number }> => {
    const res = await fetch(`${BASE_URL}/classroom/${classroomId}/push-course`, {
      method: 'POST',
      headers: {
        ...getAuthHeaders(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error('Failed to push course to classroom');
    return res.json();
  },

  getStudentAnalyticsRoster: async (classroomId: string): Promise<StudentAnalyticsRosterDTO[]> => {
    const res = await fetch(`${BASE_URL}/classroom/${classroomId}/students/analytics`, {
      headers: getAuthHeaders(),
    });
    if (!res.ok) throw new Error('Failed to fetch student analytics roster');
    return res.json();
  },

  acceptCourseEnrollment: async (classroomId: string, courseId: string): Promise<{ success: boolean }> => {
    const res = await fetch(`${BASE_URL}/classroom/${classroomId}/courses/${courseId}/accept`, {
      method: 'POST',
      headers: getAuthHeaders(),
    });
    if (!res.ok) throw new Error('Failed to accept course enrollment');
    return res.json();
  },

  getStudentEnrollmentStatus: async (classroomId: string): Promise<{ courseId: string; accepted: boolean; status: string; enrolledAt: string }[]> => {
    const res = await fetch(`${BASE_URL}/classroom/${classroomId}/enrollment-status`, {
      headers: getAuthHeaders(),
    });
    if (!res.ok) throw new Error('Failed to fetch enrollment status');
    return res.json();
  },
};

export interface StudentAnalyticsRosterDTO {
  studentId: string;
  name: string;
  email: string;
  joiningDate: string;
  courseAccepted: 'accepted' | 'pending';
  courseProgress: number;
  submissionCount: number;
  flaggedCount: number;
  queriesCount: number;
  submissionsList: StudentInsightSubmissionDTO[];
}

export interface VibeCourseDTO {
  _id: string;
  name: string;
  description?: string;
}

export interface PushCoursePayload {
  courseId: string;
  versionId?: string;
  sendEmails?: boolean;
}
