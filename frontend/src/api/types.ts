export interface Attachment {
  id: string;
  email_id: string;
  filename: string;
  content_type: string;
  size: number;
  created_at: string;
}

export interface Email {
  id: string;
  type: 'received' | 'sent';
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
  mailgun_id: string | null;
  created_at: string;
  attachments?: Attachment[];
}

export interface EmailStats {
  total_received: number;
  total_sent: number;
  unread: number;
  starred: number;
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
