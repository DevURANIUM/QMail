import type { BrevoClient } from './client';

export interface BrevoWebhook {
  id: number;
  url: string;
  description: string;
  events: string[];
  type: string;
}

export class WebhooksAPI {
  constructor(private client: BrevoClient) {}

  /**
   * List transactional webhooks
   */
  async list(): Promise<BrevoWebhook[]> {
    const response = await this.client.get<{ webhooks: BrevoWebhook[] }>('/webhooks?type=transactional');
    return response?.webhooks || [];
  }

  /**
   * Create a transactional webhook
   */
  async create(url: string, events: string[], description = 'Qmail delivery tracking'): Promise<{ id: number }> {
    return this.client.post<{ id: number }>('/webhooks', {
      url,
      events,
      type: 'transactional',
      description,
    });
  }

  /**
   * Delete a webhook
   */
  async delete(webhookId: number): Promise<void> {
    await this.client.delete(`/webhooks/${webhookId}`);
  }
}
