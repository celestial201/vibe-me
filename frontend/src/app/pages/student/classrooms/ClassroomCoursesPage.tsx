import { useParams, useNavigate } from '@tanstack/react-router'
import { ArrowLeft, BookOpen, ExternalLink, Loader2, School, CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { useGetStudentClassroomCourses, useGetClassroom } from '@/hooks/classroom-hooks'
import { useGetStudentEnrollmentStatus, useAcceptCourseEnrollment } from '@/hooks/classroom-lms-hooks'
import { useCourseStore } from '@/store/course-store'

export default function ClassroomCoursesPage() {
  const params = useParams({ strict: false }) as { id?: string }
  const id = params.id ?? ''
  const navigate = useNavigate()
  const { setCurrentCourse } = useCourseStore()

  const { data: classroom, isLoading: loadingClassroom } = useGetClassroom(id, !!id)
  const { data: courses = [], isLoading: loadingCourses } = useGetStudentClassroomCourses(id, !!id)
  const { data: statusList = [] } = useGetStudentEnrollmentStatus(id)
  const acceptMutation = useAcceptCourseEnrollment(id)

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
              const statusDoc = statusList.find((s) => s.courseId === c.courseId)
              const isAccepted = statusDoc?.accepted ?? false

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
                        {c.versionName && (
                          <p className="text-xs text-muted-foreground mt-0.5 truncate">{c.versionName}</p>
                        )}
                        <div className="flex items-center gap-2 mt-1">
                          <p className="text-xs text-muted-foreground">
                            Assigned {c.assignedAt ? new Date(c.assignedAt).toLocaleDateString() : ''}
                          </p>
                          <Badge
                            variant={isAccepted ? 'default' : 'secondary'}
                            className={
                              isAccepted
                                ? 'bg-emerald-600 text-white text-[9px] px-1.5 py-0'
                                : 'bg-amber-500/20 text-amber-600 border-amber-500/30 text-[9px] px-1.5 py-0'
                            }
                          >
                            {isAccepted ? 'Accepted' : 'Pending Acceptance'}
                          </Badge>
                        </div>
                      </div>
                    </div>

                    {!isAccepted ? (
                      <div className="flex flex-col gap-2">
                        <div className="bg-amber-500/10 border border-amber-500/30 p-2 rounded-lg flex items-center justify-between text-xs text-amber-600 dark:text-amber-400">
                          <span>New course enrollment pending</span>
                          <Button
                            size="xs"
                            className="bg-amber-600 hover:bg-amber-700 text-white"
                            onClick={() => acceptMutation.mutate(c.courseId)}
                            disabled={acceptMutation.isPending}
                          >
                            Accept Enrollment
                          </Button>
                        </div>
                        <Button
                          size="sm"
                          className="w-full gap-2"
                          onClick={() => {
                            if (!isAccepted) acceptMutation.mutate(c.courseId)
                            handleOpenCourse(c.courseId, c.versionId)
                          }}
                        >
                          <ExternalLink className="h-4 w-4" />
                          Open Course
                        </Button>
                      </div>
                    ) : (
                      <Button
                        size="sm"
                        className="w-full gap-2"
                        onClick={() => handleOpenCourse(c.courseId, c.versionId)}
                      >
                        <ExternalLink className="h-4 w-4" />
                        Open Course
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
