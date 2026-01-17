export enum ProjectStatus {
  NEW = 'NEW ✨',
  ACTIVE = 'Active ✅',
  EXTENDED = 'Extended ⏳',
  NEGLECTED = 'Neglected ⚠️',
  ABANDONED = 'Abandoned? 🕸️',
  COMPLETED = 'Completed ✔️',
  ARCHIVED = 'Archived 🗄️'
}

export enum RotLevel {
  FRESH = 'Fresh',        // <= 5 days
  NEGLECTED = 'Neglected', // > 5 days
  ABANDONED = 'Abandoned'  // > 10 days
}

export interface Project {
  id: string;
  name: string;
  lastTouched: string; // ISO Date string
  status: ProjectStatus;
  links: string;       // Renamed from log to links
  tags: string;        // New field for Column G
  owner?: string;
}

export interface ProjectAnalysis {
  project: Project;
  daysSinceTouch: number;
  rotLevel: RotLevel;
}

export interface AIInsight {
  summary: string;
  actionItems: string[];
  priorityScore: number;
}

export interface ChatMessage {
  role: 'user' | 'model';
  text: string;
  timestamp: Date;
}