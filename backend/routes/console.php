<?php

use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');
Schedule::call(function () {
    \App\Models\TwoFactorChallenge::query()
        ->where('expires_at', '<', now()->subDay())
        ->delete();
})->daily();