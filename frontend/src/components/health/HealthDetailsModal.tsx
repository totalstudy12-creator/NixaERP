import { ReactNode } from 'react';
import { Modal } from '../Modal';

interface HealthDetailsModalProps {
  isOpen: boolean;
  title: string;
  description?: string;
  children: ReactNode;
  onClose: () => void;
}

export function HealthDetailsModal({ isOpen, title, description, children, onClose }: HealthDetailsModalProps) {
  return (
    <Modal isOpen={isOpen} title={title} onClose={onClose}>
      <div className="space-y-4">
        {description && <p className="text-sm text-slate-500">{description}</p>}
        <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">{children}</div>
      </div>
    </Modal>
  );
}
