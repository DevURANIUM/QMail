import type { CloudflareConfig, CloudflareResponse } from './types';

export class CloudflareClient {
  private apiKey: string;
  private accountId: string;
  private baseUrl = 'https://api.cloudflare.com/client/v4';

  constructor(config: CloudflareConfig) {
    this.apiKey = config.apiKey;
    this.accountId = config.accountId;
  }

  async request<T>(
    method: string,
    endpoint: string,
    body?: unknown
  ): Promise<CloudflareResponse<T>> {
    const url = `${this.baseUrl}${endpoint}`;

    const headers: Record<string, string> = {
      'Authorization': `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
    };

    const options: RequestInit = {
      method,
      headers,
    };

    if (body && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
      options.body = JSON.stringify(body);
    }

    const response = await fetch(url, options);
    const data = await response.json() as CloudflareResponse<T>;

    if (!data.success) {
      const errorMessages = data.errors.map(e => e.message).join(', ');
      throw new Error(`Cloudflare API error: ${errorMessages}`);
    }

    return data;
  }

  get<T>(endpoint: string): Promise<CloudflareResponse<T>> {
    return this.request<T>('GET', endpoint);
  }

  post<T>(endpoint: string, body?: unknown): Promise<CloudflareResponse<T>> {
    return this.request<T>('POST', endpoint, body);
  }

  put<T>(endpoint: string, body?: unknown): Promise<CloudflareResponse<T>> {
    return this.request<T>('PUT', endpoint, body);
  }

  patch<T>(endpoint: string, body?: unknown): Promise<CloudflareResponse<T>> {
    return this.request<T>('PATCH', endpoint, body);
  }

  delete<T>(endpoint: string): Promise<CloudflareResponse<T>> {
    return this.request<T>('DELETE', endpoint);
  }

  getAccountId(): string {
    return this.accountId;
  }
}
