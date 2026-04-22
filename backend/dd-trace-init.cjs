if (!globalThis.__kloelDatadogInitialized) {
  require('dd-trace').init({
    logInjection: true,
  });
  globalThis.__kloelDatadogInitialized = true;
}
