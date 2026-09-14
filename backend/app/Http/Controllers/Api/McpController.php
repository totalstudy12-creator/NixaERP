<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\Mcp\McpContextService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Laravel\Sanctum\TransientToken;
use Throwable;

class McpController extends Controller
{
    private const MCP_VERSION = '1.1.0';
    private const MCP_MODE    = 'read_only';
    private const MCP_ABILITY = 'mcp:read';

    public function __construct(
        private readonly McpContextService $contextService
    ) {}

    /**
     * GET /api/mcp/status
     *
     * Any authenticated ERP user can verify MCP availability.
     */
    public function status(Request $request): JsonResponse
    {
        try {
            if (!$request->user()) {
                return response()->json([
                    'success' => false,
                    'message' => 'Unauthenticated.',
                ], 401);
            }

            return response()->json([
                'success' => true,
                'data' => [
                    'enabled'         => true,
                    'authenticated'   => true,
                    'mode'            => self::MCP_MODE,
                    'version'         => self::MCP_VERSION,
                    'core_sections'   => McpContextService::CORE_SECTIONS,
                    'report_sections' => McpContextService::REPORT_SECTIONS,
                    'all_sections'    => McpContextService::SECTIONS,
                ],
            ]);
        } catch (Throwable $e) {
            report($e);

            return response()->json([
                'success' => false,
                'message' => 'Unable to determine MCP status.',
            ], 500);
        }
    }

    /**
     * GET /api/mcp/context
     *
     * Returns the read-only business snapshot.
     *
     * Query params:
     *   ?sections=customers,products,sales        — subset (or `all`)
     *   ?sections=profit_loss,gst_summary         — opt-in report sections
     *   ?from=2026-04-01&to=2026-09-14            — date range (defaults: FY-to-date)
     *   ?limit=50                                 — rows per section (1..200)
     *   ?company_id=1&branch_id=2                 — scope narrowing
     *
     * Default behavior: only CORE_SECTIONS are built, which includes a
     * compact `reports` block (P&L summary + GST summary). Report sections
     * are opt-in to keep responses small.
     */
    public function context(Request $request): JsonResponse
    {
        try {
            $user = $request->user();

            if (!$user) {
                return response()->json([
                    'success' => false,
                    'message' => 'Unauthenticated.',
                ], 401);
            }

            $accessToken = $user->currentAccessToken();

            if (!$accessToken || $accessToken instanceof TransientToken) {
                return response()->json([
                    'success' => false,
                    'message' => 'A dedicated MCP access token is required.',
                    'error'   => 'MCP_TOKEN_REQUIRED',
                ], 403);
            }

            if (!$user->tokenCan(self::MCP_ABILITY)) {
                return response()->json([
                    'success' => false,
                    'message' => 'MCP access is not authorized.',
                    'error'   => 'MISSING_MCP_ABILITY',
                ], 403);
            }

            if ($accessToken->expires_at && $accessToken->expires_at->isPast()) {
                return response()->json([
                    'success' => false,
                    'message' => 'MCP token has expired.',
                    'error'   => 'MCP_TOKEN_EXPIRED',
                ], 401);
            }

            $validated = $request->validate([
                'sections'   => ['sometimes', 'string', 'max:1000'],
                'from'       => ['sometimes', 'date_format:Y-m-d'],
                'to'         => ['sometimes', 'date_format:Y-m-d', 'after_or_equal:from'],
                'limit'      => ['sometimes', 'integer', 'min:1', 'max:200'],
                'company_id' => ['sometimes', 'integer', 'min:1'],
                'branch_id'  => ['sometimes', 'integer', 'min:1'],
            ]);

            $sections = null;
            if (!empty($validated['sections'])) {
                $sections = array_values(array_filter(array_map(
                    'trim',
                    explode(',', $validated['sections'])
                )));
            }

            $options = [
                'sections'   => $sections,
                'from'       => $validated['from']       ?? null,
                'to'         => $validated['to']         ?? null,
                'limit'      => $validated['limit']      ?? McpContextService::DEFAULT_LIMIT,
                'company_id' => $validated['company_id'] ?? null,
                'branch_id'  => $validated['branch_id']  ?? null,
            ];

            $started = microtime(true);
            $data    = $this->contextService->build($options);
            $ms      = (int) round((microtime(true) - $started) * 1000);

            return response()->json([
                'success' => true,
                'data' => [
                    'user' => [
                        'id'    => $user->id,
                        'name'  => $user->name,
                        'email' => $user->email,
                    ],
                    'roles'     => $this->getUserRoles($user),
                    'abilities' => [self::MCP_ABILITY],

                    'token' => [
                        'id'           => $accessToken->id,
                        'name'         => $accessToken->name,
                        'expires_at'   => $accessToken->expires_at?->toISOString(),
                        'last_used_at' => $accessToken->last_used_at?->toISOString(),
                        'created_at'   => $accessToken->created_at?->toISOString(),
                    ],

                    'mcp' => [
                        'enabled'            => true,
                        'mode'               => self::MCP_MODE,
                        'version'            => self::MCP_VERSION,
                        'required_ability'   => self::MCP_ABILITY,
                        'core_sections'      => McpContextService::CORE_SECTIONS,
                        'report_sections'    => McpContextService::REPORT_SECTIONS,
                        'available_sections' => McpContextService::SECTIONS,
                    ],

                    'generated_at' => now()->toIso8601String(),
                    'duration_ms'  => $ms,

                    'scope' => [
                        'company_id' => $options['company_id'],
                        'branch_id'  => $options['branch_id'],
                        'from'       => $options['from'],
                        'to'         => $options['to'],
                        'limit'      => $options['limit'],
                        'sections'   => $sections,
                    ],

                    'sections' => $data,
                ],
            ]);
        } catch (\Illuminate\Validation\ValidationException $e) {
            return response()->json([
                'success' => false,
                'message' => 'Invalid request parameters.',
                'error'   => 'VALIDATION_FAILED',
                'errors'  => $e->errors(),
            ], 422);
        } catch (Throwable $e) {
            report($e);

            return response()->json([
                'success' => false,
                'message' => 'Unable to load MCP context.',
            ], 500);
        }
    }

    /**
     * GET /api/mcp/context/{section}
     *
     * Fetch a single section on demand — useful when the AI wants deeper
     * detail without pulling the whole snapshot.
     *
     * Valid sections:
     *   Core:   company, branches, warehouses, customers, suppliers, dealers,
     *           products, sales, purchases, payments, employees, attendance,
     *           accounting, reports
     *   Report: profit_loss, profit_loss_products, profit_loss_customers,
     *           profit_loss_branches, profit_loss_monthly,
     *           profit_loss_comparison, invoice_profitability, gst_summary,
     *           gst_rate_wise, receivables_aging, payables_aging,
     *           outstanding_sales, outstanding_purchases, sales_by_customer,
     *           sales_by_product, sales_by_user, purchase_by_vendor,
     *           payment_mode_summary, stock_summary, low_stock,
     *           expense_report, cash_flow, balance_sheet, trial_balance,
     *           top_products, top_customers
     */
    public function section(Request $request, string $section): JsonResponse
    {
        try {
            $user = $request->user();

            if (!$user) {
                return response()->json([
                    'success' => false,
                    'message' => 'Unauthenticated.',
                ], 401);
            }

            $accessToken = $user->currentAccessToken();

            if (!$accessToken || $accessToken instanceof TransientToken) {
                return response()->json([
                    'success' => false,
                    'message' => 'A dedicated MCP access token is required.',
                    'error'   => 'MCP_TOKEN_REQUIRED',
                ], 403);
            }

            if (!$user->tokenCan(self::MCP_ABILITY)) {
                return response()->json([
                    'success' => false,
                    'message' => 'MCP access is not authorized.',
                    'error'   => 'MISSING_MCP_ABILITY',
                ], 403);
            }

            if ($accessToken->expires_at && $accessToken->expires_at->isPast()) {
                return response()->json([
                    'success' => false,
                    'message' => 'MCP token has expired.',
                    'error'   => 'MCP_TOKEN_EXPIRED',
                ], 401);
            }

            $validated = $request->validate([
                'from'       => ['sometimes', 'date_format:Y-m-d'],
                'to'         => ['sometimes', 'date_format:Y-m-d', 'after_or_equal:from'],
                'limit'      => ['sometimes', 'integer', 'min:1', 'max:200'],
                'company_id' => ['sometimes', 'integer', 'min:1'],
                'branch_id'  => ['sometimes', 'integer', 'min:1'],
            ]);

            $options = [
                'from'       => $validated['from']       ?? null,
                'to'         => $validated['to']         ?? null,
                'limit'      => $validated['limit']      ?? McpContextService::DEFAULT_LIMIT,
                'company_id' => $validated['company_id'] ?? null,
                'branch_id'  => $validated['branch_id']  ?? null,
            ];

            $started = microtime(true);
            $result  = $this->contextService->section($section, $options);
            $ms      = (int) round((microtime(true) - $started) * 1000);

            if (($result['ok'] ?? false) === false
                && in_array($result['error'] ?? '', ['UNKNOWN_SECTION'], true)) {
                return response()->json([
                    'success' => false,
                    'message' => $result['message'] ?? 'Unknown section.',
                    'error'   => $result['error'],
                    'available_sections' => McpContextService::SECTIONS,
                ], 404);
            }

            return response()->json([
                'success' => true,
                'data' => [
                    'section'      => $section,
                    'generated_at' => now()->toIso8601String(),
                    'duration_ms'  => $ms,
                    'scope'        => $options,
                    'result'       => $result,
                ],
            ]);
        } catch (\Illuminate\Validation\ValidationException $e) {
            return response()->json([
                'success' => false,
                'message' => 'Invalid request parameters.',
                'error'   => 'VALIDATION_FAILED',
                'errors'  => $e->errors(),
            ], 422);
        } catch (Throwable $e) {
            report($e);

            return response()->json([
                'success' => false,
                'message' => 'Unable to load MCP section.',
            ], 500);
        }
    }

    /**
     * Return safe role information only.
     */
    private function getUserRoles($user): array
    {
        try {
            return $user->roles()
                ->select(['roles.id', 'roles.name'])
                ->get()
                ->map(static fn ($role) => [
                    'id'   => $role->id,
                    'name' => $role->name,
                ])
                ->values()
                ->all();
        } catch (Throwable $e) {
            Log::warning('MCP roles lookup failed', ['exception' => $e->getMessage()]);
            return [];
        }
    }
}