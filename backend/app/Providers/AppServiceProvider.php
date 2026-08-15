<?php

namespace App\Providers;

use Illuminate\Console\Scheduling\Schedule;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        //
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        $this->app->make(Schedule::class)
            ->command('attendance:mark-absent')
            ->dailyAt('00:30')
            ->name('mark-absent-attendance')
            ->withoutOverlapping();

        $this->app->make(Schedule::class)
            ->command('devices:mark-offline')
            ->everyFifteenMinutes()
            ->name('mark-offline-devices')
            ->withoutOverlapping();
    }
}
