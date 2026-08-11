import { ModernDataTable } from '../components/ModernDataTable';
import { useEffect, useState } from 'react';
import { apiClient } from '../api';

export function FilesPage(){
  const [files, setFiles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const columns = [
    { name: 'File', selector: (r: any) => r.name },
    { name: 'Size', selector: (r: any) => (r.size ? `${Math.round(r.size/1024)} KB` : '-') },
    { name: 'URL', selector: (r: any) => r.url },
  ];

  const load = async () => {
    setLoading(true);
    try {
      const res = await apiClient.getUploads();
      setFiles(Array.isArray(res) ? res : res.data || []);
    } catch (err) {
      console.error('Error loading files', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleUpload = async (e: any) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const fd = new FormData();
    fd.append('file', file);
    try {
      await apiClient.uploadFile(fd);
      load();
    } catch (err) {
      console.error('Upload failed', err);
    }
  };

  return (
    <div className="p-8 bg-gray-50 min-h-screen">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold mb-1">File Management</h1>
          <p className="text-gray-600">Upload and manage project files and documents.</p>
        </div>
        <div>
          <label className="btn btn-primary cursor-pointer">
            Upload File
            <input type="file" onChange={handleUpload} className="hidden" />
          </label>
        </div>
      </div>

      <ModernDataTable title="Files" columns={columns} data={files} loading={loading} />
    </div>
  );
}
