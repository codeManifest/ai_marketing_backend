export const socialPlatforms = {
  FACEBOOK: {
    name: 'Facebook',
    scope: ['pages_manage_posts', 'pages_read_engagement', 'pages_show_list', 'public_profile'].join(','),
    apiVersion: 'v18.0',
    authUrl: 'https://www.facebook.com/v18.0/dialog/oauth',
    tokenUrl: 'https://graph.facebook.com/v18.0/oauth/access_token',
    profileUrl: 'https://graph.facebook.com/v18.0/me'
  },
  INSTAGRAM: {
    name: 'Instagram',
    scope: ['instagram_basic', 'instagram_content_publish', 'pages_show_list'].join(','),
    apiVersion: 'v18.0',
    authUrl: 'https://www.facebook.com/v18.0/dialog/oauth',
    tokenUrl: 'https://graph.facebook.com/v18.0/oauth/access_token',
    profileUrl: 'https://graph.facebook.com/v18.0/me/accounts'
  },
  LINKEDIN: {
    name: 'LinkedIn',
    scope: ['r_liteprofile', 'r_emailaddress', 'w_member_social'].join(' '),
    authUrl: 'https://www.linkedin.com/oauth/v2/authorization',
    tokenUrl: 'https://www.linkedin.com/oauth/v2/accessToken',
    profileUrl: 'https://api.linkedin.com/v2/me'
  },
  GOOGLE_MY_BUSINESS: {
    name: 'Google My Business',
    scope: 'https://www.googleapis.com/auth/business.manage',
    authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    profileUrl: 'https://mybusiness.googleapis.com/v4/accounts'
  },
  TWITTER: {
    name: 'Twitter',
    scope: ['tweet.read', 'tweet.write', 'users.read', 'offline.access'].join(' '),
    authUrl: 'https://twitter.com/i/oauth2/authorize',
    tokenUrl: 'https://api.twitter.com/2/oauth2/token',
    profileUrl: 'https://api.twitter.com/2/users/me'
  },
  TIKTOK: {
    name: 'TikTok',
    scope: ['user.info.basic', 'video.publish'].join(','),
    authUrl: 'https://www.tiktok.com/v2/auth/authorize/',
    tokenUrl: 'https://open.tiktokapis.com/v2/oauth/token/',
    profileUrl: 'https://open.tiktokapis.com/v2/user/info/'
  },
  PINTEREST: {
    name: 'Pinterest',
    scope: ['boards:read', 'boards:write', 'pins:read', 'pins:write'].join(','),
    authUrl: 'https://www.pinterest.com/oauth/',
    tokenUrl: 'https://api.pinterest.com/v5/oauth/token',
    profileUrl: 'https://api.pinterest.com/v5/user_account'
  },
  YOUTUBE: {
    name: 'YouTube',
    scope: 'https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube',
    authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    profileUrl: 'https://www.googleapis.com/youtube/v3/channels'
  }
};

export function getPlatformConfig(platform) {
  const configs = {
    FACEBOOK: {
      clientId: process.env.FACEBOOK_APP_ID,
      clientSecret: process.env.FACEBOOK_APP_SECRET
    },
    INSTAGRAM: {
      clientId: process.env.INSTAGRAM_APP_ID,
      clientSecret: process.env.INSTAGRAM_APP_SECRET
    },
    LINKEDIN: {
      clientId: process.env.LINKEDIN_CLIENT_ID,
      clientSecret: process.env.LINKEDIN_CLIENT_SECRET
    },
    GOOGLE_MY_BUSINESS: {
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET
    },
    TWITTER: {
      clientId: process.env.TWITTER_CLIENT_ID,
      clientSecret: process.env.TWITTER_CLIENT_SECRET
    },
    TIKTOK: {
      clientId: process.env.TIKTOK_CLIENT_KEY,
      clientSecret: process.env.TIKTOK_CLIENT_SECRET
    },
    PINTEREST: {
      clientId: process.env.PINTEREST_APP_ID,
      clientSecret: process.env.PINTEREST_APP_SECRET
    },
    YOUTUBE: {
      clientId: process.env.YOUTUBE_CLIENT_ID,
      clientSecret: process.env.YOUTUBE_CLIENT_SECRET
    }
  };
  
  return {
    ...socialPlatforms[platform],
    ...configs[platform]
  };
}