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

export interface ClassroomCourseDTO {
  _id?: string;
  classroomId: string;
  courseId: string;
  versionId: string;
  courseName?: string;
  versionName?: string;
  assignedAt: string;
}

// ── Classroom CRUD ────────────────────────────────────────────────────────────

export const classroomApi = {
  createClassroom: (body: { title: string; description?: string; start_date?: string; end_date?: string }) =>
    request<ClassroomDTO>('POST', BASE, body),

  getMyClassrooms: () =>
    request<ClassroomDTO[]>('GET', `${BASE}/my`),

  getClassroom: (id: string) =>
    request<ClassroomDTO>('GET', `${BASE}/${id}`),

  updateClassroom: (id: string, body: { title?: string; description?: string; start_date?: string; end_date?: string }) =>
    request<ClassroomDTO>('PUT', `${BASE}/${id}`, body),

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

  removeCourse: (classroomId: string, courseId: string) =>
    request<void>('DELETE', `${BASE}/${classroomId}/courses/${courseId}`),
};

export const fetchJoinedClassrooms = classroomApi.getJoinedClassrooms;

