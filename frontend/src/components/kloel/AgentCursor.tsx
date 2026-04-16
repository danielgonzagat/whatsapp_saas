'use client';

import type { WhatsAppProofEntry } from '@/lib/api';
import { type RefObject, useEffect, useId, useMemo, useRef, useState } from 'react';

export interface AgentCursorTarget {
  x: number;
  y: number;
  actionType?: string;
  text?: string;
  timestamp: number;
}

interface AgentCursorProps {
  containerRef: RefObject<HTMLDivElement | null>;
  imageRef?: RefObject<HTMLImageElement | null>;
  viewport: { width: number; height: number };
  thought?: string;
  isThinking: boolean;
  takeoverActive: boolean;
  proofs: WhatsAppProofEntry[];
  streamConnected: boolean;
  cursorTarget?: AgentCursorTarget | null;
}

interface RippleState {
  id: string;
  x: number;
  y: number;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function easeInOutQuart(t: number) {
  return t < 0.5 ? 8 * t * t * t * t : 1 - (-2 * t + 2) ** 4 / 2;
}

function readProofCoordinates(proofs: WhatsAppProofEntry[]): AgentCursorTarget | null {
  for (const proof of proofs) {
    const actions = Array.isArray(proof.action) ? proof.action : proof.action ? [proof.action] : [];

    for (const action of actions) {
      const x =
        typeof action?.x === 'number'
          ? action.x
          : Array.isArray(action?.coordinate) && typeof action.coordinate[0] === 'number'
            ? action.coordinate[0]
            : null;
      const y =
        typeof action?.y === 'number'
          ? action.y
          : Array.isArray(action?.coordinate) && typeof action.coordinate[1] === 'number'
            ? action.coordinate[1]
            : null;

      if (x == null || y == null) continue;

      return {
        x,
        y,
        actionType: typeof action?.type === 'string' ? action.type : undefined,
        text: typeof action?.text === 'string' ? action.text : undefined,
        timestamp: Date.parse(proof.createdAt) || Date.now(),
      };
    }
  }

  return null;
}

export function AgentCursor({
  containerRef,
  imageRef,
  viewport,
  thought,
  isThinking,
  takeoverActive,
  proofs,
  streamConnected,
  cursorTarget,
}: AgentCursorProps) {
  const svgFilterId = useId();
  const [displayPoint, setDisplayPoint] = useState({ x: 0, y: 0 });
  const [hasPosition, setHasPosition] = useState(false);
  const [bubbleVisible, setBubbleVisible] = useState(false);
  const [bubbleText, setBubbleText] = useState('');
  const [ripples, setRipples] = useState<RippleState[]>([]);

  const animationFrameRef = useRef<number | null>(null);
  const idleAnimationRef = useRef<number | null>(null);
  const movementTokenRef = useRef(0);
  const hideBubbleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recenterTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const displayPointRef = useRef({ x: 0, y: 0 });
  const lastAppliedTargetRef = useRef<number>(0);

  const resolvedTarget = useMemo(
    () => cursorTarget || readProofCoordinates(proofs),
    [cursorTarget, proofs],
  );

  useEffect(() => {
    displayPointRef.current = displayPoint;
  }, [displayPoint]);

  useEffect(() => {
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (idleAnimationRef.current) {
        cancelAnimationFrame(idleAnimationRef.current);
      }
      if (hideBubbleTimerRef.current) {
        clearTimeout(hideBubbleTimerRef.current);
      }
      if (recenterTimerRef.current) {
        clearTimeout(recenterTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (takeoverActive || !streamConnected) {
      setBubbleVisible(false);
      return;
    }

    const nextThought = String(thought || '').trim();
    if (nextThought) {
      setBubbleText(nextThought);
      setBubbleVisible(true);
      if (hideBubbleTimerRef.current) {
        clearTimeout(hideBubbleTimerRef.current);
      }
      hideBubbleTimerRef.current = setTimeout(() => {
        setBubbleVisible(false);
      }, 5000);
      return;
    }

    if (isThinking) {
      setBubbleVisible(true);
      if (hideBubbleTimerRef.current) {
        clearTimeout(hideBubbleTimerRef.current);
        hideBubbleTimerRef.current = null;
      }
      return;
    }

    if (hideBubbleTimerRef.current) {
      clearTimeout(hideBubbleTimerRef.current);
    }
    hideBubbleTimerRef.current = setTimeout(() => {
      setBubbleVisible(false);
    }, 1200);
  }, [isThinking, streamConnected, takeoverActive, thought]);

  useEffect(() => {
    if (takeoverActive || !streamConnected) {
      return;
    }

    const surface = imageRef?.current || containerRef.current;
    const rect = surface?.getBoundingClientRect();
    if (!rect || !rect.width || !rect.height) {
      return;
    }

    if (hasPosition) {
      return;
    }

    const center = { x: rect.width / 2, y: rect.height / 2 };
    setDisplayPoint(center);
    setHasPosition(true);
  }, [containerRef, hasPosition, imageRef, streamConnected, takeoverActive]);

  useEffect(() => {
    if (takeoverActive || !streamConnected || !resolvedTarget) {
      return;
    }

    if (resolvedTarget.timestamp && resolvedTarget.timestamp <= lastAppliedTargetRef.current) {
      return;
    }
    lastAppliedTargetRef.current = resolvedTarget.timestamp;

    const surface = imageRef?.current || containerRef.current;
    const rect = surface?.getBoundingClientRect();
    const viewportWidth = Math.max(1, Number(viewport?.width || 1440));
    const viewportHeight = Math.max(1, Number(viewport?.height || 900));

    if (!rect || !rect.width || !rect.height) {
      return;
    }

    const targetPoint = {
      x: clamp((resolvedTarget.x / viewportWidth) * rect.width, 0, rect.width),
      y: clamp((resolvedTarget.y / viewportHeight) * rect.height, 0, rect.height),
    };

    if (recenterTimerRef.current) {
      clearTimeout(recenterTimerRef.current);
    }
    recenterTimerRef.current = setTimeout(() => {
      const currentSurface = imageRef?.current || containerRef.current;
      const currentRect = currentSurface?.getBoundingClientRect();
      if (!currentRect?.width || !currentRect?.height) return;
      const center = { x: currentRect.width / 2, y: currentRect.height / 2 };
      lastAppliedTargetRef.current = Date.now();
      setDisplayPoint(center);
    }, 10000);

    const from = hasPosition ? displayPointRef.current : { x: rect.width / 2, y: rect.height / 2 };
    const distance = Math.hypot(targetPoint.x - from.x, targetPoint.y - from.y);
    // Human-like: longer duration, proportional to distance
    const duration = Math.min(1500, Math.max(500, distance * 1.2));
    const startedAt = performance.now();
    const movementToken = movementTokenRef.current + 1;
    movementTokenRef.current = movementToken;

    // Add a slight arc to the movement (like a human hand moves)
    const arcAmplitude = Math.min(40, distance * 0.15);
    const arcDirection = targetPoint.x > from.x ? -1 : 1;

    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }

    const tick = (now: number) => {
      if (movementTokenRef.current !== movementToken) {
        return;
      }

      const rawProgress = clamp((now - startedAt) / duration, 0, 1);
      const eased = easeInOutQuart(rawProgress);
      // Arc offset: sine curve that peaks at 50% progress
      const arcOffset = Math.sin(rawProgress * Math.PI) * arcAmplitude * arcDirection;
      setHasPosition(true);
      setDisplayPoint({
        x: from.x + (targetPoint.x - from.x) * eased + arcOffset * 0.3,
        y: from.y + (targetPoint.y - from.y) * eased - arcOffset,
      });

      if (rawProgress < 1) {
        animationFrameRef.current = requestAnimationFrame(tick);
        return;
      }

      animationFrameRef.current = null;
      if (resolvedTarget.actionType === 'click' || resolvedTarget.actionType === 'double_click') {
        const rippleId = `${movementToken}-${Date.now()}`;
        setRipples((prev) => [...prev, { id: rippleId, ...targetPoint }]);
        setTimeout(() => {
          setRipples((prev) => prev.filter((item) => item.id !== rippleId));
        }, 650);
      }
    };

    animationFrameRef.current = requestAnimationFrame(tick);
  }, [
    containerRef,
    hasPosition,
    imageRef,
    resolvedTarget,
    streamConnected,
    takeoverActive,
    viewport?.height,
    viewport?.width,
  ]);

  useEffect(() => {
    if (!hasPosition || takeoverActive || !streamConnected) {
      return;
    }

    const startedAt = performance.now();
    const origin = displayPointRef.current;

    const tick = (now: number) => {
      const elapsed = now - startedAt;
      const offsetY = Math.sin(elapsed / 480) * 3;
      setDisplayPoint({
        x: origin.x,
        y: origin.y + offsetY,
      });
      idleAnimationRef.current = requestAnimationFrame(tick);
    };

    idleAnimationRef.current = requestAnimationFrame(tick);
    return () => {
      if (idleAnimationRef.current) {
        cancelAnimationFrame(idleAnimationRef.current);
        idleAnimationRef.current = null;
      }
    };
  }, [hasPosition, streamConnected, takeoverActive, resolvedTarget?.timestamp]);

  if (!streamConnected || takeoverActive || !hasPosition) {
    return null;
  }

  const sideRight = displayPoint.x < 220;
  const bubbleTop = Math.max(12, displayPoint.y - 54);
  const bubbleStyle = sideRight
    ? {
        left: `${displayPoint.x + 22}px`,
        top: `${bubbleTop}px`,
      }
    : {
        left: `${Math.max(12, displayPoint.x - 250)}px`,
        top: `${bubbleTop}px`,
      };

  return (
    <div className="pointer-events-none absolute inset-0 z-20 overflow-hidden">
      {ripples.map((ripple) => (
        <span
          key={ripple.id}
          className="absolute rounded-full border-2 border-blue-400/60"
          style={{
            left: ripple.x - 12,
            top: ripple.y - 12,
            width: 24,
            height: 24,
            animation: 'agent-cursor-ripple 600ms ease-out forwards',
          }}
        />
      ))}

      {bubbleVisible ? (
        <div
          className="absolute max-w-[240px] rounded-2xl border border-white/10 bg-[rgba(17,17,17,0.88)] px-3 py-2 text-xs text-[#f0f0f0] shadow-[0_4px_16px_rgba(0,0,0,0.3)] backdrop-blur-md"
          style={{
            ...bubbleStyle,
            willChange: 'left, top, opacity, transform',
            animation: 'agent-bubble-in 300ms ease-out',
          }}
        >
          {bubbleText ? (
            <p className="leading-relaxed">{bubbleText}</p>
          ) : isThinking ? (
            <div className="flex items-center gap-1 py-1">
              {[0, 1, 2].map((dot) => (
                <span
                  key={dot}
                  className="inline-block h-1 w-1 rounded-full bg-[#888]"
                  style={{
                    animation: `agent-thinking-dots 900ms ease-in-out ${dot * 200}ms infinite`,
                  }}
                />
              ))}
            </div>
          ) : null}

          <span
            className="absolute top-[52px] h-3 w-3 rotate-45 border-b border-r border-white/10 bg-[rgba(17,17,17,0.88)]"
            style={sideRight ? { left: 14 } : { right: 14 }}
          />
        </div>
      ) : null}

      <div
        className="absolute"
        style={{
          left: displayPoint.x,
          top: displayPoint.y,
          transform: 'translate(-4px, -2px)',
          filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.3))',
          willChange: 'left, top, transform',
        }}
      >
        <svg width="28" height="34" viewBox="0 0 28 34" fill="none" aria-hidden="true">
          <g filter={`url(#${svgFilterId}-shadow)`}>
            <path
              d="M3 2L3 28L9.5 21.5L15.5 31L19.5 29L13.5 19L22 17L3 2Z"
              fill="#111111"
              stroke="white"
              strokeWidth="1.8"
              strokeLinejoin="round"
            />
          </g>
          <defs>
            <filter
              id={`${svgFilterId}-shadow`}
              x="0"
              y="0"
              width="28"
              height="38"
              filterUnits="userSpaceOnUse"
            >
              <feDropShadow
                dx="0"
                dy="1"
                stdDeviation="1.5"
                floodColor="#000000"
                floodOpacity="0.4"
              />
            </filter>
          </defs>
        </svg>
      </div>

      <style jsx>{`
        @keyframes agent-cursor-ripple {
          0% {
            opacity: 0.8;
            transform: scale(0.3);
          }
          100% {
            opacity: 0;
            transform: scale(2.5);
          }
        }

        @keyframes agent-bubble-in {
          0% {
            opacity: 0;
            transform: translateY(4px) scale(0.92);
          }
          100% {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }

        @keyframes agent-thinking-dots {
          0%,
          100% {
            opacity: 0.3;
          }
          50% {
            opacity: 1;
          }
        }
      `}</style>
    </div>
  );
}
