import { useEffect, useMemo, useState } from 'react';
import { FiEdit3, FiMail, FiMapPin, FiPhone, FiShield, FiUser } from 'react-icons/fi';
import { apiClient } from '../api';
import { useAuthStore } from '../store/auth';
import { useNotification } from '../components/NotificationContext';

export function ProfilePage() {
  const { user, setUser } = useAuthStore();
  const { showSuccess, showError } = useNotification();

  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: user?.name || '',
    email: user?.email || '',
    phone: user?.phone || '',
    location: user?.location || '',
    timezone: user?.timezone || 'UTC',
    bio: user?.bio || '',
  });

  useEffect(() => {
    const loadProfile = async () => {
      try {
        setLoading(true);
        const response = await apiClient.getProfile();
        const profile = response?.data ?? response ?? user;
        setUser(profile);
        setForm({
          name: profile?.name || '',
          email: profile?.email || '',
          phone: profile?.phone || '',
          location: profile?.location || '',
          timezone: profile?.timezone || 'UTC',
          bio: profile?.bio || '',
        });
      } catch (err: any) {
        console.error('Failed to load profile', err);
        showError('Profile load failed', err?.backendMessage || err?.message || 'Unable to read profile.');
      } finally {
        setLoading(false);
      }
    };

    void loadProfile();
  }, [setUser, showError, user]);

  const initials = useMemo(() => {
    if (!form.name) return 'U';
    return form.name
      .split(' ')
      .map((segment) => segment[0])
      .join('')
      .slice(0, 2)
      .toUpperCase();
  }, [form.name]);

  const handleChange = (field: keyof typeof form, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      const payload = {
        name: form.name,
        email: form.email,
        phone: form.phone,
        location: form.location,
        timezone: form.timezone,
        bio: form.bio,
      };
      const response = await apiClient.updateProfile(payload);
      const profile = response?.data ?? response;
      setUser(profile);
      setIsEditing(false);
      showSuccess('Profile updated', 'Your profile has been saved successfully.');
    } catch (err: any) {
      showError('Profile update failed', err?.backendMessage || err?.message || 'Unable to update profile.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 p-6 md:p-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-5">
              <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-cyan-500 text-2xl font-bold text-white shadow-lg">
                {initials}
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.26em] text-blue-600">Profile</p>
                <h1 className="mt-2 text-3xl font-bold text-slate-900">{form.name || 'User profile'}</h1>
                <p className="text-slate-500">{form.email || 'No email bound to this account'}</p>
              </div>
            </div>

            <button
              onClick={() => setIsEditing((value) => !value)}
              className="btn btn-primary gap-2"
              disabled={loading}
            >
              <FiEdit3 /> {isEditing ? 'Cancel' : 'Edit profile'}
            </button>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.3fr_0.7fr]">
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-xl font-semibold text-slate-900">Personal information</h2>
              <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-700">
                {loading ? 'Loading...' : 'Active account'}
              </span>
            </div>

            <div className="grid gap-5 md:grid-cols-2">
              <label className="block">
                <span className="mb-2 flex items-center gap-2 text-sm font-medium text-slate-700">
                  <FiUser /> Full name
                </span>
                <input
                  className="input-field"
                  value={form.name}
                  disabled={!isEditing || loading}
                  onChange={(event) => handleChange('name', event.target.value)}
                />
              </label>

              <label className="block">
                <span className="mb-2 flex items-center gap-2 text-sm font-medium text-slate-700">
                  <FiMail /> Email
                </span>
                <input
                  className="input-field"
                  value={form.email}
                  disabled={!isEditing || loading}
                  onChange={(event) => handleChange('email', event.target.value)}
                />
              </label>

              <label className="block">
                <span className="mb-2 flex items-center gap-2 text-sm font-medium text-slate-700">
                  <FiPhone /> Phone
                </span>
                <input
                  className="input-field"
                  value={form.phone}
                  disabled={!isEditing || loading}
                  placeholder="Add phone number"
                  onChange={(event) => handleChange('phone', event.target.value)}
                />
              </label>

              <label className="block">
                <span className="mb-2 flex items-center gap-2 text-sm font-medium text-slate-700">
                  <FiMapPin /> Location
                </span>
                <input
                  className="input-field"
                  value={form.location}
                  disabled={!isEditing || loading}
                  placeholder="Office or city"
                  onChange={(event) => handleChange('location', event.target.value)}
                />
              </label>

              <label className="block md:col-span-2">
                <span className="mb-2 block text-sm font-medium text-slate-700">Timezone</span>
                <input
                  className="input-field"
                  value={form.timezone}
                  disabled={!isEditing || loading}
                  onChange={(event) => handleChange('timezone', event.target.value)}
                />
              </label>

              <label className="block md:col-span-2">
                <span className="mb-2 block text-sm font-medium text-slate-700">Bio</span>
                <textarea
                  className="input-field min-h-[90px]"
                  value={form.bio}
                  disabled={!isEditing || loading}
                  placeholder="Tell people a little about your role and responsibilities..."
                  onChange={(event) => handleChange('bio', event.target.value)}
                />
              </label>
            </div>

            {isEditing && (
              <div className="mt-6 flex justify-end gap-3">
                <button className="btn btn-secondary" onClick={() => setIsEditing(false)} disabled={saving}>
                  Close
                </button>
                <button className="btn btn-primary" onClick={() => void handleSave()} disabled={saving || loading}>
                  {saving ? 'Saving...' : 'Save changes'}
                </button>
              </div>
            )}
          </div>

          <div className="space-y-6">
            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="mb-4 text-lg font-semibold text-slate-900">Account summary</h2>
              <div className="space-y-3 text-sm text-slate-600">
                <div className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2">
                  <span>Role</span>
                  <span className="font-medium text-slate-800">{user?.roles?.[0]?.name || 'Administrator'}</span>
                </div>
                <div className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2">
                  <span>Access</span>
                  <span className="font-medium text-slate-800">Full</span>
                </div>
                <div className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2">
                  <span>Status</span>
                  <span className="font-medium text-emerald-600">Online</span>
                </div>
              </div>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-slate-900">
                <FiShield /> Security
              </h2>
              <button className="btn btn-secondary w-full">Change password</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
