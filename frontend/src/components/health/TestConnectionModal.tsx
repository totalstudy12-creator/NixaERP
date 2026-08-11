import { Modal } from '../Modal';

interface TestConnectionModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  onClose: () => void;
}

export function TestConnectionModal({ isOpen, title, message, onClose }: TestConnectionModalProps) {
  return (
    <Modal isOpen={isOpen} title={title} onClose={onClose} submitText="Close">
      <div className="space-y-4">
        <p className="text-sm text-slate-500">{message}</p>
      </div>
    </Modal>
  );
}
