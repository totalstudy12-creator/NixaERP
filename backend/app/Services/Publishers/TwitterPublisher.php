<?php

namespace App\Services\Publishers;

use App\Services\SocialPublisherInterface;
use App\Models\SocialPost;
use App\Models\SocialAccount;

class TwitterPublisher implements SocialPublisherInterface
{
    protected ?string $lastExternalId = null;

    public function publish(SocialPost $post, SocialAccount $account): bool
    {
        // TODO: Implement actual Twitter API publishing
        // For now, simulate failure or success
        return false; // Change to true when implemented
    }

    public function getLastExternalId(): ?string
    {
        return $this->lastExternalId;
    }

    public function delete(string $externalId): bool
    {
        // TODO: Implement Twitter delete
        return true;
    }
}