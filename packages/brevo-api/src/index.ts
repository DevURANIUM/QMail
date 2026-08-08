import { BrevoClient } from './client';
import { SendersAPI } from './senders';
import { MessagesAPI } from './messages';
import type { BrevoConfig, SendMessageOptions, SendResponse, EmailAddress } from './types';

export * from './types';
export { BrevoClient } from './client';
export { SendersAPI } from './senders';
export { MessagesAPI } from './messages';

/**
 * Main Brevo API wrapper
 * Provides unified access to email sending
 */
export class BrevoAPI {
  private client: BrevoClient;
  public senders: SendersAPI;
  public messages: MessagesAPI;

  constructor(config: BrevoConfig) {
    this.client = new BrevoClient(config);
    this.senders = new SendersAPI(this.client);
    this.messages = new MessagesAPI(this.client);
  }

  /**
   * Quick send email
   */
  async send(options: SendMessageOptions): Promise<SendResponse> {
    return this.messages.send(options);
  }

  /**
   * Quick send text email
   */
  async sendText(
    from: string | EmailAddress,
    to: string | EmailAddress | (string | EmailAddress)[],
    subject: string,
    text: string
  ): Promise<SendResponse> {
    return this.messages.sendText(from, to, subject, text);
  }

  /**
   * Quick send HTML email
   */
  async sendHtml(
    from: string | EmailAddress,
    to: string | EmailAddress | (string | EmailAddress)[],
    subject: string,
    html: string,
    text?: string
  ): Promise<SendResponse> {
    return this.messages.sendHtml(from, to, subject, html, text);
  }

  /**
   * Get account info to verify API key works
   */
  async getAccount(): Promise<{ email: string; firstName: string; lastName: string; companyName: string }> {
    return this.client.get('/account');
  }
}

// Keep backward compatibility aliases
export { BrevoAPI as MailtrapAPI };
export { BrevoAPI as MailgunAPI };

export default BrevoAPI;
