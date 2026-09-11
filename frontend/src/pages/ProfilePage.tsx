// src/pages/ProfilePage.tsx
import { useEffect, useMemo, useState } from 'react';
import {
  AtSign,
  Edit3,
  LockKeyhole,
  MapPin,
  Phone,
  Save,
  Shield,
  User,
  X,
} from 'lucide-react';

import { apiClient } from '../api';
import { useAuthStore } from '../store/auth';
import { useNotification } from '../components/NotificationContext';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';

interface ProfileForm {
  name: string;
  email: string;
  phone: string;
  location: string;
  timezone: string;
  bio: string;
}

function getErrorMessage(
  error: unknown,
  fallback = 'Something went wrong.',
) {
  const err = error as any;

  if (err?.response?.status === 401) {
    return 'Your session has expired. Please sign in again.';
  }

  if (err?.response?.status === 403) {
    return 'You do not have permission to perform this action.';
  }

  if (err?.response?.status === 422) {
    return (
      err?.response?.data?.message ||
      'Please check the entered information.'
    );
  }

  if (err?.response?.status >= 500) {
    return 'Server error. Please try again later.';
  }

  return (
    err?.backendMessage ||
    err?.response?.data?.message ||
    err?.message ||
    fallback
  );
}

function normalizeProfile(
  profile: any,
  fallback?: any,
): ProfileForm {
  return {
    name: String(profile?.name ?? fallback?.name ?? ''),
    email: String(profile?.email ?? fallback?.email ?? ''),
    phone: String(profile?.phone ?? fallback?.phone ?? ''),
    location: String(profile?.location ?? fallback?.location ?? ''),
    timezone: String(
      profile?.timezone ?? fallback?.timezone ?? 'UTC',
    ),
    bio: String(profile?.bio ?? fallback?.bio ?? ''),
  };
}

function Field({
  label,
  icon: Icon,
  value,
  disabled,
  placeholder,
  type = 'text',
  onChange,
}: {
  label: string;
  icon?: typeof User;
  value: string;
  disabled: boolean;
  placeholder?: string;
  type?: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-center gap-2 text-sm font-medium text-slate-700">
        {Icon && <Icon className="h-4 w-4 text-slate-400" />}
        {label}
      </span>

      <Input
        type={type}
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="bg-white"
      />
    </label>
  );
}

export function ProfilePage() {
  const { user, setUser } = useAuthStore();
  const { showSuccess, showError } = useNotification();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);

  const [form, setForm] = useState<ProfileForm>(() =>
    normalizeProfile(user),
  );

  const [originalForm, setOriginalForm] =
    useState<ProfileForm>(() => normalizeProfile(user));

  useEffect(() => {
    let mounted = true;

    const loadProfile = async () => {
      try {
        setLoading(true);

        const response = await apiClient.getProfile();
        const profile = response?.data ?? response ?? user;

        if (!mounted) return;

        setUser(profile);

        const normalized = normalizeProfile(profile, user);

        setForm(normalized);
        setOriginalForm(normalized);
      } catch (error: unknown) {
        if (!mounted) return;

        showError(
          'Profile load failed',
          getErrorMessage(
            error,
            'Unable to load your profile.',
          ),
        );
      } finally {
        if (mounted) setLoading(false);
      }
    };

    void loadProfile();

    return () => {
      mounted = false;
    };
  }, [setUser, showError]);

  const initials = useMemo(() => {
    const name = form.name.trim();

    if (!name) return 'U';

    return name
      .split(/\s+/)
      .filter(Boolean)
      .map((part) => part[0])
      .join('')
      .slice(0, 2)
      .toUpperCase();
  }, [form.name]);

  const roleName =
    user?.roles?.[0]?.name || 'Administrator';

  const hasChanges = useMemo(
    () =>
      JSON.stringify(form) !==
      JSON.stringify(originalForm),
    [form, originalForm],
  );

  const updateField = (
    field: keyof ProfileForm,
    value: string,
  ) => {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const cancelEdit = () => {
    setForm(originalForm);
    setEditing(false);
  };

  const validate = () => {
    const name = form.name.trim();
    const email = form.email.trim();
    const phone = form.phone.trim();

    if (!name) {
      showError('Validation', 'Full name is required.');
      return false;
    }

    if (name.length > 255) {
      showError(
        'Validation',
        'Full name cannot exceed 255 characters.',
      );
      return false;
    }

    if (
      email &&
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    ) {
      showError(
        'Validation',
        'Enter a valid email address.',
      );
      return false;
    }

    if (email.length > 255) {
      showError(
        'Validation',
        'Email cannot exceed 255 characters.',
      );
      return false;
    }

    if (phone.length > 30) {
      showError(
        'Validation',
        'Phone number cannot exceed 30 characters.',
      );
      return false;
    }

    if (form.location.length > 255) {
      showError(
        'Validation',
        'Location cannot exceed 255 characters.',
      );
      return false;
    }

    if (form.timezone.length > 100) {
      showError(
        'Validation',
        'Timezone cannot exceed 100 characters.',
      );
      return false;
    }

    if (form.bio.length > 2000) {
      showError(
        'Validation',
        'Bio cannot exceed 2000 characters.',
      );
      return false;
    }

    return true;
  };

  const saveProfile = async () => {
    if (!validate()) return;

    if (!hasChanges) {
      setEditing(false);
      return;
    }

    setSaving(true);

    try {
      const payload = {
        name: form.name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        location: form.location.trim(),
        timezone: form.timezone.trim(),
        bio: form.bio.trim(),
      };

      const response =
        await apiClient.updateProfile(payload);

      const profile = response?.data ?? response;

      const normalized = normalizeProfile(
        profile,
        {
          ...user,
          ...payload,
        },
      );

      setUser(profile);
      setForm(normalized);
      setOriginalForm(normalized);
      setEditing(false);

      showSuccess(
        'Profile updated',
        'Your profile has been saved successfully.',
      );
    } catch (error: unknown) {
      showError(
        'Profile update failed',
        getErrorMessage(
          error,
          'Unable to update your profile.',
        ),
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f6f8fc] p-4 text-slate-800 md:p-7">
      <div className="mx-auto max-w-6xl space-y-6">

        {/* Hero */}
        <Card className="overflow-hidden border-slate-200 bg-slate-950 text-white shadow-xl">
          <CardContent className="p-0">
            <div className="px-5 py-6 md:px-8 md:py-8">
              <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">

                <div className="flex min-w-0 items-center gap-4 md:gap-5">
                  <div className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl bg-cyan-400 text-xl font-bold text-slate-950 shadow-lg shadow-cyan-500/20 md:h-20 md:w-20 md:text-2xl">
                    {initials}
                  </div>

                  <div className="min-w-0">
                    <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-300">
                      <span className="h-2 w-2 rounded-full bg-emerald-400" />
                      Account Profile
                    </div>

                    <h1 className="truncate text-2xl font-bold tracking-tight md:text-3xl">
                      {form.name || 'User Profile'}
                    </h1>

                    <p className="mt-1 truncate text-sm text-slate-300">
                      {form.email ||
                        'No email bound to this account'}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  {editing && (
                    <Button
                      variant="outline"
                      onClick={cancelEdit}
                      disabled={saving}
                      className="border-white/15 bg-white/10 text-white hover:bg-white/15 hover:text-white"
                    >
                      <X className="mr-2 h-4 w-4" />
                      Cancel
                    </Button>
                  )}

                  <Button
                    onClick={() =>
                      editing
                        ? void saveProfile()
                        : setEditing(true)
                    }
                    disabled={loading || saving}
                    className={
                      editing
                        ? 'bg-emerald-500 text-white hover:bg-emerald-600'
                        : 'bg-cyan-400 text-slate-950 hover:bg-cyan-300'
                    }
                  >
                    {editing ? (
                      <>
                        <Save className="mr-2 h-4 w-4" />
                        {saving
                          ? 'Saving...'
                          : 'Save changes'}
                      </>
                    ) : (
                      <>
                        <Edit3 className="mr-2 h-4 w-4" />
                        Edit profile
                      </>
                    )}
                  </Button>
                </div>
              </div>

              <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
                <div className="rounded-xl bg-white/5 p-3 ring-1 ring-white/10">
                  <p className="text-[11px] text-slate-400">
                    Role
                  </p>
                  <p className="mt-1 truncate text-sm font-semibold">
                    {roleName}
                  </p>
                </div>

                <div className="rounded-xl bg-white/5 p-3 ring-1 ring-white/10">
                  <p className="text-[11px] text-slate-400">
                    Account
                  </p>
                  <p className="mt-1 text-sm font-semibold">
                    Active
                  </p>
                </div>

                <div className="rounded-xl bg-white/5 p-3 ring-1 ring-white/10">
                  <p className="text-[11px] text-slate-400">
                    Access
                  </p>
                  <p className="mt-1 text-sm font-semibold">
                    Role Based
                  </p>
                </div>

                <div className="rounded-xl bg-white/5 p-3 ring-1 ring-white/10">
                  <p className="text-[11px] text-slate-400">
                    Profile
                  </p>
                  <p className="mt-1 text-sm font-semibold">
                    {loading ? 'Loading...' : 'Synced'}
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Main */}
        <div className="grid gap-6 lg:grid-cols-[1.45fr_0.75fr]">

          {/* Personal information */}
          <Card className="border-slate-200 shadow-sm">
            <CardHeader className="border-b border-slate-100">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <CardTitle className="text-lg">
                    Personal information
                  </CardTitle>

                  <p className="mt-1 text-sm text-slate-500">
                    Manage the information shown on your account.
                  </p>
                </div>

                <Badge
                  className={
                    editing
                      ? 'bg-blue-100 text-blue-700 hover:bg-blue-100'
                      : 'bg-emerald-100 text-emerald-700 hover:bg-emerald-100'
                  }
                >
                  {editing ? 'Editing' : 'Active'}
                </Badge>
              </div>
            </CardHeader>

            <CardContent className="p-5 md:p-6">
              <div className="grid gap-5 md:grid-cols-2">

                <Field
                  label="Full name"
                  icon={User}
                  value={form.name}
                  disabled={!editing || loading}
                  placeholder="Enter your full name"
                  onChange={(value) =>
                    updateField('name', value)
                  }
                />

                <Field
                  label="Email"
                  icon={AtSign}
                  type="email"
                  value={form.email}
                  disabled={!editing || loading}
                  placeholder="name@example.com"
                  onChange={(value) =>
                    updateField('email', value)
                  }
                />

                <Field
                  label="Phone"
                  icon={Phone}
                  type="tel"
                  value={form.phone}
                  disabled={!editing || loading}
                  placeholder="Add phone number"
                  onChange={(value) =>
                    updateField('phone', value)
                  }
                />

                <Field
                  label="Location"
                  icon={MapPin}
                  value={form.location}
                  disabled={!editing || loading}
                  placeholder="Office or city"
                  onChange={(value) =>
                    updateField('location', value)
                  }
                />

                <div className="md:col-span-2">
                  <label className="mb-1.5 block text-sm font-medium text-slate-700">
                    Timezone
                  </label>

                  <select
                    value={form.timezone}
                    disabled={!editing || loading}
                    onChange={(event) =>
                      updateField(
                        'timezone',
                        event.target.value,
                      )
                    }
                    className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm outline-none focus:border-slate-900 disabled:cursor-not-allowed disabled:bg-slate-50"
                  >
                    <option value="UTC">UTC</option>
                    <option value="Asia/Kolkata">
                      Asia/Kolkata
                    </option>
                    <option value="Asia/Dhaka">
                      Asia/Dhaka
                    </option>
                    <option value="Asia/Kathmandu">
                      Asia/Kathmandu
                    </option>
                    <option value="Asia/Dubai">
                      Asia/Dubai
                    </option>
                    <option value="Asia/Singapore">
                      Asia/Singapore
                    </option>
                    <option value="Europe/London">
                      Europe/London
                    </option>
                    <option value="America/New_York">
                      America/New_York
                    </option>
                    <option value="America/Los_Angeles">
                      America/Los_Angeles
                    </option>
                  </select>
                </div>

                <div className="md:col-span-2">
                  <label className="mb-1.5 block text-sm font-medium text-slate-700">
                    Bio
                  </label>

                  {/* Native textarea: no shadcn textarea component required */}
                  <textarea
                    rows={5}
                    maxLength={2000}
                    value={form.bio}
                    disabled={!editing || loading}
                    placeholder="Tell people a little about your role and responsibilities..."
                    onChange={(event) =>
                      updateField(
                        'bio',
                        event.target.value,
                      )
                    }
                    className="w-full resize-none rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-slate-900 focus:ring-2 focus:ring-slate-200 disabled:cursor-not-allowed disabled:bg-slate-50"
                  />

                  <div className="mt-1 text-right text-[11px] text-slate-400">
                    {form.bio.length}/2000
                  </div>
                </div>
              </div>

              {editing && hasChanges && (
                <div className="mt-6 flex items-center justify-between gap-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3">
                  <div className="text-sm text-blue-800">
                    You have unsaved profile changes.
                  </div>

                  <Button
                    size="sm"
                    onClick={() => void saveProfile()}
                    disabled={saving || loading}
                    className="bg-blue-600 text-white hover:bg-blue-700"
                  >
                    <Save className="mr-2 h-4 w-4" />
                    {saving ? 'Saving...' : 'Save'}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Sidebar */}
          <div className="space-y-6">

            <Card className="border-slate-200 shadow-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Shield className="h-5 w-5 text-blue-600" />
                  Account & access
                </CardTitle>
              </CardHeader>

              <CardContent className="space-y-3">
                <div className="rounded-xl bg-slate-50 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm text-slate-500">
                      Role
                    </span>

                    <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-100">
                      {roleName}
                    </Badge>
                  </div>
                </div>

                <div className="rounded-xl bg-slate-50 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm text-slate-500">
                      Status
                    </span>

                    <span className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-600">
                      <span className="h-2 w-2 rounded-full bg-emerald-500" />
                      Active
                    </span>
                  </div>
                </div>

                <div className="rounded-xl bg-slate-50 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm text-slate-500">
                      Access
                    </span>

                    <span className="text-sm font-medium text-slate-800">
                      Role based
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-slate-200 shadow-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <LockKeyhole className="h-5 w-5 text-slate-700" />
                  Security
                </CardTitle>
              </CardHeader>

              <CardContent>
                <p className="text-sm text-slate-500">
                  Password changes should use your authenticated
                  change-password API flow.
                </p>

                <Separator className="my-4" />

                <Button
                  variant="outline"
                  className="w-full"
                  type="button"
                  onClick={() =>
                    showError(
                      'Password change',
                      'Connect this button to your authenticated change-password endpoint.',
                    )
                  }
                >
                  <LockKeyhole className="mr-2 h-4 w-4" />
                  Change password
                </Button>
              </CardContent>
            </Card>

            <Card className="border-slate-200 bg-slate-950 text-white shadow-sm">
              <CardContent className="p-5">
                <div className="flex gap-3">
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-cyan-400/15 text-cyan-300">
                    <Shield className="h-5 w-5" />
                  </div>

                  <div>
                    <p className="text-sm font-semibold">
                      Permission controlled
                    </p>

                    <p className="mt-1 text-xs leading-5 text-slate-400">
                      Profile information is loaded and saved
                      through the authenticated ERP API.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

          </div>
        </div>
      </div>
    </div>
  );
}

export default ProfilePage;
