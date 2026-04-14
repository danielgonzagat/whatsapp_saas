import type { Canvas } from 'fabric';

export class ExportManager {
  private canvas: Canvas;

  constructor(canvas: Canvas) {
    this.canvas = canvas;
  }

  /** Save and restore viewport around an export so the result is always clean */
  private _withCleanViewport<T>(fn: () => T): T {
    const vpt = [...this.canvas.viewportTransform] as typeof this.canvas.viewportTransform;
    const active = this.canvas.getActiveObject();
    this.canvas.discardActiveObject();
    this.canvas.viewportTransform = [1, 0, 0, 1, 0, 0];
    this.canvas.renderAll();
    try {
      return fn();
    } finally {
      this.canvas.viewportTransform = vpt;
      if (active) this.canvas.setActiveObject(active);
      this.canvas.renderAll();
    }
  }

  toPNG(pixelRatio = 2): string {
    return this._withCleanViewport(() =>
      this.canvas.toDataURL({ format: 'png', multiplier: pixelRatio }),
    );
  }

  toJPG(quality = 0.8): string {
    return this._withCleanViewport(() =>
      this.canvas.toDataURL({ format: 'jpeg', quality, multiplier: 1 }),
    );
  }

  toSVG(): string {
    return this._withCleanViewport(() => this.canvas.toSVG());
  }

  async toPDF(): Promise<Blob> {
    const { jsPDF } = await import('jspdf');
    const w = this.canvas.width;
    const h = this.canvas.height;
    const orientation = w > h ? 'landscape' : 'portrait';
    const doc = new jsPDF({ orientation, unit: 'px', format: [w, h] });
    const dataUrl = this.toPNG(2);
    doc.addImage(dataUrl, 'PNG', 0, 0, w, h);
    return doc.output('blob');
  }

  download(filename: string, format: 'png' | 'jpg' | 'svg' | 'pdf' = 'png'): void {
    if (format === 'pdf') {
      this.toPDF().then((blob) => this._downloadBlob(blob, `${filename}.pdf`));
      return;
    }
    if (format === 'svg') {
      const svgStr = this.toSVG();
      this._downloadBlob(new Blob([svgStr], { type: 'image/svg+xml' }), `${filename}.svg`);
      return;
    }
    const dataUrl = format === 'jpg' ? this.toJPG() : this.toPNG();
    const link = document.createElement('a');
    link.download = `${filename}.${format}`;
    link.href = dataUrl;
    link.click();
  }

  private _downloadBlob(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.download = filename;
    link.href = url;
    link.click();
    URL.revokeObjectURL(url);
  }
}
