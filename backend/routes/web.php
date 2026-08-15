<?php
use Illuminate\Support\Facades\Route;

// Your existing API or other routes can stay here, for example:
// Route::prefix('api')->group(base_path('routes/api.php'));

// Catch-all: serve the React SPA for any URL not matched above
Route::get('/{any}', function () {
    return file_get_contents(public_path('index.html'));
})->where('any', '.*');