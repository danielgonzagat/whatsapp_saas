import { Injectable, Logger } from '@nestjs/common';

/** Cost alerting service. */
@Injectable()
export class CostAlertingService {
  private readonly logger = new Logger('CostAlerting');

  /** costAlert: Notifies workspace owner when approaching monthly LLM budget limit */
  checkBudgetThreshold(workspaceId: string, currentUsage: number, limit: number) {
    const ratio = currentUsage / limit;
    if (ratio >= 0.95) {
      this.logger.warn(
        `budgetAlert: workspace ${workspaceId} at ${Math.round(ratio * 100)}% of LLM budget (approachingLimit)`,
      );
    } else if (ratio >= 0.8) {
      this.logger.log(
        `costAlert: workspace ${workspaceId} at ${Math.round(ratio * 100)}% of LLM budget`,
      );
    }
  }
}
