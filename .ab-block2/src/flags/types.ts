export type FeatureFlag = {
  name: string;
  enabled: boolean;
  rules: FlagRule[];
};

export type FlagRule = {
  type: 'boolean' | 'percentage' | 'user_target';
  config: {
    value?: boolean;
    percentage?: number;
    userIds?: string[];
    attributes?: Record<string, unknown>;
  };
};

export type FlagContext = {
  userId?: string;
  attributes?: Record<string, unknown>;
};
