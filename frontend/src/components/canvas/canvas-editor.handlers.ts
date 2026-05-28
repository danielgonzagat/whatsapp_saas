/**
 * @file Canvas editor pure handler hook.
 *
 * Extracted from `CanvasEditor.tsx` (Wave 95 B) to keep the shell component
 * focused on layout/state and isolate the imperative editor callbacks.
 *
 * All handlers are pure wrappers around `editorRef.current` operations — no
 * React state owned here beyond what is threaded back via setter props. The
 * call signatures match the original `useCallback` references one-for-one.
 */
import { useCallback, type Dispatch, type RefObject, type SetStateAction } from 'react';
import type { KloelEditor } from '@/lib/fabric';
import type { ProductTemplate } from '@/hooks/useProductTemplates';
import type { SelectedCanvasObject } from './canvas-editor.types';

export type CanvasExportFormat = 'png' | 'jpg' | 'svg' | 'pdf';
export type CanvasTextPreset = 'heading' | 'subheading' | 'body';
export type CanvasShapeKind = 'rect' | 'circle' | 'triangle' | 'line' | 'star';

export interface UseCanvasEditorHandlersParams {
  editorRef: RefObject<KloelEditor | null>;
  designName: string;
  setDesignName: Dispatch<SetStateAction<string>>;
  setZoom: Dispatch<SetStateAction<number>>;
  setUploadDrag: Dispatch<SetStateAction<boolean>>;
  setIsDrawing: Dispatch<SetStateAction<boolean>>;
  setLayerList: Dispatch<SetStateAction<unknown[]>>;
  setSelectedObj: Dispatch<
    SetStateAction<SelectedCanvasObject | SelectedCanvasObject[] | null>
  >;
}

export interface CanvasEditorHandlers {
  handleUndo: () => void;
  handleRedo: () => void;
  handleExportFmt: (fmt: CanvasExportFormat) => void;
  handleSave: () => void;
  handleCopy: () => void;
  handlePaste: () => void;
  handleDuplicate: () => void;
  handleDelete: () => void;
  handleSelectAll: () => void;
  handleResize: (nw: number, nh: number) => void;
  handleZoomIn: () => void;
  handleZoomOut: () => void;
  handleZoomFit: () => void;
  handleAddText: (preset: CanvasTextPreset) => void;
  handleAddShape: (shape: CanvasShapeKind) => void;
  handleUpload: (file: File) => Promise<void>;
  handleFileInput: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleDrop: (e: React.DragEvent) => void;
  handleApplyTemplate: (tpl: ProductTemplate) => void;
  handleSetBackground: (color: string) => void;
  handleToggleDrawMode: () => void;
  updateProp: (prop: string, value: unknown) => void;
}

/**
 * Builds the memoised callback set used by the CanvasEditor shell.
 *
 * Behaviour is preserved exactly — every handler matches the original
 * `useCallback` in dependency list and side-effects. Editor operations are
 * accessed through the same `editorRef.current` ref so initialisation order
 * is unchanged.
 */
export function useCanvasEditorHandlers(
  params: UseCanvasEditorHandlersParams,
): CanvasEditorHandlers {
  const {
    editorRef,
    designName,
    setDesignName,
    setZoom,
    setUploadDrag,
    setIsDrawing,
    setLayerList,
    setSelectedObj,
  } = params;

  const handleUndo = useCallback(() => editorRef.current?.history.undo(), [editorRef]);
  const handleRedo = useCallback(() => editorRef.current?.history.redo(), [editorRef]);

  const handleExportFmt = useCallback(
    (fmt: CanvasExportFormat) => {
      if (!editorRef.current) {
        return;
      }
      try {
        editorRef.current.exporter.download(designName, fmt);
      } catch (e) {
        console.error('Export failed:', e);
      }
    },
    [editorRef, designName],
  );

  const handleSave = useCallback(() => {
    editorRef.current?.canvas.fire('object:modified');
  }, [editorRef]);

  const handleCopy = useCallback(() => editorRef.current?.clipboard.copy(), [editorRef]);
  const handlePaste = useCallback(() => editorRef.current?.clipboard.paste(), [editorRef]);
  const handleDuplicate = useCallback(
    () => editorRef.current?.clipboard.duplicate(),
    [editorRef],
  );
  const handleDelete = useCallback(
    () => editorRef.current?.selection.deleteSelected(),
    [editorRef],
  );
  const handleSelectAll = useCallback(
    () => editorRef.current?.selection.selectAll(),
    [editorRef],
  );

  const handleResize = useCallback(
    (nw: number, nh: number) => {
      editorRef.current?.setSize(nw, nh);
      setTimeout(() => {
        editorRef.current?.zoom.zoomToFit();
        setZoom(editorRef.current?.zoom.getZoom() ?? 100);
      }, 50);
    },
    [editorRef, setZoom],
  );

  const handleZoomIn = useCallback(() => {
    editorRef.current?.zoom.zoomIn();
    setZoom(editorRef.current?.zoom.getZoom() ?? 100);
  }, [editorRef, setZoom]);

  const handleZoomOut = useCallback(() => {
    editorRef.current?.zoom.zoomOut();
    setZoom(editorRef.current?.zoom.getZoom() ?? 100);
  }, [editorRef, setZoom]);

  const handleZoomFit = useCallback(() => {
    editorRef.current?.zoom.zoomToFit();
    setZoom(editorRef.current?.zoom.getZoom() ?? 100);
  }, [editorRef, setZoom]);

  const handleAddText = useCallback(
    (preset: CanvasTextPreset) => {
      if (!editorRef.current) {
        return;
      }
      if (preset === 'heading') {
        editorRef.current.text.addHeading('Titulo');
      } else if (preset === 'subheading') {
        editorRef.current.text.addSubheading('Subtitulo');
      } else {
        editorRef.current.text.addBody('Corpo de texto');
      }
    },
    [editorRef],
  );

  const handleAddShape = useCallback(
    (shape: CanvasShapeKind) => {
      if (!editorRef.current) {
        return;
      }
      const e = editorRef.current.shapes;
      if (shape === 'rect') {
        e.addRect();
      } else if (shape === 'circle') {
        e.addCircle();
      } else if (shape === 'triangle') {
        e.addTriangle();
      } else if (shape === 'line') {
        e.addLine();
      } else if (shape === 'star') {
        e.addStar();
      }
    },
    [editorRef],
  );

  const handleUpload = useCallback(
    async (file: File) => {
      if (!editorRef.current) {
        return;
      }
      try {
        await editorRef.current.image.addImageFromFile(file);
      } catch (e) {
        console.error('Upload failed:', e);
      }
    },
    [editorRef],
  );

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        handleUpload(file);
      }
      e.target.value = '';
    },
    [handleUpload],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setUploadDrag(false);
      const file = e.dataTransfer.files[0];
      if (file?.type.startsWith('image/')) {
        handleUpload(file);
      }
    },
    [handleUpload, setUploadDrag],
  );

  const handleApplyTemplate = useCallback(
    (tpl: ProductTemplate) => {
      if (!editorRef.current) {
        return;
      }
      editorRef.current.loadJSON(tpl.json).catch(() => {});
      setDesignName(tpl.name);
    },
    [editorRef, setDesignName],
  );

  const handleSetBackground = useCallback(
    (color: string) => {
      if (!editorRef.current) {
        return;
      }
      editorRef.current.background.setColor(color);
    },
    [editorRef],
  );

  const handleToggleDrawMode = useCallback(() => {
    const ed = editorRef.current;
    if (!ed) {
      return;
    }
    const nextMode = !ed.canvas.isDrawingMode;
    (ed.canvas as { isDrawingMode: boolean }).isDrawingMode = nextMode;
    if (nextMode && ed.canvas.freeDrawingBrush) {
      (ed.canvas.freeDrawingBrush as { color: string; width: number }).color =
        'colors.ember.primary';
      (ed.canvas.freeDrawingBrush as { color: string; width: number }).width = 3;
    }
    setIsDrawing(nextMode);
    setLayerList([...ed.layers.getObjects()]);
  }, [editorRef, setIsDrawing, setLayerList]);

  const updateProp = useCallback(
    (prop: string, value: unknown) => {
      const ed = editorRef.current;
      if (!ed) {
        return;
      }
      const obj = ed.canvas.getActiveObject();
      if (!obj) {
        return;
      }
      obj.set(prop as keyof typeof obj, value as never);
      obj.setCoords();
      ed.canvas.requestRenderAll();
      ed.history.saveState();
      setSelectedObj({ ...(obj as object as Record<string, unknown>) });
    },
    [editorRef, setSelectedObj],
  );

  return {
    handleUndo,
    handleRedo,
    handleExportFmt,
    handleSave,
    handleCopy,
    handlePaste,
    handleDuplicate,
    handleDelete,
    handleSelectAll,
    handleResize,
    handleZoomIn,
    handleZoomOut,
    handleZoomFit,
    handleAddText,
    handleAddShape,
    handleUpload,
    handleFileInput,
    handleDrop,
    handleApplyTemplate,
    handleSetBackground,
    handleToggleDrawMode,
    updateProp,
  };
}
