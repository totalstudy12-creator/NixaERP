<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Company;
use Illuminate\Http\Request;
use Illuminate\Http\Response;

class CompanyController extends Controller
{
    /**
     * Display a listing of companies.
     * Returns paginated result with `data` key.
     */
    public function index()
    {
        return Company::orderBy('name')->paginate(15);
    }

    /**
     * Store a newly created company.
     */
    public function store(Request $request)
    {
        $data = $request->validate([
            'name'       => 'required|string|max:255',
            'code'       => 'required|string|max:100|unique:companies,code',
            'email'      => 'nullable|email|max:255',
            'gst_number' => 'nullable|string|max:50',
            'pan_number' => 'nullable|string|max:50',
            'type'       => 'nullable|string|max:100',
            'phone'      => 'nullable|string|max:50',
            'address'    => 'nullable|string',
            'website'    => 'nullable|url|max:255',
            'active'     => 'sometimes|boolean',
        ]);

        $company = Company::create($data);

        return response()->json($company, Response::HTTP_CREATED);
    }

    /**
     * Display the specified company.
     */
    public function show(Company $company)
    {
        return $company;
    }

    /**
     * Update the specified company.
     */
    public function update(Request $request, Company $company)
    {
        $data = $request->validate([
            'name'       => 'required|string|max:255',
            'code'       => 'required|string|max:100|unique:companies,code,' . $company->id,
            'email'      => 'nullable|email|max:255',
            'gst_number' => 'nullable|string|max:50',
            'pan_number' => 'nullable|string|max:50',
            'type'       => 'nullable|string|max:100',
            'phone'      => 'nullable|string|max:50',
            'address'    => 'nullable|string',
            'website'    => 'nullable|url|max:255',
            'active'     => 'sometimes|boolean',
        ]);

        $company->update($data);

        return response()->json($company);
    }

    /**
     * Remove the specified company.
     */
    public function destroy(Company $company)
    {
        $company->delete();

        return response()->noContent();
    }
}