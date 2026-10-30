<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Contact;
use App\Models\Customer;
use App\Models\Lead;
use App\Models\LeadActivity;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;

class LeadController extends Controller
{
    /**
     * Display a paginated listing of leads with pipeline filters.
     */
    public function index(Request $request): JsonResponse
    {
        $query = Lead::query()
            ->with(['assignee:id,name,email', 'creator:id,name', 'company:id,name', 'branch:id,name', 'convertedCustomer:id,name,email,phone', 'convertedContact:id,name,email,phone']);

        if ($search = trim((string) $request->input('search', ''))) {
            $query->where(function ($q) use ($search) {
                $q->where('name', 'like', "%{$search}%")
                    ->orWhere('company_name', 'like', "%{$search}%")
                    ->orWhere('email', 'like', "%{$search}%")
                    ->orWhere('phone', 'like', "%{$search}%")
                    ->orWhere('city', 'like', "%{$search}%");
            });
        }

        if ($stage = $request->input('stage')) {
            $query->where('stage', $stage);
        }
        if ($source = $request->input('source')) {
            $query->where('source', $source);
        }
        if ($priority = $request->input('priority')) {
            $query->where('priority', $priority);
        }
        if ($assignedTo = $request->input('assigned_to')) {
            $query->where('assigned_to', $assignedTo);
        }
        if ($companyId = $request->input('company_id')) {
            $query->where('company_id', $companyId);
        }
        if ($branchId = $request->input('branch_id')) {
            $query->where('branch_id', $branchId);
        }

        $sortBy = $request->input('sort_by', 'created_at');
        $sortDir = strtolower($request->input('sort_dir', 'desc')) === 'asc' ? 'asc' : 'desc';
        $allowedSorts = ['id', 'name', 'company_name', 'stage', 'priority', 'expected_value', 'next_follow_up', 'created_at'];

        if (!in_array($sortBy, $allowedSorts, true)) {
            $sortBy = 'created_at';
        }

        $query->orderBy($sortBy, $sortDir)->orderBy('id', 'desc');

        $perPage = max(1, min((int) $request->input('per_page', 25), 100));
        return response()->json($query->paginate($perPage));
    }

    /**
     * Pipeline summary metrics.
     */
    public function summary(Request $request): JsonResponse
    {
        $query = Lead::query();
        if ($companyId = $request->input('company_id')) {
            $query->where('company_id', $companyId);
        }
        if ($branchId = $request->input('branch_id')) {
            $query->where('branch_id', $branchId);
        }

        $totalLeads = (clone $query)->count();
        $stages = ['new', 'contacted', 'qualified', 'quotation_sent', 'negotiation', 'won', 'lost'];
        $stageCounts = [];
        foreach ($stages as $stage) {
            $stageCounts[$stage] = (clone $query)->where('stage', $stage)->count();
        }

        $totalPipelineValue = (float) (clone $query)->whereNotIn('stage', ['lost'])->sum('expected_value');
        $wonValue           = (float) (clone $query)->where('stage', 'won')->sum('expected_value');
        $wonCount           = $stageCounts['won'] ?? 0;
        $conversionRate     = $totalLeads > 0 ? round(($wonCount / $totalLeads) * 100, 1) : 0;

        return response()->json([
            'total_leads'          => $totalLeads,
            'stages'               => $stageCounts,
            'total_pipeline_value' => round($totalPipelineValue, 2),
            'won_value'            => round($wonValue, 2),
            'conversion_rate'      => $conversionRate,
            'needs_follow_up'      => (clone $query)->whereDate('next_follow_up', '<=', now()->toDateString())->whereNotIn('stage', ['won', 'lost'])->count(),
        ]);
    }

    /**
     * Store a newly created lead.
     */
    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'company_id'     => 'required|exists:companies,id',
            'branch_id'      => 'nullable|exists:branches,id',
            'name'           => 'required|string|max:255',
            'company_name'   => 'nullable|string|max:255',
            'email'          => 'nullable|email|max:255',
            'phone'          => 'nullable|string|max:30',
            'whatsapp'       => 'nullable|string|max:30',
            'source'         => 'nullable|string|in:website,referral,walk_in,social_media,campaign,cold_call,partner,other',
            'stage'          => 'nullable|string|in:new,contacted,qualified,quotation_sent,negotiation,won,lost',
            'priority'       => 'nullable|string|in:low,medium,high,urgent',
            'expected_value' => 'nullable|numeric|min:0',
            'assigned_to'    => 'nullable|exists:users,id',
            'city'           => 'nullable|string|max:100',
            'state'          => 'nullable|string|max:100',
            'address'        => 'nullable|string',
            'notes'          => 'nullable|string',
            'next_follow_up' => 'nullable|date',
        ]);

        $lead = DB::transaction(function () use ($validated) {
            $lead = Lead::create([
                'company_id'     => $validated['company_id'],
                'branch_id'      => $validated['branch_id'] ?? null,
                'name'           => $validated['name'],
                'company_name'   => $validated['company_name'] ?? null,
                'email'          => $validated['email'] ?? null,
                'phone'          => $validated['phone'] ?? null,
                'whatsapp'       => $validated['whatsapp'] ?? null,
                'source'         => $validated['source'] ?? 'website',
                'stage'          => $validated['stage'] ?? 'new',
                'priority'       => $validated['priority'] ?? 'medium',
                'expected_value' => $validated['expected_value'] ?? 0,
                'assigned_to'    => $validated['assigned_to'] ?? null,
                'city'           => $validated['city'] ?? null,
                'state'          => $validated['state'] ?? null,
                'address'        => $validated['address'] ?? null,
                'notes'          => $validated['notes'] ?? null,
                'next_follow_up' => $validated['next_follow_up'] ?? null,
                'created_by'     => Auth::id(),
            ]);

            // Initial activity log
            $lead->activities()->create([
                'user_id'       => Auth::id(),
                'activity_type' => 'status_change',
                'title'         => 'Lead Created',
                'description'   => "Lead created at '{$lead->stage}' stage via {$lead->source}.",
                'activity_date' => now(),
            ]);

            return $lead->load(['assignee', 'creator']);
        });

        return response()->json([
            'success' => true,
            'message' => 'Lead created successfully',
            'data'    => $lead,
        ], 201);
    }

    /**
     * Show lead details with activities and conversions.
     */
    public function show(int $id): JsonResponse
    {
        $lead = Lead::with([
            'assignee:id,name,email',
            'creator:id,name,email',
            'company',
            'branch',
            'convertedCustomer',
            'convertedContact',
            'activities.user:id,name',
            'opportunities',
        ])->findOrFail($id);

        return response()->json([
            'success' => true,
            'data'    => $lead,
        ]);
    }

    /**
     * Update lead details.
     */
    public function update(Request $request, int $id): JsonResponse
    {
        $lead = Lead::findOrFail($id);

        $validated = $request->validate([
            'name'           => 'required|string|max:255',
            'company_name'   => 'nullable|string|max:255',
            'email'          => 'nullable|email|max:255',
            'phone'          => 'nullable|string|max:30',
            'whatsapp'       => 'nullable|string|max:30',
            'source'         => 'nullable|string|in:website,referral,walk_in,social_media,campaign,cold_call,partner,other',
            'stage'          => 'nullable|string|in:new,contacted,qualified,quotation_sent,negotiation,won,lost',
            'priority'       => 'nullable|string|in:low,medium,high,urgent',
            'expected_value' => 'nullable|numeric|min:0',
            'assigned_to'    => 'nullable|exists:users,id',
            'city'           => 'nullable|string|max:100',
            'state'          => 'nullable|string|max:100',
            'address'        => 'nullable|string',
            'notes'          => 'nullable|string',
            'lost_reason'    => 'nullable|string',
            'next_follow_up' => 'nullable|date',
        ]);

        $oldStage = $lead->stage;
        $newStage = $validated['stage'] ?? $oldStage;

        $lead->update($validated);

        if ($oldStage !== $newStage) {
            $lead->activities()->create([
                'user_id'       => Auth::id(),
                'activity_type' => 'status_change',
                'title'         => 'Stage Changed',
                'description'   => "Pipeline stage moved from '{$oldStage}' to '{$newStage}'.",
                'activity_date' => now(),
            ]);
        }

        return response()->json([
            'success' => true,
            'message' => 'Lead updated successfully',
            'data'    => $lead->load('assignee'),
        ]);
    }

    /**
     * Update lead stage (Kanban drop or quick action).
     */
    public function updateStage(Request $request, int $id): JsonResponse
    {
        $lead = Lead::findOrFail($id);

        $validated = $request->validate([
            'stage'       => 'required|in:new,contacted,qualified,quotation_sent,negotiation,won,lost',
            'lost_reason' => 'nullable|string|max:500',
            'note'        => 'nullable|string',
        ]);

        $oldStage = $lead->stage;
        $lead->stage = $validated['stage'];
        if ($validated['stage'] === 'lost') {
            $lead->lost_reason = $validated['lost_reason'] ?? $lead->lost_reason;
        }
        $lead->save();

        $lead->activities()->create([
            'user_id'       => Auth::id(),
            'activity_type' => 'status_change',
            'title'         => "Moved to " . ucfirst(str_replace('_', ' ', $validated['stage'])),
            'description'   => $validated['note'] ?? "Lead stage changed from '{$oldStage}' to '{$validated['stage']}'.",
            'activity_date' => now(),
        ]);

        return response()->json([
            'success' => true,
            'message' => "Lead moved to {$validated['stage']}",
            'data'    => $lead,
        ]);
    }

    /**
     * Add activity / note / follow-up to lead timeline.
     */
    public function addActivity(Request $request, int $id): JsonResponse
    {
        $lead = Lead::findOrFail($id);

        $validated = $request->validate([
            'activity_type'  => 'required|in:call,meeting,note,email,whatsapp,status_change,quotation',
            'title'          => 'required|string|max:255',
            'description'    => 'nullable|string',
            'activity_date'  => 'nullable|date',
            'follow_up_date' => 'nullable|date',
        ]);

        $activity = $lead->activities()->create([
            'user_id'        => Auth::id(),
            'activity_type'  => $validated['activity_type'],
            'title'          => $validated['title'],
            'description'    => $validated['description'] ?? null,
            'activity_date'  => $validated['activity_date'] ?? now(),
            'follow_up_date' => $validated['follow_up_date'] ?? null,
        ]);

        if (!empty($validated['follow_up_date'])) {
            $lead->next_follow_up = $validated['follow_up_date'];
            $lead->save();
        }

        return response()->json([
            'success'  => true,
            'message'  => 'Activity logged successfully',
            'activity' => $activity->load('user:id,name'),
        ], 201);
    }

    /**
     * Convert Lead to Customer and/or Contact.
     */
    public function convert(Request $request, int $id): JsonResponse
    {
        $lead = Lead::findOrFail($id);

        $validated = $request->validate([
            'create_customer' => 'nullable|boolean',
            'create_contact'  => 'nullable|boolean',
            'customer_name'   => 'nullable|string|max:255',
            'gstin'           => 'nullable|string|max:25',
            'pan'             => 'nullable|string|max:25',
        ]);

        $createCustomer = $validated['create_customer'] ?? true;
        $createContact  = $validated['create_contact'] ?? true;

        $result = DB::transaction(function () use ($lead, $createCustomer, $createContact, $validated) {
            $customer = null;
            $contact  = null;

            // 1. Create or link Customer
            if ($createCustomer) {
                $customerName = (!empty($validated['customer_name']) ? $validated['customer_name'] : ($lead->company_name ?: $lead->name));

                // Look for existing customer with same phone/email
                $existing = Customer::where('company_id', $lead->company_id)
                    ->where(function ($q) use ($lead) {
                        if ($lead->email) $q->where('email', $lead->email);
                        if ($lead->phone) $q->orWhere('phone', $lead->phone);
                    })->first();

                if ($existing) {
                    $customer = $existing;
                } else {
                    $customer = Customer::create([
                        'company_id'      => $lead->company_id,
                        'branch_id'       => $lead->branch_id,
                        'name'            => $customerName,
                        'contact_person'  => $lead->name,
                        'email'           => $lead->email,
                        'phone'           => $lead->phone,
                        'contact_no'      => $lead->whatsapp ?: $lead->phone,
                        'billing_street'  => $lead->address,
                        'billing_city'    => $lead->city,
                        'billing_state'   => $lead->state,
                        'gst_number'      => $validated['gstin'] ?? null,
                        'pan'             => $validated['pan'] ?? null,
                        'status'          => 'active',
                        'is_active'       => true,
                    ]);
                }
            }

            // 2. Create or link Contact
            if ($createContact) {
                $contact = Contact::create([
                    'company_id'      => $lead->company_id,
                    'branch_id'       => $lead->branch_id,
                    'name'            => $lead->name,
                    'company_name'    => $lead->company_name,
                    'email'           => $lead->email,
                    'phone'           => $lead->phone,
                    'alt_phone'       => $lead->whatsapp,
                    'contact_type'    => 'customer',
                    'customer_id'     => $customer?->id,
                    'billing_address' => $lead->address,
                    'city'            => $lead->city,
                    'state'           => $lead->state,
                    'notes'           => $lead->notes,
                    'created_by'      => Auth::id(),
                ]);
            }

            // Mark lead as won and converted
            $lead->update([
                'stage'                 => 'won',
                'converted_customer_id' => $customer?->id,
                'converted_contact_id'  => $contact?->id,
                'converted_at'          => now(),
            ]);

            $lead->activities()->create([
                'user_id'       => Auth::id(),
                'activity_type' => 'status_change',
                'title'         => 'Lead Converted',
                'description'   => "Lead successfully converted to Customer" . ($customer ? " (#{$customer->id} {$customer->name})" : "") . ($contact ? " and Contact (#{$contact->id} {$contact->name})" : ""),
                'activity_date' => now(),
            ]);

            return [
                'lead'     => $lead->fresh(['convertedCustomer', 'convertedContact']),
                'customer' => $customer,
                'contact'  => $contact,
            ];
        });

        return response()->json([
            'success'  => true,
            'message'  => 'Lead successfully converted',
            'data'     => $result,
        ]);
    }

    /**
     * Delete a lead.
     */
    public function destroy(int $id): JsonResponse
    {
        $lead = Lead::findOrFail($id);
        $lead->delete();

        return response()->json([
            'success' => true,
            'message' => 'Lead deleted successfully',
        ]);
    }
}
