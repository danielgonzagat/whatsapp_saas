import { describe, expect, it } from "vitest";
import { mapUnifiedActionsToAutopilot } from "../providers/unified-agent-integrator";

describe("unified-agent-integrator", () => {
  it("does not mark non-sending tools as already executed", () => {
    const decision = mapUnifiedActionsToAutopilot([
      {
        tool: "update_lead_status",
        args: { status: "qualified" },
      },
    ]);

    expect(decision.alreadyExecuted).toBe(false);
    expect(decision.action).toBe("FOLLOW_UP");
  });

  it("marks sending tools as already executed", () => {
    const decision = mapUnifiedActionsToAutopilot([
      {
        tool: "send_product_info",
        args: { productName: "PDRN" },
      },
    ]);

    expect(decision.alreadyExecuted).toBe(true);
    expect(decision.action).toBe("SEND_OFFER");
  });
});
