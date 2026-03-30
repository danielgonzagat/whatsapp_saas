import { Canvas } from 'fabric';

export class ExportManager {
  private canvas: Canvas;

  constructor(canvas: Canvas) {
    this.canvas = canvas;
  }

  toPNG(pixelRatio = 2): string {
    return this.canvas.toDataURL({
      format: 'png',
      multiplier: pixelRatio,
    });
  }

  toJPG(quality = 0.8): string {
    return this.canvas.toDataURL({
      format: 'jpeg',
      quality,
      multiplier: 1,
    });
  }

  toSVG(): string {
    return this.canvas.toSVG();
  }

  async toPDF(): Promise<Blob> {
    const { jsPDF } = await import('jspdf');
    const w = this.canvas.width;
    const h = this.canvas.height;
    const orientation = w > h ? 'landscape' : 'portrait';
    const doc = new jsPDF({
      orientation,
      unit: 'px',
      format: [w, h],
    });
    const dataUrl = this.toPNG(2);
    doc.addImage(dataUrl, 'PNG', 0, 0, w, h);
    return doc.output('blob');
  }

  download(filename: string, format: 'png' | 'jpg' | 'svg' | 'pdf' = 'png'): void {
    if (format === 'pdf') {
      this.toPDF().then((blob) => {
        this._downloadBlob(blob, `${filename}.pdf`);
      });
      return;
    }

    let dataUrl: string;
    let ext: string;

    switch (format) {
      case 'svg': {
        const svgStr = this.toSVG();
        const blob = new Blob([svgStr], { type: 'image/svg+xml' });
        this._downloadBlob(blob, `${filename}.svg`);
        return;
      }
      case 'jpg':
        dataUrl = this.toJPG();
        ext = 'jpg';
        break;
      default:
        dataUrl = this.toPNG();
        ext = 'png';
        break;
    }

    const link = document.createElement('a');
    link.download = `${filename}.${ext}`;
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
