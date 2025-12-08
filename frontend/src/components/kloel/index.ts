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

// Command Palette (Ctrl/⌘+K)
export { CommandPalette } from './CommandPalette';
export type { CommandPaletteProps, CommandItem, CommandType, CommandRisk, CommandCategory } from './CommandPalette';

// Agent Console (realtime activity monitor)
export { AgentConsole, useAgentConsole } from './AgentConsole';
export type { AgentConsoleProps, AgentActivity, AgentStats, ActivityType, ActivityStatus } from './AgentConsole';

// Stage Components
export { StageHeadline, STAGE_HEADLINES } from './StageHeadline';
export type { StageHeadlineProps } from './StageHeadline';

export { MissionCards, ProofCards } from './MissionCards';
export type { MissionCardsProps, MissionCardData, MissionStatus, ProofCardsProps, ProofCardData } from './MissionCards';

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

// Empty States Library
export { 
  ContextualEmptyState, 
  InlineEmptyState, 
  SkeletonEmptyState,
  EMPTY_STATE_CONFIGS,
} from './EmptyStates';
export type { 
  ContextualEmptyStateProps, 
  EmptyStateConfig, 
  EmptyStateVariant,
} from './EmptyStates';

// Primitives
export { Button, IconButton, Chip, Badge, Avatar, Skeleton } from './Primitives';

// Forms
export { Input, SearchInput, Textarea, Select, Checkbox, Toggle } from './Forms';
