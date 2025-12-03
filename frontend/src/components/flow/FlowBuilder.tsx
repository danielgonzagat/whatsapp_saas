"use client";

import ReactFlow, { Background, Controls, MiniMap } from "reactflow";
import "reactflow/dist/style.css";

export default function FlowBuilder() {
  return (
    <ReactFlow defaultNodes={[]} defaultEdges={[]}>
      <Background />
      <Controls />
      <MiniMap />
    </ReactFlow>
  );
}
