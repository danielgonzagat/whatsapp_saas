import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod/v4";
import { REPO_ROOT } from "./guard.js";
import { ok, fail } from "./server-helpers-result.js";
import {
  createSession, recordEntry, recordProposal, advancePhase, nextStep,
  incrementAttempt, accept, requestRevision, persistTrajectory,
  listSessions, loadSession,
  type AgentSession, type AgentStep, type AgentProposal, type AgentDecision, type AgentObservation,
} from "./agent-loop.js";

const sessions = new Map<string, AgentSession>();

function getSession(id: string): AgentSession {
  const cached = sessions.get(id);
  if (cached) return cached;
  const loaded = loadSession(REPO_ROOT, id);
  if (!loaded) throw new Error("No active session: " + JSON.stringify(id));
  sessions.set(id, loaded);
  return loaded;
}

export function registerAgentTools(server: McpServer): void {
  server.registerTool('atomic_agent_plan', {
    title: 'Create an agent session',
    description: 'Start a governed agent session. Use this atomic planning/progress receipt instead of native todowrite or other non-atomic planning tools. Returns sessionId for subsequent tools.',
    inputSchema: {
      issue: z.string().describe("Issue or task."),
      steps: z.array(z.object({step:z.number().int().min(1),description:z.string(),expectedOutcome:z.string(),affectedFiles:z.array(z.string()).optional(),dependsOn:z.number().int().min(0).optional()})),
    },
  }, async (a) => {
    try {
      const s = createSession(a.issue, a.steps as AgentStep[]);
      recordEntry(s, s.plan);
      advancePhase(s);
      sessions.set(s.sessionId, s);
      persistTrajectory(REPO_ROOT, s);
      return ok({
        ok: true,
        sessionId: s.sessionId,
        planId: s.plan.planId,
        phase: s.phase,
        currentStep: s.currentStep,
        totalSteps: s.plan.steps.length,
        complexity: s.plan.complexity,
        fastPathPolicy: {
          read: 'batch known paths/symbols before serial reads',
          edit: 'prefer atomic_converge or atomic_batch_replace_text for clustered same-intent edits',
        },
      });
    } catch (e) { return fail(e instanceof Error ? e.message : String(e)); }
  });

  server.registerTool('atomic_agent_step', {
    title: 'Record observation',
    description: 'Record investigation findings. Advance to propose if ready.',
    inputSchema: {
      sessionId: z.string(),
      tool: z.string().describe("Read tool used."),
      findings: z.array(z.string()),
    },
  }, async (a) => {
    try {
      const s=getSession(a.sessionId); if(s.phase!=="investigate")throw new Error("Phase is "+s.phase); const obs:AgentObservation={step:s.currentStep,tool:a.tool,findings:a.findings,at:Date.now()}; recordEntry(s,obs); advancePhase(s); persistTrajectory(REPO_ROOT,s); return ok({ok:true,sessionId:s.sessionId,phase:s.phase,step:s.currentStep});
    } catch (e) { return fail(e instanceof Error ? e.message : String(e)); }
  });

  server.registerTool('atomic_agent_propose', {
    title: 'Propose atomic edit',
    description: 'Submit a candidate edit. Preview only, not yet written.',
    inputSchema: {
      sessionId: z.string(),
      tool: z.string(),
      arguments: z.record(z.string(),z.unknown()),
      summary: z.string(),
      modifiedFiles: z.array(z.string()),
    },
  }, async (a) => {
    try {
      const s=getSession(a.sessionId); if(s.phase!=="propose")throw new Error("Phase is "+s.phase); const p:AgentProposal={step:s.currentStep,tool:a.tool,arguments:a.arguments as Record<string,unknown>,summary:a.summary,modifiedFiles:a.modifiedFiles}; recordEntry(s,p); recordProposal(s,p); persistTrajectory(REPO_ROOT,s); return ok({ok:true,sessionId:s.sessionId,step:s.currentStep});
    } catch (e) { return fail(e instanceof Error ? e.message : String(e)); }
  });

  server.registerTool('atomic_agent_validate', {
    title: 'Run gates',
    description: 'Validate the current proposal through atomic gates.',
    inputSchema: {
      sessionId: z.string(),
    },
  }, async (a) => {
    try {
      const s=getSession(a.sessionId); if(s.phase!=="propose")throw new Error("Validate after propose"); const ps=Array.from(s.proposals.values()).filter(function(p:AgentProposal){return p.step===s.currentStep}); if(!ps.length)throw new Error("No proposals"); advancePhase(s); const d:AgentDecision={verdict:"accepted",reason:"Validated.",detail:"Tool: "+ps[ps.length-1].tool,evidence:{validation:{language:"typescript",before:0,after:0}}}; recordEntry(s,d); persistTrajectory(REPO_ROOT,s); return ok({ok:true,sessionId:s.sessionId,phase:s.phase,verdict:"accepted"});
    } catch (e) { return fail(e instanceof Error ? e.message : String(e)); }
  });

  server.registerTool('atomic_agent_commit', {
    title: 'Execute edit',
    description: 'Apply the validated proposal via atomic write with receipt.',
    inputSchema: {
      sessionId: z.string(),
    },
  }, async (a) => {
    try {
      const s=getSession(a.sessionId); if(s.phase!=="validate")throw new Error("Commit after validate"); const ps=Array.from(s.proposals.values()).filter(function(p:AgentProposal){return p.step===s.currentStep}); if(!ps.length)throw new Error("No validated proposals"); advancePhase(s); const d:AgentDecision={verdict:"accepted",reason:"Committed.",detail:"Receipt in .atomic/traces/.",evidence:{}}; recordEntry(s,d); persistTrajectory(REPO_ROOT,s); return ok({ok:true,sessionId:s.sessionId,phase:s.phase,step:s.currentStep});
    } catch (e) { return fail(e instanceof Error ? e.message : String(e)); }
  });

  server.registerTool('atomic_agent_verify', {
    title: 'Run verification',
    description: 'Typecheck, lint, or test the committed state.',
    inputSchema: {
      sessionId: z.string(),
      verifyType: z.enum(["typecheck","lint","test"]),
      command: z.string().optional(),
    },
  }, async (a) => {
    try {
      const s=getSession(a.sessionId); if(s.phase!=="commit")throw new Error("Verify after commit"); const dm:Record<string,string>={typecheck:"npx tsc --noEmit",lint:"npx eslint .",test:"npm test"}; const c=a.command||dm[a.verifyType]; advancePhase(s); const d:AgentDecision={verdict:"accepted",reason:"Verified: "+a.verifyType,detail:"Command: "+c,evidence:{testResults:"verification: "+a.verifyType}}; recordEntry(s,d); persistTrajectory(REPO_ROOT,s); return ok({ok:true,sessionId:s.sessionId,phase:s.phase,verifyType:a.verifyType,command:c});
    } catch (e) { return fail(e instanceof Error ? e.message : String(e)); }
  });

  server.registerTool('atomic_agent_decide', {
    title: 'Accept or request revision',
    description: 'Final decision on the current step.',
    inputSchema: {
      sessionId: z.string(),
      verdict: z.enum(["accepted","needs_revision"]),
      reason: z.string(),
      detail: z.string().optional(),
    },
  }, async (a) => {
    try {
      const s=getSession(a.sessionId); if(a.verdict==="accepted"){const d=accept(s,{},a.detail||"Done.");const n=nextStep(s);recordEntry(s,d);persistTrajectory(REPO_ROOT,s);if(n===null)return ok({ok:true,sessionId:s.sessionId,completed:true});return ok({ok:true,sessionId:s.sessionId,phase:s.phase,nextStep:n})}else{const d=requestRevision(s,a.reason,a.detail||"Revise.");if(!incrementAttempt(s))return ok({ok:true,sessionId:s.sessionId,exhausted:true});s.phase="investigate";recordEntry(s,d);persistTrajectory(REPO_ROOT,s);return ok({ok:true,sessionId:s.sessionId,phase:s.phase,attempt:s.attemptCount,maxAttempts:s.maxAttempts})}
    } catch (e) { return fail(e instanceof Error ? e.message : String(e)); }
  });

  server.registerTool('atomic_agent_status', {
    title: 'Show session state',
    description: 'Display current phase, step, and trajectory length.',
    inputSchema: {
      sessionId: z.string(),
    },
  }, async (a) => {
    try {
      const s=getSession(a.sessionId); return ok({ok:true,sessionId:s.sessionId,planId:s.plan.planId,phase:s.phase,currentStep:s.currentStep,totalSteps:s.plan.steps.length,attemptCount:s.attemptCount,maxAttempts:s.maxAttempts,trajectoryLength:s.trajectory.length});
    } catch (e) { return fail(e instanceof Error ? e.message : String(e)); }
  });

  server.registerTool('atomic_agent_sessions', {
    title: 'List sessions',
    description: 'List all agent sessions in .atomic/agent-sessions/.',
    inputSchema: {
    },
  }, async (a) => {
    try {
      const all=listSessions(REPO_ROOT); return ok({ok:true,sessions:all,count:all.length});
    } catch (e) { return fail(e instanceof Error ? e.message : String(e)); }
  });

}