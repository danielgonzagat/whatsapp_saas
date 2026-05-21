export interface Lesson {
  id: string;
  name: string;
  description?: string;
  videoUrl?: string;
  position: number;
}

export interface Module {
  id: string;
  name: string;
  description?: string;
  position: number;
  lessons: Lesson[];
}

export interface MemberArea {
  id: string;
  name: string;
  description?: string;
  logoUrl?: string;
  primaryColor?: string;
  modules: Module[];
}
