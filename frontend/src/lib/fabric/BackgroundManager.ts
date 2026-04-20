import { type Canvas, FabricImage } from 'fabric';

export class BackgroundManager {
  private canvas: Canvas;

  constructor(canvas: Canvas) {
    this.canvas = canvas;
  }

  setColor(color: string): void {
    this.canvas.backgroundColor = color;
    this.canvas.requestRenderAll();
  }

  async setImage(url: string): Promise<void> {
    const img = await FabricImage.fromURL(url, { crossOrigin: 'anonymous' });
    const cw = this.canvas.width;
    const ch = this.canvas.height;
    const imgW = img.width ?? 1;
    const imgH = img.height ?? 1;
    const scale = Math.max(cw / imgW, ch / imgH);
    img.scaleX = scale;
    img.scaleY = scale;
    this.canvas.backgroundImage = img;
    this.canvas.requestRenderAll();
  }

  setImageFromFile(file: File): Promise<void> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const url = e.target?.result as string;
        if (!url) {
          return reject(new Error('Failed to read file'));
        }
        this.setImage(url).then(resolve).catch(reject);
      };
      reader.onerror = () => reject(new Error('FileReader error'));
      reader.readAsDataURL(file);
    });
  }

  removeBackground(): void {
    this.canvas.backgroundColor = '#ffffff';
    this.canvas.backgroundImage = undefined;
    this.canvas.requestRenderAll();
  }
}
