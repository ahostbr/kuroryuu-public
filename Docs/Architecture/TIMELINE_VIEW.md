# Timeline View

The Timeline View is a bake-off visualization system for Claude Teams that renders task progress across four interchangeable renderer styles. It lives in the Claude Teams > Timeline tab and supports both live team monitoring and archived session replay.

**Location:** `apps/desktop/src/renderer/components/claude-teams/timeline/`

---

## Architecture & Data Flow

### System Overview

The Timeline View is a **bake-off** system: four independent renderers compete behind a shared interface, letting users cycle through visualization styles at runtime without reloading data. The system is organized across **10 files** in `apps/desktop/src/renderer/components/claude-teams/timeline/`:

| File | Role |
|------|------|
| `timeline-types.ts` | Shared type definitions (styles, color modes, data model, renderer contract) |
| `timeline-utils.ts` | Data normalization, color resolution, adaptive layout, path math, formatting |
| `TimelineView.tsx` | Orchestrator -- reads store, normalizes data, dispatches to active renderer |
| `TimelineToolbar.tsx` | Two cycle buttons (style + color mode) wired to store actions |
| `TimelineTaskCard.tsx` | Shared expandable task card (used by all 4 renderers) |
| `TimelineSVG.tsx` | Renderer: vertical spine with branch lines (pure SVG) |
| `TimelineReactFlow.tsx` | Renderer: horizontal swimlane (ReactFlow nodes/edges) |
| `TimelineECharts.tsx` | Renderer: scatter dot chart (ECharts) |
| `TimelineCanvas.tsx` | Renderer: rainbow arc with bezier-positioned nodes (HTML5 Canvas) |
| `index.ts` | Barrel exports for all public types, components, and utilities |

The **bake-off concept** means all four renderers coexist simultaneously in the bundle. The user cycles through them with a single toolbar button. Each renderer receives identical `TimelineRendererProps` and is expected to produce a self-contained visualization.

---

### Data Flow Pipeline

```
TeamSnapshot ──> normalizeToTimeline() ──> TimelineData ──> Active Renderer
     |                   |                       |                |
     |                   |                       |                v
  File Watcher      timeline-utils.ts      TimelineView.tsx   TimelineSVG
  or Archive                                (orchestrator)    TimelineReactFlow
  Replay                                                      TimelineECharts
                                                               TimelineCanvas
```

**Step 1: TeamSnapshot acquisition**

The `TeamSnapshot` object arrives from one of two sources:
- **Live teams:** `ClaudeTeams.tsx` passes the currently selected team's snapshot as a prop.
- **Archived sessions:** `ArchiveReplayPanel.tsx` converts archive data via `archiveToSnapshot()` and passes it with `readOnly={true}`.

**Step 2: Normalization (`normalizeToTimeline`)**

The `TimelineView` component calls `normalizeToTimeline(team)` inside a `useMemo` keyed on the team reference. This function (from `timeline-utils.ts`) transforms the raw snapshot into a renderer-ready `TimelineData` object:

```typescript
// timeline-utils.ts:31
export function normalizeToTimeline(team: TeamSnapshot): TimelineData {
  const tasks = team.tasks.filter((t) => t.status !== 'deleted');
  const members = team.config.members;
  const baseTime = team.config.createdAt;

  const nodes: TimelineNode[] = tasks.map((task) => {
    const numId = parseInt(task.id, 10) || 0;
    const timestamp = baseTime + numId * 1000;
    // ...
  });

  nodes.sort((a, b) => a.timestamp - b.timestamp);
}
```

Key design decision: `TeamTask` has **no timestamp field**, so ordering is synthesized from the numeric task ID multiplied by 1000ms and added to the team's `createdAt` timestamp. This preserves creation order while spacing tasks approximately 1 second apart on the timeline axis.

**Step 3: Renderer dispatch**

`TimelineView` reads `timelineStyle` from the Zustand store and dispatches to the matching renderer via a switch statement:

```typescript
// TimelineView.tsx:70-83
const renderTimeline = () => {
  switch (timelineStyle) {
    case 'svg-spine':     return <TimelineSVG {...rendererProps} />;
    case 'reactflow-swim': return <TimelineReactFlow {...rendererProps} />;
    case 'echarts-dots':  return <TimelineECharts {...rendererProps} />;
    case 'canvas-arc':    return <TimelineCanvas {...rendererProps} />;
    default:              return <TimelineSVG {...rendererProps} />;
  }
};
```

All renderers receive the same `TimelineRendererProps` contract, ensuring they are fully interchangeable.

---

### Type System

The type system is defined in `timeline-types.ts` and establishes five key interfaces:

**`TimelineStyle`** -- Union of the four renderer identifiers:
```typescript
type TimelineStyle = 'svg-spine' | 'reactflow-swim' | 'echarts-dots' | 'canvas-arc';
```

**`TimelineColorMode`** -- Union of the four coloring strategies:
```typescript
type TimelineColorMode = 'status' | 'agent' | 'priority' | 'rainbow';
```

**`TimelineNode`** -- The normalized representation of a single task:
```typescript
interface TimelineNode {
  id: string;              // Prefixed: "tl-{taskId}"
  taskId: string;          // Raw task ID for display
  subject: string;
  description: string;
  status: TeamTaskStatus;  // pending | in_progress | completed | deleted
  owner: string | null;
  agent: TeamMember | null;
  blocks: string[];
  blockedBy: string[];
  timestamp: number;       // Epoch ms -- sort key
  completedAt: number | null;
  duration: number | null; // ms elapsed
  metadata: Record<string, unknown>;
}
```

**`TimelineData`** -- The complete dataset passed to renderers:
```typescript
interface TimelineData {
  teamName: string;
  nodes: TimelineNode[];   // Sorted chronologically
  agents: TeamMember[];
  timeRange: { start: number; end: number };
  stats: { total: number; pending: number; inProgress: number; completed: number };
}
```

**`TimelineRendererProps`** -- The contract every renderer must accept:
```typescript
interface TimelineRendererProps {
  data: TimelineData;
  colorMode: TimelineColorMode;
  theme: string;
  onNodeClick?: (nodeId: string) => void;
  expandedNodeId: string | null;
  className?: string;
}
```

**`TimelineLayout`** -- Adaptive spacing parameters:
```typescript
interface TimelineLayout {
  spacing: number;
  nodeSize: number;
  fontSize: number;
  showLabels: boolean;
  compactMode: boolean;
}
```

---

### Color Resolution (4 Modes)

Color is resolved per-node by `resolveNodeColor()` in `timeline-utils.ts`:

| Mode | Strategy | Palette |
|------|----------|---------|
| `status` | Maps `node.status` to a fixed color | pending=#3b82f6, in_progress=#f59e0b, completed=#22c55e, deleted=#6b7280 |
| `agent` | Distributes hue evenly across agent list | `hsl(agentIndex * 360 / agentCount, 70%, 55%)` -- unassigned = gray |
| `priority` | Reads `node.metadata.priority` | critical=#ef4444, high=#f97316, medium=#f59e0b, low=#3b82f6 |
| `rainbow` | Distributes hue across all nodes | `hsl(index / (total-1) * 360, 80%, 55%)` |

Theme mapping: `mapToFlowTheme()` converts global theme names to flow palettes. `isDramaticTheme()` returns true for kuroryuu, matrix, retro, neo, grunge.

---

### Adaptive Layout

`computeLayout()` returns layout parameters scaled to task count:

| Node Count | Spacing | Node Size | Labels | Compact |
|------------|---------|-----------|--------|---------|
| 1-5 | 200px | 16px | Yes | No |
| 6-15 | 120px | 12px | Yes | No |
| 16-50 | 60px | 8px | No | Yes |
| 51+ | 30px | 5px | No | Yes |

Path utilities:
- `verticalSpinePath()` -- SVG `M...L` path for SVG Spine
- `rainbowArcPoints()` -- Quadratic bezier control points for Canvas Arc
- `quadraticBezierPoint()` -- Evaluate position along bezier at parameter t

---

### Store Integration

Timeline state in `team-flow-store.ts`:

```typescript
timelineStyle: TimelineStyle;        // default: 'svg-spine'
timelineColorMode: TimelineColorMode; // default: 'status'
```

| Action | Behavior |
|--------|----------|
| `cycleTimelineStyle()` | Next renderer in cycle (wraps) |
| `cycleTimelineColorMode()` | Next color mode in cycle (wraps) |
| `setTimelineStyle(style)` | Direct setter |
| `setTimelineColorMode(mode)` | Direct setter |

---

### Integration Points

**ClaudeTeams.tsx (live teams):** When `activeView === 'timeline'`, renders `<TimelineView team={selectedTeam} />` instead of `<TeamFlowPanel />`.

**ArchiveReplayPanel.tsx (archived sessions):** When `viewMode === 'timeline'`, renders `<TimelineView team={archiveToSnapshot(archive)} readOnly />`.

---

## Renderer Reference

The Timeline View ships with four interchangeable renderers plus a shared task card component. Each renderer implements the same `TimelineRendererProps` interface.

---

### TimelineSVG -- "Vertical Spine"

**Technology:** SVG + Framer Motion

**Layout:** Central vertical spine line, tasks alternate left/right with horizontal branch lines. Each task is a `TimelineTaskCard` in an SVG `<foreignObject>`. Marker circles sit on the spine.

| Constant | Value | Purpose |
|---|---|---|
| `VIEW_BOX_WIDTH` | 800 | Fixed SVG viewBox width |
| `PADDING` | 60 | Top/bottom padding |
| `BRANCH_LENGTH` | 40 | Horizontal branch length |
| `CARD_WIDTH` | 240 | Collapsed card width (320 expanded) |

**Animation:**
- Default: Spine draws 0.8s easeInOut, cards stagger 0.1s with tween
- Dramatic: Spine 1.5s with glow filter, spring cards (stiffness=200, damping=15), pulsing markers

**Notable:** Uses SVG `<foreignObject>` for full HTML/CSS card rendering inside SVG.

---

### TimelineReactFlow -- "Swimlane Flow"

**Technology:** ReactFlow (`@xyflow/react`)

**Layout:** Horizontal swimlanes. Time flows left-to-right, agents stacked vertically. Three custom node types:
1. `swimlane-band` -- Background stripe per lane
2. `swimlane-label` -- Agent name + model badge
3. `timeline-task` -- Task card with ReactFlow handles

| Constant | Value | Purpose |
|---|---|---|
| `LANE_HEIGHT` | 120 | Height per agent lane |
| `LANE_LABEL_WIDTH` | 160 | Label column width |
| `X_PADDING` | 180 | Left offset for tasks |
| `NODE_WIDTH` | 220 | Task card width |

**Notable:** Dependency edges styled as dashed orange (#f97316). MiniMap + Controls included. fitView with 0.15 padding.

---

### TimelineECharts -- "Horizontal Dots"

**Technology:** ECharts via `echarts-for-react`

**Layout:** Category X-axis, scatter dots alternating above/below (Y=+1.2/-1.2) in zigzag. Connector line at Y=0, dashed drop lines.

| Constant | Value | Purpose |
|---|---|---|
| `ALTERNATE_Y_UPPER/LOWER` | 1.2/-1.2 | Dot positions |
| `MIN_SYMBOL_SIZE` | 18 | Minimum dot size |
| `GLOW_BLUR` | 12 | Shadow blur radius |

**Animation:** Default 500ms cubicOut, dramatic 1000ms bounceOut. 40/80ms stagger.

**Notable:** Rich HTML tooltips with XSS escaping. DataZoom slider appears at >8 nodes.

---

### TimelineCanvas -- "Rainbow Arc"

**Technology:** HTML5 Canvas 2D + requestAnimationFrame

**Layout:** Quadratic bezier arc spanning full width. Markers at evenly-spaced t-values along curve. Rainbow HSL gradient per segment.

| Constant | Value | Purpose |
|---|---|---|
| `ARC_SEGMENTS` | 120 | Curve approximation segments |
| `ANIMATION_DURATION_MS` | 1800 | Draw animation (dramatic) |
| `HIT_RADIUS_EXTRA` | 4 | Click hit detection buffer |

**Animation:** Default renders immediately. Dramatic: progressive draw with cubic ease-out, leading glow dot, two-pass rendering (glow + main).

**Notable:** DPR-aware rendering. Custom distance-squared hit detection. ResizeObserver. Expanded card as positioned HTML overlay.

---

### TimelineTaskCard (Shared)

**Technology:** React + Framer Motion + Lucide icons

Used by all renderers for consistent task display.

**Collapsed:** Task ID badge + subject + status icon + owner + duration
**Expanded:** + status label, model badge, created time, description (3-line clamp), blocks/blockedBy

**Animation:** Scale 0.95->1.0 entrance, AnimatePresence height transition for expand/collapse. `layout` prop for smooth dimension changes.

---

## User Guide

### Accessing the Timeline

1. Open **Claude Teams** from the sidebar
2. Select an active team
3. Click the **Timeline** tab (clock icon) in the view switcher

### Toolbar Controls

| Button | Cycles Through |
|--------|---------------|
| Style (rotate icon) | SVG Spine -> Swimlane -> Dot Chart -> Rainbow Arc |
| Color (palette icon) | Status -> Agent -> Priority -> Rainbow |

Both persist across view switches.

### Color Modes

| Mode | Meaning |
|------|---------|
| **Status** | Blue=pending, Amber=in_progress, Green=completed, Gray=deleted |
| **Agent** | Unique hue per teammate (HSL rotation). Gray=unassigned |
| **Priority** | Red=critical, Orange=high, Amber=medium, Blue=low |
| **Rainbow** | Smooth hue gradient from first to last task |

### Task Interaction

- **Click** a task card to expand details (status, model, time, description, dependencies)
- **Click again** to collapse
- Only one card expanded at a time
- **Swimlane:** Pan (drag) + Zoom (scroll) via ReactFlow
- **Dot Chart:** Rich HTML tooltips on hover
- **Read-only mode:** Expansion disabled in archive replay

### Theme-Dependent Animations

**Dramatic themes** (Kuroryuu, Matrix, Retro, Neo, Grunge): Glow effects, spring animations, pulsing markers, progressive draw, longer durations.

**Standard themes:** Subtle fade-in, quick transitions.

### Adaptive Density

| Tasks | Layout |
|-------|--------|
| 1-5 | Spacious, large nodes, labels shown |
| 6-15 | Medium density, labels shown |
| 16-50 | Compact, no labels |
| 51+ | Ultra-compact, dots only |

### Archive Replay

Timeline renderers work in `ArchiveReplayPanel` for archived sessions. Style/color buttons still work, but task expansion is disabled (`readOnly`).

### Tips

- **Agent color mode** to spot workload imbalances
- **Priority mode** for triage
- **Swimlane** or **Dot Chart** scale better at 50+ tasks
- **Rainbow** makes great screenshots for demos
