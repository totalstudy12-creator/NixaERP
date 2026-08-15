<?php

namespace Database\Factories;

use App\Models\BiometricDevice;
use App\Models\Company;
use App\Models\Branch;
use Illuminate\Database\Eloquent\Factories\Factory;

class BiometricDeviceFactory extends Factory
{
    protected $model = BiometricDevice::class;

    public function definition(): array
    {
        return [
            'company_id' => Company::factory(),
            'branch_id' => Branch::factory(),
            'device_uid' => $this->faker->unique()->regexify('ESP32-[A-F0-9]{6}'),
            'name' => $this->faker->randomElement(['Reception', 'Main Gate', 'Factory Floor']),
            'ip_address' => $this->faker->localIpv4,
            'firmware_version' => 'v2.1.4',
            'status' => 'online',
            'last_sync_at' => now(),
            'settings' => json_encode(['sleep_mode' => false, 'scan_timeout' => 5]),
        ];
    }
}