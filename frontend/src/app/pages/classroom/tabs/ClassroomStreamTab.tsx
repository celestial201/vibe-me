import React, { useState } from 'react';
import {
  useGetAnnouncements,
  useGetPendingAnnouncements,
  useModerateAnnouncement,
  useCreateAnnouncement,
  useClassroomSocket,
  useGetStudentEnrollmentStatus,
} from '@/hooks/classroom-lms-hooks';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  MessageSquare,
  Paperclip,
  Send,
  FileText,
  User,
  Check,
  X,
  ShieldAlert,
  Sparkles,
  Loader2,
  Lock,
  Download,
  Eye,
  FileArchive,
  Film,
  Image as ImageIcon,
} from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/utils/utils';
import { toast } from 'sonner';

interface Props {
  classroomId: string;
  isInstructor?: boolean;
  streamPostingPermission?: 'everyone' | 'teacher_only';
}

const MAX_FILE_SIZE = 15 * 1024 * 1024; // 15 MB
const ALLOWED_EXTENSIONS = ['pdf', 'docx', 'zip', 'png', 'jpg', 'jpeg', 'mp4'];

export function ClassroomStreamTab({
  classroomId,
  isInstructor = false,
  streamPostingPermission = 'everyone',
}: Props) {
  useClassroomSocket(classroomId);
  const { data: announcements, isLoading } = useGetAnnouncements(classroomId);
  const { data: pendingAnnouncements } = useGetPendingAnnouncements(classroomId, isInstructor);
  const createMutation = useCreateAnnouncement(classroomId);
  const moderateMutation = useModerateAnnouncement(classroomId);

  const [content, setContent] = useState('');
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [previewMedia, setPreviewMedia] = useState<{ url: string; title: string; type: 'pdf' | 'image' | 'video' } | null>(null);

  const canStudentPost = isInstructor || streamPostingPermission === 'everyone';

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const files = Array.from(e.target.files);
      const validFiles: File[] = [];

      for (const file of files) {
        if (file.size > MAX_FILE_SIZE) {
          toast.error(`"${file.name}" exceeds the 15 MB upload limit.`);
          continue;
        }
        const ext = file.name.split('.').pop()?.toLowerCase() || '';
        if (!ALLOWED_EXTENSIONS.includes(ext)) {
          toast.error(`"${file.name}" is not supported. Allowed formats: PDF, DOCX, ZIP, PNG, JPG, MP4.`);
          continue;
        }
        validFiles.push(file);
      }
      setSelectedFiles(validFiles);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim()) return;
    if (!canStudentPost) {
      toast.error('Only teachers can post announcements in this classroom.');
      return;
    }
    await createMutation.mutateAsync({ content, files: selectedFiles });
    setContent('');
    setSelectedFiles([]);
  };

  const getMediaUrl = (path: string) => {
    if (path.startsWith('http')) return path;
    const baseUrl = import.meta.env.VITE_SOCKET_URL || 'http://localhost:3141';
    return `${baseUrl}${path}`;
  };

  const getFileIcon = (ext: string) => {
    switch (ext) {
      case 'pdf':
        return <FileText className="w-4 h-4 text-red-500 shrink-0" />;
      case 'png':
      case 'jpg':
      case 'jpeg':
        return <ImageIcon className="w-4 h-4 text-blue-500 shrink-0" />;
      case 'mp4':
        return <Film className="w-4 h-4 text-purple-500 shrink-0" />;
      case 'zip':
        return <FileArchive className="w-4 h-4 text-amber-500 shrink-0" />;
      default:
        return <FileText className="w-4 h-4 text-primary shrink-0" />;
    }
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Create Announcement Card */}
      {canStudentPost ? (
        <Card className="border border-border/60 shadow-xs bg-card">
          <CardContent className="pt-6">
            <form onSubmit={handleSubmit} className="space-y-3">
              <Textarea
                placeholder="Announce something to your class..."
                value={content}
                onChange={(e) => setContent(e.target.value)}
                className="min-h-[90px] text-sm resize-none focus-visible:ring-1"
              />
              <div className="flex items-center justify-between pt-1">
                <div className="flex items-center gap-2">
                  <label className="cursor-pointer inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition px-2.5 py-1.5 rounded-md hover:bg-muted">
                    <Paperclip className="w-4 h-4" />
                    <span>Attach File (15MB max)</span>
                    <input
                      type="file"
                      multiple
                      accept=".pdf,.docx,.zip,.png,.jpg,.jpeg,.mp4"
                      onChange={handleFileChange}
                      className="hidden"
                    />
                  </label>
                  {selectedFiles.length > 0 && (
                    <span className="text-xs text-primary font-medium">
                      {selectedFiles.length} file(s) selected
                    </span>
                  )}
                </div>
                <Button
                  type="submit"
                  size="sm"
                  disabled={createMutation.isPending || !content.trim()}
                  className="gap-1.5"
                >
                  <Send className="w-3.5 h-3.5" />
                  Post Announcement
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      ) : (
        <Card className="border border-amber-500/30 bg-amber-500/5">
          <CardContent className="py-4 flex items-center gap-3 text-amber-700 dark:text-amber-400 text-xs font-medium">
            <Lock className="w-4 h-4 text-amber-500 shrink-0" />
            <span>Posting in this classroom stream is restricted to teachers only.</span>
          </CardContent>
        </Card>
      )}

      {/* Pending Approvals List (Teacher View Only) */}
      {isInstructor && pendingAnnouncements && pendingAnnouncements.length > 0 && (
        <Card className="border-amber-500/40 bg-amber-500/5">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold text-amber-600 dark:text-amber-400 flex items-center gap-2">
              <ShieldAlert className="w-4 h-4" />
              Pending Student Announcements ({pendingAnnouncements.length})
            </CardTitle>
            <CardDescription className="text-xs text-muted-foreground">
              Review and approve student posts before they appear on the main feed.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {pendingAnnouncements.map((post) => (
              <Card key={post._id} className="border-amber-500/20 bg-background/80">
                <CardHeader className="py-2.5 px-4 flex flex-row items-center justify-between">
                  <div>
                    <span className="text-xs font-semibold">{post.authorName || 'Student'}</span>
                    <p className="text-[10px] text-muted-foreground">
                      {format(new Date(post.createdAt), 'MMM d, yyyy • h:mm a')}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Button
                      size="xs"
                      variant="outline"
                      className="bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20 border-emerald-500/30"
                      onClick={() => moderateMutation.mutate({ announcementId: post._id, action: 'approve' })}
                    >
                      <Check className="w-3 h-3 mr-1" />
                      Approve
                    </Button>
                    <Button
                      size="xs"
                      variant="outline"
                      className="bg-destructive/10 text-destructive hover:bg-destructive/20 border-destructive/30"
                      onClick={() => moderateMutation.mutate({ announcementId: post._id, action: 'reject' })}
                    >
                      <X className="w-3 h-3 mr-1" />
                      Reject
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="py-2 px-4 text-xs text-foreground">
                  {post.content}
                </CardContent>
              </Card>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Approved Stream Feed */}
      <div className="space-y-4">
        {isLoading ? (
          <div className="text-center py-8 text-sm text-muted-foreground">Loading stream announcements...</div>
        ) : !announcements || announcements.length === 0 ? (
          <div className="text-center py-12 border border-dashed rounded-lg text-muted-foreground text-sm">
            No announcements posted yet. Start the conversation!
          </div>
        ) : (
          announcements.map((post) => {
            const announcement = post as any;
            const isCourseInvitation =
              announcement.type === 'course_invitation' ||
              Boolean(announcement.metadata?.course_id) ||
              Boolean(announcement.metadata?.courseId) ||
              announcement.content?.includes('Course') ||
              announcement.content?.includes('🎉 Course');

            const metadata = announcement.metadata;
            let courseTitle = metadata?.course_title || metadata?.courseTitle || '';
            if (!courseTitle && post.content.includes('Course:')) {
              courseTitle = post.content.split('Course:')[1]?.split('.')[0]?.trim() || '';
            }

            return (
              <Card
                key={post._id}
                className={cn(
                  'border transition',
                  isCourseInvitation
                    ? 'border-amber-500/40 bg-gradient-to-r from-amber-500/5 via-background to-primary/5 shadow-xs'
                    : 'border-border/40 bg-card hover:border-border'
                )}
              >
                <CardHeader className="pb-2 flex flex-row items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div
                      className={cn(
                        'w-9 h-9 rounded-full flex items-center justify-center font-medium',
                        isCourseInvitation ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400' : 'bg-primary/10 text-primary'
                      )}
                    >
                      {isCourseInvitation ? <Sparkles className="w-5 h-5 text-amber-500" /> : <User className="w-5 h-5" />}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="text-sm font-semibold text-foreground">{post.authorName || 'Instructor'}</h4>
                        {isCourseInvitation && (
                          <Badge variant="secondary" className="bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30 text-[10px]">
                            Classroom Course
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {format(new Date(post.createdAt), 'MMM d, yyyy • h:mm a')}
                      </p>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">{post.content}</p>

                  {post.attachments && post.attachments.length > 0 && (
                    <div className="pt-2 border-t border-border/40 grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {post.attachments.map((fileUrl, idx) => {
                        const filename = fileUrl.split('/').pop() || 'Attachment';
                        const ext = filename.split('.').pop()?.toLowerCase() || '';
                        const fullUrl = getMediaUrl(fileUrl);
                        const isPreviewable = ['pdf', 'png', 'jpg', 'jpeg', 'mp4'].includes(ext);

                        return (
                          <div
                            key={idx}
                            className="flex items-center justify-between gap-2 p-2 rounded border border-border/60 bg-muted/40 text-xs transition"
                          >
                            <div className="flex items-center gap-2 truncate">
                              {getFileIcon(ext)}
                              <span className="truncate">{filename}</span>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              {isPreviewable ? (
                                <Button
                                  size="xs"
                                  variant="ghost"
                                  className="h-6 text-[11px] gap-1 text-primary hover:text-primary/80"
                                  onClick={() =>
                                    setPreviewMedia({
                                      url: fullUrl,
                                      title: filename,
                                      type: ext === 'pdf' ? 'pdf' : ext === 'mp4' ? 'video' : 'image',
                                    })
                                  }
                                >
                                  <Eye className="w-3 h-3" />
                                  Preview
                                </Button>
                              ) : (
                                <a
                                  href={fullUrl}
                                  download
                                  target="_blank"
                                  rel="noreferrer"
                                  className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline px-2 py-1"
                                >
                                  <Download className="w-3 h-3" />
                                  Download
                                </a>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })
        )}
      </div>

      {/* Interactive Media / PDF Preview Modal */}
      <Dialog open={Boolean(previewMedia)} onOpenChange={(open) => !open && setPreviewMedia(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] p-4 flex flex-col">
          <DialogHeader className="pb-2 flex flex-row items-center justify-between">
            <DialogTitle className="text-sm font-semibold truncate">
              {previewMedia?.title}
            </DialogTitle>
            {previewMedia?.url && (
              <a
                href={previewMedia.url}
                download
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-xs text-primary font-medium hover:underline mr-6"
              >
                <Download className="w-3.5 h-3.5" />
                Download Original
              </a>
            )}
          </DialogHeader>
          <div className="flex-1 overflow-auto rounded-lg bg-black/5 dark:bg-black/40 flex items-center justify-center p-2 min-h-[50vh]">
            {previewMedia?.type === 'pdf' && (
              <iframe
                src={previewMedia.url}
                className="w-full h-[70vh] rounded-md border-0"
                title={previewMedia.title}
              />
            )}
            {previewMedia?.type === 'image' && (
              <img
                src={previewMedia.url}
                alt={previewMedia.title}
                className="max-h-[75vh] max-w-full object-contain rounded-md shadow-md"
              />
            )}
            {previewMedia?.type === 'video' && (
              <video
                src={previewMedia.url}
                controls
                className="max-h-[75vh] max-w-full rounded-md shadow-md"
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

const extractFlatStringId = (val: any): string => {
  if (!val) return '';
  if (typeof val === 'string') {
    if (val === '[object Object]') return '';
    return val;
  }
  if (typeof val === 'object') {
    if (typeof val.$oid === 'string') return val.$oid;
    if (typeof val._id === 'string') return val._id;
    if (typeof val.courseId === 'string') return val.courseId;
    if (typeof val.course_id === 'string') return val.course_id;
    if (typeof val.toString === 'function') {
      const str = val.toString();
      if (str && str !== '[object Object]') return str;
    }
  }
  return '';
};

function CourseInvitationStreamAction({
  classroomId,
  courseId: rawCourseId,
  courseTitle,
  isInstructor,
  announcement,
}: {
  classroomId: string;
  courseId: any;
  courseTitle: string;
  isInstructor: boolean;
  announcement?: any;
}) {
  const startMutation = useStartClassroomCourse(classroomId);
  const { data: statusList } = useGetStudentEnrollmentStatus(classroomId);

  const courseId =
    extractFlatStringId(announcement?.metadata?.courseId) ||
    extractFlatStringId(announcement?.metadata?.course_id) ||
    extractFlatStringId(announcement?.referenceId) ||
    extractFlatStringId(announcement?.metadata?.course?._id) ||
    (typeof announcement?.metadata?.course === 'string' && announcement.metadata.course !== '[object Object]'
      ? announcement.metadata.course
      : '') ||
    extractFlatStringId(rawCourseId) ||
    (statusList && statusList.length > 0 ? extractFlatStringId(statusList[0]?.courseId) : '');

  const statusDoc = statusList?.find((s) => {
    const sId = extractFlatStringId(s.courseId) || extractFlatStringId((s as any).course_id);
    return sId && sId === courseId;
  });

  const isAccepted =
    statusDoc?.accepted || statusDoc?.status === 'accepted' || statusDoc?.status === 'active';

  if (isInstructor) {
    return (
      <div className="mt-1 p-2.5 rounded-lg border border-amber-500/20 bg-amber-500/10 flex items-center justify-between">
        <span className="text-xs font-semibold text-amber-700 dark:text-amber-400">
          Pushed Course: {courseTitle || 'Assigned Course'}
        </span>
        <Badge variant="outline" className="text-[10px] border-amber-500/50 text-amber-600">
          Instructor View
        </Badge>
      </div>
    );
  }

  return (
    <div className="mt-1 flex items-center justify-between gap-3 pt-1">
      <span className="text-[11px] text-muted-foreground">
        {isAccepted
          ? 'Invitation accepted. Added to your My Courses panel.'
          : 'Click below to accept and start learning.'}
      </span>

      {isAccepted ? (
        <Badge className="bg-emerald-600 text-white hover:bg-emerald-700 text-xs px-3 py-1 flex items-center gap-1 shrink-0">
          <Check className="w-3.5 h-3.5" />
          Accepted & Active
        </Badge>
      ) : (
        <Button
          size="sm"
          className="bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold shrink-0 cursor-pointer shadow-xs"
          disabled={startMutation.isPending}
          onClick={() => {
            const targetCourseId =
              courseId ||
              (statusList && statusList.length > 0 ? extractFlatStringId(statusList[0]?.courseId) : '');

            if (targetCourseId) {
              startMutation.mutate(targetCourseId);
            } else {
              toast.error('Course ID missing from invitation announcement.');
            }
          }}
        >
          {startMutation.isPending ? (
            <>
              <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
              Accepting...
            </>
          ) : (
            <>
              <Sparkles className="w-3.5 h-3.5 mr-1" />
              Accept Invitation
            </>
          )}
        </Button>
      )}
    </div>
  );
}
