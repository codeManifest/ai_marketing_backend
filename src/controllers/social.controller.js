import { prisma } from '../config/db.js';
import { getPlatformConfig } from '../services/social-config.js';
import { decrypt } from '../utils/crypto.js';
import { AIService } from '../services/ai-service.js';
import crypto from 'crypto';

/**
 * GET /api/social/connect
 * Initiates OAuth connection for a social platform.
 */
export async function connectSocial(req, res) {
  try {
    const { platform, workspaceId } = req.query;

    if (!platform || !workspaceId) {
      return res.status(400).json({ error: "Platform and workspace ID are required" });
    }

    const platformConfig = getPlatformConfig(platform);
    
    // Check for workspace custom developer credentials
    const customCred = await prisma.socialCredential.findUnique({
      where: {
        workspaceId_platform: {
          workspaceId,
          platform
        }
      }
    });

    if (!customCred) {
      return res.status(400).json({ 
        error: "Developer API Credentials not configured. Please add your App ID & App Secret in the settings panel above first." 
      });
    }

    const activeClientId = customCred.clientId;
    let activeClientSecret = null;

    try {
      activeClientSecret = decrypt(customCred.clientSecret);
    } catch (decErr) {
      console.error("Failed to decrypt custom secret:", decErr);
    }
    
    // Generate state parameter for security
    const state = Buffer.from(JSON.stringify({
      userId: req.user.id,
      workspaceId,
      platform,
      timestamp: Date.now()
    })).toString('base64');

    const isPlaceholder = (id) => {
      if (!id) return true;
      const lower = id.toLowerCase();
      return lower.includes('placeholder') || lower.includes('your_') || lower.includes('client_id') || lower.includes('app_id') || lower.includes('here') || lower === 'your-app-id' || lower === 'your-app-secret';
    };

    if (!activeClientId || isPlaceholder(activeClientId)) {
      // Direct simulator redirect for developers/testers to easily test connection without configuring API keys!
      const callbackUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/api/social/callback?code=simulated_code&state=${state}`;
      return res.json({
        success: true,
        authUrl: callbackUrl,
        platform,
        state
      });
    }

    const params = new URLSearchParams({
      client_id: activeClientId,
      redirect_uri: `${process.env.FRONTEND_URL}/api/social/callback`, // Redirect via frontend client proxy or directly
      response_type: 'code',
      scope: platformConfig.scope,
      state: state,
      ...(platform === 'TWITTER' && { code_challenge: 'challenge', code_challenge_method: 'plain' }),
      ...(platform === 'GOOGLE_MY_BUSINESS' || platform === 'YOUTUBE' ? { access_type: 'offline', prompt: 'consent' } : {})
    });

    const authUrl = `${platformConfig.authUrl}?${params.toString()}`;

    return res.json({
      success: true,
      authUrl,
      platform,
      state
    });

  } catch (error) {
    console.error("Error initiating social connection:", error);
    return res.status(500).json({ error: error.message || "Internal server error" });
  }
}

/**
 * GET /api/social/callback
 * Handles OAuth callback and profile creation.
 */
export async function callbackSocial(req, res) {
  let state = req.query.state;
  try {
    const { code, error } = req.query;

    if (error) {
      return res.redirect(`${process.env.FRONTEND_URL}/social/connect?error=${error}`);
    }

    if (!code || !state) {
      return res.redirect(`${process.env.FRONTEND_URL}/social/connect?error=invalid_callback`);
    }

    // Verify state parameter
    let stateData;
    try {
      stateData = JSON.parse(Buffer.from(state, 'base64').toString());
    } catch (e) {
      return res.redirect(`${process.env.FRONTEND_URL}/social/connect?error=invalid_state`);
    }

    const { platform, workspaceId, userId, timestamp } = stateData;

    // Check if state is expired (10 minutes)
    if (Date.now() - timestamp > 10 * 60 * 1000) {
      return res.redirect(`${process.env.FRONTEND_URL}/social/connect?error=state_expired`);
    }

    const platformConfig = getPlatformConfig(platform);
    
    // Check for workspace custom developer credentials
    const customCred = await prisma.socialCredential.findUnique({
      where: {
        workspaceId_platform: {
          workspaceId,
          platform
        }
      }
    });

    if (customCred) {
      platformConfig.clientId = customCred.clientId;
      try {
        platformConfig.clientSecret = decrypt(customCred.clientSecret);
      } catch (decErr) {
        console.error("Failed to decrypt custom secret in callback:", decErr);
      }
    } else {
      throw new Error("Developer API Credentials not configured for this workspace");
    }

    const redirectUri = `${process.env.FRONTEND_URL}/api/social/callback`;

    // Exchange code for access token
    const tokenData = await exchangeCodeForToken(platform, code, platformConfig, redirectUri);
    
    if (!tokenData.access_token) {
      throw new Error('Failed to get access token');
    }

    // Get user profile from platform
    const profile = await getSocialProfile(platform, tokenData.access_token, platformConfig);
    
    // Save social profile to database
    await saveSocialProfile({
      platform,
      workspaceId,
      userId,
      profile,
      tokenData
    });

    return res.redirect(
      `${process.env.FRONTEND_URL}/workspaces/${workspaceId}/social?connected=true&platform=${platform}`
    );

  } catch (error) {
    console.error("Error in social callback:", error);
    let fallbackWorkspaceId = null;
    if (state) {
      try {
        const decoded = JSON.parse(Buffer.from(state, 'base64').toString());
        fallbackWorkspaceId = decoded.workspaceId;
      } catch (_) {}
    }
    const redirectUrl = fallbackWorkspaceId 
      ? `${process.env.FRONTEND_URL}/workspaces/${fallbackWorkspaceId}/social?error=connection_failed`
      : `${process.env.FRONTEND_URL}/workspaces`;
    return res.redirect(redirectUrl);
  }
}

/**
 * GET /api/webhooks/social
 * Facebook Webhook Verification Endpoint
 */
export async function verifyWebhook(req, res) {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];
  const workspaceId = req.query["workspaceId"];

  if (mode && token) {
    if (mode === "subscribe") {
      let expectedVerifyToken = process.env.META_WEBHOOK_VERIFY_TOKEN || "postly_secret_verify_token";

      // If workspaceId is supplied, lookup verify token
      if (workspaceId) {
        try {
          const workspace = await prisma.workspace.findUnique({
            where: { id: workspaceId }
          });
          if (workspace) {
            const settings = typeof workspace.settings === 'string'
              ? JSON.parse(workspace.settings)
              : workspace.settings || {};
            
            if (settings.webhookVerifyToken) {
              expectedVerifyToken = settings.webhookVerifyToken;
            } else {
              // Fallback to computed HMAC
              const credential = await prisma.socialCredential.findFirst({
                where: {
                  workspaceId,
                  platform: "FACEBOOK"
                }
              });

              if (credential && credential.clientSecret) {
                const decryptedSecret = decrypt(credential.clientSecret);
                expectedVerifyToken = crypto
                  .createHmac("sha256", decryptedSecret)
                  .update(workspaceId)
                  .digest("hex")
                  .substring(0, 32);
              }
            }
          }
        } catch (err) {
          console.error("Failed to compute dynamic verify token for workspace:", workspaceId, err);
        }
      }

      if (token === expectedVerifyToken) {
        console.log(`✅ Meta Webhook verified successfully for workspace: ${workspaceId || "global"}`);
        return res.status(200).send(challenge);
      } else {
        console.warn(`❌ Meta Webhook token mismatch. Received: "${token}", Expected: "${expectedVerifyToken}"`);
        return res.status(403).send("Forbidden");
      }
    }
  }
  return res.status(400).send("Bad Request");
}

/**
 * POST /api/webhooks/social
 * Receives incoming social webhooks
 */
export async function processWebhook(req, res) {
  try {
    const payload = req.body;
    console.log("📥 Webhook event received:", JSON.stringify(payload, null, 2));

    // Handle Facebook/Instagram page updates
    if (payload.object === "page") {
      const entry = payload.entry?.[0];
      const change = entry?.changes?.[0];
      const changeValue = change?.value;

      if (change?.field === "feed" && changeValue?.item === "comment" && changeValue?.verb === "add") {
        const commentContent = changeValue.message;
        const authorName = changeValue.from?.name || "Anonymous User";
        const authorId = changeValue.from?.id;
        const commentPlatformId = changeValue.comment_id;
        const parentPostPlatformId = changeValue.post_id;

        console.log(`💬 New comment webhook: "${commentContent}" on post ${parentPostPlatformId}`);

        // Locate post in DB
        const dbPost = await prisma.post.findFirst({
          where: { postId: parentPostPlatformId },
          include: { socialProfile: true }
        });

        if (dbPost) {
          // Insert comment in DB
          const newComment = await prisma.comment.create({
            data: {
              postId: dbPost.id,
              platformId: commentPlatformId,
              authorId: authorId,
              authorName: authorName,
              content: commentContent,
              replied: false,
              replySuggested: `Hi ${authorName}! Thanks for reaching out. Let us know if you need any support.`
            }
          });

          // Autopilot logic
          if (dbPost.socialProfile?.autoRespond) {
            console.log(`🤖 Auto-respond active for profile. Generating reply for comment...`);
            let autoReplyMessage = "";
            try {
              AIService.init("gemini");
              const prompt = `You are a helpful social media brand manager. Write a friendly response to this user comment.
Post content: "${dbPost.content}"
Comment: "${commentContent}"
Author: "${authorName}"
Keep the reply natural and under 250 characters. Return ONLY the reply text.`;
              
              const aiText = await AIService.generateContent(prompt);
              if (aiText) autoReplyMessage = aiText.trim();
            } catch (aiErr) {
              console.error("Gemini failed, using fallback auto reply template:", aiErr);
              autoReplyMessage = `Thanks for the comment, ${authorName}! We appreciate your feedback! ❤️`;
            }

            // Post reply live back to Facebook
            if (autoReplyMessage && dbPost.socialProfile.accessToken) {
              const fbReplyUrl = `https://graph.facebook.com/v18.0/${commentPlatformId}/comments`;
              const fbRes = await fetch(fbReplyUrl, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  message: autoReplyMessage,
                  access_token: dbPost.socialProfile.accessToken
                })
              });

              if (fbRes.ok) {
                // Update comment status
                await prisma.comment.update({
                  where: { id: newComment.id },
                  data: { replied: true }
                });

                // Save Reply log
                await prisma.reply.create({
                  data: {
                    workspaceId: dbPost.workspaceId,
                    socialProfileId: dbPost.socialProfileId,
                    originalMessage: commentContent,
                    aiReply: autoReplyMessage,
                    platform: dbPost.platform,
                    platformPostId: dbPost.id,
                    platformUserId: authorId,
                    category: 'COMMENT',
                    status: 'SENT',
                    sentAt: new Date()
                  }
                });
                console.log(`✅ Webhook autopilot replied: "${autoReplyMessage}"`);
              } else {
                console.error("Failed to post comment reply to Graph API:", await fbRes.text());
              }
            }
          }
        }
      }
    }

    return res.json({ success: true });
  } catch (error) {
    console.error("Error processing webhook:", error);
    return res.status(500).json({ error: "Webhook processing failed" });
  }
}

// OAuth Helpers
async function exchangeCodeForToken(platform, code, platformConfig, redirectUri) {
  if (code === 'simulated_code') {
    return {
      access_token: 'simulated_access_token_' + Math.random().toString(36).substring(7),
      expires_in: 3600,
      refresh_token: 'simulated_refresh_token'
    };
  }

  if (!platformConfig.clientId || !platformConfig.clientSecret) {
    throw new Error(`API Client credentials not set for ${platform}`);
  }

  const tokenParams = new URLSearchParams({
    client_id: platformConfig.clientId,
    client_secret: platformConfig.clientSecret,
    code,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
    ...(platform === 'TWITTER' && { code_verifier: 'challenge' })
  });

  const response = await fetch(platformConfig.tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: tokenParams.toString()
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Token exchange failed: ${errorText}`);
  }

  return await response.json();
}

async function getSocialProfile(platform, accessToken, platformConfig) {
  if (accessToken.startsWith('simulated_access_token_')) {
    return {
      id: `${platform.toLowerCase()}_${Math.random().toString(36).substring(7)}`,
      name: `Growthly ${platform.charAt(0) + platform.slice(1).toLowerCase()}`,
      username: `growthly_${platform.toLowerCase()}_user`,
      profilePicture: null,
      followersCount: 1540
    };
  }

  let profileUrl = platformConfig.profileUrl;
  let headers = {
    'Authorization': `Bearer ${accessToken}`
  };

  switch (platform) {
    case 'FACEBOOK':
      const fbPagesRes = await fetch(
        `https://graph.facebook.com/v18.0/me/accounts?access_token=${accessToken}`
      );
      if (!fbPagesRes.ok) {
        throw new Error('Failed to fetch Facebook pages');
      }
      const fbPagesData = await fbPagesRes.json();
      if (fbPagesData.data && fbPagesData.data.length > 0) {
        const page = fbPagesData.data[0];
        const pageDetailRes = await fetch(
          `https://graph.facebook.com/v18.0/${page.id}?fields=id,name,picture&access_token=${page.access_token}`
        );
        const pageDetail = pageDetailRes.ok ? await pageDetailRes.json() : page;
        
        return {
          id: page.id,
          name: page.name,
          username: page.name,
          profilePicture: `https://graph.facebook.com/${page.id}/picture?type=large`,
          pageAccessToken: page.access_token
        };
      }
      throw new Error('No Facebook Pages found for this account. You must manage at least one Facebook Page to connect.');
    case 'INSTAGRAM':
      const pagesResponse = await fetch(
        `https://graph.facebook.com/v18.0/me/accounts?access_token=${accessToken}`
      );
      const pagesData = await pagesResponse.json();
      if (pagesData.data && pagesData.data.length > 0) {
        const pageId = pagesData.data[0].id;
        const instagramResponse = await fetch(
          `https://graph.facebook.com/v18.0/${pageId}?fields=instagram_business_account&access_token=${accessToken}`
        );
        const instagramData = await instagramResponse.json();
        if (instagramData.instagram_business_account) {
          const igAccountId = instagramData.instagram_business_account.id;
          const igProfileResponse = await fetch(
            `https://graph.facebook.com/v18.0/${igAccountId}?fields=username,profile_picture_url,followers_count&access_token=${accessToken}`
          );
          const igData = await igProfileResponse.json();
          return parseProfileData('INSTAGRAM', igData);
        }
      }
      throw new Error('No Instagram account found for connected Facebook page');
    
    case 'LINKEDIN':
      headers = { ...headers, 'X-Restli-Protocol-Version': '2.0.0' };
      break;
    
    case 'GOOGLE_MY_BUSINESS':
      profileUrl = 'https://mybusiness.googleapis.com/v4/accounts';
      break;
    
    case 'TWITTER':
      profileUrl = `${platformConfig.profileUrl}?user.fields=id,name,username,profile_image_url`;
      break;
    
    case 'TIKTOK':
      profileUrl = `${platformConfig.profileUrl}?fields=open_id,union_id,avatar_url,display_name`;
      break;
    
    case 'PINTEREST':
      profileUrl = platformConfig.profileUrl;
      break;
    
    case 'YOUTUBE':
      profileUrl = 'https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&mine=true';
      break;
  }

  const response = await fetch(profileUrl, { headers });
  
  if (!response.ok) {
    throw new Error(`Failed to fetch profile: ${response.statusText}`);
  }

  const data = await response.json();
  return parseProfileData(platform, data);
}

function parseProfileData(platform, data) {
  switch (platform) {
    case 'FACEBOOK':
      return {
        id: data.id,
        name: data.name,
        email: data.email,
        username: data.name,
        profilePicture: data.picture?.data?.url
      };
    case 'INSTAGRAM':
      return {
        id: data.id,
        name: data.username,
        username: data.username,
        profilePicture: data.profile_picture_url,
        followersCount: data.followers_count
      };
    case 'LINKEDIN':
      return {
        id: data.id,
        name: `${data.localizedFirstName} ${data.localizedLastName}`,
        username: data.localizedFirstName
      };
    case 'GOOGLE_MY_BUSINESS':
      return {
        id: data.accounts[0]?.name,
        name: data.accounts[0]?.accountName,
        username: data.accounts[0]?.accountName
      };
    case 'TWITTER':
      return {
        id: data.data.id,
        name: data.data.name,
        username: data.data.username,
        profilePicture: data.data.profile_image_url
      };
    case 'TIKTOK':
      return {
        id: data.data.user.open_id,
        name: data.data.user.display_name,
        username: data.data.user.display_name,
        profilePicture: data.data.user.avatar_url
      };
    case 'PINTEREST':
      return {
        id: data.username,
        name: data.username,
        username: data.username,
        profilePicture: data.profile_images?.['60x60']?.url
      };
    case 'YOUTUBE':
      return {
        id: data.items[0].id,
        name: data.items[0].snippet.title,
        username: data.items[0].snippet.title,
        profilePicture: data.items[0].snippet.thumbnails.default.url,
        followersCount: data.items[0].statistics?.subscriberCount
      };
    default:
      return data;
  }
}

async function saveSocialProfile({ platform, workspaceId, userId, profile, tokenData }) {
  const token = (platform === 'FACEBOOK' && profile.pageAccessToken) 
    ? profile.pageAccessToken 
    : tokenData.access_token;

  const pic = profile.profilePicture 
    ? (profile.profilePicture.length > 190 ? profile.profilePicture.substring(0, 190) : profile.profilePicture)
    : null;

  return await prisma.socialProfile.create({
    data: {
      workspaceId,
      platform,
      platformId: profile.id,
      name: profile.name,
      username: profile.username,
      email: profile.email,
      accessToken: token,
      refreshToken: tokenData.refresh_token,
      tokenExpiresAt: tokenData.expires_in ? new Date(Date.now() + tokenData.expires_in * 1000) : undefined,
      profilePicture: pic,
      followersCount: profile.followersCount,
      isConnected: true,
      lastSynced: new Date()
    }
  });
}
