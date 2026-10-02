import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import QRCode from 'qrcode';
import whatsappWeb from 'whatsapp-web.js';

const { Client, LocalAuth } = whatsappWeb;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const host = process.env.WHATSAPP_SERVICE_HOST || '127.0.0.1';
const port = Number(process.env.WHATSAPP_SERVICE_PORT || 3010);
const token = process.env.WHATSAPP_SERVICE_TOKEN || '';
const authPath = process.env.WWEBJS_AUTH_PATH || path.resolve(__dirname, '../storage/whatsapp-session');
const clientId = process.env.WWEBJS_CLIENT_ID || 'nexa-erp';
const state = {
  provider: 'whatsapp_web_js',
  status: 'starting',
  configured: true,
  connected: false,
  ready: false,
  authenticated: false,
  qr_available: false,
  qr: null,
  last_connected_at: null,
  last_disconnected_at: null,
  last_error: null,
  last_error_at: null,
};

let client = null;
let clientInitialization = null;

const invalidateClient = (activeClient, error) => {
  state.status = 'error';
  state.connected = false;
  state.ready = false;
  state.authenticated = false;
  state.qr_available = false;
  state.qr = null;
  state.last_error = error?.message || 'WhatsApp runtime error.';
  state.last_error_at = new Date().toISOString();

  if (client === activeClient) {
    client = null;
    clientInitialization = null;
  }

  void activeClient?.destroy().catch(() => {});
};

const passportQrResponse = () => ({
  provider: state.provider,
  status: state.status,
  configured: state.configured,
  connected: state.connected,
  ready: state.ready,
  authenticated: state.authenticated,
  qr_available: Boolean(state.qr),
  last_connected_at: state.last_connected_at,
  last_error: state.last_error,
  last_error_at: state.last_error_at,
});

const normalizeRecipient = (value) => {
  if (!value || typeof value !== 'string') return null;
  const cleaned = value.trim();
  if (!cleaned) return null;
  if (cleaned.includes('@')) return cleaned;

  const digits = cleaned.replace(/\D/g, '');
  if (!digits) return null;

  if (digits.length === 10) return `91${digits}`;
  if (digits.length === 12 && digits.startsWith('91')) return digits;
  if (digits.length > 10 && digits.length <= 15) return digits;

  return null;
};

const createClient = () => {
  if (client) {
    return client;
  }

  const options = {
    authStrategy: new LocalAuth({
      clientId,
      dataPath: authPath,
    }),
    puppeteer: {
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    },
  };

  if (process.env.CHROME_BIN) {
    options.puppeteer = {
      ...options.puppeteer,
      executablePath: process.env.CHROME_BIN,
    };
  }

  client = new Client(options);

  client.on('qr', (qr) => {
    state.status = 'qr_required';
    state.connected = false;
    state.ready = false;
    state.authenticated = false;
    state.qr_available = true;
    state.qr = qr;
    state.last_error = null;
    state.last_error_at = null;
  });

  client.on('authenticated', () => {
    state.status = 'authenticating';
    state.authenticated = true;
    state.qr_available = false;
    state.qr = null;
    state.last_error = null;
    state.last_error_at = null;
  });

  client.on('ready', () => {
    state.status = 'ready';
    state.connected = true;
    state.ready = true;
    state.authenticated = true;
    state.qr_available = false;
    state.qr = null;
    state.last_connected_at = new Date().toISOString();
    state.last_error = null;
    state.last_error_at = null;
  });

  client.on('auth_failure', (error) => {
    state.status = 'auth_failure';
    state.connected = false;
    state.ready = false;
    state.authenticated = false;
    state.last_error = error?.message || 'WhatsApp authentication failed.';
    state.last_error_at = new Date().toISOString();
    client = null;
    clientInitialization = null;
  });

  client.on('error', (error) => {
    state.status = 'error';
    state.connected = false;
    state.ready = false;
    state.authenticated = false;
    state.qr_available = false;
    state.qr = null;
    state.last_error = error?.message || 'WhatsApp runtime error.';
    state.last_error_at = new Date().toISOString();
    client = null;
    clientInitialization = null;
  });

  client.on('disconnected', (reason) => {
    state.status = 'disconnected';
    state.connected = false;
    state.ready = false;
    state.authenticated = false;
    state.qr_available = false;
    state.qr = null;
    state.last_error = typeof reason === 'string' ? reason : 'WhatsApp disconnected.';
    state.last_error_at = new Date().toISOString();
    state.last_disconnected_at = new Date().toISOString();
    client = null;
    clientInitialization = null;
  });

  return client;
};

const ensureClient = async () => {
  if (state.status === 'error' && client) {
    client = null;
    clientInitialization = null;
  }

  const activeClient = createClient();
  if (!activeClient) {
    throw new Error('Unable to create the WhatsApp client.');
  }

  if (!clientInitialization) {
    clientInitialization = activeClient.initialize().catch((error) => {
      clientInitialization = null;
      if (client === activeClient) client = null;
      throw error;
    });
  }

  await clientInitialization;
  return activeClient;
};

const authorize = (req, res, next) => {
  const incomingToken = req.header('X-WhatsApp-Service-Token') || req.header('Authorization')?.replace(/^Bearer\s+/i, '');
  if (!incomingToken || incomingToken !== token) {
    return res.status(401).json({ success: false, error: 'Unauthorized WhatsApp service request.' });
  }

  return next();
};

app.use(express.json({ limit: '2mb' }));

app.get('/health', (req, res) => {
  res.json({
    service: 'whatsapp_web_js',
    status: state.status,
    whatsapp_status: state.status,
    uptime: Math.max(0, Math.round((Date.now() - (globalThis.__APP_START_TS || Date.now())) / 1000)),
    last_error: state.last_error,
  });
});

app.get('/status', async (req, res) => {
  try {
    if (!client) {
      return res.json({ success: true, data: passportQrResponse() });
    }

    return res.json({ success: true, data: passportQrResponse() });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/qr', authorize, async (req, res) => {
  if (!state.qr) {
    return res.status(404).json({ success: false, error: 'No QR code is currently available.' });
  }

  const qrImage = await QRCode.toDataURL(state.qr);
  return res.json({ success: true, data: { qr: qrImage } });
});

app.post('/connect', authorize, async (req, res) => {
  try {
    if (!clientInitialization) state.status = 'starting';
    await ensureClient();
    return res.json({ success: true, data: passportQrResponse() });
  } catch (error) {
    state.status = 'error';
    state.last_error = error.message;
    state.last_error_at = new Date().toISOString();
    return res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/logout', authorize, async (req, res) => {
  try {
    if (client) {
      await client.logout();
    }
    client = null;
    clientInitialization = null;
    state.status = 'disconnected';
    state.connected = false;
    state.ready = false;
    state.authenticated = false;
    state.qr_available = false;
    state.qr = null;
    state.last_error = 'Admin logged out of WhatsApp.';
    state.last_error_at = new Date().toISOString();
    return res.json({ success: true, data: passportQrResponse() });
  } catch (error) {
    state.last_error = error.message;
    state.last_error_at = new Date().toISOString();
    return res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/test', authorize, async (req, res) => {
  const { to, message } = req.body || {};
  if (!to || !message) {
    return res.status(400).json({ success: false, error: 'A destination phone number and message are required.' });
  }

  try {
    const normalized = normalizeRecipient(to);
    if (!normalized) {
      return res.status(422).json({ success: false, error: 'The provided phone number is not valid for WhatsApp.' });
    }

    const activeClient = await ensureClient();
    const response = await activeClient.sendMessage(`${normalized}@c.us`, message);
    const messageId = response && (response.id?._serialized || response.id || null);
    return res.json({ success: true, status: 'sent', message_id: messageId });
  } catch (error) {
    invalidateClient(client, error);
    return res.status(500).json({ success: false, status: 'failed', error: error.message });
  }
});

app.post('/internal/whatsapp/send', authorize, async (req, res) => {
  const { to, message, notification_id, event } = req.body || {};
  if (!to || !message) {
    return res.status(400).json({ success: false, status: 'failed', error: 'A recipient and message are required.' });
  }

  if (!state.ready || !state.connected) {
    return res.status(503).json({ success: false, status: 'failed', error: 'WhatsApp client is not ready.' });
  }

  try {
    const normalized = normalizeRecipient(to);
    if (!normalized) {
      return res.status(422).json({ success: false, status: 'failed', error: 'The target phone number is invalid.' });
    }

    const activeClient = await ensureClient();
    const response = await activeClient.sendMessage(`${normalized}@c.us`, message);
    const messageId = response && (response.id?._serialized || response.id || null);
    return res.json({
      success: true,
      status: 'sent',
      message_id: messageId,
      notification_id: notification_id ?? null,
      event: event ?? 'system.alert',
    });
  } catch (error) {
    invalidateClient(client, error);
    return res.status(500).json({ success: false, status: 'failed', error: error.message });
  }
});

globalThis.__APP_START_TS = Date.now();

const boot = async () => {
  try {
    await ensureClient();
  } catch (error) {
    state.status = 'error';
    state.last_error = error.message;
    state.last_error_at = new Date().toISOString();
  }
};

app.listen(port, host, () => {
  console.log(`WhatsApp Web.js worker listening on http://${host}:${port}`);
  void boot();
});
