export interface CloudflareConfig {
  apiKey: string;
  accountId: string;
}

export interface Zone {
  id: string;
  name: string;
  status: string;
  paused: boolean;
  type: string;
  development_mode: number;
  name_servers: string[];
  original_name_servers: string[];
  original_registrar: string;
  original_dnshost: string;
  modified_on: string;
  created_on: string;
  activated_on: string;
  meta: {
    step: number;
    custom_certificate_quota: number;
    page_rule_quota: number;
    phishing_detected: boolean;
    multiple_railguns_allowed: boolean;
  };
  owner: {
    id: string;
    type: string;
    email: string;
  };
  account: {
    id: string;
    name: string;
  };
  permissions: string[];
  plan: {
    id: string;
    name: string;
    price: number;
    currency: string;
    frequency: string;
    is_subscribed: boolean;
    can_subscribe: boolean;
    legacy_id: string;
    legacy_discount: boolean;
    externally_managed: boolean;
  };
}

export interface EmailRoutingSettings {
  enabled: boolean;
  name: string;
  created: string;
  modified: string;
  skip_wizard: boolean;
  status: 'ready' | 'unconfigured' | 'misconfigured' | 'misconfigured/locked' | 'unlocked';
}

export interface EmailRoutingRule {
  id: string;
  tag: string;
  name: string;
  priority: number;
  enabled: boolean;
  matchers: EmailMatcher[];
  actions: EmailAction[];
}

export interface EmailMatcher {
  type: 'literal' | 'all';
  field?: 'to';
  value?: string;
}

export interface EmailAction {
  type: 'forward' | 'worker' | 'drop';
  value: string[];
}

export interface CreateRuleRequest {
  name: string;
  enabled?: boolean;
  matchers: EmailMatcher[];
  actions: EmailAction[];
  priority?: number;
}

export interface DestinationAddress {
  id: string;
  email: string;
  verified: string | null;
  created: string;
  modified: string;
}

export interface DNSRecord {
  id: string;
  zone_id: string;
  zone_name: string;
  name: string;
  type: string;
  content: string;
  proxiable: boolean;
  proxied: boolean;
  ttl: number;
  locked: boolean;
  meta: {
    auto_added: boolean;
    managed_by_apps: boolean;
    managed_by_argo_tunnel: boolean;
  };
  created_on: string;
  modified_on: string;
}

export interface CloudflareResponse<T> {
  success: boolean;
  errors: Array<{ code: number; message: string }>;
  messages: Array<{ code: number; message: string }>;
  result: T;
  result_info?: {
    page: number;
    per_page: number;
    total_pages: number;
    count: number;
    total_count: number;
  };
}
