// Shim: re-exports everything from the modular api/ directory.
// All existing imports like `import { X } from '@/lib/api'` continue to work.
export * from './api/index';
export { default } from './api/index';
