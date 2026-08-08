import type { CloudflareClient } from './client';
import type { Zone, DNSRecord } from './types';

export class DomainsAPI {
  constructor(private client: CloudflareClient) {}

  /**
   * List all zones in the account
   */
  async listZones(): Promise<Zone[]> {
    const response = await this.client.get<Zone[]>('/zones');
    return response.result;
  }

  /**
   * Get a specific zone by name (domain)
   */
  async getZoneByName(domain: string): Promise<Zone | null> {
    const response = await this.client.get<Zone[]>(`/zones?name=${domain}`);
    return response.result[0] || null;
  }

  /**
   * Get a zone by ID
   */
  async getZone(zoneId: string): Promise<Zone> {
    const response = await this.client.get<Zone>(`/zones/${zoneId}`);
    return response.result;
  }

  /**
   * Add a new zone (domain) to Cloudflare
   */
  async addZone(domain: string, jumpStart = true): Promise<Zone> {
    const response = await this.client.post<Zone>('/zones', {
      name: domain,
      account: { id: this.client.getAccountId() },
      jump_start: jumpStart,
      type: 'full',
    });
    return response.result;
  }

  /**
   * Check if domain is already onboarded to Cloudflare
   */
  async isDomainOnboarded(domain: string): Promise<boolean> {
    const zone = await this.getZoneByName(domain);
    return zone !== null && zone.status === 'active';
  }

  /**
   * Get DNS records for a zone
   */
  async getDNSRecords(zoneId: string, type?: string): Promise<DNSRecord[]> {
    let endpoint = `/zones/${zoneId}/dns_records`;
    if (type) {
      endpoint += `?type=${type}`;
    }
    const response = await this.client.get<DNSRecord[]>(endpoint);
    return response.result;
  }

  /**
   * Create a DNS record
   */
  async createDNSRecord(
    zoneId: string,
    record: {
      type: string;
      name: string;
      content: string;
      ttl?: number;
      priority?: number;
      proxied?: boolean;
    }
  ): Promise<DNSRecord> {
    const response = await this.client.post<DNSRecord>(
      `/zones/${zoneId}/dns_records`,
      {
        ...record,
        ttl: record.ttl || 3600,
      }
    );
    return response.result;
  }

  /**
   * Delete a DNS record
   */
  async deleteDNSRecord(zoneId: string, recordId: string): Promise<void> {
    await this.client.delete(`/zones/${zoneId}/dns_records/${recordId}`);
  }

  /**
   * Get or create zone for a domain
   * Returns the zone if it exists, creates it otherwise
   */
  async ensureZone(domain: string): Promise<Zone> {
    const existingZone = await this.getZoneByName(domain);
    if (existingZone) {
      return existingZone;
    }
    return this.addZone(domain);
  }
}
