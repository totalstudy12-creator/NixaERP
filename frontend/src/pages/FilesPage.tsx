// src/pages/FilesPage.tsx
import { ModernDataTable } from '../components/ModernDataTable';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FiAlertCircle,
  FiDownload,
  FiFile,
  FiFileText,
  FiImage,
  FiLock,
  FiRefreshCw,
  FiTrash2,
  FiUpload,
  FiX,
} from 'react-icons/fi';
import { apiClient } from '../api';
import { useNotification } from '../components/NotificationContext';
import { usePermission } from '../hooks/usePermission';
import { useAuthStore } from '../store/auth';

/* ------------------------------------------------------------------ */
/* Types                                                              */
/* ------------------------------------------------------------------ */

interface UploadedFile {
  id?: number | string;
  name: string;
  size?: number;
  url?: string;
  mime_type?: string;
  type?: string;
  created_at?: string;
  uploaded_by?: string;
  [key: string]: unknown;
}

interface ApiErrorLike {
  message?: string;
  status?: number;
  response?: { status?: number; data?: { message?: string } };
}

/* ------------------------------------------------------------------ */
/* Constants                                                          */
/* ------------------------------------------------------------------ */

const MAX_FILE_BYTES = 25 * 1024 * 1024; // 25 MB guard rail

const ALLOWED_MIME_HINTS = [
  'image/',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument',
  'application/vnd.ms-excel',
  'text/',
  'application/zip',
];

/* ------------------------------------------------------------------ */
/* Safe helpers                                                       */
/* ------------------------------------------------------------------ */

function getApiErrorMessage(error: unknown, fallback = 'Something went wrong.'): string {
  const err = error as ApiErrorLike;
  const status = err?.response?.status ?? err?.status;
  const message = err?.response?.data?.message ?? err?.message;

  if (status === 401) return 'Your session has expired. Please sign in again.';
  if (status === 403) return 'You do not have permission to perform this action.';
  if (status === 404) return 'The requested file was not found.';
  if (status === 413) return 'File is too large. Please upload a smaller file.';
  if (status === 415) return 'This file type is not supported.';
  if (status === 422) return message || 'Please check the submitted file.';
  if (status != null && status >= 500) return 'Server error. Please try again later.';

  return message || fallback;
}

function formatBytes(bytes?: number): string {
  if (bytes == null || !Number.isFinite(bytes)) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatDate(value?: string | null): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(d);
}

function unwrapList<T>(payload: unknown): T[] {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload as T[];
  const p = payload as { data?: unknown };
  if (Array.isArray(p.data)) return p.data as T[];
  if (p.data && typeof p.data === 'object' && Array.isArray((p.data as any).data)) {
    return (p.data as any).data as T[];
  }
  return [];
}

function isAllowedFile(file: File): boolean {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  const safeExt = [
    'csv', 'pdf', 'doc', 'docx', 'xls', 'xlsx',
    'png', 'jpg', 'jpeg', 'gif', 'webp', 'txt', 'zip',
  ];
  if (safeExt.includes(ext)) return true;
  return ALLOWED_MIME_HINTS.some((hint) => file.type.startsWith(hint));
}

function pickFileIcon(name?: string) {
  const ext = String(name ?? '').split('.').pop()?.toLowerCase() ?? '';
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext)) return FiImage;
  if (['pdf', 'doc', 'docx', 'txt'].includes(ext)) return FiFileText;
  return FiFile;
}

/* ------------------------------------------------------------------ */
/* No-access fallback                                                 */
/* ------------------------------------------------------------------ */

function NoAccessCard({
  title = 'Restricted',
  message = 'You do not have permission to view this section.',
}: { title?: string; message?: string }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 p-6">
      <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white text-slate-400 ring-1 ring-slate-200">
        <FiLock size={16} />
      </div>
      <div className="min-w-0">
        <p className="text-xs font-semibold text-slate-700">{title}</p>
        <p className="text-[11px] text-slate-500">{message}</p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Main page                                                          */
/* ------------------------------------------------------------------ */

export function FilesPage() {
  const { showSuccess, showError } = useNotification();
  const { can, isSuperAdmin } = usePermission();
  const loadingUser = useAuthStore((s) => s.loadingUser);
  const hasUser = useAuthStore((s) => Boolean(s.user));

  /* ── RBAC flags ── */
  const canViewFiles     = isSuperAdmin || can('view files') || can('view uploads');
  const canUploadFiles   = isSuperAdmin || can('upload files') || can('create uploads');
  const canDeleteFiles   = isSuperAdmin || can('delete files') || can('delete uploads');
  const canDownloadFiles = isSuperAdmin || can('download files') || can('view files');

  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  /* ── Load ── */
  const load = useCallback(async () => {
    if (!canViewFiles) {
      setFiles([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.getUploads();
      setFiles(unwrapList<UploadedFile>(res));
    } catch (err: unknown) {
      console.error('Error loading files', err);
      setError(getApiErrorMessage(err, 'Failed to load files.'));
    } finally {
      setLoading(false);
    }
  }, [canViewFiles]);

  useEffect(() => {
    void load();
  }, [load]);

  /* ── Upload ── */
  const doUpload = useCallback(
    async (file: File) => {
      if (!canUploadFiles) {
        showError('Permission denied', 'You do not have permission to upload files.');
        return;
      }
      if (file.size > MAX_FILE_BYTES) {
        showError('File too large', `Maximum size is ${formatBytes(MAX_FILE_BYTES)}.`);
        return;
      }
      if (!isAllowedFile(file)) {
        showError('Unsupported file', 'This file type is not allowed.');
        return;
      }

      setUploading(true);
      try {
        const fd = new FormData();
        fd.append('file', file);
        await apiClient.uploadFile(fd);
        showSuccess('Uploaded', `${file.name} uploaded successfully.`);
        await load();
      } catch (err: unknown) {
        showError('Upload failed', getApiErrorMessage(err, 'Upload failed.'));
      } finally {
        setUploading(false);
      }
    },
    [canUploadFiles, load, showSuccess, showError]
  );

  const handleUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      // Always reset input so picking the same file triggers change again
      if (fileInputRef.current) fileInputRef.current.value = '';
      if (!file) return;
      await doUpload(file);
    },
    [doUpload]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setDragOver(false);
      if (!canUploadFiles) {
        showError('Permission denied', 'You do not have permission to upload files.');
        return;
      }
      const file = e.dataTransfer.files?.[0];
      if (file) void doUpload(file);
    },
    [canUploadFiles, doUpload, showError]
  );

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
  }, []);

  /* ── Download ── */
  const handleDownload = useCallback(
    (row: UploadedFile) => {
      if (!canDownloadFiles) {
        showError('Permission denied', 'You do not have permission to download files.');
        return;
      }
      if (!row.url) {
        showError('Missing URL', 'This file has no downloadable URL.');
        return;
      }
      window.open(row.url, '_blank', 'noopener,noreferrer');
    },
    [canDownloadFiles, showError]
  );

  /* ── Delete ── */
  const handleDelete = useCallback(
    async (row: UploadedFile) => {
      if (!canDeleteFiles) {
        showError('Permission denied', 'You do not have permission to delete files.');
        return;
      }
      if (row.id == null) {
        showError('Cannot delete', 'This file has no ID.');
        return;
      }
      if (!window.confirm(`Delete "${row.name}"?`)) return;
      try {
        await apiClient.deleteUpload(String(row.id));
        showSuccess('Deleted', `${row.name} removed.`);
        await load();
      } catch (err: unknown) {
        showError('Delete failed', getApiErrorMessage(err, 'Delete failed.'));
      }
    },
    [canDeleteFiles, load, showSuccess, showError]
  );

  /* ── Columns ── */
  const columns = useMemo(
    () => [
      {
        name: 'File',
        selector: (r: UploadedFile) => r.name,
        cell: (r: UploadedFile) => {
          const Icon = pickFileIcon(r.name);
          return (
            <div className="flex min-w-[220px] items-center gap-2.5">
              <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-600">
                <Icon size={16} />
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-slate-900">{r.name || '—'}</p>
                {r.uploaded_by && (
                  <p className="truncate text-[11px] text-slate-500">by {r.uploaded_by}</p>
                )}
              </div>
            </div>
          );
        },
      },
      {
        name: 'Size',
        selector: (r: UploadedFile) => r.size ?? 0,
        cell: (r: UploadedFile) => (
          <span className="text-sm tabular-nums text-slate-700">{formatBytes(r.size)}</span>
        ),
      },
      {
        name: 'Uploaded',
        selector: (r: UploadedFile) => r.created_at ?? '',
        cell: (r: UploadedFile) => (
          <span className="text-sm text-slate-600">{formatDate(r.created_at)}</span>
        ),
      },
      {
        name: 'URL',
        selector: (r: UploadedFile) => r.url ?? '',
        cell: (r: UploadedFile) =>
          r.url ? (
            canDownloadFiles ? (
              <a
                href={r.url}
                target="_blank"
                rel="noreferrer noopener"
                onClick={(e) => e.stopPropagation()}
                className="max-w-[220px] truncate text-xs text-indigo-600 underline-offset-2 hover:underline"
                title={r.url}
              >
                {r.url}
              </a>
            ) : (
              <span className="max-w-[220px] truncate text-xs text-slate-400" title={r.url}>
                {r.url}
              </span>
            )
          ) : (
            <span className="text-sm text-slate-400">—</span>
          ),
      },
      {
        name: 'Actions',
        cell: (r: UploadedFile) => {
          if (!canDownloadFiles && !canDeleteFiles) {
            return <span className="text-xs text-slate-400">—</span>;
          }
          return (
            <div
              className="flex items-center justify-end gap-1"
              onClick={(e) => e.stopPropagation()}
            >
              {canDownloadFiles && (
                <button
                  type="button"
                  onClick={() => handleDownload(r)}
                  className="grid h-8 w-8 place-items-center rounded-lg text-indigo-500 transition hover:bg-indigo-50 hover:text-indigo-700"
                  title="Download"
                >
                  <FiDownload size={15} />
                </button>
              )}
              {canDeleteFiles && (
                <button
                  type="button"
                  onClick={() => handleDelete(r)}
                  className="grid h-8 w-8 place-items-center rounded-lg text-red-500 transition hover:bg-red-50 hover:text-red-700"
                  title="Delete"
                >
                  <FiTrash2 size={15} />
                </button>
              )}
            </div>
          );
        },
      },
    ],
    [canDownloadFiles, canDeleteFiles, handleDownload, handleDelete]
  );

  /* ── Filtering ── */
  const filteredFiles = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return files;
    return files.filter((f) => String(f.name ?? '').toLowerCase().includes(term));
  }, [files, searchTerm]);

  /* ------------------------------------------------------------------ */
  /* Loading guard                                                       */
  /* ------------------------------------------------------------------ */

  if (loadingUser && !hasUser) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="rounded-2xl bg-white px-6 py-5 text-sm text-slate-600 shadow-sm">
          Loading permissions…
        </div>
      </div>
    );
  }

  /* ------------------------------------------------------------------ */
  /* No-access panel                                                     */
  /* ------------------------------------------------------------------ */

  if (!canViewFiles) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
        <div className="w-full max-w-md rounded-2xl border border-rose-200 bg-white p-8 text-center shadow-sm">
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-rose-50 text-rose-600">
            <FiLock size={22} />
          </div>
          <h2 className="mt-4 text-lg font-bold text-slate-900">Access denied</h2>
          <p className="mt-1.5 text-sm text-slate-500">
            You don't have permission to view file management.
          </p>
        </div>
      </div>
    );
  }

  /* ------------------------------------------------------------------ */
  /* Render                                                              */
  /* ------------------------------------------------------------------ */

  return (
    <>
      <style>{`
        .files-dropzone {
          transition: border-color .15s ease, background-color .15s ease;
        }
      `}</style>

      <div className="p-4 sm:p-6 lg:p-8 bg-gray-50 min-h-screen">
        <div className="mx-auto max-w-[1400px] space-y-5">
          {/* Hero */}
          <section className="relative overflow-hidden rounded-2xl border border-slate-800/10 bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 px-5 py-6 shadow-[0_20px_40px_-20px_rgba(15,23,42,0.45)] sm:px-7 lg:px-8">
            <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-indigo-500/20 blur-3xl" />
            <div className="pointer-events-none absolute -bottom-24 right-24 h-56 w-56 rounded-full bg-cyan-500/10 blur-3xl" />

            <div className="relative flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
              <div className="min-w-0">
                <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-200 backdrop-blur">
                  <FiFile size={12} /> Resources · Files
                </div>
                <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl lg:text-[32px]">
                  File Management
                </h1>
                <p className="mt-1.5 max-w-2xl text-sm text-slate-300">
                  Upload and manage project files and documents.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => void load()}
                  disabled={loading}
                  className="inline-flex h-10 items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 text-sm font-semibold text-white backdrop-blur transition hover:border-white/20 hover:bg-white/10 disabled:opacity-60"
                >
                  <FiRefreshCw className={loading ? 'animate-spin' : ''} size={14} />
                  Refresh
                </button>
                {canUploadFiles && (
                  <>
                    <input
                      ref={fileInputRef}
                      type="file"
                      onChange={handleUpload}
                      className="hidden"
                    />
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploading}
                      className="inline-flex h-10 items-center gap-2 rounded-xl bg-gradient-to-b from-cyan-300 to-cyan-400 px-4 text-sm font-semibold text-slate-950 shadow-lg shadow-cyan-500/20 transition hover:from-cyan-200 hover:to-cyan-300 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {uploading ? (
                        <FiRefreshCw className="animate-spin" size={14} />
                      ) : (
                        <FiUpload size={14} />
                      )}
                      {uploading ? 'Uploading…' : 'Upload File'}
                    </button>
                  </>
                )}
              </div>
            </div>
          </section>

          {/* Upload dropzone — only when permitted */}
          {canUploadFiles && (
            <div
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onClick={() => fileInputRef.current?.click()}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  fileInputRef.current?.click();
                }
              }}
              className={`files-dropzone flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed bg-white px-6 py-10 text-center ${
                dragOver
                  ? 'border-indigo-500 bg-indigo-50'
                  : 'border-slate-300 hover:border-indigo-300 hover:bg-indigo-50/30'
              } ${uploading ? 'pointer-events-none opacity-60' : ''}`}
            >
              <div className="grid h-12 w-12 place-items-center rounded-2xl bg-indigo-50 text-indigo-600 ring-1 ring-indigo-500/10">
                <FiUpload size={20} />
              </div>
              <p className="mt-3 text-sm font-semibold text-slate-800">
                Drag & drop a file here, or click to browse
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Max {formatBytes(MAX_FILE_BYTES)} · PDF, images, docs, spreadsheets
              </p>
            </div>
          )}

          {/* Search / count */}
          <div className="flex flex-col gap-3 rounded-2xl border border-slate-200/80 bg-white px-4 py-3 shadow-[0_1px_2px_rgba(15,23,42,0.04)] sm:flex-row sm:items-center sm:justify-between sm:px-5">
            <p className="text-xs text-slate-500">
              {loading
                ? 'Loading files…'
                : `${filteredFiles.length.toLocaleString('en-IN')} file${
                    filteredFiles.length === 1 ? '' : 's'
                  }${searchTerm ? ' matching your search' : ''}`}
            </p>
            <div className="relative w-full sm:w-72">
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search by file name…"
                className="h-9 w-full rounded-xl border border-slate-200 bg-white pl-3 pr-9 text-sm shadow-sm outline-none transition hover:border-slate-300 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10"
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                  aria-label="Clear search"
                >
                  <FiX size={13} />
                </button>
              )}
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              <FiAlertCircle size={16} />
              <span className="flex-1">{error}</span>
              <button
                type="button"
                onClick={() => void load()}
                className="rounded-lg px-2.5 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-100"
              >
                Retry
              </button>
            </div>
          )}

          {/* Table */}
          <ModernDataTable
            title="Files"
            columns={columns}
            data={filteredFiles}
            loading={loading}
          />

          {/* Footer note for read-only users */}
          {!canUploadFiles && !canDeleteFiles && (
            <NoAccessCard
              title="Read-only access"
              message="You can view and download files but cannot upload or delete them."
            />
          )}
        </div>
      </div>
    </>
  );
}

export default FilesPage;