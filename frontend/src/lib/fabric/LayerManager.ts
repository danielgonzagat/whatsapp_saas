import type { Canvas, FabricObject } from 'fabric';

export class LayerManager {
  private canvas: Canvas;

  constructor(canvas: Canvas) {
    this.canvas = canvas;
  }

  getObjects(): FabricObject[] {
    return this.canvas.getObjects();
  }

  bringToFront(obj?: FabricObject): void {
    const target = obj ?? this.canvas.getActiveObject();
    if (!target) return;
    this.canvas.bringObjectToFront(target);
    this.canvas.requestRenderAll();
  }

  sendToBack(obj?: FabricObject): void {
    const target = obj ?? this.canvas.getActiveObject();
    if (!target) return;
    this.canvas.sendObjectToBack(target);
    this.canvas.requestRenderAll();
  }

  bringForward(obj?: FabricObject): void {
    const target = obj ?? this.canvas.getActiveObject();
    if (!target) return;
    this.canvas.bringObjectForward(target);
    this.canvas.requestRenderAll();
  }

  sendBackward(obj?: FabricObject): void {
    const target = obj ?? this.canvas.getActiveObject();
    if (!target) return;
    this.canvas.sendObjectBackwards(target);
    this.canvas.requestRenderAll();
  }

  lockObject(obj: FabricObject): void {
    obj.selectable = false;
    obj.evented = false;
    obj.lockMovementX = true;
    obj.lockMovementY = true;
    this.canvas.requestRenderAll();
  }

  unlockObject(obj: FabricObject): void {
    obj.selectable = true;
    obj.evented = true;
    obj.lockMovementX = false;
    obj.lockMovementY = false;
    this.canvas.requestRenderAll();
  }

  hideObject(obj: FabricObject): void {
    obj.visible = false;
    this.canvas.requestRenderAll();
  }

  showObject(obj: FabricObject): void {
    obj.visible = true;
    this.canvas.requestRenderAll();
  }
}
