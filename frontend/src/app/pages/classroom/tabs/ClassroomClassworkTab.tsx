import React, { useState } from 'react';
import {
  useGetAssignments,
  useCreateAssignment,
  useSubmitAssignment,
  useGetSubmissions,
  useGradeSubmission,
  useGetAssignmentComments,
  useAddAssignmentComment,
  useToggleVerifyComment,
} from '@/hooks/classroom-lms-hooks';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import {
  BookOpen,
  Plus,
  Calendar,
  FileCheck,
  Upload,
  CheckCircle2,
  Clock,
  Award,
  MessageSquare,
  Check,
  Send,
  HelpCircle,
  Paperclip,
  FileText,
  Download,
} from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';

interface Props {
  classroomId: string;
  isInstructor: boolean;
}

const MAX_FILE_SIZE = 15 * 1024 * 1024; // 15 MB

interface QAComment {
  id: string;
  authorName: string;
  authorRole: 'teacher' | 'student';
  content: string;
  isVerifiedAnswer?: boolean;
  createdAt: string;
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

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const files = Array.from(e.target.files);
      for (const f of files) {
        if (f.size > MAX_FILE_SIZE) {
          toast.error(`"${f.name}" exceeds the 15 MB attachment limit.`);
          return;
        }
      }
      setAssignmentFiles(files);
    }
  };

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
          <h2 className="text-xl font-bold tracking-tight text-foreground">Classwork & Assignments</h2>
          <p className="text-xs text-muted-foreground">
            Manage course tasks, flexible resubmissions, late turn-ins, and assignment Q&A.
          </p>
        </div>
        {isInstructor && (
          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-1.5 shadow-xs">
                <Plus className="w-4 h-4" />
                Create Assignment
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg">
              <DialogHeader>
                <DialogTitle>Create New Assignment</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleCreateAssignment} className="space-y-4 pt-2">
                <div>
                  <label className="text-xs font-medium">Assignment Title *</label>
                  <Input
                    required
                    placeholder="e.g. Project 1: Full-stack LMS API"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-xs font-medium">Instructions & Details</label>
                  <Textarea
                    placeholder="Describe task guidelines, rubrics, and submission format..."
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={3}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium">Total Points</label>
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
                  <label className="text-xs font-medium">Attachments (15 MB Max per file)</label>
                  <Input
                    type="file"
                    multiple
                    onChange={handleFileChange}
                    className="text-xs cursor-pointer"
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
        <div className="text-center py-12 text-muted-foreground text-sm">Loading classroom assignments...</div>
      ) : !assignments || assignments.length === 0 ? (
        <Card className="border border-dashed py-12 text-center bg-card">
          <CardContent>
            <p className="text-sm text-muted-foreground">No assignments published in this classroom yet.</p>
          </CardContent>
        </Card>
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

const getAttachmentUrl = (path: string) => {
  if (!path) return '';
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  const baseUrl = (import.meta.env.VITE_BASE_URL || 'http://localhost:3141/api').replace(/\/api\/?$/, '');
  return `${baseUrl}${path.startsWith('/') ? '' : '/'}${path}`;
};

const getAttachmentName = (path: string) => {
  if (!path) return 'Attachment';
  const parts = path.split('/');
  const raw = parts[parts.length - 1] || 'Attachment';
  return raw.replace(/^\d+-\d+-/, '').replace(/^\d+-/, '') || raw;
};

const isImageAttachment = (path: string) => {
  return /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(path);
};

const isPdfAttachment = (path: string) => {
  return /\.pdf$/i.test(path);
};

function AssignmentCard({
  assignment,
  classroomId,
  isInstructor,
}: {
  assignment: any;
  classroomId: string;
  isInstructor: boolean;
}) {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const submitMutation = useSubmitAssignment(classroomId, assignment._id);
  const { data: submissions } = useGetSubmissions(classroomId, isInstructor ? assignment._id : '');
  const gradeMutation = useGradeSubmission(classroomId, assignment._id);

  const [selectedSubId, setSelectedSubId] = useState<string | null>(null);
  const [gradeInput, setGradeInput] = useState<number>(100);
  const [feedbackInput, setFeedbackInput] = useState<string>('');

  // Contextual Q&A drawer state & backend queries
  const [isQaOpen, setIsQaOpen] = useState(false);
  const [qaQuestion, setQaQuestion] = useState('');

  const { data: serverComments = [] } = useGetAssignmentComments(
    classroomId,
    assignment._id,
    true,
  );
  const addCommentMutation = useAddAssignmentComment(classroomId, assignment._id);
  const toggleVerifyMutation = useToggleVerifyComment(classroomId, assignment._id);

  const comments = serverComments;

  const handleStudentFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const files = Array.from(e.target.files);
      for (const f of files) {
        if (f.size > MAX_FILE_SIZE) {
          toast.error(`"${f.name}" exceeds the 15 MB limit.`);
          return;
        }
      }
      setSelectedFiles(files);
    }
  };

  const handleStudentSubmit = async () => {
    if (selectedFiles.length === 0) {
      toast.error('Please attach at least one file before submitting.');
      return;
    }
    await submitMutation.mutateAsync(selectedFiles);
    setSelectedFiles([]);
    toast.success('Assignment work turned in successfully!');
  };

  const handleGradeSubmit = async (submissionId: string) => {
    await gradeMutation.mutateAsync({
      submissionId,
      grade: gradeInput,
      feedback: feedbackInput,
    });
    setSelectedSubId(null);
  };

  const handleAddQaComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!qaQuestion.trim() || addCommentMutation.isPending) return;
    try {
      await addCommentMutation.mutateAsync(qaQuestion.trim());
      setQaQuestion('');
    } catch (_) {}
  };

  const toggleVerifiedAnswer = async (commentId: string) => {
    if (!isInstructor || toggleVerifyMutation.isPending) return;
    try {
      await toggleVerifyMutation.mutateAsync(commentId);
    } catch (_) {}
  };

  const dueDate = new Date(assignment.due_date);
  const isPastDue = dueDate < new Date();

  return (
    <Card className="border border-border/60 bg-card hover:border-border transition shadow-xs">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between flex-wrap gap-2">
          <div className="space-y-1">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-primary" />
              {assignment.title}
            </CardTitle>
            {assignment.description && (
              <CardDescription className="text-xs text-muted-foreground">{assignment.description}</CardDescription>
            )}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="outline" className="text-xs">
              {assignment.points} Points
            </Badge>
            <Badge variant={isPastDue ? 'destructive' : 'secondary'} className="text-xs flex items-center gap-1">
              <Calendar className="w-3 h-3" />
              Due {format(dueDate, 'MMM d, h:mm a')}
            </Badge>
            {isPastDue && (
              <Badge className="bg-red-600 text-white text-[10px] px-2 py-0.5">
                Submitted Late Allowed
              </Badge>
            )}
            <Sheet open={isQaOpen} onOpenChange={setIsQaOpen}>
              <SheetTrigger asChild>
                <Button size="xs" variant="outline" className="gap-1 text-xs">
                  <MessageSquare className="w-3.5 h-3.5" />
                  Q&A Thread ({comments.length})
                </Button>
              </SheetTrigger>
              <SheetContent className="sm:max-w-md flex flex-col justify-between">
                <SheetHeader className="pb-3 border-b border-border/40">
                  <SheetTitle className="text-base flex items-center gap-2">
                    <HelpCircle className="w-4 h-4 text-primary" />
                    Assignment Q&A Thread
                  </SheetTitle>
                  <p className="text-xs text-muted-foreground">
                    Discuss questions and solution hints for {assignment.title}.
                  </p>
                </SheetHeader>

                {/* Q&A Comments List */}
                <div className="flex-1 overflow-y-auto space-y-3 py-4 pr-1">
                  {comments.length === 0 ? (
                    <p className="text-xs text-muted-foreground italic py-6 text-center">
                      No questions in this Q&A thread yet. Be the first to ask a question!
                    </p>
                  ) : (
                    comments.map((c: any) => {
                      const commentId = c._id || c.id;
                      return (
                        <div key={commentId} className="p-3 rounded-lg border border-border/50 bg-muted/30 space-y-1.5 text-xs">
                          <div className="flex items-center justify-between">
                            <span className="font-semibold text-foreground flex items-center gap-1.5">
                              {c.authorName || 'User'}
                              <Badge variant="outline" className="text-[9px] px-1 py-0 capitalize">
                                {c.authorRole || 'student'}
                              </Badge>
                            </span>
                            {c.isVerifiedAnswer && (
                              <Badge className="bg-emerald-600 text-white text-[9px] px-1.5 py-0 flex items-center gap-0.5">
                                <Check className="w-3 h-3" /> Verified Answer
                              </Badge>
                            )}
                          </div>
                          <p className="text-foreground leading-relaxed whitespace-pre-wrap">{c.content}</p>
                          {isInstructor && (
                            <Button
                              size="xs"
                              variant="ghost"
                              className="h-5 text-[10px] text-emerald-600 hover:text-emerald-700 p-0"
                              onClick={() => toggleVerifiedAnswer(commentId)}
                              disabled={toggleVerifyMutation.isPending}
                            >
                              {c.isVerifiedAnswer ? 'Unmark Verified' : 'Mark as Verified Answer'}
                            </Button>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>

                {/* Add Comment Input */}
                <form onSubmit={handleAddQaComment} className="pt-3 border-t border-border/40 flex items-center gap-2">
                  <Input
                    placeholder="Ask a question or share a tip..."
                    value={qaQuestion}
                    onChange={(e) => setQaQuestion(e.target.value)}
                    className="text-xs h-9"
                  />
                  <Button type="submit" size="sm" className="h-9 px-3" disabled={addCommentMutation.isPending || !qaQuestion.trim()}>
                    <Send className="w-3.5 h-3.5" />
                  </Button>
                </form>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </CardHeader>

      <CardContent className="pt-0 space-y-4">
        {/* Teacher Uploaded Attachments / Shared Documents */}
        {assignment.attachments && assignment.attachments.length > 0 && (
          <div className="pt-1 space-y-2">
            <span className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
              <Paperclip className="w-3.5 h-3.5 text-primary" />
              Attached Teacher Resources & Documents ({assignment.attachments.length}):
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {assignment.attachments.map((attUrl: string, idx: number) => {
                const fullUrl = getAttachmentUrl(attUrl);
                const fileName = getAttachmentName(attUrl);
                const isImg = isImageAttachment(attUrl);
                const isPdf = isPdfAttachment(attUrl);

                return (
                  <div
                    key={idx}
                    className="p-2.5 rounded-lg border border-border/60 bg-muted/20 hover:bg-muted/40 transition group"
                  >
                    {isImg ? (
                      <div className="space-y-1.5">
                        <a
                          href={fullUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="block overflow-hidden rounded border border-border/40 max-h-40 bg-black/10"
                        >
                          <img
                            src={fullUrl}
                            alt={fileName}
                            className="w-full object-cover max-h-40 group-hover:scale-105 transition-transform duration-200"
                          />
                        </a>
                        <div className="flex items-center justify-between gap-2 text-xs">
                          <span className="truncate font-medium text-foreground text-[11px]" title={fileName}>
                            {fileName}
                          </span>
                          <Button size="xs" variant="ghost" className="h-6 text-[10px] gap-1 text-primary shrink-0" asChild>
                            <a href={fullUrl} target="_blank" rel="noreferrer">
                              View Image
                            </a>
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          {isPdf ? (
                            <div className="w-7 h-7 rounded bg-rose-500/10 text-rose-500 flex items-center justify-center shrink-0">
                              <FileText className="w-4 h-4" />
                            </div>
                          ) : (
                            <div className="w-7 h-7 rounded bg-primary/10 text-primary flex items-center justify-center shrink-0">
                              <Paperclip className="w-4 h-4" />
                            </div>
                          )}
                          <div className="min-w-0">
                            <p className="font-medium text-foreground text-[11px] truncate" title={fileName}>
                              {fileName}
                            </p>
                            <p className="text-[10px] text-muted-foreground uppercase font-mono">
                              {isPdf ? 'PDF Document' : 'Attachment'}
                            </p>
                          </div>
                        </div>
                        <Button size="xs" variant="outline" className="h-7 text-[11px] gap-1 shrink-0" asChild>
                          <a href={fullUrl} target="_blank" rel="noreferrer">
                            <Download className="w-3 h-3" />
                            View / Open
                          </a>
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {!isInstructor ? (
          /* Student Submission Workspace (Resubmissions Allowed) */
          <div className="mt-2 pt-3 border-t border-border/40 space-y-3">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div className="space-y-1 w-full sm:w-auto">
                <span className="text-xs font-medium text-muted-foreground block">
                  Turn-in / Resubmit Work (15 MB Max per file):
                </span>
                <Input
                  type="file"
                  multiple
                  className="text-xs cursor-pointer"
                  onChange={handleStudentFileSelect}
                />
              </div>
              <Button
                size="sm"
                className="gap-1.5 text-xs shrink-0"
                disabled={submitMutation.isPending || selectedFiles.length === 0}
                onClick={handleStudentSubmit}
              >
                <Upload className="w-3.5 h-3.5" />
                {isPastDue ? 'Resubmit Work (Late)' : 'Turn In / Resubmit Work'}
              </Button>
            </div>
            {isPastDue && (
              <p className="text-[11px] text-amber-600 dark:text-amber-400 font-medium">
                Note: This assignment is past due. Your submission will carry a red "Submitted Late" tag.
              </p>
            )}
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
                  <div key={sub._id} className="py-3 space-y-2.5 text-xs">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div>
                        <span className="font-medium text-foreground">{sub.studentName || 'Student'}</span>
                        <span className="ml-2 text-muted-foreground">({sub.studentEmail})</span>
                        <div className="flex items-center gap-2 mt-0.5">
                          <Badge variant={sub.status === 'returned' ? 'default' : 'secondary'} className="text-[10px]">
                            {sub.status}
                          </Badge>
                          {new Date(sub.submitted_at || sub.createdAt || 0) > dueDate && (
                            <Badge className="bg-red-600 text-white text-[9px] px-1.5 py-0">
                              Submitted Late
                            </Badge>
                          )}
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
                              <label className="text-xs font-medium block mb-1">Submitted Files</label>
                              {sub.submitted_files && sub.submitted_files.length > 0 ? (
                                <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                                  {sub.submitted_files.map((f, i) => {
                                    const fullUrl = getAttachmentUrl(f);
                                    const fileName = getAttachmentName(f);
                                    const isPdf = isPdfAttachment(f);
                                    const isImg = isImageAttachment(f);
                                    return (
                                      <div
                                        key={i}
                                        className="flex items-center justify-between gap-2 p-2 rounded border border-border/60 bg-muted/20 text-xs"
                                      >
                                        <div className="flex items-center gap-2 min-w-0 flex-1">
                                          {isPdf ? (
                                            <FileText className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                                          ) : isImg ? (
                                            <FileText className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                                          ) : (
                                            <Paperclip className="w-3.5 h-3.5 text-primary shrink-0" />
                                          )}
                                          <span className="truncate font-medium text-[11px]" title={fileName}>
                                            {fileName}
                                          </span>
                                        </div>
                                        <Button size="xs" variant="outline" className="h-6 text-[10px] gap-1 shrink-0 px-2" asChild>
                                          <a href={fullUrl} target="_blank" rel="noreferrer">
                                            <Download className="w-3 h-3" />
                                            View / Open
                                          </a>
                                        </Button>
                                      </div>
                                    );
                                  })}
                                </div>
                              ) : (
                                <p className="text-xs text-muted-foreground italic">No files attached</p>
                              )}
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

                    {/* Student Submitted Documents Display */}
                    {sub.submitted_files && sub.submitted_files.length > 0 ? (
                      <div className="pt-1 space-y-1.5">
                        <span className="text-[11px] font-semibold text-muted-foreground flex items-center gap-1.5">
                          <Paperclip className="w-3.5 h-3.5 text-primary" />
                          Submitted Document{sub.submitted_files.length > 1 ? 's' : ''} ({sub.submitted_files.length}):
                        </span>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {sub.submitted_files.map((f, i) => {
                            const fullUrl = getAttachmentUrl(f);
                            const fileName = getAttachmentName(f);
                            const isImg = isImageAttachment(f);
                            const isPdf = isPdfAttachment(f);

                            return (
                              <div
                                key={i}
                                className="p-2 rounded-lg border border-border/60 bg-muted/20 hover:bg-muted/40 transition group"
                              >
                                {isImg ? (
                                  <div className="space-y-1.5">
                                    <a
                                      href={fullUrl}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="block overflow-hidden rounded border border-border/40 max-h-36 bg-black/10"
                                    >
                                      <img
                                        src={fullUrl}
                                        alt={fileName}
                                        className="w-full object-cover max-h-36 group-hover:scale-105 transition-transform duration-200"
                                      />
                                    </a>
                                    <div className="flex items-center justify-between gap-2 text-xs">
                                      <span className="truncate font-medium text-foreground text-[11px]" title={fileName}>
                                        {fileName}
                                      </span>
                                      <Button size="xs" variant="ghost" className="h-6 text-[10px] gap-1 text-primary shrink-0" asChild>
                                        <a href={fullUrl} target="_blank" rel="noreferrer">
                                          View Image
                                        </a>
                                      </Button>
                                    </div>
                                  </div>
                                ) : (
                                  <div className="flex items-center justify-between gap-2 text-xs">
                                    <div className="flex items-center gap-2 min-w-0 flex-1">
                                      {isPdf ? (
                                        <div className="w-7 h-7 rounded bg-rose-500/10 text-rose-500 flex items-center justify-center shrink-0">
                                          <FileText className="w-4 h-4" />
                                        </div>
                                      ) : (
                                        <div className="w-7 h-7 rounded bg-primary/10 text-primary flex items-center justify-center shrink-0">
                                          <Paperclip className="w-4 h-4" />
                                        </div>
                                      )}
                                      <div className="min-w-0">
                                        <p className="font-medium text-foreground text-[11px] truncate" title={fileName}>
                                          {fileName}
                                        </p>
                                        <p className="text-[10px] text-muted-foreground uppercase font-mono">
                                          {isPdf ? 'PDF Document' : 'Attachment'}
                                        </p>
                                      </div>
                                    </div>
                                    <Button size="xs" variant="outline" className="h-7 text-[11px] gap-1 shrink-0" asChild>
                                      <a href={fullUrl} target="_blank" rel="noreferrer">
                                        <Download className="w-3 h-3" />
                                        View / Open
                                      </a>
                                    </Button>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ) : (
                      <p className="text-[11px] text-muted-foreground italic">No documents attached to this submission.</p>
                    )}
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
