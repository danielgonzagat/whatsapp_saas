import { type Canvas, FabricImage, filters } from 'fabric';

type FilterInstance = InstanceType<typeof filters.BaseFilter>;

/** Filter manager. */
export class FilterManager {
  private canvas: Canvas;

  constructor(canvas: Canvas) {
    this.canvas = canvas;
  }

  private _getActiveImage(): FabricImage | null {
    const obj = this.canvas.getActiveObject();
    if (obj instanceof FabricImage) {
      return obj;
    }
    return null;
  }

  /** Brightness. */
  brightness(value: number): void {
    this._applyFilter('Brightness', { brightness: value });
  }

  /** Contrast. */
  contrast(value: number): void {
    this._applyFilter('Contrast', { contrast: value });
  }

  /** Saturation. */
  saturation(value: number): void {
    this._applyFilter('Saturation', { saturation: value });
  }

  /** Blur. */
  blur(value: number): void {
    this._applyFilter('Blur', { blur: value });
  }

  /** Grayscale. */
  grayscale(): void {
    this._applyFilter('Grayscale', {});
  }

  /** Sepia. */
  sepia(): void {
    this._applyFilter('Sepia', {});
  }

  /** Invert. */
  invert(): void {
    this._applyFilter('Invert', {});
  }

  /** Remove filters. */
  removeFilters(): void {
    const img = this._getActiveImage();
    if (!img) {
      return;
    }
    img.filters = [];
    img.applyFilters();
    this.canvas.requestRenderAll();
  }

  private _applyFilter(name: string, opts: Record<string, unknown>): void {
    const img = this._getActiveImage();
    if (!img) {
      return;
    }

    const FilterClass = (filters as Record<string, unknown>)[name] as
      | (new (opts: Record<string, unknown>) => FilterInstance)
      | undefined;
    if (!FilterClass) {
      return;
    }

    // Remove existing filter of same type
    img.filters = (img.filters ?? []).filter((f) => f.type !== name);

    const filter = new FilterClass(opts);
    img.filters.push(filter);
    img.applyFilters();
    this.canvas.requestRenderAll();
  }
}
