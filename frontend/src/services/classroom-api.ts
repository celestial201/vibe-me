import { useAuthStore } from '../store/auth-store';

const BASE = `${import.meta.env.VITE_BASE_URL}/classroom`;

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem('firebase-auth-token') || useAuthStore.getState().token;
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function request<T>(
  method: string,
  url: string,
  body?: unknown,
): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: authHeaders(),
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error((err as any)?.message ?? `HTTP ${res.status}`);
  }

  // 204 No Content
  if (res.status === 204) return undefined as unknown as T;
  return res.json() as Promise<T>;
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ClassroomDTO {
  _id: string;
  title: string;
  description?: string;
  code: string;
  instructorId: string;
  status: 'active' | 'archived';
  streamPostingPermission?: 'everyone' | 'teacher_only';
  start_date?: string;
  end_date?: string;
  createdAt: string;
  updatedAt: string;
  memberCount?: number;
}

export interface ClassroomMemberDTO {
  _id?: string;
  classroomId: string;
  studentId: string;
  studentName?: string;
  studentEmail?: string;
  joinedAt: string;
}

export interface ClassroomVaultItemDTO {
  _id: string;
  classroom_id: string;
  instructor_id: string;
  title: string;
  type: 'link' | 'pdf' | 'csv' | 'other';
  url: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ClassroomCourseDTO {
  _id?: string;
  classroomId: string;
  courseId: string;
  versionId: string;
  courseName?: string;
  courseDescription?: string;
  versionName?: string;
  assignedAt: string;
  isEnrolled?: boolean;
  progressPercentage?: number;
}

export interface BatchAssignCourseResponseDTO {
  success: boolean;
  assigned: Array<{ classroomId: string; courseId: string; versionId: string }>;
  alreadyAssigned: Array<{ classroomId: string; courseId: string }>;
  failed: Array<{ classroomId: string; reason: string }>;
}

export interface StudentProgressDTO {
  studentId: string;
  studentName: string;
  studentEmail: string;
  isEnrolled: boolean;
  progressPercentage: number;
  completedItemsCount: number;
}

// ── Classroom CRUD ────────────────────────────────────────────────────────────

export const classroomApi = {
  createClassroom: (body: { title: string; description?: string; start_date?: string; end_date?: string }) =>
    request<ClassroomDTO>('POST', BASE, body),

  getMyClassrooms: () =>
    request<ClassroomDTO[]>('GET', `${BASE}/my`),

  getClassroom: (id: string) =>
    request<ClassroomDTO>('GET', `${BASE}/${id}`),

  updateClassroom: (id: string, body: { title?: string; description?: string; streamPostingPermission?: 'everyone' | 'teacher_only'; start_date?: string; end_date?: string }) =>
    request<ClassroomDTO>('PUT', `${BASE}/${id}`, body),

  resetJoinCode: (id: string) =>
    request<ClassroomDTO>('POST', `${BASE}/${id}/reset-code`),

  deleteClassroom: (id: string) =>
    request<void>('DELETE', `${BASE}/${id}`),

  // ── Students ───────────────────────────────────────────────────────────────

  getStudents: (classroomId: string) =>
    request<ClassroomMemberDTO[]>('GET', `${BASE}/${classroomId}/students`),

  joinClassroom: (code: string) =>
    request<ClassroomDTO>('POST', `${BASE}/join`, { code }),

  getJoinedClassrooms: () =>
    request<ClassroomDTO[]>('GET', `${BASE}/joined`),

  // ── Courses ────────────────────────────────────────────────────────────────

  getClassroomCourses: (classroomId: string) =>
    request<ClassroomCourseDTO[]>('GET', `${BASE}/${classroomId}/courses`),

  assignCourse: (classroomId: string, courseId: string, versionId: string) =>
    request<ClassroomCourseDTO>('POST', `${BASE}/${classroomId}/courses`, {
      courseId,
      versionId,
    }),

  batchAssignCourse: (courseId: string, classroomIds: string[]) =>
    request<BatchAssignCourseResponseDTO>('POST', `${BASE}/course-assignments`, {
      courseId,
      classroomIds,
    }),

  startCourse: (classroomId: string, courseId: string) => {
    let cleanId = courseId;
    if (typeof courseId === 'object' && courseId !== null) {
      cleanId = (courseId as any)._id || (courseId as any).courseId || (courseId as any).$oid || (courseId as any).toString?.() || '';
    }
    cleanId = String(cleanId || '').trim();
    if (cleanId === '[object Object]') cleanId = '';
    return request<{ success: boolean; courseId: string; versionId: string }>('POST', `${BASE}/${classroomId}/courses/${cleanId}/start`);
  },

  getCourseProgress: (classroomId: string, courseId: string) =>
    request<StudentProgressDTO[]>('GET', `${BASE}/${classroomId}/courses/${courseId}/progress`),

  removeCourse: (classroomId: string, courseId: string) =>
    request<void>('DELETE', `${BASE}/${classroomId}/courses/${courseId}`),

  // ── Vault ────────────────────────────────────────────────────────────────
  getVaultItems: (id: string) =>
    request<ClassroomVaultItemDTO[]>('GET', `${BASE}/${id}/vault`),

  createVaultItem: (id: string, body: Omit<ClassroomVaultItemDTO, '_id' | 'classroom_id' | 'instructor_id' | 'createdAt' | 'updatedAt'>) =>
    request<ClassroomVaultItemDTO>('POST', `${BASE}/${id}/vault`, body),

  deleteVaultItem: (id: string, itemId: string) =>
    request<{ success: boolean }>('DELETE', `${BASE}/${id}/vault/${itemId}`),
};

export const fetchJoinedClassrooms = classroomApi.getJoinedClassrooms;
