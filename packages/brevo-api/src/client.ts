import type { BrevoConfig } from './types';

export class BrevoClient {
  private apiKey: string;
  private baseUrl = 'https://api.brevo.com/v3';

  constructor(config: BrevoConfig) {
    this.apiKey = config.apiKey;
  }

  async request<T>(
    method: string,
    endpoint: string,
    body?: unknown
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;

    const headers: Record<string, string> = {
      'api-key': this.apiKey,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    };

    const options: RequestInit = {
      method,
      headers,
    };

    if (body && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
      options.body = JSON.stringify(body);
    }

    const response = await fetch(url, options);

    // Handle empty responses (like 204 No Content)
    const text = await response.text();
    let data: T | null = null;

    if (text) {
      try {
        data = JSON.parse(text) as T;
      } catch {
        // Response is not JSON
      }
    }

    if (!response.ok) {
      const errorData = data as { message?: string; code?: string } | null;
      throw new Error(`Brevo API error: ${errorData?.message || response.statusText}`);
    }

    return data as T;
  }

  get<T>(endpoint: string): Promise<T> {
    return this.request<T>('GET', endpoint);
  }

  post<T>(endpoint: string, body?: unknown): Promise<T> {
    return this.request<T>('POST', endpoint, body);
  }

  put<T>(endpoint: string, body?: unknown): Promise<T> {
    return this.request<T>('PUT', endpoint, body);
  }

  delete<T>(endpoint: string): Promise<T> {
    return this.request<T>('DELETE', endpoint);
  }

  getApiKey(): string {
    return this.apiKey;
  }
}
