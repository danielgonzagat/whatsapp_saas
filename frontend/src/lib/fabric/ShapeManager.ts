import { type Canvas, Circle, Line, Polygon, Rect, Triangle } from 'fabric';
import type { HistoryManager } from './HistoryManager';
import { colors } from '@/lib/design-tokens';

const DEFAULT_FILL = 'colors.text.silver';

/** Shape manager. */
export class ShapeManager {
  private canvas: Canvas;
  private history: HistoryManager;

  constructor(canvas: Canvas, history: HistoryManager) {
    this.canvas = canvas;
    this.history = history;
  }

  /** Add rect. */
  addRect(): Rect {
    const rect = new Rect({ width: 200, height: 200, fill: DEFAULT_FILL });
    return this._addAndCenter(rect) as Rect;
  }

  /** Add circle. */
  addCircle(): Circle {
    const circle = new Circle({ radius: 100, fill: DEFAULT_FILL });
    return this._addAndCenter(circle) as Circle;
  }

  /** Add triangle. */
  addTriangle(): Triangle {
    const tri = new Triangle({ width: 200, height: 200, fill: DEFAULT_FILL });
    return this._addAndCenter(tri) as Triangle;
  }

  /** Add line. */
  addLine(): Line {
    const cx = this.canvas.width / 2;
    const cy = this.canvas.height / 2;
    const line = new Line([cx - 150, cy, cx + 150, cy], {
      stroke: '#000000',
      strokeWidth: 2,
    });
    this.canvas.add(line);
    line.setCoords();
    this.canvas.setActiveObject(line);
    this.canvas.requestRenderAll();
    this.history.saveState();
    return line;
  }

  /** Add star. */
  addStar(): Polygon {
    const points = this._starVertices(5, 100, 45);
    const star = new Polygon(points, { fill: DEFAULT_FILL });
    return this._addAndCenter(star) as Polygon;
  }

  private _addAndCenter<
    T extends InstanceType<typeof Rect | typeof Circle | typeof Triangle | typeof Polygon>,
  >(obj: T): T {
    this.canvas.add(obj);
    this.canvas.centerObject(obj);
    obj.setCoords();
    this.canvas.setActiveObject(obj);
    this.canvas.requestRenderAll();
    this.history.saveState();
    return obj;
  }

  private _starVertices(
    spikes: number,
    outerRadius: number,
    innerRadius: number,
  ): Array<{ x: number; y: number }> {
    const points: Array<{ x: number; y: number }> = [];
    const step = Math.PI / spikes;
    let rot = -Math.PI / 2;
    for (let i = 0; i < spikes * 2; i++) {
      const r = i % 2 === 0 ? outerRadius : innerRadius;
      points.push({ x: Math.cos(rot) * r, y: Math.sin(rot) * r });
      rot += step;
    }
    return points;
  }
}
