import { type Canvas, FabricImage, filters } from 'fabric';

type FilterInstance = InstanceType<typeof filters.BaseFilter>;

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

  brightness(value: number): void {
    this._applyFilter('Brightness', { brightness: value });
  }

  contrast(value: number): void {
    this._applyFilter('Contrast', { contrast: value });
  }

  saturation(value: number): void {
    this._applyFilter('Saturation', { saturation: value });
  }

  blur(value: number): void {
    this._applyFilter('Blur', { blur: value });
  }

  grayscale(): void {
    this._applyFilter('Grayscale', {});
  }

  sepia(): void {
    this._applyFilter('Sepia', {});
  }

  invert(): void {
    this._applyFilter('Invert', {});
  }

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
