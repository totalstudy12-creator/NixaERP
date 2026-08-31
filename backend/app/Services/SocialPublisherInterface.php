<?php

namespace App\Services;

use App\Models\SocialPost;
use App\Models\SocialAccount;

interface SocialPublisherInterface
{
    /**
     * Publish a post to the given social account.
     *
     * @param SocialPost $post
     * @param SocialAccount $account
     * @return bool
     */
    public function publish(SocialPost $post, SocialAccount $account): bool;

    /**
     * Optional: Get the external ID of the last published post.
     */
    public function getLastExternalId(): ?string;

    /**
     * Optional: Delete a post from the platform.
     */
    public function delete(string $externalId): bool;
}