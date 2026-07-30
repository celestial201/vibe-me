import React, { useState } from 'react';
import { useGetMyVibeCourses, usePushCourseToClassroom } from '@/hooks/classroom-lms-hooks';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { BookOpen, Mail, Send, Loader2 } from 'lucide-react';

interface Props {
  classroomId: string;
  isOpen: boolean;
  onClose: () => void;
}

export function PushCourseModal({ classroomId, isOpen, onClose }: Props) {
  const { data: courses, isLoading } = useGetMyVibeCourses();
  const pushMutation = usePushCourseToClassroom(classroomId);

  const [selectedCourseId, setSelectedCourseId] = useState<string>('');
  const [sendEmails, setSendEmails] = useState<boolean>(true);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCourseId) return;
    await pushMutation.mutateAsync({
      courseId: selectedCourseId,
      sendEmails,
    });
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-primary" />
            Push Course to Classroom
          </DialogTitle>
          <DialogDescription className="text-xs">
            Bulk-enroll all students in this classroom into one of your Vibe courses and dispatch enrollment emails.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          <div>
            <label className="text-xs font-medium block mb-1">Select Vibe Course *</label>
            {isLoading ? (
              <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
                <Loader2 className="w-4 h-4 animate-spin text-primary" />
                Loading your Vibe courses...
              </div>
            ) : !courses || courses.length === 0 ? (
              <p className="text-xs text-muted-foreground italic border p-2.5 rounded-md">
                No published Vibe courses found in your account.
              </p>
            ) : (
              <Select value={selectedCourseId} onValueChange={setSelectedCourseId}>
                <SelectTrigger className="w-full h-10 px-3 py-2 text-sm font-semibold text-slate-900 dark:text-slate-100 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-amber-500">
                  <SelectValue placeholder="Choose a course to push..." className="text-slate-900 dark:text-slate-100 font-semibold" />
                </SelectTrigger>
                <SelectContent className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-800 shadow-xl rounded-xl z-50">
                  {courses.map((course: any) => {
                    const uniqueId = course._id?.toString() || course.id?.toString();
                    return (
                      <SelectItem
                        key={uniqueId}
                        value={uniqueId}
                        className="text-slate-900 dark:text-slate-100 font-medium hover:bg-slate-100 dark:hover:bg-slate-800 focus:bg-slate-100 dark:focus:bg-slate-800 focus:text-slate-900 dark:focus:text-slate-100 cursor-pointer"
                      >
                        {course.name || course.title || 'Untitled Course'}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            )}
          </div>

          <div className="flex items-center gap-2 pt-1 border-t border-border/40">
            <Checkbox
              id="sendEmails"
              checked={sendEmails}
              onCheckedChange={(checked) => setSendEmails(Boolean(checked))}
            />
            <label htmlFor="sendEmails" className="text-xs text-foreground cursor-pointer flex items-center gap-1.5 font-medium">
              <Mail className="w-3.5 h-3.5 text-primary" />
              Send course enrollment emails to all enrolled classroom students
            </label>
          </div>

          <div className="flex justify-end gap-2 pt-3">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={!selectedCourseId || pushMutation.isPending}>
              {pushMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                  Pushing Course...
                </>
              ) : (
                <>
                  <Send className="w-4 h-4 mr-1" />
                  Push Course to Students
                </>
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
