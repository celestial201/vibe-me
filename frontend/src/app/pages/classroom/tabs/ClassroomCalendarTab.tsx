import React, { useState } from 'react';
import { toast } from 'sonner';
import {
  useGetInternshipCalendar,
  useUpsertDailyJournal,
  useGetCompletedJournals,
  useMarkJournalComplete,
  useGetJournalSubmissions,
  InternshipCalendarDayDTO,
} from '@/hooks/classroom-lms-hooks';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Calendar as CalendarIcon, Clock, ExternalLink, BookOpen, CheckCircle2, Edit3, Sparkles, FileText } from 'lucide-react';
import { format, isSameDay } from 'date-fns';

interface Props {
  classroomId: string;
  isInstructor?: boolean;
}

export function ClassroomCalendarTab({ classroomId, isInstructor = false }: Props) {
  const { data: calendar, isLoading } = useGetInternshipCalendar(classroomId);
  const { data: completedDays = [] } = useGetCompletedJournals(classroomId);
  const upsertJournalMutation = useUpsertDailyJournal(classroomId);
  const markCompleteMutation = useMarkJournalComplete(classroomId);

  const [selectedDay, setSelectedDay] = useState<InternshipCalendarDayDTO | null>(null);
  const [title, setTitle] = useState('');
  const [contentLink, setContentLink] = useState('');
  const [journalEntry, setJournalEntry] = useState('');
  const [linkError, setLinkError] = useState('');

  const { data: daySubmissions = [] } = useGetJournalSubmissions(
    classroomId,
    selectedDay?.day_number,
    isInstructor && Boolean(selectedDay)
  );

  const handleOpenDay = (day: InternshipCalendarDayDTO) => {
    setSelectedDay(day);
    setTitle(day.journal?.title || '');
    setContentLink(day.journal?.content_link || '');
    setJournalEntry(day.journal?.journal_entry || '');
    setLinkError('');
  };

  const handleSaveJournal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDay) return;
    await upsertJournalMutation.mutateAsync({
      dayNumber: selectedDay.day_number,
      data: {
        title,
        content_link: contentLink,
        journal_entry: journalEntry,
      },
    });
    setSelectedDay(null);
  };

  const handleMarkFilled = async () => {
    if (!selectedDay) return;
    await markCompleteMutation.mutateAsync(selectedDay.day_number);
  };

  const today = new Date();

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Header Banner */}
      <Card className="border border-primary/30 bg-card shadow-xs">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <CardTitle className="text-xl font-bold flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-primary" />
                60-Day Internship Journey & Daily Journals
              </CardTitle>
              <CardDescription className="mt-1 text-xs md:text-sm">
                Follow your 2-month batch curriculum step-by-step. Click any day block to view or update daily goals.
              </CardDescription>
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              <a
                href="https://docs.google.com/document/d/1Rosetta-InternshipJournal-Summership2026/edit"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline bg-primary/10 px-3 py-1.5 rounded-md border border-primary/20 transition-colors"
              >
                <FileText className="w-3.5 h-3.5" />
                Rosetta-InternshipJournal-Summership2026 - Google Docs
              </a>
              {calendar?.internship_start_date && (
                <div className="flex items-center gap-2 text-xs bg-muted/60 px-3 py-1.5 rounded-lg border border-border/50">
                  <CalendarIcon className="w-3.5 h-3.5 text-primary" />
                  <span className="text-muted-foreground">Timeline:</span>
                  <span className="font-semibold text-foreground">
                    {format(new Date(calendar.internship_start_date), 'MMM d, yyyy')} —{' '}
                    {format(new Date(calendar.internship_end_date), 'MMM d, yyyy')}
                  </span>
                </div>
              )}
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* 60-Day Visual Grid */}
      {isLoading ? (
        <div className="text-center py-16 text-sm text-muted-foreground">Loading 60-day internship journey...</div>
      ) : !calendar?.days || calendar.days.length === 0 ? (
        <div className="text-center py-16 border border-dashed rounded-lg text-sm text-muted-foreground">
          No calendar timeline generated yet.
        </div>
      ) : (
        <div className="grid grid-cols-3 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-10 gap-2.5">
          {calendar.days.map((day) => {
            const dayDate = new Date(day.date);
            const isToday = isSameDay(dayDate, today);
            const hasJournal = Boolean(day.journal?.title || day.journal?.journal_entry || day.journal?.content_link);
            const isFilled = completedDays.includes(day.day_number);
            const isSavedOrFilled = isInstructor ? hasJournal : isFilled;

            return (
              <button
                key={day.day_number}
                type="button"
                onClick={() => handleOpenDay(day)}
                className={`relative flex flex-col items-center justify-between p-2.5 rounded-xl border text-left transition-all cursor-pointer h-24 hover:scale-105 hover:shadow-md ${
                  isToday
                    ? 'border-primary ring-2 ring-primary/40 bg-primary/10 font-semibold'
                    : isSavedOrFilled
                    ? 'border-emerald-500/50 bg-emerald-500/5 hover:border-emerald-500'
                    : 'border-border/60 bg-card hover:border-primary/50'
                }`}
              >
                {isInstructor ? (
                  hasJournal ? (
                    <div
                      className="absolute top-2 right-2 w-2.5 h-2.5 bg-emerald-500 rounded-full shrink-0"
                      title="Saved Journal Prompt"
                    />
                  ) : (
                    <div
                      className="absolute top-2 right-2 w-2.5 h-2.5 bg-red-500 rounded-full animate-pulse shrink-0"
                      title="Unsaved Journal Prompt"
                    />
                  )
                ) : !isFilled ? (
                  <div
                    className="absolute top-2 right-2 w-2.5 h-2.5 bg-red-500 rounded-full animate-pulse shrink-0"
                    title="Unfilled Journal"
                  />
                ) : (
                  <div
                    className="absolute top-2 right-2 w-2.5 h-2.5 bg-emerald-500 rounded-full shrink-0"
                    title="Completed Journal"
                  />
                )}

                <div className="w-full flex items-center justify-between text-[11px]">
                  <span className={`font-bold ${isToday ? 'text-primary' : 'text-muted-foreground'}`}>
                    Day {day.day_number}
                  </span>
                  {isToday && (
                    <Badge variant="default" className="text-[9px] px-1 py-0 h-4">
                      Today
                    </Badge>
                  )}
                </div>

                <div className="w-full my-auto text-center">
                  <p className="text-[10px] text-muted-foreground">{format(dayDate, 'MMM d')}</p>
                  {hasJournal && (
                    <p className="text-[10px] font-medium text-emerald-600 dark:text-emerald-400 line-clamp-1 mt-0.5">
                      {day.journal?.title || 'Journal'}
                    </p>
                  )}
                </div>

                <div className="w-full flex items-center justify-center pt-1 border-t border-border/30">
                  {isSavedOrFilled ? (
                    <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                  ) : (
                    <Clock className="w-3 h-3 text-muted-foreground/40" />
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Day Journal Modal (Teacher vs Student) */}
      <Dialog open={Boolean(selectedDay)} onOpenChange={(open) => !open && setSelectedDay(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between text-base flex-wrap gap-2 pr-6">
              <div className="flex items-center gap-2">
                <CalendarIcon className="w-4 h-4 text-primary" />
                Day {selectedDay?.day_number} — {selectedDay?.date && format(new Date(selectedDay.date), 'EEEE, MMMM d, yyyy')}
              </div>
              {isInstructor && Boolean(selectedDay?.journal?.title || selectedDay?.journal?.journal_entry || selectedDay?.journal?.content_link) && (
                <Badge className="bg-emerald-600 text-white text-[10px] gap-1 px-2 py-0.5">
                  <CheckCircle2 className="w-3 h-3" /> Saved
                </Badge>
              )}
            </DialogTitle>
            <DialogDescription className="text-xs">
              {isInstructor
                ? 'Attach instructions, learning links, or journal prompts for this internship day.'
                : "Review your instructor's guidelines and mark your daily journal entry as filled."}
            </DialogDescription>
          </DialogHeader>

          {isInstructor ? (
            /* Teacher Edit Form & Student Submissions View */
            <div className="space-y-6 pt-2">
              <form onSubmit={handleSaveJournal} className="space-y-4">
                <div>
                  <label className="text-xs font-medium">Day Goal / Title</label>
                  <Input
                    placeholder="e.g. Day 15: Introduction to MongoDB Indexing"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                  />
                </div>

                <div>
                  <label className="text-xs font-medium">Resource Link (Optional)</label>
                  <Input
                    type="url"
                    placeholder="https://example.com/lecture-notes"
                    value={contentLink}
                    onChange={(e) => setContentLink(e.target.value)}
                  />
                </div>

                <div>
                  <label className="text-xs font-medium">Journal Instructions & Prompts</label>
                  <Textarea
                    placeholder="Write daily learning goals, questions, or instructions for students..."
                    value={journalEntry}
                    onChange={(e) => setJournalEntry(e.target.value)}
                    rows={3}
                  />
                </div>

                <div className="flex justify-end gap-2 pt-1">
                  <Button type="button" variant="outline" onClick={() => setSelectedDay(null)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={upsertJournalMutation.isPending} className="bg-amber-500 hover:bg-amber-600 text-slate-950 font-semibold gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    {Boolean(selectedDay?.journal?.title || selectedDay?.journal?.journal_entry || selectedDay?.journal?.content_link)
                      ? 'Update Entry'
                      : 'Save Entry'}
                  </Button>
                </div>
              </form>

              {/* Student Submissions List & Document Evaluation Links */}
              <div className="border-t border-border/60 pt-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-sm text-foreground flex items-center gap-2">
                    <BookOpen className="w-4 h-4 text-primary" />
                    Student Submissions (Day {selectedDay?.day_number})
                  </h4>
                  <Badge variant="secondary" className="text-xs">
                    {daySubmissions.length} Submitted
                  </Badge>
                </div>

                {daySubmissions.length === 0 ? (
                  <div className="text-xs text-muted-foreground bg-muted/40 p-3 rounded-md border border-border/40 text-center">
                    No students have submitted a journal entry or document link for Day {selectedDay?.day_number} yet.
                  </div>
                ) : (
                  <div className="space-y-3 max-h-60 overflow-y-auto pr-1">
                    {daySubmissions.map((sub, idx) => (
                      <div key={sub._id || idx} className="p-3 rounded-lg border border-border/60 bg-muted/30 space-y-2">
                        <div className="flex items-center justify-between">
                          <div>
                            <span className="font-semibold text-xs text-foreground block">
                              {sub.student_name || 'Student'}
                            </span>
                            <span className="text-[11px] text-muted-foreground">
                              {sub.student_email}
                            </span>
                          </div>
                          <Badge className="bg-emerald-600/20 text-emerald-400 border border-emerald-500/30 text-[10px]">
                            <CheckCircle2 className="w-3 h-3 mr-1" /> Submitted
                          </Badge>
                        </div>

                        {sub.journal_entry && (
                          <p className="text-xs text-muted-foreground bg-background/50 p-2 rounded border border-border/40 whitespace-pre-wrap">
                            {sub.journal_entry}
                          </p>
                        )}

                        {sub.content_link && (
                          <div className="pt-1 flex items-center gap-2 flex-wrap">
                            <a
                              href={sub.content_link.startsWith('http') ? sub.content_link : `https://${sub.content_link}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-primary/10 hover:bg-primary/20 text-primary border border-primary/30 rounded-md text-xs font-semibold transition-colors"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                              Open & Evaluate Submitted Document / Link
                            </a>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* Student View & Journal Submission */
            <div className="space-y-4 pt-2 text-sm">
              <div>
                <h4 className="font-semibold text-foreground text-sm">
                  {selectedDay?.journal?.title || `Day ${selectedDay?.day_number} Journal Prompt`}
                </h4>
                <p className="text-xs text-muted-foreground mt-1 whitespace-pre-wrap">
                  {selectedDay?.journal?.journal_entry || 'Complete your daily learning reflection and notes below.'}
                </p>
              </div>

              {selectedDay?.journal?.content_link && (
                <div className="pt-1">
                  <a
                    href={selectedDay.journal.content_link}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs text-primary underline font-medium hover:text-primary/80"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    Open Reference Link
                  </a>
                </div>
              )}

              <div className="space-y-3 pt-2 border-t border-border/40">
                <div>
                  <label className="text-xs font-medium text-foreground block mb-1">Your Reflections & Code Snippets</label>
                  <Textarea
                    placeholder="Write your daily journal entry, key takeaways, and reflections..."
                    value={journalEntry}
                    onChange={(e) => setJournalEntry(e.target.value)}
                    rows={4}
                    className="text-xs resize-none"
                  />
                </div>

                <div>
                  <label className="text-xs font-medium text-foreground block mb-1">
                    Attachment / Project Link <span className="text-destructive font-bold">*</span>
                  </label>
                  <Input
                    type="url"
                    placeholder="https://github.com/my-repo or Drive link... (Required)"
                    value={contentLink}
                    onChange={(e) => {
                      setContentLink(e.target.value);
                      if (linkError) setLinkError('');
                    }}
                    className={`text-xs h-8 ${linkError ? 'border-destructive focus-visible:ring-destructive' : ''}`}
                    required
                  />
                  {linkError && (
                    <p className="text-[11px] text-destructive mt-1 font-medium">
                      {linkError}
                    </p>
                  )}
                </div>
              </div>

              <div className="flex justify-between items-center pt-3 border-t border-border/40">
                <Button
                  type="button"
                  size="sm"
                  className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5 text-xs"
                  onClick={async () => {
                    if (selectedDay) {
                      const trimmedLink = contentLink.trim();
                      if (!trimmedLink) {
                        const errMsg = 'A document/project link is required to submit your journal entry.';
                        setLinkError(errMsg);
                        toast.error(errMsg);
                        return;
                      }

                      setLinkError('');
                      await upsertJournalMutation.mutateAsync({
                        dayNumber: selectedDay.day_number,
                        data: {
                          title: title || `Day ${selectedDay.day_number} Reflection`,
                          content_link: trimmedLink,
                          journal_entry: journalEntry,
                        },
                      });
                      await markCompleteMutation.mutateAsync({
                        dayNumber: selectedDay.day_number,
                        data: {
                          content_link: trimmedLink,
                          journal_entry: journalEntry,
                        },
                      });
                      setSelectedDay(null);
                    }
                  }}
                  disabled={markCompleteMutation.isPending || upsertJournalMutation.isPending}
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  {completedDays.includes(selectedDay?.day_number || 0) ? 'Update & Save Entry' : 'Submit & Mark Complete'}
                </Button>

                <Button variant="outline" size="sm" onClick={() => setSelectedDay(null)}>
                  Close
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

