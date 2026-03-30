import { Canvas, Textbox } from 'fabric';
import type { HistoryManager } from './HistoryManager';

export class TextManager {
  private canvas: Canvas;
  private history: HistoryManager;

  constructor(canvas: Canvas, history: HistoryManager) {
    this.canvas = canvas;
    this.history = history;
  }

  addHeading(text = 'Heading'): Textbox {
    return this._addText(text, {
      fontSize: 48,
      fontWeight: 'bold',
      fontFamily: 'Sora',
    });
  }

  addSubheading(text = 'Subheading'): Textbox {
    return this._addText(text, {
      fontSize: 24,
      fontFamily: 'Sora',
    });
  }

  addBody(text = 'Body text'): Textbox {
    return this._addText(text, {
      fontSize: 14,
      fontFamily: 'Sora',
    });
  }

  private _addText(
    text: string,
    opts: Partial<ConstructorParameters<typeof Textbox>[1] & Record<string, unknown>>,
  ): Textbox {
    const width = this.canvas.width * 0.6;
    const tb = new Textbox(text, {
      width,
      ...opts,
    });
    this.canvas.add(tb);
    this.canvas.centerObject(tb);
    tb.setCoords();
    this.canvas.setActiveObject(tb);
    this.canvas.requestRenderAll();
    this.history.saveState();
    return tb;
  }
}
