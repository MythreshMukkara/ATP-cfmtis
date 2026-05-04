import { useEffect, useRef } from "react";
import * as d3 from "d3";
import { GraphEdge, GraphNode } from "../types";

type UseGraphOptions = {
  nodes: GraphNode[];
  edges: GraphEdge[];
  layerStats?: Record<number, { accounts: number; enteredAmount: number; leftAmount: number }>;
  onSelectNode: (node: GraphNode) => void;
  onSelectEdge: (edge: GraphEdge) => void;
};

const nodeColor = (node: GraphNode) => {
  if (node.nodeType === "Victim") return "#58b7e8";
  if (node.isFrozen || node.nodeType === "Frozen") return "#8b99a7";
  if (node.riskLevel === "CRITICAL") return "#cf4b4b";
  if (node.riskLevel === "HIGH") return "#db8d4d";
  if (node.riskLevel === "MEDIUM") return "#d0a84b";
  return "#76a77f";
};

const nodeRadius = (type: GraphNode["nodeType"]) => {
  if (type === "Victim") return 30;
  if (type === "Mule") return 18;
  if (type === "Suspect") return 20;
  return 14;
};

const nodeVisualRadius = (node: GraphNode) => {
  const baseRadius = nodeRadius(node.nodeType);
  return node.nodeType === "Victim" ? Math.max(baseRadius, 38) : baseRadius;
};

const compactAccountLabel = (accountNumber: string) =>
  accountNumber.length > 6 ? `...${accountNumber.slice(-6)}` : accountNumber;

export const useGraph = ({ nodes, edges, layerStats, onSelectNode, onSelectEdge }: UseGraphOptions) => {
  const ref = useRef<SVGSVGElement | null>(null);
  const svgRef = useRef<d3.Selection<SVGSVGElement, unknown, null, undefined> | null>(null);
  const zoomRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);

  useEffect(() => {
    if (!ref.current || nodes.length === 0) return;

    const svg = d3.select(ref.current);
    svgRef.current = svg;
    const baseWidth = ref.current.clientWidth || 900;
    const baseHeight = ref.current.clientHeight || 680;
    svg.selectAll("*").remove();

    const defs = svg.append("defs");
    defs
      .append("marker")
      .attr("id", "arrow")
      .attr("viewBox", "0 -5 10 10")
      .attr("refX", 8)
      .attr("refY", 0)
      .attr("markerUnits", "userSpaceOnUse")
      .attr("markerWidth", 6)
      .attr("markerHeight", 6)
      .attr("orient", "auto")
      .append("path")
      .attr("fill", "#d09f24")
      .attr("d", "M0,-5L10,0L0,5");

    const viewport = svg.append("g");
    const zoomBehavior = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.08, 10])
      .on("zoom", (event) => viewport.attr("transform", event.transform.toString()));
    zoomRef.current = zoomBehavior;
    svg.call(zoomBehavior);

    const depthMap = d3.group(
      [...nodes].sort((a, b) => a.chainDepth - b.chainDepth || b.amountReceived - a.amountReceived),
      (node) => node.chainDepth
    );
    const maxDepth = d3.max(nodes, (node) => node.chainDepth) ?? 0;
    const horizontalPadding = 96;
    const verticalPadding = 104;
    const levelCount = Math.max(maxDepth + 1, 1);
    const levelGap = 120;
    const laneWidth = 180;
    const rowSpacing = 82;
    const levelTallestCount = d3.max([...depthMap.values()], (items) => items.length) ?? 1;
    const layoutWidth = Math.max(
      baseWidth,
      horizontalPadding * 2 + levelCount * laneWidth + Math.max(levelCount - 1, 0) * levelGap
    );
    const layoutHeight = Math.max(
      baseHeight,
      verticalPadding * 2 + Math.max(levelTallestCount - 1, 0) * rowSpacing + 120
    );

    svg.attr("viewBox", `0 0 ${layoutWidth} ${layoutHeight}`);

    const lane = viewport
      .append("g")
      .attr("class", "graph-lanes")
      .selectAll("g")
      .data(d3.range(levelCount))
      .enter()
      .append("g");

    lane
      .append("rect")
      .attr("x", (depth) => horizontalPadding + depth * (laneWidth + levelGap))
      .attr("y", 22)
      .attr("rx", 18)
      .attr("ry", 18)
      .attr("width", laneWidth)
      .attr("height", layoutHeight - 44)
      .attr("fill", (depth) => (depth === 0 ? "rgba(61,111,154,0.11)" : `rgba(22,48,67,${0.05 + depth * 0.015})`))
      .attr("stroke", (depth) => (depth === 0 ? "rgba(61,111,154,0.28)" : "rgba(22,48,67,0.14)"))
      .attr("stroke-width", 1);

    lane
      .append("text")
      .attr("x", (depth) => horizontalPadding + depth * (laneWidth + levelGap) + laneWidth / 2)
      .attr("y", 48)
      .attr("text-anchor", "middle")
      .attr("font-family", "IBM Plex Sans Condensed")
      .attr("font-size", 11)
      .attr("font-weight", 600)
      .attr("letter-spacing", "0.18em")
      .attr("fill", "#6f8192")
      .text((depth) => `LEVEL ${depth}`);

    lane
      .append("text")
      .attr("x", (depth) => horizontalPadding + depth * (laneWidth + levelGap) + 14)
      .attr("y", 72)
      .attr("font-family", "IBM Plex Mono")
      .attr("font-size", 9)
      .attr("fill", "#5f7286")
      .text((depth) => `Accounts: ${layerStats?.[depth]?.accounts ?? 0}`);

    lane
      .append("text")
      .attr("x", (depth) => horizontalPadding + depth * (laneWidth + levelGap) + 14)
      .attr("y", 88)
      .attr("font-family", "IBM Plex Mono")
      .attr("font-size", 9)
      .attr("fill", "#5f7286")
      .text((depth) => `In: ₹${Math.round(layerStats?.[depth]?.enteredAmount ?? 0).toLocaleString("en-IN")}`);

    lane
      .append("text")
      .attr("x", (depth) => horizontalPadding + depth * (laneWidth + levelGap) + 14)
      .attr("y", 104)
      .attr("font-family", "IBM Plex Mono")
      .attr("font-size", 9)
      .attr("fill", "#5f7286")
      .text((depth) => `Out: ₹${Math.round(layerStats?.[depth]?.leftAmount ?? 0).toLocaleString("en-IN")}`);

    const layoutNodes = nodes.map((node) => {
      const siblings = depthMap.get(node.chainDepth) ?? [node];
      const index = siblings.findIndex((candidate) => candidate.id === node.id);
      const levelHeight = Math.max((siblings.length - 1) * rowSpacing, 0);
      const laneX = horizontalPadding + node.chainDepth * (laneWidth + levelGap);
      const startY = verticalPadding + (layoutHeight - verticalPadding * 2 - levelHeight) / 2;

      return {
        ...node,
        x: laneX + laneWidth / 2,
        y: startY + index * rowSpacing
      };
    });

    const nodeLookup = new Map(layoutNodes.map((node) => [node.accountNumber, node]));
    const layoutEdges = edges
      .map((edge) => ({
        ...edge,
        sourceNode: nodeLookup.get(edge.source),
        targetNode: nodeLookup.get(edge.target)
      }))
      .filter((edge) => edge.sourceNode && edge.targetNode);

    const edgeLine = (edge: (typeof layoutEdges)[number]) => {
      const source = edge.sourceNode!;
      const target = edge.targetNode!;
      const dx = target.x - source.x;
      const dy = target.y - source.y;
      const distance = Math.max(Math.hypot(dx, dy), 1);
      const ux = dx / distance;
      const uy = dy / distance;
      const sourceOffset = nodeVisualRadius(source) + 4;
      const targetOffset = nodeVisualRadius(target) + 14;
      const startX = source.x + ux * sourceOffset;
      const startY = source.y + uy * sourceOffset;
      const endX = target.x - ux * targetOffset;
      const endY = target.y - uy * targetOffset;
      const controlOffset = Math.max((endX - startX) * 0.42, 44);
      return `M ${startX} ${startY} C ${startX + controlOffset} ${startY}, ${endX - controlOffset} ${endY}, ${endX} ${endY}`;
    };

    const maxEdgeAmount = d3.max(layoutEdges, (edge) => edge.amount) ?? 1;
    const edgeWidth = d3.scaleLinear().domain([0, maxEdgeAmount]).range([1.6, 9]).clamp(true);
    const showEdgeLabels = layoutEdges.length <= 14;

    const link = viewport
      .append("g")
      .selectAll("path")
      .data(layoutEdges)
      .enter()
      .append("path")
      .style("cursor", "pointer")
      .attr("fill", "none")
      .attr("stroke", (edge) =>
        edge.amount > maxEdgeAmount * 0.7
          ? "rgba(207,106,106,0.68)"
          : edge.amount > maxEdgeAmount * 0.35
            ? "rgba(195,144,77,0.58)"
            : "rgba(163,133,69,0.38)"
      )
      .attr("stroke-width", (edge) => edgeWidth(edge.amount))
      .attr("stroke-linecap", "round")
      .attr("opacity", 0.88)
      .attr("marker-end", "url(#arrow)")
      .attr("d", edgeLine)
      .on("click", (event, datum) => {
        event.stopPropagation();
        onSelectEdge(datum);
      });

    const edgeLabels = viewport
      .append("g")
      .selectAll("text")
      .data(layoutEdges)
      .enter()
      .append("text")
      .attr("fill", "#7a8d9f")
      .attr("font-family", "IBM Plex Mono")
      .attr("font-size", 9)
      .attr("display", showEdgeLabels ? "block" : "none")
      .text((edge) => `₹${Math.round(edge.amount).toLocaleString("en-IN")}`);

    const node = viewport
      .append("g")
      .selectAll("g")
      .data(layoutNodes)
      .enter()
      .append("g")
      .style("cursor", "pointer")
      .on("click", (_event, datum) => onSelectNode(datum));

    node
      .filter((datum) => datum.nodeType === "Victim")
      .append("circle")
      .attr("r", 38)
      .attr("fill", "none")
      .attr("stroke", "rgba(88,183,232,0.35)")
      .attr("stroke-width", 2)
      .call((selection) => {
        selection
          .append("animate")
          .attr("attributeName", "r")
          .attr("values", "34;40;34")
          .attr("dur", "2.2s")
          .attr("repeatCount", "indefinite");

        selection
          .append("animate")
          .attr("attributeName", "opacity")
          .attr("values", "0.25;0.7;0.25")
          .attr("dur", "2.2s")
          .attr("repeatCount", "indefinite");
      });

    node
      .append("circle")
      .attr("r", (datum) => nodeRadius(datum.nodeType))
      .attr("fill", (datum) => nodeColor(datum))
      .attr("stroke", "#ffffff")
      .attr("stroke-width", 1);

    node
      .append("title")
      .text(
        (datum) =>
          `Account: ${datum.accountNumber}\nBank: ${datum.bankName}\nAmount Received: ₹${datum.amountReceived.toLocaleString(
            "en-IN"
          )}\nBalance: ₹${datum.currentBalance.toLocaleString("en-IN")}\nRisk Score: ${Math.round(
            datum.riskScore
          )}\nChain Depth: ${datum.chainDepth}\nLocation: ${datum.location ?? "Unknown"}`
      );

    node
      .append("text")
      .attr("text-anchor", "middle")
      .attr("dy", (datum) => nodeRadius(datum.nodeType) + 18)
      .attr("font-family", "IBM Plex Mono")
      .attr("font-size", 10)
      .attr("fill", "#27445c")
      .text((datum) => compactAccountLabel(datum.accountNumber));

    const refreshPositions = () => {
      link.attr("d", edgeLine);
      edgeLabels
        .attr("x", (edge) => ((edge.sourceNode!.x + edge.targetNode!.x) / 2) - 4)
        .attr("y", (edge) => ((edge.sourceNode!.y + edge.targetNode!.y) / 2) - 8);
      node.attr("transform", (datum: any) => `translate(${datum.x},${datum.y})`);
    };

    node.call(
      d3
        .drag<SVGGElement, any>()
        .on("drag", (event, datum) => {
          datum.x = event.x;
          datum.y = event.y;
          refreshPositions();
        })
    );

    refreshPositions();

    return () => {
      svg.on(".zoom", null);
    };
  }, [nodes, edges, layerStats, onSelectNode, onSelectEdge]);

  const adjustZoom = (factor: number) => {
    if (!svgRef.current || !zoomRef.current) return;
    svgRef.current
      .transition()
      .duration(180)
      .call(zoomRef.current.scaleBy, factor);
  };

  const zoomIn = () => adjustZoom(1.2);
  const zoomOut = () => adjustZoom(0.84);
  const resetZoom = () => {
    if (!svgRef.current || !zoomRef.current) return;
    svgRef.current
      .transition()
      .duration(220)
      .call(zoomRef.current.transform, d3.zoomIdentity);
  };

  return { ref, zoomIn, zoomOut, resetZoom };
};
