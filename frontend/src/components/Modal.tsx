import { FiX } from 'react-icons/fi';

interface ModalProps {
  isOpen: boolean;
  title: string;
  children: React.ReactNode;
  onClose: () => void;
  onSubmit?: () => void;
  submitText?: string;
  loading?: boolean;
}

export function Modal({
  isOpen,
  title,
  children,
  onClose,
  onSubmit,
  submitText = 'Save',
  loading = false,
}: ModalProps) {
  return (
    <div className={`modal ${isOpen ? 'modal-open' : ''}`}>
      <div className="modal-box w-11/12 max-w-2xl">
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-bold text-lg">{title}</h3>
          <button
            onClick={onClose}
            className="btn btn-sm btn-circle btn-ghost"
          >
            <FiX size={20} />
          </button>
        </div>
        
        <div className="py-4">
          {children}
        </div>
        
        <div className="modal-action">
          <button onClick={onClose} className="btn btn-ghost">
            Cancel
          </button>
          {onSubmit && (
            <button
              onClick={onSubmit}
              disabled={loading}
              className="btn btn-primary"
            >
              {loading ? 'Saving...' : submitText}
            </button>
          )}
        </div>
      </div>
      <div className="modal-backdrop" onClick={onClose}></div>
    </div>
  );
}
