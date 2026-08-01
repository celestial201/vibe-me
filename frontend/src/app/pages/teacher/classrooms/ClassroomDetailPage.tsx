import { useState } from 'react'
import { useParams, useNavigate } from '@tanstack/react-router'
import {
  ArrowLeft,
  School,
  Copy,
  Check,
  Users,
  BookOpen,
  Plus,
  X,
  Loader2,
  Search,
  BarChart3,
  UserCheck,
  BookMarked,
  GraduationCap,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from '@/components/ui/sheet'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Checkbox } from '@/components/ui/checkbox'
import { Separator } from '@/components/ui/separator'

import {
  useGetClassroom,
  useGetClassroomStudents,
  useGetClassroomCourses,
  useAssignCourse,
  useRemoveCourse,
  useGetClassroomCourseProgress,
} from '@/hooks/classroom-hooks'
import { useUserEnrollments, useCourseEnrollmentsStats } from '@/hooks/hooks'
import { useAuthStore } from '@/store/auth-store'
import { bufferToHex } from '@/utils/helpers'
import { extractStringId } from '@/utils/idNormalizer'
import type { ClassroomCourseDTO } from '@/services/classroom-api'


// ── CopyCode button ──────────────────────────────────────────────────────────

function CopyCode({ code }: { code: string }) {
  const [copied, setCopied] = useState(false)
  const handleCopy = () => {
    navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  return (
    <button
      onClick={handleCopy}
      className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg font-mono text-lg font-bold bg-muted hover:bg-muted/80 border border-border transition-colors"
      title="Click to copy join code"
    >
      {code}
      {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4 text-muted-foreground" />}
    </button>
  )
}

// ── Per-course stat row ───────────────────────────────────────────────────────

function CourseStatChips({ courseId, versionId }: { courseId: string; versionId: string }) {
  const { data, isLoading } = useCourseEnrollmentsStats(courseId, versionId, true)
  if (isLoading) return <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
  if (!data) return <span className="text-xs text-muted-foreground">—</span>
  const started = (data.totalEnrollments ?? 0) - (data.completedCount ?? 0)
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <Badge variant="outline" className="text-xs gap-1">
        <UserCheck className="h-3 w-3" />
        {data.totalEnrollments ?? 0} Assigned
      </Badge>
      <Badge variant="outline" className="text-xs gap-1 border-yellow-500/40 text-yellow-600">
        <BarChart3 className="h-3 w-3" />
        {started} Started
      </Badge>
      <Badge variant="outline" className="text-xs gap-1 border-green-500/40 text-green-600">
        <GraduationCap className="h-3 w-3" />
        {data.completedCount ?? 0} Completed
      </Badge>
    </div>
  )
}

// ── Classroom Course Progress List ─────────────────────────────────────────────

function ClassroomCourseProgressList({ classroomId, courseId }: { classroomId: string; courseId: string }) {
  const { data: progressList = [], isLoading } = useGetClassroomCourseProgress(classroomId, courseId)
  const [expanded, setExpanded] = useState(false)

  if (isLoading) return <Loader2 className="h-4 w-4 animate-spin text-muted-foreground mt-2" />

  const startedCount = progressList.filter((s) => s.isEnrolled).length

  return (
    <div className="mt-3 pt-3 border-t space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-xs">
            {progressList.length} Student{progressList.length !== 1 ? 's' : ''}
          </Badge>
          <Badge variant="secondary" className="text-xs bg-amber-500/10 text-amber-600 border-amber-500/20">
            {startedCount} Started
          </Badge>
        </div>
        <Button variant="ghost" size="sm" onClick={() => setExpanded(!expanded)} className="text-xs gap-1 h-7">
          {expanded ? 'Hide Progress' : 'View Student Progress'}
        </Button>
      </div>

      {expanded && (
        <div className="border rounded-lg overflow-hidden mt-2 bg-muted/30">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead className="text-xs">Student</TableHead>
                <TableHead className="text-xs">Status</TableHead>
                <TableHead className="text-xs">Progress</TableHead>
                <TableHead className="text-xs text-right">Items Completed</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {progressList.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-xs text-muted-foreground py-4">
                    No students in classroom.
                  </TableCell>
                </TableRow>
              ) : (
                progressList.map((item) => (
                  <TableRow key={item.studentId}>
                    <TableCell className="text-xs font-medium">
                      <div>{item.studentName}</div>
                      <div className="text-[10px] text-muted-foreground">{item.studentEmail}</div>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={item.isEnrolled ? 'default' : 'secondary'}
                        className={item.isEnrolled ? 'bg-emerald-600 text-[10px]' : 'text-[10px]'}
                      >
                        {item.isEnrolled ? 'Enrolled' : 'Not Started'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs font-bold">
                      {item.progressPercentage}%
                    </TableCell>
                    <TableCell className="text-xs text-right font-mono">
                      {item.completedItemsCount}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}

// ── Assign Courses Drawer ────────────────────────────────────────────────────


interface AssignDrawerProps {
  classroomId: string
  open: boolean
  onClose: () => void
  assignedCourseIds: Set<string>
}

function AssignCoursesDrawer({ classroomId, open, onClose, assignedCourseIds }: AssignDrawerProps) {
  const { token } = useAuthStore()
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Map<string, string>>(new Map()) // courseId -> versionId

  const { data: enrollmentsResponse, isLoading } = useUserEnrollments(
    1, 200, !!token && open, search, 'INSTRUCTOR', 'active'
  )

  const { mutate: assignCourse, isPending: assigning } = useAssignCourse(classroomId)

  // Deduplicate by courseId, only keep active versions
  const instructorCourses = (() => {
    const enrollments = enrollmentsResponse?.enrollments ?? []
    const seen = new Map<string, any>()
    for (const e of enrollments) {
      const courseId = extractStringId(e.courseId) || (typeof e.courseId === 'string' ? e.courseId : bufferToHex(e.courseId))
      const versionId = extractStringId(e.courseVersionId) || (typeof e.courseVersionId === 'string' ? e.courseVersionId : bufferToHex(e.courseVersionId))
      if (courseId && !seen.has(courseId)) {
        seen.set(courseId, { courseId, versionId, name: e.course?.name ?? 'Untitled', versionName: e.courseVersion?.name ?? '' })
      }
    }
    return Array.from(seen.values())
  })()

  const toggleSelect = (courseId: string, versionId: string) => {
    setSelected(prev => {
      const next = new Map(prev)
      if (next.has(courseId)) next.delete(courseId)
      else next.set(courseId, versionId)
      return next
    })
  }

  const handleAssign = () => {
    for (const [courseId, versionId] of selected.entries()) {
      const cleanCourseId = extractStringId(courseId)
      const cleanVersionId = extractStringId(versionId)
      if (cleanCourseId && !assignedCourseIds.has(cleanCourseId)) {
        assignCourse({ courseId: cleanCourseId, versionId: cleanVersionId })
      }
    }
    setSelected(new Map())
    onClose()
  }

  const newlySelected = Array.from(selected.entries()).filter(([id]) => !assignedCourseIds.has(id))

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) onClose() }}>
      <SheetContent side="right" className="w-full sm:max-w-lg flex flex-col gap-0 p-0">
        <SheetHeader className="px-6 pt-6 pb-4 border-b">
          <SheetTitle className="flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-primary" />
            Assign Courses
          </SheetTitle>
          <SheetDescription>
            Select published courses you own to add to this classroom.
          </SheetDescription>
        </SheetHeader>

        <div className="px-6 py-3 border-b">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search courses…"
              className="pl-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-3 space-y-1">
          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : instructorCourses.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">
              No published courses found. Create and publish a course first.
            </div>
          ) : instructorCourses.map((c) => {
            const isAssigned = assignedCourseIds.has(c.courseId)
            const isChecked = selected.has(c.courseId) || isAssigned
            return (
              <div
                key={c.courseId}
                className={`flex items-center gap-3 p-3 rounded-lg border transition-colors ${isAssigned ? 'bg-muted/40 cursor-default' : 'hover:bg-muted/60 cursor-pointer'}`}
                onClick={() => !isAssigned && toggleSelect(c.courseId, c.versionId)}
              >
                <Checkbox
                  checked={isChecked}
                  disabled={isAssigned}
                  className="shrink-0"
                  onCheckedChange={() => !isAssigned && toggleSelect(c.courseId, c.versionId)}
                />
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-sm truncate">{c.name}</p>
                  {c.versionName && (
                    <p className="text-xs text-muted-foreground truncate">{c.versionName}</p>
                  )}
                </div>
                {isAssigned && <Badge variant="secondary" className="text-xs shrink-0">Assigned</Badge>}
              </div>
            )
          })}
        </div>

        <SheetFooter className="px-6 py-4 border-t flex items-center gap-2">
          <Button variant="outline" onClick={onClose} className="flex-1">
            Cancel
          </Button>
          <Button
            onClick={handleAssign}
            disabled={newlySelected.length === 0 || assigning}
            className="flex-1"
          >
            {assigning ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
            Assign {newlySelected.length > 0 ? `(${newlySelected.length})` : ''}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function ClassroomDetailPage() {
  const params = useParams({ strict: false }) as { id?: string }
  const id = params.id ?? ''
  const navigate = useNavigate()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const { mutate: removeCourse } = useRemoveCourse(id)

  const { data: classroom, isLoading: loadingClassroom } = useGetClassroom(id, !!id)
  const { data: students = [], isLoading: loadingStudents } = useGetClassroomStudents(id, !!id)
  const { data: courses = [], isLoading: loadingCourses } = useGetClassroomCourses(id, !!id)

  const assignedCourseIds = new Set(courses.map((c: ClassroomCourseDTO) => c.courseId))

  if (loadingClassroom) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  if (!classroom) {
    return (
      <div className="p-6 text-center">
        <p className="text-muted-foreground">Classroom not found.</p>
        <Button variant="link" onClick={() => navigate({ to: '/teacher/classrooms' })}>Back to classrooms</Button>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start gap-4 flex-wrap">
        <Button variant="ghost" size="icon" onClick={() => navigate({ to: '/teacher/classrooms' })}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
              <School className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-bold">{classroom.title}</h1>
              {classroom.description && (
                <p className="text-sm text-muted-foreground">{classroom.description}</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-3 mt-3 flex-wrap">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span className="font-medium">Join Code:</span>
              <CopyCode code={classroom.code} />
            </div>
            <Badge variant={classroom.status === 'active' ? 'default' : 'secondary'}>
              {classroom.status}
            </Badge>
          </div>
        </div>
      </div>

      <Separator />

      {/* Stats bar */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <Card className="p-4 flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-500/10">
            <Users className="h-5 w-5 text-blue-500" />
          </div>
          <div>
            <p className="text-2xl font-bold">{students.length}</p>
            <p className="text-xs text-muted-foreground">Students</p>
          </div>
        </Card>
        <Card className="p-4 flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-violet-500/10">
            <BookMarked className="h-5 w-5 text-violet-500" />
          </div>
          <div>
            <p className="text-2xl font-bold">{courses.length}</p>
            <p className="text-xs text-muted-foreground">Courses</p>
          </div>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="students">
        <TabsList>
          <TabsTrigger value="students" className="gap-2">
            <Users className="h-4 w-4" />
            Students ({students.length})
          </TabsTrigger>
          <TabsTrigger value="courses" className="gap-2">
            <BookOpen className="h-4 w-4" />
            Courses ({courses.length})
          </TabsTrigger>
        </TabsList>

        {/* ── Students Tab ─────────────────────────────────────────────────── */}
        <TabsContent value="students" className="mt-4">
          {loadingStudents ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : students.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3 border-2 border-dashed rounded-xl text-center">
              <Users className="h-10 w-10 text-muted-foreground" />
              <div>
                <p className="font-semibold">No students yet</p>
                <p className="text-sm text-muted-foreground">
                  Share the join code <span className="font-mono font-bold">{classroom.code}</span> with your students.
                </p>
              </div>
            </div>
          ) : (
            <Card>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Student ID</TableHead>
                    <TableHead>Joined At</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {students.map((m) => (
                    <TableRow key={m._id ?? m.studentId}>
                      <TableCell className="font-mono text-sm">{m.studentId}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {m.joinedAt ? new Date(m.joinedAt).toLocaleDateString() : '—'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          )}
        </TabsContent>

        {/* ── Courses Tab ──────────────────────────────────────────────────── */}
        <TabsContent value="courses" className="mt-4 space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              {courses.length} course{courses.length !== 1 ? 's' : ''} assigned
            </p>
            <Button size="sm" onClick={() => setDrawerOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Manage Courses
            </Button>
          </div>

          {loadingCourses ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : courses.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3 border-2 border-dashed rounded-xl text-center">
              <BookOpen className="h-10 w-10 text-muted-foreground" />
              <div>
                <p className="font-semibold">No courses assigned</p>
                <p className="text-sm text-muted-foreground">Click "Manage Courses" to assign your published courses.</p>
              </div>
              <Button variant="outline" size="sm" onClick={() => setDrawerOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Assign Courses
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {courses.map((c: ClassroomCourseDTO) => (
                <Card key={c._id ?? c.courseId} className="p-4">
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-violet-500/10">
                        <BookOpen className="h-4 w-4 text-violet-500" />
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium text-sm truncate">
                          {c.courseName ?? `Course ${c.courseId.slice(-6)}`}
                        </p>
                        {c.versionName && (
                          <p className="text-xs text-muted-foreground">{c.versionName}</p>
                        )}
                        <div className="mt-2">
                          <CourseStatChips courseId={c.courseId} versionId={c.versionId} />
                        </div>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="shrink-0 text-muted-foreground hover:text-destructive"
                      onClick={() => removeCourse(c.courseId)}
                      title="Remove course"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                  <ClassroomCourseProgressList classroomId={id} courseId={c.courseId} />
                </Card>
              ))}
            </div>

          )}
        </TabsContent>
      </Tabs>

      {/* Assign Courses Drawer */}
      <AssignCoursesDrawer
        classroomId={id}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        assignedCourseIds={assignedCourseIds}
      />
    </div>
  )
}
