import React, { useState, useEffect, useRef, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import { BookOpen, User, ChevronLeft, Layers, ArrowRight, Loader2, BookMarked, Trophy, Zap, Repeat, Check, BarChart3, Search, Play, Compass, Cpu, RefreshCw, Sparkles, BrainCircuit, Sun, Moon, Radar, LogOut } from 'lucide-react';
import { generateSyllabus, generateLessonContent, generatePodcastAudio, generateLessonImage, generateFinalExam, generateCognitiveBriefing } from './services/geminiService';
import { Syllabus, LessonContent, AppScreen, LessonMode, UnitType, SavedCourse, UnitContent, ExamContent, UserStats, UserProfileData } from './types';
import { AudioPlayer } from './components/AudioPlayer';
import { AuthProvider, useAuth } from './context/AuthContext';
import { AuthPage } from './components/auth/AuthPage';
import { trackEvent } from './services/analyticsService';

const STORAGE_KEY = 'nexus_courses_v1';
const PROFILE_KEY = 'nexus_profile_v1';

// --- Suggestion Logic (Localized) ---
const DEFAULT_TOPICS = ['宏观经济周期', '生成式 AI 架构', '认知心理学'];
const TOPIC_POOL = [
  '风险投资策略', '私募股权', '企业并购', '全球地缘政治',
  'Transformer 模型', '稳定扩散算法', '强化学习', '计算机视觉',
  '播客制作工程', '声学设计', '语音合成技术', '现代乐理',
  '博弈论', '量子计算导论', '神经科学', '生物技术趋势',
  '斯多葛哲学', '行为经济学', '太空探索工程'
];

// --- Threads Background Component (Theme Aware) ---
const ThreadsBackground = ({ isDark }: { isDark: boolean }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let wavelength = 0;
    let amplitude = 0;
    let period = 0;
    let shimmer = 0;

    const resize = () => {
      canvas.width = canvas.parentElement?.offsetWidth || window.innerWidth;
      canvas.height = canvas.parentElement?.offsetHeight || window.innerHeight;
      // Config based on size
      wavelength = canvas.width / 10;
      amplitude = canvas.height / 8;
      period = canvas.width / 4;
    };
    
    window.addEventListener('resize', resize);
    resize();

    let frame = 0;
    const animate = () => {
      frame += 0.015; // Speed
      shimmer += 0.02;
      
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.lineWidth = 1.5;
      
      // Theme based colors
      const colors = isDark ? [
          `rgba(16, 185, 129, 0.25)`, // Emerald
          `rgba(6, 182, 212, 0.25)`,  // Cyan
          `rgba(59, 130, 246, 0.20)`, // Blue
          `rgba(139, 92, 246, 0.20)`, // Violet
          `rgba(16, 185, 129, 0.15)`, // Emerald
          `rgba(59, 130, 246, 0.15)`  // Blue
      ] : [
          `rgba(71, 85, 105, 0.15)`,  // Slate
          `rgba(59, 130, 246, 0.15)`, // Blue
          `rgba(14, 165, 233, 0.12)`, // Sky
          `rgba(99, 102, 241, 0.12)`, // Indigo
          `rgba(71, 85, 105, 0.10)`,  // Slate
          `rgba(59, 130, 246, 0.10)`  // Blue
      ];

      for (let i = 0; i < 6; i++) {
        ctx.beginPath();
        ctx.strokeStyle = colors[i];
        
        const offset = i * 35; // Phase shift between lines
        const yOffset = canvas.height / 2 + (i - 2.5) * 25; // Spread vertically

        for (let x = 0; x < canvas.width; x += 5) {
            const y = yOffset + 
                      Math.sin(x / period + frame + offset) * amplitude * Math.sin(frame * 0.5) +
                      Math.cos(x / (period * 0.5) + frame) * (amplitude * 0.3);
            
            if (x === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      
      requestAnimationFrame(animate);
    };

    const animId = requestAnimationFrame(animate);
    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', resize);
    };
  }, [isDark]);

  return <canvas ref={canvasRef} className="absolute inset-0 z-0 pointer-events-none" />;
};


// --- Storage Logic ---
const getSavedCourses = (): SavedCourse[] => {
  try {
    const d = localStorage.getItem(STORAGE_KEY);
    return d ? JSON.parse(d) : [];
  } catch { return []; }
};

const saveCourse = (syllabus: Syllabus, contentMap: Record<string, UnitContent>) => {
  const storageContentMap: Record<string, UnitContent> = {};
  
  Object.keys(contentMap).forEach(key => {
    const unit = contentMap[key];
    if ('deepDive' in unit) { 
       const { coverImageBase64, ...rest } = unit as LessonContent; 
       storageContentMap[key] = rest as LessonContent;
    } else {
       storageContentMap[key] = unit;
    }
  });

  const current = getSavedCourses();
  const idx = current.findIndex(c => c.syllabus.id === syllabus.id);
  const newItem = { syllabus, contentMap: storageContentMap };
  
  if (idx >= 0) {
    current[idx] = newItem;
  } else {
    current.unshift(newItem);
  }

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
  } catch (e) {
    console.warn("Storage quota exceeded. Attempting to clear old courses.");
    while (current.length > 1) {
        current.pop();
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
            return;
        } catch (retryError) { continue; }
    }
    console.error("Storage full, cannot save course.");
  }
};

const getProfile = (): UserProfileData => {
    try {
        const d = localStorage.getItem(PROFILE_KEY);
        if (d) return JSON.parse(d);
    } catch {}
    return {
        stats: { depth: 0, breadth: 0, acuity: 0, focus: 0, retention: 0, creativity: 0 },
        briefing: "正在等待首次校准...",
        briefingTimestamp: 0
    };
};

const saveProfile = (p: UserProfileData) => {
    try {
        localStorage.setItem(PROFILE_KEY, JSON.stringify(p));
    } catch {}
};

// --- Task Interface for UI ---
interface GenTask {
    id: string;
    label: string;
    status: 'pending' | 'loading' | 'done';
    parentId?: string; // For hierarchy
}

const AuthenticatedApp = () => {
  // --- State ---
  const { session, signOut } = useAuth();
  const [isDark, setIsDark] = useState(true); // Theme State
  const [screen, setScreen] = useState<AppScreen>(AppScreen.HOME);
  const [topic, setTopic] = useState('');
  const [suggestions, setSuggestions] = useState<string[]>(DEFAULT_TOPICS);
  
  const [isGenerating, setIsGenerating] = useState(false);
  const [genTasks, setGenTasks] = useState<GenTask[]>([]);

  const [syllabus, setSyllabus] = useState<Syllabus | null>(null);
  const [courseContent, setCourseContent] = useState<Record<string, UnitContent>>({});
  
  const [currentChapterIdx, setCurrentChapterIdx] = useState(0);
  const [currentUnitIdx, setCurrentUnitIdx] = useState(0);

  const [lessonMode, setLessonMode] = useState<LessonMode>(LessonMode.READ);
  const [audioData, setAudioData] = useState<string | null>(null);
  const [isAudioLoading, setIsAudioLoading] = useState(false);
  
  const [quizSelectedId, setQuizSelectedId] = useState<string | null>(null);
  const [isQuizSubmitted, setIsQuizSubmitted] = useState(false);
  const [examAnswers, setExamAnswers] = useState<Record<number, string>>({}); 
  const [isExamSubmitted, setIsExamSubmitted] = useState(false);

  const [flashcardFlipped, setFlashcardFlipped] = useState<Record<number, boolean>>({});
  const [savedCourses, setSavedCourses] = useState<SavedCourse[]>([]);
  const [userProfile, setUserProfile] = useState<UserProfileData>(getProfile());

  useEffect(() => {
    setSavedCourses(getSavedCourses());
    setUserProfile(getProfile());
  }, [screen]);

  // --- Theme Helper ---
  // A utility object to manage colors based on theme
  const t = {
    bg: isDark ? 'bg-black' : 'bg-slate-50',
    text: isDark ? 'text-white' : 'text-slate-900',
    textSecondary: isDark ? 'text-zinc-400' : 'text-slate-600',
    textMuted: isDark ? 'text-zinc-500' : 'text-slate-400',
    border: isDark ? 'border-zinc-800' : 'border-slate-200',
    card: isDark ? 'bg-zinc-900/40' : 'bg-white',
    cardSolid: isDark ? 'bg-zinc-900' : 'bg-white',
    cardHover: isDark ? 'hover:bg-zinc-900' : 'hover:bg-slate-50',
    input: isDark ? 'bg-zinc-900/60' : 'bg-white/80',
    accent: isDark ? 'text-emerald-500' : 'text-emerald-600',
    accentBg: isDark ? 'bg-emerald-600' : 'bg-emerald-600',
    highlightBorder: isDark ? 'focus:border-emerald-500/50' : 'focus:border-emerald-500/30',
    shadow: isDark ? 'shadow-emerald-900/10' : 'shadow-slate-200',
    navBg: isDark ? 'bg-black' : 'bg-slate-50',
    navActive: isDark ? 'bg-zinc-900 text-white' : 'bg-white text-slate-900 shadow-sm border border-slate-100',
    navInactive: isDark ? 'text-zinc-600 hover:text-zinc-400' : 'text-slate-400 hover:text-slate-600',
    prose: isDark ? 'prose-invert prose-zinc' : 'prose-slate',
    gradientOverlay: isDark ? 'from-black' : 'from-slate-50',
  };

  // --- Actions ---

  const toggleTheme = () => setIsDark(!isDark);

  const shuffleSuggestions = () => {
    // Pick 3 random from pool
    const shuffled = [...TOPIC_POOL].sort(() => 0.5 - Math.random());
    setSuggestions(shuffled.slice(0, 3));
  };

  const updateTask = (id: string, status: 'pending' | 'loading' | 'done') => {
      setGenTasks(prev => prev.map(t => t.id === id ? { ...t, status } : t));
  };

  // Helper to update stats and briefing
  const handleCognitiveUpdate = async (type: 'QUIZ'|'EXAM', score: number, total: number, topicName: string) => {
      const current = getProfile();
      
      // 1. Update Stats
      const newStats = { ...current.stats };
      
      // Depth & Breadth
      newStats.depth += 1;
      // Rough calc for breadth (mock)
      if (Math.random() > 0.7) newStats.breadth += 1; 

      // Acuity (Moving Average approx)
      const performance = (score / total) * 100;
      if (newStats.acuity === 0) newStats.acuity = performance;
      else newStats.acuity = Math.round((newStats.acuity * 0.8) + (performance * 0.2));

      // Focus (Boost on completion)
      newStats.focus = Math.min(100, newStats.focus + 5);

      // Retention (Boost on good score)
      if (performance > 80) newStats.retention = Math.min(100, newStats.retention + 3);

      // 2. Generate Briefing (Async)
      let briefing = current.briefing;
      if (Date.now() - current.briefingTimestamp > 5 * 60 * 1000) { // Limit updates to every 5 mins
          try {
              briefing = await generateCognitiveBriefing(topicName, type === 'QUIZ' ? '单元测试' : '结业挑战', performance > 80 ? '卓越' : '良好');
          } catch(e) { console.error(e); }
      }

      const newData = { stats: newStats, briefing, briefingTimestamp: Date.now() };
      setUserProfile(newData);
      saveProfile(newData);
  };

  const handleStartCourse = async (selectedTopic?: string) => {
    const finalTopic = selectedTopic || topic;
    if (!finalTopic.trim()) return;
    
    // Track generation start
    trackEvent('COURSE_GENERATE_START', { topic: finalTopic });

    // If triggered by click, update input
    if (selectedTopic) setTopic(selectedTopic);

    setIsGenerating(true);
    setSyllabus(null);
    setCourseContent({});
    
    setGenTasks([{ id: 'syllabus', label: '初始化知识架构 (Initializing Knowledge Architecture)', status: 'loading' }]);
    
    // Update creativity stat on creation
    const p = getProfile();
    p.stats.creativity += 10;
    saveProfile(p);
    setUserProfile(p);

    try {
      // 1. Generate Syllabus
      const syllabusData = await generateSyllabus(finalTopic);
      setSyllabus(syllabusData);
      updateTask('syllabus', 'done');
      
      // 2. Prepare Unit Tasks
      let allUnits: { title: string; id: string; type: UnitType }[] = [];
      syllabusData.chapters.forEach(ch => {
          ch.units.forEach(u => allUnits.push({ title: u.title, id: u.id, type: u.type }));
      });

      const contentParentId = 'content_generation';
      const unitTasks: GenTask[] = allUnits.map(u => ({
          id: u.id,
          label: u.title,
          status: 'pending' as const,
          parentId: contentParentId
      }));

      setGenTasks(prev => [
          ...prev, 
          ...unitTasks
      ]);

      // 3. PARALLEL GENERATION
      const contentPromises = allUnits.map(async (unit) => {
          updateTask(unit.id, 'loading');
          
          try {
             let result: UnitContent;
             if (unit.type === 'LESSON') {
                 const [content, img] = await Promise.all([
                     generateLessonContent(syllabusData.topic, unit.title),
                     generateLessonImage(unit.title, syllabusData.topic)
                 ]);
                 result = { ...content, coverImageBase64: img } as LessonContent;
             } else {
                 result = await generateFinalExam(syllabusData.topic);
             }
             
             updateTask(unit.id, 'done');
             return { id: unit.id, content: result };
          } catch (e) {
              console.error(`Failed unit ${unit.title}`, e);
              updateTask(unit.id, 'pending');
              return null;
          }
      });

      const results = await Promise.all(contentPromises);

      const newContentMap: Record<string, UnitContent> = {};
      results.forEach(r => {
          if (r) newContentMap[r.id] = r.content;
      });

      setCourseContent(newContentMap);
      saveCourse(syllabusData, newContentMap);
      
      trackEvent('COURSE_GENERATE_SUCCESS', { 
        topic: finalTopic, 
        units: syllabusData.chapters.reduce((acc, c) => acc + c.units.length, 0) 
      });

      setTimeout(() => {
          setIsGenerating(false);
          setScreen(AppScreen.SYLLABUS);
      }, 800);

    } catch (e) {
      console.error(e);
      trackEvent('COURSE_GENERATE_FAIL', { topic: finalTopic, error: String(e) });
      alert("Something went wrong. Please try again.");
      setIsGenerating(false);
    }
  };

  const loadSavedCourse = (c: SavedCourse) => {
      setSyllabus(c.syllabus);
      setCourseContent(c.contentMap);
      setScreen(AppScreen.SYLLABUS);
  };

  const enterUnit = (chapterIdx: number, unitIdx: number) => {
    setCurrentChapterIdx(chapterIdx);
    setCurrentUnitIdx(unitIdx);
    setLessonMode(LessonMode.READ);
    setQuizSelectedId(null);
    setIsQuizSubmitted(false);
    setAudioData(null); 
    setExamAnswers({});
    setIsExamSubmitted(false);
    setFlashcardFlipped({});
    setScreen(AppScreen.LESSON);

    const unit = syllabus?.chapters[chapterIdx]?.units[unitIdx];
    if (unit) {
        trackEvent('LESSON_START', { 
            unitId: unit.id, 
            unitTitle: unit.title,
            type: unit.type 
        });
    }
  };

  const handleNextUnit = () => {
    if (!syllabus) return;
    let nextU = currentUnitIdx + 1;
    let nextC = currentChapterIdx;

    if (nextU >= syllabus.chapters[currentChapterIdx].units.length) {
      nextU = 0;
      nextC = currentChapterIdx + 1;
    }

    if (nextC < syllabus.chapters.length) {
      enterUnit(nextC, nextU);
    } else {
      setScreen(AppScreen.SYLLABUS);
    }
  };

  const handleGenerateAudio = async () => {
    if (!syllabus) return;
    const unitId = syllabus.chapters[currentChapterIdx].units[currentUnitIdx].id;
    const content = courseContent[unitId] as LessonContent;
    
    if (!content?.podcastScript || content.podcastScript.length === 0) return;
    setIsAudioLoading(true);
    try {
      const base64 = await generatePodcastAudio(content.podcastScript);
      setAudioData(base64);
    } catch (e) {
      console.error(e);
      alert("Failed to generate audio.");
    } finally {
      setIsAudioLoading(false);
    }
  };

  const handleQuizSubmit = () => {
      if (!syllabus) return;
      setIsQuizSubmitted(true);
      
      const unitId = syllabus.chapters[currentChapterIdx].units[currentUnitIdx].id;
      const content = courseContent[unitId] as LessonContent;
      const isCorrect = content.quiz.correctOptionId === quizSelectedId;
      
      handleCognitiveUpdate('QUIZ', isCorrect ? 1 : 0, 1, syllabus.topic);
      
      trackEvent('QUIZ_SUBMIT', { 
        unitId, 
        correct: isCorrect, 
        topic: syllabus.topic 
      });
  };

  const handleExamSubmit = () => {
      if (!syllabus) return;
      setIsExamSubmitted(true);
      
      const unitId = syllabus.chapters[currentChapterIdx].units[currentUnitIdx].id;
      const content = courseContent[unitId] as ExamContent;
      const score = content.questions.reduce((acc, q, i) => acc + (examAnswers[i] === q.correctOptionId ? 1 : 0), 0);
      
      handleCognitiveUpdate('EXAM', score, content.questions.length, syllabus.topic);

      trackEvent('EXAM_SUBMIT', { 
        unitId, 
        score, 
        total: content.questions.length,
        topic: syllabus.topic 
      });
  };

  // --- Renderers ---

  // 1. Loading Overlay (Theme Adapted)
  const renderGenerationOverlay = () => {
      if (!isGenerating) return null;
      
      const syllabusTask = genTasks.find(t => t.id === 'syllabus');
      const contentTasks = genTasks.filter(t => t.id !== 'syllabus');

      return (
          <div className={`absolute inset-0 ${t.bg} z-[100] flex flex-col p-8 animate-in fade-in duration-500`}>
              <div className="mt-12 mb-8 relative z-10">
                  <div className={`inline-flex items-center space-x-2 px-3 py-1 ${isDark ? 'bg-zinc-900 border-zinc-800' : 'bg-slate-100 border-slate-200'} border rounded-full text-xs font-medium ${t.accent} mb-4 shadow-sm animate-pulse`}>
                      <Cpu size={12} />
                      <span>Vantus Engine v2.0</span>
                  </div>
                  <h3 className={`text-3xl font-bold ${t.text} tracking-tight relative`}>正在合成知识</h3>
                  <p className={`${t.textMuted} mt-2 relative font-medium`}>正在演算 "{topic}" 的神经回路...</p>
              </div>

              <div className="flex-1 overflow-y-auto no-scrollbar pr-2 relative z-10">
                  <div className="mb-6">
                      <h4 className={`text-[10px] font-bold ${t.textSecondary} uppercase tracking-widest mb-3 pl-1`}>阶段一：架构蓝图</h4>
                      {syllabusTask && (
                          <div className={`flex items-center space-x-4 p-4 rounded-xl border ${t.border} ${isDark ? 'bg-zinc-900/50' : 'bg-white'} transition-all duration-300`}>
                              <StatusIcon status={syllabusTask.status} />
                              <span className={`text-sm font-medium ${syllabusTask.status === 'pending' ? t.textMuted : t.text}`}>
                                  {syllabusTask.label}
                              </span>
                          </div>
                      )}
                  </div>

                  {contentTasks.length > 0 && (
                      <div className="animate-fade-up">
                        <h4 className={`text-[10px] font-bold ${t.textSecondary} uppercase tracking-widest mb-3 pl-1`}>阶段二：知识注入</h4>
                        <div className="space-y-2">
                            {contentTasks.map((task, idx) => (
                                <div 
                                    key={task.id} 
                                    className={`flex items-center space-x-4 p-3 rounded-lg border ${t.border} ${isDark ? 'bg-zinc-900/20' : 'bg-white/60'} transition-all duration-300`}
                                >
                                    <StatusIcon status={task.status} size="sm" />
                                    <span className={`text-sm font-medium truncate ${task.status === 'pending' ? t.textSecondary : t.text}`}>
                                        {task.label}
                                    </span>
                                </div>
                            ))}
                        </div>
                      </div>
                  )}
                  <div className="h-20"></div> 
              </div>
          </div>
      );
  };

  const StatusIcon = ({ status, size = 'md' }: { status: string, size?: 'sm'|'md' }) => {
      const dim = size === 'sm' ? 'w-4 h-4' : 'w-6 h-6';
      const iconSize = size === 'sm' ? 10 : 14;
      
      return (
        <div className={`shrink-0 relative ${dim} flex items-center justify-center`}>
            {status === 'loading' && (
                <div className={`absolute inset-0 border-2 ${isDark ? 'border-zinc-800' : 'border-slate-200'} ${isDark ? 'border-t-emerald-500' : 'border-t-emerald-600'} rounded-full animate-spin`}></div>
            )}
            {status === 'done' && (
                <div className={`${t.accentBg} rounded-full p-0.5 animate-scale-in`}>
                    <Check size={iconSize} className="text-white" strokeWidth={3} />
                </div>
            )}
            {status === 'pending' && <div className={`w-2 h-2 ${isDark ? 'bg-zinc-800' : 'bg-slate-200'} rounded-full`}></div>}
        </div>
      );
  };

  // 2. Home View
  const renderHome = () => (
      <div className={`flex flex-col h-full relative overflow-hidden ${t.bg}`}>
        {/* Render Threads Background only on Home Screen */}
        <ThreadsBackground isDark={isDark} />

        {renderGenerationOverlay()}
        
        {/* Theme Toggle on Home Screen */}
        <button 
             onClick={toggleTheme} 
             className={`absolute top-6 right-6 z-50 p-2.5 rounded-full ${isDark ? 'bg-zinc-900/80 text-zinc-400 hover:text-white' : 'bg-white/80 text-slate-500 hover:text-slate-900'} backdrop-blur-md border ${t.border} transition-all shadow-sm`}
        >
             {isDark ? <Sun size={18} /> : <Moon size={18} />}
        </button>

        <div className="flex-1 flex flex-col items-center justify-center p-8 space-y-16 z-10">
             {/* Logout (Temp Position) */}
             <button 
                onClick={() => signOut()}
                className={`absolute top-6 left-6 z-50 p-2.5 rounded-full ${isDark ? 'bg-zinc-900/80 text-zinc-400 hover:text-red-400' : 'bg-white/80 text-slate-500 hover:text-red-500'} backdrop-blur-md border ${t.border} transition-all shadow-sm`}
             >
                <LogOut size={18} />
             </button>

             <div className="text-center space-y-6 animate-fade-up flex flex-col items-center">
                 {/* Logo: Vantus (Compass) */}
                 <div className={`w-24 h-24 ${isDark ? 'bg-black/50' : 'bg-white/50'} backdrop-blur-sm border ${t.border} rounded-2xl flex items-center justify-center ${t.shadow} shadow-2xl relative group mb-4 rotate-45 hover:rotate-0 transition-transform duration-500`}>
                     <div className={`absolute inset-0 rounded-2xl border ${t.border} opacity-50 ${isDark ? 'group-hover:border-emerald-500/30' : 'group-hover:border-emerald-500/20'} transition-colors duration-700`}></div>
                     <Compass size={48} className={`${t.text} relative z-10 -rotate-45 group-hover:rotate-0 transition-transform duration-500`} strokeWidth={1} />
                     <div className={`absolute bottom-[-10px] right-[-10px] ${isDark ? 'bg-zinc-900' : 'bg-white'} rounded-full p-1.5 border ${t.border} z-20 -rotate-45 group-hover:rotate-0 transition-transform`}>
                        <Sparkles size={14} className={t.accent} />
                     </div>
                 </div>
                 <div>
                    <h1 className={`text-5xl font-serif-display font-medium tracking-tight ${t.text}`}>Vantus</h1>
                    <p className={`${t.textSecondary} text-[10px] uppercase tracking-[0.3em] mt-3 font-medium`}>知识浩瀚 · AI 领航</p>
                 </div>
             </div>

             <div className="w-full max-w-sm relative animate-fade-up delay-100 group">
                 <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
                     <Search size={18} className={`${t.textSecondary} group-focus-within:${t.accent} transition-colors`}/>
                 </div>
                 <input 
                    type="text" 
                    value={topic}
                    onChange={(e) => setTopic(e.target.value)}
                    placeholder="探索未知..."
                    className={`w-full pl-12 pr-12 py-4 rounded-xl ${t.input} backdrop-blur-md border ${t.border} ${t.highlightBorder} focus:ring-0 outline-none transition-all text-base ${t.text} placeholder:${t.textMuted} font-light`}
                    disabled={isGenerating}
                    onKeyDown={(e) => e.key === 'Enter' && handleStartCourse()}
                 />
                 <button 
                    onClick={() => handleStartCourse()}
                    disabled={!topic.trim() || isGenerating}
                    className={`absolute right-2 top-2 bottom-2 aspect-square ${isDark ? 'bg-white text-black hover:bg-zinc-200' : 'bg-slate-900 text-white hover:bg-slate-700'} rounded-lg flex items-center justify-center transition-all disabled:opacity-0 disabled:pointer-events-none`}
                 >
                    <ArrowRight size={18} />
                 </button>
             </div>

             <div className="animate-fade-up delay-200 w-full max-w-sm z-20">
                 <div className="flex items-center justify-between mb-4 px-1">
                    <p className={`text-[10px] font-bold ${t.textSecondary} uppercase tracking-widest`}>推荐征程</p>
                    <button onClick={shuffleSuggestions} className={`${t.textSecondary} hover:${t.text} transition-colors`}>
                        <RefreshCw size={12} />
                    </button>
                 </div>
                 <div className="flex flex-col gap-2.5">
                     {suggestions.map((tItem) => (
                         <button 
                            key={tItem} 
                            onClick={() => handleStartCourse(tItem)} 
                            className={`w-full px-4 py-3 ${t.card} backdrop-blur-sm border ${t.border} hover:${t.border} ${isDark ? 'hover:bg-zinc-900' : 'hover:bg-white'} rounded-lg text-sm ${t.textSecondary} hover:${t.text} text-left transition-all flex items-center justify-between group shadow-sm`}
                         >
                             <span>{tItem}</span>
                             <ArrowRight size={14} className={`opacity-0 group-hover:opacity-100 -translate-x-2 group-hover:translate-x-0 transition-all ${t.textMuted}`} />
                         </button>
                     ))}
                 </div>
             </div>
        </div>
        
        {/* Simple Footer Branding */}
        <div className="absolute bottom-8 w-full text-center pointer-events-none flex flex-col items-center space-y-2">
            {/* <div className={`flex items-center justify-center space-x-2 text-[10px] ${t.textSecondary} font-mono tracking-[0.2em] opacity-80`}>
                <Sparkles size={12} className={t.accent} />
                <span>CREATION</span>
                <span className={t.accent}>×</span>
                <span>INTELLIGENCE</span>
            </div> */}
            <p className={`text-[8px] ${t.textMuted} font-mono tracking-widest opacity-50 uppercase`}>
                Powered by Intelligent Products & Services
            </p>
        </div>
      </div>
  );

  const renderSyllabus = () => (
    <div className={`flex flex-col h-full ${t.bg}`}>
      <div className={`${isDark ? 'bg-black/80' : 'bg-slate-50/80'} backdrop-blur-md sticky top-0 z-10 border-b ${t.border} px-6 py-4 flex items-center justify-between shadow-sm`}>
        <button onClick={() => setScreen(AppScreen.LIBRARY)} className={`p-2 -ml-2 ${isDark ? 'hover:bg-zinc-900' : 'hover:bg-slate-100'} rounded-full ${t.textSecondary} hover:${t.text} transition-colors`}>
          <ChevronLeft size={24} />
        </button>
        <span className={`font-semibold ${t.text} truncate max-w-[200px] text-sm tracking-tight`}>{syllabus?.topic}</span>
        <div className="w-10"></div>
      </div>

      <div className="p-6 pb-32 overflow-y-auto no-scrollbar relative">
         <div className="mb-8 animate-fade-up relative z-10">
            <h2 className={`text-2xl font-light ${t.text} tracking-wide mb-2`}>学习路径</h2>
            <div className={`h-0.5 w-12 ${t.accentBg} rounded-full`}></div>
         </div>

         <div className="space-y-12 relative z-10">
            {syllabus?.chapters.map((chapter, cIdx) => (
              <div key={chapter.id} className="relative animate-fade-up" style={{ animationDelay: `${cIdx * 100}ms` }}>
                <div className="flex items-start space-x-6">
                   <div className="flex flex-col items-center">
                       <div className={`w-6 h-6 rounded-full ${isDark ? 'bg-zinc-900 text-zinc-500' : 'bg-white text-slate-500'} border ${t.border} flex items-center justify-center text-[10px] font-mono z-10`}>
                         {cIdx + 1}
                       </div>
                       {/* Connector */}
                       {cIdx !== syllabus.chapters.length - 1 && (
                          <div className={`w-px h-full ${isDark ? 'bg-zinc-900' : 'bg-slate-200'} my-2`}></div>
                       )}
                   </div>
                   
                   <div className="flex-1 space-y-6 pb-4">
                      <h3 className={`font-medium ${t.textSecondary} text-lg tracking-tight pt-0.5`}>{chapter.title}</h3>
                      <div className="space-y-3">
                         {chapter.units.map((unit, uIdx) => (
                           <button 
                             key={unit.id}
                             onClick={() => enterUnit(cIdx, uIdx)}
                             className={`w-full text-left p-4 rounded-xl ${t.card} border ${t.border} ${t.cardHover} transition-all group relative overflow-hidden`}
                           >
                              <div className={`absolute left-0 top-0 bottom-0 w-0.5 bg-transparent group-hover:${t.accentBg} transition-colors`}></div>
                              <div className="flex justify-between items-start mb-1.5">
                                <h4 className={`font-medium ${t.textSecondary} text-sm leading-snug pr-8 group-hover:${t.text} transition-colors`}>
                                    {unit.title}
                                </h4>
                                {unit.type === 'EXAM' && <Trophy size={14} className="text-amber-600 shrink-0" />}
                                {unit.type === 'LESSON' && <div className={`w-1.5 h-1.5 rounded-full ${isDark ? 'bg-zinc-700' : 'bg-slate-300'} group-hover:${t.accentBg}/50`}></div>}
                              </div>
                              <p className={`text-[10px] ${t.textMuted} line-clamp-1 leading-relaxed font-mono`}>{unit.description}</p>
                           </button>
                         ))}
                      </div>
                   </div>
                </div>
              </div>
            ))}
        </div>
      </div>
    </div>
  );

  const renderLessonView = () => {
    if (!syllabus) return null;
    const currentUnit = syllabus.chapters[currentChapterIdx].units[currentUnitIdx];
    const content = courseContent[currentUnit.id];
    
    // Check loading
    if (!content) {
         return (
            <div className={`flex flex-col items-center justify-center h-full space-y-4 ${t.bg}`}>
                <Loader2 className={`animate-spin ${t.accent}`} size={32} />
                <p className={`${t.textMuted} font-mono text-xs`}>正在解码知识...</p>
            </div>
        );
    }
    
    const isExam = currentUnit.type === 'EXAM';

    return (
        <div className={`flex flex-col h-full ${t.bg} relative`}>
            {/* Top Bar with Gradient Fade */}
            <div className={`absolute top-0 left-0 right-0 h-24 bg-gradient-to-b ${t.gradientOverlay} to-transparent pointer-events-none z-10`}></div>
            <div className={`${isDark ? 'bg-black/90' : 'bg-slate-50/90'} backdrop-blur-xl border-b ${t.border} px-4 py-3 flex items-center justify-between sticky top-0 z-20`}>
                <button onClick={() => setScreen(AppScreen.SYLLABUS)} className={`p-2 ${isDark ? 'hover:bg-zinc-900' : 'hover:bg-slate-100'} rounded-full ${t.textSecondary} hover:${t.text} transition-colors`}>
                <ChevronLeft size={24} />
                </button>
                
                {!isExam && (
                    <div className={`flex space-x-1 ${isDark ? 'bg-zinc-900' : 'bg-white'} p-1 rounded-lg border ${t.border}`}>
                        {[{id: LessonMode.READ, label: '深度阅读'}, {id: LessonMode.LISTEN, label: '沉浸聆听'}, {id: LessonMode.QUIZ, label: '实战演练'}].map(m => (
                            <button 
                                key={m.id}
                                onClick={() => setLessonMode(m.id)} 
                                className={`px-4 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-wider transition-all duration-300 ${lessonMode === m.id ? (isDark ? 'bg-zinc-800 text-white' : 'bg-slate-100 text-slate-900') : `${t.textMuted} hover:${t.textSecondary}`}`}
                            >
                                {m.label}
                            </button>
                        ))}
                    </div>
                )}
                <div className="w-8"></div>
            </div>

            <div className={`flex-1 overflow-y-auto no-scrollbar p-6 ${t.bg}`}>
                {isExam ? renderExamViewInternal(content as ExamContent) : renderLessonInternal(content as LessonContent, currentUnit.title)}
            </div>
        </div>
    );
  };

  const renderLessonInternal = (lesson: LessonContent, title: string) => (
     <div className="max-w-xl mx-auto space-y-8 pb-32">
        <div className="animate-fade-up">
            <span className={`text-[10px] font-bold tracking-widest ${t.textMuted} uppercase mb-3 block`}>
                章节 {currentChapterIdx + 1} / 单元 {currentUnitIdx + 1}
            </span>
            <h2 className={`text-2xl font-light ${t.text} leading-tight mb-6`}>{title}</h2>
            {lesson.coverImageBase64 && (
                <div className={`w-full aspect-[21/9] rounded-lg overflow-hidden mb-8 relative animate-scale-in group border ${t.border} grayscale hover:grayscale-0 transition-all duration-700`}>
                    <img src={`data:image/jpeg;base64,${lesson.coverImageBase64}`} alt="Cover" className="w-full h-full object-cover opacity-80 group-hover:opacity-100"/>
                </div>
            )}
            <p className={`text-base ${t.textSecondary} font-light leading-relaxed border-l-2 ${isDark ? 'border-emerald-900' : 'border-emerald-200'} pl-4 py-1`}>
                {lesson.summary}
            </p>
        </div>

        {lessonMode === LessonMode.READ && (
            <div className="animate-fade-up delay-100">
                <article className={`prose ${t.prose} max-w-none prose-headings:font-light prose-h2:${t.text} prose-p:${t.textSecondary} prose-p:leading-8 prose-li:${t.textSecondary} prose-strong:${isDark ? 'text-zinc-200' : 'text-slate-800'}`}>
                    <ReactMarkdown components={{
                        h1: (p) => <h1 className={`text-xl mt-8 mb-4 font-medium tracking-tight ${t.text}`} {...p} />,
                        h2: (p) => <h2 className={`text-lg mt-10 mb-4 ${t.text} font-medium flex items-center`} {...p}><span className={`w-1 h-4 ${t.accentBg} mr-3`}></span>{p.children}</h2>, 
                        p: (p) => {
                            // Custom rendering to detect citations [Source X] or [Source X.Y]
                            const content = String(p.children);
                            if (content.includes('[Source')) {
                                const parts = content.split(/(\[Source \d+(?:\.\d+)?\])/g);
                                return (
                                    <p className="mb-6 font-light">
                                        {parts.map((part, i) => {
                                            const match = part.match(/\[Source (\d+)(?:\.\d+)?\]/);
                                            if (match) {
                                                const idx = parseInt(match[1]) - 1; // 0-based
                                                const source = lesson.sources?.[idx];
                                                if (!source) return null;
                                                
                                                return (
                                                    <span key={i} className="relative inline-block group mx-1 align-super text-[10px]">
                                                        <a href={source.uri} target="_blank" rel="noreferrer" className={`${t.accent} hover:underline cursor-pointer font-bold px-1 rounded bg-emerald-500/10`}>
                                                            {idx + 1}
                                                        </a>
                                                        {/* Hover Card */}
                                                        <div className={`absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 p-3 rounded-lg ${isDark ? 'bg-zinc-900 border-zinc-700' : 'bg-white border-slate-200'} border shadow-xl opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50 text-left`}>
                                                            <div className="text-xs font-bold truncate mb-1 text-emerald-500">引用来源</div>
                                                            <div className={`text-xs font-medium mb-1 line-clamp-2 ${t.text}`}>{source.title}</div>
                                                            <div className={`text-[10px] ${t.textMuted} truncate`}>{new URL(source.uri).hostname}</div>
                                                            {/* Arrow Down */}
                                                            <div className={`absolute top-full left-1/2 -translate-x-1/2 border-8 border-transparent ${isDark ? 'border-t-zinc-900' : 'border-t-white'}`}></div>
                                                        </div>
                                                    </span>
                                                );
                                            }
                                            return part;
                                        })}
                                    </p>
                                )
                            }
                            return <p className="mb-6 font-light" {...p} />
                        },
                        strong: (p) => <span className={`font-medium ${t.text}`} {...p} />, 
                    }}>
                    {lesson.deepDive}
                    </ReactMarkdown>
                </article>

                {lesson.sources && lesson.sources.length > 0 && (
                    <div className={`mt-12 mb-8 pt-8 border-t ${t.border}`}>
                        <h3 className={`text-[10px] font-bold ${t.textMuted} uppercase tracking-widest mb-4`}>参考资料</h3>
                        <div className="grid gap-2">
                            {lesson.sources.map((s, i) => (
                                <a key={i} href={s.uri} target="_blank" rel="noreferrer" className={`flex items-center space-x-3 p-3 rounded-lg ${t.card} border border-transparent hover:border-zinc-700 transition-all group`}>
                                    <div className={`w-5 h-5 rounded flex items-center justify-center text-[10px] font-mono ${t.accentBg} text-white`}>{i + 1}</div>
                                    <div className="flex-1 min-w-0">
                                        <div className={`text-xs font-medium truncate ${t.textSecondary} group-hover:${t.text}`}>{s.title}</div>
                                        <div className={`text-[10px] ${t.textMuted} truncate`}>{s.uri}</div>
                                    </div>
                                    <ArrowRight size={12} className={`${t.textMuted} opacity-0 group-hover:opacity-100 transition-opacity`} />
                                </a>
                            ))}
                        </div>
                    </div>
                )}

                {lesson.flashcards && lesson.flashcards.length > 0 && (
                    <div className={`mt-16 mb-8 border-t ${t.border} pt-10`}>
                         <div className="flex items-center space-x-2 mb-6">
                            <BrainCircuit size={16} className={t.accent} />
                            <h3 className={`text-[10px] font-bold ${t.textMuted} uppercase tracking-widest`}>记忆节点</h3>
                        </div>
                        <div className="grid gap-5">
                            {lesson.flashcards.map((card, idx) => (
                                <div key={idx} className="h-48 perspective-1000 cursor-pointer group select-none" onClick={() => setFlashcardFlipped(p => ({...p, [idx]: !p[idx]}))}>
                                    <div className={`relative w-full h-full transition-all duration-700 transform-style-3d ${flashcardFlipped[idx] ? 'rotate-y-180' : ''}`}>
                                        {/* Front Face - The "Chip" */}
                                        <div className={`absolute inset-0 bg-gradient-to-br ${isDark ? 'from-zinc-900 via-zinc-900 to-black' : 'from-white via-slate-50 to-slate-100'} rounded-2xl border ${t.border} flex flex-col items-center justify-center p-6 backface-hidden ${isDark ? 'group-hover:border-emerald-500/30' : 'group-hover:border-emerald-500/50'} shadow-sm transition-all`}>
                                            
                                            {/* Decorative circuitry bits */}
                                            <div className="absolute top-4 right-4 flex space-x-1">
                                                <div className={`w-1 h-1 ${isDark ? 'bg-zinc-700' : 'bg-slate-300'} rounded-full ${isDark ? 'group-hover:bg-emerald-500' : 'group-hover:bg-emerald-600'} transition-colors duration-500`}></div>
                                                <div className={`w-1 h-1 ${isDark ? 'bg-zinc-700' : 'bg-slate-300'} rounded-full ${isDark ? 'group-hover:bg-emerald-500' : 'group-hover:bg-emerald-600'} transition-colors duration-500 delay-100`}></div>
                                            </div>
                                            
                                            <div className={`w-10 h-10 mb-4 rounded-full ${isDark ? 'bg-zinc-950 border-zinc-800' : 'bg-white border-slate-200'} border flex items-center justify-center group-hover:scale-110 transition-transform duration-500 shadow-inner`}>
                                                <span className={`text-lg font-mono ${t.textMuted} group-hover:${t.accent} transition-colors`}>?</span>
                                            </div>

                                            <span className={`text-[9px] ${t.textMuted} uppercase tracking-[0.2em] font-medium mb-3`}>核心概念</span>
                                            <h3 className={`text-lg font-medium ${t.text} text-center leading-snug line-clamp-2`}>{card.front}</h3>
                                            
                                            <div className={`absolute bottom-4 flex items-center space-x-2 ${t.textMuted} group-hover:${t.accent} transition-colors text-[9px] tracking-wider uppercase`}>
                                                <Repeat size={10} />
                                                <span>点击揭示</span>
                                            </div>
                                        </div>

                                        {/* Back Face - The "Data" */}
                                        <div className={`absolute inset-0 ${isDark ? 'bg-zinc-800 border-zinc-700' : 'bg-white border-slate-200'} rounded-2xl border flex flex-col items-center justify-center p-6 backface-hidden rotate-y-180 shadow-xl overflow-hidden relative h-full`}>
                                            {/* Background texture */}
                                            <div className={`absolute inset-0 opacity-5 bg-[radial-gradient(${isDark ? '#fff' : '#000'}_1px,transparent_1px)] [background-size:16px_16px]`}></div>
                                            
                                            <span className={`text-[9px] ${t.accent} uppercase tracking-[0.2em] font-bold mb-3 relative z-10 shrink-0`}>解析详情</span>
                                            <div className="flex-1 overflow-y-auto w-full no-scrollbar relative z-10 flex items-center justify-center">
                                                <p className={`text-center font-light leading-relaxed ${isDark ? 'text-zinc-200' : 'text-slate-800'} text-xs w-full`}>{card.back}</p>
                                            </div>
                                            
                                            <div className="absolute bottom-4 w-full flex justify-center pointer-events-none shrink-0">
                                                <div className={`h-1 w-12 ${isDark ? 'bg-zinc-600/50' : 'bg-slate-200'} rounded-full`}></div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        )}

        {lessonMode === LessonMode.LISTEN && (
            <div className="animate-scale-in mt-6">
                <div className="h-[550px] w-full">
                    <AudioPlayer base64Audio={audioData} isLoading={isAudioLoading} onGenerate={handleGenerateAudio} script={lesson.podcastScript}/>
                </div>
            </div>
        )}

        {lessonMode === LessonMode.QUIZ && (
             <div className="animate-fade-up">
                <div className={`${t.cardSolid} rounded-xl p-8 mb-6 border ${t.border}`}>
                   <div className="flex items-center space-x-2 mb-6">
                      <div className={`w-1.5 h-1.5 rounded-full ${t.accentBg} animate-pulse`}></div>
                      <span className={`text-[10px] font-bold ${t.textMuted} uppercase tracking-widest`}>认知锚点</span>
                   </div>
                   <h3 className={`text-lg font-medium ${t.text} leading-relaxed mb-8`}>{lesson.quiz.question}</h3>
                   <div className="space-y-3">
                     {lesson.quiz.options.map(opt => {
                       const isSelected = quizSelectedId === opt.id;
                       const isCorrect = lesson.quiz.correctOptionId === opt.id;
                       
                       // HIGH CONTRAST STATES
                       let s = `w-full p-4 rounded-lg text-left border text-sm font-medium transition-all duration-200 `;
                       if (isQuizSubmitted) {
                         if (isCorrect) s += "border-emerald-900 bg-emerald-900/10 text-emerald-500";
                         else if (isSelected) s += "border-red-900 bg-red-900/10 text-red-500";
                         else s += `${t.border} ${isDark ? 'bg-zinc-900' : 'bg-slate-50'} ${t.textMuted} opacity-50`;
                       } else {
                         if (isSelected) s += `${isDark ? 'border-white bg-white text-black' : 'border-slate-900 bg-slate-900 text-white'} shadow-lg transform scale-[1.01]`;
                         else s += `${t.border} ${isDark ? 'bg-zinc-900 text-zinc-400 hover:bg-zinc-800' : 'bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900'}`;
                       }
                       return <button key={opt.id} onClick={() => !isQuizSubmitted && setQuizSelectedId(opt.id)} className={s}>{opt.text}</button>
                     })}
                   </div>
                </div>
                {!isQuizSubmitted ? (
                  <button onClick={handleQuizSubmit} disabled={!quizSelectedId} className={`w-full py-4 rounded-lg ${isDark ? 'bg-white text-black' : 'bg-slate-900 text-white'} font-bold shadow-lg disabled:opacity-50 hover:scale-[1.01] transition-all`}>验证答案</button>
                ) : (
                  <div className="animate-fade-up">
                      <div className={`${isDark ? 'bg-zinc-900' : 'bg-slate-100'} p-6 rounded-lg border ${t.border} text-sm ${t.textSecondary} mb-6 leading-relaxed`}>
                          <strong className={`block mb-2 ${t.text}`}>深度解析</strong>{lesson.quiz.explanation}
                      </div>
                      <button onClick={handleNextUnit} className={`w-full py-4 rounded-lg ${isDark ? 'bg-white text-black' : 'bg-slate-900 text-white'} font-bold shadow-lg flex items-center justify-center space-x-2 hover:scale-[1.01] transition-all`}><span>下一单元</span><ArrowRight size={18}/></button>
                  </div>
                )}
             </div>
        )}
     </div>
  );

  const renderExamViewInternal = (content: ExamContent) => {
      const score = content.questions.reduce((acc, q, i) => acc + (examAnswers[i] === q.correctOptionId ? 1 : 0), 0);
      const passed = score >= Math.ceil(content.questions.length * 0.6);

      return (
          <div className="space-y-10 pb-32 max-w-xl mx-auto">
             <div className="animate-fade-up">
                 <div className="inline-flex items-center space-x-2 px-3 py-1 bg-amber-900/10 text-amber-600 border border-amber-900/20 rounded-full text-[10px] font-bold mb-4">
                     <Trophy size={10} />
                     <span>结业认证考核</span>
                 </div>
                 <h2 className={`text-3xl font-light ${t.text} tracking-tight`}>终极评估</h2>
             </div>
             {content.questions.map((q, idx) => (
                 <div key={idx} className={`space-y-4 animate-fade-up ${t.cardSolid} p-6 rounded-xl border ${t.border}`} style={{ animationDelay: `${idx * 100}ms` }}>
                     <h3 className={`font-medium ${t.text} text-lg leading-relaxed`}>{idx + 1}. {q.question}</h3>
                     <div className="space-y-2">
                         {q.options.map(opt => {
                             const isSelected = examAnswers[idx] === opt.id;
                             const isCorrect = opt.id === q.correctOptionId;
                             
                             let style = `w-full p-3 rounded-lg text-left border text-sm transition-all duration-200 `;
                             if (isExamSubmitted) {
                                 if (isCorrect) style += "bg-emerald-900/20 border-emerald-900 text-emerald-600 font-bold";
                                 else if (isSelected) style += "bg-red-900/20 border-red-900 text-red-500";
                                 else style += `${t.bg} ${t.border} ${t.textSecondary}`;
                             } else {
                                 if (isSelected) style += `${isDark ? 'bg-white border-white text-black' : 'bg-slate-900 border-slate-900 text-white'} shadow-md`;
                                 else style += `${t.bg} ${t.border} ${t.textSecondary} hover:${isDark ? 'bg-zinc-800' : 'bg-slate-100'}`;
                             }
                             return <button key={opt.id} onClick={() => !isExamSubmitted && setExamAnswers(p => ({...p, [idx]: opt.id}))} className={style}>{opt.text}</button>
                         })}
                     </div>
                 </div>
             ))}
             {!isExamSubmitted ? (
                 <button onClick={handleExamSubmit} disabled={Object.keys(examAnswers).length < content.questions.length} className={`w-full py-4 ${isDark ? 'bg-white text-black' : 'bg-slate-900 text-white'} rounded-lg font-bold shadow-lg disabled:opacity-50 hover:scale-[1.01] transition-all`}>提交评估</button>
             ) : (
                 <div className={`text-center p-8 ${t.cardSolid} rounded-2xl space-y-4 border ${t.border} animate-scale-in`}>
                     <div className={`text-5xl font-light ${t.text}`}>{score} / {content.questions.length}</div>
                     <p className={`font-medium text-sm ${passed ? 'text-emerald-500' : t.textMuted}`}>{passed ? '认证通过' : '需重修'}</p>
                     <button onClick={() => setScreen(AppScreen.HOME)} className={`px-8 py-3 ${isDark ? 'bg-white text-black' : 'bg-slate-900 text-white'} rounded-full text-xs font-bold hover:opacity-90 transition-opacity tracking-widest`}>返回</button>
                 </div>
             )}
          </div>
      );
  };

  const renderLibrary = () => (
      <div className={`flex flex-col h-full ${t.bg} px-6 pt-12 pb-24 relative overflow-hidden`}>
          <h1 className={`text-2xl font-light ${t.text} mb-8 tracking-wide animate-fade-up relative z-10`}>智库</h1>
          {savedCourses.length === 0 ? (
            <div className={`flex-1 flex flex-col items-center justify-center ${t.textMuted} space-y-4 animate-fade-in relative z-10`}>
                <BookMarked size={32} strokeWidth={1} />
                <p className="text-xs tracking-widest">暂无数据</p>
            </div>
          ) : (
            <div className="space-y-3 overflow-y-auto no-scrollbar relative z-10">
                {savedCourses.map((c, i) => (
                <button key={c.syllabus.id} onClick={() => loadSavedCourse(c)} className={`w-full text-left p-5 rounded-lg ${t.cardSolid} border ${t.border} ${isDark ? 'hover:border-zinc-600' : 'hover:border-slate-400'} transition-all group animate-fade-up`} style={{ animationDelay: `${i * 50}ms` }}>
                    <h3 className={`font-medium ${t.textSecondary} text-base group-hover:${t.text} transition-colors`}>{c.syllabus.topic}</h3>
                    <div className={`flex items-center space-x-3 mt-2 text-[10px] ${t.textMuted} font-mono`}>
                        <span className={t.accent}>{c.syllabus.chapters.reduce((a,b)=>a+b.units.length,0)} 单元</span>
                        <span>{new Date(c.syllabus.createdAt).toLocaleDateString()}</span>
                    </div>
                </button>
                ))}
            </div>
          )}
      </div>
  );

  const RadarChart = ({ stats }: { stats: UserStats }) => {
      // Scale factors
      const maxVal = 100;
      const size = 120;
      const center = size / 2;
      const radius = size * 0.4;
      
      const metrics = [
          { label: '深度', val: stats.depth * 5 }, // Scale depth
          { label: '广度', val: stats.breadth * 10 },
          { label: '敏锐', val: stats.acuity },
          { label: '专注', val: stats.focus },
          { label: '记忆', val: stats.retention },
          { label: '创造', val: stats.creativity },
      ];

      const getPoints = (scale: number) => {
          return metrics.map((m, i) => {
              const angle = (Math.PI * 2 * i) / metrics.length - Math.PI / 2;
              const val = Math.min(Math.max(m.val, 5), maxVal); // Min 5 to show shape
              const r = radius * (val / maxVal) * scale;
              return `${center + Math.cos(angle) * r},${center + Math.sin(angle) * r}`;
          }).join(' ');
      };

      return (
          <div className="relative w-full h-full flex items-center justify-center">
              <svg width={size} height={size} className="overflow-visible">
                  {/* Background Grid - Added opacity to always show structure */}
                  <polygon points={getPoints(1)} className={`${isDark ? 'stroke-zinc-800' : 'stroke-slate-200'} fill-transparent`} strokeWidth="1" />
                  <polygon points={getPoints(0.8)} className={`${isDark ? 'stroke-zinc-800/60' : 'stroke-slate-200/60'} fill-transparent`} strokeWidth="0.5" strokeDasharray="2 2" />
                  <polygon points={getPoints(0.6)} className={`${isDark ? 'stroke-zinc-800' : 'stroke-slate-200'} fill-transparent`} strokeWidth="1" />
                  <polygon points={getPoints(0.4)} className={`${isDark ? 'stroke-zinc-800/60' : 'stroke-slate-200/60'} fill-transparent`} strokeWidth="0.5" strokeDasharray="2 2" />
                  <polygon points={getPoints(0.2)} className={`${isDark ? 'stroke-zinc-800' : 'stroke-slate-200'} fill-transparent`} strokeWidth="1" />
                  
                  {/* Axis Lines - Connecting center to corners */}
                  {metrics.map((_, i) => {
                      const angle = (Math.PI * 2 * i) / metrics.length - Math.PI / 2;
                      const x = center + Math.cos(angle) * radius;
                      const y = center + Math.sin(angle) * radius;
                      return (
                          <line 
                            key={`axis-${i}`} 
                            x1={center} 
                            y1={center} 
                            x2={x} 
                            y2={y} 
                            className={`${isDark ? 'stroke-zinc-800/50' : 'stroke-slate-200/50'}`} 
                            strokeWidth="1" 
                          />
                      );
                  })}

                  {/* Level Connectors (Horizontal lines between axes at each level) */}
                  {[0.2, 0.4, 0.6, 0.8, 1].map((scale, levelIdx) => (
                      <path
                        key={`level-${levelIdx}`}
                        d={metrics.map((_, i) => {
                            const angle = (Math.PI * 2 * i) / metrics.length - Math.PI / 2;
                            const r = radius * scale;
                            const x = center + Math.cos(angle) * r;
                            const y = center + Math.sin(angle) * r;
                            return (i === 0 ? 'M' : 'L') + `${x},${y}`;
                        }).join(' ') + 'Z'}
                        className={`${isDark ? 'stroke-zinc-800/30' : 'stroke-slate-200/30'} fill-transparent`}
                        strokeWidth="0.5"
                      />
                  ))}

                  {/* Data Shape - Use values from stats */}
                  <g className="group">
                    <polygon 
                        points={metrics.map((m, i) => {
                            const angle = (Math.PI * 2 * i) / metrics.length - Math.PI / 2;
                            const val = Math.min(Math.max(m.val, 5), maxVal);
                            const r = radius * (val / maxVal);
                            return `${center + Math.cos(angle) * r},${center + Math.sin(angle) * r}`;
                        }).join(' ')}
                        className={`${t.accentBg} fill-current opacity-20 group-hover:opacity-30 transition-opacity duration-300`} 
                    />
                    <polygon 
                        points={metrics.map((m, i) => {
                            const angle = (Math.PI * 2 * i) / metrics.length - Math.PI / 2;
                            const val = Math.min(Math.max(m.val, 5), maxVal);
                            const r = radius * (val / maxVal);
                            return `${center + Math.cos(angle) * r},${center + Math.sin(angle) * r}`;
                        }).join(' ')}
                        className={`${t.accent} stroke-current fill-transparent group-hover:stroke-[2px] transition-all duration-300`} 
                        strokeWidth="1.5"
                        strokeLinejoin="round"
                    />
                  </g>
                  
                  {/* Labels - Simplified logic for positioning */}
                  {metrics.map((m, i) => {
                      const angle = (Math.PI * 2 * i) / metrics.length - Math.PI / 2;
                      const r = radius + 15;
                      const x = center + Math.cos(angle) * r;
                      const y = center + Math.sin(angle) * r;
                      return (
                          <text 
                            key={i} 
                            x={x} 
                            y={y} 
                            fontSize="9" 
                            textAnchor="middle" 
                            dominantBaseline="middle" 
                            className={`${isDark ? 'fill-zinc-400' : 'fill-slate-600'} font-medium tracking-wider`}
                          >
                              {m.label}
                          </text>
                      )
                  })}
              </svg>
          </div>
      );
  }

  const renderProfile = () => (
      <div className={`flex flex-col h-full ${t.bg} px-6 pt-12 relative overflow-hidden`}>
           <div className="flex items-center space-x-4 mb-8 animate-fade-up relative z-10">
                <div className={`w-16 h-16 ${t.cardSolid} rounded-full flex items-center justify-center ${t.textMuted} border ${t.border}`}>
                    <User size={24} />
                </div>
                <div>
                    <h2 className={`text-lg font-medium ${t.text} tracking-tight`}>探索者</h2>
                    <p className={`text-xs ${t.textSecondary} font-mono uppercase`}>Level {Math.floor((userProfile.stats.depth + userProfile.stats.breadth) / 2) + 1}</p>
                </div>
            </div>

            {/* AI Briefing Card */}
            <div className={`mb-6 p-5 ${t.cardSolid} rounded-xl border ${t.border} relative overflow-hidden animate-fade-up delay-100 group`}>
                <div className={`absolute top-0 right-0 p-2 opacity-10 group-hover:opacity-20 transition-opacity ${t.text}`}>
                    <Sparkles size={48} strokeWidth={1} />
                </div>
                <div className="flex items-center space-x-2 mb-3">
                    <div className={`w-1.5 h-1.5 ${t.accentBg} rounded-full animate-pulse`}></div>
                    <span className={`text-[10px] font-bold ${t.textMuted} uppercase tracking-widest`}>认知简报</span>
                </div>
                <p className={`text-xs ${t.text} font-light leading-relaxed`}>
                    {userProfile.briefing}
                </p>
                <div className={`mt-3 text-[9px] ${t.textMuted} font-mono`}>
                    更新于: {new Date(userProfile.briefingTimestamp).toLocaleTimeString()}
                </div>
            </div>

            <div className="grid grid-cols-2 gap-3 mb-8 animate-fade-up delay-200 relative z-10 flex-1">
                {/* Radar Chart Card */}
                <div className={`${t.cardSolid} p-4 rounded-xl flex flex-col items-center justify-center h-full border ${t.border}`}>
                    <div className="w-full aspect-square relative">
                        <RadarChart stats={userProfile.stats} />
                    </div>
                </div>

                <div className="flex flex-col gap-3 h-full">
                    <div className={`${t.cardSolid} p-4 rounded-xl flex flex-col justify-center flex-1 border ${t.border}`}>
                        <BarChart3 className={`${t.textSecondary} mb-2`} size={16} />
                        <div>
                            <div className={`text-2xl font-light ${t.text}`}>{userProfile.stats.breadth}</div>
                            <div className={`text-[9px] font-bold ${t.textSecondary} uppercase tracking-widest`}>领域跨度</div>
                        </div>
                    </div>
                    <div className={`${t.cardSolid} p-4 rounded-xl flex flex-col justify-center flex-1 border ${t.border}`}>
                        <Trophy className={`${t.textSecondary} mb-2`} size={16} />
                        <div>
                            <div className={`text-2xl font-light ${t.text}`}>{userProfile.stats.depth}</div>
                            <div className={`text-[9px] font-bold ${t.textSecondary} uppercase tracking-widest`}>深度单元</div>
                        </div>
                    </div>
                </div>
            </div>
      </div>
  );

  return (
    <div className={`min-h-screen ${isDark ? 'bg-black' : 'bg-slate-100'} flex items-center justify-center font-sans`}>
      {/* Simulator Frame */}
      <div className={`w-full h-[100dvh] sm:h-[850px] sm:max-w-[400px] ${t.bg} sm:rounded-[3rem] shadow-2xl overflow-hidden relative flex flex-col border-[8px] ${isDark ? 'border-zinc-800' : 'border-slate-300'} ring-1 ${isDark ? 'ring-zinc-800' : 'ring-slate-300/50'}`}>
        
        {/* Dynamic App Content Container */}
        <div className={`flex-1 overflow-hidden relative ${t.bg}`}>
           {screen === AppScreen.HOME && renderHome()}
           {screen === AppScreen.SYLLABUS && renderSyllabus()}
           {screen === AppScreen.LESSON && renderLessonView()}
           {screen === AppScreen.LIBRARY && renderLibrary()}
           {screen === AppScreen.PROFILE && renderProfile()}
        </div>

        {/* Bottom Navigation */}
        {!isGenerating && screen !== AppScreen.LESSON && (
            <div className={`${t.navBg} border-t ${t.border} h-20 flex items-center justify-around px-6 pb-4 shrink-0 z-50`}>
                <button onClick={() => setScreen(AppScreen.HOME)} className={`p-3 rounded-xl transition-all duration-300 ${screen === AppScreen.HOME ? t.navActive : t.navInactive}`}>
                    <Layers size={20} />
                </button>
                <button onClick={() => setScreen(AppScreen.LIBRARY)} className={`p-3 rounded-xl transition-all duration-300 ${screen === AppScreen.LIBRARY ? t.navActive : t.navInactive}`}>
                    <BookOpen size={20} />
                </button>
                <button onClick={() => setScreen(AppScreen.PROFILE)} className={`p-3 rounded-xl transition-all duration-300 ${screen === AppScreen.PROFILE ? t.navActive : t.navInactive}`}>
                    <User size={20} />
                </button>
            </div>
        )}
      </div>
    </div>
  );
};

const AppWrapper = () => {
    return (
        <AuthProvider>
            <AuthGuard />
        </AuthProvider>
    );
};

const AuthGuard = () => {
    const { session, loading } = useAuth();
    const [isDark, setIsDark] = useState(true);

    if (loading) return (
        <div className="min-h-screen bg-black flex items-center justify-center">
            <Loader2 className="animate-spin text-emerald-500" size={32} />
        </div>
    );

    if (!session) return <AuthPage onSuccess={() => {}} isDark={isDark} />;

    return <AuthenticatedApp />;
};

export default AppWrapper;
