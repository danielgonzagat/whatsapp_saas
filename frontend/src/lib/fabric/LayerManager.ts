import type { Canvas, FabricObject } from 'fabric';

/** Layer manager. */
export class LayerManager {
  private canvas: Canvas;

  constructor(canvas: Canvas) {
    this.canvas = canvas;
  }

  /** Get objects. */
  getObjects(): FabricObject[] {
    return this.canvas.getObjects();
  }

  /** Bring to front. */
  bringToFront(obj?: FabricObject): void {
    const target = obj ?? this.canvas.getActiveObject();
    if (!target) {
      return;
    }
    this.canvas.bringObjectToFront(target);
    this.canvas.requestRenderAll();
  }

  /** Send to back. */
  sendToBack(obj?: FabricObject): void {
    const target = obj ?? this.canvas.getActiveObject();
    if (!target) {
      return;
    }
    this.canvas.sendObjectToBack(target);
    this.canvas.requestRenderAll();
  }

  /** Bring forward. */
  bringForward(obj?: FabricObject): void {
    const target = obj ?? this.canvas.getActiveObject();
    if (!target) {
      return;
    }
    this.canvas.bringObjectForward(target);
    this.canvas.requestRenderAll();
  }

  /** Send backward. */
  sendBackward(obj?: FabricObject): void {
    const target = obj ?? this.canvas.getActiveObject();
    if (!target) {
      return;
    }
    this.canvas.sendObjectBackwards(target);
    this.canvas.requestRenderAll();
  }

  /** Lock object. */
  lockObject(obj: FabricObject): void {
    obj.selectable = false;
    obj.evented = false;
    obj.lockMovementX = true;
    obj.lockMovementY = true;
    this.canvas.requestRenderAll();
  }

  /** Unlock object. */
  unlockObject(obj: FabricObject): void {
    obj.selectable = true;
    obj.evented = true;
    obj.lockMovementX = false;
    obj.lockMovementY = false;
    this.canvas.requestRenderAll();
  }

  /** Hide object. */
  hideObject(obj: FabricObject): void {
    obj.visible = false;
    this.canvas.requestRenderAll();
  }

  /** Show object. */
  showObject(obj: FabricObject): void {
    obj.visible = true;
    this.canvas.requestRenderAll();
  }
}
