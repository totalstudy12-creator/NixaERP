import { config } from '../config.js';
export function getOAuthIssuer() {
    return `${getServerOrigin()}/oauth`;
}
function getServerOrigin() {
    const publicUrl = new URL(config.mcpPublicUrl);
    return publicUrl.origin;
}
export function getOAuthAuthorizationServerMetadata() {
    const issuer = getOAuthIssuer();
    return {
        issuer,
        authorization_endpoint: `${issuer}/authorize`,
        token_endpoint: `${issuer}/token`,
        response_types_supported: [
            'code',
        ],
        grant_types_supported: [
            'authorization_code',
        ],
        code_challenge_methods_supported: [
            'S256',
        ],
        scopes_supported: [
            'mcp:read',
        ],
        token_endpoint_auth_methods_supported: [
            'none',
        ],
        authorization_response_iss_parameter_supported: true,
    };
}
