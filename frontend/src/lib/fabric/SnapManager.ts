import { type Canvas, type FabricObject, Line } from 'fabric';

const THRESHOLD = 5;
const GUIDELINE_COLOR = '#E85D30';
const GUIDELINE_DASH = [3, 3];

export class SnapManager {
  private canvas: Canvas;
  private guidelines: Line[] = [];

  constructor(canvas: Canvas) {
    this.canvas = canvas;
    this._initSnapping();
  }

  private _isGuideline(obj: FabricObject): boolean {
    return this.guidelines.includes(obj as Line);
  }

  private _snapToCanvasCenter(
    target: FabricObject,
    cx: number,
    cy: number,
    cw: number,
    ch: number,
  ): void {
    if (Math.abs(cx - cw / 2) < THRESHOLD) {
      target.left = (target.left ?? 0) + (cw / 2 - cx);
      this._addVerticalLine(cw / 2);
    }
    if (Math.abs(cy - ch / 2) < THRESHOLD) {
      target.top = (target.top ?? 0) + (ch / 2 - cy);
      this._addHorizontalLine(ch / 2);
    }
  }

  private _snapHorizontal(target: FabricObject, currentPosition: number, snapLineX: number): void {
    if (Math.abs(currentPosition - snapLineX) < THRESHOLD) {
      target.left = (target.left ?? 0) + (snapLineX - currentPosition);
      this._addVerticalLine(snapLineX);
    }
  }

  private _snapVertical(target: FabricObject, currentPosition: number, snapLineY: number): void {
    if (Math.abs(currentPosition - snapLineY) < THRESHOLD) {
      target.top = (target.top ?? 0) + (snapLineY - currentPosition);
      this._addHorizontalLine(snapLineY);
    }
  }

  private _snapToCanvasEdges(
    target: FabricObject,
    bound: { left: number; top: number; width: number; height: number },
    cw: number,
    ch: number,
  ): void {
    this._snapHorizontal(target, bound.left, 0);
    this._snapVertical(target, bound.top, 0);
    this._snapHorizontal(target, bound.left + bound.width, cw);
    this._snapVertical(target, bound.top + bound.height, ch);
  }

  private _snapAxisToCenter(
    target: FabricObject,
    currentCenter: number,
    otherCenter: number,
    axis: 'x' | 'y',
  ): void {
    if (Math.abs(currentCenter - otherCenter) >= THRESHOLD) return;
    const delta = otherCenter - currentCenter;
    if (axis === 'x') {
      target.left = (target.left ?? 0) + delta;
      this._addVerticalLine(otherCenter);
    } else {
      target.top = (target.top ?? 0) + delta;
      this._addHorizontalLine(otherCenter);
    }
  }

  private _snapToOtherObjects(target: FabricObject, cx: number, cy: number): void {
    const objects = this.canvas.getObjects().filter((o) => o !== target && !this._isGuideline(o));
    for (const obj of objects) {
      const ob = obj.getBoundingRect();
      const ocx = ob.left + ob.width / 2;
      const ocy = ob.top + ob.height / 2;
      this._snapAxisToCenter(target, cx, ocx, 'x');
      this._snapAxisToCenter(target, cy, ocy, 'y');
    }
  }

  private _handleObjectMoving(target: FabricObject | undefined): void {
    this._clearGuidelines();
    if (!target) return;

    const cw = this.canvas.width;
    const ch = this.canvas.height;
    const bound = target.getBoundingRect();
    const cx = bound.left + bound.width / 2;
    const cy = bound.top + bound.height / 2;

    this._snapToCanvasCenter(target, cx, cy, cw, ch);
    this._snapToCanvasEdges(target, bound, cw, ch);
    this._snapToOtherObjects(target, cx, cy);

    target.setCoords();
  }

  private _initSnapping(): void {
    this.canvas.on('object:moving', (e) => {
      this._handleObjectMoving(e.target);
    });

    this.canvas.on('object:modified', () => this._clearGuidelines());
  }

  private _addVerticalLine(x: number): void {
    const line = new Line([x, 0, x, this.canvas.height], {
      stroke: GUIDELINE_COLOR,
      strokeDashArray: GUIDELINE_DASH,
      selectable: false,
      evented: false,
      excludeFromExport: true,
    });
    // Add without firing events to prevent triggering history/autosave
    this.canvas._objects.push(line);
    line.canvas = this.canvas;
    this.guidelines.push(line);
    this.canvas.requestRenderAll();
  }

  private _addHorizontalLine(y: number): void {
    const line = new Line([0, y, this.canvas.width, y], {
      stroke: GUIDELINE_COLOR,
      strokeDashArray: GUIDELINE_DASH,
      selectable: false,
      evented: false,
      excludeFromExport: true,
    });
    this.canvas._objects.push(line);
    line.canvas = this.canvas;
    this.guidelines.push(line);
    this.canvas.requestRenderAll();
  }

  private _clearGuidelines(): void {
    for (const g of this.guidelines) {
      const idx = this.canvas._objects.indexOf(g);
      if (idx !== -1) this.canvas._objects.splice(idx, 1);
    }
    this.guidelines = [];
    this.canvas.requestRenderAll();
  }
}
