import type {
  Email,
  EmailStats,
  ActivityPoint,
  Address,
  Contact,
  Passkey,
  Settings,
  SetupStatus,
  AuthStatus,
  LoginResponse,
  CloudflareSetupResponse,
  BrevoSetupResponse,
} from './types';
import type {
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  RegistrationResponseJSON,
  AuthenticationResponseJSON,
} from '@simplewebauthn/browser';

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

  // WebAuthn / passkey endpoints
  async webauthnRegisterOptions(): Promise<PublicKeyCredentialCreationOptionsJSON> {
    return this.request('POST', '/auth/webauthn/register/options');
  }

  async webauthnRegisterVerify(
    response: RegistrationResponseJSON,
    deviceName?: string
  ): Promise<{ success: boolean }> {
    return this.request('POST', '/auth/webauthn/register/verify', { response, deviceName });
  }

  async webauthnLoginOptions(): Promise<PublicKeyCredentialRequestOptionsJSON> {
    return this.request('POST', '/auth/webauthn/login/options');
  }

  async webauthnLoginVerify(response: AuthenticationResponseJSON): Promise<LoginResponse> {
    const result = await this.request<LoginResponse>('POST', '/auth/webauthn/login/verify', { response });
    if (result.token) {
      this.setToken(result.token);
    }
    return result;
  }

  async getPasskeys(): Promise<{ credentials: Passkey[] }> {
    return this.request('GET', '/auth/webauthn/credentials');
  }

  async deletePasskey(id: string): Promise<{ success: boolean }> {
    return this.request('DELETE', `/auth/webauthn/credentials/${id}`);
  }

  // Email endpoints
  async getEmails(options?: {
    type?: 'received' | 'sent' | 'draft' | 'scheduled';
    limit?: number;
    offset?: number;
    unread?: boolean;
    starred?: boolean;
    archived?: boolean;
    label?: string;
    folder?: string;
  }): Promise<{ emails: Email[]; pagination: { limit: number; offset: number } }> {
    const params = new URLSearchParams();
    if (options?.type) params.append('type', options.type);
    if (options?.limit) params.append('limit', String(options.limit));
    if (options?.offset) params.append('offset', String(options.offset));
    if (options?.unread) params.append('unread', 'true');
    if (options?.starred) params.append('starred', 'true');
    if (options?.archived) params.append('archived', 'true');
    if (options?.label) params.append('label', options.label);
    if (options?.folder) params.append('folder', options.folder);

    const query = params.toString();
    return this.request('GET', `/emails${query ? `?${query}` : ''}`);
  }

  async searchEmails(q: string): Promise<{ emails: Email[] }> {
    return this.request('GET', `/emails/search?q=${encodeURIComponent(q)}`);
  }

  async getFolders(): Promise<{ folders: { id: string; name: string; count: number }[] }> {
    return this.request('GET', '/folders');
  }
  async createFolder(name: string): Promise<{ id: string }> {
    return this.request('POST', '/folders', { name });
  }
  async renameFolder(id: string, name: string): Promise<{ success: boolean }> {
    return this.request('PUT', `/folders/${encodeURIComponent(id)}`, { name });
  }
  async deleteFolder(id: string): Promise<{ success: boolean }> {
    return this.request('DELETE', `/folders/${encodeURIComponent(id)}`);
  }
  async moveEmails(ids: string[], folderId: string | null): Promise<{ success: boolean }> {
    return this.request('POST', '/folders/move', { ids, folderId });
  }

  async getLabels(): Promise<{ labels: string[] }> {
    return this.request('GET', '/emails/labels');
  }

  async setEmailLabels(id: string, labels: string[]): Promise<{ success: boolean; labels: string[] }> {
    return this.request('PUT', `/emails/${id}/labels`, { labels });
  }

  async archiveEmail(id: string): Promise<{ success: boolean }> {
    return this.request('POST', `/emails/${id}/archive`);
  }

  async unarchiveEmail(id: string): Promise<{ success: boolean }> {
    return this.request('POST', `/emails/${id}/unarchive`);
  }

  async saveDraft(draft: {
    id?: string;
    from: string;
    to?: string;
    cc?: string;
    bcc?: string;
    subject?: string;
    text?: string;
    html?: string;
  }): Promise<{ success: boolean; id: string }> {
    return this.request('POST', '/emails/drafts', draft);
  }

  /** Authorized binary download helper (plain <a href> can't send the token) */
  private async downloadBlob(endpoint: string, filename: string): Promise<void> {
    const headers: Record<string, string> = {};
    if (this.token) headers['Authorization'] = `Bearer ${this.token}`;
    const response = await fetch(`${API_BASE}${endpoint}`, { headers });
    if (!response.ok) throw new Error('Download failed');
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  async downloadAttachment(emailId: string, attachmentId: string, filename: string): Promise<void> {
    await this.downloadBlob(`/emails/${emailId}/attachments/${attachmentId}`, filename);
  }

  async downloadEml(emailId: string, filename: string): Promise<void> {
    await this.downloadBlob(`/emails/${emailId}/eml`, filename);
  }

  async downloadMbox(): Promise<void> {
    await this.downloadBlob('/emails/export/mbox', 'qmail-export.mbox');
  }

  // Contact endpoints
  async getContacts(): Promise<{ contacts: Contact[] }> {
    return this.request('GET', '/contacts');
  }

  async saveContact(contact: { email: string; name?: string; notes?: string }): Promise<{ success: boolean }> {
    return this.request('POST', '/contacts', contact);
  }

  async updateContact(id: string, contact: { email: string; name?: string; notes?: string }): Promise<{ success: boolean }> {
    return this.request('PUT', `/contacts/${id}`, contact);
  }

  async deleteContact(id: string): Promise<{ success: boolean }> {
    return this.request('DELETE', `/contacts/${id}`);
  }

  // Push notification endpoints
  async getVapidKey(): Promise<{ key: string }> {
    return this.request('GET', '/push/vapid-key');
  }

  async pushSubscribe(subscription: unknown): Promise<{ success: boolean }> {
    return this.request('POST', '/push/subscribe', subscription);
  }

  async pushUnsubscribe(endpoint: string): Promise<{ success: boolean }> {
    return this.request('POST', '/push/unsubscribe', { endpoint });
  }

  async getEmail(id: string): Promise<Email> {
    return this.request('GET', `/emails/${id}`);
  }

  async getEmailStats(): Promise<EmailStats> {
    return this.request('GET', '/emails/stats');
  }

  async getEmailActivity(days = 14): Promise<{ days: number; activity: ActivityPoint[] }> {
    return this.request('GET', `/emails/activity?days=${days}`);
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
    draftId?: string;
    scheduleAt?: string;
    replyToEmailId?: string;
    forwardOfEmailId?: string;
  }): Promise<{ success: boolean; id: string; messageId?: string; scheduled?: boolean }> {
    return this.request('POST', '/emails/send', data);
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

  // Settings endpoints
  async getSettings(): Promise<Settings> {
    return this.request('GET', '/settings');
  }

  async updateSettings(settings: Partial<Settings>): Promise<{ success: boolean }> {
    return this.request('PUT', '/settings', settings);
  }

  async saveTelegram(data: { botToken?: string; chatId: string; enabled: boolean }): Promise<{ success: boolean }> {
    return this.request('PUT', '/settings/telegram', data);
  }

  async testTelegram(): Promise<{ success: boolean }> {
    return this.request('POST', '/settings/telegram/test');
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
