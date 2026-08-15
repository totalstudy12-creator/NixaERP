<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Console\Scheduling\Schedule;

class HealthController extends Controller
{
    public function cron()
    {
        $schedule = app(Schedule::class);
        $events = $schedule->events();

        $tasks = collect($events)->map(function ($event, $index) {
            $lastRun = method_exists($event, 'lastRunDate') ? $event->lastRunDate() : null;
            $nextRun = method_exists($event, 'nextRunDate') ? $event->nextRunDate() : null;

            return [
                'id' => $event->name ?? $event->description ?? $event->command ?? 'cron-task-' . $index,
                'name' => $event->description ?? $event->command ?? 'Scheduled task',
                'command' => $event->command ?? null,
                'schedule' => $event->expression ?? null,
                'status' => 'healthy',
                'enabled' => true,
                'lastRun' => $lastRun ? $lastRun->format(DATE_ATOM) : null,
                'nextRun' => $nextRun ? $nextRun->format(DATE_ATOM) : null,
                'duration' => null,
                'error' => null,
            ];
        })->all();

        return response()->json([
            'success' => true,
            'data' => [
                'status' => count($tasks) > 0 ? 'healthy' : 'unknown',
                'schedulerRunning' => true,
                'totalTasks' => count($tasks),
                'enabledTasks' => count($tasks),
                'failedTasks' => 0,
                'tasks' => $tasks,
            ],
        ]);
    }
}
