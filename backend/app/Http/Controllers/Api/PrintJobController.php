<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\LabelTemplate;
use App\Models\PrintJob;
use App\Models\PrintJobItem;
use App\Models\Product;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class PrintJobController extends Controller
{
    /**
     * Display a listing of print jobs (History / All).
     */
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        $query = PrintJob::with(['items.product', 'user', 'printerProfile', 'template']);

        if ($user && $user->company_id) {
            $query->where('company_id', $user->company_id);
        }

        if ($request->filled('status')) {
            $query->where('status', $request->input('status'));
        }

        if ($request->filled('printer_id')) {
            $query->where('printer_profile_id', $request->input('printer_id'));
        }

        if ($request->filled('search')) {
            $search = $request->input('search');
            $query->where(function ($q) use ($search) {
                $q->where('job_number', 'like', "%{$search}%")
                  ->orWhere('printer_name', 'like', "%{$search}%")
                  ->orWhere('template_name', 'like', "%{$search}%")
                  ->orWhereHas('items', function ($itemQuery) use ($search) {
                      $itemQuery->where('product_name', 'like', "%{$search}%")
                                ->orWhere('sku', 'like', "%{$search}%")
                                ->orWhere('barcode', 'like', "%{$search}%");
                  });
            });
        }

        if ($request->filled('from')) {
            $query->whereDate('created_at', '>=', $request->input('from'));
        }

        if ($request->filled('to')) {
            $query->whereDate('created_at', '<=', $request->input('to'));
        }

        $perPage = (int) $request->input('per_page', 20);
        $jobs = $query->orderByDesc('id')->paginate($perPage);

        return response()->json([
            'success' => true,
            'data' => $jobs->items(),
            'current_page' => $jobs->currentPage(),
            'last_page' => $jobs->lastPage(),
            'total' => $jobs->total(),
        ]);
    }

    /**
     * Display active print queue.
     */
    public function queue(Request $request): JsonResponse
    {
        $user = $request->user();
        $query = PrintJob::with(['items', 'printerProfile', 'template'])
            ->whereIn('status', ['draft', 'queued', 'connecting', 'sending', 'pending_reconnection']);

        if ($user && $user->company_id) {
            $query->where('company_id', $user->company_id);
        }

        $queue = $query->orderBy('created_at')->get();

        return response()->json([
            'success' => true,
            'data' => $queue,
            'count' => $queue->count(),
        ]);
    }

    /**
     * Store a newly created print job.
     */
    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'printer_profile_id' => 'nullable|exists:printer_profiles,id',
            'printer_name' => 'required|string|max:150',
            'template_id' => 'nullable|exists:label_templates,id',
            'template_name' => 'required|string|max:150',
            'status' => 'nullable|string|in:draft,queued,connecting,sending,sent_to_printer,completed,failed,cancelled,pending_reconnection',
            'items' => 'required|array|min:1',
            'items.*.product_id' => 'nullable|exists:products,id',
            'items.*.product_name' => 'required|string|max:255',
            'items.*.sku' => 'required|string|max:100',
            'items.*.barcode' => 'nullable|string|max:100',
            'items.*.sale_price' => 'nullable|numeric|min:0',
            'items.*.quantity' => 'required|integer|min:1|max:1000',
            'items.*.extra_data' => 'nullable|array',
        ]);

        $user = $request->user();

        // Calculate total labels
        $totalLabels = 0;
        foreach ($validated['items'] as $item) {
            $totalLabels += (int) $item['quantity'];
        }

        // Generate unique readable Job Number PRN-YYYYMMDD-XXXX
        $datePrefix = date('Ymd');
        $randomSuffix = strtoupper(Str::random(4));
        $jobNumber = "PRN-{$datePrefix}-{$randomSuffix}";

        DB::beginTransaction();
        try {
            $initialStatus = $validated['status'] ?? 'queued';

            $job = PrintJob::create([
                'job_number' => $jobNumber,
                'company_id' => $user?->company_id,
                'branch_id' => $user?->branch_id,
                'user_id' => $user?->id,
                'printer_profile_id' => $validated['printer_profile_id'] ?? null,
                'printer_name' => $validated['printer_name'],
                'template_id' => $validated['template_id'] ?? null,
                'template_name' => $validated['template_name'],
                'total_labels' => $totalLabels,
                'printed_labels' => $initialStatus === 'sent_to_printer' || $initialStatus === 'completed' ? $totalLabels : 0,
                'status' => $initialStatus,
                'ip_address' => $request->ip(),
                'user_agent' => $request->userAgent(),
            ]);

            foreach ($validated['items'] as $item) {
                PrintJobItem::create([
                    'print_job_id' => $job->id,
                    'product_id' => $item['product_id'] ?? null,
                    'product_name' => $item['product_name'],
                    'sku' => $item['sku'],
                    'barcode' => $item['barcode'] ?? null,
                    'sale_price' => $item['sale_price'] ?? 0.00,
                    'quantity' => $item['quantity'],
                    'extra_data' => $item['extra_data'] ?? null,
                ]);
            }

            // Audit Log
            AuditLog::create([
                'user_id' => $user?->id,
                'user_name' => $user?->name ?? 'System',
                'user_email' => $user?->email ?? 'operator@nixaerp.in',
                'module' => 'Thermal Printing',
                'action' => 'Create Print Job',
                'status' => 'success',
                'message' => "Queued print job {$jobNumber} ({$totalLabels} labels on '{$job->printer_name}')",
                'ip_address' => $request->ip(),
                'user_agent' => $request->userAgent(),
            ]);

            DB::commit();

            return response()->json([
                'success' => true,
                'message' => "Print job {$jobNumber} created successfully",
                'data' => $job->load('items'),
            ], 201);
        } catch (\Throwable $e) {
            DB::rollBack();
            return response()->json([
                'success' => false,
                'message' => 'Failed to initialize print job: ' . $e->getMessage(),
            ], 500);
        }
    }

    /**
     * Display the specified print job.
     */
    public function show(PrintJob $printJob): JsonResponse
    {
        return response()->json([
            'success' => true,
            'data' => $printJob->load(['items.product', 'printerProfile', 'template', 'user']),
        ]);
    }

    /**
     * Update print job status.
     */
    public function updateStatus(Request $request, PrintJob $printJob): JsonResponse
    {
        $validated = $request->validate([
            'status' => 'required|string|in:draft,queued,connecting,sending,sent_to_printer,completed,failed,cancelled,pending_reconnection',
            'printed_labels' => 'nullable|integer|min:0',
            'error_message' => 'nullable|string|max:1000',
        ]);

        $updateData = ['status' => $validated['status']];
        if (isset($validated['printed_labels'])) {
            $updateData['printed_labels'] = $validated['printed_labels'];
        }
        if (isset($validated['error_message'])) {
            $updateData['error_message'] = $validated['error_message'];
        }

        $printJob->update($updateData);

        return response()->json([
            'success' => true,
            'message' => "Print job status updated to {$validated['status']}",
            'data' => $printJob->fresh()->load('items'),
        ]);
    }

    /**
     * Cancel an active print job.
     */
    public function cancel(Request $request, PrintJob $printJob): JsonResponse
    {
        if (in_array($printJob->status, ['completed', 'cancelled'])) {
            return response()->json([
                'success' => false,
                'message' => "Job cannot be cancelled as it is already {$printJob->status}",
            ], 422);
        }

        $user = $request->user();
        $printJob->update([
            'status' => 'cancelled',
            'error_message' => 'Cancelled by user ' . ($user?->name ?? 'operator'),
        ]);

        AuditLog::create([
            'user_id' => $user?->id,
            'user_name' => $user?->name ?? 'System',
            'user_email' => $user?->email ?? 'operator@nixaerp.in',
            'module' => 'Thermal Printing',
            'action' => 'Cancel Print Job',
            'status' => 'warning',
            'message' => "Cancelled print job {$printJob->job_number}",
            'ip_address' => $request->ip(),
            'user_agent' => $request->userAgent(),
        ]);

        return response()->json([
            'success' => true,
            'message' => "Print job {$printJob->job_number} cancelled",
            'data' => $printJob,
        ]);
    }

    /**
     * Reprint an existing job.
     */
    public function reprint(Request $request, PrintJob $printJob): JsonResponse
    {
        $user = $request->user();
        $datePrefix = date('Ymd');
        $randomSuffix = strtoupper(Str::random(4));
        $newJobNumber = "PRN-{$datePrefix}-{$randomSuffix}-R";

        DB::beginTransaction();
        try {
            $newJob = PrintJob::create([
                'job_number' => $newJobNumber,
                'company_id' => $printJob->company_id,
                'branch_id' => $printJob->branch_id,
                'user_id' => $user?->id,
                'printer_profile_id' => $printJob->printer_profile_id,
                'printer_name' => $printJob->printer_name,
                'template_id' => $printJob->template_id,
                'template_name' => $printJob->template_name,
                'total_labels' => $printJob->total_labels,
                'printed_labels' => 0,
                'status' => 'queued',
                'ip_address' => $request->ip(),
                'user_agent' => $request->userAgent(),
            ]);

            foreach ($printJob->items as $item) {
                PrintJobItem::create([
                    'print_job_id' => $newJob->id,
                    'product_id' => $item->product_id,
                    'product_name' => $item->product_name,
                    'sku' => $item->sku,
                    'barcode' => $item->barcode,
                    'sale_price' => $item->sale_price,
                    'quantity' => $item->quantity,
                    'extra_data' => $item->extra_data,
                ]);
            }

            AuditLog::create([
                'user_id' => $user?->id,
                'user_name' => $user?->name ?? 'System',
                'user_email' => $user?->email ?? 'operator@nixaerp.in',
                'module' => 'Thermal Printing',
                'action' => 'Reprint Job',
                'status' => 'success',
                'message' => "Reprinted job {$printJob->job_number} as {$newJobNumber}",
                'ip_address' => $request->ip(),
                'user_agent' => $request->userAgent(),
            ]);

            DB::commit();

            return response()->json([
                'success' => true,
                'message' => "Reprint job {$newJobNumber} created",
                'data' => $newJob->load('items'),
            ], 201);
        } catch (\Throwable $e) {
            DB::rollBack();
            return response()->json([
                'success' => false,
                'message' => 'Failed to create reprint: ' . $e->getMessage(),
            ], 500);
        }
    }
}
