import type { BrevoClient } from './client';
import type { BrevoSender } from './types';

export class SendersAPI {
  constructor(private client: BrevoClient) {}

  /**
   * List all senders
   */
  async list(): Promise<BrevoSender[]> {
    const response = await this.client.get<{ senders: BrevoSender[] }>('/senders');
    return response.senders || [];
  }

  /**
   * Get a specific sender
   */
  async get(senderId: number): Promise<BrevoSender> {
    return this.client.get<BrevoSender>(`/senders/${senderId}`);
  }

  /**
   * Create a new sender
   */
  async create(name: string, email: string): Promise<{ id: number }> {
    return this.client.post<{ id: number }>('/senders', { name, email });
  }

  /**
   * Delete a sender
   */
  async delete(senderId: number): Promise<void> {
    await this.client.delete(`/senders/${senderId}`);
  }

  /**
   * Validate a sender (resend verification email)
   */
  async validate(senderId: number): Promise<void> {
    await this.client.put(`/senders/${senderId}/validate`);
  }
}
