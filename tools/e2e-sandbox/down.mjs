#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const COMPOSE = join(__dirname, 'docker-compose.yml');

const child = spawn('docker', ['compose', '-f', COMPOSE, 'down', '-v'], { stdio: 'inherit' });
child.on('exit', (code) => process.exit(code || 0));
