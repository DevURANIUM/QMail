import type { BrevoClient } from './client';
import type { SendMessageOptions, SendResponse, EmailAddress } from './types';

interface BrevoSendResponse {
  messageId: string;
}

export class MessagesAPI {
  constructor(private client: BrevoClient) {}

  /**
   * Send an email message via Brevo
   */
  async send(options: SendMessageOptions): Promise<SendResponse> {
    const payload: Record<string, unknown> = {
      sender: options.from,
      to: options.to,
      subject: options.subject,
    };

    if (options.cc && options.cc.length > 0) {
      payload.cc = options.cc;
    }

    if (options.bcc && options.bcc.length > 0) {
      payload.bcc = options.bcc;
    }

    if (options.text) {
      payload.textContent = options.text;
    }

    if (options.html) {
      payload.htmlContent = options.html;
    }

    if (options.replyTo) {
      payload.replyTo = options.replyTo;
    }

    if (options.attachments && options.attachments.length > 0) {
      payload.attachment = options.attachments.map(att => ({
        name: att.name,
        content: att.content,
        contentType: att.contentType,
      }));
    }

    if (options.headers) {
      payload.headers = options.headers;
    }

    if (options.tags && options.tags.length > 0) {
      payload.tags = options.tags;
    }

    const result = await this.client.post<BrevoSendResponse>('/smtp/email', payload);

    return {
      success: true,
      messageId: result.messageId,
    };
  }

  /**
   * Send a simple text email
   */
  async sendText(
    from: string | EmailAddress,
    to: string | EmailAddress | (string | EmailAddress)[],
    subject: string,
    text: string
  ): Promise<SendResponse> {
    const fromAddr = typeof from === 'string' ? { email: from } : from;
    const toAddrs = this.normalizeRecipients(to);

    return this.send({
      from: fromAddr,
      to: toAddrs,
      subject,
      text,
    });
  }

  /**
   * Send an HTML email
   */
  async sendHtml(
    from: string | EmailAddress,
    to: string | EmailAddress | (string | EmailAddress)[],
    subject: string,
    html: string,
    text?: string
  ): Promise<SendResponse> {
    const fromAddr = typeof from === 'string' ? { email: from } : from;
    const toAddrs = this.normalizeRecipients(to);

    return this.send({
      from: fromAddr,
      to: toAddrs,
      subject,
      html,
      text,
    });
  }

  /**
   * Normalize recipients to EmailAddress array
   */
  private normalizeRecipients(
    recipients: string | EmailAddress | (string | EmailAddress)[]
  ): EmailAddress[] {
    const list = Array.isArray(recipients) ? recipients : [recipients];
    return list.map(r => typeof r === 'string' ? { email: r } : r);
  }
}
