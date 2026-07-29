import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import {
  School,
  Plus,
  Copy,
  Check,
  Trash2,
  Loader2,
  ChevronRight,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useGetMyClassrooms, useDeleteClassroom } from '@/hooks/classroom-hooks'
import { ClassroomDTO } from '@/services/classroom-api'
import { NotificationBell } from '@/components/NotificationBell'

function CopyCodeButton({ code }: { code: string }) {
  const [copied, setCopied] = useState(false)
  const handleCopy = () => {
    navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  return (
    <button
      onClick={(e) => { e.stopPropagation(); handleCopy() }}
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-mono text-sm bg-muted hover:bg-muted/80 transition-colors border border-border"
    >
      <span className="tracking-widest font-semibold">{code}</span>
      {copied ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3 text-muted-foreground" />}
    </button>
  )
}

function ClassroomCard({ classroom, onDelete }: { classroom: ClassroomDTO; onDelete: (id: string) => void }) {
  const navigate = useNavigate()
  const [confirmOpen, setConfirmOpen] = useState(false)

  return (
    <>
      <Card
        className="group cursor-pointer hover:shadow-md transition-all border hover:border-primary/40"
        onClick={() => window.location.href = `/classroom/${classroom._id}`}
      >
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                <School className="h-5 w-5 text-primary" />
              </div>
              <CardTitle className="text-base line-clamp-1">{classroom.title}</CardTitle>
            </div>
            <div className="flex items-center gap-1">
              <div onClick={(e) => e.stopPropagation()}>
                <NotificationBell classroomId={classroom._id} />
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); setConfirmOpen(true) }}
                className="opacity-0 group-hover:opacity-100 p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-all"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {classroom.description && (
            <p className="text-sm text-muted-foreground line-clamp-2">{classroom.description}</p>
          )}
          <div className="flex items-center justify-between flex-wrap gap-2">
            <CopyCodeButton code={classroom.code} />
            <Badge variant={classroom.status === 'active' ? 'default' : 'secondary'} className="text-xs">
              {classroom.status}
            </Badge>
          </div>
          <div className="flex items-center justify-end text-xs text-muted-foreground">
            <ChevronRight className="h-3 w-3 group-hover:translate-x-0.5 transition-transform" />
          </div>
        </CardContent>
      </Card>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete classroom?</DialogTitle>
            <DialogDescription>
              This will remove all students and course assignments. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => { onDelete(classroom._id); setConfirmOpen(false) }}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

export default function ClassroomsListPage() {
  const navigate = useNavigate()
  const { data: classrooms = [], isLoading } = useGetMyClassrooms()
  const { mutate: deleteClassroom } = useDeleteClassroom()

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <School className="h-6 w-6 text-primary" />
            Onboarding Classrooms
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Create classrooms and share join codes with your students.
          </p>
        </div>
        <Button onClick={() => navigate({ to: '/teacher/classrooms/create' })}>
          <Plus className="h-4 w-4 mr-2" />
          New Classroom
        </Button>
      </div>

      {/* Content */}
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
            <p className="text-muted-foreground text-sm">Create your first onboarding classroom to get started.</p>
          </div>
          <Button variant="outline" onClick={() => navigate({ to: '/teacher/classrooms/create' })}>
            <Plus className="h-4 w-4 mr-2" />
            Create Classroom
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {classrooms.map((c) => (
            <ClassroomCard key={c._id} classroom={c} onDelete={deleteClassroom} />
          ))}
        </div>
      )}
    </div>
  )
}
