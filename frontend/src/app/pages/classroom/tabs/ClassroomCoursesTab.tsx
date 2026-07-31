import React, { useState } from 'react';
import { useGetClassroomCourses } from '@/hooks/classroom-hooks';
import { useGetStudentEnrollmentStatus } from '@/hooks/classroom-lms-hooks';
import { PushCourseModal } from '../components/PushCourseModal';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { BookOpen, Plus, Play, CheckCircle2, Trash2, Award, Sparkles, Loader2 } from 'lucide-react';
import { useNavigate } from '@tanstack/react-router';
import { classroomApi } from '@/services/classroom-api';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { useCourseStore } from '@/store/course-store';

interface Props {
  classroomId: string;
  isInstructor?: boolean;
}

export function ClassroomCoursesTab({ classroomId, isInstructor = false }: Props) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { setCurrentCourse } = useCourseStore();
  const { data: courses, isLoading } = useGetClassroomCourses(classroomId);
  const { data: enrollmentStatusList } = useGetStudentEnrollmentStatus(classroomId);

  const [isPushModalOpen, setIsPushModalOpen] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const handleOpenCourse = (courseId: string, versionId?: string) => {
    setCurrentCourse({
      courseId,
      versionId: versionId || courseId,
      moduleId: null,
      sectionId: null,
      itemId: null,
      watchItemId: null,
    });
    navigate({ to: '/student/learn' });
  };

  const handleRemoveCourse = async (courseId: string) => {
    if (!window.confirm('Are you sure you want to remove this course from the classroom?')) return;
    try {
      setRemovingId(courseId);
      await classroomApi.removeCourse(classroomId, courseId);
      toast.success('Course removed from classroom');
      qc.invalidateQueries({ queryKey: ['classroom-courses', classroomId] });
    } catch (err: any) {
      toast.error(err.message || 'Failed to remove course');
    } finally {
      setRemovingId(null);
    }
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Header Actions */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold tracking-tight text-foreground flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-primary" />
            Classroom Courses
          </h2>
          <p className="text-xs text-muted-foreground">
            Courses assigned by the instructor to this cohort with real-time progress tracking.
          </p>
        </div>

        {isInstructor && (
          <Button onClick={() => setIsPushModalOpen(true)} size="sm" className="gap-1.5 shadow-xs">
            <Plus className="w-4 h-4" />
            Push Course to Classroom
          </Button>
        )}
      </div>

      {/* Courses List */}
      {isLoading ? (
        <div className="text-center py-12 text-sm text-muted-foreground flex items-center justify-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin text-primary" />
          Loading classroom courses...
        </div>
      ) : !courses || courses.length === 0 ? (
        <Card className="border border-dashed py-12 text-center bg-card">
          <CardContent className="space-y-3">
            <div className="w-12 h-12 rounded-full bg-primary/10 text-primary flex items-center justify-center mx-auto">
              <BookOpen className="w-6 h-6" />
            </div>
            <h3 className="text-sm font-semibold text-foreground">No Courses Pushed Yet</h3>
            <p className="text-xs text-muted-foreground max-w-sm mx-auto">
              {isInstructor
                ? 'Push courses from your published Vibe catalog directly to all cohort students.'
                : 'Your instructor has not pushed any courses to this classroom yet.'}
            </p>
            {isInstructor && (
              <Button onClick={() => setIsPushModalOpen(true)} size="sm" className="gap-1.5 mt-2">
                <Plus className="w-4 h-4" />
                Push First Course
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {courses.map((course) => {
            const courseIdStr = course.courseId || (course as any)._id || '';
            const statusDoc = enrollmentStatusList?.find(
              (s) => String(s.courseId || (s as any).course_id) === String(courseIdStr)
            );

            const percentCompleted = statusDoc?.progress_percentage ?? course.progressPercentage ?? 0;
            const isCompleted = percentCompleted >= 100;

            return (
              <Card
                key={course._id || course.courseId}
                className="border border-border/60 shadow-xs hover:border-border transition bg-card flex flex-col justify-between"
              >
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <CardTitle className="text-base font-bold text-foreground">
                        {course.courseName || 'Classroom Course'}
                      </CardTitle>
                      {course.courseDescription && (
                        <CardDescription className="text-xs text-muted-foreground line-clamp-2 mt-1">
                          {course.courseDescription}
                        </CardDescription>
                      )}
                    </div>
                    {isCompleted ? (
                      <Badge className="bg-emerald-600 text-white text-[10px] px-2 py-0.5 flex items-center gap-1 shrink-0">
                        <CheckCircle2 className="w-3 h-3" />
                        Completed ■
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-[10px] border-primary/40 text-primary shrink-0">
                        Active Course
                      </Badge>
                    )}
                  </div>
                </CardHeader>

                <CardContent className="space-y-4 pt-0">
                  {/* Progress Bar */}
                  <div className="space-y-1.5 bg-muted/30 p-3 rounded-lg border border-border/40">
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-muted-foreground font-medium">Cohort Completion</span>
                      <span className="font-bold text-foreground">{Math.round(percentCompleted)}%</span>
                    </div>
                    <Progress value={percentCompleted} className="h-2" />
                  </div>

                  {/* Actions */}
                  <div className="flex items-center justify-between pt-1">
                    <Button
                      size="sm"
                      onClick={() => handleOpenCourse(courseIdStr, course.versionId)}
                      className="gap-1.5 text-xs"
                    >
                      <Play className="w-3.5 h-3.5" />
                      {isCompleted ? 'Review Course' : 'Continue Course'}
                    </Button>

                    {isInstructor && (
                      <Button
                        size="xs"
                        variant="ghost"
                        className="text-destructive hover:bg-destructive/10 hover:text-destructive h-8 px-2"
                        onClick={() => handleRemoveCourse(courseIdStr)}
                        disabled={removingId === courseIdStr}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Push Course Modal */}
      <PushCourseModal
        classroomId={classroomId}
        isOpen={isPushModalOpen}
        onClose={() => setIsPushModalOpen(false)}
      />
    </div>
  );
}
