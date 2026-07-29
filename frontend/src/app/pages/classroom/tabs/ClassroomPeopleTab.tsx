import React, { useState } from 'react';
import { useGetClassroomStudents } from '@/hooks/classroom-hooks';
import { useGetStudentInsights, useGetStudentAnalyticsRoster } from '@/hooks/classroom-lms-hooks';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Users, User, TrendingUp, AlertCircle, CheckCircle, BarChart3, BookOpen, Send, Flag, HelpCircle } from 'lucide-react';
import { format } from 'date-fns';
import { PushCourseModal } from '../components/PushCourseModal';

interface Props {
  classroomId: string;
  isInstructor: boolean;
}

export function ClassroomPeopleTab({ classroomId, isInstructor }: Props) {
  const { data: simpleStudents, isLoading: isSimpleLoading } = useGetClassroomStudents(classroomId);
  const { data: roster, isLoading: isRosterLoading } = useGetStudentAnalyticsRoster(classroomId);

  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [isPushModalOpen, setIsPushModalOpen] = useState<boolean>(false);

  const isLoading = isInstructor ? isRosterLoading : isSimpleLoading;

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Header with Push Course Action for Instructors */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold tracking-tight flex items-center gap-2">
            <Users className="w-5 h-5 text-primary" />
            Classroom Roster & Student Analytics
          </h2>
          <p className="text-xs md:text-sm text-muted-foreground">
            Manage classroom members, assign Vibe courses, and monitor real-time student progress.
          </p>
        </div>

        {isInstructor && (
          <Button size="sm" onClick={() => setIsPushModalOpen(true)}>
            <Send className="w-4 h-4 mr-1.5" />
            Push Course to Classroom
          </Button>
        )}
      </div>

      <Card className="border border-border/60 bg-card shadow-xs">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold">
            Enrolled Students ({isInstructor ? roster?.length || 0 : simpleStudents?.length || 0})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0 sm:p-6">
          {isLoading ? (
            <div className="text-center py-12 text-sm text-muted-foreground">Loading student roster and analytics...</div>
          ) : isInstructor ? (
            /* Teacher Detailed Student Analytics Roster Table */
            !roster || roster.length === 0 ? (
              <div className="text-center py-12 border border-dashed rounded-lg text-sm text-muted-foreground m-4">
                No students enrolled in this classroom yet.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Student Name</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Joining Date</TableHead>
                      <TableHead>Course Status</TableHead>
                      <TableHead>Course Progress</TableHead>
                      <TableHead>Submissions</TableHead>
                      <TableHead>Flags / Doubts</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {roster.map((s) => (
                      <TableRow key={s.studentId} className="hover:bg-muted/40 transition-colors cursor-pointer" onClick={() => setSelectedStudentId(s.studentId)}>
                        <TableCell className="font-medium flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-xs shrink-0">
                            {s.name?.charAt(0) || 'S'}
                          </div>
                          <span>{s.name}</span>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">{s.email || 'N/A'}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {s.joiningDate ? format(new Date(s.joiningDate), 'MMM d, yyyy') : 'N/A'}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={s.courseAccepted === 'accepted' ? 'default' : 'secondary'}
                            className={
                              s.courseAccepted === 'accepted'
                                ? 'bg-emerald-600 hover:bg-emerald-700 text-white text-[10px]'
                                : 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30 text-[10px]'
                            }
                          >
                            {s.courseAccepted === 'accepted' ? 'Accepted' : 'Pending Invitation'}
                          </Badge>
                        </TableCell>
                        <TableCell className="min-w-[130px]">
                          <div className="space-y-1">
                            <div className="flex justify-between text-[10px] font-semibold text-muted-foreground">
                              <span>{s.courseProgress}%</span>
                            </div>
                            <Progress value={s.courseProgress} className="h-1.5 w-full bg-muted" />
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs font-semibold">
                            {s.submissionCount || 0} Turned In
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <span className="flex items-center gap-0.5 text-amber-500 font-medium">
                              <Flag className="w-3 h-3" /> {s.flaggedCount || 0}
                            </span>
                            <span className="flex items-center gap-0.5 text-blue-500 font-medium">
                              <HelpCircle className="w-3 h-3" /> {s.queriesCount || 0}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                          <Button
                            size="xs"
                            variant="outline"
                            onClick={() => setSelectedStudentId(s.studentId)}
                          >
                            <BarChart3 className="w-3.5 h-3.5 mr-1 text-primary" />
                            Inspect
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )
          ) : (
            /* Student View Roster List */
            !simpleStudents || simpleStudents.length === 0 ? (
              <div className="text-center py-12 border border-dashed rounded-lg text-sm text-muted-foreground m-4">
                No classmates enrolled yet.
              </div>
            ) : (
              <div className="divide-y divide-border/40 px-4">
                {simpleStudents.map((m) => (
                  <div key={m._id} className="py-3 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-medium text-xs">
                        <User className="w-4 h-4" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-foreground">{m.studentId || 'Student'}</p>
                        <p className="text-xs text-muted-foreground">
                          Joined {format(new Date(m.joinedAt), 'MMM d, yyyy')}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )
          )}
        </CardContent>
      </Card>

      {/* Push Course Modal */}
      {isInstructor && (
        <PushCourseModal
          classroomId={classroomId}
          isOpen={isPushModalOpen}
          onClose={() => setIsPushModalOpen(false)}
        />
      )}

      {/* Teacher Student Insights Drawer */}
      {isInstructor && selectedStudentId && (
        <StudentInsightsDrawer
          classroomId={classroomId}
          studentId={selectedStudentId}
          onClose={() => setSelectedStudentId(null)}
        />
      )}
    </div>
  );
}

function StudentInsightsDrawer({ classroomId, studentId, onClose }: { classroomId: string; studentId: string; onClose: () => void }) {
  const { data: insights, isLoading } = useGetStudentInsights(classroomId, studentId);

  return (
    <Sheet open={true} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-primary" />
            Student Performance & Activity Insights
          </SheetTitle>
          <SheetDescription>Detailed activity, submissions, and grade breakdown for student ID: {studentId}</SheetDescription>
        </SheetHeader>

        {isLoading ? (
          <div className="py-12 text-center text-sm text-muted-foreground">Computing metrics...</div>
        ) : !insights ? (
          <div className="py-12 text-center text-sm text-muted-foreground">No data available for this student.</div>
        ) : (
          <div className="space-y-6 pt-4">
            {/* Metric Cards Grid */}
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 border rounded-lg bg-card">
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <TrendingUp className="w-3.5 h-3.5 text-primary" />
                  Average Grade
                </span>
                <p className="text-xl font-bold text-foreground mt-1">{insights.averageGrade}%</p>
              </div>

              <div className="p-3 border rounded-lg bg-card">
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5 text-destructive" />
                  Missing Tasks
                </span>
                <p className="text-xl font-bold text-destructive mt-1">{insights.missingCount}</p>
              </div>

              <div className="p-3 border rounded-lg bg-card">
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />
                  Submitted Tasks
                </span>
                <p className="text-xl font-bold text-foreground mt-1">{insights.submittedCount} / {insights.totalAssignments}</p>
              </div>

              <div className="p-3 border rounded-lg bg-card">
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <CheckCircle className="w-3.5 h-3.5 text-blue-500" />
                  Graded Tasks
                </span>
                <p className="text-xl font-bold text-foreground mt-1">{insights.gradedCount}</p>
              </div>
            </div>

            {/* Submission Log List */}
            <div className="space-y-3 pt-2">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Assignment History</h4>
              <div className="divide-y border rounded-lg bg-card">
                {insights.submissions.map((sub) => (
                  <div key={sub.assignmentId} className="p-3 flex items-center justify-between text-xs">
                    <div>
                      <p className="font-medium text-foreground">{sub.assignmentTitle}</p>
                      <p className="text-[11px] text-muted-foreground">
                        Due {format(new Date(sub.dueDate), 'MMM d')}
                      </p>
                    </div>
                    <div className="text-right">
                      <Badge variant={sub.status === 'returned' ? 'default' : sub.status === 'submitted' ? 'secondary' : 'outline'}>
                        {sub.status}
                      </Badge>
                      {sub.grade !== undefined && (
                        <p className="font-semibold text-primary mt-0.5">{sub.grade} / {sub.points}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
