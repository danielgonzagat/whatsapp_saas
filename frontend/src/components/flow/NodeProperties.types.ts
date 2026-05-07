import type { Node } from 'reactflow';

/** Shared props passed to every per-type field renderer. */
export interface NodeFieldsProps {
  /** Stable id prefix used to namespace input/label ids per panel render. */
  id: string;
  /** Currently selected node. */
  node: Node;
  /** Mutate a single field on `node.data`. */
  handleChange: (field: string, value: unknown) => void;
}
