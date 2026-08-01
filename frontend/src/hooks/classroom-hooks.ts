/**
 * classroom-hooks.ts
 * React Query hooks for the Onboarding Classroom feature.
 * Uses classroom-api.ts — does NOT modify hooks.ts.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { classroomApi, ClassroomDTO, ClassroomMemberDTO, ClassroomCourseDTO, ClassroomVaultItemDTO } from '@/services/classroom-api';
import { toast } from 'sonner';

// ── Query keys ─────────────────────────────────────────────────────────────────

export const CK = {
  myClassrooms: ['classrooms', 'my'] as const,
  joinedClassrooms: ['classrooms', 'joined'] as const,
  classroom: (id: string) => ['classroom', id] as const,
  students: (id: string) => ['classroom-students', id] as const,
  courses: (id: string) => ['classroom-courses', id] as const,
  vault: (id: string) => ['classroom-vault', id] as const,
};

// ── Teacher — Classroom CRUD ──────────────────────────────────────────────────

export function useGetMyClassrooms(enabled = true) {
  return useQuery<ClassroomDTO[]>({
    queryKey: CK.myClassrooms,
    queryFn: () => classroomApi.getMyClassrooms(),
    enabled,
    staleTime: 30_000,
  });
}

export const useGetClassrooms = useGetMyClassrooms;
export const useGetClassroomDetails = useGetClassroom;

export function useGetClassroom(id: string, enabled = true) {
  return useQuery<ClassroomDTO>({
    queryKey: CK.classroom(id),
    queryFn: () => classroomApi.getClassroom(id),
    enabled: enabled && !!id,
    staleTime: 30_000,
  });
}

export function useCreateClassroom() {
  const qc = useQueryClient();
  return useMutation<ClassroomDTO, Error, { title: string; description?: string }>({
    mutationFn: (body) => classroomApi.createClassroom(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: CK.myClassrooms });
      toast.success('Classroom created successfully!');
    },
    onError: (e) => toast.error(e.message ?? 'Failed to create classroom'),
  });
}

export function useUpdateClassroom(id: string) {
  const qc = useQueryClient();
  return useMutation<ClassroomDTO, Error, { title?: string; description?: string; streamPostingPermission?: 'everyone' | 'teacher_only' }>({
    mutationFn: (body) => classroomApi.updateClassroom(id, body),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: CK.myClassrooms });
      qc.setQueryData(CK.classroom(id), data);
      toast.success('Classroom updated!');
    },
    onError: (e) => toast.error(e.message ?? 'Failed to update classroom'),
  });
}

export function useResetJoinCode(id: string) {
  const qc = useQueryClient();
  return useMutation<ClassroomDTO, Error, void>({
    mutationFn: () => classroomApi.resetJoinCode(id),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: CK.myClassrooms });
      qc.setQueryData(CK.classroom(id), data);
      toast.success('Classroom join code regenerated!');
    },
    onError: (e) => toast.error(e.message ?? 'Failed to reset join code'),
  });
}

export function useDeleteClassroom() {
  const qc = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: (id) => classroomApi.deleteClassroom(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: CK.myClassrooms });
      toast.success('Classroom deleted');
    },
    onError: (e) => toast.error(e.message ?? 'Failed to delete classroom'),
  });
}

// ── Teacher — Students ────────────────────────────────────────────────────────

export function useGetClassroomStudents(classroomId: string, enabled = true) {
  return useQuery<ClassroomMemberDTO[]>({
    queryKey: CK.students(classroomId),
    queryFn: () => classroomApi.getStudents(classroomId),
    enabled: enabled && !!classroomId,
    staleTime: 30_000,
  });
}

// ── Teacher — Courses ─────────────────────────────────────────────────────────

export function useGetClassroomCourses(classroomId: string, enabled = true) {
  return useQuery<ClassroomCourseDTO[]>({
    queryKey: CK.courses(classroomId),
    queryFn: () => classroomApi.getClassroomCourses(classroomId),
    enabled: enabled && !!classroomId,
    staleTime: 30_000,
  });
}

export function useAssignCourse(classroomId: string) {
  const qc = useQueryClient();
  return useMutation<ClassroomCourseDTO, Error, { courseId: string; versionId: string }>({
    mutationFn: ({ courseId, versionId }) =>
      classroomApi.assignCourse(classroomId, courseId, versionId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: CK.courses(classroomId) });
      toast.success('Course assigned');
    },
    onError: (e) => toast.error(e.message ?? 'Failed to assign course'),
  });
}

export function useRemoveCourse(classroomId: string) {
  const qc = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: (courseId) => classroomApi.removeCourse(classroomId, courseId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: CK.courses(classroomId) });
      toast.success('Course removed');
    },
    onError: (e) => toast.error(e.message ?? 'Failed to remove course'),
  });
}

// ── Student ───────────────────────────────────────────────────────────────────

export function useJoinClassroom() {
  const qc = useQueryClient();
  return useMutation<ClassroomDTO, Error, string>({
    mutationFn: (code) => classroomApi.joinClassroom(code),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: CK.joinedClassrooms });
      toast.success('Joined classroom!');
    },
    onError: (e) => toast.error(e.message ?? 'Failed to join classroom'),
  });
}

export function useGetJoinedClassrooms(enabled = true) {
  return useQuery<ClassroomDTO[]>({
    queryKey: CK.joinedClassrooms,
    queryFn: () => classroomApi.getJoinedClassrooms(),
    enabled,
    staleTime: 30_000,
  });
}

export function useGetStudentClassroomCourses(classroomId: string, enabled = true) {
  return useQuery<ClassroomCourseDTO[]>({
    queryKey: CK.courses(classroomId),
    queryFn: () => classroomApi.getClassroomCourses(classroomId),
    enabled: enabled && !!classroomId,
    staleTime: 30_000,
  });
}

export function useBatchAssignCourse() {
  const qc = useQueryClient();
  return useMutation<
    import('@/services/classroom-api').BatchAssignCourseResponseDTO,
    Error,
    { courseId: string; classroomIds: string[] }
  >({
    mutationFn: ({ courseId, classroomIds }) => classroomApi.batchAssignCourse(courseId, classroomIds),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['classrooms'] });
      qc.invalidateQueries({ queryKey: ['classroom-courses'] });
      if (res.assigned.length > 0 && res.alreadyAssigned.length > 0) {
        toast.success(`Course assigned to ${res.assigned.length} Classroom(s). It was already assigned to ${res.alreadyAssigned.length} Classroom(s).`);
      } else if (res.assigned.length > 0) {
        toast.success(`Course assigned successfully to ${res.assigned.length} Classroom(s).`);
      } else if (res.alreadyAssigned.length > 0) {
        toast.info(`This course is already assigned to all selected Classroom(s).`);
      }
    },
    onError: (e) => toast.error(e.message ?? 'Failed to assign course to classrooms'),
  });
}

export function useStartClassroomCourse(classroomId: string) {
  const qc = useQueryClient();
  return useMutation<{ success: boolean; courseId: string; versionId: string }, Error, string>({
    mutationFn: (courseId) => classroomApi.startCourse(classroomId, courseId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: CK.courses(classroomId) });
      qc.invalidateQueries({ queryKey: ['enrollments'] });
      qc.invalidateQueries({ queryKey: ['user-enrollments'] });
      qc.invalidateQueries({ queryKey: ['classroom-courses'] });
      qc.invalidateQueries({ queryKey: ['announcements', classroomId] });
      qc.invalidateQueries({ queryKey: ['student-enrollment-status', classroomId] });
      toast.success('Course started! Added to your My Courses panel.');
    },
    onError: (e) => toast.error(e.message ?? 'Failed to start course'),
  });
}


export function useGetClassroomCourseProgress(classroomId: string, courseId: string, enabled = true) {
  return useQuery<import('@/services/classroom-api').StudentProgressDTO[]>({
    queryKey: ['classroom-course-progress', classroomId, courseId],
    queryFn: () => classroomApi.getCourseProgress(classroomId, courseId),
    enabled: enabled && !!classroomId && !!courseId,
    refetchInterval: 12_000,
  });
}


// ── Vault ───────────────────────────────────────────────────────────────────

export function useGetVaultItems(classroomId: string) {
  return useQuery<ClassroomVaultItemDTO[]>({
    queryKey: CK.vault(classroomId),
    queryFn: () => classroomApi.getVaultItems(classroomId),
    enabled: !!classroomId,
  });
}

export function useCreateVaultItem(classroomId: string) {
  const qc = useQueryClient();
  return useMutation<ClassroomVaultItemDTO, Error, Omit<ClassroomVaultItemDTO, '_id' | 'classroom_id' | 'instructor_id' | 'createdAt' | 'updatedAt'>>({
    mutationFn: (body) => classroomApi.createVaultItem(classroomId, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: CK.vault(classroomId) });
      toast.success('Added to vault!');
    },
    onError: (err) => {
      toast.error(err.message || 'Failed to add item');
    },
  });
}

export function useDeleteVaultItem(classroomId: string) {
  const qc = useQueryClient();
  return useMutation<{ success: boolean }, Error, string>({
    mutationFn: (itemId) => classroomApi.deleteVaultItem(classroomId, itemId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: CK.vault(classroomId) });
      toast.success('Vault item removed!');
    },
    onError: (err) => {
      toast.error(err.message || 'Failed to remove item');
    },
  });
}
