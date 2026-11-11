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

// NixaERP Automated Backup & Disaster Recovery Schedule
Schedule::command('backup:run --type=daily')
    ->dailyAt('02:00')
    ->timezone('Asia/Kolkata')
    ->withoutOverlapping(60)
    ->onOneServer();

Schedule::command('backup:verify')
    ->weeklyOn(0, '03:00')
    ->timezone('Asia/Kolkata')
    ->withoutOverlapping(30);

Schedule::command('backup:prune')
    ->dailyAt('04:00')
    ->timezone('Asia/Kolkata')
    ->withoutOverlapping(30);
