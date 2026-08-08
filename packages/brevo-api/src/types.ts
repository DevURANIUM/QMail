export interface BrevoConfig {
  apiKey: string;
}

export interface SendMessageOptions {
  from: EmailAddress;
  to: EmailAddress[];
  cc?: EmailAddress[];
  bcc?: EmailAddress[];
  subject: string;
  text?: string;
  html?: string;
  attachments?: Attachment[];
  headers?: Record<string, string>;
  tags?: string[];
  replyTo?: EmailAddress;
}

export interface EmailAddress {
  email: string;
  name?: string;
}

export interface Attachment {
  name: string;
  content: string; // Base64 encoded
  contentType?: string;
}

export interface SendResponse {
  success: boolean;
  messageId: string;
}

export interface BrevoError {
  code: string;
  message: string;
}

export interface BrevoSender {
  id: number;
  name: string;
  email: string;
  active: boolean;
  ips?: Array<{
    ip: string;
    domain: string;
    weight: number;
  }>;
}

export interface BrevoDomain {
  id: number;
  domain_name: string;
  authenticated: boolean;
  dns_records?: {
    dkim_record?: string;
    spf_record?: string;
    dmarc_record?: string;
  };
}
