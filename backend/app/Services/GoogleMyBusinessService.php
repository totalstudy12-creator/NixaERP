<?php

namespace App\Services;

use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\Log;

class GoogleMyBusinessService
{
    /**
     * Fetch all locations for the given Google account.
     *
     * @param string|null $encryptedAccessToken
     * @return array
     */
    public function getLocations(?string $encryptedAccessToken): array
    {
        if (!$encryptedAccessToken) {
            return [];
        }

        try {
            $accessToken = Crypt::decryptString($encryptedAccessToken);
        } catch (\Exception $e) {
            Log::warning('Failed to decrypt Google access token: ' . $e->getMessage());
            return [];
        }

        if (!$accessToken) {
            return [];
        }

        try {
            // Get list of accounts
            $accountsResponse = Http::withToken($accessToken)
                ->timeout(10)
                ->get('https://mybusinessaccountmanagement.googleapis.com/v1/accounts');

            if (!$accountsResponse->successful()) {
                Log::warning('Google My Business accounts API failed: ' . $accountsResponse->body());
                return [];
            }

            $accounts = $accountsResponse->json('accounts', []);
            $locations = [];

            foreach ($accounts as $account) {
                $accountName = $account['name'] ?? null;
                if (!$accountName) continue;

                // Get locations for each account
                $locationsResponse = Http::withToken($accessToken)
                    ->timeout(10)
                    ->get("https://mybusinessbusinessinformation.googleapis.com/v1/{$accountName}/locations");

                if ($locationsResponse->successful()) {
                    $rawLocations = $locationsResponse->json('locations', []);
                    foreach ($rawLocations as $loc) {
                        $locations[] = [
                            'id' => $loc['name'] ?? '',
                            'name' => $loc['title'] ?? '',
                            'address' => $loc['storefrontAddress']['addressLines'][0] ?? '',
                        ];
                    }
                } else {
                    Log::warning("Failed to fetch locations for account $accountName: " . $locationsResponse->body());
                }
            }

            return $locations;
        } catch (\Exception $e) {
            Log::error('Google My Business service error: ' . $e->getMessage());
            return [];
        }
    }
}