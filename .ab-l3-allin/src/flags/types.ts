export type FeatureFlag = {
  name: string;
  enabled: boolean;
  rules: FlagRule[];
};

export type FlagRule = {
  type: 'boolean' | 'percentage' | 'user_target' | 'time_window';
  config: {
    value?: boolean;
    percentage?: number;
    userIds?: string[];
    attributes?: Record<string, unknown>;
    startHour?: number;
    endHour?: number;
  };
};

export type FlagContext = {
  userId?: string;
  attributes?: Record<string, unknown>;
  currentHour?: number;
};
