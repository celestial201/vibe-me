import { useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { io, Socket } from 'socket.io-client';
import { classroomLmsApi, AnnouncementDTO, AssignmentDTO, SubmissionDTO } from '@/services/classroom-lms-api';
import { toast } from 'sonner';

const SOCKET_SERVER_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:3141';

let socketInstance: Socket | null = null;

export function getSocketClient(): Socket {
  if (!socketInstance) {
    socketInstance = io(SOCKET_SERVER_URL, {
      autoConnect: true,
      transports: ['websocket', 'polling'],
    });
  }
  return socketInstance;
}

export const LMS_CK = {
  announcements: (classroomId: string) => ['classroom', classroomId, 'announcements'] as const,
  pendingAnnouncements: (classroomId: string) => ['classroom', classroomId, 'announcements', 'pending'] as const,
  assignments: (classroomId: string) => ['classroom', classroomId, 'assignments'] as const,
  submissions: (classroomId: string, assignmentId: string) => ['classroom', classroomId, 'assignments', assignmentId, 'submissions'] as const,
  insights: (classroomId: string, studentId: string) => ['classroom', classroomId, 'students', studentId, 'insights'] as const,
  calendar: (classroomId: string) => ['classroom', classroomId, 'calendar'] as const,
  completedJournals: (classroomId: string) => ['journal-submissions', classroomId] as const,
  notifications: (classroomId?: string) => ['notifications', classroomId || 'global'] as const,
  analyticsRoster: (classroomId: string) => ['classroom', classroomId, 'analytics-roster'] as const,
  myVibeCourses: () => ['my-vibe-courses'] as const,
  enrollmentStatus: (classroomId: string) => ['classroom', classroomId, 'enrollment-status'] as const,
};

// ── Socket.io Real-Time Room Subscription Hooks ───────────────────────────────

export function useClassroomSocket(classroomId: string) {
  const qc = useQueryClient();

  useEffect(() => {
    if (!classroomId) return;
    const socket = getSocketClient();
    socket.emit('join_classroom', classroomId);

    const handleNewAnnouncement = (data: AnnouncementDTO) => {
      qc.setQueryData<AnnouncementDTO[]>(LMS_CK.announcements(classroomId), (old) => {
        if (!old) return [data];
        if (old.some((a) => a._id === data._id)) return old;
        return [data, ...old];
      });
      toast.info(`New announcement from ${data.authorName || 'Teacher'}`);
    };

    const handleStreamUpdated = () => {
      qc.invalidateQueries({ queryKey: LMS_CK.announcements(classroomId) });
      qc.invalidateQueries({ queryKey: LMS_CK.pendingAnnouncements(classroomId) });
    };

    const handleNewAssignment = (data: AssignmentDTO) => {
      qc.invalidateQueries({ queryKey: LMS_CK.assignments(classroomId) });
      toast.info(`New Assignment posted: "${data.title}"`);
    };

    const handleSubmissionStatusChanged = (data: SubmissionDTO) => {
      qc.invalidateQueries({ queryKey: LMS_CK.submissions(classroomId, data.assignment_id) });
      if (data.status === 'returned') {
        toast.success(`Your submission for assignment was graded! Grade: ${data.grade}`);
      } else {
        toast.info(`Submission status updated to ${data.status}`);
      }
    };

    const handleEnrollmentAccepted = () => {
      qc.invalidateQueries({ queryKey: LMS_CK.analyticsRoster(classroomId) });
      qc.invalidateQueries({ queryKey: LMS_CK.enrollmentStatus(classroomId) });
      toast.info(`A student accepted their course enrollment invitation!`);
    };

    socket.on('new_announcement', handleNewAnnouncement);
    socket.on('stream_updated', handleStreamUpdated);
    socket.on('new_assignment', handleNewAssignment);
    socket.on('submission_status_changed', handleSubmissionStatusChanged);
    socket.on('enrollment_accepted', handleEnrollmentAccepted);

    return () => {
      socket.off('new_announcement', handleNewAnnouncement);
      socket.off('stream_updated', handleStreamUpdated);
      socket.off('new_assignment', handleNewAssignment);
      socket.off('submission_status_changed', handleSubmissionStatusChanged);
      socket.off('enrollment_accepted', handleEnrollmentAccepted);
      socket.emit('leave_classroom', classroomId);
    };
  }, [classroomId, qc]);
}

export function useNotificationsSocket(userId?: string) {
  const qc = useQueryClient();

  useEffect(() => {
    if (!userId) return;
    const socket = getSocketClient();
    socket.emit('join_user_room', userId);

    const handleNewNotification = (data: any) => {
      qc.invalidateQueries({ queryKey: LMS_CK.notifications() });
      toast.info(data.message || 'New notification received!');
    };

    socket.on('new_notification', handleNewNotification);

    return () => {
      socket.off('new_notification', handleNewNotification);
      socket.emit('leave_user_room', userId);
    };
  }, [userId, qc]);
}

// ── Announcements ─────────────────────────────────────────────────────────────

export function useGetAnnouncements(classroomId: string) {
  return useQuery({
    queryKey: LMS_CK.announcements(classroomId),
    queryFn: () => classroomLmsApi.getAnnouncements(classroomId),
    enabled: Boolean(classroomId),
  });
}

export function useGetPendingAnnouncements(classroomId: string, isInstructor: boolean = false) {
  return useQuery({
    queryKey: LMS_CK.pendingAnnouncements(classroomId),
    queryFn: () => classroomLmsApi.getPendingAnnouncements(classroomId),
    enabled: !!classroomId && isInstructor === true,
  });
}

export const usePendingAnnouncements = useGetPendingAnnouncements;

export function useModerateAnnouncement(classroomId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ announcementId, action }: { announcementId: string; action: 'approve' | 'reject' }) =>
      classroomLmsApi.moderateAnnouncement(classroomId, announcementId, action),
    onSuccess: (_, variables) => {
      qc.invalidateQueries({ queryKey: LMS_CK.pendingAnnouncements(classroomId) });
      qc.invalidateQueries({ queryKey: LMS_CK.announcements(classroomId) });
      toast.success(`Announcement ${variables.action === 'approve' ? 'approved' : 'rejected'}`);
    },
    onError: (err: any) => toast.error(err.message || 'Failed to moderate announcement'),
  });
}

export function useCreateAnnouncement(classroomId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ content, files }: { content: string; files: File[] }) =>
      classroomLmsApi.createAnnouncement(classroomId, content, files),
    onSuccess: (data) => {
      if (data.status === 'pending') {
        toast.info('Sent to teacher for approval.');
        qc.invalidateQueries({ queryKey: LMS_CK.pendingAnnouncements(classroomId) });
      } else {
        qc.setQueryData<AnnouncementDTO[]>(LMS_CK.announcements(classroomId), (old) => {
          if (!old) return [data];
          if (old.some((a) => a._id === data._id)) return old;
          return [data, ...old];
        });
        toast.success('Announcement posted!');
      }
    },
    onError: (err: any) => toast.error(err.message || 'Failed to post announcement'),
  });
}

// ── Assignments ─────────────────────────────────────────────────────────────

export function useGetAssignments(classroomId: string) {
  return useQuery({
    queryKey: LMS_CK.assignments(classroomId),
    queryFn: () => classroomLmsApi.getAssignments(classroomId),
    enabled: Boolean(classroomId),
  });
}

export function useCreateAssignment(classroomId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      data,
      files,
    }: {
      data: { title: string; instructions?: string; description?: string; points?: number; dueDate?: string; due_date?: string };
      files: File[];
    }) => classroomLmsApi.createAssignment(classroomId, data, files),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: LMS_CK.assignments(classroomId) });
      toast.success('Assignment created!');
    },
    onError: (err: any) => toast.error(err.message || 'Failed to create assignment'),
  });
}

// ── Submissions & Grading ───────────────────────────────────────────────────

export function useSubmitAssignment(classroomId: string, assignmentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (files: File[]) => classroomLmsApi.submitAssignment(classroomId, assignmentId, files),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: LMS_CK.assignments(classroomId) });
      qc.invalidateQueries({ queryKey: LMS_CK.submissions(classroomId, assignmentId) });
      toast.success('Assignment turned in successfully!');
    },
    onError: (err: any) => toast.error(err.message || 'Failed to turn in assignment'),
  });
}

export function useGetSubmissions(classroomId: string, assignmentId: string) {
  return useQuery({
    queryKey: LMS_CK.submissions(classroomId, assignmentId),
    queryFn: () => classroomLmsApi.getSubmissionsByAssignment(classroomId, assignmentId),
    enabled: Boolean(classroomId && assignmentId),
  });
}

export function useGradeSubmission(classroomId: string, assignmentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ submissionId, grade, feedback }: { submissionId: string; grade: number; feedback?: string }) =>
      classroomLmsApi.gradeSubmission(classroomId, submissionId, grade, feedback),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: LMS_CK.submissions(classroomId, assignmentId) });
      toast.success('Submission graded and returned!');
    },
    onError: (err: any) => toast.error(err.message || 'Failed to grade submission'),
  });
}

// ── Student Insights ─────────────────────────────────────────────────────────

export function useGetStudentInsights(classroomId: string, studentId: string) {
  return useQuery({
    queryKey: LMS_CK.insights(classroomId, studentId),
    queryFn: () => classroomLmsApi.getStudentInsights(classroomId, studentId),
    enabled: Boolean(classroomId && studentId),
  });
}

// ── Internship Journey Calendar Hooks ───────────────────────────────────────

export function useGetInternshipCalendar(classroomId: string) {
  return useQuery({
    queryKey: LMS_CK.calendar(classroomId),
    queryFn: () => classroomLmsApi.getInternshipCalendar(classroomId),
    enabled: Boolean(classroomId),
  });
}

export function useUpsertDailyJournal(classroomId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      dayNumber,
      data,
    }: {
      dayNumber: number;
      data: { title?: string; content_link?: string; journal_entry?: string };
    }) => classroomLmsApi.upsertDailyJournal(classroomId, dayNumber, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: LMS_CK.calendar(classroomId) });
      toast.success('Daily journal updated!');
    },
    onError: (err: any) => toast.error(err.message || 'Failed to update daily journal'),
  });
}

export function useGetCompletedJournals(classroomId: string) {
  return useQuery({
    queryKey: LMS_CK.completedJournals(classroomId),
    queryFn: async () => {
      const res = await classroomLmsApi.getCompletedJournals(classroomId);
      return res.completedDays || [];
    },
    enabled: Boolean(classroomId),
  });
}

export function useMarkJournalComplete(classroomId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dayNumber: number) => classroomLmsApi.markJournalComplete(classroomId, dayNumber),
    onSuccess: (_, dayNumber) => {
      qc.setQueryData<number[]>(LMS_CK.completedJournals(classroomId), (old = []) => {
        return old.includes(dayNumber) ? old : [...old, dayNumber];
      });
      qc.invalidateQueries({ queryKey: LMS_CK.completedJournals(classroomId) });
      toast.success(`Day ${dayNumber} journal marked as filled!`);
    },
    onError: (err: any) => toast.error(err.message || 'Failed to mark journal as filled'),
  });
}

// ── Notifications Hooks ──────────────────────────────────────────────────────

export function useGetNotifications(classroomId?: string) {
  return useQuery({
    queryKey: LMS_CK.notifications(classroomId),
    queryFn: () => classroomLmsApi.getNotifications(classroomId),
    refetchInterval: 30000,
  });
}

export function useMarkNotificationRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => classroomLmsApi.markNotificationRead(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: LMS_CK.notifications() });
    },
  });
}

// ── Push Course & Student Analytics Hooks ────────────────────────────────────

export function useGetMyVibeCourses() {
  return useQuery({
    queryKey: LMS_CK.myVibeCourses(),
    queryFn: () => classroomLmsApi.getMyVibeCourses(),
  });
}

export function usePushCourseToClassroom(classroomId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: { courseId: string; versionId?: string; sendEmails?: boolean }) =>
      classroomLmsApi.pushCourseToClassroom(classroomId, payload),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: LMS_CK.analyticsRoster(classroomId) });
      toast.success(`Course successfully pushed to ${res.enrolledCount} classroom student(s)!`);
    },
    onError: (err: any) => toast.error(err.message || 'Failed to push course to classroom'),
  });
}

export function useGetStudentAnalyticsRoster(classroomId: string) {
  return useQuery({
    queryKey: LMS_CK.analyticsRoster(classroomId),
    queryFn: () => classroomLmsApi.getStudentAnalyticsRoster(classroomId),
    enabled: Boolean(classroomId),
  });
}

export function useAcceptCourseEnrollment(classroomId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (courseId: string) => classroomLmsApi.acceptCourseEnrollment(classroomId, courseId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: LMS_CK.analyticsRoster(classroomId) });
      qc.invalidateQueries({ queryKey: LMS_CK.enrollmentStatus(classroomId) });
      qc.invalidateQueries({ queryKey: ['enrollments'] });
      qc.invalidateQueries({ queryKey: ['user-enrollments'] });
      qc.invalidateQueries({ queryKey: ['classroom-courses'] });
      toast.success('Course invitation accepted! Added to your My Courses panel.');
    },
    onError: (err: any) => toast.error(err.message || 'Failed to accept course enrollment'),
  });
}


export function useGetStudentEnrollmentStatus(classroomId: string) {
  return useQuery({
    queryKey: LMS_CK.enrollmentStatus(classroomId),
    queryFn: () => classroomLmsApi.getStudentEnrollmentStatus(classroomId),
    enabled: Boolean(classroomId),
  });
}
