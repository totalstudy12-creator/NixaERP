<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use PhpImap\Mailbox;
use App\Models\Message;

class FetchEmails extends Command
{
    protected $signature = 'emails:fetch';
    protected $description = 'Fetch new emails from IMAP inbox';

    public function handle()
    {
        $mailbox = new Mailbox(
            '{' . env('IMAP_HOST') . ':' . env('IMAP_PORT') . '/' . env('IMAP_ENCRYPTION') . '}INBOX',
            env('IMAP_USERNAME'),
            env('IMAP_PASSWORD')
        );

        $mailsIds = $mailbox->searchMailbox('UNSEEN');
        foreach ($mailsIds as $mailId) {
            $mail = $mailbox->getMail($mailId);
            Message::updateOrCreate(
                ['external_id' => $mailId],
                [
                    'channel' => 'email',
                    'sender' => $mail->fromAddress,
                    'body' => $mail->textPlain ?? $mail->textHtml,
                    'received_at' => $mail->date,
                ]
            );
        }
    }
}