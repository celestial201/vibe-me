import { useEffect, useState } from "react";
import { AuroraText } from "@/components/magicui/aurora-text";
import { apiClient } from "@/lib/api-client";
import { MonitorPlay, Users } from "lucide-react";
import "./arena.css";
import ArenaBattle from "./ArenaBattle";
import ArenaBaitView from "./ArenaBaitView";
import { useAuthStore } from "@/store/auth-store";
import { useUserEnrollments } from "@/hooks/hooks";
import { useQueryClient } from "@tanstack/react-query";

type ArenaMode = 'pvc' | 'pvp' | null;
type ArenaPhase = 'mode_selection' | 'course_selection' | 'baiting' | 'battle';

export const MILESTONE_TIERS = [
  { level: 1, threshold: 30, bait: 4 },
  { level: 2, threshold: 50, bait: 8 },
  { level: 3, threshold: 70, bait: 12 },
  { level: 4, threshold: 90, bait: 16 },
  { level: 5, threshold: 100, bait: 20 },
];

export function evaluateDynamicArenaState(currentProgress: number, completedMilestones: number[] = []) {
  const unlockedThresholds = MILESTONE_TIERS.filter(m => currentProgress >= m.threshold);
  const playableThresholds = unlockedThresholds.filter(m => !completedMilestones.includes(m.threshold));
  const availableCredits = playableThresholds.length;
  const activeTier = playableThresholds.length > 0 ? playableThresholds[0] : null;
  const nextLockedTier = MILESTONE_TIERS.find(tier => currentProgress < tier.threshold) || null;

  return {
    currentProgress,
    completedMilestones,
    unlockedThresholds,
    playableThresholds,
    availableCredits,
    activeTier,
    nextLockedTier,
    isFullyCompleted: completedMilestones.length === 5,
  };
}

export default function ArenaDashboard() {
  const queryClient = useQueryClient();
  const [courses, setCourses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCourse, setSelectedCourse] = useState<string | null>(null);
  
  const [mode, setMode] = useState<ArenaMode>(null);
  const [phase, setPhase] = useState<ArenaPhase>('mode_selection');
  const [baitedHp, setBaitedHp] = useState<number>(0);
  const [showPvpOpponents, setShowPvpOpponents] = useState(false);

  const { token } = useAuthStore();
  const { data: enrollmentsData } = useUserEnrollments(1, 100, !!token);
  const enrollments = enrollmentsData?.enrollments || [];

  useEffect(() => {
    const fetchCourses = async () => {
      try {
        const response = await apiClient.get<any[]>('/arena/courses');
        const validCourses = response.data.filter(c => c.courseName && c.courseName !== "Unknown Course" && c.courseName.trim() !== "");
        
        // Strictly use real-time progress & completedMilestones from enrollments
        const coursesWithProgress = validCourses.map(course => {
          const enrollment = enrollments.find((e: any) => e.courseId === course.courseId || e.course?.id === course.courseId);
          const percentCompleted = enrollment?.percentCompleted ?? course.progressPercent ?? 0;
          const completedMilestones = enrollment?.arenaProgress?.completedMilestones || course.completedMilestones || [];
          return {
            ...course,
            percentCompleted,
            completedMilestones,
            eligibility: evaluateDynamicArenaState(percentCompleted, completedMilestones),
          };
        });
        
        setCourses(coursesWithProgress);
        
        const baseHp = validCourses.length * 100;
        localStorage.setItem('arena_base_hp', baseHp.toString());
        window.dispatchEvent(new Event('storage'));
      } catch (err) {
        console.error("Failed to load arena courses", err);
      } finally {
        setLoading(false);
      }
    };
    if (enrollmentsData) {
      fetchCourses();
    }
  }, [enrollmentsData]);

  // Real-time SSE Listener for Infinite Credits changes
  useEffect(() => {
    let eventSource: EventSource | null = null;
    try {
      const rawBaseUrl = import.meta.env.VITE_BASE_URL ?? '';
      const streamUrl = rawBaseUrl.endsWith('/api')
        ? `${rawBaseUrl}/arena/events/stream`
        : `${rawBaseUrl}/api/arena/events/stream`;
      eventSource = new EventSource(streamUrl);
      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'INFINITE_CREDITS_TOGGLED') {
            setCourses(prev => prev.map(c => {
              const cId = c.courseId || c.cohortId;
              if (cId === data.courseId) {
                return { ...c, infiniteArenaEnabled: data.infiniteArenaEnabled };
              }
              return c;
            }));
          }
        } catch (e) {
          console.error("SSE parse error", e);
        }
      };
    } catch (err) {
      console.warn("EventSource setup error", err);
    }

    return () => {
      if (eventSource) {
        eventSource.close();
      }
    };
  }, []);

  const handleModeSelect = (selectedMode: ArenaMode) => {
    setMode(selectedMode);
    setPhase('course_selection');
    setShowPvpOpponents(false);
  };

  const handleEnterBattle = () => {
    if (mode === 'pvc') {
      setPhase('baiting');
    } else {
      setShowPvpOpponents(true);
    }
  };

  const handleStartGame = async (finalBait: number) => {
    await queryClient.invalidateQueries({ queryKey: ['user-enrollments'] });
    await queryClient.invalidateQueries({ queryKey: ['arena-courses'] });
    setBaitedHp(finalBait);
    setPhase('battle');
  };

  const globalTotalHp = (courses.length * 100) + Number(localStorage.getItem('arena_hp_delta') || 0);
  const pvcPoints = Number(localStorage.getItem('arena_pvc_highest') || 0);
  const pvpPoints = Number(localStorage.getItem('arena_pvp_highest') || 0);

  const selectedCourseData = courses.find(c => (c.courseId || c.cohortId) === selectedCourse);
  const activeEligibility = selectedCourseData ? evaluateDynamicArenaState(selectedCourseData.percentCompleted, selectedCourseData.completedMilestones) : null;

  if (phase === 'battle' && selectedCourse) {
    return (
      <ArenaBattle 
        courseId={selectedCourse} 
        baitedHp={baitedHp} 
        milestoneThreshold={activeEligibility?.activeTier?.threshold}
        onExit={async () => {
          setPhase('course_selection');
          await queryClient.invalidateQueries({ queryKey: ['user-enrollments'] });
          await queryClient.invalidateQueries({ queryKey: ['arena-courses'] });
        }} 
      />
    );
  }

  if (phase === 'baiting' && selectedCourse) {
    return (
      <ArenaBaitView 
        courseId={selectedCourse} 
        courseName={selectedCourseData?.courseName || "Unknown Course"}
        maxHp={globalTotalHp}
        activeTier={activeEligibility?.activeTier || null}
        onStartGame={handleStartGame}
        onBack={() => setPhase('course_selection')}
      />
    );
  }

  return (
    <div className="arena-container">
      <div className="arena-header">
        <h1 className="text-4xl font-bold mb-2">
          <AuroraText>Knowledge Clash Arena</AuroraText>
        </h1>
        <p className="text-slate-400">Put your knowledge to the test and earn Mastery.</p>
      </div>

      <div className="arena-content">
        {phase === 'mode_selection' && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
            <h2 className="text-2xl font-semibold mb-6 text-white text-center">Select Game Mode</h2>
            
            <div className="arena-mode-grid">
              {/* Player vs Computer Card */}
              <div className="arena-mode-card mode-pvc" onClick={() => handleModeSelect('pvc')}>
                <div className="card-content">
                  <div className="mode-icon">
                    <MonitorPlay size={48} />
                  </div>
                  <h3 className="text-3xl font-black text-white mb-3 tracking-wide">Player vs AI</h3>
                  <p className="text-slate-300 font-medium px-4">Test your knowledge against an advanced AI opponent.</p>
                </div>
                <div className="mt-8 pt-6 border-t border-purple-500/30 w-full relative z-10">
                  <p className="text-xs text-purple-400 font-bold uppercase tracking-widest mb-1">Highest Score</p>
                  <p className="text-4xl font-mono font-black text-white drop-shadow-md">{pvcPoints}</p>
                </div>
              </div>

              {/* Player vs Live Player Card */}
              <div className="arena-mode-card mode-pvp" onClick={() => handleModeSelect('pvp')}>
                <div className="card-content">
                  <div className="mode-icon">
                    <Users size={48} />
                  </div>
                  <h3 className="text-3xl font-black text-white mb-3 tracking-wide">PvP Combat</h3>
                  <p className="text-slate-300 font-medium px-4">Challenge other students in real-time knowledge combat.</p>
                </div>
                <div className="mt-8 pt-6 border-t border-pink-500/30 w-full relative z-10">
                  <p className="text-xs text-pink-400 font-bold uppercase tracking-widest mb-1">Highest Score</p>
                  <p className="text-4xl font-mono font-black text-white drop-shadow-md">{pvpPoints}</p>
                </div>
              </div>
            </div>

            {/* Realtime HP Bar */}
            <div className="global-hp-container mt-12 animate-in fade-in duration-700 delay-300">
              <div className="flex justify-between items-center mb-2">
                <span className="text-lg font-semibold text-emerald-400 flex items-center gap-2">
                  <span className="text-2xl">⚡</span> Global HP
                </span>
                <span className="text-xl font-bold text-white">
                  {loading ? "..." : globalTotalHp} HP
                </span>
              </div>
              <div className="hp-bar-wrapper">
                <div 
                  className="hp-bar-fill" 
                  style={{ width: `${Math.min(100, Math.max(5, (globalTotalHp / (globalTotalHp + 100)) * 100))}%` }}
                ></div>
              </div>
              <p className="text-sm text-slate-400 mt-3 text-center">
                This is your synced HP across all courses. Use it wisely in the Arena!
              </p>
            </div>
          </div>
        )}

        {phase === 'course_selection' && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-semibold text-white">
                Select Active Enrolled Course 
                <span className="text-sm ml-2 text-slate-400">({mode === 'pvc' ? 'vs Computer' : 'vs Player'})</span>
              </h2>
              <button onClick={() => setPhase('mode_selection')} className="text-purple-400 hover:text-purple-300">
                &larr; Change Mode
              </button>
            </div>

            {loading ? (
              <div className="arena-loader">Loading Courses...</div>
            ) : (
              <div className="arena-course-selection">
                {courses.length === 0 ? (
                  <div className="text-center p-12 bg-slate-900/50 rounded-xl border border-slate-800 col-span-full">
                    <p className="text-slate-400 text-lg">No active course enrolled to play.</p>
                  </div>
                ) : (
                  <div className="arena-course-grid">
                    {courses.map((course: any) => {
                      const courseId = course.courseId || course.cohortId;
                      const eligibility = course.eligibility || evaluateDynamicArenaState(course.percentCompleted ?? 0, course.completedMilestones || []);
                      const isSelected = selectedCourse === courseId;

                      return (
                        <div 
                          key={courseId}
                          className={`arena-course-card relative ${isSelected ? 'selected' : ''}`}
                          onClick={() => {
                            setSelectedCourse(courseId);
                            setShowPvpOpponents(false);
                          }}
                        >
                          {/* Glowing Red Infinity Icon (top right corner mirroring image_704739.png) */}
                          {course.infiniteArenaEnabled && (
                            <div 
                              className="absolute top-3 right-3 bg-red-600 text-white font-black text-xl px-2.5 py-0.5 rounded-full shadow-[0_0_20px_rgba(239,68,68,0.9)] border border-red-400 animate-pulse pointer-events-none z-20 flex items-center justify-center min-w-[32px] h-[32px]"
                              title="Infinite Arena Credits Active"
                            >
                              ∞
                            </div>
                          )}
                          <div className="course-card-glow"></div>
                          <div className="course-card-content">
                            <h4 className="text-xl font-bold text-white mb-2 pr-8">{course.courseName}</h4>
                            <div className="flex items-center justify-between mt-2 gap-2 flex-wrap">
                              <span className={`inline-block px-2 py-1 ${(course.percentCompleted ?? 0) >= 30 ? 'bg-purple-500/20 text-purple-300' : 'bg-amber-500/20 text-amber-400'} text-xs font-bold rounded-md`}>
                                Progress: {course.percentCompleted ?? 0}%
                              </span>
                              {course.infiniteArenaEnabled ? (
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-red-500/20 text-red-400 border border-red-500/40 text-xs font-black rounded-md animate-pulse">
                                  ⚡ Infinite Credits
                                </span>
                              ) : eligibility.availableCredits > 0 ? (
                                <span className="inline-block px-2 py-1 bg-emerald-500/20 text-emerald-300 text-xs font-bold rounded-md animate-pulse">
                                  🎉 {eligibility.availableCredits} Play Credit{eligibility.availableCredits === 1 ? '' : 's'}
                                </span>
                              ) : (
                                <span className="inline-block px-2 py-1 bg-slate-800 text-slate-400 text-xs font-bold rounded-md">
                                  0 Credits
                                </span>
                              )}
                            </div>

                            {/* 5-Tier Level Badges */}
                            <div className="mt-4 pt-3 border-t border-slate-800">
                              <p className="text-[11px] text-slate-400 uppercase font-semibold tracking-wider mb-2">Milestone Tiers:</p>
                              <div className="flex gap-1 justify-between">
                                {MILESTONE_TIERS.map(tier => {
                                  const isCompleted = (course.completedMilestones || []).includes(tier.threshold);
                                  const isActive = (eligibility.activeTier && tier.threshold === eligibility.activeTier.threshold) || course.infiniteArenaEnabled;
                                  const isLocked = !course.infiniteArenaEnabled && (tier.threshold > (course.percentCompleted ?? 0));

                                  let badgeClass = "bg-slate-900/80 border-slate-800/80 text-slate-600 cursor-not-allowed";
                                  let label = `L${tier.level} ${tier.bait}HP`;

                                  if (isCompleted) {
                                    badgeClass = "bg-slate-800 text-slate-400 border-slate-700 font-semibold cursor-not-allowed";
                                    label = `✓ L${tier.level} ${tier.bait}HP`;
                                  } else if (isActive) {
                                    badgeClass = course.infiniteArenaEnabled
                                      ? "bg-red-950/90 border-red-500 text-red-200 shadow-[0_0_12px_rgba(239,68,68,0.5)] font-bold animate-pulse cursor-pointer hover:border-red-400"
                                      : "bg-purple-950/90 border-purple-400 text-purple-200 shadow-[0_0_12px_rgba(168,85,247,0.5)] font-bold animate-pulse cursor-pointer hover:border-purple-300";
                                    label = `L${tier.level} ${tier.bait}HP ACTIVE`;
                                  } else if (!isLocked) {
                                    badgeClass = "bg-slate-800/90 border-slate-700 text-slate-300 font-medium";
                                  }

                                  return (
                                    <div 
                                      key={tier.level}
                                      title={`Level ${tier.level} (${tier.threshold}% progress) - Bait: ${tier.bait} HP`}
                                      onClick={(e) => {
                                        if (isActive) {
                                          e.stopPropagation();
                                          setSelectedCourse(courseId);
                                          handleEnterBattle();
                                        }
                                      }}
                                      className={`px-1.5 py-1 rounded border text-[9px] text-center flex-1 transition-all ${badgeClass}`}
                                    >
                                      <div>{label}</div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
                
                {selectedCourse && (() => {
                  const selectedCourseData = courses.find(c => (c.courseId || c.cohortId) === selectedCourse);
                  const currentProgress = selectedCourseData?.percentCompleted ?? 0;
                  const isInfinite = selectedCourseData?.infiniteArenaEnabled ?? false;
                  
                  const eligibility = selectedCourseData?.eligibility || evaluateDynamicArenaState(currentProgress, selectedCourseData?.completedMilestones || []);
                  const availableCredits = isInfinite ? 999 : (eligibility?.availableCredits ?? 0);
                  
                  const isProgressInsufficient = !isInfinite && currentProgress < 30;
                  const isCreditsInsufficient = !isInfinite && availableCredits <= 0;
                  const isHpInsufficient = globalTotalHp < 50;

                  const isButtonDisabled = isProgressInsufficient || isCreditsInsufficient || (isHpInsufficient && mode === 'pvc');

                  return (
                    <>
                      <div className="arena-actions mt-8 flex flex-col items-center">
                        {isProgressInsufficient && (
                          <div className="text-amber-400 mb-3 bg-amber-500/10 p-3 rounded-lg border border-amber-500/20 text-center font-medium">
                            ⚠️ You must complete at least 30% of this course to play in the Arena. (Current Progress: {currentProgress}%)
                          </div>
                        )}
                        {!isProgressInsufficient && isCreditsInsufficient && (
                          <div className="text-amber-400 mb-3 bg-amber-500/10 p-3 rounded-lg border border-amber-500/20 text-center font-medium">
                            ⚠️ You have 0 credits. Complete more course milestones (30%, 50%, 70%, 90%, 100%) to unlock Arena battles!
                          </div>
                        )}
                        {isHpInsufficient && (
                          <div className="text-red-400 mb-3 bg-red-500/10 p-3 rounded-lg border border-red-500/20 text-center font-medium">
                            ⚡ You need at least 50 HP to enter the Arena. Complete more activities to earn HP!
                          </div>
                        )}
                        <div className="flex justify-center w-full mt-4">
                          <button 
                            onClick={handleEnterBattle} 
                            className="arena-btn-primary disabled:opacity-50 disabled:cursor-not-allowed text-xl py-4 px-12"
                            disabled={isButtonDisabled}
                          >
                            <span>{mode === 'pvc' ? 'Enter Battle' : 'Find Opponent'}</span>
                          </button>
                        </div>
                      </div>

                      {/* PvP Opponents List Mockup */}
                      {mode === 'pvp' && showPvpOpponents && (
                        <div className="mt-12 w-full max-w-3xl bg-slate-900/80 rounded-2xl border border-pink-500/30 p-8 shadow-[0_0_40px_rgba(254,143,181,0.15)] animate-in fade-in slide-in-from-top-4 duration-500">
                          <h3 className="text-2xl font-bold text-white mb-6 flex items-center justify-center gap-3">
                            <Users className="text-pink-400 w-8 h-8" />
                            Live Opponents Found
                          </h3>
                          <div className="space-y-4">
                            <div className="flex flex-col items-center justify-center p-12 bg-slate-800/30 rounded-xl border border-slate-700/50">
                              <div className="w-10 h-10 border-4 border-pink-500/30 border-t-pink-500 rounded-full animate-spin mb-4"></div>
                              <p className="text-slate-400 font-medium">Scanning for live opponents in this course...</p>
                            </div>
                          </div>
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
