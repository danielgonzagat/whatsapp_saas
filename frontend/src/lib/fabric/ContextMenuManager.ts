import type { Canvas } from 'fabric';
import type { ClipboardManager } from './ClipboardManager';
import type { GroupingManager } from './GroupingManager';
import type { LayerManager } from './LayerManager';
import type { SelectionManager } from './SelectionManager';

/** Context menu item shape. */
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

/** Context menu renderer type. */
export type ContextMenuRenderer = (items: ContextMenuItem[], x: number, y: number) => void;

/** Context menu manager. */
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
    // Use Fabric's mouse:down event — right-click is button === 2 on native MouseEvent
    this.canvas.on('mouse:down', (opt) => {
      const e = opt.e as MouseEvent;
      if (e.button !== 2) {
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      if (!this._renderer) {
        return;
      }

      const hasSelection = this.deps.selection.getSelected().length > 0;

      const items: ContextMenuItem[] = [
        { label: 'Copiar', action: () => this.deps.clipboard.copy(), disabled: !hasSelection },
        { label: 'Colar', action: () => this.deps.clipboard.paste() },
        {
          label: 'Duplicar',
          action: () => this.deps.clipboard.duplicate(),
          disabled: !hasSelection,
        },
        {
          label: 'Excluir',
          action: () => this.deps.selection.deleteSelected(),
          disabled: !hasSelection,
        },
        { label: '', action: () => {}, separator: true },
        {
          label: 'Trazer pra frente',
          action: () => this.deps.layers.bringToFront(),
          disabled: !hasSelection,
        },
        {
          label: 'Enviar pra tras',
          action: () => this.deps.layers.sendToBack(),
          disabled: !hasSelection,
        },
        {
          label: 'Mover pra frente',
          action: () => this.deps.layers.bringForward(),
          disabled: !hasSelection,
        },
        {
          label: 'Mover pra tras',
          action: () => this.deps.layers.sendBackward(),
          disabled: !hasSelection,
        },
        { label: '', action: () => {}, separator: true },
        {
          label: 'Agrupar',
          action: () => this.deps.grouping.group(),
          disabled: this.deps.selection.getSelected().length < 2,
        },
        {
          label: 'Desagrupar',
          action: () => this.deps.grouping.ungroup(),
          disabled: !hasSelection,
        },
        { label: '', action: () => {}, separator: true },
        {
          label: 'Bloquear',
          action: () => {
            const sel = this.deps.selection.getSelected();
            sel.forEach((o) => {
              this.deps.layers.lockObject(o);
            });
          },
          disabled: !hasSelection,
        },
      ];

      this._renderer(items, e.clientX, e.clientY);
    });

    // Also suppress browser context menu on the canvas element
    const upperEl = this.canvas.getSelectionElement?.();
    if (upperEl) {
      upperEl.addEventListener('contextmenu', (e: Event) => e.preventDefault());
    }
  }
}
