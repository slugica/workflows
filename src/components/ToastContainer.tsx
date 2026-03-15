'use client';

import { useFlowStore } from '@/store/flowStore';
import { X } from 'lucide-react';

export function ToastContainer() {
  const toasts = useFlowStore((s) => s.toasts);
  const removeToast = useFlowStore((s) => s.removeToast);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[9999] flex flex-col gap-2 pointer-events-none">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className="pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-2xl shadow-lg backdrop-blur-md animate-in slide-in-from-top-2 fade-in duration-300"
          style={{
            backgroundColor: toast.type === 'error' ? 'rgba(220, 38, 38, 0.15)' : 'rgba(39, 39, 42, 0.9)',
            border: `1px solid ${toast.type === 'error' ? 'rgba(220, 38, 38, 0.3)' : 'rgba(63, 63, 70, 0.5)'}`,
          }}
        >
          {toast.type === 'error' && (
            <span className="w-5 h-5 rounded-full bg-red-500/20 flex items-center justify-center flex-shrink-0">
              <span className="text-red-400 text-xs font-bold">!</span>
            </span>
          )}
          <span className="text-sm text-white max-w-[400px]">{toast.message}</span>
          <button
            className="text-zinc-400 hover:text-white transition-colors flex-shrink-0"
            onClick={() => removeToast(toast.id)}
          >
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}
