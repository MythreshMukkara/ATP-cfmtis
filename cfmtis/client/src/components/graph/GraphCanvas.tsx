import { useGraph } from "../../hooks/useGraph";
import { useGraphStore } from "../../store/graphStore";
import { GraphEdge, GraphNode } from "../../types";
import { Button } from "../ui/Button";

const ZoomIcon = ({ mode }: { mode: "in" | "out" | "reset" }) => (
  <svg viewBox="0 0 20 20" aria-hidden="true" className="h-4 w-4">
    <circle cx="8" cy="8" r="5.5" fill="none" stroke="currentColor" strokeWidth="1.7" />
    <path d="M12.3 12.3 17 17" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.7" />
    {mode !== "reset" && (
      <path d="M5.6 8h4.8" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.7" />
    )}
    {mode === "in" && (
      <path d="M8 5.6v4.8" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.7" />
    )}
    {mode === "reset" && (
      <path d="M5.9 10.8c.9 1 1.8 1.4 3 1.4 1.1 0 2-.4 2.9-1.3" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.5" />
    )}
  </svg>
);

export const GraphCanvas = ({
  nodes: overrideNodes,
  edges: overrideEdges,
  layerStats
}: {
  nodes?: GraphNode[];
  edges?: GraphEdge[];
  layerStats?: Record<number, { accounts: number; enteredAmount: number; leftAmount: number }>;
} = {}) => {
  const storeNodes = useGraphStore((state) => state.nodes);
  const storeEdges = useGraphStore((state) => state.edges);
  const selectNode = useGraphStore((state) => state.selectNode);
  const selectEdge = useGraphStore((state) => state.selectEdge);
  const { ref, zoomIn, zoomOut, resetZoom } = useGraph({
    nodes: overrideNodes ?? storeNodes,
    edges: overrideEdges ?? storeEdges,
    layerStats,
    onSelectNode: selectNode,
    onSelectEdge: selectEdge
  });

  return (
    <div className="relative h-full">
      <div className="absolute right-4 top-4 z-10 flex gap-2">
        <Button className="px-3 py-2 text-[12px]" onClick={zoomOut} type="button" title="Zoom out">
          <ZoomIcon mode="out" />
        </Button>
        <Button className="px-3 py-2 text-[12px]" onClick={zoomIn} type="button" title="Zoom in">
          <ZoomIcon mode="in" />
        </Button>
        <Button className="px-3 py-2 text-[12px]" onClick={resetZoom} type="button" title="Reset zoom">
          <ZoomIcon mode="reset" />
        </Button>
      </div>
      <svg
        ref={ref}
        data-graph-export="true"
        className="h-full min-h-[820px] w-full rounded-[12px] border border-border bg-[#fbfdff]"
      />
    </div>
  );
};
