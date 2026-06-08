import { MemoryGraphView } from '@/components/kloel/memory/MemoryGraphView';

/**
 * `/memoria` — the "Memória" graph node's screen. Renders inside the KloelGraph
 * overlay (the (main) layout wraps every route in the graph shell), so the
 * per-user memory subgraph appears in the native Kloel visual with the main
 * navigation graph behind it.
 */
export default function MemoriaPage() {
  return <MemoryGraphView />;
}
