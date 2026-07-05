export type FieldType =
  | 'int8'
  | 'int16'
  | 'int32'
  | 'uint8'
  | 'uint16'
  | 'uint32'
  | 'float32'
  | 'float64'
  | 'string'
  | 'bool'
  | 'int64'
  | 'uint64';

export interface FieldSchema {
  name: string;
  type: FieldType;
  array?: boolean;
  length?: number;
}

export interface Schema {
  fields: FieldSchema[];
}
