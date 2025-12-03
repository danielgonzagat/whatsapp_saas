export function getNextNode(flow, currentNode) {
  const edges = flow.edges.filter((e) => e.source === currentNode.id);

  // WAIT NODE tem caminhos YES/NO
  if (currentNode.type === "waitNode") {
    const yes = edges.find((e) => e.data?.label === "yes");
    const no = edges.find((e) => e.data?.label === "no");

    return {
      yes: yes?.target || null,
      no: no?.target || null,
    };
  }

  // Outras nodes → 1 caminho
  const e = edges[0];
  return e ? e.target : null;
}

