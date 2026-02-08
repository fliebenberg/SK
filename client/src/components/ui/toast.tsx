"use client";

import { useToast, Toast as ToastType, dismissToast } from "@/hooks/use-toast";
import { X, CheckCircle2, AlertCircle, Info, AlertTriangle, Shield } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

export function Toaster() {
  const { toasts } = useToast();

  return (
    <div className="fixed bottom-8 right-8 z-[100] flex flex-col gap-3 w-full max-w-[400px]">
      <AnimatePresence mode="popLayout">
        {toasts.map((toast) => (
          <ToastItem key={toast.id} toast={toast} />
        ))}
      </AnimatePresence>
    </div>
  );
}

function ToastItem({ toast }: { toast: ToastType }) {
  const icons = {
    default: <Info className="h-5 w-5 text-blue-500" />,
    success: <Shield className="h-5 w-5 text-green-500" />,
    destructive: <Shield className="h-5 w-5 text-destructive" />,
    warning: <AlertTriangle className="h-5 w-5 text-yellow-500" />,
  };

  const variants = {
    default: "border-blue-500/20 bg-blue-500/5 text-blue-500",
    success: "border-green-500/20 bg-green-500/10 text-green-500",
    destructive: "border-destructive/20 bg-destructive/10 text-destructive",
    warning: "border-yellow-500/20 bg-yellow-500/5 text-yellow-600",
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: 50, scale: 0.9 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: 20, scale: 0.95 }}
      transition={{ type: "spring", stiffness: 400, damping: 30 }}
      className={cn(
        "group relative flex w-full items-center gap-3 rounded-2xl border-2 p-4 shadow-[0_20px_50px_-12px_rgba(0,0,0,0.5)] backdrop-blur-md transition-all",
        variants[toast.variant || "default"]
      )}
    >
      <div className="flex-shrink-0">{icons[toast.variant || "default"]}</div>
      <div className="flex-1 min-w-0">
        {toast.title && (
          <p className="text-sm font-bold leading-none tracking-tight">
            {toast.title}
          </p>
        )}
        {toast.description && (
          <p className="text-sm font-bold tracking-tight leading-relaxed">
            {toast.description}
          </p>
        )}
      </div>
      <button
        onClick={() => dismissToast(toast.id)}
        className="absolute top-2 right-2 rounded-md p-1 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-black/5 dark:hover:bg-white/5"
      >
        <X className="h-4 w-4 opacity-50" />
      </button>
    </motion.div>
  );
}
