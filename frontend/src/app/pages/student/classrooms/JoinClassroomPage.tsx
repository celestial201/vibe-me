import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { LogIn, ArrowLeft, Loader2, School } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useJoinClassroom } from '@/hooks/classroom-hooks'

export default function JoinClassroomPage() {
  const navigate = useNavigate()
  const [code, setCode] = useState('')
  const { mutateAsync: joinClassroom, isPending } = useJoinClassroom()
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = code.trim().toUpperCase()
    if (trimmed.length !== 6) { setError('Join code must be exactly 6 characters'); return }
    setError(null)
    try {
      await joinClassroom(trimmed)
      navigate({ to: '/student/classrooms' })
    } catch (err: any) {
      setError(err.message ?? 'Failed to join classroom')
    }
  }

  return (
    <div className="p-6 max-w-md mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate({ to: '/student/classrooms' })}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <LogIn className="h-5 w-5 text-primary" />
            Join a Classroom
          </h1>
          <p className="text-sm text-muted-foreground">Enter the 6-character code from your instructor.</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Enter Join Code</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="join-code">Classroom Code</Label>
              <Input
                id="join-code"
                placeholder="e.g. AB12CD"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, 6))}
                disabled={isPending}
                className="font-mono text-center text-xl tracking-widest uppercase h-12"
                maxLength={6}
                autoComplete="off"
                spellCheck={false}
              />
              <p className="text-xs text-muted-foreground text-center">
                {code.length}/6 characters
              </p>
            </div>
            {error && <p className="text-sm text-destructive text-center">{error}</p>}
            <Button
              type="submit"
              className="w-full"
              disabled={isPending || code.trim().length !== 6}
            >
              {isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <LogIn className="h-4 w-4 mr-2" />}
              Join Classroom
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
