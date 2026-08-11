import { useEffect, useMemo, useState } from 'react';
import { FiRefreshCw } from 'react-icons/fi';
import { ModernDataTable } from '../components/ModernDataTable';
import { apiClient } from '../api';

interface UserRow {
  id: number;
  name: string;
  email: string;
  roles: Array<{ id: number; name: string }>;
}

export function UsersPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadUsers = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await apiClient.getUsers();
      const data = Array.isArray(response) ? response : response?.data || [];
      setUsers(data);
    } catch (err: any) {
      setError(err.message || 'Unable to load users.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const columns = useMemo(
    () => [
      { name: 'User', selector: (row: UserRow) => row.name },
      { name: 'Email', selector: (row: UserRow) => row.email },
      { name: 'Roles', selector: (row: UserRow) => (row.roles || []).map((role) => role.name).join(', ') || '-' },
    ],
    []
  );

  return (
    <div className="p-8 bg-gray-50 min-h-screen">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Users</h1>
          <p className="text-gray-600">Review and manage the available system users.</p>
        </div>
        <button onClick={() => loadUsers()} disabled={loading} className="btn btn-secondary gap-2">
          <FiRefreshCw className={loading ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>

      {error && <div className="mb-4 rounded-md border border-yellow-400 bg-yellow-50 p-3 text-yellow-800">{error}</div>}

      <ModernDataTable title="Users" columns={columns} data={users} loading={loading} />
    </div>
  );
}
