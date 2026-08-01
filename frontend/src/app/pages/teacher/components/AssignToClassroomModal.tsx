import React, { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { School, Loader2, BookOpen } from 'lucide-react'
import { useGetMyClassrooms, useBatchAssignCourse } from '@/hooks/classroom-hooks'
import { extractStringId } from '@/utils/idNormalizer'

interface AssignToClassroomModalProps {
  isOpen: boolean
  onClose: () => void
  courseId: string
  courseName?: string
}

export function AssignToClassroomModal({
  isOpen,
  onClose,
  courseId,
  courseName = 'Course',
}: AssignToClassroomModalProps) {
  const { data: classrooms = [], isLoading } = useGetMyClassrooms(isOpen)
  const batchAssignMutation = useBatchAssignCourse()
  const [selectedIds, setSelectedIds] = useState<string[]>([])

  const cleanCourseId = extractStringId(courseId)

  const handleToggleClassroom = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    )
  }

  const handleSelectAll = () => {
    if (selectedIds.length === classrooms.length) {
      setSelectedIds([])
    } else {
      setSelectedIds(classrooms.map((c) => extractStringId(c._id || c)))
    }
  }

  const handleConfirm = async () => {
    if (selectedIds.length === 0 || !cleanCourseId) return
    try {
      await batchAssignMutation.mutateAsync({
        courseId: cleanCourseId,
        classroomIds: selectedIds.map((id) => extractStringId(id)),
      })
      setSelectedIds([])
      onClose()
    } catch {
      // handled by mutation onError
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <School className="h-5 w-5 text-primary" />
            Assign to Classroom
          </DialogTitle>
          <DialogDescription>
            Select one or more classrooms to assign <span className="font-semibold text-foreground">"{courseName}"</span> to.
          </DialogDescription>
        </DialogHeader>

        <div className="py-4 space-y-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : classrooms.length === 0 ? (
            <div className="text-center py-6 border rounded-lg border-dashed">
              <School className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
              <p className="text-sm font-medium">No classrooms found</p>
              <p className="text-xs text-muted-foreground">Create a classroom first from the Classrooms dashboard.</p>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between pb-2 border-b">
                <span className="text-xs font-semibold text-muted-foreground">YOUR CLASSROOMS</span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-auto p-0 text-xs text-primary hover:bg-transparent"
                  onClick={handleSelectAll}
                >
                  {selectedIds.length === classrooms.length ? 'Deselect All' : 'Select All'}
                </Button>
              </div>

              <div className="max-h-60 overflow-y-auto space-y-2 pr-1">
                {classrooms.map((c) => {
                  const cid = (c as any)._id?.toString() || (c as any).id?.toString() || c._id;
                  const isChecked = selectedIds.includes(cid);
                  return (
                    <div
                      key={cid}
                      onClick={() => handleToggleClassroom(cid)}
                      className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-all ${
                        isChecked
                          ? 'border-primary bg-primary/5 dark:bg-primary/10'
                          : 'hover:bg-accent/50'
                      }`}
                    >
                      <div className="flex items-center space-x-3">
                        <Checkbox
                          id={`classroom-${cid}`}
                          checked={isChecked}
                          onCheckedChange={() => handleToggleClassroom(cid)}
                          onClick={(e) => e.stopPropagation()}
                        />
                        <Label
                          htmlFor={`classroom-${cid}`}
                          className="font-medium text-sm cursor-pointer"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {c.title}
                        </Label>
                      </div>
                      <span className="text-xs text-muted-foreground font-mono bg-muted px-2 py-0.5 rounded">
                        {c.code}
                      </span>
                    </div>
                  );
                })}
              </div>

              <div className="pt-2 text-xs font-medium text-muted-foreground flex justify-between">
                <span>Selected:</span>
                <span className="text-primary font-bold">{selectedIds.length} Classroom{selectedIds.length !== 1 ? 's' : ''}</span>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={onClose} disabled={batchAssignMutation.isPending}>
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={selectedIds.length === 0 || batchAssignMutation.isPending}
            className="gap-2"
          >
            {batchAssignMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            {selectedIds.length > 0 ? `Assign to ${selectedIds.length} Classroom${selectedIds.length !== 1 ? 's' : ''}` : 'Assign to Classroom'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
