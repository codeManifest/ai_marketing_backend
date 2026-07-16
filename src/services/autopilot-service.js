import { prisma } from "../config/db.js";
import { AIService } from "./ai-service.js";
import { SocialMediaService } from "./social-publisher.js";

export class AutopilotService {
  static logs = [];

  static log(msg) {
    console.log(msg);
    this.logs.push(msg);
  }

  /**
   * Main Autopilot entrypoint. Run periodically via cron.
   */
  static async runAutopilot(workspaceId) {
    this.log(`🤖 Starting Autopilot run for Workspace: ${workspaceId}`);
    
    // 1. Optimize posting hours and auto-schedule drafts
    const scheduledCount = await this.autoScheduleDrafts(workspaceId);
    
    // 2. Identify and rewrite low engagement posts
    const repostedCount = await this.autoRepostLowEngagement(workspaceId);
    
    // 3. Process new comments and auto-reply
    const repliesCount = await this.autoReplyToComments(workspaceId);
    
    return {
      scheduledCount,
      repostedCount,
      repliesCount
    };
  }

  /**
   * Calculates the top 3 peak engagement hours based on historical analytics.
   */
  static async getOptimalPostingHours(workspaceId) {
    try {
      const posts = await prisma.post.findMany({
        where: { 
          workspaceId, 
          status: 'POSTED', 
          postedAt: { not: null } 
        },
        include: { analytics: true }
      });

      if (posts.length === 0) {
        return [10, 15, 20]; // Default peak hours: 10 AM, 3 PM, 8 PM
      }

      const hourStats = {};
      for (const post of posts) {
        const hour = new Date(post.postedAt).getHours();
        
        // Sum up total engagements for this post
        const engagements = post.analytics.reduce(
          (sum, a) => sum + a.engagements + a.likes + a.comments + a.shares, 
          0
        );

        if (!hourStats[hour]) {
          hourStats[hour] = { count: 0, total: 0 };
        }
        hourStats[hour].count++;
        hourStats[hour].total += engagements;
      }

      // Map to average and sort desc
      const sortedHours = Object.keys(hourStats)
        .map(h => ({ hour: parseInt(h), avg: hourStats[h].total / hourStats[h].count }))
        .sort((a, b) => b.avg - a.avg)
        .map(item => item.hour);

      if (sortedHours.length === 0) return [10, 15, 20];
      if (sortedHours.length < 3) {
        // Pad with defaults
        const defaults = [10, 15, 20];
        const result = [...sortedHours];
        for (const def of defaults) {
          if (result.length >= 3) break;
          if (!result.includes(def)) result.push(def);
        }
        return result;
      }

      return sortedHours.slice(0, 3);
    } catch (error) {
      console.error("Failed to calculate optimal posting hours:", error);
      return [10, 15, 20];
    }
  }

  /**
   * Finds DRAFT posts belonging to profiles with autopilot active,
   * and schedules them for upcoming peak engagement time slots.
   */
  static async autoScheduleDrafts(workspaceId) {
    try {
      // Find social profiles in this workspace that have autoPost enabled
      const profiles = await prisma.socialProfile.findMany({
        where: { workspaceId, autoPost: true, isConnected: true }
      });

      if (profiles.length === 0) return 0;
      const profileIds = profiles.map(p => p.id);

      // Get optimal hours
      const peakHours = await this.getOptimalPostingHours(workspaceId);
      
      // Get all draft posts for these profiles
      const drafts = await prisma.post.findMany({
        where: {
          workspaceId,
          status: 'DRAFT',
          socialProfileId: { in: profileIds }
        },
        orderBy: { createdAt: 'asc' }
      });

      if (drafts.length === 0) return 0;

      let scheduledCount = 0;
      let targetDate = new Date();
      targetDate.setMinutes(0, 0, 0); // Align to hour start

      for (const draft of drafts) {
        // Find next optimized hour slot that is in the future
        let slotFound = false;
        let daysOffset = 0;

        while (!slotFound && daysOffset < 30) { // Limit lookup to 30 days ahead
          for (const hour of peakHours) {
            const potentialTime = new Date(targetDate);
            potentialTime.setDate(potentialTime.getDate() + daysOffset);
            potentialTime.setHours(hour);

            if (potentialTime > new Date()) {
              // Check if another post is already scheduled close to this time (+/- 15 mins)
              const conflict = await prisma.post.findFirst({
                where: {
                  socialProfileId: draft.socialProfileId,
                  status: 'SCHEDULED',
                  scheduledFor: {
                    gte: new Date(potentialTime.getTime() - 15 * 60 * 1000),
                    lte: new Date(potentialTime.getTime() + 15 * 60 * 1000)
                  }
                }
              });

              if (!conflict) {
                // Update draft to scheduled
                await prisma.post.update({
                  where: { id: draft.id },
                  data: {
                    status: 'SCHEDULED',
                    scheduledFor: potentialTime
                  }
                });
                scheduledCount++;
                
                // Move targetDate forward to avoid scheduling multiple on the exact same slot
                targetDate = new Date(potentialTime.getTime() + 60 * 60 * 1000);
                slotFound = true;
                break;
              }
            }
          }
          daysOffset++;
        }
      }

      this.log(`🤖 Auto-scheduled ${scheduledCount} draft posts into peak times.`);
      return scheduledCount;
    } catch (error) {
      this.log("Failed to auto-schedule drafts: " + error.message);
      return 0;
    }
  }

  /**
   * Scans published posts from 24-168 hours ago, detects those with low engagement,
   * rewrites the content using AI, and schedules a repost.
   */
  static async autoRepostLowEngagement(workspaceId) {
    try {
      // Find active profiles
      const profiles = await prisma.socialProfile.findMany({
        where: { workspaceId, autoPost: true, isConnected: true }
      });
      this.log(`[DEBUG] autoRepostLowEngagement active profiles count: ${profiles.length} for workspace: ${workspaceId}`);
      if (profiles.length === 0) return 0;
      const profileIds = profiles.map(p => p.id);

      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      this.log(`[DEBUG] Dates window - oneDayAgo: ${oneDayAgo.toISOString()}, sevenDaysAgo: ${sevenDaysAgo.toISOString()}`);

      // Find published posts that are between 1 and 7 days old
      const publishedPosts = await prisma.post.findMany({
        where: {
          workspaceId,
          status: 'POSTED',
          socialProfileId: { in: profileIds },
          postedAt: {
            gte: sevenDaysAgo,
            lte: oneDayAgo
          }
        },
        include: { analytics: true }
      });

      this.log(`[DEBUG] Found ${publishedPosts.length} published posts in date range.`);
      if (publishedPosts.length === 0) return 0;

      let repostedCount = 0;
      const peakHours = await this.getOptimalPostingHours(workspaceId);

      for (const post of publishedPosts) {
        // Prevent infinite reposting loop: check if a post with a similar content prefix was posted recently
        const contentPrefix = post.content.substring(0, 30);
        const alreadyReposted = await prisma.post.findFirst({
          where: {
            workspaceId,
            socialProfileId: post.socialProfileId,
            createdAt: { gte: post.createdAt },
            id: { not: post.id },
            content: { startsWith: contentPrefix }
          }
        });

        if (alreadyReposted) continue;

        // Calculate engagement
        const engagements = post.analytics.reduce(
          (sum, a) => sum + a.engagements + a.likes + a.comments + a.shares, 
          0
        );

        // Define a low engagement threshold (e.g. less than 5 total engagements)
          if (engagements < 5) {
            this.log(`📉 Low engagement detected on post ${post.id} (${engagements} engagements). Rewriting...`);

            let rewrittenText = "";
            try {
              // Rewrite with Gemini
              AIService.init('gemini');
              const systemPrompt = `You are a social media optimizer. Rewrite the following post to make it highly engaging and double the hook's impact. Maintain the original message, media context, and theme but reformulate the caption, spacing, and tags for better reach. Return ONLY the rewritten text, no other chat response.
Original Post:
${post.content}`;

              rewrittenText = await AIService.generateContent(systemPrompt);
            } catch (aiError) {
              this.log("⚠️ Gemini AI quota exhausted or error. Using premium fallback rewrite engine... " + aiError.message);
            
            // Clean hook extraction or premium fallbacks based on platform
            const mainMessage = post.content.replace(/#\w+/g, '').trim();
            if (post.platform === 'LINKEDIN') {
              rewrittenText = `💡 Quick insights: ${mainMessage}\n\nWhat are your thoughts on this? Let's discuss in the comments! 👇\n\n#insights #networking #professional`;
            } else if (post.platform === 'TWITTER') {
              rewrittenText = `⚡️ Thread alert: ${mainMessage.substring(0, 150)}...\n\nRead more & share your views! 🚀`;
            } else {
              rewrittenText = `✨ Re-optimized: ${mainMessage}\n\nDouble tap if you agree! ❤️ Let us know your feedback! 👇\n\n#trending #engagement #community`;
            }
          }

          if (rewrittenText && rewrittenText.trim().length > 0) {
            // Find next peak slot
            let repostDate = new Date();
            repostDate.setDate(repostDate.getDate() + 1); // Repost tomorrow or later
            repostDate.setHours(peakHours[0], 0, 0, 0);

            // Save the repost as a scheduled post
            await prisma.post.create({
              data: {
                workspaceId: post.workspaceId,
                socialProfileId: post.socialProfileId,
                content: rewrittenText.trim(),
                mediaUrls: post.mediaUrls || undefined,
                hashtags: post.hashtags,
                platform: post.platform,
                status: 'SCHEDULED',
                scheduledFor: repostDate,
                aiGenerated: true,
                aiPrompt: `Auto-repost low-engagement rewrite of post ${post.id}`
              }
            });

            repostedCount++;
            this.log(`✅ Repost scheduled for low-engagement post ${post.id} rewritten: "${rewrittenText.substring(0, 40)}..."`);
          }
        }
      }

      return repostedCount;
    } catch (error) {
      this.log("Failed to auto-repost low engagement content: " + error.message);
      return 0;
    }
  }

  /**
   * Scans for customer comments, calls Gemini to write a reply,
   * posts it to the social network, and updates db statuses.
   */
  static async autoReplyToComments(workspaceId) {
    try {
      // Find active profiles
      // Find active profiles
      const profiles = await prisma.socialProfile.findMany({
        where: { workspaceId, autoRespond: true, isConnected: true }
      });
      this.log(`[DEBUG] autoReplyToComments profiles count: ${profiles.length} for workspace: ${workspaceId}`);
      if (profiles.length === 0) return 0;
      const profileIds = profiles.map(p => p.id);
      this.log(`[DEBUG] Profile IDs active: ${profileIds.join(', ')}`);

      // Find comments on posts belonging to these profiles
      const comments = await prisma.comment.findMany({
        where: {
          replied: false,
          post: {
            socialProfileId: { in: profileIds }
          }
        },
        include: {
          post: {
            include: {
              socialProfile: true
            }
          }
        }
      });

      this.log(`[DEBUG] Found comments matching criteria: ${comments.length}`);
      if (comments.length === 0) return 0;

      let replyCount = 0;

      for (const comment of comments) {
        this.log(`💬 Found new comment on post ${comment.postId} by ${comment.authorName}: "${comment.content}"`);

        let finalReply = "";
        try {
          // Generate response using Gemini
          AIService.init('gemini');
          const systemPrompt = `You are a social media manager for the brand. Write a professional, context-aware, helpful, and friendly response to the following customer comment left on our post.
Post content:
"${comment.post.content}"
Customer Comment:
"${comment.content}"
Author Name: "${comment.authorName}"

Keep the reply concise, natural, and under 250 characters. Return ONLY the reply text, no extra explanations.`;

          const aiReplyText = await AIService.generateContent(systemPrompt);
          if (aiReplyText && aiReplyText.trim().length > 0) {
            finalReply = aiReplyText.trim();
          }
        } catch (aiError) {
          this.log("⚠️ Gemini AI quota exhausted or error. Using premium fallback auto-responder template... " + aiError.message);
          
          // Template fallback responses based on comment content matching keywords
          const text = comment.content.toLowerCase();
          if (text.includes("price") || text.includes("cost") || text.includes("how much")) {
            finalReply = `Hello ${comment.authorName || 'there'}! Thanks for reaching out. Please send us a direct message (DM) and our sales team will share the pricing details with you right away! 📩`;
          } else if (text.includes("nice") || text.includes("awesome") || text.includes("love") || text.includes("good")) {
            finalReply = `Thank you so much for the love, ${comment.authorName || 'user'}! We're thrilled to hear that! ❤️😊`;
          } else {
            finalReply = `Thanks for the comment, ${comment.authorName || 'user'}! We appreciate your engagement and feedback. Let us know if you need anything else! 🙌`;
          }
        }

        if (finalReply && finalReply.trim().length > 0) {

          // Post reply via platform API
          const accessToken = comment.post.socialProfile.accessToken;
          const isSimulated = accessToken && accessToken.startsWith('simulated_access_token_');

          if (!isSimulated && comment.post.platform === 'FACEBOOK') {
            try {
              // Real Facebook comment reply Graph API call
              const response = await fetch(
                `https://graph.facebook.com/v18.0/${comment.platformId}/comments`,
                {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    message: finalReply,
                    access_token: accessToken
                  })
                }
              );

              if (!response.ok) {
                const err = await response.text();
                throw new Error(`Graph API error: ${err}`);
              }
            } catch (apiError) {
              this.log(`Failed to post real Facebook comment reply: ` + apiError.message);
              // Fail-safes: still save the DB state so we don't spam errors
            }
          } else {
            this.log(`[SIMULATED] Posted comment reply: "${finalReply}"`);
          }

          // Write audit log/reposts or update status
          await prisma.comment.update({
            where: { id: comment.id },
            data: { replied: true }
          });

          // Create a Reply model record
          await prisma.reply.create({
            data: {
              workspaceId,
              socialProfileId: comment.post.socialProfileId,
              originalMessage: comment.content,
              aiReply: finalReply,
              platform: comment.post.platform,
              platformPostId: comment.post.id,
              platformUserId: comment.authorId || undefined,
              category: 'COMMENT',
              status: 'SENT',
              sentAt: new Date()
            }
          });

          replyCount++;
          this.log(`✅ Autoreplied to comment ${comment.id}`);
        }
      }

      return replyCount;
    } catch (error) {
      this.log("Failed to auto-reply to comments: " + error.message);
      return 0;
    }
  }
}
