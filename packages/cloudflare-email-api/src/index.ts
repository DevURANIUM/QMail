import { CloudflareClient } from './client';
import { DomainsAPI } from './domains';
import { EmailRoutingAPI } from './routing';
import type { CloudflareConfig } from './types';

export * from './types';
export { CloudflareClient } from './client';
export { DomainsAPI } from './domains';
export { EmailRoutingAPI } from './routing';

/**
 * Main Cloudflare Email API wrapper
 * Provides unified access to domain management and email routing
 */
export class CloudflareEmailAPI {
  private client: CloudflareClient;
  public domains: DomainsAPI;
  public routing: EmailRoutingAPI;

  constructor(config: CloudflareConfig) {
    this.client = new CloudflareClient(config);
    this.domains = new DomainsAPI(this.client);
    this.routing = new EmailRoutingAPI(this.client);
  }

  /**
   * Full domain setup for email routing
   * 1. Ensures domain is added to Cloudflare
   * 2. Enables email routing
   * 3. Sets up catch-all forwarding or worker
   */
  async setupDomain(
    domain: string,
    options: {
      destinationEmail?: string;
      workerName?: string;
    }
  ): Promise<{
    zone: import('./types').Zone;
    settings: import('./types').EmailRoutingSettings;
    catchAllRule: import('./types').EmailRoutingRule;
  }> {
    // Ensure zone exists
    const zone = await this.domains.ensureZone(domain);

    // Setup email routing
    const { settings, catchAllRule } = await this.routing.fullSetup(zone.id, options);

    return { zone, settings, catchAllRule };
  }

  /**
   * Ensure a destination address is verified
   */
  async ensureDestinationAddress(email: string): Promise<import('./types').DestinationAddress> {
    const destinations = await this.routing.listDestinations();
    const existing = destinations.find(d => d.email === email);

    if (existing) {
      if (!existing.verified) {
        console.warn(`Destination address ${email} exists but is not verified. Check your inbox.`);
      }
      return existing;
    }

    return this.routing.createDestination(email);
  }

  /**
   * Get zone ID for a domain
   */
  async getZoneId(domain: string): Promise<string | null> {
    const zone = await this.domains.getZoneByName(domain);
    return zone?.id || null;
  }
}

export default CloudflareEmailAPI;
