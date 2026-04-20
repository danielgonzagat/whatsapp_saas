'use client';

import CanvasEditor from '@/components/canvas/CanvasEditor';
import { EditorErrorBoundary } from '@/components/canvas/EditorErrorBoundary';

/** Editor page. */
export default function EditorPage() {
  return (
    <EditorErrorBoundary>
      <CanvasEditor />
    </EditorErrorBoundary>
  );
}
