import React, { useState } from 'react';
import { useParams, useNavigate } from '@tanstack/react-router';
import { useAuthStore } from '@/store/auth-store';
import { useGetClassroom } from '@/hooks/classroom-hooks';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Copy, Check, MessageSquare, BookOpen, Users, Calendar } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';

import { ClassroomStreamTab } from './tabs/ClassroomStreamTab';
import { ClassroomPeopleTab } from './tabs/ClassroomPeopleTab';
import { ClassroomCalendarTab } from './tabs/ClassroomCalendarTab';


export function ClassroomLayout() {
  const params = useParams({ strict: false }) as { classroomId?: string; id?: string };
  const classroomId = params.classroomId || params.id || '';
  const navigate = useNavigate();
  const { user } = useAuthStore();

  const { data: currentClassroom } = useGetClassroom(classroomId);
  const [copied, setCopied] = useState(false);

  const isInstructor = user?.role === 'teacher' || currentClassroom?.instructorId === (user?._id || user?.id);

  const handleCopyCode = () => {
    if (currentClassroom?.code) {
      navigator.clipboard.writeText(currentClassroom.code);
      setCopied(true);
      toast.success('Classroom code copied to clipboard!');
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Classroom Top Banner & Header */}
      <header className="border-b border-border bg-card px-6 py-4 shadow-xs">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate({ to: isInstructor ? '/teacher/classrooms' : '/student/classrooms' })}
              title="Back to Classrooms List"
            >
              <ArrowLeft className="w-5 h-5 text-muted-foreground" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
                {currentClassroom?.title || 'Classroom Space'}
              </h1>
              {currentClassroom?.description && (
                <p className="text-xs text-muted-foreground">{currentClassroom.description}</p>
              )}
              {currentClassroom?.start_date && currentClassroom?.end_date ? (
                <p className="text-xs text-muted-foreground mt-0.5 font-medium">
                  Timeline: {format(new Date(currentClassroom.start_date), 'MMM d, yyyy')} —{' '}
                  {format(new Date(currentClassroom.end_date), 'MMM d, yyyy')}
                </p>
              ) : null}
            </div>
          </div>

          <div className="flex items-center gap-3">
            {(user?.role === 'teacher' || currentClassroom?.instructorId === (user?._id || user?.id)) && currentClassroom?.code && (
              <div className="flex items-center gap-2 bg-muted/60 px-3 py-1.5 rounded-lg border border-border/50 text-xs">
                <span className="text-muted-foreground">Join Code:</span>
                <span className="font-mono font-bold tracking-wider text-primary text-sm">
                  {currentClassroom.code}
                </span>
                <Button size="icon" variant="ghost" className="h-6 w-6 ml-1" onClick={handleCopyCode}>
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                </Button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Main Tabbed Navigation Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 md:p-6">
        <Tabs defaultValue="stream" className="space-y-6">
          <div className="border-b border-border/60 pb-2">
            <TabsList className="bg-muted/50 p-1">
              <TabsTrigger value="stream" className="flex items-center gap-2 text-xs md:text-sm px-4">
                <MessageSquare className="w-4 h-4" />
                Stream
              </TabsTrigger>
              <TabsTrigger value="people" className="flex items-center gap-2 text-xs md:text-sm px-4">
                <Users className="w-4 h-4" />
                People
              </TabsTrigger>
              <TabsTrigger value="calendar" className="flex items-center gap-2 text-xs md:text-sm px-4">
                <Calendar className="w-4 h-4" />
                Internship Journey
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="stream" className="focus-visible:outline-none">
            <ClassroomStreamTab classroomId={classroomId} isInstructor={isInstructor} />
          </TabsContent>

          <TabsContent value="people" className="focus-visible:outline-none">
            <ClassroomPeopleTab classroomId={classroomId} isInstructor={isInstructor} />
          </TabsContent>


          <TabsContent value="calendar" className="focus-visible:outline-none">
            <ClassroomCalendarTab classroomId={classroomId} isInstructor={isInstructor} />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
