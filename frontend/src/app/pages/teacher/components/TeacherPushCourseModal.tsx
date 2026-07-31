import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Send, School, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { classroomApi } from '@/services/classroom-api';
import { classroomLmsApi } from '@/services/classroom-lms-api';

interface TeacherPushCourseModalProps {
  isOpen: boolean;
  onClose: () => void;
  courseId: string;
  courseTitle?: string;
}

export function TeacherPushCourseModal({
  isOpen,
  onClose,
  courseId,
  courseTitle = 'Course',
}: TeacherPushCourseModalProps) {
  const queryClient = useQueryClient();
  const [selectedClassroomIds, setSelectedClassroomIds] = useState<string[]>([]);
  const [message, setMessage] = useState('');

  // Fetch teacher's active classrooms
  const { data: classrooms = [], isLoading } = useQuery({
    queryKey: ['teacherClassrooms'],
    queryFn: () => classroomApi.getClassrooms(),
    enabled: isOpen,
  });

  const pushMutation = useMutation({
    mutationFn: async () => {
      if (selectedClassroomIds.length === 0) {
        throw new Error('Please select at least one classroom.');
      }
      return classroomLmsApi.pushCourseToMultipleClassrooms(courseId, selectedClassroomIds, message);
    },
    onSuccess: (data) => {
      toast.success(
        data.message || `Successfully pushed "${courseTitle}" to selected classroom(s)!`,
        {
          description: `Sent course invitation to ${data.pushedCount || 0} student(s).`,
        }
      );
      setSelectedClassroomIds([]);
      setMessage('');
      queryClient.invalidateQueries({ queryKey: ['pendingCourseInvitations'] });
      onClose();
    },
    onError: (err: any) => {
      toast.error(err.message || 'Failed to push course to classrooms');
    },
  });

  const toggleClassroom = (id: string) => {
    setSelectedClassroomIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleSelectAll = () => {
    if (selectedClassroomIds.length === classrooms.length) {
      setSelectedClassroomIds([]);
    } else {
      setSelectedClassroomIds(classrooms.map((c: any) => c._id || c.id));
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[540px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg font-semibold">
            <School className="w-5 h-5 text-primary" />
            Push Course to Classroom
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            Distribute <span className="font-semibold text-foreground">"{courseTitle}"</span> to all students enrolled in selected classrooms. They will receive email & in-app invitations.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Classrooms List */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Select Classrooms ({selectedClassroomIds.length}/{classrooms.length})
              </Label>
              {classrooms.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleSelectAll}
                  className="h-6 text-xs text-primary hover:text-primary/80"
                >
                  {selectedClassroomIds.length === classrooms.length ? 'Deselect All' : 'Select All'}
                </Button>
              )}
            </div>

            {isLoading ? (
              <div className="flex items-center justify-center p-8 text-muted-foreground">
                <Loader2 className="w-5 h-5 animate-spin mr-2" />
                Loading classrooms...
              </div>
            ) : classrooms.length === 0 ? (
              <div className="text-center p-6 border border-dashed rounded-lg text-sm text-muted-foreground">
                No active classrooms found. Create a classroom first to push courses.
              </div>
            ) : (
              <div className="max-h-[220px] overflow-y-auto space-y-2 pr-1 border rounded-md p-3 bg-muted/20">
                {classrooms.map((classroom: any) => {
                  const cId = classroom._id || classroom.id;
                  const isChecked = selectedClassroomIds.includes(cId);
                  const memberCount = classroom.studentsCount || classroom.membersCount || classroom.members?.length || 0;

                  return (
                    <div
                      key={cId}
                      onClick={() => toggleClassroom(cId)}
                      className={`flex items-center justify-between p-2.5 rounded-lg border cursor-pointer transition-all ${
                        isChecked
                          ? 'border-primary/50 bg-primary/5 dark:bg-primary/10 shadow-sm'
                          : 'border-border/60 hover:bg-muted/50'
                      }`}
                    >
                      <div className="flex items-center space-x-3">
                        <Checkbox
                          id={`classroom-${cId}`}
                          checked={isChecked}
                          onCheckedChange={() => toggleClassroom(cId)}
                          onClick={(e) => e.stopPropagation()}
                        />
                        <div>
                          <p className="text-sm font-medium leading-none text-foreground">
                            {classroom.title || classroom.name}
                          </p>
                          <p className="text-xs text-muted-foreground mt-1">
                            {memberCount} Joined Student{memberCount === 1 ? '' : 's'}
                          </p>
                        </div>
                      </div>
                      {isChecked && <CheckCircle2 className="w-4 h-4 text-primary" />}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Optional Message Field */}
          <div className="space-y-1.5">
            <Label htmlFor="custom-message" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Note for Students (Optional)
            </Label>
            <Textarea
              id="custom-message"
              placeholder="e.g. Please accept this course to begin Module 1 of your internship."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={3}
              className="text-sm"
            />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={onClose} disabled={pushMutation.isPending}>
            Cancel
          </Button>
          <Button
            onClick={() => pushMutation.mutate()}
            disabled={pushMutation.isPending || selectedClassroomIds.length === 0}
            className="gap-2"
          >
            {pushMutation.isPending ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Pushing...
              </>
            ) : (
              <>
                <Send className="w-4 h-4" />
                Push Course to {selectedClassroomIds.length} Classroom{selectedClassroomIds.length === 1 ? '' : 's'}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
