// src/pages/MediaLibraryPage.tsx
import { useEffect, useMemo, useState, useCallback, useRef, lazy, Suspense, memo } from 'react';
import {
  FiUpload,
  FiFolderPlus,
  FiCopy,
  FiTrash2,
  FiRefreshCw,
  FiSearch,
  FiImage,
  FiFile,
  FiFileText,
  FiArchive,
  FiX,
  FiAlertCircle,
  FiFilter,
  FiChevronDown,
  FiChevronRight,
  FiGrid,
  FiHardDrive,
  FiLock,
} from 'react-icons/fi';
import clsx from 'clsx';
import { useDropzone } from 'react-dropzone';

// ---------- Lazy loaded heavy components ----------
const ModernDataTable = lazy(() =>
  import('../components/ModernDataTable').then(m => ({ default: m.ModernDataTable }))
);
const Offcanvas = lazy(() =>
  import('../components/Offcanvas').then(m => ({ default: m.Offcanvas }))
);

import { apiClient } from '../api';
import { useNotification } from '../components/NotificationContext';
import { addAppLog } from '../services/appLogger';
import { useAuthStore } from '../store/auth';

/* ------------------------------------------------------------------ */
/* RBAC — Permission keys                                              */
/* ------------------------------------------------------------------ */

const PERMISSIONS = {
  FILES_VIEW: 'files.view',
  FILES_UPLOAD: 'files.upload',
  FILES_DELETE: 'files.delete',
  FILES_DOWNLOAD: 'files.download',
  FILES_CREATE_FOLDER: 'files.create_folder',
  FILES_COPY_URL: 'files.copy_url',
} as const;

type PermissionKey = typeof PERMISSIONS[keyof typeof PERMISSIONS];

/* ------------------------------------------------------------------ */
/* RBAC — Store-backed permissions (admin-aware + notation-insensitive) */
/* ------------------------------------------------------------------ */

/**
 * Collapse a permission key so different notations of the SAME permission
 * match each other:
 *
 *   "files.upload"           → "files upload"
 *   "upload files"           → "files upload"
 *   "files:upload"           → "files upload"
 *   "create upload folder"   → "create folder upload"
 *   "files.create_folder"    → "create files folder"
 */
function normalisePermission(input: string): string {
  return input
    .toLowerCase()
    .replace(/[.:_/\-]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .sort()
    .join(' ');
}

interface UsePagePermissionsResult {
  can: (permission: string | string[]) => boolean;
  isAuthenticated: boolean;
  isSuperAdmin: boolean;
  loadingUser: boolean;
}

function usePagePermissions(): UsePagePermissionsResult {
  const user = useAuthStore((s) => s.user);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const loadingUser = useAuthStore((s) => s.loadingUser);
  const storeIsSuperAdmin = useAuthStore((s) => s.isSuperAdmin);
  const storeHasAnyPermission = useAuthStore((s) => s.hasAnyPermission);

  const isSuperAdmin = useMemo(() => storeIsSuperAdmin(), [storeIsSuperAdmin, user]);

  const can = useCallback(
    (permission: string | string[]): boolean => {
      if (!isAuthenticated) return false;
      if (isSuperAdmin) return true;

      const keys = Array.isArray(permission) ? permission : [permission];

      if (storeHasAnyPermission(keys)) return true;

      const hasMetadata =
        (user?.permission_names?.length ?? 0) > 0 ||
        (user?.permissions?.length ?? 0) > 0 ||
        (user?.roles?.length ?? 0) > 0 ||
        (user?.role_names?.length ?? 0) > 0;
      if (!hasMetadata) return false;

      const normalised = new Set<string>();
      (user?.permission_names ?? []).forEach((p) =>
        normalised.add(normalisePermission(p)),
      );
      (user?.permissions ?? []).forEach((p) =>
        normalised.add(normalisePermission(p.name)),
      );

      return keys.some((k) => normalised.has(normalisePermission(k)));
    },
    [isAuthenticated, isSuperAdmin, storeHasAnyPermission, user],
  );

  return { can, isAuthenticated, isSuperAdmin, loadingUser };
}

/* ------------------------------------------------------------------ */
/* Access-restricted screen                                            */
/* ------------------------------------------------------------------ */

function AccessRestricted() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f5f7fb] p-4">
      <div className="w-full max-w-md rounded-2xl border border-rose-200 bg-white p-8 text-center shadow-sm">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-rose-50 text-rose-500">
          <FiLock size={26} />
        </div>
        <h1 className="mt-4 text-lg font-bold text-slate-900">Access restricted</h1>
        <p className="mt-2 text-sm leading-6 text-slate-500">
          Your account does not have permission to view the Media Library. Contact
          your administrator to request the{' '}
          <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11px]">
            files.view
          </code>{' '}
          permission.
        </p>
      </div>
    </div>
  );
}

// ---------- Simple API Cache Hook ----------
const cache = new Map<string, { data: any; timestamp: number }>();

function useApiCache<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttlMs = 300_000
): {
  data: T | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
} {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async (skipCache = false) => {
    if (!skipCache) {
      const entry = cache.get(key);
      if (entry && Date.now() - entry.timestamp < ttlMs) {
        setData(entry.data);
        setLoading(false);
        return;
      }
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetcher();
      const result = Array.isArray(res) ? res : (res as any).data ?? [];
      cache.set(key, { data: result, timestamp: Date.now() });
      setData(result);
    } catch (err: any) {
      const msg = err.message || 'Failed to load';
      setError(msg);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [key, fetcher, ttlMs]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { data, loading, error, refresh: () => fetchData(true) };
}

// ---------- Types ----------
interface UploadFile {
  id: number;
  path: string;
  name: string;
  folder: string;
  url: string;
  size: number;
  uploaded_at?: string;
  mime_type?: string;
}

interface AppLogEntry {
  module: string;
  action: string;
  status: 'success' | 'error' | 'info';
  message: string;
}

function safeLog(entry: AppLogEntry): void {
  try {
    addAppLog(entry);
  } catch {
    /* no-op */
  }
}

// ---------- Skeleton Components ----------
const StatCardSkeleton = memo(() => (
  <div className="flex items-center gap-3 rounded-xl border border-slate-100 bg-white p-4 animate-pulse">
    <div className="h-10 w-10 rounded-xl bg-slate-200" />
    <div className="space-y-2 flex-1">
      <div className="h-3 w-16 bg-slate-200 rounded" />
      <div className="h-6 w-8 bg-slate-200 rounded" />
    </div>
  </div>
));

const TableSkeleton = memo(() => (
  <div className="bg-white rounded-xl shadow-sm border p-6 space-y-4 animate-pulse">
    <div className="h-6 w-48 bg-slate-200 rounded" />
    {[...Array(10)].map((_, i) => (
      <div key={i} className="flex gap-4">
        <div className="h-4 w-1/4 bg-slate-200 rounded" />
        <div className="h-4 w-1/5 bg-slate-200 rounded" />
        <div className="h-4 w-1/6 bg-slate-200 rounded" />
        <div className="h-4 w-1/6 bg-slate-200 rounded" />
        <div className="h-4 w-1/4 bg-slate-200 rounded" />
      </div>
    ))}
  </div>
));

const StatCard = memo(({ icon: Icon, label, value, tone, prefix }: {
  icon: any;
  label: string;
  value: string | number;
  tone: 'blue' | 'emerald' | 'amber' | 'rose' | 'purple' | 'teal';
  prefix?: string;
}) => {
  const bg = tone === 'blue' ? 'bg-blue-100 text-blue-600' :
             tone === 'emerald' ? 'bg-emerald-100 text-emerald-600' :
             tone === 'amber' ? 'bg-amber-100 text-amber-600' :
             tone === 'rose' ? 'bg-rose-100 text-rose-600' :
             tone === 'purple' ? 'bg-purple-100 text-purple-600' :
             'bg-teal-100 text-teal-600';
  return (
    <div className="flex items-center gap-3 rounded-xl border border-slate-100 bg-white p-4 shadow-sm">
      <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${bg}`}>
        <Icon size={20} />
      </div>
      <div>
        <p className="text-xs font-medium text-slate-500">{label}</p>
        <p className="text-2xl font-bold text-slate-900">{prefix}{value}</p>
      </div>
    </div>
  );
});

// ---------- Helpers ----------
const formatFileSize = (bytes: number) => {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1048576).toFixed(1) + ' MB';
};

const getFileIcon = (name: string) => {
  const ext = name.split('.').pop()?.toLowerCase() || '';
  if (['jpg', 'jpeg', 'png', 'gif', 'svg', 'webp', 'bmp'].includes(ext)) return FiImage;
  if (['pdf'].includes(ext)) return FiFileText;
  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) return FiArchive;
  return FiFile;
};

const formatDate = (date?: string) => {
  if (!date) return '-';
  try { return new Date(date).toLocaleString(); } catch { return '-'; }
};

// ---------- Component ----------
export function MediaLibraryPage() {
  const { showSuccess, showError } = useNotification();
  const { can, isAuthenticated, loadingUser } = usePagePermissions();

  const canView          = can(PERMISSIONS.FILES_VIEW);
  const canUpload        = can(PERMISSIONS.FILES_UPLOAD);
  const canDelete        = can(PERMISSIONS.FILES_DELETE);
  const canCreateFolder  = can(PERMISSIONS.FILES_CREATE_FOLDER);
  const canCopyUrl       = can(PERMISSIONS.FILES_COPY_URL);

  const [search, setSearch] = useState('');
  const [selectedFolder, setSelectedFolder] = useState('All');
  const [selectedType, setSelectedType] = useState('All');
  const [newFolder, setNewFolder] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [selectedFiles, setSelectedFiles] = useState<number[]>([]);
  const [previewFile, setPreviewFile] = useState<UploadFile | null>(null);
  const [usingMockData, setUsingMockData] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // ---------- API Caching for file list ----------
  const {
    data: rawFiles,
    loading: filesLoading,
    error: filesError,
    refresh: refreshFiles,
  } = useApiCache<any[]>('uploads', () => apiClient.getUploads());

  // Transform API data to UploadFile[]
  const files: UploadFile[] = useMemo(() => {
    if (!rawFiles) return [];
    const mapped = rawFiles.map((item: any, index: number) => ({
      id: item.id || index,
      path: item.path,
      name: item.name,
      folder: item.folder || 'Root',
      url: item.url,
      size: Number(item.size || 0),
      uploaded_at: item.uploaded_at || item.created_at,
      mime_type: item.mime_type,
    }));
    setUsingMockData(false);
    return mapped;
  }, [rawFiles]);

  useEffect(() => {
    if (filesError) {
      setUsingMockData(true);
      showError('Using mock data', 'The media library API is not fully implemented.');
    }
  }, [filesError, showError]);

  // ---------- Computed ----------
  const folders = useMemo(
    () => ['All', ...Array.from(new Set(files.map(f => f.folder || 'Root')))],
    [files]
  );

  const fileTypes = useMemo(() => {
    const types = new Set<string>();
    files.forEach(f => {
      const ext = f.name.split('.').pop()?.toLowerCase() || '';
      if (ext) types.add(ext);
    });
    return ['All', ...Array.from(types)];
  }, [files]);

  const filteredFiles = useMemo(() => {
    let result = files;
    if (selectedFolder !== 'All') {
      result = result.filter(f => f.folder === selectedFolder);
    }
    if (selectedType !== 'All') {
      result = result.filter(f => {
        const ext = f.name.split('.').pop()?.toLowerCase() || '';
        return ext === selectedType;
      });
    }
    if (search.trim()) {
      const q = search.toLowerCase().trim();
      result = result.filter(f =>
        f.name.toLowerCase().includes(q) ||
        f.folder.toLowerCase().includes(q)
      );
    }
    return result;
  }, [files, selectedFolder, selectedType, search]);

  const summary = useMemo(() => {
    const total = files.length;
    const totalSize = files.reduce((acc, f) => acc + f.size, 0);
    const folderCount = new Set(files.map(f => f.folder)).size;
    return { total, totalSize, folderCount };
  }, [files]);

  // ---------- Pagination ----------
  const [currentPage, setCurrentPage] = useState(1);
  const rowsPerPage = 15;
  const totalPages = Math.ceil(filteredFiles.length / rowsPerPage);
  const paginatedFiles = useMemo(() => {
    const start = (currentPage - 1) * rowsPerPage;
    return filteredFiles.slice(start, start + rowsPerPage);
  }, [filteredFiles, currentPage]);

  useEffect(() => setCurrentPage(1), [search, selectedFolder, selectedType]);

  // ---------- Upload handling ----------
  const uploadFile = useCallback(async (file: File) => {
    if (!canUpload) {
      showError('Permission denied', 'You do not have permission to upload files.');
      return;
    }
    const formData = new FormData();
    formData.append('file', file);
    if (selectedFolder !== 'All') {
      formData.append('folder', selectedFolder);
    }

    setUploading(true);
    setUploadProgress(0);
    try {
      const progressInterval = setInterval(() => {
        setUploadProgress(prev => Math.min(prev + 10, 90));
      }, 200);

      await apiClient.uploadFile(formData);
      clearInterval(progressInterval);
      setUploadProgress(100);
      showSuccess('Uploaded', `${file.name} added to the library.`);
      safeLog({ module: 'MediaLibrary', action: 'Upload', status: 'success', message: `Uploaded ${file.name}` });
      refreshFiles();
    } catch (error: any) {
      showError('Upload failed', error.message || 'Could not upload the file.');
      safeLog({ module: 'MediaLibrary', action: 'Upload', status: 'error', message: error.message });
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  }, [canUpload, selectedFolder, refreshFiles, showSuccess, showError]);

  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      if (acceptedFiles.length > 0) {
        void uploadFile(acceptedFiles[0]);
      }
    },
    [uploadFile]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    multiple: false,
    disabled: uploading || !canUpload,
  });

  const handleFileInput = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) void uploadFile(file);
    event.target.value = '';
  };

  // ---------- Folder management ----------
  const handleCreateFolder = async () => {
    if (!canCreateFolder) {
      showError('Permission denied', 'You do not have permission to create folders.');
      return;
    }
    if (!newFolder.trim()) {
      showError('Folder name required', 'Enter a folder name before creating.');
      return;
    }
    try {
      await apiClient.createUploadFolder(newFolder.trim());
      showSuccess('Folder created', `${newFolder.trim()} folder is ready.`);
      safeLog({ module: 'MediaLibrary', action: 'Create folder', status: 'success', message: `Created folder ${newFolder}` });
      setNewFolder('');
      refreshFiles();
    } catch (error: any) {
      showError('Creation failed', error.message || 'Unable to create folder.');
    }
  };

  // ---------- Delete ----------
  const handleDelete = useCallback(async (id: number, name: string) => {
    if (!canDelete) {
      showError('Permission denied', 'You do not have permission to delete files.');
      return;
    }
    const fileToDelete = files.find(f => f.id === id);
    if (!fileToDelete) return;
    if (!window.confirm(`Delete "${name}"? This cannot be undone.`)) return;
    try {
      await apiClient.deleteUpload(fileToDelete.path);
      showSuccess('Deleted', `${name} has been removed.`);
      safeLog({ module: 'MediaLibrary', action: 'Delete', status: 'success', message: `Deleted ${name}` });
      setSelectedFiles(prev => prev.filter(i => i !== id));
      refreshFiles();
    } catch (error: any) {
      showError('Delete failed', error.message || 'Unable to remove the file.');
    }
  }, [canDelete, files, refreshFiles, showSuccess, showError]);

  const handleBulkDelete = async () => {
    if (!canDelete) {
      showError('Permission denied', 'You do not have permission to delete files.');
      return;
    }
    if (selectedFiles.length === 0) return;
    if (!window.confirm(`Delete ${selectedFiles.length} file(s)? This cannot be undone.`)) return;
    try {
      const pathsToDelete = files.filter(f => selectedFiles.includes(f.id)).map(f => f.path);
      await Promise.all(pathsToDelete.map(path => apiClient.deleteUpload(path)));
      showSuccess('Deleted', `${selectedFiles.length} file(s) removed.`);
      safeLog({ module: 'MediaLibrary', action: 'Bulk delete', status: 'success', message: `Deleted ${selectedFiles.length} files` });
      setSelectedFiles([]);
      refreshFiles();
    } catch (error: any) {
      showError('Bulk delete failed', error.message || 'Unable to delete all files.');
    }
  };

  // ---------- Copy URL ----------
  const handleCopyUrl = useCallback(async (url: string) => {
    if (!canCopyUrl) {
      showError('Permission denied', 'You do not have permission to copy file URLs.');
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      showSuccess('Copied', 'File URL copied to clipboard.');
    } catch (error: any) {
      showError('Copy failed', error.message || 'Unable to copy file URL.');
    }
  }, [canCopyUrl, showSuccess, showError]);

  // ---------- Table columns ----------
  const columns = useMemo(() => {
    const baseColumns = [
      {
        name: 'Name',
        selector: (row: UploadFile) => {
          const Icon = getFileIcon(row.name);
          return (
            <div className="flex items-center gap-3">
              <Icon size={18} className="text-slate-400 flex-shrink-0" />
              <span className="font-medium text-slate-700">{row.name}</span>
            </div>
          );
        },
        sortable: true,
        width: '250px',
      },
      {
        name: 'Folder',
        selector: (row: UploadFile) => row.folder,
        cell: (row: UploadFile) => <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-700">{row.folder}</span>,
        sortable: true,
        width: '120px',
      },
      {
        name: 'Size',
        selector: (row: UploadFile) => row.size,
        cell: (row: UploadFile) => <span className="text-sm text-slate-600">{formatFileSize(row.size)}</span>,
        sortable: true,
        width: '100px',
      },
      {
        name: 'Uploaded',
        selector: (row: UploadFile) => row.uploaded_at || '',
        cell: (row: UploadFile) => <span className="text-sm text-slate-500">{formatDate(row.uploaded_at)}</span>,
        sortable: true,
        width: '160px',
      },
    ];

    // Only add the Actions column if the user has at least one action permission.
    const hasAnyAction = canCopyUrl || canDelete;
    if (!hasAnyAction) return baseColumns;

    return [
      ...baseColumns,
      {
        name: 'Actions',
        cell: (row: UploadFile) => (
          <div className="flex items-center gap-1">
            <button
              className="p-1.5 rounded-lg text-slate-600 hover:bg-slate-50 transition-colors"
              onClick={() => setPreviewFile(row)}
              title="Preview"
            >
              <FiImage size={16} />
            </button>
            {canCopyUrl && (
              <button
                className="p-1.5 rounded-lg text-blue-600 hover:bg-blue-50 transition-colors"
                onClick={() => void handleCopyUrl(row.url)}
                title="Copy URL"
              >
                <FiCopy size={16} />
              </button>
            )}
            {canDelete && (
              <button
                className="p-1.5 rounded-lg text-rose-600 hover:bg-rose-50 transition-colors"
                onClick={() => void handleDelete(row.id, row.name)}
                title="Delete"
              >
                <FiTrash2 size={16} />
              </button>
            )}
          </div>
        ),
        width: '140px',
      },
    ];
  }, [canCopyUrl, canDelete, handleCopyUrl, handleDelete]);

  /* --------------------------------------------------------------- */
  /* RBAC page gate                                                  */
  /* --------------------------------------------------------------- */

  if (loadingUser && !isAuthenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f5f7fb]">
        <div className="rounded-2xl bg-white px-6 py-5 text-sm text-slate-600 shadow-sm">
          Loading permissions…
        </div>
      </div>
    );
  }

  if (!isAuthenticated || !canView) {
    return <AccessRestricted />;
  }

  // ---------- Render ----------
  return (
    <div className="min-h-screen bg-[#f5f7fb] p-4 md:p-7 text-slate-800">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-5 mb-6 rounded-3xl bg-slate-950 px-5 py-6 md:px-8 md:py-7 shadow-xl shadow-slate-300/50">
        <div>
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-cyan-300">
            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" /> Media Library
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white md:text-3xl flex items-center gap-3">
            <FiGrid className="text-cyan-300" /> Media Library
            <span className="text-sm font-normal text-cyan-100/70 ml-2">Files & Assets</span>
          </h1>
          <p className="text-sm text-slate-300">Upload, organize, and share media files and documents</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => void refreshFiles()} disabled={filesLoading} className="rounded-xl bg-white/10 px-3 py-2 text-sm font-medium text-white ring-1 ring-white/15 transition hover:bg-white/20 disabled:opacity-60">
            <FiRefreshCw className={filesLoading ? 'animate-spin inline mr-1' : 'inline mr-1'} size={14} /> Refresh
          </button>
        </div>
      </div>

      {usingMockData && (
        <div className="mb-4 p-3 bg-amber-50 border border-amber-200 text-amber-700 rounded-xl flex items-center gap-2 animate-fadeIn">
          <FiAlertCircle size={20} /> Using sample data – some API endpoints are not yet implemented.
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        {files.length > 0 || filesLoading ? (
          <>
            <StatCard icon={FiFile} label="Total Files" value={summary.total} tone="blue" />
            <StatCard icon={FiFolderPlus} label="Folders" value={summary.folderCount} tone="emerald" />
            <StatCard icon={FiHardDrive} label="Total Size" value={formatFileSize(summary.totalSize)} tone="teal" />
          </>
        ) : !filesLoading ? (
          <>
            <StatCard icon={FiFile} label="Total Files" value={0} tone="blue" />
            <StatCard icon={FiFolderPlus} label="Folders" value={0} tone="emerald" />
            <StatCard icon={FiHardDrive} label="Total Size" value="0 B" tone="teal" />
          </>
        ) : (
          [...Array(3)].map((_, i) => <StatCardSkeleton key={i} />)
        )}
      </div>

      {/* Upload & Folder Tools — only when the user can create folders or upload */}
      {(canCreateFolder || canUpload) && (
        <div className="grid gap-6 mb-6 xl:grid-cols-[0.8fr_1.2fr]">
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
              <div>
                <h2 className="text-xl font-semibold text-slate-900">Upload & Folder Tools</h2>
                <p className="mt-1 text-sm text-slate-500">Create folders, upload files, and organize content.</p>
              </div>
            </div>

            <div className="space-y-4">
              {canCreateFolder && (
                <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
                  <input
                    type="text"
                    className="input-field w-full text-sm"
                    placeholder="New folder name"
                    value={newFolder}
                    onChange={(e) => setNewFolder(e.target.value)}
                  />
                  <button className="btn btn-primary gap-2 text-sm" onClick={() => void handleCreateFolder()}>
                    <FiFolderPlus size={16} /> Create
                  </button>
                </div>
              )}

              {canUpload && (
                <div className="grid gap-4 sm:grid-cols-[1fr_auto] items-end">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Upload to folder</label>
                    <select
                      className="input-field w-full text-sm"
                      value={selectedFolder}
                      onChange={(e) => setSelectedFolder(e.target.value)}
                    >
                      {folders.map(folder => (
                        <option key={folder} value={folder}>{folder}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label
                      {...getRootProps()}
                      className={`btn btn-primary cursor-pointer gap-2 w-full text-sm ${
                        isDragActive ? 'border-blue-500 bg-blue-50' : ''
                      }`}
                      style={{ justifyContent: 'center' }}
                    >
                      <FiUpload size={16} /> {uploading ? 'Uploading...' : 'Upload File'}
                      <input {...getInputProps()} disabled={uploading} />
                      <input
                        type="file"
                        ref={fileInputRef}
                        className="hidden"
                        onChange={handleFileInput}
                        disabled={uploading}
                      />
                    </label>
                    {uploading && (
                      <div className="mt-2 w-full bg-slate-200 rounded-full h-2 overflow-hidden">
                        <div
                          className="bg-blue-500 h-2 transition-all duration-300"
                          style={{ width: `${uploadProgress}%` }}
                        />
                      </div>
                    )}
                    {isDragActive && (
                      <p className="mt-2 text-sm text-blue-600">Drop file here…</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-xl font-semibold text-slate-900 mb-4">Library Summary</h2>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="rounded-2xl bg-slate-50 p-4">
                <p className="text-xs uppercase tracking-[0.24em] text-slate-400">Files</p>
                <p className="mt-3 text-3xl font-semibold text-slate-900">{summary.total}</p>
              </div>
              <div className="rounded-2xl bg-slate-50 p-4">
                <p className="text-xs uppercase tracking-[0.24em] text-slate-400">Folders</p>
                <p className="mt-3 text-3xl font-semibold text-slate-900">{summary.folderCount}</p>
              </div>
              <div className="rounded-2xl bg-slate-50 p-4">
                <p className="text-xs uppercase tracking-[0.24em] text-slate-400">Total Size</p>
                <p className="mt-3 text-3xl font-semibold text-slate-900">{formatFileSize(summary.totalSize)}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* File list with filters and bulk actions */}
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
          <div>
            <h2 className="text-xl font-semibold text-slate-900">Media Files</h2>
            <p className="mt-1 text-sm text-slate-500">Search, filter, and manage your uploaded files.</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {canDelete && selectedFiles.length > 0 && (
              <button
                className="inline-flex items-center gap-2 rounded-lg bg-rose-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-rose-600 transition-colors"
                onClick={() => void handleBulkDelete()}
              >
                <FiTrash2 size={16} /> Delete Selected ({selectedFiles.length})
              </button>
            )}
            <span className="text-sm text-slate-500">
              {filteredFiles.length} item(s)
            </span>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-4 mb-4">
          <div className="relative flex-1 min-w-[200px]">
            <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              className="input-field pl-9 w-full text-sm"
              placeholder="Search files..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <select
            className="input-field w-40 text-sm"
            value={selectedFolder}
            onChange={(e) => setSelectedFolder(e.target.value)}
          >
            {folders.map(f => (
              <option key={f} value={f}>{f}</option>
            ))}
          </select>
          <select
            className="input-field w-32 text-sm"
            value={selectedType}
            onChange={(e) => setSelectedType(e.target.value)}
          >
            {fileTypes.map(t => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
          <button
            className="btn btn-ghost gap-1 text-sm"
            onClick={() => {
              setSearch('');
              setSelectedFolder('All');
              setSelectedType('All');
            }}
          >
            <FiX size={16} /> Clear
          </button>
        </div>

        {/* Table with skeleton & pagination */}
        <Suspense fallback={<TableSkeleton />}>
          {filesLoading ? (
            <TableSkeleton />
          ) : (
            <>
              <ModernDataTable
                title=""
                columns={columns}
                data={paginatedFiles}
                loading={false}
                selectable={canDelete}
                selectedIds={selectedFiles}
                onSelectionChange={setSelectedFiles}
                striped
                highlightOnHover
                pointerOnHover
              />
              {totalPages > 1 && (
                <div className="flex items-center justify-between px-6 py-3 border-t">
                  <span className="text-sm text-slate-600">
                    Showing {((currentPage - 1) * rowsPerPage) + 1} to {Math.min(currentPage * rowsPerPage, filteredFiles.length)} of {filteredFiles.length}
                  </span>
                  <div className="flex gap-1">
                    <button onClick={() => setCurrentPage(1)} disabled={currentPage === 1} className="px-3 py-1 text-sm rounded-lg border disabled:opacity-40">««</button>
                    <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} className="px-3 py-1 text-sm rounded-lg border disabled:opacity-40">‹</button>
                    <span className="px-3 py-1 text-sm font-medium">{currentPage} / {totalPages}</span>
                    <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} className="px-3 py-1 text-sm rounded-lg border disabled:opacity-40">›</button>
                    <button onClick={() => setCurrentPage(totalPages)} disabled={currentPage === totalPages} className="px-3 py-1 text-sm rounded-lg border disabled:opacity-40">»»</button>
                  </div>
                </div>
              )}
            </>
          )}
        </Suspense>
      </div>

      {/* Preview Modal */}
      {previewFile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
          <div className="relative max-w-3xl w-full bg-white rounded-2xl shadow-2xl overflow-hidden">
            <button
              className="absolute top-3 right-3 z-10 btn btn-ghost btn-sm text-slate-500 hover:text-slate-700"
              onClick={() => setPreviewFile(null)}
            >
              <FiX size={24} />
            </button>
            <div className="p-6">
              <h3 className="text-xl font-semibold text-slate-900 mb-2">{previewFile.name}</h3>
              <div className="flex flex-wrap gap-3 text-sm text-slate-600 mb-4">
                <span>Folder: {previewFile.folder}</span>
                <span>•</span>
                <span>Size: {formatFileSize(previewFile.size)}</span>
                <span>•</span>
                <span>Uploaded: {formatDate(previewFile.uploaded_at)}</span>
              </div>
              <div className="bg-slate-50 rounded-xl p-4 flex items-center justify-center min-h-[200px]">
                {previewFile.mime_type?.startsWith('image/') ? (
                  <img
                    src={previewFile.url}
                    alt={previewFile.name}
                    className="max-h-[400px] object-contain rounded"
                  />
                ) : (
                  <div className="text-center text-slate-400">
                    <FiFile size={48} className="mx-auto mb-2" />
                    <p>Preview not available for this file type.</p>
                    <button
                      className="btn btn-primary btn-sm mt-4"
                      onClick={() => {
                        window.open(previewFile.url, '_blank');
                      }}
                    >
                      Open File
                    </button>
                  </div>
                )}
              </div>
              <div className="mt-4 flex justify-end">
                {canCopyUrl && (
                  <button
                    className="btn btn-primary gap-2"
                    onClick={() => void handleCopyUrl(previewFile.url)}
                  >
                    <FiCopy size={16} /> Copy URL
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Styles */}
      <style>{`
        .animate-fadeIn { animation: fadeIn 0.3s ease-out; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(-10px); } to { opacity: 1; transform: translateY(0); } }
        .custom-scrollbar::-webkit-scrollbar { width: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: #f1f1f1; border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #94a3b8; }
        @media (max-width: 640px) {
          .rdt_TableCol, .rdt_TableCell { white-space: nowrap; }
        }
        .rdt_TableHeader .search-container,
        .rdt_TableHeader input[type="text"] { display: none !important; }
        .rdt_TableHeader > div:last-child { display: none !important; }
        .rdt_TableCol:first-child, .rdt_TableCell:first-child { display: none !important; }
      `}</style>
    </div>
  );
}

export default MediaLibraryPage;