export class SocialMediaService {
  static async publishPost(post, socialProfile) {
    const { platform, accessToken } = socialProfile;
    const { content, mediaUrls, hashtags } = post;

    switch (platform) {
      case 'FACEBOOK':
        return await this.publishToFacebook(accessToken, content, mediaUrls, hashtags);
      
      case 'INSTAGRAM':
        return await this.publishToInstagram(accessToken, content, mediaUrls, hashtags);
      
      case 'TWITTER':
        return await this.publishToTwitter(accessToken, content, mediaUrls, hashtags);
      
      case 'LINKEDIN':
        return await this.publishToLinkedIn(accessToken, content, mediaUrls, hashtags);
      
      // Add other platforms...
      
      default:
        throw new Error(`Platform ${platform} not supported`);
    }
  }

  static async publishToFacebook(accessToken, content, mediaUrls, hashtags) {
    const fullContent = `${content}\n\n${hashtags}`;
    const hasImage = mediaUrls && mediaUrls.length > 0;
    
    const url = hasImage 
      ? `https://graph.facebook.com/v18.0/me/photos`
      : `https://graph.facebook.com/v18.0/me/feed`;

    const body = hasImage
      ? { url: mediaUrls[0], caption: fullContent, access_token: accessToken }
      : { message: fullContent, access_token: accessToken };

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Facebook API error: ${errorText}`);
    }

    const data = await response.json();
    return { platformPostId: data.id || data.post_id };
  }

  static async publishToInstagram(accessToken, content, mediaUrls, hashtags) {
    // Instagram requires container creation for media posts
    if (mediaUrls && mediaUrls.length > 0) {
      // Create media container
      const containerResponse = await fetch(
        `https://graph.facebook.com/v18.0/me/media`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            image_url: mediaUrls[0],
            caption: `${content}\n\n${hashtags}`,
            access_token: accessToken
          })
        }
      );

      const containerData = await containerResponse.json();
      
      // Publish the container
      const publishResponse = await fetch(
        `https://graph.facebook.com/v18.0/me/media_publish`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            creation_id: containerData.id,
            access_token: accessToken
          })
        }
      );

      const publishData = await publishResponse.json();
      return { platformPostId: publishData.id };
    } else {
      // For carousel or other post types
      throw new Error('Instagram media required');
    }
  }

  static async publishToTwitter(accessToken, content, mediaUrls, hashtags) {
    const fullContent = `${content} ${hashtags}`.substring(0, 280);
    
    const response = await fetch(
      'https://api.twitter.com/2/tweets',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`
        },
        body: JSON.stringify({
          text: fullContent
        })
      }
    );

    if (!response.ok) {
      throw new Error('Twitter API error');
    }

    const data = await response.json();
    return { platformPostId: data.data.id };
  }

  static async publishToLinkedIn(accessToken, content, mediaUrls, hashtags) {
    const response = await fetch(
      'https://api.linkedin.com/v2/ugcPosts',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Restli-Protocol-Version': '2.0.0',
          'Authorization': `Bearer ${accessToken}`
        },
        body: JSON.stringify({
          author: `urn:li:person:${socialProfile.platformId}`,
          lifecycleState: 'PUBLISHED',
          specificContent: {
            'com.linkedin.ugc.ShareContent': {
              shareCommentary: {
                text: content
              },
              shareMediaCategory: 'NONE'
            }
          },
          visibility: {
            'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC'
          }
        })
      }
    );

    if (!response.ok) {
      throw new Error('LinkedIn API error');
    }

    const data = await response.json();
    return { platformPostId: data.id };
  }
}