import React, { useState } from 'react';
import {
  useGetAnnouncements,
  useGetPendingAnnouncements,
  useModerateAnnouncement,
  useCreateAnnouncement,
  useClassroomSocket,
  useGetStudentEnrollmentStatus,
} from '@/hooks/classroom-lms-hooks';
import { useStartClassroomCourse } from '@/hooks/classroom-hooks';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { MessageSquare, Paperclip, Send, FileText, User, Check, X, ShieldAlert, Sparkles, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/utils/utils';
import { toast } from 'sonner';

interface Props {
  classroomId: string;
  isInstructor?: boolean;
}

export function ClassroomStreamTab({ classroomId, isInstructor = false }: Props) {
  useClassroomSocket(classroomId);
  const { data: announcements, isLoading } = useGetAnnouncements(classroomId);
  const { data: pendingAnnouncements } = useGetPendingAnnouncements(classroomId, isInstructor);
  const createMutation = useCreateAnnouncement(classroomId);
  const moderateMutation = useModerateAnnouncement(classroomId);

  const [content, setContent] = useState('');
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setSelectedFiles(Array.from(e.target.files));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim()) return;
    await createMutation.mutateAsync({ content, files: selectedFiles });
    setContent('');
    setSelectedFiles([]);
  };

  const getMediaUrl = (path: string) => {
    if (path.startsWith('http')) return path;
    const baseUrl = import.meta.env.VITE_SOCKET_URL || 'http://localhost:3141';
    return `${baseUrl}${path}`;
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Create Announcement */}
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
                  <span>Attach File</span>
                  <input
                    type="file"
                    multiple
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
              announcement.content?.includes('Course Invitation') ||
              announcement.content?.includes('🎉 Course Invitation');

            const metadata = announcement.metadata;
            const courseId =
              announcement.metadata?.courseId ||
              announcement.metadata?.course_id ||
              announcement.referenceId ||
              announcement.metadata?.course?._id ||
              (typeof announcement.metadata?.course === 'string' ? announcement.metadata.course : '');

            let courseTitle = metadata?.course_title || metadata?.courseTitle || '';
            if (!courseTitle && post.content.includes('Course Invitation:')) {
              courseTitle = post.content.split('Course Invitation:')[1]?.split('.')[0]?.trim() || '';
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
                            Course Invitation
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
                  {isCourseInvitation ? (
                    <div className="p-4 rounded-xl border border-amber-500/30 bg-amber-500/5 dark:bg-amber-500/10 space-y-3">
                      <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400 font-bold text-sm">
                        <Sparkles className="w-4 h-4 text-amber-500 shrink-0" />
                        <span>Course Invitation{courseTitle ? `: ${courseTitle}` : ''}</span>
                      </div>
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        {post.content}
                      </p>
                      <CourseInvitationStreamAction
                        classroomId={classroomId}
                        courseId={courseId}
                        courseTitle={courseTitle}
                        isInstructor={isInstructor}
                        announcement={announcement}
                      />
                    </div>
                  ) : (
                    <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">{post.content}</p>
                  )}

                  {post.attachments && post.attachments.length > 0 && (
                    <div className="pt-2 border-t border-border/40 grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {post.attachments.map((fileUrl, idx) => (
                        <a
                          key={idx}
                          href={getMediaUrl(fileUrl)}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center gap-2 p-2 rounded border border-border/60 bg-muted/40 hover:bg-muted text-xs transition"
                        >
                          <FileText className="w-4 h-4 text-primary shrink-0" />
                          <span className="truncate">{fileUrl.split('/').pop()}</span>
                        </a>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })
        )}
      </div>
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
