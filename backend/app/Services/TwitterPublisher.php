<?php

namespace App\Services;

use Abraham\TwitterOAuth\TwitterOAuth;
use App\Models\SocialPost;
use App\Models\SocialAccount;

class TwitterPublisher implements SocialPublisherInterface
{
    public function publish(SocialPost $post, SocialAccount $account): bool
    {
        $connection = new TwitterOAuth(
            config('services.twitter.client_id'),
            config('services.twitter.client_secret'),
            decrypt($account->access_token),
            decrypt($account->access_token_secret ?? $account->refresh_token) // adapt
        );

        $params = ['text' => $post->content];
        if ($post->media_path) {
            // Upload media first
            $media = $connection->upload('media/upload', ['media' => $post->media_path]);
            $params['media']['media_ids'] = [$media->media_id_string];
        }

        $result = $connection->post('statuses/update', $params);
        $code = $connection->getLastHttpCode();

        if ($code == 200) {
            // Store external post ID
            $external = $post->external_post_ids ?? [];
            $external['twitter'] = $result->id_str;
            $post->external_post_ids = $external;
            $post->save();
            return true;
        }
        return false;
    }
}