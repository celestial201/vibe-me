import { useNavigate } from '@tanstack/react-router'
import { School, BookOpen, LogIn, Loader2, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { useGetJoinedClassrooms } from '@/hooks/classroom-hooks'
import { ClassroomDTO } from '@/services/classroom-api'
import { NotificationBell } from '@/components/NotificationBell'

function ClassroomCard({ classroom }: { classroom: ClassroomDTO }) {
  const navigate = useNavigate()
  return (
    <Card
      className="group cursor-pointer hover:shadow-md transition-all border hover:border-primary/40"
      onClick={() => window.location.href = `/classroom/${classroom._id}`}
    >
      <CardHeader className="pb-2">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
            <School className="h-5 w-5 text-primary" />
          </div>
          <div className="min-w-0 flex-1">
            <CardTitle className="text-base line-clamp-1">{classroom.title}</CardTitle>
            {classroom.description && (
              <p className="text-sm text-muted-foreground line-clamp-1 mt-0.5">{classroom.description}</p>
            )}
          </div>
          <div onClick={(e) => e.stopPropagation()}>
            <NotificationBell classroomId={classroom._id} />
          </div>
          <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:translate-x-0.5 transition-transform shrink-0" />
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <BookOpen className="h-3.5 w-3.5" />
            <span>View courses</span>
          </div>
          <Badge variant={classroom.status === 'active' ? 'default' : 'secondary'} className="text-xs">
            {classroom.status}
          </Badge>
        </div>
      </CardContent>
    </Card>
  )
}

export default function MyClassroomsPage() {
  const navigate = useNavigate()
  const { data: classrooms = [], isLoading } = useGetJoinedClassrooms()

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <School className="h-6 w-6 text-primary" />
            My Classrooms
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Classrooms you have joined via a join code.
          </p>
        </div>
        <Button variant="outline" onClick={() => navigate({ to: '/student/classrooms/join' })}>
          <LogIn className="h-4 w-4 mr-2" />
          Join Classroom
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : classrooms.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 gap-4 text-center border-2 border-dashed rounded-xl">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted">
            <School className="h-8 w-8 text-muted-foreground" />
          </div>
          <div>
            <p className="font-semibold text-lg">No classrooms yet</p>
            <p className="text-muted-foreground text-sm">Ask your instructor for a join code to get started.</p>
          </div>
          <Button onClick={() => navigate({ to: '/student/classrooms/join' })}>
            <LogIn className="h-4 w-4 mr-2" />
            Join a Classroom
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {classrooms.map((c) => (
            <ClassroomCard key={c._id} classroom={c} />
          ))}
        </div>
      )}
    </div>
  )
}
