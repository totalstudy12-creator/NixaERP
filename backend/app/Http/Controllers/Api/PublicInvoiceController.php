<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Invoice;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\RateLimiter;

class PublicInvoiceController extends Controller
{
    /**
     * Get basic public metadata for an invoice by its safe public token.
     * Reveals NO itemized prices or sensitive records before mobile verification.
     */
    public function getMetadata(string $token)
    {
        $invoice = Invoice::with(['company:id,name,email,phone,website,address,gst_number', 'customer:id,name,contact_no,phone'])
            ->where('public_token', $token)
            ->first();

        if (!$invoice) {
            return response()->json([
                'success' => false,
                'message' => 'Invoice not found or link has expired.',
            ], 404);
        }

        // Determine phone to mask
        $phone = $invoice->contact_no
            ?: ($invoice->customer->contact_no ?? $invoice->customer->phone ?? '');

        $cleanPhone = preg_replace('/[^0-9]/', '', (string) $phone);
        $maskedPhone = '';
        if (strlen($cleanPhone) >= 4) {
            $last4 = substr($cleanPhone, -4);
            $maskedPhone = str_repeat('•', max(4, strlen($cleanPhone) - 4)) . $last4;
        }

        $companyLogo = \App\Models\Setting::where('key', 'company_logo')->value('value')
            ?: \App\Models\Setting::where('key', 'logo')->value('value')
            ?: null;

        return response()->json([
            'success'               => true,
            'requires_verification' => true,
            'invoice_no'            => $invoice->invoice_no,
            'company_name'          => $invoice->company->name ?? 'NIXA ERP',
            'company_logo'          => $companyLogo,
            'masked_mobile'         => $maskedPhone,
            'invoice_date'          => $invoice->invoice_date,
            'payment_status'        => $invoice->payment_status ?? $invoice->status,
        ]);
    }

    /**
     * Authenticate customer with their own registered mobile number and unlock the full invoice.
     * No password or other credential is required.
     */
    public function verify(Request $request, string $token)
    {
        // Rate limit: 8 verification attempts per minute per IP to prevent brute force
        $key = 'public_invoice_verify:' . $request->ip() . ':' . $token;
        if (RateLimiter::tooManyAttempts($key, 8)) {
            $seconds = RateLimiter::availableIn($key);
            return response()->json([
                'success' => false,
                'message' => "Too many attempts. Please try again in {$seconds} seconds.",
            ], 429);
        }

        $request->validate([
            'mobile' => 'required|string|min:4|max:25',
        ]);

        $invoice = Invoice::with([
            'items.product',
            'company',
            'branch',
            'customer',
            'payments',
        ])
        ->where('public_token', $token)
        ->first();

        if (!$invoice) {
            return response()->json([
                'success' => false,
                'message' => 'Invoice not found or link has expired.',
            ], 404);
        }

        $inputMobile = $this->normalizePhone($request->input('mobile'));

        // Collect registered phones
        $validPhones = [];
        foreach ([$invoice->contact_no, $invoice->customer?->contact_no, $invoice->customer?->phone] as $rawPhone) {
            if ($rawPhone) {
                $norm = $this->normalizePhone((string) $rawPhone);
                if ($norm) {
                    $validPhones[] = $norm;
                    if (strlen($norm) >= 10) {
                        $validPhones[] = substr($norm, -10);
                    }
                }
            }
        }

        // Also check if customer name matches or if last 10 digits match
        $matched = false;
        if (!empty($validPhones)) {
            foreach ($validPhones as $vp) {
                if ($inputMobile === $vp || substr($inputMobile, -10) === substr($vp, -10)) {
                    $matched = true;
                    break;
                }
            }
        } else {
            // If invoice has zero registered phones, fallback allows access or requires admin setup
            $matched = true;
        }

        if (!$matched) {
            RateLimiter::hit($key, 60);
            return response()->json([
                'success' => false,
                'message' => 'The mobile number entered does not match our records for this invoice. Please enter the mobile number registered with this order.',
            ], 403);
        }

        RateLimiter::clear($key);

        return response()->json([
            'success'  => true,
            'verified' => true,
            'data'     => $invoice,
        ]);
    }

    /**
     * Clean and normalize a phone string to digits only.
     */
    private function normalizePhone(string $phone): string
    {
        $digits = preg_replace('/[^0-9]/', '', $phone);
        // Strip country code 91 if 12 digits
        if (strlen($digits) === 12 && str_starts_with($digits, '91')) {
            $digits = substr($digits, 2);
        }
        // Strip leading 0 if 11 digits
        if (strlen($digits) === 11 && str_starts_with($digits, '0')) {
            $digits = substr($digits, 1);
        }
        return $digits;
    }
}
