'use client';

import type {
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent,
  WheelEvent as ReactWheelEvent,
} from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { KloelGraphArea, KloelGraphNode } from './KloelGraph.routes';
import type { GraphEdge } from './KloelGraphShell.helpers';
import { GRAPH_FONT, useGraphTheme } from './KloelGraphTheme';

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
const DRAG_THRESHOLD_SQ = 16;

export interface KloelGraphFilterSettings {
  readonly search: string;
  readonly showTags: boolean;
  readonly showAttachments: boolean;
  readonly existingOnly: boolean;
  readonly showOrphans: boolean;
  readonly incomingLinks: boolean;
  readonly outgoingLinks: boolean;
}

export interface KloelGraphGroupSettings {
  readonly id: string;
  readonly query: string;
  readonly color: string;
  readonly enabled: boolean;
}

export interface KloelGraphDisplaySettings {
  readonly arrows: boolean;
  readonly textFade: number;
  readonly nodeSize: number;
  readonly linkThickness: number;
}

export interface KloelGraphForceSettings {
  readonly centerForce: number;
  readonly repelForce: number;
  readonly linkForce: number;
  readonly linkDistance: number;
}

export interface KloelGraphSettings {
  readonly filters: KloelGraphFilterSettings;
  readonly groups: readonly KloelGraphGroupSettings[];
  readonly display: KloelGraphDisplaySettings;
  readonly forces: KloelGraphForceSettings;
}

export function createDefaultKloelGraphSettings(): KloelGraphSettings {
  return {
    filters: {
      search: '',
      showTags: true,
      showAttachments: true,
      existingOnly: false,
      showOrphans: true,
      incomingLinks: true,
      outgoingLinks: true,
    },
    groups: [],
    display: { arrows: false, textFade: 0.55, nodeSize: 1, linkThickness: 1 },
    forces: { centerForce: 0, repelForce: 300, linkForce: 1.2, linkDistance: 50 },
  };
}

const DEFAULT_SETTINGS = createDefaultKloelGraphSettings();

const SUN_OF_AREA: Record<KloelGraphArea, string> = {
  perfil: 'perfil',
  kloel: 'kloel',
  criar: 'criar',
  afiliar: 'afiliar',
  educar: 'educar',
  conectar: 'conectar',
  consultar: 'consultar',
};

const GALAXY_RADIUS: Record<KloelGraphArea, number> = {
  perfil: 240,
  kloel: 220,
  criar: 340,
  afiliar: 260,
  educar: 200,
  conectar: 300,
  consultar: 170,
};

const NODE_BASE_SIZE: Record<string, number> = {
  core: 11,
  sun: 9,
  route: 5,
  entity: 5,
  metric: 4.5,
};

interface LiveNode extends KloelGraphNode {
  x: number;
  y: number;
  vx: number;
  vy: number;
  fixed?: boolean;
  dragging?: boolean;
}

interface GraphSize {
  w: number;
  h: number;
}

interface GraphPoint {
  x: number;
  y: number;
}

export function KloelGraphLiteralCanvas({
  nodes,
  edges,
  activeNodeId,
  focusedArea,
  recenterNonce,
  settings = DEFAULT_SETTINGS,
  onOpenNode,
  onClearSelection,
}: {
  readonly nodes: readonly KloelGraphNode[];
  readonly edges: readonly GraphEdge[];
  readonly activeNodeId?: string | undefined;
  readonly focusedArea: KloelGraphArea;
  readonly recenterNonce: number;
  readonly settings?: KloelGraphSettings;
  readonly onOpenNode: (node: KloelGraphNode) => void;
  readonly onClearSelection: () => void;
}) {
  const { C } = useGraphTheme();
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const nodesRef = useRef<LiveNode[]>([]);
  const targetsRef = useRef(new Map<string, GraphPoint>());
  const alphaRef = useRef(1);
  const focusAnimRef = useRef(0);
  const movedRef = useRef(false);
  const downPosRef = useRef({ x: 0, y: 0 });
  const reheat = useCallback((value = 1) => {
    alphaRef.current = Math.max(alphaRef.current, value);
  }, []);

  const [snapshot, setSnapshot] = useState<LiveNode[]>([]);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [isPanning, setIsPanning] = useState(false);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [size, setSize] = useState<GraphSize>({ w: 1200, h: 700 });
  const panRef = useRef(pan);
  const zoomRef = useRef(zoom);
  const sizeRef = useRef(size);
  const panStartRef = useRef({ x: 0, y: 0, panX: 0, panY: 0 });

  useEffect(() => {
    panRef.current = pan;
  }, [pan]);
  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);
  useEffect(() => {
    sizeRef.current = size;
  }, [size]);

  const { nodes: visibleNodes, edges: visibleEdges } = useMemo(
    () => applyFilters(nodes, edges, settings.filters),
    [edges, nodes, settings.filters],
  );
  const snapshotById = useMemo(() => new Map(snapshot.map((node) => [node.id, node])), [snapshot]);
  const degreeMap = useMemo(() => {
    const counts = new Map<string, number>();
    for (const edge of visibleEdges) {
      counts.set(edge.from, (counts.get(edge.from) || 0) + 1);
      counts.set(edge.to, (counts.get(edge.to) || 0) + 1);
    }
    return counts;
  }, [visibleEdges]);

  const focusSet = useMemo(() => {
    const target = hoveredId || activeNodeId;
    if (!target) {
      return null;
    }
    const result = new Set([target]);
    for (const edge of visibleEdges) {
      if (edge.from === target) {
        result.add(edge.to);
      }
      if (edge.to === target) {
        result.add(edge.from);
      }
    }
    return result;
  }, [activeNodeId, hoveredId, visibleEdges]);

  const forceRender = useCallback(() => {
    setSnapshot(nodesRef.current.map((node) => ({ ...node })));
  }, []);

  useEffect(() => {
    const nextIds = new Set(nodes.map((node) => node.id));
    for (let index = nodesRef.current.length - 1; index >= 0; index -= 1) {
      if (!nextIds.has(nodesRef.current[index].id)) {
        nodesRef.current.splice(index, 1);
      }
    }

    const anchors = computeGalaxyAnchors(nodes);
    const sunIds = new Set(Object.values(SUN_OF_AREA));
    const existingIds = new Set(nodesRef.current.map((node) => node.id));
    const nodeById = new Map(nodes.map((node) => [node.id, node]));
    let added = false;

    for (const node of nodes) {
      if (!sunIds.has(node.id)) {
        continue;
      }
      const anchor = anchors.get(node.id) || { x: 0, y: 0 };
      const existing = nodesRef.current.find((live) => live.id === node.id);
      if (existing) {
        Object.assign(existing, node, { x: anchor.x, y: anchor.y, vx: 0, vy: 0, fixed: true });
      } else {
        nodesRef.current.push({ ...node, x: anchor.x, y: anchor.y, vx: 0, vy: 0, fixed: true });
        added = true;
      }
    }

    const galaxyCount: Partial<Record<KloelGraphArea, number>> = {};
    for (const node of nodes) {
      if (sunIds.has(node.id) || existingIds.has(node.id)) {
        continue;
      }
      const count = (galaxyCount[node.area] || 0) + 1;
      galaxyCount[node.area] = count;
      const parent = node.parentId ? nodesRef.current.find((live) => live.id === node.parentId) : null;
      const sun = anchors.get(SUN_OF_AREA[node.area]) || { x: 0, y: 0 };
      const cx = parent?.x ?? sun.x;
      const cy = parent?.y ?? sun.y;
      const radius = 18 * Math.sqrt(0.5 + count);
      const angle = count * GOLDEN_ANGLE;
      nodesRef.current.push({
        ...node,
        x: cx + Math.cos(angle) * radius,
        y: cy + Math.sin(angle) * radius,
        vx: 0,
        vy: 0,
      });
      added = true;
    }

    for (const live of nodesRef.current) {
      const fresh = nodeById.get(live.id);
      if (fresh) {
        Object.assign(live, fresh);
      }
    }
    targetsRef.current = anchors;
    if (added || existingIds.size === 0) {
      alphaRef.current = 1;
    }
    forceRender();
  }, [nodes, forceRender]);

  useEffect(() => {
    let raf = 0;
    let cancelled = false;
    const visibleIds = new Set(visibleNodes.map((node) => node.id));
    const loop = () => {
      if (cancelled) {
        return;
      }
      const alpha = alphaRef.current;
      const shouldTick = alpha > 0.004 || Boolean(draggingId);
      if (!shouldTick) {
        alphaRef.current = 0;
        raf = 0;
        return;
      }
      const visibleLiveNodes = nodesRef.current.filter((node) => visibleIds.has(node.id));
      physicsTick(
        visibleLiveNodes,
        visibleEdges,
        settings.forces,
        draggingId ? Math.max(alpha, 0.3) : alpha,
        degreeMap,
      );
      alphaRef.current = alpha + (0 - alpha) * 0.0228;
      forceRender();
      if (alphaRef.current > 0.004 || draggingId) {
        raf = requestAnimationFrame(loop);
        return;
      }
      alphaRef.current = 0;
      raf = 0;
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelled = true;
      if (raf) {
        cancelAnimationFrame(raf);
      }
    };
  }, [degreeMap, draggingId, forceRender, settings.forces, visibleEdges, visibleNodes]);

  useEffect(() => {
    alphaRef.current = 0.6;
  }, [
    settings.forces.centerForce,
    settings.forces.repelForce,
    settings.forces.linkForce,
    settings.forces.linkDistance,
  ]);

  useEffect(() => {
    if (!containerRef.current) {
      return;
    }
    const updateSizeFromElement = () => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) {
        return;
      }
      setSize({ w: rect.width || 1200, h: rect.height || 700 });
    };
    if (typeof ResizeObserver === 'undefined') {
      updateSizeFromElement();
      window.addEventListener('resize', updateSizeFromElement);
      return () => window.removeEventListener('resize', updateSizeFromElement);
    }
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      setSize({ w: rect?.width || 1200, h: rect?.height || 700 });
    });
    observer.observe(containerRef.current);
    updateSizeFromElement();
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const step = event.shiftKey ? 40 : 16;
      if (event.key === 'ArrowLeft') {
        setPan((current) => ({ x: current.x + step, y: current.y }));
      }
      if (event.key === 'ArrowRight') {
        setPan((current) => ({ x: current.x - step, y: current.y }));
      }
      if (event.key === 'ArrowUp') {
        setPan((current) => ({ x: current.x, y: current.y + step }));
      }
      if (event.key === 'ArrowDown') {
        setPan((current) => ({ x: current.x, y: current.y - step }));
      }
      if (event.key === '+' || event.key === '=') {
        setZoom((current) => Math.min(3, current + 0.1));
      }
      if (event.key === '-' || event.key === '_') {
        setZoom((current) => Math.max(0.3, current - 0.1));
      }
      if (event.key === '0') {
        setZoom(1);
        setPan({ x: 0, y: 0 });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    let raf = 0;
    let tries = 0;
    let frames = 0;
    const sunId = SUN_OF_AREA[focusedArea];
    const margin = 110;
    const ease = 0.18;
    const animate = () => {
      const live = nodesRef.current.find((node) => node.id === sunId);
      const sun = live ? { x: live.x, y: live.y } : targetsRef.current.get(sunId);
      if (!sun) {
        if (tries < 90) {
          tries += 1;
          raf = requestAnimationFrame(animate);
          focusAnimRef.current = raf;
        }
        return;
      }
      const { w, h } = sizeRef.current;
      const galaxyRadius = GALAXY_RADIUS[focusedArea] || 200;
      const targetZoom = Math.max(0.4, Math.min(1.6, Math.min(w, h) / (2 * (galaxyRadius + margin))));
      const z0 = zoomRef.current;
      const z1 = z0 + (targetZoom - z0) * ease;
      const targetPanX = -sun.x * z1;
      const targetPanY = -sun.y * z1;
      const px1 = panRef.current.x + (targetPanX - panRef.current.x) * ease;
      const py1 = panRef.current.y + (targetPanY - panRef.current.y) * ease;
      const done =
        Math.abs(z1 - targetZoom) < 0.0015 &&
        Math.abs(px1 - targetPanX) < 0.2 &&
        Math.abs(py1 - targetPanY) < 0.2;
      if (done || frames > 240) {
        const finalPan = { x: -sun.x * targetZoom, y: -sun.y * targetZoom };
        zoomRef.current = targetZoom;
        panRef.current = finalPan;
        setZoom(targetZoom);
        setPan(finalPan);
        return;
      }
      frames += 1;
      zoomRef.current = z1;
      panRef.current = { x: px1, y: py1 };
      setZoom(z1);
      setPan({ x: px1, y: py1 });
      raf = requestAnimationFrame(animate);
      focusAnimRef.current = raf;
    };
    cancelAnimationFrame(focusAnimRef.current);
    raf = requestAnimationFrame(animate);
    focusAnimRef.current = raf;
    return () => cancelAnimationFrame(raf);
  }, [focusedArea, recenterNonce, size.h, size.w]);

  const screenToWorld = useCallback(
    (sx: number, sy: number) => {
      const rect = svgRef.current?.getBoundingClientRect();
      if (!rect) {
        return { x: 0, y: 0 };
      }
      const cx = rect.width / 2;
      const cy = rect.height / 2;
      return { x: (sx - rect.left - cx - pan.x) / zoom, y: (sy - rect.top - cy - pan.y) / zoom };
    },
    [pan, zoom],
  );

  const onSvgPointerDown = (event: ReactPointerEvent<SVGSVGElement>) => {
    if ((event.target as HTMLElement | SVGElement).dataset?.nodeId) {
      return;
    }
    cancelAnimationFrame(focusAnimRef.current);
    setIsPanning(true);
    panStartRef.current = { x: event.clientX, y: event.clientY, panX: pan.x, panY: pan.y };
  };

  const onSvgPointerMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (isPanning) {
      const dx = event.clientX - panStartRef.current.x;
      const dy = event.clientY - panStartRef.current.y;
      setPan({ x: panStartRef.current.panX + dx, y: panStartRef.current.panY + dy });
      return;
    }
    if (!draggingId) {
      return;
    }
    const mdx = event.clientX - downPosRef.current.x;
    const mdy = event.clientY - downPosRef.current.y;
    if (mdx * mdx + mdy * mdy > DRAG_THRESHOLD_SQ) {
      movedRef.current = true;
    }
    const point = screenToWorld(event.clientX, event.clientY);
    const node = nodesRef.current.find((live) => live.id === draggingId);
    if (node) {
      node.x = point.x;
      node.y = point.y;
      node.vx = 0;
      node.vy = 0;
      forceRender();
    }
    reheat(0.4);
  };

  const onSvgPointerUp = () => {
    setIsPanning(false);
    if (draggingId) {
      const node = nodesRef.current.find((live) => live.id === draggingId);
      if (node) {
        node.dragging = false;
      }
      reheat(0.5);
    }
    setDraggingId(null);
  };

  const onNodePointerDown = (id: string, event: ReactPointerEvent<SVGGElement>) => {
    event.stopPropagation();
    movedRef.current = false;
    downPosRef.current = { x: event.clientX, y: event.clientY };
    setDraggingId(id);
    const node = nodesRef.current.find((live) => live.id === id);
    if (node) {
      node.dragging = true;
      node.vx = 0;
      node.vy = 0;
    }
    reheat(0.4);
  };

  const onNodePointerUp = (node: KloelGraphNode, event: ReactPointerEvent<SVGGElement>) => {
    event.stopPropagation();
    const mdx = event.clientX - downPosRef.current.x;
    const mdy = event.clientY - downPosRef.current.y;
    if (mdx * mdx + mdy * mdy > DRAG_THRESHOLD_SQ) {
      movedRef.current = true;
    }
    const live = nodesRef.current.find((candidate) => candidate.id === node.id);
    if (live) {
      live.dragging = false;
    }
    setDraggingId(null);
    reheat(0.5);
    if (movedRef.current) {
      movedRef.current = false;
      return;
    }
    onOpenNode(node);
  };

  const onNodeKeyDown = (node: KloelGraphNode, event: ReactKeyboardEvent<SVGGElement>) => {
    if (event.key !== 'Enter' && event.key !== ' ') {
      return;
    }
    event.preventDefault();
    onOpenNode(node);
  };

  const onWheel = (event: ReactWheelEvent<SVGSVGElement>) => {
    event.preventDefault();
    cancelAnimationFrame(focusAnimRef.current);
    const delta = -event.deltaY * 0.0015;
    setZoom((current) => Math.max(0.3, Math.min(3, current + delta)));
  };

  const cx = size.w / 2;
  const cy = size.h / 2;
  const labelOpacityFor = (tier: number) => {
    const base = [0.34, 0.72, 1.15][tier] - settings.display.textFade * 0.35;
    return Math.max(0, Math.min(1, (zoom - base) * 3));
  };

  return (
    <div
      ref={containerRef}
      data-testid="kloel-graph-canvas"
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        background: C.void,
        overflow: 'hidden',
        cursor: isPanning ? 'grabbing' : draggingId ? 'grabbing' : 'default',
      }}
    >
      <svg
        ref={svgRef}
        width={size.w}
        height={size.h}
        style={{ display: 'block', userSelect: 'none', position: 'relative', zIndex: 2 }}
        onPointerDown={onSvgPointerDown}
        onPointerMove={onSvgPointerMove}
        onPointerUp={onSvgPointerUp}
        onPointerLeave={onSvgPointerUp}
        onWheel={onWheel}
        onClick={(event) => {
          if (!(event.target as HTMLElement | SVGElement).dataset?.nodeId) {
            onClearSelection();
          }
        }}
      >
        <defs>
          <marker id="kloel-graph-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
            <path d="M 0 0 L 10 5 L 0 10 z" fill={C.ember} />
          </marker>
        </defs>
        <g transform={`translate(${cx + pan.x}, ${cy + pan.y}) scale(${zoom})`}>
          {visibleEdges.map((edge, index) => {
            const a = snapshotById.get(edge.from);
            const b = snapshotById.get(edge.to);
            if (!a || !b) {
              return null;
            }
            const highlighted = focusSet?.has(edge.from) && focusSet.has(edge.to);
            const dimmed = focusSet && !highlighted;
            const useArrows = settings.display.arrows && edge.directed !== false;
            const aRadius = nodeRadius(a, degreeMap, settings.display.nodeSize);
            const bRadius = nodeRadius(b, degreeMap, settings.display.nodeSize);
            let x1 = a.x;
            let y1 = a.y;
            let x2 = b.x;
            let y2 = b.y;
            if (useArrows) {
              const dx = b.x - a.x;
              const dy = b.y - a.y;
              const dist = Math.sqrt(dx * dx + dy * dy) || 1;
              x1 = a.x + (dx / dist) * aRadius;
              y1 = a.y + (dy / dist) * aRadius;
              x2 = b.x - (dx / dist) * (bRadius + 6);
              y2 = b.y - (dy / dist) * (bRadius + 6);
            }
            return (
              <line
                key={`${edge.from}-${edge.to}-${index}`}
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke={highlighted ? C.ember : C.hi}
                strokeWidth={((highlighted ? 1.2 : 0.55) * settings.display.linkThickness) / zoom}
                opacity={highlighted ? 0.9 : dimmed ? 0.04 : 0.3}
                strokeLinecap="round"
                markerEnd={useArrows && highlighted ? 'url(#kloel-graph-arrow)' : undefined}
                style={{ transition: 'opacity .28s ease, stroke .28s ease, stroke-width .28s ease' }}
              />
            );
          })}

          {visibleNodes.map((node) => {
            const live = snapshotById.get(node.id);
            if (!live) {
              return null;
            }
            const hovered = hoveredId === node.id;
            const selected = activeNodeId === node.id;
            const inFocus = focusSet?.has(node.id);
            const dimmed = focusSet && !inFocus;
            const radius = nodeRadius(node, degreeMap, settings.display.nodeSize);
            const fill = colorForNode(node, settings.groups, C, focusedArea, focusSet);
            return (
              <g
                key={node.id}
                role="button"
                tabIndex={0}
                aria-label={`Abrir ${node.label}`}
                transform={`translate(${live.x}, ${live.y})`}
                onPointerDown={(event) => onNodePointerDown(node.id, event)}
                onPointerUp={(event) => onNodePointerUp(node, event)}
                onPointerEnter={() => setHoveredId(node.id)}
                onPointerLeave={() => setHoveredId(null)}
                onKeyDown={(event) => onNodeKeyDown(node, event)}
                style={{
                  cursor: draggingId === node.id ? 'grabbing' : 'grab',
                  opacity: dimmed ? 0.13 : 1,
                  outline: 'none',
                  transition: 'opacity .28s ease',
                }}
              >
                <circle
                  cx="0"
                  cy="0"
                  r={radius}
                  fill={fill}
                  stroke={hovered || selected ? C.ember : 'none'}
                  strokeWidth={hovered || selected ? 2 / zoom : 0}
                  data-node-id={node.id}
                  style={{ transition: 'fill .28s ease, stroke .15s ease' }}
                />
              </g>
            );
          })}

          {visibleNodes.map((node) => {
            const live = snapshotById.get(node.id);
            if (!live || !node.label) {
              return null;
            }
            const hovered = hoveredId === node.id;
            const selected = activeNodeId === node.id;
            const inFocus = focusSet?.has(node.id);
            const dimmed = focusSet && !inFocus;
            const mass = node.type === 'sun' || node.type === 'core';
            const principal = node.parentId === SUN_OF_AREA[focusedArea];
            const tier = mass ? 0 : principal ? 1 : 2;
            let opacity = labelOpacityFor(tier);
            if (hovered || selected) {
              opacity = 1;
            } else if (inFocus) {
              opacity = Math.max(opacity, 0.9);
            } else if (dimmed) {
              opacity *= 0.12;
            }
            if (opacity < 0.02) {
              return null;
            }
            const radius = nodeRadius(node, degreeMap, settings.display.nodeSize);
            const color = hovered || selected || inFocus ? C.silver : tier <= 1 ? C.text : C.muted;
            return (
              <text
                key={`label-${node.id}`}
                x={live.x}
                y={live.y + radius + 11 / zoom}
                textAnchor="middle"
                fontFamily={GRAPH_FONT}
                fontSize={(mass ? 12 : principal ? 11 : 9.5) / zoom}
                fontWeight={mass ? 600 : principal ? 500 : 400}
                fill={color}
                opacity={opacity}
                style={{ pointerEvents: 'none', transition: 'opacity .28s ease, fill .15s ease' }}
              >
                {node.label}
              </text>
            );
          })}
        </g>
      </svg>
    </div>
  );
}

function computeGalaxyAnchors(nodes: readonly KloelGraphNode[]) {
  const ids = new Set(nodes.map((node) => node.id));
  const galaxies = Object.entries(SUN_OF_AREA)
    .filter(([, sunId]) => ids.has(sunId))
    .map(([area, sunId]) => ({ sunId, r: GALAXY_RADIUS[area as KloelGraphArea] || 120 }));
  const result = new Map<string, GraphPoint>();
  if (!galaxies.length) {
    return result;
  }
  if (galaxies.length === 1) {
    result.set(galaxies[0].sunId, { x: 0, y: 0 });
    return result;
  }
  const margin = 70;
  const effective = galaxies.map((galaxy) => galaxy.r + margin);
  const maxRadius = Math.max(...effective);
  let orbit = maxRadius * 1.15 + 90;
  for (let pass = 0; pass < 90; pass += 1) {
    let sum = 0;
    for (const radius of effective) {
      sum += 2 * Math.asin(Math.min(0.999, radius / orbit));
    }
    if (sum <= Math.PI * 2 * 0.92) {
      break;
    }
    orbit *= 1.04;
  }
  const widths = effective.map((radius) => 2 * Math.asin(Math.min(0.999, radius / orbit)));
  const totalWidth = widths.reduce((a, b) => a + b, 0);
  const gap = (Math.PI * 2 - totalWidth) / galaxies.length;
  let angle = -Math.PI / 2;
  for (let index = 0; index < galaxies.length; index += 1) {
    const center = angle + widths[index] / 2;
    result.set(galaxies[index].sunId, { x: Math.cos(center) * orbit, y: Math.sin(center) * orbit });
    angle += widths[index] + gap;
  }
  return result;
}

function nodeRadius(node: KloelGraphNode, degreeMap: Map<string, number>, nodeSize = 1) {
  const degree = degreeMap.get(node.id) || 1;
  return ((NODE_BASE_SIZE[node.type] || 4) + Math.sqrt(degree) * 0.8) * nodeSize;
}

function matchQuery(node: KloelGraphNode, query: string) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return false;
  }
  if (normalized.startsWith('type:')) {
    return node.type === normalized.slice(5);
  }
  if (normalized.startsWith('area:')) {
    return node.area === normalized.slice(5);
  }
  return [node.label, node.subtitle, node.overlayLabel, node.id]
    .filter(Boolean)
    .some((value) => String(value).toLowerCase().includes(normalized));
}

function applyFilters(
  nodes: readonly KloelGraphNode[],
  edges: readonly GraphEdge[],
  filters: KloelGraphFilterSettings,
) {
  const visible = new Set(nodes.map((node) => node.id));
  if (!filters.showAttachments) {
    for (const node of nodes) {
      if (node.type === 'entity' && node.parentId && !Object.values(SUN_OF_AREA).includes(node.parentId)) {
        visible.delete(node.id);
      }
    }
  }
  if (filters.existingOnly) {
    for (const node of nodes) {
      if (node.id.includes('placeholder') || node.id.includes('legacy')) {
        visible.delete(node.id);
      }
    }
  }
  if (filters.search.trim()) {
    const matching = new Set<string>();
    for (const node of nodes) {
      if (matchQuery(node, filters.search)) {
        matching.add(node.id);
      }
    }
    for (const node of nodes) {
      if (!matching.has(node.id) && node.type !== 'sun') {
        visible.delete(node.id);
      }
    }
  }
  let visibleEdges = edges.filter((edge) => visible.has(edge.from) && visible.has(edge.to));
  if (!filters.incomingLinks && !filters.outgoingLinks) {
    visibleEdges = [];
  }
  if (!filters.showOrphans) {
    const connected = new Set<string>();
    for (const edge of visibleEdges) {
      connected.add(edge.from);
      connected.add(edge.to);
    }
    for (const node of nodes) {
      if (!connected.has(node.id) && node.type !== 'sun') {
        visible.delete(node.id);
      }
    }
    visibleEdges = visibleEdges.filter((edge) => visible.has(edge.from) && visible.has(edge.to));
  }
  return { nodes: nodes.filter((node) => visible.has(node.id)), edges: visibleEdges };
}

function colorForNode(
  node: KloelGraphNode,
  groups: readonly KloelGraphGroupSettings[],
  C: ReturnType<typeof useGraphTheme>['C'],
  focusedArea: KloelGraphArea,
  focusSet: Set<string> | null,
) {
  for (const group of groups) {
    if (group.enabled && matchQuery(node, group.query)) {
      return group.color;
    }
  }
  if (node.id === SUN_OF_AREA[focusedArea]) {
    return C.silver;
  }
  if (focusSet) {
    return focusSet.has(node.id) ? C.ember : C.dim;
  }
  if (node.parentId === SUN_OF_AREA[focusedArea]) {
    return C.text;
  }
  return C.dim;
}

function physicsTick(
  nodes: LiveNode[],
  edges: readonly GraphEdge[],
  forces: KloelGraphForceSettings,
  alpha: number,
  degreeMap: Map<string, number>,
) {
  const idMap = new Map(nodes.map((node) => [node.id, node]));
  const degree = (id: string) => degreeMap.get(id) || 1;
  for (let i = 0; i < nodes.length; i += 1) {
    const a = nodes[i];
    if (a.fixed || a.dragging) {
      continue;
    }
    for (let j = 0; j < nodes.length; j += 1) {
      if (i === j) {
        continue;
      }
      const b = nodes[j];
      const dx = a.x - b.x;
      const dy = a.y - b.y;
      const d2 = Math.max(1, dx * dx + dy * dy);
      const f = (forces.repelForce / d2) * alpha;
      a.vx += dx * f;
      a.vy += dy * f;
    }
  }

  for (const edge of edges) {
    const a = idMap.get(edge.from);
    const b = idMap.get(edge.to);
    if (!a || !b) {
      continue;
    }
    const da = degree(edge.from);
    const db = degree(edge.to);
    const strength = forces.linkForce * (1 / Math.min(da, db));
    const bias = da / (da + db);
    let dx = b.x + b.vx - (a.x + a.vx);
    let dy = b.y + b.vy - (a.y + a.vy);
    const distance = Math.sqrt(dx * dx + dy * dy) || 1;
    const lineForce = ((distance - forces.linkDistance) / distance) * alpha * strength;
    dx *= lineForce;
    dy *= lineForce;
    if (!b.fixed && !b.dragging) {
      b.vx -= dx * bias;
      b.vy -= dy * bias;
    }
    if (!a.fixed && !a.dragging) {
      a.vx += dx * (1 - bias);
      a.vy += dy * (1 - bias);
    }
  }

  if (forces.centerForce) {
    for (const node of nodes) {
      if (node.fixed || node.dragging) {
        continue;
      }
      node.vx += -node.x * forces.centerForce * alpha;
      node.vy += -node.y * forces.centerForce * alpha;
    }
  }

  for (const node of nodes) {
    if (node.fixed || node.dragging) {
      continue;
    }
    node.vx *= 0.6;
    node.vy *= 0.6;
    node.x += node.vx;
    node.y += node.vy;
  }

  for (let pass = 0; pass < 2; pass += 1) {
    for (let i = 0; i < nodes.length; i += 1) {
      const a = nodes[i];
      const ra = nodeRadius(a, degreeMap);
      for (let j = i + 1; j < nodes.length; j += 1) {
        const b = nodes[j];
        const rb = nodeRadius(b, degreeMap);
        const minDistance = ra + rb + 8;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const distance = Math.sqrt(dx * dx + dy * dy) || 0.01;
        if (distance >= minDistance) {
          continue;
        }
        const push = (minDistance - distance) / 2;
        const ux = dx / distance;
        const uy = dy / distance;
        const moveA = !a.fixed && !a.dragging;
        const moveB = !b.fixed && !b.dragging;
        if (moveA && moveB) {
          a.x -= ux * push;
          a.y -= uy * push;
          b.x += ux * push;
          b.y += uy * push;
        } else if (moveA) {
          a.x -= ux * push * 2;
          a.y -= uy * push * 2;
        } else if (moveB) {
          b.x += ux * push * 2;
          b.y += uy * push * 2;
        }
      }
    }
  }
}
