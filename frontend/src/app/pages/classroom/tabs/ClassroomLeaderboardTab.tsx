import React from 'react';
import { useGetStudentAnalyticsRoster, useGetCompletedJournals } from '@/hooks/classroom-lms-hooks';
import { useGetClassroomStudents } from '@/hooks/classroom-hooks';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Trophy, Medal, Award, Sparkles, CheckCircle2, BookOpen, Calendar, Loader2 } from 'lucide-react';

interface Props {
  classroomId: string;
  isInstructor?: boolean;
}

interface StudentLeaderboardEntry {
  studentId: string;
  name: string;
  email: string;
  coursePoints: number;
  assignmentPoints: number;
  journalPoints: number;
  totalPoints: number;
  completedCoursesCount: number;
  rank: number;
}

export function ClassroomLeaderboardTab({ classroomId, isInstructor }: Props) {
  const { data: students, isLoading: isStudentsLoading } = useGetClassroomStudents(classroomId);
  const { data: roster, isLoading: isRosterLoading } = useGetStudentAnalyticsRoster(classroomId, isInstructor || false);
  const { data: completedJournals = [] } = useGetCompletedJournals(classroomId);

  const isLoading = isStudentsLoading || isRosterLoading;

  // Build ranking table dynamically
  const leaderboard: StudentLeaderboardEntry[] = (students || []).map((student) => {
    const studentId = student.studentId || (student as any)._id || '';
    const rosterDoc = (roster || []).find((r: any) => String(r.studentId) === String(studentId));

    // Calculate points:
    // 1. Course Completion (+100 pts per 100% completed course)
    const completedCoursesCount =
      rosterDoc?.completedCoursesCount ||
      rosterDoc?.courses?.filter((c: any) => (c.progressPercentage || 0) >= 100 || c.isCompleted || c.completed).length ||
      (rosterDoc?.courseProgress >= 100 ? 1 : 0);
    const coursePoints = completedCoursesCount * 100;

    // 2. Assignment Grades
    const assignmentPoints =
      rosterDoc?.assignmentStats?.totalGradeObtained ||
      rosterDoc?.submissionsList?.reduce((acc: number, s: any) => acc + (s.grade || 0), 0) ||
      0;

    // 3. Journal Completion (+10 pts per filled daily journal)
    const journalPoints = completedJournals.length * 10;

    const totalPoints = coursePoints + assignmentPoints + journalPoints;

    return {
      studentId,
      name: student.studentName || 'Student',
      email: student.studentEmail || '',
      coursePoints,
      assignmentPoints,
      journalPoints,
      totalPoints,
      completedCoursesCount,
      rank: 0,
    };
  });

  // Sort descending by totalPoints
  leaderboard.sort((a, b) => b.totalPoints - a.totalPoints);
  leaderboard.forEach((entry, idx) => {
    entry.rank = idx + 1;
  });

  const getRankBadge = (rank: number) => {
    switch (rank) {
      case 1:
        return (
          <div className="w-8 h-8 rounded-full bg-amber-500/20 text-amber-500 font-bold flex items-center justify-center border border-amber-500/40">
            <Trophy className="w-4 h-4 text-amber-500" />
          </div>
        );
      case 2:
        return (
          <div className="w-8 h-8 rounded-full bg-slate-300/30 text-slate-400 font-bold flex items-center justify-center border border-slate-400/40">
            <Medal className="w-4 h-4 text-slate-400" />
          </div>
        );
      case 3:
        return (
          <div className="w-8 h-8 rounded-full bg-amber-700/20 text-amber-700 font-bold flex items-center justify-center border border-amber-700/40">
            <Award className="w-4 h-4 text-amber-700" />
          </div>
        );
      default:
        return (
          <div className="w-8 h-8 rounded-full bg-muted text-muted-foreground font-semibold text-xs flex items-center justify-center border border-border/50">
            #{rank}
          </div>
        );
    }
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Leaderboard Header */}
      <Card className="border border-amber-500/30 bg-gradient-to-r from-amber-500/10 via-background to-primary/5 shadow-xs">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <CardTitle className="text-xl font-bold flex items-center gap-2 text-foreground">
                <Trophy className="w-5 h-5 text-amber-500" />
                Gamified Cohort Leaderboard
              </CardTitle>
              <CardDescription className="mt-1 text-xs md:text-sm">
                Earn bonus points by completing assigned courses (+100 pts), assignment grades, and daily journals (+10 pts).
              </CardDescription>
            </div>
            <Badge variant="outline" className="border-amber-500/40 text-amber-600 bg-amber-500/10 text-xs px-3 py-1 font-semibold">
              <Sparkles className="w-3.5 h-3.5 mr-1" />
              Live Leaderboard Standings
            </Badge>
          </div>
        </CardHeader>
      </Card>

      {/* Leaderboard Rankings List */}
      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground text-sm flex items-center justify-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin text-primary" />
          Calculating live cohort leaderboard points...
        </div>
      ) : leaderboard.length === 0 ? (
        <Card className="border border-dashed py-12 text-center bg-card">
          <CardContent>
            <p className="text-sm text-muted-foreground">No enrolled students in this classroom cohort yet.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {leaderboard.map((entry) => (
            <Card
              key={entry.studentId}
              className={`border transition bg-card shadow-xs ${
                entry.rank === 1
                  ? 'border-amber-500/50 bg-amber-500/5'
                  : entry.rank === 2
                  ? 'border-slate-400/40'
                  : entry.rank === 3
                  ? 'border-amber-700/30'
                  : 'border-border/50'
              }`}
            >
              <CardContent className="py-3.5 px-4 flex items-center justify-between gap-4 flex-wrap">
                <div className="flex items-center gap-3">
                  {getRankBadge(entry.rank)}
                  <div>
                    <h4 className="text-sm font-bold text-foreground flex items-center gap-2">
                      {entry.name}
                      {entry.completedCoursesCount > 0 && (
                        <Badge className="bg-emerald-600 text-white text-[9px] px-1.5 py-0">
                          <CheckCircle2 className="w-3 h-3 mr-0.5" />
                          {entry.completedCoursesCount} Course(s) 100%
                        </Badge>
                      )}
                    </h4>
                    <p className="text-xs text-muted-foreground">{entry.email}</p>
                  </div>
                </div>

                <div className="flex items-center gap-4 text-xs">
                  <div className="text-center px-2">
                    <span className="text-[10px] text-muted-foreground block">Course Pts</span>
                    <span className="font-semibold text-foreground">+{entry.coursePoints}</span>
                  </div>
                  <div className="text-center px-2">
                    <span className="text-[10px] text-muted-foreground block">Classwork Pts</span>
                    <span className="font-semibold text-foreground">+{entry.assignmentPoints}</span>
                  </div>
                  <div className="text-center px-2">
                    <span className="text-[10px] text-muted-foreground block">Journal Pts</span>
                    <span className="font-semibold text-foreground">+{entry.journalPoints}</span>
                  </div>
                  <div className="text-right pl-3 border-l border-border/40">
                    <span className="text-[10px] text-muted-foreground block font-medium">Total Points</span>
                    <span className="text-base font-extrabold text-amber-600 dark:text-amber-400">
                      {entry.totalPoints} pts
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
