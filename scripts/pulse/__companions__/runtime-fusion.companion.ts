function syncAffectedAliases(signal: RuntimeSignal): void {
  signal.affectedCapabilityIds = unique(signal.affectedCapabilityIds);
  signal.affectedFlowIds = unique(signal.affectedFlowIds);
  signal.affectedCapabilities = signal.affectedCapabilityIds;
  signal.affectedFlows = signal.affectedFlowIds;
}

