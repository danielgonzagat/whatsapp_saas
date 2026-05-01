#!/usr/bin/env node

import { validate } from './obsidian-mirror-daemon.mjs';

const ok = validate();
process.exit(ok ? 0 : 1);
