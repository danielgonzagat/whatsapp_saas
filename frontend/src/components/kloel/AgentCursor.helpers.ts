import type { WhatsAppProofEntry } from '@/lib/api';

export interface AgentCursorTarget {
  x: number;
  y: number;
  actionType?: string;
  text?: string;
  timestamp: number;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function easeInOutQuart(t: number): number {
  return t < 0.5 ? 8 * t * t * t * t : 1 - (-2 * t + 2) ** 4 / 2;
}

function normalizeActions(
  action: WhatsAppProofEntry['action'],
): Array<Record<string, unknown> | null | undefined> {
  if (Array.isArray(action)) {
    return action as Array<Record<string, unknown>>;
  }
  if (action) {
    return [action as unknown as Record<string, unknown>];
  }
  return [];
}

function extractCoordinate(
  action: Record<string, unknown> | null | undefined,
): [number | null, number | null] {
  if (!action) {
    return [null, null];
  }
  const rawX = action.x;
  const rawY = action.y;
  const coordinate = action.coordinate;
  const x =
    typeof rawX === 'number'
      ? rawX
      : Array.isArray(coordinate) && typeof coordinate[0] === 'number'
        ? coordinate[0]
        : null;
  const y =
    typeof rawY === 'number'
      ? rawY
      : Array.isArray(coordinate) && typeof coordinate[1] === 'number'
        ? coordinate[1]
        : null;
  return [x, y];
}

export function readProofCoordinates(proofs: WhatsAppProofEntry[]): AgentCursorTarget | null {
  for (const proof of proofs) {
    const actions = normalizeActions(proof.action);
    for (const action of actions) {
      const [x, y] = extractCoordinate(action);
      if (x == null || y == null) {
        continue;
      }
      return {
        x,
        y,
        actionType: typeof action?.type === 'string' ? (action.type as string) : undefined,
        text: typeof action?.text === 'string' ? (action.text as string) : undefined,
        timestamp: Date.parse(proof.createdAt) || Date.now(),
      };
    }
  }
  return null;
}

export interface MovementParams {
  from: { x: number; y: number };
  to: { x: number; y: number };
}

export function computeMovement({ from, to }: MovementParams): {
  distance: number;
  duration: number;
  arcAmplitude: number;
  arcDirection: 1 | -1;
} {
  const distance = Math.hypot(to.x - from.x, to.y - from.y);
  const duration = Math.min(1500, Math.max(500, distance * 1.2));
  const arcAmplitude = Math.min(40, distance * 0.15);
  const arcDirection = to.x > from.x ? -1 : 1;
  return { distance, duration, arcAmplitude, arcDirection };
}

export function isClickAction(actionType: string | undefined): boolean {
  return actionType === 'click' || actionType === 'double_click';
}

export function resolveBubblePlacement(point: { x: number; y: number }): {
  sideRight: boolean;
  style: { left: string; top: string };
} {
  const sideRight = point.x < 220;
  const bubbleTop = Math.max(12, point.y - 54);
  const style = sideRight
    ? { left: `${point.x + 22}px`, top: `${bubbleTop}px` }
    : { left: `${Math.max(12, point.x - 250)}px`, top: `${bubbleTop}px` };
  return { sideRight, style };
}
