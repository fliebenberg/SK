"use client";

import { useState, useEffect } from "react";

export type ToastVariant = "default" | "success" | "destructive" | "warning";

export interface Toast {
  id: string;
  title?: string;
  description?: string;
  variant?: ToastVariant;
  duration?: number;
}

type ToastListener = (toasts: Toast[]) => void;

let toasts: Toast[] = [];
let listeners: ToastListener[] = [];

const notifyListeners = () => {
  listeners.forEach((listener) => listener([...toasts]));
};

export const toast = ({ title, description, variant = "default", duration = 5000 }: Omit<Toast, "id">) => {
  const id = Math.random().toString(36).substring(2, 9);
  const newToast: Toast = { id, title, description, variant, duration };
  toasts = [newToast, ...toasts].slice(0, 5); // Keep last 5
  notifyListeners();

  if (duration !== Infinity) {
    setTimeout(() => {
      dismissToast(id);
    }, duration);
  }

  return id;
};

export const dismissToast = (id: string) => {
  toasts = toasts.filter((t) => t.id !== id);
  notifyListeners();
};

export function useToast() {
  const [state, setState] = useState<Toast[]>(toasts);

  useEffect(() => {
    const listener = (newToasts: Toast[]) => {
      setState(newToasts);
    };
    listeners.push(listener);
    return () => {
      listeners = listeners.filter((l) => l !== listener);
    };
  }, []);

  return {
    toasts: state,
    toast,
    dismiss: dismissToast,
  };
}
