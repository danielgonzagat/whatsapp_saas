'use client';

import { ToastProvider as ToastProviderComponent, useToast as useToastHook } from './Toast';
import type { ToastType as ToastKind } from './Toast';

/** Toast provider. */
export const ToastProvider = ToastProviderComponent;
/** Use toast. */
export const useToast = useToastHook;
/** Toast type type. */
export type ToastType = ToastKind;
