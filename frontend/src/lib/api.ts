// Shim: re-exports everything from the modular api/ directory.
// All existing imports like `import { X } from '@/lib/api'` continue to work.
// biome-ignore lint/performance/noBarrelFile: intended API surface shim; Next.js/Turbopack tree-shake named re-exports
export * from './api/index';
// biome-ignore lint/performance/noBarrelFile: intended API surface shim; Next.js/Turbopack tree-shake named re-exports
export { default } from './api/index';
