/** Generic tool result shape. */
export interface ToolResult {
  success: boolean;
  message?: string;
  error?: string;
  [key: string]: unknown;
}

export interface ToolListLeadsArgs {
  limit?: number;
  status?: string;
  query?: string;
}

export interface ToolGetLeadDetailsArgs {
  phone?: string;
  leadId?: string;
}

export interface ToolSaveBusinessInfoArgs {
  businessName?: string;
  description?: string;
  segment?: string;
}

export interface ToolSetBusinessHoursArgs {
  weekdayStart?: string;
  weekdayEnd?: string;
  saturdayStart?: string;
  saturdayEnd?: string;
  workOnSunday?: boolean;
}

export interface ToolCreateCampaignArgs {
  name: string;
  message: string;
  targetAudience?: string;
}

export interface ToolUpdateBillingInfoArgs {
  returnUrl?: string;
}

export interface ToolChangePlanArgs {
  newPlan: string;
  immediate?: boolean;
}
