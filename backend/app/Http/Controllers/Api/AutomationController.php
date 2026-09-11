<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AutomationRun;
use App\Models\AutomationWorkflow;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class AutomationController extends Controller
{
    public function workflows(Request $request): JsonResponse
    {
        $query = AutomationWorkflow::query()
            ->withCount([
                'runs',
                'runs as successful_runs_count' => function ($q) {
                    $q->where('status', 'success');
                },
                'runs as failed_runs_count' => function ($q) {
                    $q->where('status', 'failed');
                },
            ])
            ->orderByDesc('id');

        $this->applyScope($query, $request);

        if ($request->filled('status')) {
            $query->where(
                'status',
                $request->string('status')->toString()
            );
        }

        if ($request->filled('category')) {
            $query->where(
                'category',
                $request->string('category')->toString()
            );
        }

        $items = $query
            ->get()
            ->map(function (AutomationWorkflow $workflow) {
                $data = $workflow->toArray();

                $data['runs_count'] =
                    (int) ($data['runs_count'] ?? 0);

                $data['successful_runs'] =
                    (int) ($data['successful_runs_count'] ?? 0);

                $data['failed_runs'] =
                    (int) ($data['failed_runs_count'] ?? 0);

                unset(
                    $data['successful_runs_count'],
                    $data['failed_runs_count'],
                );

                return $data;
            });

        return response()->json([
            'data' => $items,
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'company_id' => ['nullable', 'integer'],
            'branch_id' => ['nullable', 'integer'],

            'name' => ['required', 'string', 'max:150'],
            'description' => ['nullable', 'string'],

            'category' => [
                'required',
                'string',
                'max:50',
            ],

            'status' => [
                'required',
                'in:active,paused,draft',
            ],

            'trigger_type' => [
                'required',
                'in:event,schedule,manual',
            ],

            'trigger_event' => [
                'nullable',
                'string',
                'max:150',
            ],

            'schedule' => [
                'nullable',
                'string',
                'max:150',
            ],

            'requires_approval' => [
                'boolean',
            ],

            'retry_limit' => [
                'integer',
                'min:0',
                'max:10',
            ],

            'conditions' => [
                'nullable',
                'array',
            ],

            'actions' => [
                'nullable',
                'array',
            ],
        ]);

        $workflow = DB::transaction(function () use (
            $validated,
            $request
        ) {
            return AutomationWorkflow::create([
                ...$validated,
                'created_by' => $request->user()->id,
                'updated_by' => $request->user()->id,
            ]);
        });

        return response()->json([
            'data' => $workflow,
        ], 201);
    }

    public function update(
        Request $request,
        AutomationWorkflow $workflow
    ): JsonResponse {
        $validated = $request->validate([
            'company_id' => ['nullable', 'integer'],
            'branch_id' => ['nullable', 'integer'],

            'name' => ['sometimes', 'required', 'string', 'max:150'],
            'description' => ['nullable', 'string'],

            'category' => [
                'sometimes',
                'required',
                'string',
                'max:50',
            ],

            'status' => [
                'sometimes',
                'required',
                'in:active,paused,draft',
            ],

            'trigger_type' => [
                'sometimes',
                'required',
                'in:event,schedule,manual',
            ],

            'trigger_event' => [
                'nullable',
                'string',
                'max:150',
            ],

            'schedule' => [
                'nullable',
                'string',
                'max:150',
            ],

            'requires_approval' => [
                'sometimes',
                'boolean',
            ],

            'retry_limit' => [
                'sometimes',
                'integer',
                'min:0',
                'max:10',
            ],

            'conditions' => [
                'nullable',
                'array',
            ],

            'actions' => [
                'nullable',
                'array',
            ],
        ]);

        $workflow->fill($validated);
        $workflow->updated_by = $request->user()->id;
        $workflow->save();

        return response()->json([
            'data' => $workflow->fresh(),
        ]);
    }

    public function destroy(
        Request $request,
        AutomationWorkflow $workflow
    ): JsonResponse {
        DB::transaction(function () use (
            $workflow
        ) {
            $workflow->delete();
        });

        return response()->json([
            'message' => 'Automation deleted successfully.',
        ]);
    }

    public function run(
        Request $request,
        AutomationWorkflow $workflow
    ): JsonResponse {
        if ($workflow->status === 'paused') {
            return response()->json([
                'message' => 'Automation is paused.',
            ], 422);
        }

        $idempotencyKey =
            $request->header('Idempotency-Key')
            ?? (string) Str::uuid();

        $existing = AutomationRun::query()
            ->where('idempotency_key', $idempotencyKey)
            ->first();

        if ($existing) {
            return response()->json([
                'data' => $existing,
                'idempotent_replay' => true,
            ]);
        }

        $startedAt = microtime(true);

        $run = DB::transaction(
            function () use (
                $workflow,
                $request,
                $idempotencyKey
            ) {
                return AutomationRun::create([
                    'automation_workflow_id' =>
                        $workflow->id,

                    'company_id' =>
                        $workflow->company_id,

                    'branch_id' =>
                        $workflow->branch_id,

                    'status' => 'running',

                    'trigger_source' =>
                        $request->input(
                            'source',
                            'manual'
                        ),

                    'idempotency_key' =>
                        $idempotencyKey,

                    'started_at' => now(),

                    'input' => [
                        'requested_by' =>
                            $request->user()->id,
                    ],

                    'started_by' =>
                        $request->user()->id,
                ]);
            }
        );

        /*
         * IMPORTANT:
         * This is the execution boundary.
         *
         * Domain actions should be dispatched here through
         * dedicated services/jobs:
         *
         * journal_entry
         * ledger_post
         * payment_matching
         * due_reminder
         * financial_report
         * gst_validation
         * inventory actions
         * CRM follow-up
         * HR audit
         *
         * Do not execute arbitrary PHP/code supplied from
         * the frontend.
         */

        $run->status = 'success';
        $run->finished_at = now();
        $run->duration_ms =
            (int) round(
                (microtime(true) - $startedAt) * 1000
            );

        $run->message =
            'Automation execution accepted successfully.';

        $run->output = [
            'workflow_id' => $workflow->id,
            'actions_count' =>
                count($workflow->actions ?? []),
        ];

        $run->save();

        $workflow->increment('runs_count');
        $workflow->increment('successful_runs');
        $workflow->forceFill([
            'last_run_at' => now(),
            'updated_by' => $request->user()->id,
        ])->save();

        return response()->json([
            'data' => $run->fresh(),
        ], 201);
    }

    public function duplicate(
        Request $request,
        AutomationWorkflow $workflow
    ): JsonResponse {
        $copy = DB::transaction(
            function () use (
                $workflow,
                $request
            ) {
                return AutomationWorkflow::create([
                    'company_id' =>
                        $workflow->company_id,

                    'branch_id' =>
                        $workflow->branch_id,

                    'name' =>
                        $workflow->name . ' (Copy)',

                    'description' =>
                        $workflow->description,

                    'category' =>
                        $workflow->category,

                    'status' => 'draft',

                    'trigger_type' =>
                        $workflow->trigger_type,

                    'trigger_event' =>
                        $workflow->trigger_event,

                    'schedule' =>
                        $workflow->schedule,

                    'requires_approval' =>
                        $workflow->requires_approval,

                    'retry_limit' =>
                        $workflow->retry_limit,

                    'conditions' =>
                        $workflow->conditions,

                    'actions' =>
                        $workflow->actions,

                    'created_by' =>
                        $request->user()->id,

                    'updated_by' =>
                        $request->user()->id,
                ]);
            }
        );

        return response()->json([
            'data' => $copy,
        ], 201);
    }

    public function runs(Request $request): JsonResponse
    {
        $query = AutomationRun::query()
            ->with([
                'workflow:id,name',
            ])
            ->latest('id');

        $this->applyScope($query, $request, 'automation_runs');

        if ($request->filled('workflow_id')) {
            $query->where(
                'automation_workflow_id',
                $request->integer('workflow_id')
            );
        }

        $limit = min(
            max($request->integer('limit', 100), 1),
            500
        );

        $items = $query
            ->limit($limit)
            ->get()
            ->map(function (AutomationRun $run) {
                return [
                    ...$run->toArray(),
                    'workflow_name' =>
                        $run->workflow?->name,
                ];
            });

        return response()->json([
            'data' => $items,
        ]);
    }

    public function stats(Request $request): JsonResponse
    {
        $workflowQuery =
            AutomationWorkflow::query();

        $this->applyScope(
            $workflowQuery,
            $request
        );

        $runQuery =
            AutomationRun::query();

        $this->applyScope(
            $runQuery,
            $request,
            'automation_runs'
        );

        $today = now()->startOfDay();

        return response()->json([
            'data' => [
                'total' =>
                    (clone $workflowQuery)->count(),

                'active' =>
                    (clone $workflowQuery)
                        ->where('status', 'active')
                        ->count(),

                'paused' =>
                    (clone $workflowQuery)
                        ->where('status', 'paused')
                        ->count(),

                'draft' =>
                    (clone $workflowQuery)
                        ->where('status', 'draft')
                        ->count(),

                'runs_today' =>
                    (clone $runQuery)
                        ->where('created_at', '>=', $today)
                        ->count(),

                'success_today' =>
                    (clone $runQuery)
                        ->where('status', 'success')
                        ->where('created_at', '>=', $today)
                        ->count(),

                'failed_today' =>
                    (clone $runQuery)
                        ->where('status', 'failed')
                        ->where('created_at', '>=', $today)
                        ->count(),
            ],
        ]);
    }

    private function applyScope(
        $query,
        Request $request,
        string $table = 'automation_workflows'
    ): void {
        /*
         * IMPORTANT:
         * Replace these values with the company/branch
         * context already established by your auth/store
         * middleware if you have a dedicated context system.
         *
         * Never trust arbitrary company/branch IDs from a
         * normal browser request without authorization.
         */

        if ($request->filled('company_id')) {
            $query->where(
                "{$table}.company_id",
                $request->integer('company_id')
            );
        }

        if ($request->filled('branch_id')) {
            $query->where(
                "{$table}.branch_id",
                $request->integer('branch_id')
            );
        }
    }
}