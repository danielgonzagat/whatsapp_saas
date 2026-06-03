declare module 'pg' {
  class Pool {
    constructor(config: Record<string, unknown>);
    query(sql: string, params?: Array<string | number>): Promise<{ rows: Array<Record<string, unknown>> }>;
    end(): Promise<void>;
  }
}
