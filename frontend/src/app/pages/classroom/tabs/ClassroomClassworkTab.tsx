import React, { useState } from 'react';
import {
  useGetAssignments,
  useCreateAssignment,
  useSubmitAssignment,
  useGetSubmissions,
  useGradeSubmission,
} from '@/hooks/classroom-lms-hooks';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { BookOpen, Plus, Calendar, FileCheck, Upload, CheckCircle2, Clock, Award } from 'lucide-react';
import { format } from 'date-fns';

interface Props {
  classroomId: string;
  isInstructor: boolean;
}

export function ClassroomClassworkTab({ classroomId, isInstructor }: Props) {
  const { data: assignments, isLoading } = useGetAssignments(classroomId);
  const createAssignmentMutation = useCreateAssignment(classroomId);

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [points, setPoints] = useState(100);
  const [dueDate, setDueDate] = useState('');
  const [assignmentFiles, setAssignmentFiles] = useState<File[]>([]);

  const handleCreateAssignment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !dueDate) return;
    await createAssignmentMutation.mutateAsync({
      data: { title, description, points, due_date: dueDate },
      files: assignmentFiles,
    });
    setIsCreateOpen(false);
    setTitle('');
    setDescription('');
    setPoints(100);
    setDueDate('');
    setAssignmentFiles([]);
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Header Actions */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold tracking-tight">Classwork & Tasks</h2>
          <p className="text-sm text-muted-foreground">Manage assignments, turn-in work, and track grading.</p>
        </div>
        {isInstructor && (
          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="w-4 h-4 mr-1" />
                Create Assignment
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg">
              <DialogHeader>
                <DialogTitle>Create New Assignment</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleCreateAssignment} className="space-y-4 pt-2">
                <div>
                  <label className="text-xs font-medium">Title *</label>
                  <Input
                    required
                    placeholder="e.g. Assignment 1: Neural Networks"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-xs font-medium">Instructions / Description</label>
                  <Textarea
                    placeholder="Describe task guidelines..."
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={3}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium">Points</label>
                    <Input
                      type="number"
                      min={0}
                      value={points}
                      onChange={(e) => setPoints(Number(e.target.value))}
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium">Due Date & Time *</label>
                    <Input
                      type="datetime-local"
                      required
                      value={dueDate}
                      onChange={(e) => setDueDate(e.target.value)}
                    />
                  </div>
                </div>
                <div>
                  <label className="text-xs font-medium">Attachments (PDF/Images/DOCX)</label>
                  <Input
                    type="file"
                    multiple
                    onChange={(e) => e.target.files && setAssignmentFiles(Array.from(e.target.files))}
                  />
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <Button type="button" variant="outline" onClick={() => setIsCreateOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={createAssignmentMutation.isPending}>
                    Publish Assignment
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {/* Assignment List */}
      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground text-sm">Loading assignments...</div>
      ) : !assignments || assignments.length === 0 ? (
        <div className="text-center py-16 border border-dashed rounded-lg text-muted-foreground text-sm">
          No assignments published yet.
        </div>
      ) : (
        <div className="space-y-4">
          {assignments.map((assignment) => (
            <AssignmentCard
              key={assignment._id}
              assignment={assignment}
              classroomId={classroomId}
              isInstructor={isInstructor}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function AssignmentCard({ assignment, classroomId, isInstructor }: { assignment: any; classroomId: string; isInstructor: boolean }) {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const submitMutation = useSubmitAssignment(classroomId, assignment._id);

  const { data: submissions } = useGetSubmissions(classroomId, isInstructor ? assignment._id : '');
  const gradeMutation = useGradeSubmission(classroomId, assignment._id);

  const [selectedSubId, setSelectedSubId] = useState<string | null>(null);
  const [gradeInput, setGradeInput] = useState<number>(100);
  const [feedbackInput, setFeedbackInput] = useState<string>('');

  const handleStudentSubmit = async () => {
    if (selectedFiles.length === 0) return;
    await submitMutation.mutateAsync(selectedFiles);
    setSelectedFiles([]);
  };

  const handleGradeSubmit = async (submissionId: string) => {
    await gradeMutation.mutateAsync({
      submissionId,
      grade: gradeInput,
      feedback: feedbackInput,
    });
    setSelectedSubId(null);
  };

  const isPastDue = new Date(assignment.due_date) < new Date();

  return (
    <Card className="border border-border/60 bg-card hover:border-border transition">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-primary" />
              {assignment.title}
            </CardTitle>
            {assignment.description && <CardDescription>{assignment.description}</CardDescription>}
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs">
              {assignment.points} Points
            </Badge>
            <Badge variant={isPastDue ? 'destructive' : 'secondary'} className="text-xs flex items-center gap-1">
              <Calendar className="w-3 h-3" />
              Due {format(new Date(assignment.due_date), 'MMM d, h:mm a')}
            </Badge>
          </div>
        </div>
      </CardHeader>

      <CardContent className="pt-0">
        {!isInstructor ? (
          /* Student Submission Workspace */
          <div className="mt-2 pt-3 border-t border-border/40 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="space-y-1">
              <span className="text-xs font-medium text-muted-foreground">Your Work Submission:</span>
              <Input
                type="file"
                multiple
                className="text-xs"
                onChange={(e) => e.target.files && setSelectedFiles(Array.from(e.target.files))}
              />
            </div>
            <Button
              size="sm"
              disabled={submitMutation.isPending || selectedFiles.length === 0}
              onClick={handleStudentSubmit}
            >
              <Upload className="w-4 h-4 mr-1" />
              Turn In Assignment
            </Button>
          </div>
        ) : (
          /* Teacher Grading Workspace */
          <div className="mt-3 pt-3 border-t border-border/40 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                <FileCheck className="w-3.5 h-3.5" />
                Student Submissions ({submissions?.length || 0})
              </h4>
            </div>

            {!submissions || submissions.length === 0 ? (
              <p className="text-xs text-muted-foreground italic">No submissions turned in yet.</p>
            ) : (
              <div className="divide-y divide-border/40">
                {submissions.map((sub) => (
                  <div key={sub._id} className="py-2 flex items-center justify-between text-xs">
                    <div>
                      <span className="font-medium text-foreground">{sub.studentName || 'Student'}</span>
                      <span className="ml-2 text-muted-foreground">({sub.studentEmail})</span>
                      <div className="flex items-center gap-2 mt-0.5">
                        <Badge variant={sub.status === 'returned' ? 'default' : 'secondary'} className="text-[10px]">
                          {sub.status}
                        </Badge>
                        {sub.grade !== undefined && (
                          <span className="font-semibold text-primary">Score: {sub.grade}/{assignment.points}</span>
                        )}
                      </div>
                    </div>

                    <Dialog open={selectedSubId === sub._id} onOpenChange={(open) => !open && setSelectedSubId(null)}>
                      <DialogTrigger asChild>
                        <Button
                          size="xs"
                          variant="outline"
                          onClick={() => {
                            setSelectedSubId(sub._id);
                            setGradeInput(sub.grade ?? assignment.points);
                            setFeedbackInput(sub.teacher_feedback ?? '');
                          }}
                        >
                          <Award className="w-3 h-3 mr-1" />
                          {sub.status === 'returned' ? 'Regrade' : 'Grade & Return'}
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="sm:max-w-md">
                        <DialogHeader>
                          <DialogTitle>Grade Submission - {sub.studentName}</DialogTitle>
                        </DialogHeader>
                        <div className="space-y-4 pt-2">
                          <div>
                            <label className="text-xs font-medium">Submitted Files</label>
                            <div className="mt-1 space-y-1">
                              {sub.submitted_files?.map((f, i) => (
                                <a
                                  key={i}
                                  href={`${import.meta.env.VITE_SOCKET_URL || 'http://localhost:3141'}${f}`}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-xs text-primary underline block"
                                >
                                  {f.split('-').pop()}
                                </a>
                              )) || <p className="text-xs text-muted-foreground">No files attached</p>}
                            </div>
                          </div>
                          <div>
                            <label className="text-xs font-medium">Grade (Max {assignment.points})</label>
                            <Input
                              type="number"
                              max={assignment.points}
                              value={gradeInput}
                              onChange={(e) => setGradeInput(Number(e.target.value))}
                            />
                          </div>
                          <div>
                            <label className="text-xs font-medium">Teacher Feedback</label>
                            <Textarea
                              placeholder="Provide feedback..."
                              value={feedbackInput}
                              onChange={(e) => setFeedbackInput(e.target.value)}
                              rows={2}
                            />
                          </div>
                          <div className="flex justify-end gap-2">
                            <Button type="button" variant="outline" onClick={() => setSelectedSubId(null)}>
                              Cancel
                            </Button>
                            <Button onClick={() => handleGradeSubmit(sub._id)}>
                              Return Grade
                            </Button>
                          </div>
                        </div>
                      </DialogContent>
                    </Dialog>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
