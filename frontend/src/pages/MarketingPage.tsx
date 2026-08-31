import type { ChangeEvent, ReactNode } from 'react';
import type { IconType } from 'react-icons';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import clsx from 'clsx';
import {
  FiAlertCircle,
  FiBarChart2,
  FiCalendar,
  FiCheckCircle,
  FiChevronLeft,
  FiChevronRight,
  FiClock,
  FiCopy,
  FiEdit3,
  FiExternalLink,
  FiFileText,
  FiLink2,
  FiMapPin,
  FiMessageSquare,
  FiPlus,
  FiRefreshCw,
  FiSearch,
  FiSend,
  FiTrash2,
  FiUploadCloud,
  FiUsers,
  FiX,
  FiXCircle,
} from 'react-icons/fi';

import { useNotification } from '../components/NotificationContext';
import {
  getMarketingAccounts,
  getMarketingAnalytics,
  getMarketingDashboard,
  getMarketingInbox,
  getMarketingPosts,
  createMarketingPost,
  updateMarketingPost,
  deleteMarketingPost,
  markInboxMessageRead,
  sendEmailReply,
  sendWhatsAppReply,
  disconnectSocialAccount,
  getSocialAuthUrl,
  SUPPORTED_PLATFORMS,
  type SocialAccount,
  type SocialPost,
  type InboxMessage,
} from '../services/marketingService';

const MAX_MEDIA_FILES = 10;
const MAX_FILE_SIZE_MB = 100;

const PLATFORM_META: Record<string, { label: string; icon: string }> = {
  facebook: { label: 'Facebook', icon: 'f' },
  instagram: { label: 'Instagram', icon: '◎' },
  twitter: { label: 'X / Twitter', icon: '𝕏' },
  linkedin: { label: 'LinkedIn', icon: 'in' },
  google: { label: 'Google Business Profile', icon: 'G' },
  youtube: { label: 'YouTube', icon: '▶' },
  tiktok: { label: 'TikTok', icon: '♪' },
  threads: { label: 'Threads', icon: '@' },
  whatsapp: { label: 'WhatsApp', icon: 'W' },
  pinterest: { label: 'Pinterest', icon: 'P' },
  telegram: { label: 'Telegram', icon: '✈' },
};

const POST_TYPES = [
  { value: 'text', label: 'Text' },
  { value: 'image', label: 'Image' },
  { value: 'carousel', label: 'Carousel' },
  { value: 'video', label: 'Video' },
  { value: 'reel', label: 'Reel' },
  { value: 'story', label: 'Story' },
  { value: 'poll', label: 'Poll' },
  { value: 'link', label: 'Link' },
  { value: 'whats_new', label: "Google: What's new" },
  { value: 'offer', label: 'Google: Offer' },
  { value: 'event', label: 'Google: Event' },
] as const;

type PostType = (typeof POST_TYPES)[number]['value'];
type PostStatus = 'draft' | 'scheduled' | 'published' | 'failed' | 'cancelled' | 'publishing' | string;

type MarketingPost = SocialPost & {
  type?: PostType;
  platforms?: string[];
  media?: string[];
  link?: string;
  cta?: string;
  locations?: string[];
  status?: PostStatus;
  scheduled_at?: string | null;
  published_at?: string | null;
  failure_reason?: string | null;
  engagement?: {
    likes?: number;
    comments?: number;
    shares?: number;
    clicks?: number;
    reach?: number;
    impressions?: number;
  } | null;
};

type GbpLocation = {
  id: string;
  name: string;
  address?: string | null;
};

type Analytics = {
  followers?: number;
  engagement?: number;
  reach?: number;
  impressions?: number;
  likes?: number;
  comments?: number;
  shares?: number;
  clicks?: number;
};

type ApiError = {
  message?: string;
  validationErrors?: Record<string, string[] | string>;
  errors?: Record<string, string[] | string>;
  response?: { data?: { message?: string; errors?: Record<string, string[] | string> } };
};

function getErrorMessage(error: unknown, fallback = 'The operation could not be completed.') {
  const e = error as ApiError | undefined;
  const nested = e?.response?.data;
  if (nested?.errors) {
    return Object.entries(nested.errors)
      .flatMap(([field, value]) => `${field}: ${Array.isArray(value) ? value.join(', ') : value}`)
      .join(' | ');
  }
  if (e?.validationErrors) {
    return Object.entries(e.validationErrors)
      .flatMap(([field, value]) => `${field}: ${Array.isArray(value) ? value.join(', ') : value}`)
      .join(' | ');
  }
  if (e?.errors) {
    return Object.entries(e.errors)
      .flatMap(([field, value]) => `${field}: ${Array.isArray(value) ? value.join(', ') : value}`)
      .join(' | ');
  }
  return e?.message || nested?.message || fallback;
}

function getGbpLocationsFromAccounts(accounts: SocialAccount[]): GbpLocation[] {
  const googleAccounts = accounts.filter((a) => a.platform === 'google' && a.status === 'connected');
  const locations: GbpLocation[] = [];

  for (const account of googleAccounts) {
    const raw = (account as SocialAccount & { locations?: unknown }).locations;
    if (!Array.isArray(raw)) continue;

    for (const item of raw) {
      if (!item || typeof item !== 'object') continue;
      // ✅ Fix: cast to unknown first
      const value = item as unknown as Record<string, unknown>;
      const id = String(value.id ?? value.location_id ?? '');
      const name = String(value.name ?? value.title ?? '');
      if (!id || !name) continue;
      locations.push({
        id,
        name,
        address: value.address ? String(value.address) : null,
      });
    }
  }

  return locations;
}

function getAccountLabel(account: SocialAccount) {
  const value = account as SocialAccount & { name?: string | null };
  return value.username || value.name || 'Connected account';
}

function formatCount(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? n.toLocaleString() : '—';
}

function formatDate(value?: string | null) {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString();
}

function toDatetimeLocal(value?: string | null) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function StatCard({ label, value, icon }: { label: string; value: string; icon: ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</span>
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-slate-100 text-slate-700">{icon}</span>
      </div>
      <div className="mt-2 text-2xl font-bold text-slate-950">{value}</div>
    </div>
  );
}

function StatusBadge({ status }: { status?: string }) {
  const value = status || 'unknown';
  const styles =
    value === 'published' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
    value === 'scheduled' ? 'bg-amber-50 text-amber-700 border-amber-200' :
    value === 'failed' ? 'bg-rose-50 text-rose-700 border-rose-200' :
    value === 'publishing' ? 'bg-blue-50 text-blue-700 border-blue-200' :
    value === 'cancelled' ? 'bg-slate-100 text-slate-600 border-slate-200' :
    'bg-slate-50 text-slate-700 border-slate-200';
  return <span className={clsx('inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold capitalize', styles)}>{value}</span>;
}

export function MarketingPage() {
  const { showSuccess, showError } = useNotification();
  const [activeTab, setActiveTab] = useState<'overview' | 'compose' | 'content' | 'calendar' | 'inbox' | 'analytics' | 'accounts'>('overview');
  const [accounts, setAccounts] = useState<SocialAccount[]>([]);
  const [posts, setPosts] = useState<MarketingPost[]>([]);
  const [analytics, setAnalytics] = useState<Analytics>({});
  const [inbox, setInbox] = useState<InboxMessage[]>([]);
  const [dashboard, setDashboard] = useState<Record<string, unknown>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [pageError, setPageError] = useState<string | null>(null);

  const [editingPost, setEditingPost] = useState<MarketingPost | null>(null);
  const [postContent, setPostContent] = useState('');
  const [postType, setPostType] = useState<PostType>('text');
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>([]);
  const [selectedLocations, setSelectedLocations] = useState<string[]>([]);
  const [scheduledAt, setScheduledAt] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [ctaButton, setCtaButton] = useState('Learn More');
  const [mediaFiles, setMediaFiles] = useState<File[]>([]);
  const [mediaPreviews, setMediaPreviews] = useState<string[]>([]);
  const [existingMedia, setExistingMedia] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterPlatform, setFilterPlatform] = useState('all');
  const [currentMonth, setCurrentMonth] = useState(new Date().getMonth());
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear());

  const gbpLocations = useMemo(() => getGbpLocationsFromAccounts(accounts), [accounts]);
  const connectedAccounts = useMemo(() => accounts.filter((a) => a.status === 'connected'), [accounts]);

  const showApiErrors = useCallback((error: unknown, title = 'Operation failed') => {
    const message = getErrorMessage(error);
    setPageError(message);
    showError(title, message);
  }, [showError]);

  const refreshData = useCallback(async (notify = false) => {
    setRefreshing(true);
    if (!notify) setLoading(true);
    setPageError(null);

    try {
      const results = await Promise.allSettled([
        getMarketingDashboard(),
        getMarketingAccounts(),
        getMarketingPosts(),
        getMarketingAnalytics(),
        getMarketingInbox(),
      ]);

      const labels = ['dashboard', 'accounts', 'posts', 'analytics', 'inbox'] as const;
      const failures = results.flatMap((result, index) =>
        result.status === 'rejected' ? [`${labels[index]}: ${getErrorMessage(result.reason)}`] : []
      );

      // ✅ Fix: cast to unknown first
      if (results[0].status === 'fulfilled') setDashboard((results[0].value as unknown as Record<string, unknown>) || {});
      if (results[1].status === 'fulfilled') setAccounts(Array.isArray(results[1].value) ? results[1].value : []);
      if (results[2].status === 'fulfilled') setPosts(Array.isArray(results[2].value) ? results[2].value as MarketingPost[] : []);
      if (results[3].status === 'fulfilled') setAnalytics((results[3].value as Analytics) || {});
      if (results[4].status === 'fulfilled') setInbox(Array.isArray(results[4].value) ? results[4].value : []);

      if (failures.length) {
        const message = `Some marketing data could not be loaded: ${failures.join(' • ')}`;
        setPageError(message);
        if (notify) showError('Partial refresh', message);
      } else if (notify) {
        showSuccess('Refreshed', 'Marketing data is up to date.');
      }
    } catch (error) {
      showApiErrors(error, 'Marketing data failed');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [showApiErrors, showError, showSuccess]);

  useEffect(() => {
    void refreshData(false);
  }, [refreshData]);

  const filteredPosts = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return posts.filter((post) => {
      const content = String(post.content || '').toLowerCase();
      const platforms = Array.isArray(post.platforms) ? post.platforms : [];
      const statusMatch = filterStatus === 'all' || post.status === filterStatus;
      const platformMatch = filterPlatform === 'all' || platforms.includes(filterPlatform);
      const textMatch = !term || content.includes(term);
      return statusMatch && platformMatch && textMatch;
    });
  }, [posts, searchTerm, filterStatus, filterPlatform]);

  const stats = useMemo(() => ({
    connected: connectedAccounts.length,
    scheduled: posts.filter((p) => p.status === 'scheduled').length,
    published: posts.filter((p) => p.status === 'published').length,
    failed: posts.filter((p) => p.status === 'failed').length,
    followers: analytics.followers,
    engagement: analytics.engagement,
    reach: analytics.reach,
    impressions: analytics.impressions,
  }), [analytics, connectedAccounts.length, posts]);

  const openCreate = () => {
    setEditingPost(null);
    setPostContent('');
    setPostType('text');
    setSelectedPlatforms([]);
    setSelectedLocations([]);
    setScheduledAt('');
    setLinkUrl('');
    setCtaButton('Learn More');
    setMediaFiles([]);
    setMediaPreviews([]);
    setExistingMedia([]);
    setActiveTab('compose');
  };

  const openEdit = (post: MarketingPost) => {
    setEditingPost(post);
    setPostContent(String(post.content || ''));
    setPostType((post.type || 'text') as PostType);
    setSelectedPlatforms(Array.isArray(post.platforms) ? post.platforms : []);
    setSelectedLocations(Array.isArray(post.locations) ? post.locations : []);
    setScheduledAt(toDatetimeLocal(post.scheduled_at));
    setLinkUrl(post.link || '');
    setCtaButton(post.cta || 'Learn More');
    setMediaFiles([]);
    setMediaPreviews([]);
    setExistingMedia(Array.isArray(post.media) ? post.media : []);
    setActiveTab('compose');
  };

  const closeComposer = () => {
    setActiveTab('content');
    setEditingPost(null);
    for (const preview of mediaPreviews) {
      if (preview.startsWith('blob:')) URL.revokeObjectURL(preview);
    }
    setMediaFiles([]);
    setMediaPreviews([]);
    setExistingMedia([]);
  };

  const togglePlatform = (platform: string) => {
    setSelectedPlatforms((current) => {
      const next = current.includes(platform)
        ? current.filter((p) => p !== platform)
        : [...current, platform];
      if (!next.includes('google')) setSelectedLocations([]);
      return next;
    });
  };

  const toggleLocation = (id: string) => {
    setSelectedLocations((current) => current.includes(id) ? current.filter((v) => v !== id) : [...current, id]);
  };

  const handleMediaUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const incoming = Array.from(event.target.files || []);
    if (!incoming.length) return;

    const combined = [...mediaFiles];
    const acceptedPreviews: string[] = [];

    for (const file of incoming) {
      if (combined.length >= MAX_MEDIA_FILES) {
        showError('Media limit', `You can attach up to ${MAX_MEDIA_FILES} files.`);
        break;
      }
      if (!['image/', 'video/'].some((prefix) => file.type.startsWith(prefix))) {
        showError('Unsupported media', `${file.name} is not an image or video.`);
        continue;
      }
      if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
        showError('File too large', `${file.name} exceeds ${MAX_FILE_SIZE_MB} MB.`);
        continue;
      }
      combined.push(file);
      acceptedPreviews.push(URL.createObjectURL(file));
    }

    setMediaFiles(combined);
    setMediaPreviews((current) => [...current, ...acceptedPreviews]);
    event.target.value = '';
  };

  const removeMedia = (index: number) => {
    const preview = mediaPreviews[index];
    if (preview?.startsWith('blob:')) URL.revokeObjectURL(preview);
    setMediaFiles((current) => current.filter((_, i) => i !== index));
    setMediaPreviews((current) => current.filter((_, i) => i !== index));
  };

  const validateComposer = (action: 'draft' | 'schedule' | 'publish') => {
    if (!selectedPlatforms.length) return 'Select at least one connected platform.';
    const selectedConnected = connectedAccounts.filter((account) => selectedPlatforms.includes(account.platform));
    if (selectedConnected.length !== selectedPlatforms.length) return 'One or more selected platforms are not connected.';
    if (!postContent.trim() && !mediaFiles.length && !mediaPreviews.length && !existingMedia.length && !linkUrl.trim()) return 'Add post content, media, or a link.';
    if (selectedPlatforms.includes('google') && !selectedLocations.length) return 'Select at least one Google Business Profile location.';
    if ((postType === 'link' || selectedPlatforms.includes('google')) && linkUrl && !/^https?:\/\//i.test(linkUrl)) return 'Link URL must start with http:// or https://.';
    if (action === 'schedule') {
      if (!scheduledAt) return 'Select a schedule date and time.';
      const date = new Date(scheduledAt);
      if (Number.isNaN(date.getTime())) return 'The schedule date is invalid.';
      if (date.getTime() <= Date.now()) return 'Scheduled time must be in the future.';
    }
    return null;
  };

  const buildPayload = (status: 'draft' | 'scheduled' | 'published') => ({
    content: postContent.trim(),
    platforms: selectedPlatforms,
    type: postType,
    link: linkUrl.trim() || undefined,
    cta: ctaButton || undefined,
    locations: selectedPlatforms.includes('google') ? selectedLocations : [],
    status,
    scheduled_at: status === 'scheduled' ? new Date(scheduledAt).toISOString() : null,
    mediaFiles: mediaFiles.length ? mediaFiles : undefined,
  });

  const savePost = async (action: 'draft' | 'schedule' | 'publish') => {
    const validation = validateComposer(action);
    if (validation) {
      showError('Check post details', validation);
      return;
    }

    setSubmitting(true);
    try {
      const payload = buildPayload(action === 'publish' ? 'published' : action === 'schedule' ? 'scheduled' : 'draft');
      if (editingPost) {
        await updateMarketingPost(editingPost.id, payload);
      } else {
        await createMarketingPost(payload);
      }

      showSuccess(
        action === 'draft' ? 'Draft saved' : action === 'schedule' ? 'Post scheduled' : 'Publish request submitted',
        action === 'publish'
          ? 'The backend accepted the publish request. Delivery status will be reflected in Content after refresh.'
          : 'The post has been saved successfully.'
      );
      closeComposer();
      await refreshData(false);
      setActiveTab('content');
    } catch (error) {
      showApiErrors(error, action === 'publish' ? 'Publish failed' : 'Save failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handleConnect = async (platform: string) => {
    try {
      const url = await getSocialAuthUrl(platform);
      if (!url) throw new Error(`No OAuth URL was returned for ${PLATFORM_META[platform]?.label || platform}.`);
      window.location.assign(url);
    } catch (error) {
      showApiErrors(error, `Connect ${PLATFORM_META[platform]?.label || platform} failed`);
    }
  };

  const handleDisconnect = async (platform: string) => {
    const label = PLATFORM_META[platform]?.label || platform;
    if (!window.confirm(`Disconnect ${label}? Existing published content will not be deleted.`)) return;
    try {
      await disconnectSocialAccount(platform);
      await refreshData(false);
      showSuccess('Disconnected', `${label} has been disconnected.`);
    } catch (error) {
      showApiErrors(error, `Disconnect ${label} failed`);
    }
  };

  const handleDelete = async (post: MarketingPost) => {
    if (!window.confirm('Delete this marketing post? This only deletes the NixaERP record unless your backend explicitly removes the platform content.')) return;
    try {
      await deleteMarketingPost(post.id);
      setPosts((current) => current.filter((p) => p.id !== post.id));
      showSuccess('Deleted', 'Marketing post record deleted.');
    } catch (error) {
      showApiErrors(error, 'Delete failed');
    }
  };

  const handleCancelSchedule = async (post: MarketingPost) => {
    if (!window.confirm('Cancel this scheduled post?')) return;
    try {
      await updateMarketingPost(post.id, { status: 'cancelled' });
      await refreshData(false);
      showSuccess('Schedule cancelled', 'The scheduled post was cancelled.');
    } catch (error) {
      showApiErrors(error, 'Cancel failed');
    }
  };

  const handleMarkRead = async (messageId: number) => {
    try {
      await markInboxMessageRead(messageId);
      setInbox((current) => current.map((message) => message.id === messageId ? { ...message, is_read: true } : message));
    } catch (error) {
      showApiErrors(error, 'Mark read failed');
    }
  };

  const handleEmailReply = async (message: InboxMessage) => {
    const subject = window.prompt('Reply subject');
    const body = window.prompt('Reply message');
    if (!subject || !body) return;
    try {
      await sendEmailReply(message.sender, subject, body);
      showSuccess('Email sent', 'The reply was accepted by the email service.');
    } catch (error) {
      showApiErrors(error, 'Email reply failed');
    }
  };

  const handleWhatsAppReply = async (message: InboxMessage) => {
    const body = window.prompt('Reply message');
    if (!body) return;
    try {
      await sendWhatsAppReply(message.sender, body);
      showSuccess('WhatsApp sent', 'The reply was accepted by the WhatsApp service.');
    } catch (error) {
      showApiErrors(error, 'WhatsApp reply failed');
    }
  };

  const calendarDays = useMemo(() => {
    const first = new Date(currentYear, currentMonth, 1).getDay();
    const total = new Date(currentYear, currentMonth + 1, 0).getDate();
    const cells: Array<{ day: number; posts: MarketingPost[] }> = [];
    for (let i = 0; i < first; i++) cells.push({ day: 0, posts: [] });
    for (let day = 1; day <= total; day++) {
      const date = new Date(currentYear, currentMonth, day);
      cells.push({
        day,
        posts: posts.filter((post) => {
          const value = post.scheduled_at || post.published_at;
          if (!value) return false;
          const d = new Date(value);
          return d.getFullYear() === date.getFullYear() && d.getMonth() === date.getMonth() && d.getDate() === date.getDate();
        }),
      });
    }
    return cells;
  }, [currentMonth, currentYear, posts]);

  const dashboardLabel = typeof dashboard?.['message'] === 'string' ? String(dashboard['message']) : null;

  // ✅ Fix: typed navigation array with IconType
  const navItems: Array<[string, string, IconType]> = [
    ['overview', 'Overview', FiBarChart2],
    ['compose', 'Compose', FiEdit3],
    ['content', 'Content', FiFileText],
    ['calendar', 'Calendar', FiCalendar],
    ['inbox', 'Inbox', FiMessageSquare],
    ['analytics', 'Analytics', FiBarChart2],
    ['accounts', 'Accounts', FiUsers],
  ];

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-6 text-slate-900">
      <header className="mb-6 overflow-hidden rounded-3xl bg-slate-950 shadow-xl">
        <div className="flex flex-col gap-5 px-5 py-6 md:flex-row md:items-center md:justify-between md:px-7">
          <div>
            <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-cyan-300">
              <span className="h-2 w-2 rounded-full bg-emerald-400" /> NixaERP Marketing Hub
            </div>
            <h1 className="text-2xl font-bold text-white md:text-3xl">Social & Google Business Publishing</h1>
            <p className="mt-1 max-w-2xl text-sm text-slate-300">Connect real accounts, create content, schedule it, publish it, and inspect the backend delivery status.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void refreshData(true)}
              disabled={refreshing}
              className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/10 px-4 py-2.5 text-sm font-semibold text-white hover:bg-white/15 disabled:opacity-50"
            >
              <FiRefreshCw className={clsx(refreshing && 'animate-spin')} size={15} /> Refresh
            </button>
            <button
              type="button"
              onClick={openCreate}
              className="inline-flex items-center gap-2 rounded-xl bg-cyan-400 px-4 py-2.5 text-sm font-bold text-slate-950 hover:bg-cyan-300"
            >
              <FiPlus size={15} /> Create post
            </button>
          </div>
        </div>
        {dashboardLabel && <div className="border-t border-white/10 bg-white/5 px-5 py-3 text-xs text-slate-300">{dashboardLabel}</div>}
      </header>

      {pageError && (
        <div className="mb-5 flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
          <FiAlertCircle className="mt-0.5 shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="font-semibold">Some marketing operations need attention</div>
            <div className="mt-1 whitespace-pre-wrap break-words">{pageError}</div>
          </div>
          <button type="button" onClick={() => setPageError(null)} aria-label="Dismiss" className="rounded-lg p-1 hover:bg-rose-100"><FiX /></button>
        </div>
      )}

      <section className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Connected accounts" value={String(stats.connected)} icon={<FiLink2 />} />
        <StatCard label="Scheduled" value={String(stats.scheduled)} icon={<FiCalendar />} />
        <StatCard label="Published" value={String(stats.published)} icon={<FiCheckCircle />} />
        <StatCard label="Failed" value={String(stats.failed)} icon={<FiXCircle />} />
      </section>

      <nav className="mb-6 flex gap-1 overflow-x-auto rounded-2xl border border-slate-200 bg-white p-1 shadow-sm">
        {navItems.map(([key, label, Icon]) => (
          <button
            key={key}
            type="button"
            onClick={() => setActiveTab(key as typeof activeTab)}
            className={clsx(
              'inline-flex shrink-0 items-center gap-2 rounded-xl px-3.5 py-2.5 text-sm font-semibold',
              activeTab === key ? 'bg-slate-950 text-white' : 'text-slate-600 hover:bg-slate-100'
            )}
          >
            <Icon size={15} /> {label}
          </button>
        ))}
      </nav>

      <main className="rounded-3xl border border-slate-200 bg-white shadow-sm">
        {loading ? (
          <div className="p-10 text-center text-sm text-slate-500">Loading real marketing data…</div>
        ) : activeTab === 'overview' ? (
          <div className="grid gap-5 p-5 md:grid-cols-2 lg:grid-cols-3">
            <div className="rounded-2xl border border-slate-200 p-5">
              <div className="text-xs font-bold uppercase tracking-wide text-slate-500">Audience</div>
              <div className="mt-2 text-3xl font-bold">{formatCount(stats.followers)}</div>
              <div className="mt-1 text-sm text-slate-500">Followers returned by connected integrations</div>
            </div>
            <div className="rounded-2xl border border-slate-200 p-5">
              <div className="text-xs font-bold uppercase tracking-wide text-slate-500">Engagement</div>
              <div className="mt-2 text-3xl font-bold">{formatCount(stats.engagement)}</div>
              <div className="mt-1 text-sm text-slate-500">Aggregated engagement returned by the backend</div>
            </div>
            <div className="rounded-2xl border border-slate-200 p-5">
              <div className="text-xs font-bold uppercase tracking-wide text-slate-500">Distribution</div>
              <div className="mt-2 text-3xl font-bold">{connectedAccounts.length}</div>
              <div className="mt-1 text-sm text-slate-500">Real connected publishing accounts</div>
            </div>
            <div className="rounded-2xl border border-slate-200 p-5 md:col-span-2 lg:col-span-3">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <h2 className="font-bold text-slate-950">Connected channels</h2>
                  <p className="text-sm text-slate-500">Only accounts reported as connected by your backend are available for publishing.</p>
                </div>
                <button type="button" onClick={() => setActiveTab('accounts')} className="text-sm font-semibold text-cyan-700 hover:underline">Manage accounts</button>
              </div>
              {connectedAccounts.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">No connected marketing accounts.</div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {connectedAccounts.map((account) => (
                    <div key={`${account.platform}-${account.id}`} className="rounded-2xl border border-slate-200 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <span className="grid h-10 w-10 place-items-center rounded-xl bg-slate-100 font-bold">{PLATFORM_META[account.platform]?.icon || '?'}</span>
                          <div>
                            <div className="font-semibold">{PLATFORM_META[account.platform]?.label || account.platform}</div>
                            <div className="text-xs text-slate-500">{getAccountLabel(account)}</div>
                          </div>
                        </div>
                        <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" title="Connected" />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : activeTab === 'compose' ? (
          <div className="p-5">
            <div className="mb-5 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-bold">{editingPost ? 'Edit post' : 'Create post'}</h2>
                <p className="text-sm text-slate-500">No local mock publisher is used. Submission goes to your marketing backend.</p>
              </div>
              {editingPost && <StatusBadge status={editingPost.status} />}
            </div>

            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
              <div className="space-y-5">
                <div>
                  <label className="mb-2 block text-sm font-semibold">Publishing accounts</label>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {SUPPORTED_PLATFORMS.map((platform) => {
                      const account = connectedAccounts.find((a) => a.platform === platform);
                      const selected = selectedPlatforms.includes(platform);
                      return (
                        <button
                          key={platform}
                          type="button"
                          disabled={!account}
                          onClick={() => togglePlatform(platform)}
                          className={clsx(
                            'flex items-center justify-between rounded-2xl border px-4 py-3 text-left transition',
                            selected ? 'border-cyan-500 bg-cyan-50' : 'border-slate-200 bg-white hover:bg-slate-50',
                            !account && 'cursor-not-allowed opacity-50'
                          )}
                        >
                          <span className="flex items-center gap-3">
                            <span className="grid h-9 w-9 place-items-center rounded-xl bg-slate-100 font-bold">{PLATFORM_META[platform]?.icon || '?'}</span>
                            <span>
                              <span className="block text-sm font-semibold">{PLATFORM_META[platform]?.label || platform}</span>
                              <span className="block text-xs text-slate-500">{account ? (getAccountLabel(account)) : 'Not connected'}</span>
                            </span>
                          </span>
                          {selected ? <FiCheckCircle className="text-cyan-700" /> : <span className="text-xs text-slate-400">{account ? 'Select' : 'Connect first'}</span>}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {selectedPlatforms.includes('google') && (
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <div className="mb-3 flex items-center gap-2"><FiMapPin /><span className="text-sm font-semibold">Google Business Profile locations</span></div>
                    {gbpLocations.length === 0 ? (
                      <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">No real GBP locations were returned by the connected-account response. Connect/configure Google Business Profile locations in the backend before publishing.</div>
                    ) : (
                      <div className="grid gap-2 sm:grid-cols-2">
                        {gbpLocations.map((location) => (
                          <label key={location.id} className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 bg-white p-3">
                            <input type="checkbox" checked={selectedLocations.includes(location.id)} onChange={() => toggleLocation(location.id)} className="mt-1" />
                            <span className="min-w-0"><span className="block text-sm font-semibold">{location.name}</span><span className="block text-xs text-slate-500">{location.address || 'Address not provided by backend'}</span></span>
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="text-sm font-semibold">Post type
                    <select value={postType} onChange={(e) => setPostType(e.target.value as PostType)} className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal outline-none focus:border-cyan-500">
                      {POST_TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
                    </select>
                  </label>
                  <label className="text-sm font-semibold">Call to action
                    <select value={ctaButton} onChange={(e) => setCtaButton(e.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal outline-none focus:border-cyan-500">
                      <option>Learn More</option><option>Book Now</option><option>Shop Now</option><option>Sign Up</option><option>Call Now</option>
                    </select>
                  </label>
                </div>

                <label className="block text-sm font-semibold">Content
                  <textarea value={postContent} onChange={(e) => setPostContent(e.target.value)} rows={8} className="mt-2 w-full rounded-2xl border border-slate-200 p-4 text-sm outline-none focus:border-cyan-500" placeholder="Write the real content to publish…" />
                </label>

                <div>
                  <div className="mb-2 flex items-center justify-between"><label className="text-sm font-semibold">Media</label><span className="text-xs text-slate-500">Up to {MAX_MEDIA_FILES} files, {MAX_FILE_SIZE_MB} MB each</span></div>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    {mediaPreviews.map((preview, index) => {
                      const file = mediaFiles[index];
                      return (
                        <div key={`${preview}-${index}`} className="relative overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
                          {file?.type.startsWith('video/') || (!file && preview.toLowerCase().match(/\.(mp4|mov|webm)$/)) ? <video src={preview} controls className="h-28 w-full object-cover" /> : <img src={preview} alt="Post media" className="h-28 w-full object-cover" />}
                          <button type="button" onClick={() => removeMedia(index)} className="absolute right-2 top-2 rounded-full bg-slate-950/80 p-1.5 text-white"><FiX size={13} /></button>
                        </div>
                      );
                    })}
                    <button type="button" onClick={() => fileInputRef.current?.click()} className="flex h-28 flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-slate-300 text-sm text-slate-500 hover:bg-slate-50">
                      <FiUploadCloud size={22} /> Add media
                    </button>
                  </div>
                  <input ref={fileInputRef} type="file" multiple accept="image/*,video/*" onChange={handleMediaUpload} className="hidden" />
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="text-sm font-semibold">Link URL
                    <input type="url" value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal outline-none focus:border-cyan-500" placeholder="https://…" />
                  </label>
                  <label className="text-sm font-semibold">Schedule time
                    <input type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal outline-none focus:border-cyan-500" />
                  </label>
                </div>
              </div>

              <aside className="space-y-4">
                <div className="sticky top-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="mb-3 flex items-center justify-between"><h3 className="font-bold">Preview</h3><span className="text-xs text-slate-500">UI preview only</span></div>
                  <div className="rounded-2xl bg-white p-4 shadow-sm">
                    <div className="mb-3 flex items-center gap-2"><span className="grid h-9 w-9 place-items-center rounded-lg bg-slate-100 font-bold">{PLATFORM_META[selectedPlatforms[0]]?.icon || '?'}</span><div><div className="text-sm font-semibold">{PLATFORM_META[selectedPlatforms[0]]?.label || 'Select a platform'}</div><div className="text-xs text-slate-400">Platform rendering varies by API</div></div></div>
                    <div className="whitespace-pre-wrap break-words text-sm text-slate-700">{postContent || 'Content will appear here.'}</div>
                    {(existingMedia.length > 0 || mediaPreviews.length > 0) && <div className="mt-3 grid grid-cols-2 gap-2">{[...existingMedia, ...mediaPreviews].slice(0, 4).map((src, i) => <img key={`${src}-${i}`} src={src} alt="Preview" className="h-24 w-full rounded-xl object-cover" />)}</div>}
                    {linkUrl && <a href={linkUrl} target="_blank" rel="noreferrer" className="mt-3 block break-all text-xs font-medium text-cyan-700 hover:underline"><FiExternalLink className="mr-1 inline" />{linkUrl}</a>}
                  </div>

                  <div className="mt-4 grid gap-2">
                    <button type="button" disabled={submitting} onClick={() => void savePost('draft')} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold hover:bg-slate-100 disabled:opacity-50"><FiFileText /> Save draft</button>
                    <button type="button" disabled={submitting} onClick={() => void savePost('schedule')} className="inline-flex items-center justify-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800 hover:bg-amber-100 disabled:opacity-50"><FiClock /> Schedule</button>
                    <button type="button" disabled={submitting} onClick={() => void savePost('publish')} className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"><FiSend /> {submitting ? 'Submitting…' : 'Publish now'}</button>
                    <button type="button" disabled={submitting} onClick={closeComposer} className="rounded-xl px-4 py-2 text-sm font-semibold text-slate-500 hover:bg-slate-100">Close</button>
                  </div>
                </div>
              </aside>
            </div>
          </div>
        ) : activeTab === 'content' ? (
          <div className="p-5">
            <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div><h2 className="text-xl font-bold">Content</h2><p className="text-sm text-slate-500">Real records returned by the marketing backend.</p></div>
              <button type="button" onClick={openCreate} className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white"><FiPlus /> Create post</button>
            </div>
            <div className="mb-4 grid gap-3 md:grid-cols-[1fr_auto_auto]">
              <div className="relative"><FiSearch className="absolute left-3 top-3 text-slate-400" /><input value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="Search content…" className="w-full rounded-xl border border-slate-200 py-2.5 pl-10 pr-3 text-sm outline-none focus:border-cyan-500" /></div>
              <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm"><option value="all">All statuses</option><option value="draft">Draft</option><option value="scheduled">Scheduled</option><option value="publishing">Publishing</option><option value="published">Published</option><option value="failed">Failed</option><option value="cancelled">Cancelled</option></select>
              <select value={filterPlatform} onChange={(e) => setFilterPlatform(e.target.value)} className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm"><option value="all">All platforms</option>{SUPPORTED_PLATFORMS.map((platform) => <option key={platform} value={platform}>{PLATFORM_META[platform]?.label || platform}</option>)}</select>
            </div>

            {filteredPosts.length === 0 ? <div className="rounded-2xl border border-dashed border-slate-300 p-10 text-center text-sm text-slate-500">No posts match the current filters.</div> : <div className="overflow-x-auto rounded-2xl border border-slate-200"><table className="min-w-full text-left text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3">Content</th><th className="px-4 py-3">Platforms</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Schedule / publish</th><th className="px-4 py-3 text-right">Actions</th></tr></thead><tbody className="divide-y divide-slate-100">{filteredPosts.map((post) => <tr key={post.id} className="align-top hover:bg-slate-50"><td className="max-w-md px-4 py-4"><div className="line-clamp-3 font-medium">{String(post.content || 'Untitled post')}</div>{post.failure_reason && <div className="mt-2 rounded-lg bg-rose-50 p-2 text-xs text-rose-700">{post.failure_reason}</div>}</td><td className="px-4 py-4"><div className="flex flex-wrap gap-1.5">{(post.platforms || []).map((platform) => <span key={platform} className="rounded-lg bg-slate-100 px-2 py-1 text-xs font-medium">{PLATFORM_META[platform]?.label || platform}</span>)}</div></td><td className="px-4 py-4"><StatusBadge status={post.status} /></td><td className="whitespace-nowrap px-4 py-4 text-xs text-slate-500">{formatDate(post.scheduled_at || post.published_at)}</td><td className="px-4 py-4"><div className="flex justify-end gap-1"><button type="button" onClick={() => openEdit(post)} title="Edit" className="rounded-lg p-2 text-blue-700 hover:bg-blue-50"><FiEdit3 /></button><button type="button" onClick={() => { setEditingPost(null); setPostContent(String(post.content || '')); setPostType((post.type || 'text') as PostType); setSelectedPlatforms(post.platforms || []); setSelectedLocations(post.locations || []); setLinkUrl(post.link || ''); setCtaButton(post.cta || 'Learn More'); setScheduledAt(''); setMediaFiles([]); setMediaPreviews(post.media || []); setActiveTab('compose'); }} title="Duplicate" className="rounded-lg p-2 text-violet-700 hover:bg-violet-50"><FiCopy /></button>{post.status === 'scheduled' && <button type="button" onClick={() => void handleCancelSchedule(post)} title="Cancel schedule" className="rounded-lg p-2 text-amber-700 hover:bg-amber-50"><FiXCircle /></button>}<button type="button" onClick={() => void handleDelete(post)} title="Delete" className="rounded-lg p-2 text-rose-700 hover:bg-rose-50"><FiTrash2 /></button></div></td></tr>)}</tbody></table></div>}
          </div>
        ) : activeTab === 'calendar' ? (
          <div className="p-5">
            <div className="mb-5 flex items-center justify-between"><button type="button" onClick={() => { if (currentMonth === 0) { setCurrentMonth(11); setCurrentYear((y) => y - 1); } else setCurrentMonth((m) => m - 1); }} className="rounded-xl border border-slate-200 p-2 hover:bg-slate-50"><FiChevronLeft /></button><h2 className="font-bold">{new Date(currentYear, currentMonth, 1).toLocaleString(undefined, { month: 'long', year: 'numeric' })}</h2><button type="button" onClick={() => { if (currentMonth === 11) { setCurrentMonth(0); setCurrentYear((y) => y + 1); } else setCurrentMonth((m) => m + 1); }} className="rounded-xl border border-slate-200 p-2 hover:bg-slate-50"><FiChevronRight /></button></div>
            <div className="grid grid-cols-7 gap-2 text-center text-xs font-semibold text-slate-500">{['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map((day) => <div key={day} className="py-2">{day}</div>)}</div>
            <div className="grid grid-cols-7 gap-2">{calendarDays.map((cell, index) => <div key={index} className={clsx('min-h-28 rounded-xl border p-2', cell.day ? 'border-slate-200 bg-white' : 'border-transparent bg-slate-50')}>
              {cell.day > 0 && <><div className="mb-2 text-right text-xs font-semibold text-slate-500">{cell.day}</div><div className="space-y-1">{cell.posts.slice(0, 4).map((post) => <button key={post.id} type="button" onClick={() => openEdit(post)} className="block w-full truncate rounded-lg bg-slate-100 px-2 py-1 text-left text-[11px] hover:bg-slate-200"><span className="font-semibold">{(post.platforms || []).map((p) => PLATFORM_META[p]?.label || p).join(', ')}</span><span className="ml-1">{String(post.content || '').slice(0, 25)}</span></button>)}</div></>}
            </div>)}</div>
          </div>
        ) : activeTab === 'inbox' ? (
          <div className="p-5">
            <div className="mb-5"><h2 className="text-xl font-bold">Unified Inbox</h2><p className="text-sm text-slate-500">Real inbox messages returned by the backend.</p></div>
            {inbox.length === 0 ? <div className="rounded-2xl border border-dashed border-slate-300 p-10 text-center text-sm text-slate-500">No inbox messages returned.</div> : <div className="space-y-3">{inbox.map((message) => <div key={message.id} className={clsx('rounded-2xl border p-4', message.is_read ? 'border-slate-200 bg-white' : 'border-cyan-200 bg-cyan-50')}><div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between"><div><div className="flex items-center gap-2"><span className="text-xs font-bold uppercase text-slate-500">{message.channel}</span><span className="font-semibold">{message.sender}</span></div><div className="mt-1 text-xs text-slate-400">{formatDate(message.received_at)}</div></div>{!message.is_read && <button type="button" onClick={() => void handleMarkRead(message.id)} className="text-xs font-semibold text-cyan-700 hover:underline">Mark read</button>}</div><p className="mt-3 whitespace-pre-wrap text-sm text-slate-700">{message.body}</p><div className="mt-3 flex gap-3">{message.channel === 'email' && <button type="button" onClick={() => void handleEmailReply(message)} className="text-xs font-semibold text-blue-700 hover:underline">Reply email</button>}{message.channel === 'whatsapp' && <button type="button" onClick={() => void handleWhatsAppReply(message)} className="text-xs font-semibold text-emerald-700 hover:underline">Reply WhatsApp</button>}</div></div>)}</div>}
          </div>
        ) : activeTab === 'analytics' ? (
          <div className="p-5">
            <div className="mb-5"><h2 className="text-xl font-bold">Analytics</h2><p className="text-sm text-slate-500">Only values returned by your analytics integration are displayed. No fallback numbers are injected.</p></div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><StatCard label="Followers" value={formatCount(stats.followers)} icon={<FiUsers />} /><StatCard label="Engagement" value={formatCount(stats.engagement)} icon={<FiBarChart2 />} /><StatCard label="Reach" value={formatCount(stats.reach)} icon={<FiUsers />} /><StatCard label="Impressions" value={formatCount(stats.impressions)} icon={<FiEyeSafe />} /></div>
            <div className="mt-5 rounded-2xl border border-slate-200 p-5"><h3 className="font-semibold">Raw analytics fields</h3><pre className="mt-3 overflow-auto rounded-xl bg-slate-950 p-4 text-xs text-slate-200">{JSON.stringify(analytics, null, 2)}</pre></div>
          </div>
        ) : (
          <div className="p-5">
            <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="text-xl font-bold">Connected accounts</h2><p className="text-sm text-slate-500">OAuth and account status come from the marketing backend.</p></div></div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{SUPPORTED_PLATFORMS.map((platform) => { const account = accounts.find((a) => a.platform === platform && a.status === 'connected'); return <div key={platform} className="rounded-2xl border border-slate-200 p-4"><div className="flex items-center gap-3"><span className="grid h-11 w-11 place-items-center rounded-xl bg-slate-100 font-bold">{PLATFORM_META[platform]?.icon || '?'}</span><div className="min-w-0 flex-1"><div className="font-semibold">{PLATFORM_META[platform]?.label || platform}</div><div className="truncate text-xs text-slate-500">{account ? (getAccountLabel(account)) : 'Not connected'}</div></div></div><div className="mt-4 flex items-center justify-between"><StatusBadge status={account ? 'connected' : 'disconnected'} />{account ? <button type="button" onClick={() => void handleDisconnect(platform)} className="text-xs font-semibold text-rose-700 hover:underline">Disconnect</button> : <button type="button" onClick={() => void handleConnect(platform)} className="text-xs font-semibold text-cyan-700 hover:underline">Connect</button>}</div></div>; })}</div>
          </div>
        )}
      </main>

    </div>
  );
}

function FiEyeSafe() {
  return <span aria-hidden="true">◎</span>;
}