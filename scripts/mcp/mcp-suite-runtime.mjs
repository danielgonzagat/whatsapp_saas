import { createChildRuntime } from './mcp-suite-child-runtime.mjs';
import { createCommandRuntime } from './mcp-suite-command-runtime.mjs';
import { createPostgresRuntime } from './mcp-suite-postgres-runtime.mjs';
import { createTaskRuntime } from './mcp-suite-task-runtime.mjs';

export function createSuiteRuntime({ root, protoVersion, maxOutput }) {
  const commandRuntime = createCommandRuntime({ root, maxOutput });
  const taskRuntime = createTaskRuntime({ root });
  const postgresRuntime = createPostgresRuntime({
    root,
    runCommand: commandRuntime.runCommand,
    commandExists: commandRuntime.commandExists,
  });
  const childRuntime = createChildRuntime({
    root,
    protoVersion,
    commandExists: commandRuntime.commandExists,
  });

  return {
    ...commandRuntime,
    ...taskRuntime,
    ...postgresRuntime,
    ...childRuntime,
  };
}
