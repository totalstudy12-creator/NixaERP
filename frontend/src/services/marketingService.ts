import { apiClient, API_BASE } from '../api';
import { useAuthStore } from '../store/auth';

// ---------- Types ----------
export interface SocialAccount {
  id: number;
  platform: string;
  account_name?: string;
  username?: string;
  external_account_id?: string;
  status: 'connected' | 'disconnected' | 'pending' | 'error';
  connected_at?: string | null;
  last_sync_at?: string | null;
  metadata?: Record<string, unknown> | null;
  platform_user_id?: string;
  platform_username?: string;
  locations?: GbpLocation[]; // Google Business Profile locations (real backend data)
}

export interface SocialPost {
  id: number;
  content: string;
  status: 'draft' | 'scheduled' | 'publishing' | 'published' | 'failed' | 'cancelled';
  scheduled_at?: string | null;
  published_at?: string | null;
  created_at?: string;
  media_path?: string | null;
  media_type?: string | null;
  metadata?: Record<string, unknown> | null;
  platforms?: string[];
  external_post_ids?: Record<string, string>;
  type?: string; // post type (text, image, etc.)
  link?: string;
  cta?: string;
  locations?: string[];
}

export interface GbpLocation {
  id: string;
  name: string;
  address?: string | null;
}

export interface SocialDashboardData {
  connected_accounts: number;
  scheduled_posts: number;
  total_followers: number;
  total_engagement: number;
  accounts: SocialAccount[];
  posts: SocialPost[];
}

export interface InboxMessage {
  id: number;
  channel: string;
  sender: string;
  body: string;
  received_at: string;
  is_read: boolean;
  metadata?: Record<string, unknown> | null;
}

// ---------- Supported platforms ----------
export const SUPPORTED_PLATFORMS = [
  'facebook',
  'instagram',
  'twitter',
  'linkedin',
  'google', // Google My Business
] as const;

// ---------- Dashboard ----------
export async function getMarketingDashboard(): Promise<SocialDashboardData> {
  const response = await apiClient.request('GET', '/marketing/dashboard');
  const data = (response as any)?.data ?? response;
  return {
    connected_accounts: Number(data?.connected_accounts ?? 0),
    scheduled_posts: Number(data?.scheduled_posts ?? 0),
    total_followers: Number(data?.total_followers ?? 0),
    total_engagement: Number(data?.total_engagement ?? 0),
    accounts: Array.isArray(data?.accounts) ? data.accounts : [],
    posts: Array.isArray(data?.posts) ? data.posts : [],
  };
}

// ---------- Accounts & OAuth ----------
export async function getMarketingAccounts(): Promise<SocialAccount[]> {
  const response = await apiClient.request('GET', '/marketing/accounts');
  const payload = (response as any)?.data ?? response;
  return Array.isArray(payload) ? (payload as SocialAccount[]) : [];
}

/**
 * Fetch the OAuth authorization URL from the backend (authenticated).
 */
export async function getSocialAuthUrl(platform: string): Promise<string> {
  const response = await apiClient.request('GET', `/auth/${platform}/redirect-url`);
  return (response as any)?.url || '';
}

/**
 * Disconnect a social account.
 */
export async function disconnectSocialAccount(platform: string): Promise<void> {
  await apiClient.request('POST', `/auth/${platform}/disconnect`);
}

// ---------- Google Business Profile Locations ----------
/**
 * Fetch real Google Business Profile locations for the connected Google account.
 */
export async function getMarketingGbpLocations(): Promise<GbpLocation[]> {
  const response = await apiClient.request('GET', '/marketing/gbp-locations');
  const payload = (response as any)?.data ?? response;
  return Array.isArray(payload) ? (payload as GbpLocation[]) : [];
}

// ---------- Posts ----------
export async function getMarketingPosts(): Promise<SocialPost[]> {
  const response = await apiClient.request('GET', '/marketing/posts');
  const payload = (response as any)?.data ?? response;
  return Array.isArray(payload) ? (payload as SocialPost[]) : [];
}

/**
 * Create a post using multipart/form-data if media files are present,
 * otherwise use JSON.
 *
 * @param data - Post data including optional mediaFiles array.
 */
export async function createMarketingPost(data: {
  content: string;
  platforms?: string[];
  status?: string;
  scheduled_at?: string | null;
  media_path?: string | null;
  media_type?: string | null;
  type?: string;
  link?: string;
  cta?: string;
  locations?: string[];
  mediaFiles?: File[];
}): Promise<any> {
  if (data.mediaFiles && data.mediaFiles.length > 0) {
    const formData = new FormData();
    formData.append('content', data.content);
    formData.append('platforms', JSON.stringify(data.platforms ?? []));
    formData.append('status', data.status ?? 'draft');
    formData.append('scheduled_at', data.scheduled_at ?? '');
    formData.append('type', data.type ?? 'text');
    formData.append('link', data.link ?? '');
    formData.append('cta', data.cta ?? '');
    formData.append('locations', JSON.stringify(data.locations ?? []));

    data.mediaFiles.forEach((file, index) => {
      formData.append(`media[${index}]`, file);
    });

    const token = useAuthStore.getState().token;
    const headers: any = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const response = await fetch(`${API_BASE}/marketing/posts`, {
      method: 'POST',
      headers,
      body: formData,
    });

    const contentType = response.headers.get('content-type') || '';
    const isJson = contentType.includes('application/json');
    const body = isJson ? await response.json() : await response.text();
    if (!response.ok) {
      throw new Error(isJson && body.message ? body.message : response.statusText);
    }
    return body;
  }

  // No media, use JSON
  return apiClient.request('POST', '/marketing/posts', {
    content: data.content,
    platforms: data.platforms,
    status: data.status,
    scheduled_at: data.scheduled_at,
    type: data.type,
    link: data.link,
    cta: data.cta,
    locations: data.locations,
  });
}

export async function updateMarketingPost(id: number, data: Partial<SocialPost>) {
  return apiClient.request('PUT', `/marketing/posts/${id}`, data);
}

export async function deleteMarketingPost(id: number) {
  return apiClient.request('DELETE', `/marketing/posts/${id}`);
}

export async function getMarketingCalendar(): Promise<SocialPost[]> {
  const response = await apiClient.request('GET', '/marketing/calendar');
  const payload = (response as any)?.data ?? response;
  return Array.isArray(payload) ? (payload as SocialPost[]) : [];
}

export async function getMarketingAnalytics() {
  const response = await apiClient.request('GET', '/marketing/analytics');
  return (response as any)?.data ?? {
    followers: 0,
    engagement: 0,
    accounts: 0,
    message: 'Analytics unavailable',
  };
}

// ---------- Unified Inbox ----------
export async function getMarketingInbox(): Promise<InboxMessage[]> {
  const response = await apiClient.request('GET', '/marketing/inbox');
  const payload = (response as any)?.data ?? response;
  return Array.isArray(payload) ? (payload as InboxMessage[]) : [];
}

export async function markInboxMessageRead(messageId: number): Promise<void> {
  await apiClient.request('POST', `/inbox/${messageId}/read`);
}

export async function sendEmailReply(to: string, subject: string, body: string): Promise<void> {
  await apiClient.request('POST', '/inbox/email/send', { to, subject, body });
}

export async function sendWhatsAppReply(to: string, body: string): Promise<void> {
  await apiClient.request('POST', '/inbox/whatsapp/send', { to, body });
}