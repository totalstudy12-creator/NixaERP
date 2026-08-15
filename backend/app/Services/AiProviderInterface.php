<?php

namespace App\Services;

interface AiProviderInterface
{
    /**
     * Send a chat request to provider and return response text and metadata
     * @param array $messages
     * @param array $options
     * @return array ['reply' => string, 'meta' => array]
     */
    public function chat(array $messages, array $options = []): array;

    /**
     * Return provider metadata
     */
    public function info(): array;
}
