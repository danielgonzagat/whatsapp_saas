type ExpectedCtor =
  | StringConstructor
  | NumberConstructor
  | BooleanConstructor
  | FunctionConstructor
  | ObjectConstructor
  | ArrayConstructor;

export function expectValueOf(ctor: ExpectedCtor) {
  return {
    asymmetricMatch(value: unknown): boolean {
      if (ctor === String) return typeof value === 'string';
      if (ctor === Number) return typeof value === 'number';
      if (ctor === Boolean) return typeof value === 'boolean';
      if (ctor === Function) return typeof value === 'function';
      if (ctor === Array) return Array.isArray(value);
      return typeof value === 'object' && value !== null && !Array.isArray(value);
    },
    toString(): string {
      return `ValueOf${ctor.name}`;
    },
  };
}
