<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ApiToken;
use App\Models\Setting;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Validator;
use Illuminate\Support\Str;
use Throwable;

class SettingsController extends Controller
{
    private const CACHE_KEY = 'app_settings_all';

    /*
    |--------------------------------------------------------------------------
    | MCP Configuration
    |--------------------------------------------------------------------------
    */

    private const MCP_TOKEN_PREFIX = 'NixaERP MCP:';

    private const MCP_ABILITY = 'mcp:read';

    private const MCP_DEFAULT_DAYS = 30;

    private const MCP_MAX_DAYS = 90;

    /*
    |--------------------------------------------------------------------------
    | Settings
    |--------------------------------------------------------------------------
    */

    public function index(Request $request)
    {
        try {
            $cacheKey = self::CACHE_KEY . ':' .
                md5(
                    serialize(
                        $request->only([
                            'group',
                            'search',
                            'public_only',
                        ])
                    )
                );

            $settings = Cache::remember(
                $cacheKey,
                now()->addMinutes(30),
                function () use ($request) {
                    $query = Setting::query();

                    if ($request->filled('group')) {
                        $query->where(
                            'group',
                            $request->string('group')->toString()
                        );
                    }

                    if ($request->filled('search')) {
                        $search = $request
                            ->string('search')
                            ->toString();

                        $query->where(
                            function ($q) use ($search) {
                                $q->where(
                                    'key',
                                    'like',
                                    '%' . $search . '%'
                                )->orWhere(
                                    'description',
                                    'like',
                                    '%' . $search . '%'
                                )->orWhere(
                                    'value',
                                    'like',
                                    '%' . $search . '%'
                                );
                            }
                        );
                    }

                    if ($request->boolean('public_only')) {
                        $query->where(
                            'is_public',
                            true
                        );
                    }

                    return $query
                        ->orderBy('group')
                        ->orderBy('key')
                        ->get();
                }
            );

            return response()->json([
                'success' => true,
                'data' => $settings,
            ]);
        } catch (Throwable $e) {
            report($e);

            return response()->json([
                'success' => false,
                'message' => 'Failed to fetch settings.',
            ], 500);
        }
    }

    public function show($key)
    {
        try {
            $setting = $this->findSetting($key);

            if (!$setting) {
                return response()->json([
                    'success' => false,
                    'message' => 'Setting not found.',
                ], 404);
            }

            return response()->json([
                'success' => true,
                'data' => $setting,
            ]);
        } catch (Throwable $e) {
            report($e);

            return response()->json([
                'success' => false,
                'message' => 'Failed to fetch setting.',
            ], 500);
        }
    }

    public function store(Request $request)
    {
        try {
            $validator = $this->validateSetting(
                $request,
                true
            );

            if ($validator->fails()) {
                return response()->json([
                    'success' => false,
                    'message' => 'Validation failed.',
                    'errors' => $validator->errors(),
                ], 422);
            }

            $setting = Setting::create(
                $validator->validated()
            );

            $this->clearSettingsCache();

            return response()->json([
                'success' => true,
                'message' => 'Setting created successfully.',
                'data' => $setting,
            ], 201);
        } catch (Throwable $e) {
            report($e);

            return response()->json([
                'success' => false,
                'message' => 'Failed to create setting.',
            ], 500);
        }
    }

    public function update(
        Request $request,
        $key
    ) {
        try {
            $setting = $this->findSetting($key);

            if (!$setting) {
                $request->merge([
                    'key' => $key,
                ]);

                return $this->store($request);
            }

            $validator = $this->validateSetting(
                $request,
                false
            );

            if ($validator->fails()) {
                return response()->json([
                    'success' => false,
                    'message' => 'Validation failed.',
                    'errors' => $validator->errors(),
                ], 422);
            }

            $setting->fill(
                $validator->validated()
            );

            $setting->save();

            $this->clearSettingsCache();

            return response()->json([
                'success' => true,
                'message' => 'Setting updated successfully.',
                'data' => $setting,
            ]);
        } catch (Throwable $e) {
            report($e);

            return response()->json([
                'success' => false,
                'message' => 'Failed to update setting.',
            ], 500);
        }
    }

    public function destroy($key)
    {
        try {
            $setting = $this->findSetting($key);

            if (!$setting) {
                return response()->json([
                    'success' => false,
                    'message' => 'Setting not found.',
                ], 404);
            }

            $setting->delete();

            $this->clearSettingsCache();

            return response()->json([
                'success' => true,
                'message' => 'Setting deleted successfully.',
            ]);
        } catch (Throwable $e) {
            report($e);

            return response()->json([
                'success' => false,
                'message' => 'Failed to delete setting.',
            ], 500);
        }
    }

    public function bulkUpdate(Request $request)
    {
        try {
            $validator = Validator::make(
                $request->all(),
                [
                    'settings' => [
                        'required',
                        'array',
                        'min:1',
                    ],

                    'settings.*.key' => [
                        'required',
                        'string',
                        'max:100',
                    ],

                    'settings.*.value' => [
                        'nullable',
                        'string',
                    ],

                    'settings.*.group' => [
                        'nullable',
                        'string',
                        'max:100',
                    ],

                    'settings.*.description' => [
                        'nullable',
                        'string',
                        'max:255',
                    ],

                    'settings.*.is_public' => [
                        'nullable',
                        'boolean',
                    ],
                ]
            );

            if ($validator->fails()) {
                return response()->json([
                    'success' => false,
                    'message' => 'Validation failed.',
                    'errors' => $validator->errors(),
                ], 422);
            }

            $updated = 0;
            $created = 0;

            foreach (
                $validator->validated()['settings']
                as $data
            ) {
                $setting = Setting::where(
                    'key',
                    $data['key']
                )->first();

                if ($setting) {
                    $setting->fill($data)->save();
                    $updated++;
                } else {
                    Setting::create($data);
                    $created++;
                }
            }

            $this->clearSettingsCache();

            return response()->json([
                'success' => true,
                'message' =>
                    "Bulk update completed. " .
                    "Updated: {$updated}, " .
                    "Created: {$created}.",
                'data' => [
                    'updated' => $updated,
                    'created' => $created,
                ],
            ]);
        } catch (Throwable $e) {
            report($e);

            return response()->json([
                'success' => false,
                'message' =>
                    'Failed to perform bulk update.',
            ], 500);
        }
    }

    public function export()
    {
        try {
            $settings = Setting::query()
                ->orderBy('group')
                ->orderBy('key')
                ->get();

            $filename =
                'settings-' .
                now()->format('Y-m-d-His') .
                '.json';

            $content = $settings->toJson(
                JSON_PRETTY_PRINT |
                JSON_UNESCAPED_UNICODE
            );

            return response()->streamDownload(
                static function () use ($content): void {
                    echo $content;
                },
                $filename,
                [
                    'Content-Type' =>
                        'application/json',
                ]
            );
        } catch (Throwable $e) {
            report($e);

            return response()->json([
                'success' => false,
                'message' =>
                    'Failed to export settings.',
            ], 500);
        }
    }

    public function import(Request $request)
    {
        try {
            $validator = Validator::make(
                $request->all(),
                [
                    'file' => [
                        'required',
                        'file',
                        'mimes:json,txt',
                        'max:5120',
                    ],
                ]
            );

            if ($validator->fails()) {
                return response()->json([
                    'success' => false,
                    'message' => 'Validation failed.',
                    'errors' => $validator->errors(),
                ], 422);
            }

            $file = $request->file('file');

            $json = file_get_contents(
                $file->getRealPath()
            );

            if ($json === false) {
                return response()->json([
                    'success' => false,
                    'message' =>
                        'Unable to read uploaded file.',
                ], 422);
            }

            $settingsData = json_decode(
                $json,
                true
            );

            if (
                !is_array($settingsData) ||
                json_last_error() !== JSON_ERROR_NONE
            ) {
                return response()->json([
                    'success' => false,
                    'message' =>
                        'Invalid JSON file.',
                ], 422);
            }

            $imported = 0;

            foreach ($settingsData as $item) {
                if (
                    !is_array($item) ||
                    empty($item['key'])
                ) {
                    continue;
                }

                Setting::updateOrCreate(
                    [
                        'key' => $item['key'],
                    ],
                    [
                        'value' =>
                            $item['value'] ?? null,

                        'group' =>
                            $item['group'] ??
                            'general',

                        'description' =>
                            $item['description'] ??
                            null,

                        'is_public' =>
                            (bool) (
                                $item['is_public'] ??
                                false
                            ),
                    ]
                );

                $imported++;
            }

            $this->clearSettingsCache();

            return response()->json([
                'success' => true,
                'message' =>
                    "Imported {$imported} settings.",
                'data' => [
                    'imported' => $imported,
                ],
            ]);
        } catch (Throwable $e) {
            report($e);

            return response()->json([
                'success' => false,
                'message' =>
                    'Failed to import settings.',
            ], 500);
        }
    }

    public function clearCache()
    {
        try {
            $this->clearSettingsCache();

            return response()->json([
                'success' => true,
                'message' =>
                    'Settings cache cleared successfully.',
            ]);
        } catch (Throwable $e) {
            report($e);

            return response()->json([
                'success' => false,
                'message' =>
                    'Failed to clear cache.',
            ], 500);
        }
    }

    public function quickstart(
        Request $request
    ) {
        try {
            $appUrl =
                config('app.url') ?:
                $request->getSchemeAndHttpHost();

            $cronLinux =
                '* * * * * cd ' .
                base_path() .
                ' && php artisan schedule:run ' .
                '>> /dev/null 2>&1';

            $cronWindows =
                'C:\\xampp\\php\\php.exe ' .
                base_path() .
                '\\artisan schedule:run';

            return response()->json([
                'success' => true,
                'data' => [
                    'app_url' => $appUrl,

                    'cron' => [
                        'linux' => $cronLinux,
                        'windows_example' =>
                            $cronWindows,
                    ],

                    'examples' => [
                        'login' => [
                            'method' => 'POST',
                            'url' =>
                                $appUrl . '/api/login',
                            'body' => [
                                'email' =>
                                    'admin@example.com',
                                'password' =>
                                    'password',
                            ],
                        ],
                    ],

                    'steps' => [
                        '1' =>
                            'Run scheduler cron.',
                        '2' =>
                            'Create permissions, roles, and users.',
                        '3' =>
                            'Use protected API endpoints.',
                    ],
                ],
            ]);
        } catch (Throwable $e) {
            report($e);

            return response()->json([
                'success' => false,
                'message' =>
                    'Failed to fetch quickstart info.',
            ], 500);
        }
    }

    /*
    |--------------------------------------------------------------------------
    | Existing API Token Management
    |--------------------------------------------------------------------------
    */

    public function listTokens()
    {
        try {
            $tokens = ApiToken::query()
                ->orderByDesc('created_at')
                ->get([
                    'id',
                    'name',
                    'abilities',
                    'last_used_at',
                    'expires_at',
                    'created_at',
                ]);

            return response()->json([
                'success' => true,
                'data' => $tokens,
            ]);
        } catch (Throwable $e) {
            report($e);

            return response()->json([
                'success' => false,
                'message' =>
                    'Failed to fetch API tokens.',
            ], 500);
        }
    }

    public function generateToken(
        Request $request
    ) {
        try {
            $validator = Validator::make(
                $request->all(),
                [
                    'name' => [
                        'required',
                        'string',
                        'max:255',
                    ],

                    'abilities' => [
                        'nullable',
                        'array',
                    ],

                    'abilities.*' => [
                        'string',
                        'max:100',
                    ],

                    'expires_at' => [
                        'nullable',
                        'date',
                    ],
                ]
            );

            if ($validator->fails()) {
                return response()->json([
                    'success' => false,
                    'message' =>
                        'Validation failed.',
                    'errors' =>
                        $validator->errors(),
                ], 422);
            }

            $data = $validator->validated();

            $token = ApiToken::create([
                'name' => $data['name'],

                'token' =>
                    ApiToken::generateToken(),

                'abilities' =>
                    $data['abilities'] ?? ['*'],

                'expires_at' =>
                    $data['expires_at'] ?? null,
            ]);

            return response()->json([
                'success' => true,
                'message' =>
                    'API token generated successfully.',
                'data' => $token,
            ], 201);
        } catch (Throwable $e) {
            report($e);

            return response()->json([
                'success' => false,
                'message' =>
                    'Failed to generate API token.',
            ], 500);
        }
    }

    public function revokeToken($id)
    {
        try {
            $token = ApiToken::find($id);

            if (!$token) {
                return response()->json([
                    'success' => false,
                    'message' =>
                        'API token not found.',
                ], 404);
            }

            $token->delete();

            return response()->json([
                'success' => true,
                'message' =>
                    'API token revoked successfully.',
            ]);
        } catch (Throwable $e) {
            report($e);

            return response()->json([
                'success' => false,
                'message' =>
                    'Failed to revoke API token.',
            ], 500);
        }
    }

    public function revokeAllTokens()
    {
        try {
            ApiToken::query()->delete();

            return response()->json([
                'success' => true,
                'message' =>
                    'All API tokens revoked successfully.',
            ]);
        } catch (Throwable $e) {
            report($e);

            return response()->json([
                'success' => false,
                'message' =>
                    'Failed to revoke all API tokens.',
            ], 500);
        }
    }

    /*
    |--------------------------------------------------------------------------
    | MCP Token Management
    |--------------------------------------------------------------------------
    |
    | MCP uses Laravel Sanctum Personal Access Tokens.
    |
    | These tokens:
    | - belong to the authenticated ERP user
    | - only have mcp:read
    | - have a maximum 90-day lifetime
    | - return the plain-text token only once
    |--------------------------------------------------------------------------
    */

    public function listMcpTokens(
        Request $request
    ) {
        try {
            $user = $request->user();

            if (!$user) {
                return response()->json([
                    'success' => false,
                    'message' => 'Unauthenticated.',
                ], 401);
            }

            $tokens = $user->tokens()
                ->where(
                    'name',
                    'like',
                    self::MCP_TOKEN_PREFIX . '%'
                )
                ->orderByDesc('created_at')
                ->get([
                    'id',
                    'name',
                    'abilities',
                    'last_used_at',
                    'expires_at',
                    'created_at',
                ])
                ->map(
                    static function ($token): array {
                        return [
                            'id' => $token->id,

                            'name' =>
                                $token->name,

                            'abilities' =>
                                is_array(
                                    $token->abilities
                                )
                                    ? $token->abilities
                                    : [],

                            'last_used_at' =>
                                $token->last_used_at
                                    ? $token
                                        ->last_used_at
                                        ->toISOString()
                                    : null,

                            'expires_at' =>
                                $token->expires_at
                                    ? $token
                                        ->expires_at
                                        ->toISOString()
                                    : null,

                            'created_at' =>
                                $token->created_at
                                    ? $token
                                        ->created_at
                                        ->toISOString()
                                    : null,
                        ];
                    }
                )
                ->values();

            return response()->json([
                'success' => true,
                'data' => $tokens,
            ]);
        } catch (Throwable $e) {
            report($e);

            return response()->json([
                'success' => false,
                'message' =>
                    'Failed to fetch MCP tokens.',
            ], 500);
        }
    }

    public function generateMcpToken(
        Request $request
    ) {
        try {
            $user = $request->user();

            if (!$user) {
                return response()->json([
                    'success' => false,
                    'message' => 'Unauthenticated.',
                ], 401);
            }

            $validator = Validator::make(
                $request->all(),
                [
                    'name' => [
                        'nullable',
                        'string',
                        'max:100',
                    ],

                    'expires_days' => [
                        'nullable',
                        'integer',
                        'min:1',
                        'max:' .
                            self::MCP_MAX_DAYS,
                    ],
                ]
            );

            if ($validator->fails()) {
                return response()->json([
                    'success' => false,
                    'message' =>
                        'Validation failed.',
                    'errors' =>
                        $validator->errors(),
                ], 422);
            }

            $data = $validator->validated();

            $days = (int) (
                $data['expires_days']
                ?? self::MCP_DEFAULT_DAYS
            );

            $label = trim(
                (string) (
                    $data['name']
                    ?? 'Default'
                )
            );

            if ($label === '') {
                $label = 'Default';
            }

            $label = Str::limit(
                $label,
                70,
                ''
            );

            /*
             * Always server-control the prefix.
             */
            $tokenName =
                self::MCP_TOKEN_PREFIX .
                $label;

            /*
             * IMPORTANT:
             *
             * The client cannot request arbitrary abilities.
             *
             * MCP token receives ONLY:
             *
             *     mcp:read
             */
            $newToken = $user->createToken(
                $tokenName,
                [
                    self::MCP_ABILITY,
                ],
                now()->addDays($days)
            );

            return response()->json([
                'success' => true,

                'message' =>
                    'MCP access token created successfully.',

                'data' => [
                    /*
                     * IMPORTANT:
                     * This value is only available during creation.
                     */
                    'token' =>
                        $newToken->plainTextToken,

                    'token_type' => 'Bearer',

                    'id' =>
                        $newToken->accessToken->id,

                    'name' =>
                        $newToken->accessToken->name,

                    'abilities' => [
                        self::MCP_ABILITY,
                    ],

                    'expires_at' =>
                        $newToken
                            ->accessToken
                            ->expires_at
                            ? $newToken
                                ->accessToken
                                ->expires_at
                                ->toISOString()
                            : null,

                    'warning' =>
                        'Store this token securely. ' .
                        'It is shown only once. ' .
                        'Never put it in source code, ' .
                        'URLs, screenshots, or logs.',
                ],
            ], 201);
        } catch (Throwable $e) {
            report($e);

            return response()->json([
                'success' => false,
                'message' =>
                    'Failed to generate MCP token.',
            ], 500);
        }
    }

    public function revokeMcpToken(
        Request $request,
        int $tokenId
    ) {
        try {
            $user = $request->user();

            if (!$user) {
                return response()->json([
                    'success' => false,
                    'message' => 'Unauthenticated.',
                ], 401);
            }

            /*
             * Ownership is enforced through the current
             * authenticated user's tokens relationship.
             */
            $token = $user->tokens()
                ->whereKey($tokenId)
                ->where(
                    'name',
                    'like',
                    self::MCP_TOKEN_PREFIX . '%'
                )
                ->first();

            if (!$token) {
                return response()->json([
                    'success' => false,
                    'message' =>
                        'MCP token not found.',
                ], 404);
            }

            $token->delete();

            return response()->json([
                'success' => true,
                'message' =>
                    'MCP token revoked successfully.',
            ]);
        } catch (Throwable $e) {
            report($e);

            return response()->json([
                'success' => false,
                'message' =>
                    'Failed to revoke MCP token.',
            ], 500);
        }
    }

    public function revokeAllMcpTokens(
        Request $request
    ) {
        try {
            $user = $request->user();

            if (!$user) {
                return response()->json([
                    'success' => false,
                    'message' => 'Unauthenticated.',
                ], 401);
            }

            $deleted = $user->tokens()
                ->where(
                    'name',
                    'like',
                    self::MCP_TOKEN_PREFIX . '%'
                )
                ->delete();

            return response()->json([
                'success' => true,

                'message' =>
                    'All MCP tokens revoked successfully.',

                'data' => [
                    'revoked' => $deleted,
                ],
            ]);
        } catch (Throwable $e) {
            report($e);

            return response()->json([
                'success' => false,
                'message' =>
                    'Failed to revoke MCP tokens.',
            ], 500);
        }
    }

    /*
    |--------------------------------------------------------------------------
    | Helpers
    |--------------------------------------------------------------------------
    */

    private function findSetting($key)
    {
        return Setting::where(
            'key',
            $key
        )->first();
    }

    private function clearSettingsCache(): void
    {
        Cache::forget(
            self::CACHE_KEY
        );

        $keys = Cache::get(
            'settings_cache_keys',
            []
        );

        if (is_array($keys)) {
            foreach ($keys as $cacheKey) {
                if (is_string($cacheKey)) {
                    Cache::forget($cacheKey);
                }
            }
        }

        Cache::forget(
            'settings_cache_keys'
        );
    }

    private function validateSetting(
        Request $request,
        bool $isNew
    ) {
        $rules = [
            'value' => [
                'nullable',
                'string',
            ],

            'group' => [
                'nullable',
                'string',
                'max:100',
            ],

            'description' => [
                'nullable',
                'string',
                'max:255',
            ],

            'is_public' => [
                'nullable',
                'boolean',
            ],
        ];

        if ($isNew) {
            $rules['key'] = [
                'required',
                'string',
                'max:100',
                'unique:settings,key',
            ];
        }

        return Validator::make(
            $request->all(),
            $rules
        );
    }
}