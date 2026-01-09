export type UnitType = 'LESSON' | 'EXAM';

export interface Unit {
  id: string;
  title: string;
  description: string;
  type: UnitType;
}

export interface Chapter {
  id: string;
  title: string;
  units: Unit[];
}

export interface Syllabus {
  id: string; // Unique ID for storage
  topic: string;
  chapters: Chapter[];
  createdAt: number;
  progress: number; // 0-100
}

export interface QuizOption {
  id: string;
  text: string;
}

export interface Quiz {
  question: string;
  options: QuizOption[];
  correctOptionId: string;
  explanation: string;
}

export interface Flashcard {
  front: string;
  back: string;
}

export interface WebSource {
  uri: string;
  title: string;
}

export interface LessonContent {
  topic: string;
  summary: string;
  deepDive: string; // Markdown content
  podcastScript: string[]; 
  quiz: Quiz;
  flashcards: Flashcard[]; // Integrated flashcards
  sources?: WebSource[];
  coverImageBase64?: string;
}

export interface ExamContent {
  questions: Quiz[];
}

export type UnitContent = LessonContent | ExamContent;

export enum AppScreen {
  HOME = 'HOME',
  SYLLABUS = 'SYLLABUS',
  LESSON = 'LESSON',
  LIBRARY = 'LIBRARY',
  PROFILE = 'PROFILE',
}

export enum LessonMode {
  READ = 'READ',
  LISTEN = 'LISTEN',
  QUIZ = 'QUIZ',
}

// Storage Interface
export interface SavedCourse {
  syllabus: Syllabus;
  contentMap: Record<string, UnitContent>;
}