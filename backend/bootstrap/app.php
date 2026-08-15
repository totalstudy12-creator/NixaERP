<?php

use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;

// Ensure an application key exists in local/dev environments to avoid
// MissingAppKeyException during development when .env may be incomplete.
if (empty(getenv('APP_KEY')) && empty($_ENV['APP_KEY'] ?? '') && empty($_SERVER['APP_KEY'] ?? '')) {
    try {
        $key = 'base64:' . base64_encode(random_bytes(32));
        putenv("APP_KEY={$key}");
        $_ENV['APP_KEY'] = $key;
        $_SERVER['APP_KEY'] = $key;
    } catch (Throwable $e) {
        // If random_bytes fails, fall back to a simple random string (not ideal for production)
        $key = 'base64:' . base64_encode(substr(bin2hex(random_bytes(16)), 0, 32));
        putenv("APP_KEY={$key}");
        $_ENV['APP_KEY'] = $key;
        $_SERVER['APP_KEY'] = $key;
    }
}

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        $middleware->api(prepend: [
            \App\Http\Middleware\AllowCors::class,
        ]);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        //
    })->create();
