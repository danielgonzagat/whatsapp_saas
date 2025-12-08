// ============================================
// KLOEL DESIGN SYSTEM
// "O usuário nunca 'usa um sistema'. Ele conversa com um cérebro
//  que enxerga o contexto e age sozinho."
// ============================================

// Core Components
export { UniversalComposer } from './UniversalComposer';
export type { UniversalComposerProps, ActionChip, ComposerChip } from './UniversalComposer';

export { ContextCapsule, ContextCapsuleMini } from './ContextCapsule';
export type { ContextCapsuleProps, ContextItem, PageContext } from './ContextCapsule';

export { AgentTimeline, AgentTimelineMini } from './AgentTimeline';
export type { AgentTimelineProps, AgentStep, StepStatus } from './AgentTimeline';

export { SensitiveOperationGate, SensitiveOperationGateInline } from './SensitiveOperationGate';
export type { SensitiveOperationGateProps, SensitiveOperationDetails, SensitiveOperationType } from './SensitiveOperationGate';

// Layout
export { 
  Shell, 
  CenterStage, 
  Surface, 
  ModalSurface, 
  Section, 
  Divider, 
  Flex, 
  Grid 
} from './Layout';
export type { StageSize, StageProps } from './Layout';

// App Shell
export { AppShell } from './AppShell';

// Cards
export { StatCard, ActionCard, InfoCard, EmptyState } from './Cards';

// Primitives
export { Button, IconButton, Chip, Badge, Avatar, Skeleton } from './Primitives';

// Forms
export { Input, SearchInput, Textarea, Select, Checkbox, Toggle } from './Forms';
