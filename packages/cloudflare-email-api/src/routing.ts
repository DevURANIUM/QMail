import type { CloudflareClient } from './client';
import type {
  EmailRoutingSettings,
  EmailRoutingRule,
  CreateRuleRequest,
  DestinationAddress,
} from './types';

export class EmailRoutingAPI {
  constructor(private client: CloudflareClient) {}

  /**
   * Get email routing settings for a zone
   */
  async getSettings(zoneId: string): Promise<EmailRoutingSettings> {
    const response = await this.client.get<EmailRoutingSettings>(
      `/zones/${zoneId}/email/routing`
    );
    return response.result;
  }

  /**
   * Enable email routing for a zone
   */
  async enable(zoneId: string): Promise<EmailRoutingSettings> {
    const response = await this.client.post<EmailRoutingSettings>(
      `/zones/${zoneId}/email/routing/enable`
    );
    return response.result;
  }

  /**
   * Disable email routing for a zone
   */
  async disable(zoneId: string): Promise<EmailRoutingSettings> {
    const response = await this.client.post<EmailRoutingSettings>(
      `/zones/${zoneId}/email/routing/disable`
    );
    return response.result;
  }

  /**
   * Get DNS records required for email routing
   */
  async getDNSRecords(zoneId: string): Promise<unknown[]> {
    const response = await this.client.get<unknown[]>(
      `/zones/${zoneId}/email/routing/dns`
    );
    return response.result;
  }

  // ==================== Rules ====================

  /**
   * List all email routing rules
   */
  async listRules(zoneId: string): Promise<EmailRoutingRule[]> {
    const response = await this.client.get<EmailRoutingRule[]>(
      `/zones/${zoneId}/email/routing/rules`
    );
    return response.result;
  }

  /**
   * Get a specific rule
   */
  async getRule(zoneId: string, ruleId: string): Promise<EmailRoutingRule> {
    const response = await this.client.get<EmailRoutingRule>(
      `/zones/${zoneId}/email/routing/rules/${ruleId}`
    );
    return response.result;
  }

  /**
   * Create a new routing rule
   */
  async createRule(zoneId: string, rule: CreateRuleRequest): Promise<EmailRoutingRule> {
    const response = await this.client.post<EmailRoutingRule>(
      `/zones/${zoneId}/email/routing/rules`,
      rule
    );
    return response.result;
  }

  /**
   * Update a routing rule
   */
  async updateRule(
    zoneId: string,
    ruleId: string,
    rule: Partial<CreateRuleRequest>
  ): Promise<EmailRoutingRule> {
    const response = await this.client.put<EmailRoutingRule>(
      `/zones/${zoneId}/email/routing/rules/${ruleId}`,
      rule
    );
    return response.result;
  }

  /**
   * Delete a routing rule
   */
  async deleteRule(zoneId: string, ruleId: string): Promise<void> {
    await this.client.delete(`/zones/${zoneId}/email/routing/rules/${ruleId}`);
  }

  /**
   * Get the catch-all rule
   */
  async getCatchAllRule(zoneId: string): Promise<EmailRoutingRule> {
    const response = await this.client.get<EmailRoutingRule>(
      `/zones/${zoneId}/email/routing/rules/catch_all`
    );
    return response.result;
  }

  /**
   * Update the catch-all rule
   */
  async updateCatchAllRule(
    zoneId: string,
    rule: {
      enabled: boolean;
      actions: Array<{ type: 'forward' | 'worker' | 'drop'; value?: string[] }>;
    }
  ): Promise<EmailRoutingRule> {
    const response = await this.client.put<EmailRoutingRule>(
      `/zones/${zoneId}/email/routing/rules/catch_all`,
      {
        matchers: [{ type: 'all' }],
        ...rule,
      }
    );
    return response.result;
  }

  // ==================== Destination Addresses ====================

  /**
   * List destination addresses
   */
  async listDestinations(): Promise<DestinationAddress[]> {
    const accountId = this.client.getAccountId();
    const response = await this.client.get<DestinationAddress[]>(
      `/accounts/${accountId}/email/routing/addresses`
    );
    return response.result;
  }

  /**
   * Create a destination address (sends verification email)
   */
  async createDestination(email: string): Promise<DestinationAddress> {
    const accountId = this.client.getAccountId();
    const response = await this.client.post<DestinationAddress>(
      `/accounts/${accountId}/email/routing/addresses`,
      { email }
    );
    return response.result;
  }

  /**
   * Delete a destination address
   */
  async deleteDestination(addressId: string): Promise<void> {
    const accountId = this.client.getAccountId();
    await this.client.delete(
      `/accounts/${accountId}/email/routing/addresses/${addressId}`
    );
  }

  /**
   * Get a destination address
   */
  async getDestination(addressId: string): Promise<DestinationAddress> {
    const accountId = this.client.getAccountId();
    const response = await this.client.get<DestinationAddress>(
      `/accounts/${accountId}/email/routing/addresses/${addressId}`
    );
    return response.result;
  }

  // ==================== Helper Methods ====================

  /**
   * Create a forwarding rule for a specific address
   */
  async createForwardingRule(
    zoneId: string,
    fromAddress: string,
    toAddress: string,
    name?: string
  ): Promise<EmailRoutingRule> {
    return this.createRule(zoneId, {
      name: name || `Forward ${fromAddress}`,
      enabled: true,
      matchers: [
        {
          type: 'literal',
          field: 'to',
          value: fromAddress,
        },
      ],
      actions: [
        {
          type: 'forward',
          value: [toAddress],
        },
      ],
    });
  }

  /**
   * Create a catch-all forwarding to a destination
   */
  async setupCatchAllForwarding(zoneId: string, destinationEmail: string): Promise<EmailRoutingRule> {
    return this.updateCatchAllRule(zoneId, {
      enabled: true,
      actions: [
        {
          type: 'forward',
          value: [destinationEmail],
        },
      ],
    });
  }

  /**
   * Setup catch-all to forward to an Email Worker
   */
  async setupCatchAllWorker(zoneId: string, workerName: string): Promise<EmailRoutingRule> {
    return this.updateCatchAllRule(zoneId, {
      enabled: true,
      actions: [
        {
          type: 'worker',
          value: [workerName],
        },
      ],
    });
  }

  /**
   * Full setup: enable routing and configure catch-all
   */
  async fullSetup(
    zoneId: string,
    options: {
      destinationEmail?: string;
      workerName?: string;
    }
  ): Promise<{
    settings: EmailRoutingSettings;
    catchAllRule: EmailRoutingRule;
  }> {
    // Enable email routing
    const settings = await this.enable(zoneId);

    // Setup catch-all
    let catchAllRule: EmailRoutingRule;
    if (options.workerName) {
      catchAllRule = await this.setupCatchAllWorker(zoneId, options.workerName);
    } else if (options.destinationEmail) {
      catchAllRule = await this.setupCatchAllForwarding(zoneId, options.destinationEmail);
    } else {
      throw new Error('Either destinationEmail or workerName must be provided');
    }

    return { settings, catchAllRule };
  }
}
