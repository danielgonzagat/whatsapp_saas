const SCHEMA = Symbol('schema');

type FieldType =
  | 'int8'
  | 'int16'
  | 'int32'
  | 'int64'
  | 'uint8'
  | 'uint16'
  | 'uint32'
  | 'uint64'
  | 'float32'
  | 'float64'
  | 'string'
  | 'bool';

interface FieldSchema {
  name: string;
  type: FieldType;
  array?: boolean;
}

interface Schema {
  fields: FieldSchema[];
}

export class BinarySerde<T extends Record<string, unknown>> {
  private [SCHEMA]: Schema;

  constructor(schema: Schema) {
    this[SCHEMA] = schema;
  }

  private fieldByteSize(type: FieldType, val: unknown): number {
    switch (type) {
      case 'int8':
      case 'uint8':
      case 'bool':
        return 1;
      case 'int16':
      case 'uint16':
        return 2;
      case 'int32':
      case 'uint32':
      case 'float32':
        return 4;
      case 'int64':
      case 'uint64':
      case 'float64':
        return 8;
      case 'string':
        return 2 + (typeof val === 'string' ? val.length : 0);
      default:
        return 0;
    }
  }

  private computeSize(obj: T): number {
    let size = 0;
    for (const field of this[SCHEMA].fields) {
      const val = obj[field.name];
      if (field.array && Array.isArray(val)) {
        size += 4;
        for (const item of val) {
          size += this.fieldByteSize(field.type, item);
        }
      } else {
        size += this.fieldByteSize(field.type, val);
      }
    }
    return size;
  }

  serialize(obj: T): Uint8Array {
    const size = this.computeSize(obj);
    const buf = new ArrayBuffer(size);
    const view = new DataView(buf);
    let offset = 0;

    for (const field of this[SCHEMA].fields) {
      const val = obj[field.name];
      if (field.array && Array.isArray(val)) {
        view.setUint32(offset, val.length, true);
        offset += 4;
        for (const item of val) {
          offset = this.writeField(view, offset, field.type, item);
        }
      } else {
        offset = this.writeField(view, offset, field.type, val);
      }
    }

    return new Uint8Array(buf);
  }

  deserialize(buf: Uint8Array): T {
    const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
    let offset = 0;
    const result: Record<string, unknown> = {};

    for (const field of this[SCHEMA].fields) {
      if (field.array) {
        const length = view.getUint32(offset, true);
        offset += 4;
        const arr: unknown[] = [];
        for (let i = 0; i < length; i++) {
          const r = this.readField(view, offset, field.type);
          arr.push(r.value);
          offset = r.nextOffset;
        }
        result[field.name] = arr;
      } else {
        const r = this.readField(view, offset, field.type);
        result[field.name] = r.value;
        offset = r.nextOffset;
      }
    }

    return result as T;
  }

  getSchema(): Schema {
    return this[SCHEMA];
  }

  private writeField(view: DataView, offset: number, type: FieldType, val: unknown): number {
    switch (type) {
      case 'int8':
        view.setInt8(offset, val as number);
        return offset + 1;
      case 'uint8':
        view.setUint8(offset, val as number);
        return offset + 1;
      case 'bool':
        view.setUint8(offset, val ? 1 : 0);
        return offset + 1;
      case 'int16':
        view.setInt16(offset, val as number, true);
        return offset + 2;
      case 'uint16':
        view.setUint16(offset, val as number, true);
        return offset + 2;
      case 'int32':
        view.setInt32(offset, val as number, true);
        return offset + 4;
      case 'uint32':
        view.setUint32(offset, val as number, true);
        return offset + 4;
      case 'float32':
        view.setFloat32(offset, val as number, true);
        return offset + 4;
      case 'int64':
        view.setBigInt64(offset, BigInt(val as number), true);
        return offset + 8;
      case 'uint64':
        view.setBigUint64(offset, BigInt(val as number), true);
        return offset + 8;
      case 'float64':
        view.setFloat64(offset, val as number, true);
        return offset + 8;
      case 'string': {
        const str = String(val ?? '');
        view.setUint16(offset, str.length, true);
        offset += 2;
        for (let i = 0; i < str.length; i++) {
          view.setUint8(offset + i, str.charCodeAt(i));
        }
        return offset + str.length;
      }
      default:
        return offset;
    }
  }

  private readField(
    view: DataView,
    offset: number,
    type: FieldType,
  ): { value: unknown; nextOffset: number } {
    switch (type) {
      case 'int8':
        return { value: view.getInt8(offset), nextOffset: offset + 1 };
      case 'uint8':
        return { value: view.getUint8(offset), nextOffset: offset + 1 };
      case 'bool':
        return { value: view.getUint8(offset) === 1, nextOffset: offset + 1 };
      case 'int16':
        return { value: view.getInt16(offset, true), nextOffset: offset + 2 };
      case 'uint16':
        return { value: view.getUint16(offset, true), nextOffset: offset + 2 };
      case 'int32':
        return { value: view.getInt32(offset, true), nextOffset: offset + 4 };
      case 'uint32':
        return { value: view.getUint32(offset, true), nextOffset: offset + 4 };
      case 'float32':
        return { value: view.getFloat32(offset, true), nextOffset: offset + 4 };
      case 'int64':
        return { value: view.getBigInt64(offset, true), nextOffset: offset + 8 };
      case 'uint64':
        return { value: view.getBigUint64(offset, true), nextOffset: offset + 8 };
      case 'float64':
        return { value: view.getFloat64(offset, true), nextOffset: offset + 8 };
      case 'string': {
        const length = view.getUint16(offset, true);
        offset += 2;
        let str = '';
        for (let i = 0; i < length; i++) {
          str += String.fromCharCode(view.getUint8(offset + i));
        }
        return { value: str, nextOffset: offset + length };
      }
      default:
        return { value: null, nextOffset: offset };
    }
  }
}
