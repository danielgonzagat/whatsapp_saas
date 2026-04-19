import { ActiveSelection, type Canvas, Group } from 'fabric';
import type { HistoryManager } from './HistoryManager';

export class GroupingManager {
  private canvas: Canvas;
  private history: HistoryManager;

  constructor(canvas: Canvas, history: HistoryManager) {
    this.canvas = canvas;
    this.history = history;
  }

  group(): Group | null {
    const active = this.canvas.getActiveObject();
    if (!(active instanceof ActiveSelection)) return null;

    const objects = active.getObjects();
    if (objects.length < 2) return null;

    this.canvas.discardActiveObject();
    objects.forEach((obj) => {
      this.canvas.remove(obj);
    });

    const group = new Group(objects);
    this.canvas.add(group);
    this.canvas.setActiveObject(group);
    this.canvas.requestRenderAll();
    this.history.saveState();
    return group;
  }

  ungroup(): void {
    const active = this.canvas.getActiveObject();
    if (!(active instanceof Group)) return;

    const items = active.getObjects();
    this.canvas.remove(active);

    // Fabric v6+ destroys the group on remove; re-add individual objects
    items.forEach((obj) => {
      this.canvas.add(obj);
    });
    this.canvas.discardActiveObject();
    this.canvas.requestRenderAll();
    this.history.saveState();
  }
}
