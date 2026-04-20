import { type Canvas, FabricImage } from 'fabric';
import type { HistoryManager } from './HistoryManager';

/** Image manager. */
export class ImageManager {
  private canvas: Canvas;
  private history: HistoryManager;

  constructor(canvas: Canvas, history: HistoryManager) {
    this.canvas = canvas;
    this.history = history;
  }

  /** Add image. */
  async addImage(url: string): Promise<FabricImage> {
    const img = await FabricImage.fromURL(url, { crossOrigin: 'anonymous' });
    const maxW = this.canvas.width * 0.8;
    const maxH = this.canvas.height * 0.8;
    const imgW = img.width ?? 1;
    const imgH = img.height ?? 1;
    if (imgW > maxW || imgH > maxH) {
      const scale = Math.min(maxW / imgW, maxH / imgH);
      img.scaleX = scale;
      img.scaleY = scale;
    }
    this.canvas.add(img);
    this.canvas.centerObject(img);
    img.setCoords();
    this.canvas.setActiveObject(img);
    this.canvas.requestRenderAll();
    this.history.saveState();
    return img;
  }

  /** Add image from file. */
  addImageFromFile(file: File): Promise<FabricImage> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const url = e.target?.result as string;
        if (!url) {
          return reject(new Error('Failed to read file'));
        }
        this.addImage(url).then(resolve).catch(reject);
      };
      reader.onerror = () => reject(new Error('FileReader error'));
      reader.readAsDataURL(file);
    });
  }
}
