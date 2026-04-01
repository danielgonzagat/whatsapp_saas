'use client';

import { EditorErrorBoundary } from '@/components/canvas/EditorErrorBoundary';
import CanvasEditor from '@/components/canvas/CanvasEditor';

export default function EditorPage() {
  return (
    <EditorErrorBoundary>
      <CanvasEditor />
    </EditorErrorBoundary>
  );
}
