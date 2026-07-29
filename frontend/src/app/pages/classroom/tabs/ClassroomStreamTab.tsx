import React, { useState } from 'react';
import {
  useGetAnnouncements,
  useGetPendingAnnouncements,
  useModerateAnnouncement,
  useCreateAnnouncement,
  useClassroomSocket,
} from '@/hooks/classroom-lms-hooks';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { MessageSquare, Paperclip, Send, FileText, User, Check, X, ShieldAlert } from 'lucide-react';
import { format } from 'date-fns';

interface Props {
  classroomId: string;
  isInstructor?: boolean;
}

export function ClassroomStreamTab({ classroomId, isInstructor = false }: Props) {
  useClassroomSocket(classroomId);
  const { data: announcements, isLoading } = useGetAnnouncements(classroomId);
  const { data: pendingAnnouncements } = useGetPendingAnnouncements(classroomId);
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
      {/* Announcement Form */}
      <Card className="border border-border/60 bg-card shadow-xs">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-primary" />
            {isInstructor ? 'Announce something to your class' : 'Request an announcement'}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-3">
            <Textarea
              placeholder={
                isInstructor
                  ? 'Share an announcement, updates, or links with your students...'
                  : 'Request an announcement... (Sent to teacher for approval)'
              }
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={3}
              className="resize-none"
            />
            {selectedFiles.length > 0 && (
              <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                {selectedFiles.map((file, idx) => (
                  <span key={idx} className="bg-secondary px-2 py-1 rounded flex items-center gap-1">
                    <Paperclip className="w-3 h-3" />
                    {file.name}
                  </span>
                ))}
              </div>
            )}
            <div className="flex items-center justify-between pt-2">
              <label className="cursor-pointer inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                <Paperclip className="w-4 h-4" />
                <span>Attach Files</span>
                <input
                  type="file"
                  multiple
                  accept=".pdf,.docx,.doc,.png,.jpg,.jpeg,.webp"
                  className="hidden"
                  onChange={handleFileChange}
                />
              </label>
              <Button type="submit" disabled={createMutation.isPending || !content.trim()} size="sm">
                <Send className="w-4 h-4 mr-1" />
                {isInstructor ? 'Post Announcement' : 'Submit for Approval'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Teacher Pending Approvals Section */}
      {isInstructor && pendingAnnouncements && pendingAnnouncements.length > 0 && (
        <Card className="border border-amber-500/40 bg-amber-500/5 shadow-xs">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-bold flex items-center gap-2 text-amber-700 dark:text-amber-400">
                <ShieldAlert className="w-4 h-4" />
                Pending Announcement Requests
              </CardTitle>
              <Badge variant="outline" className="border-amber-500 text-amber-700 dark:text-amber-400">
                {pendingAnnouncements.length} Pending
              </Badge>
            </div>
            <CardDescription className="text-xs">
              Students have submitted announcement requests that require your approval before appearing on the stream.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 pt-2">
            {pendingAnnouncements.map((post) => (
              <Card key={post._id} className="border border-amber-200 dark:border-amber-900 bg-background p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <User className="w-4 h-4 text-amber-600" />
                    <span className="font-semibold text-xs">{post.authorName || 'Student'}</span>
                    <span className="text-[10px] text-muted-foreground">
                      {format(new Date(post.createdAt), 'MMM d, h:mm a')}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 px-2.5 text-xs text-emerald-600 border-emerald-500 hover:bg-emerald-500/10"
                      onClick={() => moderateMutation.mutate({ announcementId: post._id, action: 'approve' })}
                      disabled={moderateMutation.isPending}
                    >
                      <Check className="w-3 h-3 mr-1" />
                      Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 px-2.5 text-xs text-destructive border-destructive hover:bg-destructive/10"
                      onClick={() => moderateMutation.mutate({ announcementId: post._id, action: 'reject' })}
                      disabled={moderateMutation.isPending}
                    >
                      <X className="w-3 h-3 mr-1" />
                      Reject
                    </Button>
                  </div>
                </div>
                <p className="text-xs text-foreground whitespace-pre-wrap">{post.content}</p>
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
          announcements.map((post) => (
            <Card key={post._id} className="border border-border/40 bg-card hover:border-border transition">
              <CardHeader className="pb-2 flex flex-row items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-primary font-medium">
                    <User className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold text-foreground">{post.authorName || 'User'}</h4>
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
                    {post.attachments.map((fileUrl, idx) => (
                      <a
                        key={idx}
                        href={getMediaUrl(fileUrl)}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-2 p-2 rounded border border-border/60 bg-muted/40 hover:bg-muted text-xs transition"
                      >
                        <FileText className="w-4 h-4 text-primary shrink-0" />
                        <span className="truncate flex-1 font-medium">{fileUrl.split('-').pop() || 'Attachment'}</span>
                      </a>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
