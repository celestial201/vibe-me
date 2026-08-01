import React from 'react';
import { TeacherPushCourseModal } from '@/app/pages/teacher/components/TeacherPushCourseModal';

export interface CoursePushModalProps {
  isOpen: boolean;
  onClose: () => void;
  courseId: string;
  courseTitle?: string;
}

export function CoursePushModal(props: CoursePushModalProps) {
  return <TeacherPushCourseModal {...props} />;
}

export default CoursePushModal;
