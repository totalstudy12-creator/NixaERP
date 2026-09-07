import 'dotenv/config';
function required(name) {
    const value = process.env[name]?.trim();
    if (!value) {
        throw new Error(`${name} is required.`);
    }
    return value;
}
function optional(name, fallback) {
    const value = process.env[name]?.trim();
    return value || fallback;
}
function parsePort(name, fallback) {
    const raw = process.env[name]?.trim();
    if (!raw) {
        return fallback;
    }
    const port = Number(raw);
    if (!Number.isInteger(port) ||
        port < 1 ||
        port > 65535) {
        throw new Error(`${name} must be a valid port between 1 and 65535.`);
    }
    return port;
}
const nodeEnv = optional('NODE_ENV', 'development');
const nixaerpApiBaseUrl = required('NIXAERP_API_BASE_URL');
const nixaerpMcpToken = required('NIXAERP_MCP_TOKEN');
const host = optional('MCP_HOST', '127.0.0.1');
const port = parsePort('MCP_PORT', 3001);
const mcpPublicUrl = optional('MCP_PUBLIC_URL', `http://${host}:${port}/mcp`);
export const config = {
    nodeEnv,
    nixaerpApiBaseUrl,
    nixaerpMcpToken,
    host,
    port,
    mcpPublicUrl,
};
