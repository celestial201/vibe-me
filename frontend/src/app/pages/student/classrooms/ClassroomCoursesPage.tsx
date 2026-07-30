import { useParams, useNavigate } from '@tanstack/react-router'
import { ArrowLeft, BookOpen, ExternalLink, Loader2, School, CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { useGetStudentClassroomCourses, useGetClassroom, useStartClassroomCourse } from '@/hooks/classroom-hooks'
import { useGetStudentEnrollmentStatus, useAcceptCourseEnrollment } from '@/hooks/classroom-lms-hooks'
import { useCourseStore } from '@/store/course-store'

export default function ClassroomCoursesPage() {
  const params = useParams({ strict: false }) as { id?: string }
  const id = params.id ?? ''
  const navigate = useNavigate()
  const { setCurrentCourse } = useCourseStore()

  const { data: classroom, isLoading: loadingClassroom } = useGetClassroom(id, !!id)
  const { data: courses = [], isLoading: loadingCourses } = useGetStudentClassroomCourses(id, !!id)
  const startCourseMutation = useStartClassroomCourse(id)


  const handleOpenCourse = (courseId: string, versionId: string) => {
    setCurrentCourse({
      courseId,
      versionId,
      moduleId: null,
      sectionId: null,
      itemId: null,
      watchItemId: null,
    })
    navigate({ to: '/student/learn' })
  }

  const isLoading = loadingClassroom || loadingCourses

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate({ to: '/student/classrooms' })}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
            <School className="h-5 w-5 text-primary" />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl font-bold truncate">{classroom?.title ?? 'Classroom'}</h1>
            {classroom?.description && (
              <p className="text-sm text-muted-foreground truncate">{classroom.description}</p>
            )}
          </div>
        </div>
      </div>

      {/* Course list */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-primary" />
            Assigned Courses
          </h2>
          <Badge variant="secondary">{courses.length} course{courses.length !== 1 ? 's' : ''}</Badge>
        </div>

        {courses.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-4 border-2 border-dashed rounded-xl text-center">
            <BookOpen className="h-10 w-10 text-muted-foreground" />
            <div>
              <p className="font-semibold">No courses yet</p>
              <p className="text-sm text-muted-foreground">Your instructor hasn't assigned any courses to this classroom.</p>
            </div>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {courses.map((c) => {
              const isEnrolled = c.isEnrolled ?? false
              const progressPercentage = c.progressPercentage ?? 0

              return (
                <Card key={c._id ?? c.courseId} className="group hover:shadow-md transition-all border hover:border-primary/40">
                  <CardContent className="p-5 flex flex-col gap-4">
                    <div className="flex items-start gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-violet-500/10">
                        <BookOpen className="h-5 w-5 text-violet-500" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-sm leading-tight truncate">
                          {c.courseName ?? `Course ${c.courseId.slice(-6)}`}
                        </p>
                        {c.courseDescription && (
                          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{c.courseDescription}</p>
                        )}
                        <div className="flex items-center gap-2 mt-2">
                          <Badge
                            variant={isEnrolled ? 'default' : 'secondary'}
                            className={
                              isEnrolled
                                ? 'bg-emerald-600 text-white text-[10px] px-2 py-0.5'
                                : 'bg-amber-500/20 text-amber-600 border-amber-500/30 text-[10px] px-2 py-0.5'
                            }
                          >
                            {isEnrolled ? 'Enrolled' : 'Not Enrolled'}
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            Assigned {c.assignedAt ? new Date(c.assignedAt).toLocaleDateString() : ''}
                          </span>
                        </div>
                      </div>
                    </div>

                    {isEnrolled && (
                      <div className="space-y-1.5">
                        <div className="flex justify-between text-xs font-medium">
                          <span className="text-muted-foreground">Global Progress</span>
                          <span className="text-primary font-bold">{progressPercentage}%</span>
                        </div>
                        <div className="h-2 w-full bg-secondary rounded-full overflow-hidden">
                          <div
                            className="h-full bg-primary transition-all duration-300 rounded-full"
                            style={{ width: `${Math.min(100, Math.max(0, progressPercentage))}%` }}
                          />
                        </div>
                      </div>
                    )}

                    {!isEnrolled ? (
                      <Button
                        size="sm"
                        className="w-full gap-2 bg-primary hover:bg-primary/90 text-primary-foreground"
                        disabled={startCourseMutation.isPending}
                        onClick={async () => {
                          try {
                            await startCourseMutation.mutateAsync(c.courseId)
                            handleOpenCourse(c.courseId, c.versionId)
                          } catch {
                            // error handled by hook toast
                          }
                        }}
                      >
                        {startCourseMutation.isPending ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <ExternalLink className="h-4 w-4" />
                        )}
                        Start Course
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="secondary"
                        className="w-full gap-2 border hover:border-primary/50"
                        onClick={() => handleOpenCourse(c.courseId, c.versionId)}
                      >
                        <ExternalLink className="h-4 w-4" />
                        Continue Course
                      </Button>
                    )}
                  </CardContent>
                </Card>
              )
            })}
          </div>
        )}
      </div>

    </div>
  )
}
