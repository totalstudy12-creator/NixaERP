import {
  useEffect, useState, useCallback, useMemo, lazy, Suspense, memo
} from 'react';
import {
  FiPlus, FiRefreshCw, FiTrash2, FiEdit, FiDownload,
  FiChevronDown, FiChevronRight, FiAlertCircle, FiFilter, FiSearch,
  FiTarget, FiBarChart2, FiCalendar, FiCheckCircle, FiXCircle,
  FiCopy, FiPlayCircle, FiLink, FiLink2, FiUsers, FiMessageSquare,
  FiImage, FiVideo, FiFileText, FiClock, FiStar, FiPaperclip,
  FiEye, FiSend, FiSettings, FiMoreHorizontal, FiGrid, FiList
} from 'react-icons/fi';
import clsx from 'clsx';

// ---------- Lazy components ----------
const ModernDataTable = lazy(() =>
  import('../components/ModernDataTable').then(m => ({ default: m.ModernDataTable }))
);
const Offcanvas = lazy(() =>
  import('../components/Offcanvas').then(m => ({ default: m.Offcanvas }))
);

import { useNotification } from '../components/NotificationContext';
import { addAppLog } from '../services/appLogger';
import {
  getMarketingAccounts,
  getMarketingAnalytics,
  getMarketingDashboard,
  getMarketingInbox,
  getMarketingPosts,
  createMarketingPost,
  updateMarketingPost,
  deleteMarketingPost,
  type SocialAccount,
  type SocialPost,
} from '../services/marketingService';

// ---------- Types ----------
interface Post extends SocialPost {
  type: 'text' | 'image' | 'carousel' | 'video' | 'reel' | 'story' | 'poll';
  platforms: string[];
  engagement: { likes: number; comments: number; shares: number; clicks: number };
}

// ---------- Platform icons ----------
const PLATFORM_ICONS: Record<string, string> = {
  facebook: '📘',
  instagram: '📷',
  twitter: '🐦',
  linkedin: '🔗',
  youtube: '🎬',
  tiktok: '🎵',
  threads: '🧵',
  google: '📍',
  whatsapp: '💬',
  pinterest: '📌',
  telegram: '✈️',
};


// ---------- Stat Card ----------
const StatCard = memo(({ icon: Icon, label, value, tone, prefix }: {
  icon: any;
  label: string;
  value: string | number;
  tone: 'blue' | 'emerald' | 'amber' | 'rose' | 'purple' | 'teal';
  prefix?: string;
}) => {
  const bg =
    tone === 'blue' ? 'bg-blue-100 text-blue-600' :
    tone === 'emerald' ? 'bg-emerald-100 text-emerald-600' :
    tone === 'amber' ? 'bg-amber-100 text-amber-600' :
    tone === 'rose' ? 'bg-rose-100 text-rose-600' :
    tone === 'purple' ? 'bg-purple-100 text-purple-600' :
    'bg-teal-100 text-teal-600';
  return (
    <div className="flex items-center gap-3 rounded-xl border border-slate-100 bg-white p-4 shadow-sm">
      <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${bg}`}><Icon size={20} /></div>
      <div>
        <p className="text-xs font-medium text-slate-500">{label}</p>
        <p className="text-2xl font-bold text-slate-900">{prefix}{value}</p>
      </div>
    </div>
  );
});

// ---------- Component ----------
export function MarketingPage() {
  const { showSuccess, showError } = useNotification();
  const [activeTab, setActiveTab] = useState<string>('dashboard');

  // Data
  const [accounts, setAccounts] = useState<SocialAccount[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(false);
  const [dashboardError, setDashboardError] = useState<string | null>(null);
  const [analytics, setAnalytics] = useState<{ followers: number; engagement: number; accounts: number; message?: string } | null>(null);
  const [inbox, setInbox] = useState<any[]>([]);

  // Search & Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterPlatform, setFilterPlatform] = useState<string>('all');
  const [filterType, setFilterType] = useState<string>('all');

  // Offcanvas for post create/edit
  const [isPostPanelOpen, setIsPostPanelOpen] = useState(false);
  const [editingPost, setEditingPost] = useState<Post | null>(null);
  const [postForm, setPostForm] = useState<{
    content: string;
    type: Post['type'];
    platforms: string[];
    scheduled_at: string;
  }>({ content: '', type: 'text', platforms: [], scheduled_at: '' });
  const [submitting, setSubmitting] = useState(false);

  // Calendar view
  const [currentMonth, setCurrentMonth] = useState(new Date().getMonth());
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear());

  // AI content generator
  const [aiPrompt, setAiPrompt] = useState('');
  const [generatingAI, setGeneratingAI] = useState(false);

  const refreshData = useCallback(async () => {
    setLoading(true);
    setDashboardError(null);

    try {
      const [dashboard, accountsData, postsData, analyticsData, inboxData] = await Promise.all([
        getMarketingDashboard(),
        getMarketingAccounts(),
        getMarketingPosts(),
        getMarketingAnalytics(),
        getMarketingInbox(),
      ]);

      setAccounts(accountsData);
      setPosts((postsData || []).map((post: SocialPost) => ({
        ...post,
        type: 'text',
        platforms: Array.isArray((post as any).metadata?.platforms) ? (post as any).metadata.platforms : [],
        engagement: { likes: 0, comments: 0, shares: 0, clicks: 0 },
      })));
      setAnalytics(analyticsData || { followers: 0, engagement: 0, accounts: 0, message: 'Analytics unavailable' });
      setInbox(Array.isArray(inboxData) ? inboxData : []);
      setAccounts((accountsData || []).map((account) => ({
        ...account,
        account_name: account.account_name ?? account.username ?? account.platform,
      })));
      setPosts((postsData || []).map((post) => ({
        ...post,
        type: 'text',
        platforms: Array.isArray((post as any).metadata?.platforms) ? (post as any).metadata.platforms : [],
        engagement: { likes: 0, comments: 0, shares: 0, clicks: 0 },
      })));
      const dashboardStats = dashboard || { connected_accounts: 0, scheduled_posts: 0, total_followers: 0, total_engagement: 0, accounts: [], posts: [] };
      if (dashboardStats.accounts?.length) setAccounts(dashboardStats.accounts as SocialAccount[]);
      if (dashboardStats.posts?.length) setPosts((dashboardStats.posts as SocialPost[]).map((post: SocialPost) => ({
        ...post,
        type: 'text',
        platforms: Array.isArray((post as any).metadata?.platforms) ? (post as any).metadata.platforms : [],
        engagement: { likes: 0, comments: 0, shares: 0, clicks: 0 },
      })));
      showSuccess('Refreshed', 'Marketing data updated.');
    } catch (error: any) {
      const message = error?.message || 'Unable to load marketing data';
      setDashboardError(message);
      showError('Marketing update failed', message);
    } finally {
      setLoading(false);
    }
  }, [showError, showSuccess]);

  useEffect(() => { void refreshData(); }, [refreshData]);

  // ---------- Filtered posts ----------
  const filteredPosts = useMemo(() => {
    let filtered = [...posts];
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(p => p.content.toLowerCase().includes(term));
    }
    if (filterStatus !== 'all') filtered = filtered.filter(p => p.status === filterStatus);
    if (filterPlatform !== 'all') filtered = filtered.filter(p => p.platforms.includes(filterPlatform));
    if (filterType !== 'all') filtered = filtered.filter(p => p.type === filterType);
    return filtered;
  }, [posts, searchTerm, filterStatus, filterPlatform, filterType]);

  // ---------- Stats ----------
  const stats = useMemo(() => ({
    totalPosts: posts.length,
    scheduled: posts.filter(p => p.status === 'scheduled').length,
    published: posts.filter(p => p.status === 'published').length,
    draft: posts.filter(p => p.status === 'draft').length,
    connectedAccounts: accounts.filter(a => a.status === 'connected').length,
    totalFollowers: analytics?.followers ?? 0,
    totalEngagement: analytics?.engagement ?? 0,
  }), [posts, accounts, analytics]);

  // ---------- Post CRUD ----------
  const handleCreatePost = () => {
    setEditingPost(null);
    setPostForm({ content: '', type: 'text', platforms: [], scheduled_at: '' });
    setIsPostPanelOpen(true);
  };

  const handleEditPost = (post: Post) => {
    setEditingPost(post);
    setPostForm({
      content: post.content,
      type: post.type,
      platforms: post.platforms,
      scheduled_at: post.scheduled_at || '',
    });
    setIsPostPanelOpen(true);
  };

  const handleDeletePost = async (id: number) => {
    if (confirm('Delete this post?')) {
      try {
        await deleteMarketingPost(id);
        setPosts(prev => prev.filter(p => p.id !== id));
        showSuccess('Deleted', 'Post removed.');
      } catch (error: any) {
        showError('Delete failed', error?.message || 'Unable to delete post');
      }
    }
  };

  const handleSavePost = async () => {
    if (!postForm.content.trim()) { showError('Validation', 'Content is required.'); return; }
    if (postForm.platforms.length === 0) { showError('Validation', 'Select at least one platform.'); return; }
    setSubmitting(true);
    try {
      if (editingPost) {
        await updateMarketingPost(editingPost.id, {
          content: postForm.content,
          scheduled_at: postForm.scheduled_at || null,
          status: postForm.scheduled_at ? 'scheduled' : editingPost.status,
          metadata: { platforms: postForm.platforms },
        });
        setPosts(prev => prev.map(p => p.id === editingPost.id ? { ...p, content: postForm.content, platforms: postForm.platforms, scheduled_at: postForm.scheduled_at || null, status: postForm.scheduled_at ? 'scheduled' : p.status } : p));
      } else {
        const created = await createMarketingPost({
          content: postForm.content,
          platforms: postForm.platforms,
          status: postForm.scheduled_at ? 'scheduled' : 'draft',
          scheduled_at: postForm.scheduled_at || null,
        });
        const newPost = {
          ...(created?.data || created),
          id: created?.data?.id ?? Date.now(),
          content: postForm.content,
          type: postForm.type,
          platforms: postForm.platforms,
          status: postForm.scheduled_at ? 'scheduled' : 'draft',
          scheduled_at: postForm.scheduled_at || null,
          published_at: null,
          engagement: { likes: 0, comments: 0, shares: 0, clicks: 0 },
          created_at: new Date().toISOString(),
        } as Post;
        setPosts(prev => [newPost, ...prev]);
      }
      showSuccess('Saved', 'Post saved successfully.');
      setIsPostPanelOpen(false);
    } catch (error: any) {
      showError('Save failed', error?.message || 'Unable to save post');
    } finally {
      setSubmitting(false);
    }
  };

  // AI content generation
  const generateAIContent = async () => {
    if (!aiPrompt.trim()) return;
    setGeneratingAI(true);
    setTimeout(() => {
      const generated = `✨ AI generated content based on "${aiPrompt}":\n\n"Discover how our latest features can boost your business efficiency. Try it today! #BusinessOS #Automation"`;
      setPostForm(prev => ({ ...prev, content: prev.content + '\n' + generated }));
      setGeneratingAI(false);
      showSuccess('AI Generated', 'Content added to your post.');
    }, 1000);
  };

  // ---------- Calendar helper ----------
  const calendarDays = useMemo(() => {
    const firstDay = new Date(currentYear, currentMonth, 1).getDay();
    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
    const today = new Date();
    const days: { date: number; isToday: boolean; posts: Post[] }[] = [];
    for (let i = 1; i <= daysInMonth; i++) {
      const date = new Date(currentYear, currentMonth, i);
      const dayPosts = posts.filter(p => {
        const d = p.scheduled_at || p.published_at;
        return d && new Date(d).toDateString() === date.toDateString();
      });
      days.push({ date: i, isToday: date.toDateString() === today.toDateString(), posts: dayPosts });
    }
    const emptyStart = Array.from({ length: firstDay }, () => ({ date: 0, isToday: false, posts: [] as Post[] }));
    return [...emptyStart, ...days];
  }, [posts, currentMonth, currentYear]);

  const navigateMonth = (direction: number) => {
    let month = currentMonth + direction;
    let year = currentYear;
    if (month < 0) { month = 11; year--; }
    if (month > 11) { month = 0; year++; }
    setCurrentMonth(month);
    setCurrentYear(year);
  };

  // ---------- Render ----------
  return (
    <div className="min-h-screen bg-[#f5f7fb] p-4 md:p-7 text-slate-800">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-5 mb-6 rounded-3xl bg-slate-950 px-5 py-6 md:px-8 md:py-7 shadow-xl shadow-slate-300/50">
        <div>
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-cyan-300">
            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" /> Social Media Hub
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white md:text-3xl flex items-center gap-3">
            <FiLink className="text-cyan-300" /> Social Media Management
          </h1>
          <p className="text-sm text-slate-300">Create, schedule, publish & analyse all social content from one place.</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => void refreshData()} disabled={loading} className="rounded-xl bg-white/10 px-3 py-2 text-sm font-medium text-white ring-1 ring-white/15 transition hover:bg-white/20 disabled:opacity-60">
            <FiRefreshCw className={loading ? 'animate-spin inline mr-1' : 'inline mr-1'} size={14} /> Refresh
          </button>
          <button onClick={handleCreatePost} className="rounded-xl bg-cyan-400 text-slate-950 px-3 py-2 text-sm font-medium transition hover:bg-cyan-300 shadow-md shadow-cyan-500/20">
            <FiPlus className="inline mr-1" size={14} /> Create Post
          </button>
        </div>
      </div>

      {dashboardError && <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{dashboardError}</div>}
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard icon={FiLink2} label="Connected Accounts" value={stats.connectedAccounts} tone="blue" />
        <StatCard icon={FiUsers} label="Total Followers" value={stats.totalFollowers === 0 ? '—' : stats.totalFollowers.toLocaleString()} tone="emerald" />
        <StatCard icon={FiBarChart2} label="Total Engagement" value={stats.totalEngagement === 0 ? '—' : stats.totalEngagement.toLocaleString()} tone="amber" />
        <StatCard icon={FiCalendar} label="Scheduled Posts" value={stats.scheduled} tone="purple" />
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 mb-6 bg-white rounded-xl p-1 border border-slate-200 w-fit overflow-x-auto">
        {[
          { key: 'dashboard', label: 'Dashboard', icon: FiGrid },
          { key: 'content', label: 'Content & Scheduling', icon: FiFileText },
          { key: 'calendar', label: 'Calendar', icon: FiCalendar },
          { key: 'inbox', label: 'Inbox', icon: FiMessageSquare },
          { key: 'analytics', label: 'Analytics', icon: FiBarChart2 },
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={clsx(
              'px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap flex items-center gap-1',
              activeTab === tab.key ? 'bg-blue-500 text-white shadow-sm' : 'text-slate-600 hover:text-slate-800'
            )}
          >
            <tab.icon size={16} /> {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 md:p-6">
        {/* Dashboard */}
        {activeTab === 'dashboard' && (
          <div className="space-y-6">
            <h2 className="text-xl font-semibold">Connected Accounts</h2>
            {accounts.length === 0 ? (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">No connected accounts configured.</div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
                {accounts.map(acc => (
                  <div key={acc.id} className={clsx('p-4 rounded-xl border', acc.status === 'connected' ? 'bg-blue-50 border-blue-200' : 'bg-gray-50 border-gray-200 opacity-60')}>
                    <div className="text-2xl mb-2">{PLATFORM_ICONS[acc.platform] ?? '🔗'}</div>
                    <p className="font-medium text-sm">{acc.account_name ?? acc.platform}</p>
                    <p className="text-xs text-slate-500">{acc.username ?? acc.external_account_id ?? 'Not connected'}</p>
                    {acc.status === 'connected' ? (
                      <span className="text-xs text-emerald-600 mt-2 block">✔ Connected</span>
                    ) : (
                      <button className="text-xs text-blue-600 mt-2">Connect</button>
                    )}
                  </div>
                ))}
              </div>
            )}
            <h2 className="text-xl font-semibold mt-8">Recent Posts</h2>
            <div className="space-y-3">
              {posts.length === 0 ? (
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">No posts found.</div>
              ) : posts.slice(0, 3).map(post => (
                <div key={post.id} className="p-3 bg-slate-50 rounded-xl flex justify-between items-start">
                  <div>
                    <p className="text-sm font-medium">{post.content.slice(0, 80)}{post.content.length > 80 ? '...' : ''}</p>
                    <div className="flex gap-2 text-xs text-slate-400 mt-1">
                      <span>{post.status}</span> • <span>{post.platforms.join(', ') || 'No platform selected'}</span>
                    </div>
                  </div>
                  <span className="text-xs text-slate-400">{post.created_at ? new Date(post.created_at).toLocaleDateString() : '—'}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Content & Scheduling */}
        {activeTab === 'content' && (
          <>
            <div className="flex flex-col sm:flex-row gap-4 mb-4">
              <div className="relative flex-1 max-w-md">
                <FiSearch className="absolute left-3 top-2.5 text-slate-400" size={18} />
                <input
                  type="text"
                  placeholder="Search posts..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-sm outline-none focus:border-cyan-400 focus:ring-4 focus:ring-cyan-100"
                />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <FiFilter size={16} className="text-slate-500" />
                <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="input-field w-32 text-sm">
                  <option value="all">All Status</option>
                  <option value="draft">Draft</option>
                  <option value="scheduled">Scheduled</option>
                  <option value="published">Published</option>
                  <option value="failed">Failed</option>
                </select>
                <select value={filterPlatform} onChange={(e) => setFilterPlatform(e.target.value)} className="input-field w-32 text-sm">
                  <option value="all">All Platforms</option>
                  {[...new Set(posts.flatMap(p => p.platforms))].map(pf => <option key={pf} value={pf}>{pf}</option>)}
                </select>
                <select value={filterType} onChange={(e) => setFilterType(e.target.value)} className="input-field w-32 text-sm">
                  <option value="all">All Types</option>
                  <option value="text">Text</option>
                  <option value="image">Image</option>
                  <option value="video">Video</option>
                  <option value="carousel">Carousel</option>
                  <option value="reel">Reel</option>
                  <option value="story">Story</option>
                  <option value="poll">Poll</option>
                </select>
              </div>
            </div>
            <Suspense fallback={<div className="h-48 bg-slate-200 animate-pulse rounded" />}>
              <ModernDataTable
                title=""
                columns={[
                  {
                    name: 'Content',
                    selector: (row: Post) => row.content.slice(0, 60),
                    sortable: true,
                    cell: (row: Post) => <span className="text-sm">{row.content.slice(0, 60)}{row.content.length > 60 ? '...' : ''}</span>,
                    width: '250px',
                  },
                  {
                    name: 'Platforms',
                    selector: (row: Post) => row.platforms.join(', '),
                    cell: (row: Post) => <div className="flex gap-1">{row.platforms.map(p => <span key={p} className="text-xs">{PLATFORM_ICONS[p]}</span>)}</div>,
                    width: '130px',
                  },
                  {
                    name: 'Status',
                    selector: (row: Post) => row.status,
                    cell: (row: Post) => (
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                        row.status === 'published' ? 'bg-emerald-100 text-emerald-700' :
                        row.status === 'scheduled' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-700'
                      }`}>{row.status}</span>
                    ),
                    width: '110px',
                  },
                  {
                    name: 'Engagement',
                    selector: (row: Post) => row.engagement.likes + row.engagement.comments + row.engagement.shares + row.engagement.clicks,
                    cell: (row: Post) => <span className="text-sm">{row.engagement.likes + row.engagement.comments + row.engagement.shares + row.engagement.clicks}</span>,
                    width: '120px',
                  },
                  {
                    name: 'Actions',
                    cell: (row: Post) => (
                      <div className="flex gap-1">
                        <button onClick={() => handleEditPost(row)} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg"><FiEdit size={16} /></button>
                        <button onClick={() => handleDeletePost(row.id)} className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg"><FiTrash2 size={16} /></button>
                      </div>
                    ),
                    width: '100px',
                  },
                ]}
                data={filteredPosts}
                loading={loading}
                selectable={false}
                striped
                highlightOnHover
              />
            </Suspense>
          </>
        )}

        {/* Calendar */}
        {activeTab === 'calendar' && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <button onClick={() => navigateMonth(-1)} className="btn btn-ghost text-sm">‹ Prev</button>
              <h3 className="text-lg font-semibold">{new Date(currentYear, currentMonth).toLocaleString('default', { month: 'long', year: 'numeric' })}</h3>
              <button onClick={() => navigateMonth(1)} className="btn btn-ghost text-sm">Next ›</button>
            </div>
            <div className="grid grid-cols-7 gap-1 text-center text-sm">
              {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d => <div key={d} className="font-medium text-slate-500">{d}</div>)}
              {calendarDays.map((day, idx) => (
                <div
                  key={idx}
                  className={clsx(
                    'p-2 border rounded-lg min-h-[80px] cursor-pointer hover:bg-blue-50 transition-colors',
                    day.isToday ? 'border-blue-500 bg-blue-50' : 'border-slate-200',
                    day.date === 0 && 'border-transparent bg-transparent'
                  )}
                >
                  {day.date !== 0 && (
                    <>
                      <span className="block text-right text-sm">{day.date}</span>
                      {day.posts.map(post => (
                        <div key={post.id} className="mt-1 text-xs bg-slate-200 rounded px-1 truncate" title={post.content}>
                          {post.type === 'image' ? '📷' : post.type === 'video' ? '🎬' : '📝'} {post.content.slice(0, 10)}...
                        </div>
                      ))}
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Inbox */}
        {activeTab === 'inbox' && (
          <div className="space-y-4">
            <h2 className="text-xl font-semibold">Unified Inbox</h2>
            <p className="text-sm text-slate-500">Messages and comments from connected platforms will appear here. Integration coming soon.</p>
            {[
              { id: 1, from: 'John Doe', platform: 'instagram', preview: 'Great product!', time: '2 min ago' },
              { id: 2, from: 'Sarah K', platform: 'facebook', preview: 'I need help with my order...', time: '15 min ago' },
            ].map(conv => (
              <div key={conv.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl">
                <div>
                  <p className="font-medium text-sm">{conv.from}</p>
                  <p className="text-xs text-slate-500">{conv.preview}</p>
                </div>
                <div className="text-xs text-slate-400">{conv.time} via {PLATFORM_ICONS[conv.platform]}</div>
              </div>
            ))}
          </div>
        )}

        {/* Analytics */}
        {activeTab === 'analytics' && (
          <div className="space-y-6">
            <h2 className="text-xl font-semibold">Analytics Overview</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="p-4 bg-slate-50 rounded-xl">
                <p className="text-sm text-slate-500">Total Followers</p>
                <p className="text-2xl font-bold">{stats.totalFollowers === 0 ? '—' : stats.totalFollowers.toLocaleString()}</p>
              </div>
              <div className="p-4 bg-slate-50 rounded-xl">
                <p className="text-sm text-slate-500">Total Engagement</p>
                <p className="text-2xl font-bold">{stats.totalEngagement === 0 ? '—' : stats.totalEngagement.toLocaleString()}</p>
              </div>
              <div className="p-4 bg-slate-50 rounded-xl">
                <p className="text-sm text-slate-500">Reach</p>
                <p className="text-2xl font-bold">12,400</p>
              </div>
              <div className="p-4 bg-slate-50 rounded-xl">
                <p className="text-sm text-slate-500">Impressions</p>
                <p className="text-2xl font-bold">45,700</p>
              </div>
            </div>
            <div className="h-40 bg-slate-100 rounded-xl flex items-center justify-center text-slate-400">
              📈 Interactive charts coming soon (Recharts integration)
            </div>
          </div>
        )}
      </div>

      {/* Create/Edit Post Offcanvas */}
      {isPostPanelOpen && (
        <Suspense fallback={<div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center"><div className="bg-white p-8 rounded-2xl">Loading...</div></div>}>
          <Offcanvas
            isOpen={isPostPanelOpen}
            title={editingPost ? 'Edit Post' : 'Create Post'}
            onClose={() => setIsPostPanelOpen(false)}
            footer={
              <div className="flex justify-end gap-3">
                <button onClick={() => setIsPostPanelOpen(false)} className="btn btn-secondary" disabled={submitting}>Cancel</button>
                <button onClick={handleSavePost} disabled={submitting} className="btn btn-primary">
                  {submitting ? 'Saving...' : editingPost ? 'Update' : 'Save'}
                </button>
              </div>
            }
          >
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Platforms *</label>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(PLATFORM_ICONS).slice(0, 5).map(([key, icon]) => (
                    <button
                      key={key}
                      type="button"
                      className={clsx('px-3 py-1 rounded-full text-xs border', postForm.platforms.includes(key) ? 'bg-blue-100 border-blue-300' : 'border-slate-300')}
                      onClick={() => {
                        setPostForm(prev => ({
                          ...prev,
                          platforms: prev.platforms.includes(key) ? prev.platforms.filter(p => p !== key) : [...prev.platforms, key],
                        }));
                      }}
                    >
                      {icon} {key}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Content Type</label>
                <select
                  value={postForm.type}
                  onChange={(e) => setPostForm(prev => ({ ...prev, type: e.target.value as Post['type'] }))}
                  className="input-field w-full text-sm"
                >
                  <option value="text">Text</option>
                  <option value="image">Image</option>
                  <option value="video">Video</option>
                  <option value="carousel">Carousel</option>
                  <option value="reel">Reel</option>
                  <option value="story">Story</option>
                  <option value="poll">Poll</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Content</label>
                <textarea
                  rows={5}
                  value={postForm.content}
                  onChange={(e) => setPostForm(prev => ({ ...prev, content: e.target.value }))}
                  className="w-full rounded-lg border border-gray-300 p-3 text-sm"
                  placeholder="Write your post..."
                />
              </div>
              {/* AI Generator */}
              <div className="bg-blue-50 p-3 rounded-xl">
                <p className="text-sm font-medium mb-2">AI Content Generator</p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={aiPrompt}
                    onChange={(e) => setAiPrompt(e.target.value)}
                    placeholder="Topic or idea..."
                    className="input-field flex-1 text-sm"
                  />
                  <button
                    onClick={generateAIContent}
                    disabled={generatingAI || !aiPrompt.trim()}
                    className="btn btn-primary text-sm"
                  >
                    {generatingAI ? 'Generating...' : 'Generate'}
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Schedule (optional)</label>
                <input
                  type="datetime-local"
                  value={postForm.scheduled_at}
                  onChange={(e) => setPostForm(prev => ({ ...prev, scheduled_at: e.target.value }))}
                  className="input-field w-full text-sm"
                />
              </div>
            </div>
          </Offcanvas>
        </Suspense>
      )}
    </div>
  );
}