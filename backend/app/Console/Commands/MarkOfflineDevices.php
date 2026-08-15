<?php

namespace App\Console\Commands;

use App\Models\BiometricDevice;
use Illuminate\Console\Command;

class MarkOfflineDevices extends Command
{
    protected $signature = 'devices:mark-offline';
    protected $description = 'Mark devices as offline if no heartbeat received within the timeout';

    public function handle()
    {
        $timeout = now()->subMinutes(1); // 2 minutes without a heartbeat = offline

        $affected = BiometricDevice::where('status', 'online')
            ->where('last_sync_at', '<', $timeout)
            ->update(['status' => 'offline']);

        $this->info("Marked {$affected} device(s) as offline.");
    }
}