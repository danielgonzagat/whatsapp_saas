export type FieldType =
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

export interface FieldSchema {
  name: string;
  type: FieldType;
  array?: boolean;
  length?: number;
}

export interface Schema {
  fields: FieldSchema[];
}
