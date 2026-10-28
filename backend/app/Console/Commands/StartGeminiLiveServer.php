<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Symfony\Component\Process\Process;

class StartGeminiLiveServer extends Command
{
    /**
     * The name and signature of the console command.
     *
     * @var string
     */
    protected $signature = 'gemini:live-server {--port=8008 : Port to listen on}';

    /**
     * The console command description.
     *
     * @var string
     */
    protected $description = 'Start the Gemini Live WebSocket Gateway Server';

    /**
     * Execute the console command.
     */
    public function handle()
    {
        $port = $this->option('port');
        $scriptPath = base_path('gemini-live-server.mjs');

        if (!file_exists($scriptPath)) {
            $this->error("Server script not found at {$scriptPath}");
            return 1;
        }

        $this->info("Starting Gemini Live Gateway on port {$port}...");

        $env = array_merge($_ENV, [
            'GEMINI_LIVE_PORT' => $port,
        ]);

        $process = new Process(['node', $scriptPath], base_path(), $env);
        $process->setTimeout(null);

        $process->run(function ($type, $buffer) {
            $this->output->write($buffer);
        });

        return 0;
    }
}
