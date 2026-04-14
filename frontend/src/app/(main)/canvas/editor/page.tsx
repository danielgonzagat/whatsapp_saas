'use client';

import CanvasEditor from '@/components/canvas/CanvasEditor';
import { EditorErrorBoundary } from '@/components/canvas/EditorErrorBoundary';

export default function EditorPage() {
  return (
    <EditorErrorBoundary>
      <CanvasEditor />
    </EditorErrorBoundary>
  );
}
