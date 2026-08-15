<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\FingerprintTemplate;
use Illuminate\Http\Request;

class FingerprintController extends Controller
{
    public function upload(Request $request)
    {
        $validated = $request->validate([
            'employee_id' => 'required|exists:employees,id',
            'finger_index' => 'required|integer|min:0|max:9',
            'template_data' => 'required|string',
            'quality_score' => 'required|integer|min:0|max:100',
        ]);

        $template = FingerprintTemplate::updateOrCreate(
            [
                'employee_id' => $validated['employee_id'],
                'finger_index' => $validated['finger_index'],
            ],
            [
                'template_data' => base64_decode($validated['template_data']),
                'template_format' => 'raw',
                'size_bytes' => strlen(base64_decode($validated['template_data'])),
            ]
        );

        return response()->json(['message' => 'Template stored', 'id' => $template->id]);
    }

    public function downloadAll(Request $request)
    {
        $validated = $request->validate(['branch_id' => 'required|exists:branches,id']);

        $templates = FingerprintTemplate::whereHas('employee', function ($query) use ($validated) {
            $query->where('branch_id', $validated['branch_id']);
        })->get(['employee_id', 'finger_index', 'template_data']);

        return response()->json($templates);
    }

    public function destroy($id)
    {
        FingerprintTemplate::destroy($id);
        return response()->json(['message' => 'Template deleted']);
    }
}