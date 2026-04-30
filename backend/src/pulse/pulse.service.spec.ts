import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  createService,
  expectNthBackgroundTaskCall,
  flushMicrotasks,
  getInternalAsyncMethod,
  getInternalTaskRunner,
  setInternalValue,
  spyOnRunBackgroundTask,
} from '../../test/pulse/pulse.service-test-helpers';

function buildExpectedIntervalHandlerError() {
  const error = new Error();
  error.message = 'Expected callback interval handler';
  return error;
}
import "../../../scripts/pulse/__companions__/pulse.service.spec.companion";
