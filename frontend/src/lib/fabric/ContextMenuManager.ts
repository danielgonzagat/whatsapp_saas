import { Canvas } from 'fabric';
import type { ClipboardManager } from './ClipboardManager';
import type { SelectionManager } from './SelectionManager';
import type { LayerManager } from './LayerManager';
import type { GroupingManager } from './GroupingManager';

export interface ContextMenuItem {
  label: string;
  action: () => void;
  disabled?: boolean;
  separator?: boolean;
}

interface ContextMenuDeps {
  clipboard: ClipboardManager;
  selection: SelectionManager;
  layers: LayerManager;
  grouping: GroupingManager;
}

export type ContextMenuRenderer = (items: ContextMenuItem[], x: number, y: number) => void;

export class ContextMenuManager {
  private canvas: Canvas;
  private deps: ContextMenuDeps;
  private _renderer?: ContextMenuRenderer;

  constructor(canvas: Canvas, deps: ContextMenuDeps) {
    this.canvas = canvas;
    this.deps = deps;
    this._init();
  }

  onContextMenu(renderer: ContextMenuRenderer): void {
    this._renderer = renderer;
  }

  private _init(): void {
    const el = this.canvas.getSelectionElement();
    if (!el) return;

    el.addEventListener('contextmenu', (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (!this._renderer) return;

      const hasSelection = this.deps.selection.getSelected().length > 0;

      const items: ContextMenuItem[] = [
        { label: 'Copy', action: () => this.deps.clipboard.copy(), disabled: !hasSelection },
        { label: 'Paste', action: () => this.deps.clipboard.paste() },
        { label: 'Duplicate', action: () => this.deps.clipboard.duplicate(), disabled: !hasSelection },
        { label: 'Delete', action: () => this.deps.selection.deleteSelected(), disabled: !hasSelection },
        { label: '', action: () => {}, separator: true },
        { label: 'Bring to Front', action: () => this.deps.layers.bringToFront(), disabled: !hasSelection },
        { label: 'Send to Back', action: () => this.deps.layers.sendToBack(), disabled: !hasSelection },
        { label: '', action: () => {}, separator: true },
        { label: 'Group', action: () => this.deps.grouping.group(), disabled: this.deps.selection.getSelected().length < 2 },
        { label: 'Ungroup', action: () => this.deps.grouping.ungroup(), disabled: !hasSelection },
        { label: '', action: () => {}, separator: true },
        {
          label: 'Lock',
          action: () => {
            const sel = this.deps.selection.getSelected();
            sel.forEach((o) => this.deps.layers.lockObject(o));
          },
          disabled: !hasSelection,
        },
      ];

      this._renderer(items, e.clientX, e.clientY);
    });
  }
}
