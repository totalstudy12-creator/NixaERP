import {
  useEffect,
  useMemo,
  useState,
  useCallback,
} from 'react';
import {
  FiSave,
  FiRefreshCw,
  FiSettings,
  FiSearch,
  FiCopy,
  FiCheck,
  FiChevronDown,
  FiChevronUp,
  FiAlertCircle,
  FiPlus,
  FiTrash2,
  FiKey,
  FiX,
  FiCode,
  FiEye,
  FiEyeOff,
  FiLink,
  FiServer,
  FiGlobe,
  FiExternalLink,
  FiInfo,
  FiShield,
  FiDatabase,
  FiPrinter,
  FiBluetooth,
  FiRadio,
  FiPower,
  FiLoader,
  FiCheckCircle,
} from 'react-icons/fi';

import { apiClient, API_BASE } from '../api';
import { useNotification } from '../components/NotificationContext';

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

interface SettingItem {
  id: number;
  key: string;
  value: string;
  group: string | null;
  description: string | null;
  is_public: boolean;
  type?:
    | 'string'
    | 'boolean'
    | 'number'
    | 'json'
    | 'color'
    | 'select';
  options?: string[];
  defaultValue?: string;
}

interface McpToken {
  id: number;
  name: string;
  abilities: string[];
  last_used_at: string | null;
  expires_at: string | null;
  created_at: string | null;
}

interface McpTokenCreateResponse {
  token: string;
  token_type: string;
  id: number;
  name: string;
  abilities: string[];
  expires_at: string | null;
  warning?: string;
}

interface McpStatus {
  enabled: boolean;
  authenticated: boolean;
  mode: string;
  version: string;
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

function inferType(
  key: string
): SettingItem['type'] {
  const lower = key.toLowerCase();

  if (
    lower.includes('color') ||
    lower.includes('colour')
  ) {
    return 'color';
  }

  if (
    lower.includes('maintenance') ||
    lower.includes('enable') ||
    lower.includes('notifications') ||
    lower.includes('auto') ||
    lower.includes('debug') ||
    lower.includes('allow')
  ) {
    return 'boolean';
  }

  if (
    lower.includes('currency') ||
    lower.includes('timezone') ||
    lower.includes('language') ||
    lower.includes('theme') ||
    lower.includes('mode')
  ) {
    return 'select';
  }

  if (
    lower.includes('port') ||
    lower.includes('limit') ||
    lower.includes('timeout') ||
    lower.includes('retry') ||
    lower.includes('max') ||
    lower.includes('min')
  ) {
    return 'number';
  }

  if (
    lower.includes('json') ||
    lower.includes('config') ||
    lower.includes('payload') ||
    lower.includes('mapping')
  ) {
    return 'json';
  }

  return 'string';
}

const DEFAULT_OPTIONS: Record<
  string,
  string[]
> = {
  currency: [
    'USD',
    'INR',
    'EUR',
    'GBP',
    'JPY',
    'AED',
    'AUD',
  ],
  timezone: [
    'UTC',
    'Asia/Kolkata',
    'America/New_York',
    'Europe/London',
    'Asia/Dubai',
  ],
  language: [
    'en',
    'hi',
    'es',
    'fr',
    'de',
    'zh',
  ],
  theme: [
    'light',
    'dark',
    'system',
  ],
  date_format: [
    'DD/MM/YYYY',
    'MM/DD/YYYY',
    'YYYY-MM-DD',
  ],
  time_format: [
    '12h',
    '24h',
  ],
  printer_format: [
    '58mm',
    '80mm',
    'A4',
  ],
  printer_connection: [
    'browser',
    'bluetooth',
    'system',
  ],
};

const GROUP_META: Record<
  string,
  {
    icon: string;
    color: string;
  }
> = {
  general: {
    icon: '⚙️',
    color: 'bg-blue-100 text-blue-700',
  },
  finance: {
    icon: '💰',
    color: 'bg-emerald-100 text-emerald-700',
  },
  system: {
    icon: '🖥️',
    color: 'bg-purple-100 text-purple-700',
  },
  notifications: {
    icon: '🔔',
    color: 'bg-amber-100 text-amber-700',
  },
  security: {
    icon: '🔒',
    color: 'bg-rose-100 text-rose-700',
  },
  appearance: {
    icon: '🎨',
    color: 'bg-pink-100 text-pink-700',
  },
  printer: {
    icon: '🖨️',
    color: 'bg-cyan-100 text-cyan-700',
  },
  voice: {
    icon: '🎙️',
    color: 'bg-violet-100 text-violet-700',
  },
};

// -----------------------------------------------------------------------------
// Defaults
// -----------------------------------------------------------------------------

const DEFAULT_VOICE_SETTINGS = {
  voice_tts_provider: 'auto',
  voice_default_language: 'en-US',
  voice_browser_enabled: 'true',
  voice_paid_enabled: 'true',
  voice_auto_read_enabled: 'true',
  voice_speed: '0.96',
  elevenlabs_api_key: '',
  elevenlabs_voice_id:
    'EXAVITQu4vr4xnSDxMaL',
  elevenlabs_model_id:
    'eleven_multilingual_v2',
};

const DEFAULT_PRINTER_SETTINGS = {
  printer_default_format: 'A4',
  printer_connection_mode: 'browser',
  printer_bluetooth_device_name: '',
  printer_bluetooth_device_id: '',
  printer_last_connected: '',
  printer_is_connected: 'false',
};

// -----------------------------------------------------------------------------
// Skeletons
// -----------------------------------------------------------------------------

const SkeletonCard = () => (
  <div className="flex animate-pulse items-center gap-3 rounded-xl border border-slate-100 bg-white p-4">
    <div className="h-10 w-10 rounded-xl bg-slate-200" />

    <div className="flex-1 space-y-2">
      <div className="h-3 w-16 rounded bg-slate-200" />
      <div className="h-6 w-8 rounded bg-slate-200" />
    </div>
  </div>
);

const SkeletonTable = () => (
  <div className="space-y-4 rounded-xl border bg-white p-6 shadow-sm animate-pulse">
    <div className="h-6 w-48 rounded bg-slate-200" />

    {[...Array(5)].map((_, index) => (
      <div
        key={index}
        className="flex gap-4"
      >
        <div className="h-4 w-1/3 rounded bg-slate-200" />
        <div className="h-4 w-1/5 rounded bg-slate-200" />
        <div className="h-4 w-1/6 rounded bg-slate-200" />
        <div className="h-4 w-1/4 rounded bg-slate-200" />
      </div>
    ))}
  </div>
);

// -----------------------------------------------------------------------------
// Component
// -----------------------------------------------------------------------------

export function SettingsPage() {
  // ---------------------------------------------------------------------------
  // General settings state
  // ---------------------------------------------------------------------------

  const [settings, setSettings] =
    useState<SettingItem[]>([]);

  const [loading, setLoading] =
    useState(true);

  const [saving, setSaving] =
    useState<Record<string, boolean>>({});

  const [error, setError] =
    useState<string | null>(null);

  const [search, setSearch] =
    useState('');

  const [expandedGroups, setExpandedGroups] =
    useState<Record<string, boolean>>({});

  const [copiedKey, setCopiedKey] =
    useState<string | null>(null);

  const [showAddModal, setShowAddModal] =
    useState(false);

  const [showAuthToken, setShowAuthToken] =
    useState(false);

  const [activeTab, setActiveTab] =
    useState<
      'settings' | 'api' | 'printer'
    >('settings');

  // ---------------------------------------------------------------------------
  // Voice state
  // ---------------------------------------------------------------------------

  const [voiceConfig, setVoiceConfig] =
    useState(DEFAULT_VOICE_SETTINGS);

  // ---------------------------------------------------------------------------
  // Printer state
  // ---------------------------------------------------------------------------

  const [printerSettings, setPrinterSettings] =
    useState(DEFAULT_PRINTER_SETTINGS);

  const [
    bluetoothDevices,
    setBluetoothDevices,
  ] = useState<BluetoothDevice[]>([]);

  const [
    scanningBluetooth,
    setScanningBluetooth,
  ] = useState(false);

  const [
    connectingDevice,
    setConnectingDevice,
  ] = useState<string | null>(null);

  const [
    connectedDevice,
    setConnectedDevice,
  ] = useState<BluetoothDevice | null>(
    null
  );

  // ---------------------------------------------------------------------------
  // New setting
  // ---------------------------------------------------------------------------

  const [newSetting, setNewSetting] =
    useState({
      key: '',
      value: '',
      group: 'general',
      description: '',
      is_public: false,
    });

  // ---------------------------------------------------------------------------
  // MCP state
  // ---------------------------------------------------------------------------

  const [mcpTokens, setMcpTokens] =
    useState<McpToken[]>([]);

  const [mcpLoading, setMcpLoading] =
    useState(false);

  const [mcpGenerating, setMcpGenerating] =
    useState(false);

  const [mcpRevokingId, setMcpRevokingId] =
    useState<number | null>(null);

  const [mcpRevokingAll, setMcpRevokingAll] =
    useState(false);

  const [mcpName, setMcpName] =
    useState('ChatGPT');

  const [mcpExpiresDays, setMcpExpiresDays] =
    useState('30');

  const [mcpStatus, setMcpStatus] =
    useState<McpStatus | null>(null);

  const [mcpStatusLoading, setMcpStatusLoading] =
    useState(false);

  const [
    createdMcpToken,
    setCreatedMcpToken,
  ] = useState<McpTokenCreateResponse | null>(
    null
  );

  const [
    showMcpToken,
    setShowMcpToken,
  ] = useState(false);

  // ---------------------------------------------------------------------------
  // Dependencies
  // ---------------------------------------------------------------------------

  const {
    showSuccess,
    showError,
  } = useNotification();

  // ---------------------------------------------------------------------------
  // Existing ERP token
  // ---------------------------------------------------------------------------
  //
  // Used only internally for already-existing API functionality.
  // It is never sent to MCP token endpoints as an MCP token.
  // ---------------------------------------------------------------------------

  const authToken = useMemo(() => {
    try {
      const state = localStorage.getItem(
        'auth-storage'
      );

      if (!state) {
        return null;
      }

      const parsed = JSON.parse(state);

      return (
        parsed?.state?.token ??
        parsed?.token ??
        null
      );
    } catch {
      return null;
    }
  }, []);

  // ---------------------------------------------------------------------------
  // API URL
  // ---------------------------------------------------------------------------

  const fullApiUrl = useMemo(() => {
    if (API_BASE.startsWith('http')) {
      return API_BASE;
    }

    const baseUrl =
      window.location.origin;

    return `${baseUrl}${API_BASE}`;
  }, []);

  // ---------------------------------------------------------------------------
  // Load Settings
  // ---------------------------------------------------------------------------

  const loadSettings = useCallback(
    async () => {
      setLoading(true);
      setError(null);

      try {
        const response =
          await apiClient.request(
            'GET',
            '/settings'
          );

        const rawData = Array.isArray(
          response
        )
          ? response
          : response?.data;

        if (
          !rawData ||
          !Array.isArray(rawData)
        ) {
          throw new Error(
            'Invalid settings response'
          );
        }

        const enriched =
          rawData.map(
            (item: SettingItem) => ({
              ...item,
              value: String(
                item.value ?? ''
              ),
              type: inferType(
                item.key
              ),
              options:
                DEFAULT_OPTIONS[
                  item.key.toLowerCase()
                ] || [],
              defaultValue: String(
                item.value ?? ''
              ),
            })
          );

        setSettings(enriched);

        const mergedVoiceConfig = {
          ...DEFAULT_VOICE_SETTINGS,
        };

        rawData.forEach(
          (item: SettingItem) => {
            if (
              item &&
              typeof item.key ===
                'string' &&
              Object.prototype.hasOwnProperty.call(
                mergedVoiceConfig,
                item.key
              )
            ) {
              mergedVoiceConfig[
                item.key as keyof typeof mergedVoiceConfig
              ] = String(
                item.value ??
                  mergedVoiceConfig[
                    item.key as keyof typeof mergedVoiceConfig
                  ]
              );
            }
          }
        );

        setVoiceConfig(
          mergedVoiceConfig
        );

        const mergedPrinterSettings = {
          ...DEFAULT_PRINTER_SETTINGS,
        };

        rawData.forEach(
          (item: SettingItem) => {
            if (
              item &&
              typeof item.key ===
                'string' &&
              Object.prototype.hasOwnProperty.call(
                mergedPrinterSettings,
                item.key
              )
            ) {
              mergedPrinterSettings[
                item.key as keyof typeof mergedPrinterSettings
              ] = String(
                item.value ??
                  mergedPrinterSettings[
                    item.key as keyof typeof mergedPrinterSettings
                  ]
              );
            }
          }
        );

        setPrinterSettings(
          mergedPrinterSettings
        );

        if (
          mergedPrinterSettings
            .printer_is_connected ===
            'true' &&
          mergedPrinterSettings
            .printer_bluetooth_device_id
        ) {
          setConnectedDevice({
            id:
              mergedPrinterSettings
                .printer_bluetooth_device_id,

            name:
              mergedPrinterSettings
                .printer_bluetooth_device_name ||
              'Unknown Printer',
          } as BluetoothDevice);
        } else {
          setConnectedDevice(null);
        }

        setExpandedGroups(
          (previous) => {
            const firstGroup =
              enriched[0]?.group ||
              'general';

            return {
              ...previous,
              [firstGroup]: true,
            };
          }
        );
      } catch (err: unknown) {
        const errorObject =
          err as {
            backendMessage?: string;
            message?: string;
          };

        const message =
          errorObject?.backendMessage ||
          errorObject?.message ||
          'Unable to load settings.';

        setError(message);

        showError(
          'Failed to load settings',
          message
        );
      } finally {
        setLoading(false);
      }
    },
    [showError]
  );

  // ---------------------------------------------------------------------------
  // Load MCP Tokens
  // ---------------------------------------------------------------------------

  const loadMcpTokens = useCallback(
    async () => {
      setMcpLoading(true);

      try {
        const response =
          await apiClient.request(
            'GET',
            '/mcp/tokens'
          );

        const rawData = Array.isArray(
          response
        )
          ? response
          : response?.data;

        if (!Array.isArray(rawData)) {
          throw new Error(
            'Invalid MCP token response.'
          );
        }

        setMcpTokens(
          rawData.map(
            (token: McpToken) => ({
              id: Number(token.id),
              name: String(
                token.name ?? ''
              ),
              abilities: Array.isArray(
                token.abilities
              )
                ? token.abilities.filter(
                    (
                      ability
                    ): ability is string =>
                      typeof ability ===
                      'string'
                  )
                : [],
              last_used_at:
                token.last_used_at
                  ? String(
                      token.last_used_at
                    )
                  : null,
              expires_at:
                token.expires_at
                  ? String(
                      token.expires_at
                    )
                  : null,
              created_at:
                token.created_at
                  ? String(
                      token.created_at
                    )
                  : null,
            })
          )
        );
      } catch (err: unknown) {
        const errorObject =
          err as {
            backendMessage?: string;
            message?: string;
          };

        const message =
          errorObject?.backendMessage ||
          errorObject?.message ||
          'Unable to load MCP tokens.';

        showError(
          'MCP token loading failed',
          message
        );
      } finally {
        setMcpLoading(false);
      }
    },
    [showError]
  );

  // ---------------------------------------------------------------------------
  // Check MCP Status
  // ---------------------------------------------------------------------------

  const checkMcpStatus = useCallback(
    async () => {
      setMcpStatusLoading(true);

      try {
        const response =
          await apiClient.request(
            'GET',
            '/mcp/status'
          );

        const data =
          response?.data ?? response;

        if (
          !data ||
          typeof data !== 'object'
        ) {
          throw new Error(
            'Invalid MCP status response.'
          );
        }

        setMcpStatus({
          enabled: Boolean(
            data.enabled
          ),
          authenticated: Boolean(
            data.authenticated
          ),
          mode: String(
            data.mode ??
              'unknown'
          ),
          version: String(
            data.version ??
              'unknown'
          ),
        });
      } catch (err: unknown) {
        const errorObject =
          err as {
            backendMessage?: string;
            message?: string;
          };

        const message =
          errorObject?.backendMessage ||
          errorObject?.message ||
          'Unable to check MCP status.';

        setMcpStatus(null);

        showError(
          'MCP status failed',
          message
        );
      } finally {
        setMcpStatusLoading(false);
      }
    },
    [showError]
  );

  // ---------------------------------------------------------------------------
  // Generate MCP Token
  // ---------------------------------------------------------------------------

  const generateMcpToken = useCallback(
    async () => {
      const trimmedName =
        mcpName.trim();

      if (!trimmedName) {
        showError(
          'Missing MCP name',
          'Enter a name for this MCP connection.'
        );

        return;
      }

      const expiresDays =
        Number(mcpExpiresDays);

      if (
        !Number.isInteger(
          expiresDays
        ) ||
        expiresDays < 1 ||
        expiresDays > 90
      ) {
        showError(
          'Invalid expiry',
          'MCP token expiry must be between 1 and 90 days.'
        );

        return;
      }

      setMcpGenerating(true);

      try {
        const response =
          await apiClient.request(
            'POST',
            '/mcp/tokens',
            {
              name: trimmedName,
              expires_days:
                expiresDays,
            }
          );

        const data =
          response?.data ?? response;

        if (
          !data ||
          typeof data !== 'object' ||
          typeof data.token !== 'string' ||
          !data.token
        ) {
          throw new Error(
            'The server did not return a valid MCP token.'
          );
        }

        const createdToken: McpTokenCreateResponse =
          {
            token: data.token,
            token_type:
              String(
                data.token_type ??
                  'Bearer'
              ),
            id: Number(
              data.id
            ),
            name: String(
              data.name ??
                `NixaERP MCP:${trimmedName}`
            ),
            abilities:
              Array.isArray(
                data.abilities
              )
                ? data.abilities
                : ['mcp:read'],
            expires_at:
              data.expires_at
                ? String(
                    data.expires_at
                  )
                : null,
            warning:
              data.warning
                ? String(
                    data.warning
                  )
                : undefined,
          };

        /*
         * Important:
         *
         * This token remains in React memory only.
         * It is NOT stored in localStorage,
         * sessionStorage, URL, or settings database.
         */
        setCreatedMcpToken(
          createdToken
        );

        setShowMcpToken(true);

        await loadMcpTokens();

        showSuccess(
          'MCP token created',
          'The read-only MCP token was created successfully.'
        );
      } catch (err: unknown) {
        const errorObject =
          err as {
            backendMessage?: string;
            message?: string;
          };

        const message =
          errorObject?.backendMessage ||
          errorObject?.message ||
          'Unable to create MCP token.';

        showError(
          'MCP token creation failed',
          message
        );
      } finally {
        setMcpGenerating(false);
      }
    },
    [
      mcpName,
      mcpExpiresDays,
      showError,
      showSuccess,
      loadMcpTokens,
    ]
  );

  // ---------------------------------------------------------------------------
  // Revoke MCP Token
  // ---------------------------------------------------------------------------

  const revokeMcpToken = useCallback(
    async (token: McpToken) => {
      const confirmed =
        window.confirm(
          `Revoke MCP token "${token.name}"?`
        );

      if (!confirmed) {
        return;
      }

      setMcpRevokingId(
        token.id
      );

      try {
        await apiClient.request(
          'DELETE',
          `/mcp/tokens/${token.id}`
        );

        await loadMcpTokens();

        showSuccess(
          'MCP token revoked',
          `${token.name} has been revoked.`
        );
      } catch (err: unknown) {
        const errorObject =
          err as {
            backendMessage?: string;
            message?: string;
          };

        const message =
          errorObject?.backendMessage ||
          errorObject?.message ||
          'Unable to revoke MCP token.';

        showError(
          'MCP revoke failed',
          message
        );
      } finally {
        setMcpRevokingId(null);
      }
    },
    [
      loadMcpTokens,
      showError,
      showSuccess,
    ]
  );

  // ---------------------------------------------------------------------------
  // Revoke all MCP Tokens
  // ---------------------------------------------------------------------------

  const revokeAllMcpTokens =
    useCallback(async () => {
      if (
        mcpTokens.length === 0
      ) {
        showSuccess(
          'No MCP tokens',
          'There are no active MCP tokens to revoke.'
        );

        return;
      }

      const confirmed =
        window.confirm(
          'Revoke ALL MCP tokens for your account? This will disconnect every MCP client using these tokens.'
        );

      if (!confirmed) {
        return;
      }

      setMcpRevokingAll(true);

      try {
        await apiClient.request(
          'DELETE',
          '/mcp/tokens'
        );

        setMcpTokens([]);

        showSuccess(
          'MCP tokens revoked',
          'All MCP tokens have been revoked.'
        );
      } catch (err: unknown) {
        const errorObject =
          err as {
            backendMessage?: string;
            message?: string;
          };

        const message =
          errorObject?.backendMessage ||
          errorObject?.message ||
          'Unable to revoke MCP tokens.';

        showError(
          'MCP revoke failed',
          message
        );
      } finally {
        setMcpRevokingAll(false);
      }
    }, [
      mcpTokens.length,
      showError,
      showSuccess,
    ]);

  // ---------------------------------------------------------------------------
  // Copy MCP Token
  // ---------------------------------------------------------------------------

  const copyMcpToken =
    useCallback(async () => {
      if (
        !createdMcpToken?.token
      ) {
        return;
      }

      try {
        await navigator.clipboard.writeText(
          createdMcpToken.token
        );

        setCopiedKey(
          'mcp-created-token'
        );

        window.setTimeout(
          () => {
            setCopiedKey(
              null
            );
          },
          2000
        );

        showSuccess(
          'Copied',
          'MCP token copied to clipboard.'
        );
      } catch {
        showError(
          'Copy failed',
          'Unable to copy MCP token.'
        );
      }
    }, [
      createdMcpToken,
      showError,
      showSuccess,
    ]);

  // ---------------------------------------------------------------------------
  // General settings
  // ---------------------------------------------------------------------------

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  useEffect(() => {
    if (
      activeTab === 'api'
    ) {
      void loadMcpTokens();
      void checkMcpStatus();
    }
  }, [
    activeTab,
    loadMcpTokens,
    checkMcpStatus,
  ]);

  // ---------------------------------------------------------------------------
  // Grouped settings
  // ---------------------------------------------------------------------------

  const groupedSettings = useMemo(() => {
    const query =
      search.trim().toLowerCase();

    const filtered =
      settings.filter(
        (setting) =>
          setting.key
            .toLowerCase()
            .includes(query) ||
          (
            setting.description ||
            ''
          )
            .toLowerCase()
            .includes(query)
      );

    return filtered.reduce<
      Record<string, SettingItem[]>
    >(
      (
        accumulator,
        item
      ) => {
        const group =
          item.group ||
          'general';

        if (!accumulator[group]) {
          accumulator[group] = [];
        }

        accumulator[group].push(
          item
        );

        return accumulator;
      },
      {}
    );
  }, [settings, search]);

  const totalSettings =
    settings.length;

  const visibleSettings =
    Object.values(
      groupedSettings
    ).reduce(
      (sum, items) =>
        sum + items.length,
      0
    );

  // ---------------------------------------------------------------------------
  // Setting handlers
  // ---------------------------------------------------------------------------

  const handleValueChange =
    useCallback(
      (
        id: number,
        value: string
      ) => {
        setSettings(
          (current) =>
            current.map(
              (item) =>
                item.id === id
                  ? {
                      ...item,
                      value,
                    }
                  : item
            )
        );
      },
      []
    );

  const saveSetting =
    useCallback(
      async (
        setting: SettingItem
      ) => {
        setSaving(
          (previous) => ({
            ...previous,
            [setting.key]: true,
          })
        );

        try {
          if (
            setting.type ===
              'number' &&
            Number.isNaN(
              Number(
                setting.value
              )
            )
          ) {
            throw new Error(
              'Invalid number.'
            );
          }

          if (
            setting.type ===
              'json'
          ) {
            JSON.parse(
              setting.value
            );
          }

          const safeValue =
            setting.type ===
            'boolean'
              ? setting.value ===
                'true'
                ? 'true'
                : 'false'
              : setting.value;

          await apiClient.request(
            'PUT',
            `/settings/${encodeURIComponent(
              setting.key
            )}`,
            {
              value:
                safeValue,
              group:
                setting.group,
              description:
                setting.description,
              is_public:
                setting.is_public,
            }
          );

          showSuccess(
            'Saved',
            `${setting.key} updated.`
          );
        } catch (err: unknown) {
          const errorObject =
            err as {
              backendMessage?: string;
              message?: string;
            };

          const message =
            errorObject?.backendMessage ||
            errorObject?.message ||
            'Save failed.';

          showError(
            'Save failed',
            message
          );

          setSettings(
            (current) =>
              current.map(
                (item) =>
                  item.id ===
                  setting.id
                    ? {
                        ...item,
                        value:
                          String(
                            item.defaultValue ??
                              ''
                          ),
                      }
                    : item
              )
          );
        } finally {
          setSaving(
            (previous) => ({
              ...previous,
              [setting.key]:
                false,
            })
          );
        }
      },
      [
        showSuccess,
        showError,
      ]
    );

  const saveAll =
    useCallback(async () => {
      const changed =
        settings.filter(
          (setting) =>
            setting.value !==
            setting.defaultValue
        );

      if (
        changed.length === 0
      ) {
        showSuccess(
          'No changes',
          'All settings are up to date.'
        );

        return;
      }

      let successCount = 0;

      for (
        const setting of changed
      ) {
        setSaving(
          (previous) => ({
            ...previous,
            [setting.key]: true,
          })
        );

        try {
          await apiClient.request(
            'PUT',
            `/settings/${encodeURIComponent(
              setting.key
            )}`,
            {
              value:
                setting.value,
              group:
                setting.group,
              description:
                setting.description,
              is_public:
                setting.is_public,
            }
          );

          successCount++;
        } catch (err: unknown) {
          const errorObject =
            err as {
              backendMessage?: string;
              message?: string;
            };

          showError(
            `Failed to save ${setting.key}`,
            errorObject?.backendMessage ||
              errorObject?.message ||
              'Error'
          );
        } finally {
          setSaving(
            (previous) => ({
              ...previous,
              [setting.key]:
                false,
            })
          );
        }
      }

      if (
        successCount > 0
      ) {
        showSuccess(
          'Saved',
          `${successCount} setting(s) updated.`
        );

        await loadSettings();
      }
    }, [
      settings,
      showSuccess,
      showError,
      loadSettings,
    ]);

  const createSetting =
    useCallback(async () => {
      const key =
        newSetting.key.trim();

      if (!key) {
        showError(
          'Missing key',
          'Setting key is required.'
        );

        return;
      }

      setSaving(
        (previous) => ({
          ...previous,
          new: true,
        })
      );

      try {
        await apiClient.request(
          'POST',
          '/settings',
          {
            ...newSetting,
            key,
          }
        );

        showSuccess(
          'Created',
          `Setting ${key} added.`
        );

        setShowAddModal(
          false
        );

        setNewSetting({
          key: '',
          value: '',
          group: 'general',
          description: '',
          is_public: false,
        });

        await loadSettings();
      } catch (err: unknown) {
        const errorObject =
          err as {
            backendMessage?: string;
            message?: string;
          };

        showError(
          'Create failed',
          errorObject?.backendMessage ||
            errorObject?.message ||
            'Failed to create setting.'
        );
      } finally {
        setSaving(
          (previous) => ({
            ...previous,
            new: false,
          })
        );
      }
    }, [
      newSetting,
      showSuccess,
      showError,
      loadSettings,
    ]);

  const deleteSetting =
    useCallback(
      async (
        key: string
      ) => {
        const confirmed =
          window.confirm(
            `Delete setting "${key}"?`
          );

        if (!confirmed) {
          return;
        }

        try {
          await apiClient.request(
            'DELETE',
            `/settings/${encodeURIComponent(
              key
            )}`
          );

          showSuccess(
            'Deleted',
            `${key} removed.`
          );

          await loadSettings();
        } catch (err: unknown) {
          const errorObject =
            err as {
              backendMessage?: string;
              message?: string;
            };

          showError(
            'Delete failed',
            errorObject?.backendMessage ||
              errorObject?.message ||
              'Error'
          );
        }
      },
      [
        showSuccess,
        showError,
        loadSettings,
      ]
    );

  // ---------------------------------------------------------------------------
  // Voice
  // ---------------------------------------------------------------------------

  const saveVoiceSettings =
    useCallback(
      async () => {
        const voiceEntries =
          Object.entries(
            voiceConfig
          ).map(
            ([
              key,
              value,
            ]) => ({
              key,
              value,
              group: 'voice',
              description:
                'AI voice configuration for free and paid TTS providers.',
              is_public: false,
            })
          );

        try {
          setSaving(
            (previous) => ({
              ...previous,
              voice: true,
            })
          );

          await apiClient.request(
            'POST',
            '/settings/bulk',
            {
              settings:
                voiceEntries,
            }
          );

          showSuccess(
            'Voice settings saved',
            'The AI voice connection settings were updated.'
          );

          await loadSettings();
        } catch (err: unknown) {
          const errorObject =
            err as {
              backendMessage?: string;
              message?: string;
            };

          showError(
            'Voice settings failed',
            errorObject?.backendMessage ||
              errorObject?.message ||
              'Unable to save voice settings.'
          );
        } finally {
          setSaving(
            (previous) => ({
              ...previous,
              voice: false,
            })
          );
        }
      },
      [
        voiceConfig,
        showSuccess,
        showError,
        loadSettings,
      ]
    );

  // ---------------------------------------------------------------------------
  // Printer
  // ---------------------------------------------------------------------------

  const savePrinterSettings =
    useCallback(
      async () => {
        setSaving(
          (previous) => ({
            ...previous,
            printer: true,
          })
        );

        try {
          for (
            const [
              key,
              value,
            ] of Object.entries(
              printerSettings
            )
          ) {
            await apiClient.request(
              'PUT',
              `/settings/${encodeURIComponent(
                key
              )}`,
              {
                value,
                group:
                  'printer',
                description:
                  'Printer configuration for thermal / A4 printing.',
                is_public:
                  false,
              }
            );
          }

          showSuccess(
            'Printer settings saved',
            'Default format and connection saved successfully.'
          );

          await loadSettings();
        } catch (err: unknown) {
          const errorObject =
            err as {
              backendMessage?: string;
              message?: string;
            };

          showError(
            'Printer settings failed',
            errorObject?.backendMessage ||
              errorObject?.message ||
              'Unable to save printer settings.'
          );
        } finally {
          setSaving(
            (previous) => ({
              ...previous,
              printer: false,
            })
          );
        }
      },
      [
        printerSettings,
        showSuccess,
        showError,
        loadSettings,
      ]
    );

  // ---------------------------------------------------------------------------
  // Bluetooth
  // ---------------------------------------------------------------------------

  const scanBluetoothPrinters =
    useCallback(
      async () => {
        if (
          !(
            'bluetooth' in
            navigator
          )
        ) {
          showError(
            'Bluetooth not supported',
            'This browser does not support Web Bluetooth. Use a Chromium-based browser.'
          );

          return;
        }

        setScanningBluetooth(
          true
        );

        setBluetoothDevices(
          []
        );

        try {
          const bluetooth =
            navigator
              .bluetooth;

          const device =
            await bluetooth.requestDevice(
              {
                filters: [
                  {
                    services: [
                      '000018f0-0000-1000-8000-00805f9b34fb',
                    ],
                  },
                ],
                optionalServices:
                  [
                    '000018f0-0000-1000-8000-00805f9b34fb',
                    '000018f1-0000-1000-8000-00805f9b34fb',
                  ],
              }
            );

          setBluetoothDevices(
            [device]
          );

          showSuccess(
            'Bluetooth device found',
            `Selected: ${
              device.name ||
              'Unnamed printer'
            }`
          );
        } catch (err: unknown) {
          const errorObject =
            err as {
              name?: string;
              message?: string;
            };

          if (
            errorObject?.name ===
            'NotFoundError'
          ) {
            showError(
              'No device selected',
              'Scan cancelled.'
            );
          } else {
            showError(
              'Bluetooth scan failed',
              errorObject?.message ||
                'Unable to find printers.'
            );
          }
        } finally {
          setScanningBluetooth(
            false
          );
        }
      },
      [
        showSuccess,
        showError,
      ]
    );

  const connectBluetoothDevice =
    useCallback(
      async (
        device: BluetoothDevice
      ) => {
        setConnectingDevice(
          device.id
        );

        try {
          const server =
            await device.gatt?.connect();

          if (!server) {
            throw new Error(
              'GATT server unavailable.'
            );
          }

          setConnectedDevice(
            device
          );

          setPrinterSettings(
            (previous) => ({
              ...previous,
              printer_is_connected:
                'true',
              printer_bluetooth_device_id:
                device.id,
              printer_bluetooth_device_name:
                device.name ||
                'Unknown Printer',
              printer_last_connected:
                new Date().toISOString(),
            })
          );

          showSuccess(
            'Connected',
            `Connected to ${
              device.name ||
              'printer'
            }.`
          );
        } catch (err: unknown) {
          const errorObject =
            err as {
              message?: string;
            };

          showError(
            'Connection failed',
            errorObject?.message ||
              'Could not connect.'
          );
        } finally {
          setConnectingDevice(
            null
          );
        }
      },
      [
        showSuccess,
        showError,
      ]
    );

  const disconnectBluetooth =
    useCallback(async () => {
      if (
        connectedDevice
          ?.gatt?.connected
      ) {
        connectedDevice.gatt.disconnect();
      }

      setConnectedDevice(
        null
      );

      setPrinterSettings(
        (previous) => ({
          ...previous,
          printer_is_connected:
            'false',
          printer_bluetooth_device_id:
            '',
          printer_bluetooth_device_name:
            '',
        })
      );

      showSuccess(
        'Disconnected',
        'Bluetooth printer disconnected.'
      );
    }, [
      connectedDevice,
      showSuccess,
    ]);

  // ---------------------------------------------------------------------------
  // Clipboard
  // ---------------------------------------------------------------------------

  const copyToClipboard =
    useCallback(
      async (
        key: string,
        value: string
      ) => {
        try {
          await navigator.clipboard.writeText(
            value
          );

          setCopiedKey(
            key
          );

          window.setTimeout(
            () => {
              setCopiedKey(null);
            },
            1500
          );
        } catch {
          showError(
            'Copy failed',
            'Unable to copy to clipboard.'
          );
        }
      },
      [showError]
    );

  // ---------------------------------------------------------------------------
  // Input renderer
  // ---------------------------------------------------------------------------

  const renderInput = (
    setting: SettingItem
  ) => {
    const commonClasses =
      'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-200';

    const safeValue =
      String(
        setting.value ?? ''
      );

    switch (
      setting.type
    ) {
      case 'boolean':
        return (
          <button
            type="button"
            onClick={() =>
              handleValueChange(
                setting.id,
                setting.value ===
                  'true'
                  ? 'false'
                  : 'true'
              )
            }
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${
              setting.value ===
              'true'
                ? 'bg-blue-600'
                : 'bg-slate-300'
            }`}
            aria-pressed={
              setting.value ===
              'true'
            }
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${
                setting.value ===
                'true'
                  ? 'translate-x-6'
                  : 'translate-x-1'
              }`}
            />
          </button>
        );

      case 'color':
        return (
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={
                safeValue.startsWith(
                  '#'
                )
                  ? safeValue
                  : '#000000'
              }
              onChange={(event) =>
                handleValueChange(
                  setting.id,
                  event.target.value
                )
              }
              className="h-10 w-14 cursor-pointer rounded border border-slate-300"
              aria-label={`${setting.key} color`}
            />

            <input
              type="text"
              value={safeValue}
              onChange={(event) =>
                handleValueChange(
                  setting.id,
                  event.target.value
                )
              }
              className={
                commonClasses
              }
            />
          </div>
        );

      case 'number':
        return (
          <input
            type="number"
            value={safeValue}
            onChange={(event) =>
              handleValueChange(
                setting.id,
                event.target.value
              )
            }
            className={
              commonClasses
            }
          />
        );

      case 'json':
        return (
          <textarea
            rows={3}
            value={safeValue}
            onChange={(event) =>
              handleValueChange(
                setting.id,
                event.target.value
              )
            }
            className={`${commonClasses} font-mono text-xs`}
          />
        );

      case 'select':
        return (
          <select
            value={safeValue}
            onChange={(event) =>
              handleValueChange(
                setting.id,
                event.target.value
              )
            }
            className={
              commonClasses
            }
          >
            {setting.options?.map(
              (option) => (
                <option
                  key={option}
                  value={
                    option
                  }
                >
                  {option}
                </option>
              )
            )}
          </select>
        );

      default:
        return (
          <input
            type="text"
            value={safeValue}
            onChange={(event) =>
              handleValueChange(
                setting.id,
                event.target.value
              )
            }
            className={
              commonClasses
            }
          />
        );
    }
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="min-h-screen bg-[#f5f7fb] p-4 text-slate-800 md:p-7">
      {/* ------------------------------------------------------------------- */}
      {/* Header                                                              */}
      {/* ------------------------------------------------------------------- */}

      <div className="mb-6 flex flex-col justify-between gap-5 rounded-3xl bg-slate-950 px-5 py-6 shadow-xl shadow-slate-300/50 sm:flex-row sm:items-center md:px-8 md:py-7">
        <div>
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-emerald-300">
            <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />

            System Configuration
          </div>

          <h1 className="flex items-center gap-3 text-2xl font-bold tracking-tight text-white md:text-3xl">
            <FiSettings className="text-emerald-300" />

            Settings

            <span className="ml-2 text-sm font-normal text-emerald-100/70">
              Control Center
            </span>
          </h1>

          <p className="text-sm text-slate-300">
            Manage application settings,
            printer, API and MCP access.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() =>
              void loadSettings()
            }
            className="rounded-xl bg-white/10 px-3 py-2 text-sm font-medium text-white ring-1 ring-white/15 hover:bg-white/20 disabled:opacity-60"
            disabled={loading}
          >
            <FiRefreshCw
              className={
                loading
                  ? 'mr-1 inline animate-spin'
                  : 'mr-1 inline'
              }
              size={14}
            />

            Refresh
          </button>

          <button
            type="button"
            onClick={() =>
              void saveAll()
            }
            className="rounded-xl bg-white/10 px-3 py-2 text-sm font-medium text-white ring-1 ring-white/15 hover:bg-white/20"
          >
            <FiSave
              className="mr-1 inline"
              size={14}
            />

            Save All
          </button>

          <button
            type="button"
            onClick={() =>
              setShowAddModal(
                true
              )
            }
            className="rounded-xl bg-emerald-400 px-3 py-2 text-sm font-medium text-slate-950 shadow-md shadow-emerald-500/20 hover:bg-emerald-300"
          >
            <FiPlus
              className="mr-1 inline"
              size={14}
            />

            Add Setting
          </button>
        </div>
      </div>

      {/* ------------------------------------------------------------------- */}
      {/* Tabs                                                                */}
      {/* ------------------------------------------------------------------- */}

      <div className="mb-6 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() =>
            setActiveTab(
              'settings'
            )
          }
          className={`rounded-xl px-4 py-2 text-sm font-medium transition ${
            activeTab ===
            'settings'
              ? 'bg-slate-900 text-white shadow-lg'
              : 'bg-white text-slate-600 hover:bg-slate-50'
          }`}
        >
          <FiSettings
            className="mr-1 inline"
            size={14}
          />

          Settings
        </button>

        <button
          type="button"
          onClick={() =>
            setActiveTab(
              'printer'
            )
          }
          className={`rounded-xl px-4 py-2 text-sm font-medium transition ${
            activeTab ===
            'printer'
              ? 'bg-slate-900 text-white shadow-lg'
              : 'bg-white text-slate-600 hover:bg-slate-50'
          }`}
        >
          <FiPrinter
            className="mr-1 inline"
            size={14}
          />

          Printer
        </button>

        <button
          type="button"
          onClick={() =>
            setActiveTab(
              'api'
            )
          }
          className={`rounded-xl px-4 py-2 text-sm font-medium transition ${
            activeTab ===
            'api'
              ? 'bg-slate-900 text-white shadow-lg'
              : 'bg-white text-slate-600 hover:bg-slate-50'
          }`}
        >
          <FiCode
            className="mr-1 inline"
            size={14}
          />

          API & MCP
        </button>
      </div>

      {/* ------------------------------------------------------------------- */}
      {/* Search                                                              */}
      {/* ------------------------------------------------------------------- */}

      {activeTab ===
        'settings' && (
        <div className="mb-6 flex flex-col gap-4 sm:flex-row">
          <div className="relative max-w-md flex-1">
            <FiSearch
              className="absolute left-3 top-2.5 text-slate-400"
              size={18}
            />

            <input
              type="text"
              placeholder="Search settings..."
              value={search}
              onChange={(event) =>
                setSearch(
                  event.target.value
                )
              }
              className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-sm outline-none transition placeholder:text-slate-400 focus:border-emerald-400 focus:ring-4 focus:ring-emerald-100"
            />
          </div>

          <div className="flex items-center text-sm text-slate-500">
            {visibleSettings} of{' '}
            {totalSettings}{' '}
            settings
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------- */}
      {/* Error                                                               */}
      {/* ------------------------------------------------------------------- */}

      {error && (
        <div className="mb-4 flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-rose-700">
          <FiAlertCircle
            size={20}
          />

          {error}
        </div>
      )}

      {/* =================================================================== */}
      {/* SETTINGS TAB                                                        */}
      {/* =================================================================== */}

      {activeTab ===
        'settings' &&
        (loading ? (
          <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
            {[...Array(4)].map(
              (_, index) => (
                <SkeletonCard
                  key={index}
                />
              )
            )}
          </div>
        ) : (
          <div className="space-y-6">
            {/* Voice */}
            <div className="rounded-2xl border border-violet-200 bg-gradient-to-r from-violet-50 via-white to-indigo-50 p-5 shadow-sm">
              <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-violet-600">
                    AI Voice Connection
                  </p>

                  <h2 className="mt-1 text-xl font-bold text-slate-800">
                    Free and paid TTS
                    setup
                  </h2>

                  <p className="text-sm text-slate-600">
                    Use browser speech for free or premium voice providers.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() =>
                    void saveVoiceSettings()
                  }
                  disabled={
                    saving.voice
                  }
                  className="rounded-xl bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-60"
                >
                  {saving.voice
                    ? 'Saving...'
                    : 'Save voice config'}
                </button>
              </div>

              <div className="mt-5 grid gap-4 md:grid-cols-2">
                <label className="text-sm text-slate-700">
                  <span className="mb-1 block font-medium">
                    Provider
                  </span>

                  <select
                    value={
                      voiceConfig.voice_tts_provider
                    }
                    onChange={(
                      event
                    ) =>
                      setVoiceConfig(
                        (
                          previous
                        ) => ({
                          ...previous,
                          voice_tts_provider:
                            event.target
                              .value,
                        })
                      )
                    }
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 outline-none focus:ring-2 focus:ring-violet-200"
                  >
                    <option value="auto">
                      Auto
                    </option>

                    <option value="browser">
                      Browser (free)
                    </option>

                    <option value="cloud">
                      Premium
                    </option>

                    <option value="elevenlabs">
                      ElevenLabs
                    </option>
                  </select>
                </label>

                <label className="text-sm text-slate-700">
                  <span className="mb-1 block font-medium">
                    Default language
                  </span>

                  <select
                    value={
                      voiceConfig.voice_default_language
                    }
                    onChange={(
                      event
                    ) =>
                      setVoiceConfig(
                        (
                          previous
                        ) => ({
                          ...previous,
                          voice_default_language:
                            event.target
                              .value,
                        })
                      )
                    }
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 outline-none focus:ring-2 focus:ring-violet-200"
                  >
                    <option value="en-US">
                      English (US)
                    </option>

                    <option value="hi-IN">
                      Hindi
                    </option>

                    <option value="en-GB">
                      English (UK)
                    </option>
                  </select>
                </label>

                <label className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={
                      voiceConfig.voice_browser_enabled ===
                      'true'
                    }
                    onChange={(
                      event
                    ) =>
                      setVoiceConfig(
                        (
                          previous
                        ) => ({
                          ...previous,
                          voice_browser_enabled:
                            String(
                              event
                                .target
                                .checked
                            ),
                        })
                      )
                    }
                    className="h-4 w-4 accent-violet-600"
                  />

                  Browser TTS enabled
                </label>

                <label className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={
                      voiceConfig.voice_paid_enabled ===
                      'true'
                    }
                    onChange={(
                      event
                    ) =>
                      setVoiceConfig(
                        (
                          previous
                        ) => ({
                          ...previous,
                          voice_paid_enabled:
                            String(
                              event
                                .target
                                .checked
                            ),
                        })
                      )
                    }
                    className="h-4 w-4 accent-violet-600"
                  />

                  Premium provider enabled
                </label>

                <label className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={
                      voiceConfig.voice_auto_read_enabled ===
                      'true'
                    }
                    onChange={(
                      event
                    ) =>
                      setVoiceConfig(
                        (
                          previous
                        ) => ({
                          ...previous,
                          voice_auto_read_enabled:
                            String(
                              event
                                .target
                                .checked
                            ),
                        })
                      )
                    }
                    className="h-4 w-4 accent-violet-600"
                  />

                  Auto-read assistant replies
                </label>

                <label className="text-sm text-slate-700">
                  <span className="mb-1 block font-medium">
                    Voice speed
                  </span>

                  <input
                    type="number"
                    min="0.6"
                    max="1.4"
                    step="0.05"
                    value={
                      voiceConfig.voice_speed
                    }
                    onChange={(
                      event
                    ) =>
                      setVoiceConfig(
                        (
                          previous
                        ) => ({
                          ...previous,
                          voice_speed:
                            event.target
                              .value,
                        })
                      )
                    }
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 outline-none focus:ring-2 focus:ring-violet-200"
                  />
                </label>

                <label className="text-sm text-slate-700 md:col-span-2">
                  <span className="mb-1 block font-medium">
                    ElevenLabs API key
                  </span>

                  <input
                    type="password"
                    value={
                      voiceConfig.elevenlabs_api_key
                    }
                    onChange={(
                      event
                    ) =>
                      setVoiceConfig(
                        (
                          previous
                        ) => ({
                          ...previous,
                          elevenlabs_api_key:
                            event.target
                              .value,
                        })
                      )
                    }
                    placeholder="Enter API key"
                    autoComplete="new-password"
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 outline-none focus:ring-2 focus:ring-violet-200"
                  />
                </label>

                <label className="text-sm text-slate-700">
                  <span className="mb-1 block font-medium">
                    ElevenLabs voice ID
                  </span>

                  <input
                    type="text"
                    value={
                      voiceConfig.elevenlabs_voice_id
                    }
                    onChange={(
                      event
                    ) =>
                      setVoiceConfig(
                        (
                          previous
                        ) => ({
                          ...previous,
                          elevenlabs_voice_id:
                            event.target
                              .value,
                        })
                      )
                    }
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 outline-none focus:ring-2 focus:ring-violet-200"
                  />
                </label>

                <label className="text-sm text-slate-700">
                  <span className="mb-1 block font-medium">
                    ElevenLabs model ID
                  </span>

                  <input
                    type="text"
                    value={
                      voiceConfig.elevenlabs_model_id
                    }
                    onChange={(
                      event
                    ) =>
                      setVoiceConfig(
                        (
                          previous
                        ) => ({
                          ...previous,
                          elevenlabs_model_id:
                            event.target
                              .value,
                        })
                      )
                    }
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 outline-none focus:ring-2 focus:ring-violet-200"
                  />
                </label>
              </div>
            </div>

            {/* General groups */}
            {settings.length ===
            0 ? (
              <div className="rounded-xl bg-white p-12 text-center shadow-sm">
                <FiSettings
                  className="mx-auto mb-4 text-slate-300"
                  size={48}
                />

                <h3 className="text-lg font-semibold text-slate-700">
                  No settings found
                </h3>

                <p className="mt-2 text-slate-500">
                  Get started by adding your first setting.
                </p>
              </div>
            ) : Object.keys(
                groupedSettings
              ).length === 0 ? (
              <div className="rounded-xl bg-white p-12 text-center shadow-sm">
                <FiSearch
                  className="mx-auto mb-3 text-slate-300"
                  size={40}
                />

                <p className="text-slate-500">
                  No settings match your search.
                </p>
              </div>
            ) : (
              Object.entries(
                groupedSettings
              ).map(
                ([
                  group,
                  items,
                ]) => {
                  const meta =
                    GROUP_META[
                      group
                    ] || {
                      icon: '📁',
                      color:
                        'bg-slate-100 text-slate-700',
                    };

                  const isExpanded =
                    expandedGroups[
                      group
                    ] ?? false;

                  return (
                    <div
                      key={group}
                      className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
                    >
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedGroups(
                            (
                              previous
                            ) => ({
                              ...previous,
                              [group]:
                                !previous[
                                  group
                                ],
                            })
                          )
                        }
                        className="flex w-full items-center justify-between px-6 py-4 hover:bg-slate-50"
                      >
                        <div className="flex items-center gap-3">
                          <span
                            className={`rounded-lg px-2 py-1 text-lg ${meta.color}`}
                          >
                            {
                              meta.icon
                            }
                          </span>

                          <div className="text-left">
                            <h2 className="font-semibold capitalize text-slate-800">
                              {
                                group
                              }
                            </h2>

                            <p className="text-xs text-slate-500">
                              {
                                items.length
                              }{' '}
                              setting(s)
                            </p>
                          </div>
                        </div>

                        {isExpanded ? (
                          <FiChevronUp
                            size={20}
                          />
                        ) : (
                          <FiChevronDown
                            size={20}
                          />
                        )}
                      </button>

                      {isExpanded && (
                        <div className="border-t border-slate-200 px-6 py-5">
                          <div className="space-y-4">
                            {items.map(
                              (
                                setting
                              ) => (
                                <div
                                  key={
                                    setting.id
                                  }
                                  className="rounded-xl border border-slate-200 bg-slate-50 p-4"
                                >
                                  <div className="mb-3 flex items-start justify-between gap-2">
                                    <div className="flex-1">
                                      <div className="flex flex-wrap items-center gap-2">
                                        <p className="font-medium text-slate-800">
                                          {
                                            setting.key
                                          }
                                        </p>

                                        <span
                                          className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase ${
                                            setting.is_public
                                              ? 'bg-blue-100 text-blue-700'
                                              : 'bg-slate-200 text-slate-600'
                                          }`}
                                        >
                                          {setting.is_public
                                            ? 'Public'
                                            : 'Internal'}
                                        </span>
                                      </div>

                                      <p className="text-sm text-slate-500">
                                        {setting.description ||
                                          'No description available.'}
                                      </p>
                                    </div>

                                    <div className="flex gap-1">
                                      <button
                                        type="button"
                                        onClick={() =>
                                          void copyToClipboard(
                                            setting.key,
                                            setting.value
                                          )
                                        }
                                        className="rounded p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-600"
                                      >
                                        {copiedKey ===
                                        setting.key ? (
                                          <FiCheck
                                            className="text-emerald-500"
                                            size={
                                              14
                                            }
                                          />
                                        ) : (
                                          <FiCopy
                                            size={
                                              14
                                            }
                                          />
                                        )}
                                      </button>

                                      <button
                                        type="button"
                                        onClick={() =>
                                          void deleteSetting(
                                            setting.key
                                          )
                                        }
                                        className="rounded p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-600"
                                      >
                                        <FiTrash2
                                          className="text-rose-500"
                                          size={
                                            14
                                          }
                                        />
                                      </button>
                                    </div>
                                  </div>

                                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                                    <div className="flex-1">
                                      {renderInput(
                                        setting
                                      )}
                                    </div>

                                    <button
                                      type="button"
                                      onClick={() =>
                                        void saveSetting(
                                          setting
                                        )
                                      }
                                      disabled={
                                        saving[
                                          setting
                                            .key
                                        ]
                                      }
                                      className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
                                    >
                                      {saving[
                                        setting.key
                                      ] ? (
                                        <FiRefreshCw
                                          className="animate-spin"
                                          size={
                                            14
                                          }
                                        />
                                      ) : (
                                        <FiSave
                                          size={
                                            14
                                          }
                                        />
                                      )}

                                      Save
                                    </button>
                                  </div>
                                </div>
                              )
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                }
              )
            )}
          </div>
        ))}

      {/* =================================================================== */}
      {/* PRINTER TAB                                                         */}
      {/* =================================================================== */}

      {activeTab ===
        'printer' && (
        <div className="space-y-6">
          <div className="rounded-2xl border border-cyan-200 bg-gradient-to-r from-cyan-50 via-white to-blue-50 p-5 shadow-sm">
            <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-600">
                  Thermal / A4 Printer Setup
                </p>

                <h2 className="mt-1 text-xl font-bold text-slate-800">
                  Default Printer &
                  Bluetooth Connection
                </h2>

                <p className="text-sm text-slate-600">
                  Select format and connect Bluetooth thermal printers.
                </p>
              </div>

              <button
                type="button"
                onClick={() =>
                  void savePrinterSettings()
                }
                disabled={
                  saving.printer
                }
                className="rounded-xl bg-cyan-600 px-4 py-2 text-sm font-medium text-white hover:bg-cyan-700 disabled:opacity-60"
              >
                {saving.printer
                  ? 'Saving...'
                  : 'Save printer settings'}
              </button>
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <label className="text-sm text-slate-700">
                <span className="mb-1 block font-medium">
                  Default Print Format
                </span>

                <select
                  value={
                    printerSettings.printer_default_format
                  }
                  onChange={(
                    event
                  ) =>
                    setPrinterSettings(
                      (
                        previous
                      ) => ({
                        ...previous,
                        printer_default_format:
                          event.target
                            .value,
                      })
                    )
                  }
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 outline-none focus:ring-2 focus:ring-cyan-200"
                >
                  <option value="A4">
                    A4 (Standard)
                  </option>

                  <option value="58mm">
                    58mm Thermal
                  </option>

                  <option value="80mm">
                    80mm Thermal
                  </option>
                </select>
              </label>

              <label className="text-sm text-slate-700">
                <span className="mb-1 block font-medium">
                  Connection Mode
                </span>

                <select
                  value={
                    printerSettings.printer_connection_mode
                  }
                  onChange={(
                    event
                  ) =>
                    setPrinterSettings(
                      (
                        previous
                      ) => ({
                        ...previous,
                        printer_connection_mode:
                          event.target
                            .value,
                      })
                    )
                  }
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 outline-none focus:ring-2 focus:ring-cyan-200"
                >
                  <option value="browser">
                    Browser Print
                  </option>

                  <option value="bluetooth">
                    Bluetooth Thermal
                  </option>

                  <option value="system">
                    System Printer
                  </option>
                </select>
              </label>
            </div>

            <div className="mt-6 rounded-xl border border-slate-200 bg-white p-5">
              <h3 className="mb-4 flex items-center gap-2 font-semibold text-slate-800">
                <FiBluetooth
                  className="text-cyan-600"
                  size={18}
                />

                Bluetooth Printer
              </h3>

              <div className="mb-4 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() =>
                    void scanBluetoothPrinters()
                  }
                  disabled={
                    scanningBluetooth
                  }
                  className="flex items-center gap-2 rounded-lg bg-cyan-600 px-4 py-2 text-sm font-medium text-white hover:bg-cyan-700 disabled:opacity-60"
                >
                  {scanningBluetooth ? (
                    <FiLoader
                      className="animate-spin"
                      size={16}
                    />
                  ) : (
                    <FiRadio
                      size={16}
                    />
                  )}

                  {scanningBluetooth
                    ? 'Scanning...'
                    : 'Scan for Bluetooth Printers'}
                </button>

                {connectedDevice && (
                  <button
                    type="button"
                    onClick={() =>
                      void disconnectBluetooth()
                    }
                    className="flex items-center gap-2 rounded-lg border border-rose-300 px-4 py-2 text-sm font-medium text-rose-700 hover:bg-rose-50"
                  >
                    <FiPower
                      size={16}
                    />

                    Disconnect
                  </button>
                )}
              </div>

              {bluetoothDevices.length >
              0 ? (
                <div className="space-y-2">
                  {bluetoothDevices.map(
                    (device) => (
                      <div
                        key={
                          device.id
                        }
                        className="flex items-center justify-between rounded-lg border border-slate-200 p-3"
                      >
                        <div className="flex items-center gap-2">
                          <FiBluetooth className="text-slate-500" />

                          <span className="text-sm font-medium">
                            {device.name ||
                              'Unnamed device'}
                          </span>
                        </div>

                        <button
                          type="button"
                          onClick={() =>
                            void connectBluetoothDevice(
                              device
                            )
                          }
                          disabled={
                            connectingDevice ===
                            device.id
                          }
                          className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs text-white hover:bg-blue-700 disabled:opacity-60"
                        >
                          {connectingDevice ===
                          device.id
                            ? 'Connecting...'
                            : 'Connect'}
                        </button>
                      </div>
                    )
                  )}
                </div>
              ) : (
                <p className="text-sm text-slate-500">
                  No devices found.
                  Click Scan to search.
                </p>
              )}

              {connectedDevice && (
                <div className="mt-4 flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                  <FiCheck className="text-emerald-600" />

                  <span className="text-sm">
                    Connected to{' '}
                    <strong>
                      {connectedDevice.name ||
                        'printer'}
                    </strong>
                  </span>
                </div>
              )}

              {!(
                'bluetooth' in
                navigator
              ) && (
                <p className="mt-3 text-xs text-amber-600">
                  ⚠️ Web Bluetooth is
                  not supported in this
                  browser. Use a
                  Chromium-based browser.
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* API + MCP TAB                                                       */}
      {/* =================================================================== */}

      {activeTab ===
        'api' && (
        <div className="space-y-6">
          {/* API URL */}
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 bg-gradient-to-r from-blue-50 to-indigo-50 px-6 py-4">
              <h2 className="flex items-center gap-2 font-semibold text-slate-800">
                <FiServer className="text-blue-600" />

                API Base URL
              </h2>
            </div>

            <div className="px-6 py-4">
              <div className="flex items-center gap-2">
                <code className="flex-1 break-all rounded-lg bg-slate-100 px-3 py-3 text-sm font-mono">
                  {fullApiUrl}
                </code>

                <button
                  type="button"
                  onClick={() =>
                    void copyToClipboard(
                      'api-url',
                      fullApiUrl
                    )
                  }
                  className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100"
                  title="Copy API URL"
                >
                  {copiedKey ===
                  'api-url' ? (
                    <FiCheck
                      className="text-emerald-500"
                      size={16}
                    />
                  ) : (
                    <FiCopy
                      size={16}
                    />
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* MCP */}
          <div className="overflow-hidden rounded-2xl border border-emerald-200 bg-white shadow-sm">
            <div className="border-b border-emerald-200 bg-gradient-to-r from-emerald-50 via-white to-teal-50 px-6 py-5">
              <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
                <div>
                  <div className="mb-2 flex items-center gap-2">
                    <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
                      <FiKey
                        size={20}
                      />
                    </span>

                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-600">
                        Model Context Protocol
                      </p>

                      <h2 className="text-xl font-bold text-slate-800">
                        NixaERP MCP Access
                      </h2>
                    </div>
                  </div>

                  <p className="max-w-3xl text-sm text-slate-600">
                    Create dedicated read-only
                    MCP credentials for ChatGPT
                    and other MCP clients.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() =>
                    void checkMcpStatus()
                  }
                  disabled={
                    mcpStatusLoading
                  }
                  className="inline-flex items-center gap-2 rounded-xl border border-emerald-200 bg-white px-4 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-50 disabled:opacity-60"
                >
                  {mcpStatusLoading ? (
                    <FiLoader
                      className="animate-spin"
                      size={15}
                    />
                  ) : (
                    <FiRefreshCw
                      size={15}
                    />
                  )}

                  Test MCP API
                </button>
              </div>
            </div>

            <div className="space-y-6 p-6">
              {/* Status */}
              <div className="grid gap-3 md:grid-cols-4">
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-xs uppercase tracking-wide text-slate-500">
                    MCP
                  </p>

                  <p className="mt-1 text-lg font-semibold text-slate-800">
                    {mcpStatus?.enabled
                      ? 'Enabled'
                      : 'Not checked'}
                  </p>
                </div>

                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-xs uppercase tracking-wide text-slate-500">
                    Authentication
                  </p>

                  <p className="mt-1 text-lg font-semibold text-slate-800">
                    {mcpStatus?.authenticated
                      ? 'Authenticated'
                      : 'Not checked'}
                  </p>
                </div>

                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-xs uppercase tracking-wide text-slate-500">
                    Mode
                  </p>

                  <p className="mt-1 text-lg font-semibold capitalize text-slate-800">
                    {mcpStatus?.mode ||
                      'read_only'}
                  </p>
                </div>

                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-xs uppercase tracking-wide text-slate-500">
                    Version
                  </p>

                  <p className="mt-1 text-lg font-semibold text-slate-800">
                    {mcpStatus?.version ||
                      '1.0.0'}
                  </p>
                </div>
              </div>

              {/* Security notice */}
              <div className="flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
                <FiShield className="mt-0.5 shrink-0 text-amber-600" />

                <div>
                  <p className="font-semibold text-amber-800">
                    Read-only security
                  </p>

                  <p className="mt-1 text-sm text-amber-700">
                    MCP tokens created here
                    receive only{' '}
                    <code className="rounded bg-amber-100 px-1.5 py-0.5 font-mono text-xs">
                      mcp:read
                    </code>
                    . They cannot create,
                    update, delete, make payments,
                    or directly access the database.
                  </p>
                </div>
              </div>

              {/* Token creation */}
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
                  <div>
                    <h3 className="flex items-center gap-2 font-semibold text-slate-800">
                      <FiPlus className="text-emerald-600" />

                      Create MCP token
                    </h3>

                    <p className="mt-1 text-sm text-slate-500">
                      Generate a short-lived
                      credential for one MCP client.
                    </p>
                  </div>
                </div>

                <div className="mt-5 grid gap-4 md:grid-cols-[1fr_180px_auto]">
                  <label className="text-sm text-slate-700">
                    <span className="mb-1 block font-medium">
                      Connection name
                    </span>

                    <input
                      type="text"
                      value={
                        mcpName
                      }
                      onChange={(
                        event
                      ) =>
                        setMcpName(
                          event.target
                            .value
                        )
                      }
                      maxLength={
                        100
                      }
                      placeholder="ChatGPT"
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
                    />
                  </label>

                  <label className="text-sm text-slate-700">
                    <span className="mb-1 block font-medium">
                      Expires in
                    </span>

                    <select
                      value={
                        mcpExpiresDays
                      }
                      onChange={(
                        event
                      ) =>
                        setMcpExpiresDays(
                          event
                            .target
                            .value
                        )
                      }
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
                    >
                      <option value="7">
                        7 days
                      </option>

                      <option value="30">
                        30 days
                      </option>

                      <option value="60">
                        60 days
                      </option>

                      <option value="90">
                        90 days
                      </option>
                    </select>
                  </label>

                  <div className="flex items-end">
                    <button
                      type="button"
                      onClick={() =>
                        void generateMcpToken()
                      }
                      disabled={
                        mcpGenerating
                      }
                      className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60 md:w-auto"
                    >
                      {mcpGenerating ? (
                        <FiLoader
                          className="animate-spin"
                          size={16}
                        />
                      ) : (
                        <FiKey
                          size={16}
                        />
                      )}

                      {mcpGenerating
                        ? 'Generating...'
                        : 'Generate token'}
                    </button>
                  </div>
                </div>
              </div>

              {/* MCP endpoint info */}
              <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
                <div className="flex gap-3">
                  <FiInfo className="mt-0.5 shrink-0 text-blue-600" />

                  <div>
                    <p className="font-semibold text-blue-800">
                      Current MCP API
                    </p>

                    <div className="mt-2 space-y-1 font-mono text-xs text-blue-700">
                      <div>
                        Status:{' '}
                        {fullApiUrl}/mcp/status
                      </div>

                      <div>
                        Context:{' '}
                        {fullApiUrl}/mcp/context
                      </div>

                      <div>
                        Tokens:{' '}
                        {fullApiUrl}/mcp/tokens
                      </div>
                    </div>

                    <p className="mt-2 text-xs text-blue-700">
                      These are the Laravel MCP
                      authentication endpoints.
                      The remote MCP protocol endpoint
                      will be connected after the
                      TypeScript MCP server is deployed.
                    </p>
                  </div>
                </div>
              </div>

              {/* Existing tokens */}
              <div>
                <div className="mb-4 flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                  <div>
                    <h3 className="font-semibold text-slate-800">
                      Active MCP tokens
                    </h3>

                    <p className="text-sm text-slate-500">
                      Only tokens belonging to your
                      current ERP account are shown.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() =>
                      void revokeAllMcpTokens()
                    }
                    disabled={
                      mcpRevokingAll ||
                      mcpTokens.length ===
                        0
                    }
                    className="inline-flex items-center justify-center gap-2 rounded-lg border border-rose-300 px-3 py-2 text-sm font-medium text-rose-700 hover:bg-rose-50 disabled:opacity-50"
                  >
                    {mcpRevokingAll ? (
                      <FiLoader
                        className="animate-spin"
                        size={14}
                      />
                    ) : (
                      <FiTrash2
                        size={14}
                      />
                    )}

                    Revoke all
                  </button>
                </div>

                {mcpLoading ? (
                  <SkeletonTable />
                ) : mcpTokens.length ===
                  0 ? (
                  <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
                    <FiKey
                      className="mx-auto mb-3 text-slate-300"
                      size={40}
                    />

                    <p className="font-medium text-slate-700">
                      No MCP tokens
                    </p>

                    <p className="mt-1 text-sm text-slate-500">
                      Generate your first token
                      to connect an MCP client.
                    </p>
                  </div>
                ) : (
                  <div className="overflow-hidden rounded-xl border border-slate-200">
                    <div className="hidden grid-cols-[1.5fr_1fr_1fr_1fr_auto] gap-4 bg-slate-50 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500 md:grid">
                      <span>
                        Token
                      </span>

                      <span>
                        Ability
                      </span>

                      <span>
                        Created
                      </span>

                      <span>
                        Expires
                      </span>

                      <span>
                        Action
                      </span>
                    </div>

                    <div className="divide-y divide-slate-200">
                      {mcpTokens.map(
                        (token) => (
                          <div
                            key={
                              token.id
                            }
                            className="grid gap-3 px-4 py-4 md:grid-cols-[1.5fr_1fr_1fr_1fr_auto] md:items-center md:gap-4"
                          >
                            <div>
                              <div className="flex items-center gap-2">
                                <FiKey className="text-emerald-600" />

                                <span className="font-medium text-slate-800">
                                  {
                                    token.name
                                  }
                                </span>
                              </div>

                              <p className="mt-1 text-xs text-slate-500">
                                ID:{' '}
                                {
                                  token.id
                                }
                              </p>
                            </div>

                            <div>
                              <span className="inline-flex rounded-full bg-emerald-100 px-2 py-1 text-xs font-medium text-emerald-700">
                                {token.abilities.join(
                                  ', '
                                ) ||
                                  'none'}
                              </span>
                            </div>

                            <div className="text-sm text-slate-600">
                              {token.created_at
                                ? new Date(
                                    token.created_at
                                  ).toLocaleString()
                                : '—'}
                            </div>

                            <div className="text-sm">
                              {token.expires_at ? (
                                <div>
                                  <p className="text-slate-700">
                                    {new Date(
                                      token.expires_at
                                    ).toLocaleString()}
                                  </p>

                                  <p
                                    className={`mt-1 text-xs ${
                                      new Date(
                                        token.expires_at
                                      ).getTime() <
                                      Date.now()
                                        ? 'text-rose-600'
                                        : 'text-slate-500'
                                    }`}
                                  >
                                    {new Date(
                                      token.expires_at
                                    ).getTime() <
                                    Date.now()
                                      ? 'Expired'
                                      : 'Active'}
                                  </p>
                                </div>
                              ) : (
                                'No expiry'
                              )}
                            </div>

                            <div>
                              <button
                                type="button"
                                onClick={() =>
                                  void revokeMcpToken(
                                    token
                                  )
                                }
                                disabled={
                                  mcpRevokingId ===
                                  token.id
                                }
                                className="inline-flex items-center gap-2 rounded-lg border border-rose-200 px-3 py-2 text-xs font-medium text-rose-700 hover:bg-rose-50 disabled:opacity-60"
                              >
                                {mcpRevokingId ===
                                token.id ? (
                                  <FiLoader
                                    className="animate-spin"
                                    size={
                                      13
                                    }
                                  />
                                ) : (
                                  <FiTrash2
                                    size={
                                      13
                                    }
                                  />
                                )}

                                Revoke
                              </button>
                            </div>

                            {token.last_used_at && (
                              <div className="md:col-span-5">
                                <p className="text-xs text-slate-500">
                                  Last used:{' '}
                                  {new Date(
                                    token.last_used_at
                                  ).toLocaleString()}
                                </p>
                              </div>
                            )}
                          </div>
                        )
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Development security notes */}
              <div className="grid gap-4 md:grid-cols-3">
                <div className="rounded-xl border border-slate-200 bg-white p-4">
                  <FiShield className="mb-2 text-emerald-600" />

                  <h4 className="font-semibold text-slate-800">
                    User scoped
                  </h4>

                  <p className="mt-1 text-xs leading-5 text-slate-500">
                    Every MCP token belongs to
                    the currently authenticated
                    ERP user.
                  </p>
                </div>

                <div className="rounded-xl border border-slate-200 bg-white p-4">
                  <FiDatabase className="mb-2 text-blue-600" />

                  <h4 className="font-semibold text-slate-800">
                    No database access
                  </h4>

                  <p className="mt-1 text-xs leading-5 text-slate-500">
                    MCP communicates through
                    Laravel APIs instead of
                    directly accessing MySQL.
                  </p>
                </div>

                <div className="rounded-xl border border-slate-200 bg-white p-4">
                  <FiKey className="mb-2 text-violet-600" />

                  <h4 className="font-semibold text-slate-800">
                    Short-lived token
                  </h4>

                  <p className="mt-1 text-xs leading-5 text-slate-500">
                    Tokens are limited to a
                    maximum 90-day lifetime.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Existing auth info */}
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 bg-gradient-to-r from-purple-50 to-pink-50 px-6 py-4">
              <h2 className="flex items-center gap-2 font-semibold text-slate-800">
                <FiShield className="text-purple-600" />

                ERP Authentication
              </h2>
            </div>

            <div className="space-y-3 px-6 py-4">
              <div className="flex items-center gap-2">
                <code className="flex-1 rounded-lg bg-slate-100 px-3 py-3 text-sm font-mono">
                  {showAuthToken &&
                  authToken
                    ? authToken
                    : '••••••••••••••••••••••••••••••'}
                </code>

                <button
                  type="button"
                  onClick={() =>
                    setShowAuthToken(
                      (
                        previous
                      ) => !previous
                    )
                  }
                  className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
                  title={
                    showAuthToken
                      ? 'Hide token'
                      : 'Show token'
                  }
                >
                  {showAuthToken ? (
                    <FiEyeOff
                      size={16}
                    />
                  ) : (
                    <FiEye
                      size={16}
                    />
                  )}
                </button>
              </div>

              <div className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3">
                <FiInfo className="mt-0.5 shrink-0 text-amber-600" />

                <p className="text-xs text-amber-700">
                  This is your normal ERP
                  authentication credential.
                  Do not use the normal ERP token
                  as the MCP credential. Use the
                  dedicated MCP token above.
                </p>
              </div>
            </div>
          </div>

          {/* Quick Links */}
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 bg-gradient-to-r from-amber-50 to-orange-50 px-6 py-4">
              <h2 className="flex items-center gap-2 font-semibold text-slate-800">
                <FiGlobe className="text-amber-600" />

                Quick Links
              </h2>
            </div>

            <div className="grid grid-cols-1 gap-3 px-6 py-4 sm:grid-cols-2">
              <a
                href={`${fullApiUrl}/status`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 rounded-lg border border-slate-200 p-3 text-sm transition hover:bg-slate-50"
              >
                <FiDatabase className="text-blue-500" />

                API Status

                <FiExternalLink
                  className="ml-auto"
                  size={14}
                />
              </a>

              <a
                href={`${fullApiUrl}/mcp/status`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 rounded-lg border border-slate-200 p-3 text-sm transition hover:bg-slate-50"
              >
                <FiKey className="text-emerald-500" />

                MCP Status

                <FiExternalLink
                  className="ml-auto"
                  size={14}
                />
              </a>

              <a
                href={`${fullApiUrl}/settings/quickstart`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 rounded-lg border border-slate-200 p-3 text-sm transition hover:bg-slate-50"
              >
                <FiCode className="text-violet-500" />

                Quickstart Guide

                <FiExternalLink
                  className="ml-auto"
                  size={14}
                />
              </a>

              <button
                type="button"
                onClick={() =>
                  void copyToClipboard(
                    'mcp-context-url',
                    `${fullApiUrl}/mcp/context`
                  )
                }
                className="flex items-center gap-2 rounded-lg border border-slate-200 p-3 text-left text-sm transition hover:bg-slate-50"
              >
                <FiLink className="text-blue-500" />

                Copy MCP Context URL

                {copiedKey ===
                'mcp-context-url' ? (
                  <FiCheck
                    className="ml-auto text-emerald-500"
                    size={14}
                  />
                ) : (
                  <FiCopy
                    className="ml-auto"
                    size={14}
                  />
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* ADD SETTING MODAL                                                   */}
      {/* =================================================================== */}

      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-xl bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold">
                Add Setting
              </h2>

              <button
                type="button"
                onClick={() =>
                  setShowAddModal(
                    false
                  )
                }
                className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"
              >
                <FiX
                  size={18}
                />
              </button>
            </div>

            <div className="mt-4 space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium">
                  Key *
                </label>

                <input
                  type="text"
                  value={
                    newSetting.key
                  }
                  onChange={(
                    event
                  ) =>
                    setNewSetting(
                      (
                        previous
                      ) => ({
                        ...previous,
                        key: event.target
                          .value,
                      })
                    )
                  }
                  maxLength={100}
                  placeholder="maintenance_mode"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium">
                  Value
                </label>

                <input
                  type="text"
                  value={
                    newSetting.value
                  }
                  onChange={(
                    event
                  ) =>
                    setNewSetting(
                      (
                        previous
                      ) => ({
                        ...previous,
                        value:
                          event.target
                            .value,
                      })
                    )
                  }
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium">
                  Group
                </label>

                <select
                  value={
                    newSetting.group
                  }
                  onChange={(
                    event
                  ) =>
                    setNewSetting(
                      (
                        previous
                      ) => ({
                        ...previous,
                        group:
                          event.target
                            .value,
                      })
                    )
                  }
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                >
                  {Object.keys(
                    GROUP_META
                  ).map(
                    (group) => (
                      <option
                        key={
                          group
                        }
                        value={
                          group
                        }
                      >
                        {group}
                      </option>
                    )
                  )}

                  <option value="other">
                    other
                  </option>
                </select>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium">
                  Description
                </label>

                <input
                  type="text"
                  value={
                    newSetting.description
                  }
                  onChange={(
                    event
                  ) =>
                    setNewSetting(
                      (
                        previous
                      ) => ({
                        ...previous,
                        description:
                          event.target
                            .value,
                      })
                    )
                  }
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>

              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={
                    newSetting.is_public
                  }
                  onChange={(
                    event
                  ) =>
                    setNewSetting(
                      (
                        previous
                      ) => ({
                        ...previous,
                        is_public:
                          event
                            .target
                            .checked,
                      })
                    )
                  }
                  className="rounded"
                />

                <span className="text-sm">
                  Public setting
                </span>
              </label>
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() =>
                  setShowAddModal(
                    false
                  )
                }
                className="rounded-lg border border-slate-300 px-4 py-2 text-slate-600 hover:bg-slate-50"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={() =>
                  void createSetting()
                }
                disabled={
                  saving.new
                }
                className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:opacity-60"
              >
                {saving.new && (
                  <FiRefreshCw
                    className="animate-spin"
                    size={14}
                  />
                )}

                Create
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* MCP TOKEN CREATED MODAL                                             */}
      {/* =================================================================== */}

      {createdMcpToken && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/70 p-4">
          <div className="w-full max-w-2xl rounded-2xl bg-white shadow-2xl">
            <div className="border-b border-emerald-100 bg-emerald-50 px-6 py-5">
              <div className="flex items-start gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
                  <FiCheckCircle
                    size={22}
                  />
                </div>

                <div className="flex-1">
                  <h2 className="text-lg font-bold text-emerald-900">
                    MCP token created
                  </h2>

                  <p className="mt-1 text-sm text-emerald-800">
                    Copy this token now. For
                    security, it is not stored in
                    the browser or shown again after
                    this window is closed.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setCreatedMcpToken(
                      null
                    );
                    setShowMcpToken(
                      false
                    );
                  }}
                  className="rounded-lg p-2 text-emerald-700 hover:bg-emerald-100"
                >
                  <FiX
                    size={18}
                  />
                </button>
              </div>
            </div>

            <div className="space-y-5 p-6">
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <label className="text-sm font-semibold text-slate-700">
                    Bearer token
                  </label>

                  <span className="rounded-full bg-emerald-100 px-2 py-1 text-xs font-medium text-emerald-700">
                    mcp:read
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type={
                      showMcpToken
                        ? 'text'
                        : 'password'
                    }
                    value={
                      createdMcpToken.token
                    }
                    readOnly
                    className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-slate-50 px-3 py-3 font-mono text-xs"
                    autoComplete="off"
                  />

                  <button
                    type="button"
                    onClick={() =>
                      setShowMcpToken(
                        (
                          previous
                        ) => !previous
                      )
                    }
                    className="rounded-lg border border-slate-200 p-3 text-slate-600 hover:bg-slate-50"
                    title={
                      showMcpToken
                        ? 'Hide token'
                        : 'Show token'
                    }
                  >
                    {showMcpToken ? (
                      <FiEyeOff
                        size={17}
                      />
                    ) : (
                      <FiEye
                        size={17}
                      />
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      void copyMcpToken()
                    }
                    className="rounded-lg bg-emerald-600 p-3 text-white hover:bg-emerald-700"
                    title="Copy MCP token"
                  >
                    {copiedKey ===
                    'mcp-created-token' ? (
                      <FiCheck
                        size={17}
                      />
                    ) : (
                      <FiCopy
                        size={17}
                      />
                    )}
                  </button>
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-3">
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs text-slate-500">
                    Name
                  </p>

                  <p className="mt-1 text-sm font-medium text-slate-800">
                    {
                      createdMcpToken.name
                    }
                  </p>
                </div>

                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs text-slate-500">
                    Permission
                  </p>

                  <p className="mt-1 text-sm font-medium text-emerald-700">
                    mcp:read
                  </p>
                </div>

                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs text-slate-500">
                    Expires
                  </p>

                  <p className="mt-1 text-sm font-medium text-slate-800">
                    {createdMcpToken.expires_at
                      ? new Date(
                          createdMcpToken.expires_at
                        ).toLocaleString()
                      : 'Unknown'}
                  </p>
                </div>
              </div>

              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                <div className="flex gap-3">
                  <FiAlertCircle className="mt-0.5 shrink-0 text-amber-600" />

                  <div>
                    <p className="font-semibold text-amber-800">
                      Keep this token private
                    </p>

                    <p className="mt-1 text-xs leading-5 text-amber-700">
                      Never commit it to Git,
                      put it in frontend source
                      code, share it in screenshots,
                      or include it in URLs.
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() =>
                    void copyMcpToken()
                  }
                  className="inline-flex items-center gap-2 rounded-lg border border-emerald-300 px-4 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-50"
                >
                  <FiCopy
                    size={15}
                  />

                  Copy token
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setCreatedMcpToken(
                      null
                    );
                    setShowMcpToken(
                      false
                    );
                  }}
                  className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}