<?php

namespace App\Services\Publishers;

use App\Services\SocialPublisherInterface;
use App\Models\SocialPost;
use App\Models\SocialAccount;

class FacebookPublisher implements SocialPublisherInterface
{
    protected ?string $lastExternalId = null;

    public function publish(SocialPost $post, SocialAccount $account): bool
    {
        // TODO: Implement Facebook Graph API publishing
        return false;
    }

    public function getLastExternalId(): ?string
    {
        return $this->lastExternalId;
    }

    public function delete(string $externalId): bool
    {
        // TODO: Implement Facebook delete
        return true;
    }
}