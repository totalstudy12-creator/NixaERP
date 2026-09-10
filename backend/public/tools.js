import { z } from 'zod/v4';
const positiveInteger = z.coerce
    .number()
    .int()
    .positive();
function jsonResult(data) {
    return {
        content: [
            {
                type: 'text',
                text: JSON.stringify(data, null, 2),
            },
        ],
    };
}
function errorResult(error) {
    if (error instanceof Error) {
        return {
            isError: true,
            content: [
                {
                    type: 'text',
                    text: JSON.stringify({
                        success: false,
                        error: error.message,
                    }, null, 2),
                },
            ],
        };
    }
    return {
        isError: true,
        content: [
            {
                type: 'text',
                text: JSON.stringify({
                    success: false,
                    error: 'Unknown MCP tool error.',
                }, null, 2),
            },
        ],
    };
}
async function executeTool(operation) {
    try {
        const data = await operation();
        return jsonResult(data);
    }
    catch (error) {
        console.error('MCP tool execution failed:', error);
        return errorResult(error);
    }
}
export function registerTools(server, client) {
    /*
     * --------------------------------------------------------------------------
     * USER CONTEXT
     * --------------------------------------------------------------------------
     */
    server.registerTool('nixaerp_whoami', {
        title: 'NixaERP User Context',
        description: 'Returns the authenticated NixaERP user and MCP access context.',
        inputSchema: {},
    }, async () => {
        return executeTool(() => client.getContext());
    });
    /*
     * --------------------------------------------------------------------------
     * DASHBOARD
     * --------------------------------------------------------------------------
     */
    server.registerTool('nixaerp_dashboard', {
        title: 'NixaERP Dashboard',
        description: 'Returns dashboard analytics from NixaERP.',
        inputSchema: {},
    }, async () => {
        return executeTool(() => client.getDashboard());
    });
    /*
     * --------------------------------------------------------------------------
     * LOW STOCK
     * --------------------------------------------------------------------------
     */
    server.registerTool('nixaerp_low_stock', {
        title: 'NixaERP Low Stock',
        description: 'Returns products currently reported as low stock.',
        inputSchema: {},
    }, async () => {
        return executeTool(() => client.getLowStock());
    });
    /*
     * --------------------------------------------------------------------------
     * TOP CUSTOMERS
     * --------------------------------------------------------------------------
     */
    server.registerTool('nixaerp_top_customers', {
        title: 'NixaERP Top Customers',
        description: 'Returns top customers from NixaERP.',
        inputSchema: {},
    }, async () => {
        return executeTool(() => client.getTopCustomers());
    });
    /*
     * --------------------------------------------------------------------------
     * TOP SELLING PRODUCTS
     * --------------------------------------------------------------------------
     */
    server.registerTool('nixaerp_top_selling_products', {
        title: 'NixaERP Top Selling Products',
        description: 'Returns top-selling products from NixaERP.',
        inputSchema: {},
    }, async () => {
        return executeTool(() => client.getTopSellingProducts());
    });
    /*
     * --------------------------------------------------------------------------
     * LEAST SELLING PRODUCTS
     * --------------------------------------------------------------------------
     */
    server.registerTool('nixaerp_least_selling_products', {
        title: 'NixaERP Least Selling Products',
        description: 'Returns least-selling products from NixaERP.',
        inputSchema: {},
    }, async () => {
        return executeTool(() => client.getLeastSellingProducts());
    });
    /*
     * --------------------------------------------------------------------------
     * SALES SUMMARY
     * --------------------------------------------------------------------------
     */
    server.registerTool('nixaerp_sales_summary', {
        title: 'NixaERP Sales Summary',
        description: 'Returns sales summary information.',
        inputSchema: {},
    }, async () => {
        return executeTool(() => client.getSalesSummary());
    });
    /*
     * --------------------------------------------------------------------------
     * PURCHASE SUMMARY
     * --------------------------------------------------------------------------
     */
    server.registerTool('nixaerp_purchase_summary', {
        title: 'NixaERP Purchase Summary',
        description: 'Returns purchase summary information.',
        inputSchema: {},
    }, async () => {
        return executeTool(() => client.getPurchaseSummary());
    });
    /*
     * --------------------------------------------------------------------------
     * OUTSTANDING SALES
     * --------------------------------------------------------------------------
     */
    server.registerTool('nixaerp_outstanding_sales', {
        title: 'NixaERP Outstanding Sales',
        description: 'Returns outstanding customer receivables.',
        inputSchema: {},
    }, async () => {
        return executeTool(() => client.getOutstandingSales());
    });
    /*
     * --------------------------------------------------------------------------
     * OUTSTANDING PURCHASES
     * --------------------------------------------------------------------------
     */
    server.registerTool('nixaerp_outstanding_purchases', {
        title: 'NixaERP Outstanding Purchases',
        description: 'Returns outstanding supplier payables.',
        inputSchema: {},
    }, async () => {
        return executeTool(() => client.getOutstandingPurchases());
    });
    /*
     * --------------------------------------------------------------------------
     * GET CUSTOMER
     * --------------------------------------------------------------------------
     */
    server.registerTool('nixaerp_get_customer', {
        title: 'Get NixaERP Customer',
        description: 'Returns a customer by numeric customer ID.',
        inputSchema: {
            customer_id: positiveInteger.describe('Customer ID'),
        },
    }, async ({ customer_id }) => {
        return executeTool(() => client.getCustomer(customer_id));
    });
    /*
     * --------------------------------------------------------------------------
     * GET PRODUCT
     * --------------------------------------------------------------------------
     */
    server.registerTool('nixaerp_get_product', {
        title: 'Get NixaERP Product',
        description: 'Returns a product by numeric product ID.',
        inputSchema: {
            product_id: positiveInteger.describe('Product ID'),
        },
    }, async ({ product_id }) => {
        return executeTool(() => client.getProduct(product_id));
    });
    /*
     * --------------------------------------------------------------------------
     * GET INVOICE
     * --------------------------------------------------------------------------
     */
    server.registerTool('nixaerp_get_invoice', {
        title: 'Get NixaERP Invoice',
        description: 'Returns an invoice by numeric invoice ID.',
        inputSchema: {
            invoice_id: positiveInteger.describe('Invoice ID'),
        },
    }, async ({ invoice_id }) => {
        return executeTool(() => client.getInvoice(invoice_id));
    });
}
