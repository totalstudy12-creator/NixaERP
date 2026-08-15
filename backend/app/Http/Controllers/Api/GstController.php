<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Cache;

class GstController extends Controller
{
    /**
     * Get GSTIN details from official E-Way Bill / GSTN API.
     *
     * Official API:
     * GET <BASE_URL>/Master/GetGSTINDetails?GSTIN=<GSTIN>
     */
    public function lookup($gstin)
    {
        $gstin = strtoupper(trim($gstin));

        // GSTIN basic validation
        if (!preg_match('/^[0-9A-Z]{15}$/', $gstin)) {
            return response()->json([
                'success' => false,
                'message' => 'Invalid GSTIN format.'
            ], 422);
        }

        try {
            /*
             * The official E-Way Bill API requires:
             *
             * client-id
             * client-secret
             * Gstin
             * authtoken
             *
             * These should be stored in .env.
             */

            $clientId = config('services.gst.client_id');
            $clientSecret = config('services.gst.client_secret');
            $requesterGstin = config('services.gst.gstin');
            $authToken = Cache::get('gst_eway_auth_token');

            if (
                empty($clientId) ||
                empty($clientSecret) ||
                empty($requesterGstin)
            ) {
                return response()->json([
                    'success' => false,
                    'message' => 'GST API credentials are not configured.'
                ], 500);
            }

            if (empty($authToken)) {
                return response()->json([
                    'success' => false,
                    'message' => 'GST API authentication token is missing or expired.'
                ], 401);
            }

            /*
             * Official E-Way Bill API URL.
             *
             * Keep this in .env so you can switch between
             * sandbox/testing and production.
             */
            $baseUrl = rtrim(
                config('services.gst.base_url'),
                '/'
            );

            $url = $baseUrl . '/Master/GetGSTINDetails';

            /*
             * Official request.
             */
            $response = Http::timeout(30)
                ->acceptJson()
                ->withHeaders([
                    'client-id' => $clientId,
                    'client-secret' => $clientSecret,
                    'Gstin' => $requesterGstin,
                    'authtoken' => $authToken,
                ])
                ->get($url, [
                    'GSTIN' => $gstin,
                ]);

            /*
             * HTTP-level failure.
             */
            if ($response->failed()) {
                return response()->json([
                    'success' => false,
                    'message' => 'Unable to connect to GST API.',
                    'http_status' => $response->status(),
                    'api_response' => $response->json()
                ], 502);
            }

            $result = $response->json();

            /*
             * Official API returns:
             *
             * status = 1 -> success
             * status = 0 -> error
             *
             * IMPORTANT:
             * Successful responses from the official API contain
             * encrypted "data", "rek" and "hmac" values.
             *
             * Therefore the response must be decrypted/verified
             * using the current GST/E-Way Bill API encryption
             * implementation before the actual GSTIN JSON can
             * be returned.
             */

            if (($result['status'] ?? '0') !== '1') {
                return response()->json([
                    'success' => false,
                    'message' => 'GSTIN details could not be fetched.',
                    'error' => $result['error'] ?? null
                ], 422);
            }

            /*
             * The official API's successful response contains:
             *
             * data
             * rek
             * hmac
             *
             * Do NOT return these encrypted values directly
             * to your frontend.
             *
             * Pass them through your GST API crypto service.
             */

            $gstData = app(\App\Services\GstApiService::class)
                ->decryptGstinResponse($result);

            if (!$gstData) {
                return response()->json([
                    'success' => false,
                    'message' => 'Unable to decrypt GST API response.'
                ], 502);
            }

            /*
             * Map official GST response to your ERP format.
             */
            $data = [
                'company_name' => $gstData['legalName']
                    ?? $gstData['tradeName']
                    ?? null,

                'trade_name' => $gstData['tradeName']
                    ?? null,

                'legal_name' => $gstData['legalName']
                    ?? null,

                'billing_street' => trim(
                    ($gstData['address1'] ?? '') .
                    ' ' .
                    ($gstData['address2'] ?? '')
                ),

                'billing_city' => $gstData['address2']
                    ?? null,

                'billing_state' => $this->getStateName(
                    $gstData['stateCode'] ?? null
                ),

                'billing_state_code' => $gstData['stateCode']
                    ?? null,

                'billing_pincode' => $gstData['pinCode']
                    ?? null,

                'billing_country' => 'India',

                'registration_type' => $gstData['txpType']
                    ?? null,

                'gstin' => $gstData['gstin']
                    ?? $gstin,

                'gst_status' => $gstData['status']
                    ?? null,

                'blocked_status' => $gstData['blkStatus']
                    ?? null,

                /*
                 * PAN is encoded in the GSTIN:
                 *
                 * GSTIN:
                 * 22ABCDE1234F1Z5
                 *
                 * PAN:
                 * ABCDE1234F
                 */
                'pan' => substr($gstin, 2, 10),
            ];

            /*
             * Cache successful GSTIN lookup.
             */
            Cache::put(
                'gst_lookup_' . $gstin,
                $data,
                now()->addHours(24)
            );

            return response()->json([
                'success' => true,
                'data' => $data
            ]);

        } catch (\Throwable $e) {

            report($e);

            return response()->json([
                'success' => false,
                'message' => 'GST API request failed.',
                'error' => config('app.debug')
                    ? $e->getMessage()
                    : null
            ], 500);
        }
    }

    /**
     * Convert GST state code to state name.
     */
    private function getStateName($stateCode)
    {
        $states = [
            '01' => 'Jammu and Kashmir',
            '02' => 'Himachal Pradesh',
            '03' => 'Punjab',
            '04' => 'Chandigarh',
            '05' => 'Uttarakhand',
            '06' => 'Haryana',
            '07' => 'Delhi',
            '08' => 'Rajasthan',
            '09' => 'Uttar Pradesh',
            '10' => 'Bihar',
            '11' => 'Sikkim',
            '12' => 'Arunachal Pradesh',
            '13' => 'Nagaland',
            '14' => 'Manipur',
            '15' => 'Mizoram',
            '16' => 'Tripura',
            '17' => 'Meghalaya',
            '18' => 'Assam',
            '19' => 'West Bengal',
            '20' => 'Jharkhand',
            '21' => 'Odisha',
            '22' => 'Chhattisgarh',
            '23' => 'Madhya Pradesh',
            '24' => 'Gujarat',
            '25' => 'Daman and Diu',
            '26' => 'Dadra and Nagar Haveli',
            '27' => 'Maharashtra',
            '28' => 'Andhra Pradesh',
            '29' => 'Karnataka',
            '30' => 'Goa',
            '31' => 'Lakshadweep',
            '32' => 'Kerala',
            '33' => 'Tamil Nadu',
            '34' => 'Puducherry',
            '35' => 'Andaman and Nicobar Islands',
            '36' => 'Telangana',
            '37' => 'Andhra Pradesh',
            '38' => 'Ladakh',
        ];

        return $states[$stateCode] ?? $stateCode;
    }
}
