import { createContext, useContext, useMemo, useState, ReactNode } from 'react';
import { FiCheckCircle, FiInfo, FiAlertTriangle, FiX } from 'react-icons/fi';

type NotificationType = 'success' | 'error' | 'info';

export interface NotificationData {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
}

interface NotificationContextValue {
  showSuccess: (title: string, message: string) => void;
  showError: (title: string, message: string) => void;
  showInfo: (title: string, message: string) => void;
}

const NotificationContext = createContext<NotificationContextValue | null>(null);

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [notifications, setNotifications] = useState<NotificationData[]>([]);

  const removeNotification = (id: string) => {
    setNotifications((current) => current.filter((notification) => notification.id !== id));
  };

  const createNotification = (type: NotificationType, title: string, message: string) => {
    const id = typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

    const notification = { id, type, title, message };
    setNotifications((current) => [notification, ...current]);

    window.setTimeout(() => removeNotification(id), 5000);
  };

  const value = useMemo(
    () => ({
      showSuccess: (title: string, message: string) => createNotification('success', title, message),
      showError: (title: string, message: string) => createNotification('error', title, message),
      showInfo: (title: string, message: string) => createNotification('info', title, message),
    }),
    []
  );

  return (
    <NotificationContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed bottom-5 right-5 z-50 flex w-full max-w-sm flex-col gap-3 px-4 sm:px-0">
        {notifications.map((notification) => (
          <div
            key={notification.id}
            className={`pointer-events-auto overflow-hidden rounded-3xl border px-4 py-4 shadow-xl transition transform duration-200 ${
              notification.type === 'success'
                ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                : notification.type === 'error'
                ? 'border-rose-200 bg-rose-50 text-rose-800'
                : 'border-sky-200 bg-sky-50 text-sky-800'
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="mt-0.5 text-lg">
                  {notification.type === 'success' ? <FiCheckCircle /> : notification.type === 'error' ? <FiAlertTriangle /> : <FiInfo />}
                </span>
                <div>
                  <p className="font-semibold">{notification.title}</p>
                  <p className="mt-1 text-sm leading-5">{notification.message}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => removeNotification(notification.id)}
                className="rounded-full p-1 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
              >
                <FiX className="h-4 w-4" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </NotificationContext.Provider>
  );
}

export function useNotification() {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotification must be used within NotificationProvider');
  }
  return context;
}
