export type CapabilityCategory = 'impulsione' | 'recupere' | 'fale' | 'gerencie';
export type CapabilityRole = 'produtor' | 'afiliado';
export type CapabilityStatus = 'active' | 'partial' | 'planned';

export interface FrontendCapability {
  icon: string;
  title: string;
  desc: string;
  category: CapabilityCategory;
  roles: CapabilityRole[];
  status: CapabilityStatus;
  route?: string;
  badge?: string;
  roadmapNote?: string;
  roadmapActions?: Array<{ label: string; href: string; hint: string }>;
}
