/**
 * Prints the usage banner for unknown flags and exits the handler.
 */
function printUnknownFlag(flag: string): void {
  logCli(`Unknown flag: ${flag}`);
  writeStdout('Usage: pulse gitnexus [--status|--index|--impact|--report]');
}
