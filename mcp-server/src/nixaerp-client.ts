import { config } from './config.js';

export type JsonObject = Record<string, unknown>;

export class NixaerpClient {
  private readonly baseUrl: string;
  private readonly token: string;
  private readonly timeoutMs = 15_000;

  constructor() {
    this.baseUrl = config.nixaerpApiBaseUrl.replace(/\/+$/, '');
    this.token = config.nixaerpMcpToken;

    if (!this.baseUrl) {
      throw new Error(
        'NIXAERP_API_BASE_URL is not configured.',
      );
    }

    if (!this.token) {
      throw new Error(
        'NIXAERP_MCP_TOKEN is not configured.',
      );
    }
  }

  private async get<T extends JsonObject>(
    path: string,
    query?: Record<
      string,
      string | number | undefined
    >,
  ): Promise<T> {
    const url = new URL(
      `${this.baseUrl}${path}`,
    );

    if (query) {
      for (const [key, value] of Object.entries(query)) {
        if (
          value !== undefined &&
          value !== ''
        ) {
          url.searchParams.set(
            key,
            String(value),
          );
        }
      }
    }

    const controller = new AbortController();

    const timeoutId = setTimeout(() => {
      controller.abort();
    }, this.timeoutMs);

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${this.token}`,
        },
        signal: controller.signal,
      });

      const responseText =
        await response.text();

      const data =
        this.parseResponse(responseText);

      if (!response.ok) {
        throw new Error(
          this.buildErrorMessage(
            response.status,
            data,
          ),
        );
      }

      if (
        data === null ||
        typeof data !== 'object' ||
        Array.isArray(data)
      ) {
        throw new Error(
          `NixaERP returned an invalid response for ${path}.`,
        );
      }

      return data as T;
    } catch (error: unknown) {
      if (
        error instanceof Error &&
        error.name === 'AbortError'
      ) {
        throw new Error(
          `NixaERP request timed out after ${this.timeoutMs}ms.`,
        );
      }

      if (error instanceof Error) {
        throw error;
      }

      throw new Error(
        'Unknown NixaERP API error.',
      );
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private parseResponse(
    text: string,
  ): unknown {
    const trimmed = text.trim();

    if (!trimmed) {
      return null;
    }

    try {
      return JSON.parse(trimmed);
    } catch {
      return {
        message: trimmed.slice(0, 1000),
      };
    }
  }

  private buildErrorMessage(
    status: number,
    payload: unknown,
  ): string {
    const message =
      this.extractErrorMessage(payload);

    return `NixaERP API error (${status}): ${message}`;
  }

  private extractErrorMessage(
    payload: unknown,
  ): string {
    if (
      payload &&
      typeof payload === 'object' &&
      !Array.isArray(payload)
    ) {
      const data =
        payload as Record<string, unknown>;

      const directMessages = [
        data.message,
        data.error,
        data.backendMessage,
      ];

      for (const value of directMessages) {
        if (
          typeof value === 'string' &&
          value.trim()
        ) {
          return value.trim();
        }
      }

      if (
        data.errors &&
        typeof data.errors === 'object' &&
        !Array.isArray(data.errors)
      ) {
        const errors =
          data.errors as Record<
            string,
            unknown
          >;

        for (const value of Object.values(
          errors,
        )) {
          if (
            typeof value === 'string' &&
            value.trim()
          ) {
            return value.trim();
          }

          if (Array.isArray(value)) {
            const firstMessage =
              value.find(
                (item): item is string =>
                  typeof item === 'string' &&
                  item.trim().length > 0,
              );

            if (firstMessage) {
              return firstMessage.trim();
            }
          }
        }
      }
    }

    if (
      typeof payload === 'string' &&
      payload.trim()
    ) {
      return payload.trim();
    }

    return 'Unknown backend error.';
  }

  private validateId(
    value: number,
    fieldName: string,
  ): void {
    if (
      !Number.isInteger(value) ||
      value <= 0
    ) {
      throw new Error(
        `${fieldName} must be a positive integer.`,
      );
    }
  }

  /*
   * --------------------------------------------------------------------------
   * AUTHENTICATED USER CONTEXT
   * --------------------------------------------------------------------------
   */

  async getContext(): Promise<JsonObject> {
    return this.get<JsonObject>(
      '/mcp/context',
    );
  }

  /*
   * --------------------------------------------------------------------------
   * DASHBOARD
   * --------------------------------------------------------------------------
   */

  async getDashboard(): Promise<JsonObject> {
    return this.get<JsonObject>(
      '/dashboard/analytics',
    );
  }

  async getLowStock(): Promise<JsonObject> {
    return this.get<JsonObject>(
      '/dashboard/low-stock',
    );
  }

  async getTopCustomers(): Promise<JsonObject> {
    return this.get<JsonObject>(
      '/dashboard/top-customers',
    );
  }

  /*
   * --------------------------------------------------------------------------
   * REPORTS
   * --------------------------------------------------------------------------
   */

  async getTopSellingProducts(): Promise<JsonObject> {
    return this.get<JsonObject>(
      '/reports/top-selling-products',
    );
  }

  async getLeastSellingProducts(): Promise<JsonObject> {
    return this.get<JsonObject>(
      '/reports/least-selling-products',
    );
  }

  async getSalesSummary(): Promise<JsonObject> {
    return this.get<JsonObject>(
      '/reports/sales-summary',
    );
  }

  async getPurchaseSummary(): Promise<JsonObject> {
    return this.get<JsonObject>(
      '/reports/purchase-summary',
    );
  }

  async getOutstandingSales(): Promise<JsonObject> {
    return this.get<JsonObject>(
      '/reports/outstanding-sales',
    );
  }

  async getOutstandingPurchases(): Promise<JsonObject> {
    return this.get<JsonObject>(
      '/reports/outstanding-purchases',
    );
  }

  /*
   * --------------------------------------------------------------------------
   * CUSTOMER
   * --------------------------------------------------------------------------
   */

  async getCustomer(
    customerId: number,
  ): Promise<JsonObject> {
    this.validateId(
      customerId,
      'customerId',
    );

    return this.get<JsonObject>(
      `/customers/${customerId}`,
    );
  }

  /*
   * --------------------------------------------------------------------------
   * PRODUCT
   * --------------------------------------------------------------------------
   */

  async getProduct(
    productId: number,
  ): Promise<JsonObject> {
    this.validateId(
      productId,
      'productId',
    );

    return this.get<JsonObject>(
      `/products/${productId}`,
    );
  }

  /*
   * --------------------------------------------------------------------------
   * INVOICE
   * --------------------------------------------------------------------------
   */

  async getInvoice(
    invoiceId: number,
  ): Promise<JsonObject> {
    this.validateId(
      invoiceId,
      'invoiceId',
    );

    return this.get<JsonObject>(
      `/invoices/${invoiceId}`,
    );
  }
}