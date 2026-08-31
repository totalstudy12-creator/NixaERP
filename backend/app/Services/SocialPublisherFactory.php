<?php

namespace App\Services;

use App\Services\Publishers\TwitterPublisher;
use App\Services\Publishers\FacebookPublisher;
use App\Services\Publishers\InstagramPublisher;
use App\Services\Publishers\LinkedInPublisher;

class SocialPublisherFactory
{
    public static function make($platform)
    {
        return match ($platform) {
            'twitter' => new TwitterPublisher(),
            'facebook' => new FacebookPublisher(),
            'instagram' => new InstagramPublisher(),
            'linkedin' => new LinkedInPublisher(),
            default => null,
        };
    }
}