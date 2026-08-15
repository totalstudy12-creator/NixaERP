import { apiClient } from '../api';

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
}

export interface SocialDashboardData {
  connected_accounts: number;
  scheduled_posts: number;
  total_followers: number;
  total_engagement: number;
  accounts: SocialAccount[];
  posts: SocialPost[];
}

export async function getMarketingDashboard(): Promise<SocialDashboardData> {
  const response = await apiClient.request('GET', '/marketing/dashboard');
  if (response && typeof response === 'object' && 'data' in response && response.data) {
    const data = response.data as SocialDashboardData;
    return {
      connected_accounts: Number(data.connected_accounts ?? 0),
      scheduled_posts: Number(data.scheduled_posts ?? 0),
      total_followers: Number(data.total_followers ?? 0),
      total_engagement: Number(data.total_engagement ?? 0),
      accounts: Array.isArray(data.accounts) ? data.accounts : [],
      posts: Array.isArray(data.posts) ? data.posts : [],
    };
  }
  return { connected_accounts: 0, scheduled_posts: 0, total_followers: 0, total_engagement: 0, accounts: [], posts: [] };
}

export async function getMarketingAccounts(): Promise<SocialAccount[]> {
  const response = await apiClient.request('GET', '/marketing/accounts');
  const payload = response && typeof response === 'object' && 'data' in response ? response.data : response;
  return Array.isArray(payload) ? payload as SocialAccount[] : [];
}

export async function getMarketingPosts(): Promise<SocialPost[]> {
  const response = await apiClient.request('GET', '/marketing/posts');
  const payload = response && typeof response === 'object' && 'data' in response ? response.data : response;
  return Array.isArray(payload) ? payload as SocialPost[] : [];
}

export async function createMarketingPost(data: {
  content: string;
  platforms?: string[];
  status?: string;
  scheduled_at?: string | null;
  media_path?: string | null;
  media_type?: string | null;
}) {
  return apiClient.request('POST', '/marketing/posts', data);
}

export async function updateMarketingPost(id: number, data: Partial<SocialPost>) {
  return apiClient.request('PUT', `/marketing/posts/${id}`, data);
}

export async function deleteMarketingPost(id: number) {
  return apiClient.request('DELETE', `/marketing/posts/${id}`);
}

export async function getMarketingCalendar(): Promise<SocialPost[]> {
  const response = await apiClient.request('GET', '/marketing/calendar');
  const payload = response && typeof response === 'object' && 'data' in response ? response.data : response;
  return Array.isArray(payload) ? payload as SocialPost[] : [];
}

export async function getMarketingAnalytics() {
  const response = await apiClient.request('GET', '/marketing/analytics');
  return response && typeof response === 'object' && 'data' in response ? response.data : { followers: 0, engagement: 0, accounts: 0, message: 'Analytics unavailable' };
}

export async function getMarketingInbox() {
  const response = await apiClient.request('GET', '/marketing/inbox');
  return response && typeof response === 'object' && 'data' in response ? response.data : [];
}
