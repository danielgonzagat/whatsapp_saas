// Load helpers and shared types for PlanAIConfigTab

export type StringSetter = (value: string) => void;
export type NumberSetter = (value: number) => void;
export type BooleanSetter = (value: boolean) => void;
export type StringArraySetter = (value: string[]) => void;
export type RecordStringSetter = (value: Record<string, string>) => void;

export function assignString(data: Record<string, unknown>, key: string, setter: StringSetter) {
  if (typeof data[key] === 'string') {
    setter(data[key] as string);
  }
}

export function assignNumber(data: Record<string, unknown>, key: string, setter: NumberSetter) {
  if (typeof data[key] === 'number') {
    setter(data[key] as number);
  }
}

export function assignBoolean(data: Record<string, unknown>, key: string, setter: BooleanSetter) {
  if (typeof data[key] === 'boolean') {
    setter(data[key] as boolean);
  }
}

export function assignStringArray(
  data: Record<string, unknown>,
  key: string,
  setter: StringArraySetter,
) {
  if (Array.isArray(data[key])) {
    setter(data[key] as string[]);
  }
}

export function assignRecordString(
  data: Record<string, unknown>,
  key: string,
  setter: RecordStringSetter,
) {
  const value = data[key];
  if (value && typeof value === 'object') {
    setter(value as Record<string, string>);
  }
}
