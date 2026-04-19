'use client';

import { ToastProvider as ToastProviderComponent, useToast as useToastHook } from './Toast';
import type { ToastType as ToastKind } from './Toast';

export const ToastProvider = ToastProviderComponent;
export const useToast = useToastHook;
export type ToastType = ToastKind;
