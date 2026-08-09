import type {
  Email,
  EmailStats,
  Address,
  Settings,
  SetupStatus,
  AuthStatus,
  LoginResponse,
  CloudflareSetupResponse,
  BrevoSetupResponse,
} from './types';

const API_BASE = '/api';

class ApiClient {
  private token: string | null = null;

  constructor() {
    this.token = localStorage.getItem('qmail_token');
  }

  setToken(token: string | null) {
    this.token = token;
    if (token) {
      localStorage.setItem('qmail_token', token);
    } else {
      localStorage.removeItem('qmail_token');
    }
  }

  getToken(): string | null {
    return this.token;
  }

  private async request<T>(
    method: string,
    endpoint: string,
    body?: unknown
  ): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    const response = await fetch(`${API_BASE}${endpoint}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Request failed');
    }

    return data;
  }

  // Auth endpoints
  async checkAuthStatus(): Promise<AuthStatus> {
    return this.request<AuthStatus>('GET', '/auth/status');
  }

  async login(password: string): Promise<LoginResponse> {
    const response = await this.request<LoginResponse>('POST', '/auth/login', { password });
    if (response.token) {
      this.setToken(response.token);
    }
    return response;
  }

  async logout(): Promise<void> {
    await this.request('POST', '/auth/logout');
    this.setToken(null);
  }

  async setup(password: string): Promise<LoginResponse> {
    const response = await this.request<LoginResponse>('POST', '/auth/setup', { password });
    if (response.token) {
      this.setToken(response.token);
    }
    return response;
  }

  async changePassword(currentPassword: string, newPassword: string): Promise<{ success: boolean }> {
    return this.request('POST', '/auth/change-password', {
      currentPassword,
      newPassword,
    });
  }

  // Email endpoints
  async getEmails(options?: {
    type?: 'received' | 'sent';
    limit?: number;
    offset?: number;
    unread?: boolean;
    starred?: boolean;
  }): Promise<{ emails: Email[]; pagination: { limit: number; offset: number } }> {
    const params = new URLSearchParams();
    if (options?.type) params.append('type', options.type);
    if (options?.limit) params.append('limit', String(options.limit));
    if (options?.offset) params.append('offset', String(options.offset));
    if (options?.unread) params.append('unread', 'true');
    if (options?.starred) params.append('starred', 'true');

    const query = params.toString();
    return this.request('GET', `/emails${query ? `?${query}` : ''}`);
  }

  async getEmail(id: string): Promise<Email> {
    return this.request('GET', `/emails/${id}`);
  }

  async getEmailStats(): Promise<EmailStats> {
    return this.request('GET', '/emails/stats');
  }

  async sendEmail(data: {
    from: string;
    to: string;
    cc?: string;
    bcc?: string;
    subject: string;
    text?: string;
    html?: string;
    replyTo?: string;
    attachments?: Array<{
      filename: string;
      content: string; // Base64 encoded
      contentType?: string;
    }>;
  }): Promise<{ success: boolean; id: string; messageId: string }> {
    return this.request('POST', '/emails/send', data);
  }

  getAttachmentUrl(emailId: string, attachmentId: string): string {
    return `${API_BASE}/emails/${emailId}/attachments/${attachmentId}`;
  }

  async downloadAttachment(emailId: string, attachmentId: string): Promise<Blob> {
    const headers: Record<string, string> = {};
    if (this.token) headers.Authorization = `Bearer ${this.token}`;
    const response = await fetch(this.getAttachmentUrl(emailId, attachmentId), { headers });
    if (!response.ok) {
      let message = 'Failed to download attachment';
      try { message = (await response.json()).error || message; } catch { /* non-JSON error */ }
      throw new Error(message);
    }
    return response.blob();
  }

  async markAsRead(id: string): Promise<{ success: boolean }> {
    return this.request('POST', `/emails/${id}/read`);
  }

  async markAsUnread(id: string): Promise<{ success: boolean }> {
    return this.request('POST', `/emails/${id}/unread`);
  }

  async toggleStar(id: string): Promise<{ success: boolean }> {
    return this.request('POST', `/emails/${id}/star`);
  }

  async deleteEmail(id: string): Promise<{ success: boolean }> {
    return this.request('DELETE', `/emails/${id}`);
  }

  async bulkEmailAction(ids: string[], action: 'read' | 'unread' | 'delete'): Promise<{ success: boolean; affected: number }> {
    return this.request('POST', '/emails/bulk', { ids, action });
  }

  async markAllEmailsRead(): Promise<{ success: boolean; affected: number }> {
    return this.request('POST', '/emails/bulk', { action: 'read-all' });
  }

  // Settings endpoints
  async getSettings(): Promise<Settings> {
    return this.request('GET', '/settings');
  }

  async updateSettings(settings: Partial<Settings>): Promise<{ success: boolean }> {
    return this.request('PUT', '/settings', settings);
  }

  // Setup endpoints
  async getSetupStatus(): Promise<SetupStatus> {
    return this.request('GET', '/setup/status');
  }

  async setupCloudflare(data: {
    apiKey: string;
    accountId: string;
    domain: string;
    destinationEmail?: string;
  }): Promise<CloudflareSetupResponse> {
    return this.request('POST', '/setup/cloudflare', data);
  }

  async setupBrevo(data: {
    apiKey: string;
  }): Promise<BrevoSetupResponse> {
    return this.request('POST', '/setup/brevo', data);
  }

  async getBrevoSenders(): Promise<{ success: boolean; senders: Array<{ id: number; name: string; email: string; active: boolean }> }> {
    return this.request('GET', '/setup/brevo/senders');
  }

  async completeSetup(): Promise<{ success: boolean }> {
    return this.request('POST', '/setup/complete');
  }

  async fixWorkerRouting(): Promise<{ success: boolean; message: string }> {
    return this.request('POST', '/setup/cloudflare/worker-routing', {});
  }

  // Address endpoints
  async getAddresses(): Promise<Address[]> {
    return this.request('GET', '/setup/addresses');
  }

  async addAddress(data: {
    address: string;
    displayName?: string;
    isDefault?: boolean;
  }): Promise<{ success: boolean; id: string }> {
    return this.request('POST', '/setup/addresses', data);
  }

  async deleteAddress(id: string): Promise<{ success: boolean }> {
    return this.request('DELETE', `/setup/addresses/${id}`);
  }
}

export const api = new ApiClient();
export default api;
