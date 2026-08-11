import { ReactNode } from 'react';

interface OffcanvasProps {
  isOpen: boolean;
  title: string;
  children: ReactNode;
  onClose: () => void;
  footer?: ReactNode;
}

export function Offcanvas({ isOpen, title, children, onClose, footer }: OffcanvasProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="absolute inset-0 bg-slate-950/60 transition-opacity" onClick={onClose} />
      <div className="relative ml-auto flex h-full w-full max-w-md flex-col overflow-hidden bg-white shadow-2xl ring-1 ring-slate-200">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-5">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-slate-500">Create / Edit</p>
            <h2 className="text-xl font-semibold text-slate-900">{title}</h2>
          </div>
          <button
            onClick={onClose}
            className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-slate-200 text-slate-600 transition hover:bg-slate-100"
          >
            ×
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {children}
        </div>
        {footer && (
          <div className="border-t border-slate-200 px-6 py-4 bg-slate-50">{footer}</div>
        )}
      </div>
    </div>
  );
}
