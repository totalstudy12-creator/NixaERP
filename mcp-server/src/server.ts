import {
  createMcpHandler,
  McpServer,
} from '@modelcontextprotocol/server';

import { config } from './config.js';
import { NixaerpClient } from './nixaerp-client.js';
import { registerTools } from './tools.js';

export function createMcpServer() {
  const server =
    new McpServer(
      {
        name: 'nixaerp',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

  const client =
    new NixaerpClient();

  registerTools(
    server,
    client
  );

  return server;
}

export const mcpHandler =
  createMcpHandler(
    () => createMcpServer()
  );

export {
  config,
};