export interface Attachment {
  id: string;
  email_id: string;
  filename: string;
  content_type: string;
  size: number;
  created_at: string;
}

export type EmailType = 'received' | 'sent' | 'draft' | 'scheduled';

export interface ThreadEntry {
  id: string;
  type: EmailType;
  from_address: string;
  to_address: string;
  subject: string | null;
  created_at: string;
  is_read: number;
}

export interface Email {
  id: string;
  type: EmailType;
  from_address: string;
  to_address: string;
  cc: string | null;
  bcc: string | null;
  subject: string | null;
  body_text: string | null;
  body_html: string | null;
  headers: string | null;
  raw_size: number | null;
  is_read: number;
  is_starred: number;
  archived: number;
  labels: string; // JSON array of strings
  message_id: string | null;
  in_reply_to: string | null;
  thread_id: string | null;
  delivery_status: string | null;
  scheduled_at: string | null;
  mailgun_id: string | null;
  created_at: string;
  attachment_count?: number;
  attachments?: Attachment[];
  thread?: ThreadEntry[];
}

export interface EmailStats {
  total_received: number;
  total_sent: number;
  unread: number;
  starred: number;
  storage_bytes: number;
}

export interface ActivityPoint {
  day: string;
  received: number;
  sent: number;
}

export interface Passkey {
  id: string;
  deviceName: string | null;
  createdAt: string;
  lastUsedAt: string | null;
}

export interface Contact {
  id: string;
  email: string;
  name: string | null;
  notes: string | null;
  last_contacted_at: string | null;
  created_at: string;
}

export interface Address {
  id: string;
  address: string;
  display_name: string | null;
  is_default: number;
  created_at: string;
}

export interface Settings {
  domain: string;
  destination_email: string;
  cloudflare_api_key: string;
  cloudflare_account_id: string;
  cloudflare_zone_id: string;
  brevo_api_key: string;
  setup_completed: string;
  block_remote_images?: string;
  telegram_bot_token?: string;
  telegram_chat_id?: string;
  telegram_enabled?: string;
  telegram_last_delivery?: string;
  telegram_last_error?: string;
}

export interface SetupStatus {
  setupCompleted: boolean;
  domain: string | null;
  destinationEmail: string | null;
  cloudflare: {
    configured: boolean;
    zoneId: string | null;
  };
  brevo: {
    configured: boolean;
  };
}

export interface AuthStatus {
  authenticated: boolean;
  needsSetup: boolean;
  hasPasskeys: boolean;
}

export interface LoginResponse {
  success: boolean;
  token: string;
  expiresAt: string;
}

export interface DNSRecord {
  record_type?: string;
  type?: string;
  name: string;
  value?: string;
  content?: string;
  priority?: string | number;
  valid?: string;
}

export interface CloudflareSetupResponse {
  success: boolean;
  zone: {
    id: string;
    name: string;
    status: string;
    nameServers: string[];
  };
  routing: {
    enabled: boolean;
    status: string;
  };
  dnsRecords: DNSRecord[];
  message: string;
}

export interface BrevoSetupResponse {
  success: boolean;
  account?: {
    email: string;
    companyName: string;
  };
  message: string;
}
