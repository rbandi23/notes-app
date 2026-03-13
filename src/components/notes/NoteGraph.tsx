"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Skeleton } from "@/components/ui/skeleton";
import useSWR from "swr";

interface GraphNode {
  id: string;
  title: string;
  size: number;
  tags: string[];
}

interface GraphEdge {
  source: string;
  target: string;
  similarity: number;
}

interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

interface FGNode {
  id?: string | number;
  name?: string;
  val?: number;
  color?: string;
  x?: number;
  y?: number;
}

const COMPONENT_COLORS = [
  "#3b82f6", // blue
  "#10b981", // emerald
  "#8b5cf6", // violet
  "#f59e0b", // amber
  "#ec4899", // pink
  "#06b6d4", // cyan
  "#f97316", // orange
  "#6366f1", // indigo
  "#ef4444", // red
  "#14b8a6", // teal
  "#a855f7", // purple
  "#84cc16", // lime
  "#e879f9", // fuchsia
  "#22d3ee", // sky
  "#fb923c", // light orange
  "#4ade80", // green
  "#f43f5e", // rose
  "#facc15", // yellow
  "#2dd4bf", // aqua
  "#818cf8", // periwinkle
];

function getConnectedComponentColors(
  nodes: GraphNode[],
  edges: GraphEdge[]
): Map<string, string> {
  const colorMap = new Map<string, string>();
  const adjacency = new Map<string, Set<string>>();

  for (const node of nodes) {
    adjacency.set(node.id, new Set());
  }
  for (const edge of edges) {
    adjacency.get(edge.source)?.add(edge.target);
    adjacency.get(edge.target)?.add(edge.source);
  }

  const visited = new Set<string>();
  let componentIndex = 0;

  for (const node of nodes) {
    if (visited.has(node.id)) continue;

    const neighbors = adjacency.get(node.id);
    if (!neighbors || neighbors.size === 0) {
      colorMap.set(node.id, "#94a3b8");
      visited.add(node.id);
      continue;
    }

    const queue = [node.id];
    const component: string[] = [];
    visited.add(node.id);

    while (queue.length > 0) {
      const current = queue.shift()!;
      component.push(current);
      for (const neighbor of adjacency.get(current) || []) {
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          queue.push(neighbor);
        }
      }
    }

    const color = COMPONENT_COLORS[componentIndex % COMPONENT_COLORS.length];
    for (const id of component) {
      colorMap.set(id, color);
    }
    componentIndex++;
  }

  return colorMap;
}

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export function NoteGraph() {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);
  const [ForceGraph, setForceGraph] = useState<
    typeof import("react-force-graph-2d").default | null
  >(null);

  const { data: graphData, isLoading: loading } = useSWR<GraphData>(
    "/api/notes/graph",
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 10000 }
  );

  useEffect(() => {
    import("react-force-graph-2d").then((mod) => {
      setForceGraph(() => mod.default);
    });
  }, []);

  const handleNodeClick = useCallback(
    (node: FGNode) => {
      if (node.id) router.push(`/notes/${node.id}`);
    },
    [router]
  );

  const paintNode = useCallback(
    (node: FGNode, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const label = node.name || "";
      const radius = Math.sqrt(node.val || 4) * 4;
      const x = node.x || 0;
      const y = node.y || 0;

      // Node circle
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, 2 * Math.PI);
      ctx.fillStyle = node.color || "#94a3b8";
      ctx.fill();

      // Title label
      const fontSize = Math.max(11 / globalScale, 2);
      ctx.font = `${fontSize}px sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.fillStyle = "#d4d4d4";
      const maxChars = 20;
      const truncated =
        label.length > maxChars ? label.slice(0, maxChars) + "..." : label;
      ctx.fillText(truncated, x, y + radius + 2);
    },
    []
  );

  const componentColors = useMemo(() => {
    if (!graphData || graphData.nodes.length === 0) return new Map<string, string>();
    return getConnectedComponentColors(graphData.nodes, graphData.edges);
  }, [graphData]);

  const fgData = useMemo(() => {
    if (!graphData) return null;
    return {
      nodes: graphData.nodes.map((n) => ({
        id: n.id,
        name: n.title,
        val: n.size,
        color: componentColors.get(n.id) || "#94a3b8",
      })),
      links: graphData.edges.map((e) => ({
        source: e.source,
        target: e.target,
        value: e.similarity,
      })),
    };
  }, [graphData, componentColors]);

  if (loading || !ForceGraph) {
    return <Skeleton className="h-[500px] w-full rounded-xl" />;
  }

  if (!fgData || fgData.nodes.length === 0) {
    return (
      <div className="flex h-[500px] items-center justify-center text-muted-foreground">
        No notes to visualize. Create some notes first.
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="h-[500px] w-full overflow-hidden rounded-xl border"
    >
      <ForceGraph
        graphData={fgData}
        width={containerRef.current?.clientWidth || 800}
        height={500}
        nodeLabel="name"
        nodeRelSize={4}
        nodeCanvasObject={paintNode}
        nodePointerAreaPaint={(node: FGNode, color: string, ctx: CanvasRenderingContext2D) => {
          const radius = Math.sqrt(node.val || 4) * 4;
          ctx.beginPath();
          ctx.arc(node.x || 0, node.y || 0, radius + 4, 0, 2 * Math.PI);
          ctx.fillStyle = color;
          ctx.fill();
        }}
        linkWidth={(link: { value?: number }) =>
          Math.max((link.value || 0) * 3, 0.5)
        }
        linkColor={() => "rgba(139, 90, 43, 0.6)"}
        onNodeClick={handleNodeClick}
        backgroundColor="transparent"
      />
    </div>
  );
}
