<?php

use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;

/*
|--------------------------------------------------------------------------
| Application Bootstrap
|--------------------------------------------------------------------------
|
| Laravel 12 application configuration.
|
| Important:
| APP_KEY must be defined in .env for production.
| We do NOT generate a runtime APP_KEY because doing so can invalidate
| encrypted sessions/cookies when the application restarts.
|
*/

return Application::configure(
    basePath: dirname(__DIR__)
)
    ->withRouting(
        web: __DIR__ . '/../routes/web.php',
        api: __DIR__ . '/../routes/api.php',
        commands: __DIR__ . '/../routes/console.php',
        health: '/up',
    )

    /*
    |--------------------------------------------------------------------------
    | Middleware
    |--------------------------------------------------------------------------
    */

    ->withMiddleware(function (
        Middleware $middleware
    ): void {

        /*
         * Existing API CORS middleware.
         *
         * MCP uses the same API pipeline and therefore inherits
         * the existing CORS configuration.
         */
        $middleware->api(
            prepend: [
                \App\Http\Middleware\AllowCors::class,
            ]
        );

        /*
         * NOTE:
         *
         * Do NOT add:
         *
         *     abilities
         *
         * here.
         *
         * We are intentionally handling MCP ability authorization
         * inside McpController until a dedicated MCP middleware is
         * introduced and tested.
         */
    })

    /*
    |--------------------------------------------------------------------------
    | Exceptions
    |--------------------------------------------------------------------------
    */

    ->withExceptions(function (
        Exceptions $exceptions
    ): void {

        /*
         * Keep the application's existing exception handling.
         *
         * MCP controllers return controlled JSON errors and should
         * never expose raw exception messages to external clients.
         */
    })

    ->create();