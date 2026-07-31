import React, { useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { classroomLmsApi, PendingInvitationDTO } from '@/services/classroom-lms-api';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Mail, CheckCircle, XCircle, Sparkles, School, User, Clock, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useNavigate } from '@tanstack/react-router';
import { format } from 'date-fns';

export function PendingInvitationsBanner() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const highlightedRef = useRef<HTMLDivElement | null>(null);

  // Parse invitationId from URL query string
  const urlParams = new URLSearchParams(window.location.search);
  const targetInvitationId = urlParams.get('invitationId');

  const { data: invitations = [], isLoading } = useQuery<PendingInvitationDTO[]>({
    queryKey: ['pendingCourseInvitations'],
    queryFn: () => classroomLmsApi.getPendingStudentInvitations(),
    refetchInterval: 10000,
  });

  const acceptMutation = useMutation({
    mutationFn: (invitationId: string) => classroomLmsApi.acceptStudentInvitation(invitationId),
    onSuccess: (data) => {
      toast.success(data.message || 'Successfully enrolled in course!', {
        description: 'You can now access all learning modules and lessons.',
      });
      queryClient.invalidateQueries({ queryKey: ['pendingCourseInvitations'] });
      queryClient.invalidateQueries({ queryKey: ['user-enrollments'] });
      queryClient.invalidateQueries({ queryKey: ['enrolled-courses'] });
      queryClient.invalidateQueries({ queryKey: ['user-progress'] });
    },
    onError: (err: any) => {
      toast.error(err.message || 'Failed to accept course invitation.');
    },
  });

  const declineMutation = useMutation({
    mutationFn: (invitationId: string) => classroomLmsApi.declineStudentInvitation(invitationId),
    onSuccess: () => {
      toast.info('Course invitation declined.');
      queryClient.invalidateQueries({ queryKey: ['pendingCourseInvitations'] });
    },
    onError: (err: any) => {
      toast.error(err.message || 'Failed to decline invitation.');
    },
  });

  // Auto-scroll to target invitation if present in URL
  useEffect(() => {
    if (targetInvitationId && highlightedRef.current) {
      highlightedRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [targetInvitationId, invitations]);

  if (isLoading || invitations.length === 0) {
    return null;
  }

  return (
    <div className="w-full space-y-3 mb-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400">
            <Mail className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-foreground flex items-center gap-2">
              Pending Course Invitations
              <Badge className="bg-amber-500 text-white text-[11px] px-1.5 py-0">
                {invitations.length} New
              </Badge>
            </h3>
            <p className="text-xs text-muted-foreground">
              Your instructor pushed new course(s) to your classroom. Accept to start learning!
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {invitations.map((inv) => {
          const isHighlighted = targetInvitationId === inv.invitationId;
          const isProcessing =
            (acceptMutation.isPending && acceptMutation.variables === inv.invitationId) ||
            (declineMutation.isPending && declineMutation.variables === inv.invitationId);

          return (
            <Card
              key={inv.invitationId}
              ref={isHighlighted ? highlightedRef : undefined}
              className={`relative overflow-hidden border transition-all duration-300 ${
                isHighlighted
                  ? 'border-amber-500 shadow-md ring-2 ring-amber-500/20 bg-amber-50/20 dark:bg-amber-950/10'
                  : 'border-amber-500/30 bg-card hover:border-amber-500/60'
              }`}
            >
              <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-amber-500 to-orange-500" />
              <CardContent className="p-4 space-y-3">
                <div className="flex items-start gap-3">
                  {inv.courseThumbnail ? (
                    <img
                      src={inv.courseThumbnail}
                      alt={inv.courseTitle}
                      className="w-16 h-16 rounded-md object-cover border flex-shrink-0"
                    />
                  ) : (
                    <div className="w-16 h-16 rounded-md bg-gradient-to-br from-amber-500/20 to-orange-500/20 flex items-center justify-center flex-shrink-0 border border-amber-500/30 text-amber-600">
                      <Sparkles className="w-6 h-6" />
                    </div>
                  )}

                  <div className="space-y-1 min-w-0 flex-1">
                    <Badge variant="outline" className="text-[10px] border-amber-500/40 text-amber-600 dark:text-amber-400 gap-1 px-1.5 py-0">
                      <School className="w-2.5 h-2.5" />
                      {inv.classroomName}
                    </Badge>
                    <h4 className="text-sm font-bold text-foreground truncate">{inv.courseTitle}</h4>
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <User className="w-3 h-3" /> {inv.instructorName}
                    </p>
                  </div>
                </div>

                {inv.message && (
                  <div className="p-2 rounded bg-muted/50 border text-xs text-muted-foreground italic">
                    "{inv.message}"
                  </div>
                )}

                <div className="flex items-center justify-between pt-1">
                  <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                    <Clock className="w-2.5 h-2.5" />
                    Pushed {format(new Date(inv.createdAt), 'MMM d, yyyy')}
                  </span>

                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={isProcessing}
                      onClick={() => declineMutation.mutate(inv.invitationId)}
                      className="h-8 text-xs text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                    >
                      <XCircle className="w-3.5 h-3.5 mr-1" />
                      Decline
                    </Button>
                    <Button
                      size="sm"
                      disabled={isProcessing}
                      onClick={() => acceptMutation.mutate(inv.invitationId)}
                      className="h-8 text-xs bg-amber-600 hover:bg-amber-700 text-white gap-1"
                    >
                      {isProcessing ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <CheckCircle className="w-3.5 h-3.5" />
                      )}
                      Accept Invitation
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
