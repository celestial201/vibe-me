import { useState, useEffect } from "react";
import { apiClient } from "@/lib/api-client";
import { Zap, Users, RefreshCw, ChevronDown, ChevronUp, Shield, Award } from "lucide-react";
import { AuroraText } from "@/components/magicui/aurora-text";

interface StudentStats {
  userId: string;
  name: string;
  email: string;
  progressPercent: number;
  completedMilestones: number[];
  availableCredits: number;
  turnsPlayed: number;
}

interface CourseMonitorData {
  courseId: string;
  courseName: string;
  description: string;
  infiniteArenaEnabled: boolean;
  totalEnrolled: number;
  students: StudentStats[];
}

export default function ArenaMonitorPage() {
  const [courses, setCourses] = useState<CourseMonitorData[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedCourses, setExpandedCourses] = useState<Record<string, boolean>>({});
  const [togglingMap, setTogglingMap] = useState<Record<string, boolean>>({});

  const fetchMonitorData = async () => {
    try {
      const response = await apiClient.get<CourseMonitorData[]>('/arena-monitor/courses');
      setCourses(response.data);
    } catch (err) {
      console.error("Failed to load Arena Monitor data", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMonitorData();
  }, []);

  const toggleCourseExpand = (courseId: string) => {
    setExpandedCourses(prev => ({
      ...prev,
      [courseId]: !prev[courseId]
    }));
  };

  const handleToggleInfinite = async (courseId: string, currentStatus: boolean) => {
    if (togglingMap[courseId]) return;

    const newStatus = !currentStatus;

    // Optimistic UI Update
    setCourses(prev => prev.map(c => c.courseId === courseId ? { ...c, infiniteArenaEnabled: newStatus } : c));
    setTogglingMap(prev => ({ ...prev, [courseId]: true }));

    try {
      await apiClient.patch(`/arena-monitor/courses/${courseId}/infinite-creds`, { enabled: newStatus });
    } catch (err) {
      console.error("Failed to toggle infinite credits", err);
      alert("Failed to update infinite credits setting. Rolling back.");
      // Rollback on error
      setCourses(prev => prev.map(c => c.courseId === courseId ? { ...c, infiniteArenaEnabled: currentStatus } : c));
    } finally {
      setTogglingMap(prev => ({ ...prev, [courseId]: false }));
    }
  };

  return (
    <div className="p-6 md:p-10 max-w-7xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-slate-900/90 p-8 rounded-3xl border border-purple-500/20 shadow-2xl">
        <div>
          <h1 className="text-4xl font-extrabold text-white flex items-center gap-3">
            <Shield className="text-purple-400 w-10 h-10" />
            <AuroraText>Arena Monitor & Live Controls</AuroraText>
          </h1>
          <p className="text-slate-400 mt-2 text-base">
            Track student progress, credits, and toggle real-time Infinite Credits for your active courses.
          </p>
        </div>
        <button
          onClick={fetchMonitorData}
          className="bg-slate-800 hover:bg-slate-700 text-slate-300 px-5 py-3 rounded-2xl font-bold transition-all flex items-center gap-2 border border-slate-700"
        >
          <RefreshCw size={18} className={loading ? "animate-spin" : ""} /> Refresh Data
        </button>
      </div>

      {/* Main Content Grid */}
      {loading ? (
        <div className="flex flex-col items-center justify-center p-20 bg-slate-900/50 rounded-3xl border border-slate-800">
          <RefreshCw className="animate-spin text-purple-400 w-12 h-12 mb-4" />
          <p className="text-slate-300 text-lg font-medium">Loading Course Metrics...</p>
        </div>
      ) : courses.length === 0 ? (
        <div className="text-center p-16 bg-slate-900/50 rounded-3xl border border-slate-800 text-slate-400">
          No active courses found for monitoring.
        </div>
      ) : (
        <div className="space-y-6">
          {courses.map((course) => {
            const isExpanded = !!expandedCourses[course.courseId];
            const isToggling = !!togglingMap[course.courseId];

            return (
              <div 
                key={course.courseId} 
                className={`bg-slate-900/80 rounded-3xl border transition-all duration-300 overflow-hidden ${course.infiniteArenaEnabled ? 'border-red-500/50 shadow-[0_0_30px_rgba(239,68,68,0.15)]' : 'border-slate-800'}`}
              >
                {/* Course Header Bar */}
                <div className="p-6 md:p-8 flex flex-col md:flex-row justify-between items-start md:items-center gap-6 bg-slate-900/90">
                  <div className="flex-1">
                    <div className="flex items-center gap-3">
                      <h3 className="text-2xl font-bold text-white">{course.courseName}</h3>
                      {course.infiniteArenaEnabled && (
                        <span className="bg-red-500/20 text-red-400 border border-red-500/40 text-xs font-black px-3 py-1 rounded-full animate-pulse flex items-center gap-1">
                          <Zap size={14} className="fill-red-400" /> INFINITE CREDITS ACTIVE
                        </span>
                      )}
                    </div>
                    <p className="text-slate-400 text-sm mt-1 flex items-center gap-4">
                      <span className="flex items-center gap-1"><Users size={16} /> {course.totalEnrolled} Enrolled Students</span>
                    </p>
                  </div>

                  {/* Infinite Toggle Button */}
                  <div className="flex items-center gap-4">
                    <div className="flex flex-col items-end">
                      <span className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">Infinite Credits Mode</span>
                      <button
                        onClick={() => handleToggleInfinite(course.courseId, course.infiniteArenaEnabled)}
                        disabled={isToggling}
                        className={`relative w-16 h-9 rounded-full transition-colors duration-300 focus:outline-none ${course.infiniteArenaEnabled ? 'bg-red-600 shadow-[0_0_15px_rgba(239,68,68,0.6)]' : 'bg-slate-700'}`}
                      >
                        <span
                          className={`absolute top-1 left-1 w-7 h-7 bg-white rounded-full transition-transform duration-300 flex items-center justify-center font-black text-xs ${course.infiniteArenaEnabled ? 'transform translate-x-7 text-red-600' : 'text-slate-600'}`}
                        >
                          {course.infiniteArenaEnabled ? '∞' : 'OFF'}
                        </span>
                      </button>
                    </div>

                    <button
                      onClick={() => toggleCourseExpand(course.courseId)}
                      className="p-3 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-2xl transition-colors ml-2"
                      title="Toggle Enrolled Students"
                    >
                      {isExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                    </button>
                  </div>
                </div>

                {/* Collapsible Enrolled Students Roster */}
                {isExpanded && (
                  <div className="border-t border-slate-800 p-6 md:p-8 bg-slate-950/60 animate-in fade-in slide-in-from-top-2 duration-300">
                    <h4 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                      <Users size={18} className="text-purple-400" /> Student Roster & Live Metrics
                    </h4>

                    {course.students.length === 0 ? (
                      <p className="text-slate-500 text-sm italic">No students currently enrolled in this course.</p>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse text-sm">
                          <thead>
                            <tr className="border-b border-slate-800 text-slate-400 text-xs uppercase tracking-wider">
                              <th className="pb-3 px-4 font-bold">Student Name</th>
                              <th className="pb-3 px-4 font-bold">Email</th>
                              <th className="pb-3 px-4 font-bold">Course Progress</th>
                              <th className="pb-3 px-4 font-bold">Arena Creds Remaining</th>
                              <th className="pb-3 px-4 font-bold">Matches Played</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-800/50">
                            {course.students.map((student) => (
                              <tr key={student.userId || student.email} className="hover:bg-slate-900/40 transition-colors">
                                <td className="py-4 px-4 font-semibold text-white flex items-center gap-2">
                                  <div className="w-8 h-8 rounded-full bg-purple-500/20 text-purple-300 flex items-center justify-center font-bold text-xs">
                                    {student.name.charAt(0).toUpperCase()}
                                  </div>
                                  {student.name}
                                </td>
                                <td className="py-4 px-4 text-slate-400">{student.email || 'N/A'}</td>
                                <td className="py-4 px-4">
                                  <div className="flex items-center gap-3">
                                    <div className="w-24 bg-slate-800 h-2 rounded-full overflow-hidden">
                                      <div 
                                        className="bg-gradient-to-r from-purple-500 to-indigo-500 h-full rounded-full" 
                                        style={{ width: `${student.progressPercent}%` }}
                                      ></div>
                                    </div>
                                    <span className="font-mono text-xs font-bold text-slate-300">{student.progressPercent}%</span>
                                  </div>
                                </td>
                                <td className="py-4 px-4">
                                  {course.infiniteArenaEnabled ? (
                                    <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-red-500/20 border border-red-500/40 text-red-400 font-black text-xs">
                                      ∞ Infinite
                                    </span>
                                  ) : (
                                    <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full font-bold text-xs ${student.availableCredits > 0 ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'bg-slate-800 text-slate-500'}`}>
                                      <Award size={14} /> {student.availableCredits} Credit{student.availableCredits === 1 ? '' : 's'}
                                    </span>
                                  )}
                                </td>
                                <td className="py-4 px-4 font-mono font-bold text-purple-300">
                                  {student.turnsPlayed}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
