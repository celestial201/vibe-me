import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { School, ArrowLeft, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { useCreateClassroom } from '@/hooks/classroom-hooks'

export default function CreateClassroomPage() {
  const navigate = useNavigate()
  const { mutateAsync: createClassroom, isPending } = useCreateClassroom()

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0])
  const [endDate, setEndDate] = useState(
    new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  )
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) { setError('Title is required'); return }
    if (startDate && endDate && new Date(endDate) < new Date(startDate)) {
      setError('End date must come after start date')
      return
    }
    setError(null)
    try {
      const classroom = await createClassroom({
        title: title.trim(),
        description: description.trim() || undefined,
        start_date: startDate || undefined,
        end_date: endDate || undefined,
      })
      navigate({ to: '/teacher/classrooms/$id', params: { id: classroom._id } })
    } catch (err: any) {
      setError(err.message ?? 'Failed to create classroom')
    }
  }

  return (
    <div className="p-6 max-w-xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate({ to: '/teacher/classrooms' })}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <School className="h-5 w-5 text-primary" />
            New Classroom
          </h1>
          <p className="text-sm text-muted-foreground">A unique join code will be generated automatically.</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Classroom Details</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="classroom-title">Title <span className="text-destructive">*</span></Label>
              <Input
                id="classroom-title"
                placeholder="e.g. Web Dev Bootcamp 2026"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                disabled={isPending}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="classroom-desc">Description <span className="text-muted-foreground text-xs">(optional)</span></Label>
              <Textarea
                id="classroom-desc"
                placeholder="Brief description of this classroom..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                disabled={isPending}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="start-date">Start Date</Label>
                <Input
                  id="start-date"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  disabled={isPending}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="end-date">End Date</Label>
                <Input
                  id="end-date"
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  disabled={isPending}
                />
              </div>
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <div className="flex gap-2 justify-end pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => navigate({ to: '/teacher/classrooms' })}
                disabled={isPending}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isPending || !title.trim()}>
                {isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                Create Classroom
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
