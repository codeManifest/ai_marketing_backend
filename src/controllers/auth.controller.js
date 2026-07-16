import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { google } from 'googleapis';
import { prisma } from '../config/db.js';
import { generateToken, setAuthCookie, clearAuthCookie } from '../utils/auth-helpers.js';
import { OAuth2Client } from 'google-auth-library';
import { config } from '../config/env.js';

const client = new OAuth2Client(
  config.google.clientId,
  config.google.clientSecret,
  config.google.redirectUri
);

/**
 * Controller for Email & Password Sign Up
 */
export async function signup(req, res) {
  try {
    const { userData, planId, workspaceData, paymentData } = req.body;

    // Validate required fields
    if (!userData || !userData.email || !userData.password) {
      return res.status(400).json({ success: false, error: 'Missing required fields' });
    }

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email: userData.email.toLowerCase() }
    });

    if (existingUser) {
      return res.status(409).json({ success: false, error: 'User already exists with this email' });
    }

    // Get plan details if planId is provided
    let plan = null;
    if (planId) {
      plan = await prisma.plan.findUnique({
        where: { id: planId }
      });

      if (!plan) {
        return res.status(404).json({ success: false, error: 'Plan not found' });
      }
    }

    // Start transaction for account creation
    const result = await prisma.$transaction(async (tx) => {
      // 1. Hash password
      const hashedPassword = await bcrypt.hash(userData.password, 12);

      // 2. Create User
      const user = await tx.user.create({
        data: {
          email: userData.email.toLowerCase(),
          name: userData.name,
          password: hashedPassword,
          emailVerified: new Date(),
        }
      });

      // 3. Create Subscription (only if plan is selected)
      let subscription = null;
      if (plan) {
        const subscriptionData = {
          userId: user.id,
          planId: plan.id,
          status: plan.price === 0 ? 'ACTIVE' : 'PENDING',
          currentPeriodStart: new Date(),
          currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
        };

        // Add Razorpay details for paid plans
        if (plan.price > 0 && paymentData) {
          subscriptionData.razorpaySubscriptionId = paymentData.razorpayPaymentId;
          subscriptionData.razorpayOrderId = paymentData.razorpayOrderId;
        }

        subscription = await tx.subscription.create({
          data: subscriptionData,
          include: { plan: true }
        });

        // 4. Create Payment Record for paid plans
        if (plan.price > 0 && paymentData) {
          const paymentVerified = verifyRazorpayPaymentSignature(paymentData);
          if (!paymentVerified) {
            throw new Error('Payment verification failed');
          }

          await tx.payment.create({
            data: {
              userId: user.id,
              subscriptionId: subscription.id,
              planId: plan.id,
              amount: plan.price,
              currency: 'INR',
              status: 'PAID_PAYMENT',
              razorpayPaymentId: paymentData.razorpayPaymentId,
              razorpayOrderId: paymentData.razorpayOrderId,
              razorpaySignature: paymentData.razorpaySignature,
              completedAt: new Date(),
              metadata: {
                planName: plan.name,
                userEmail: user.email
              }
            }
          });

          // Activate subscription for paid plans
          await tx.subscription.update({
            where: { id: subscription.id },
            data: { status: 'ACTIVE' }
          });
        }
      }

      // 5. Create Workspace (only if workspaceData is provided)
      let workspace = null;
      if (workspaceData && workspaceData.brandName) {
        workspace = await tx.workspace.create({
          data: {
            name: workspaceData.name || `${workspaceData.brandName} Workspace`,
            brandName: workspaceData.brandName,
            industry: workspaceData.industry,
            website: workspaceData.website,
            slug: generateSlug(workspaceData.brandName),
            ownerId: user.id,
            subscriptionId: subscription ? subscription.id : null,
            settings: workspaceData.settings || {
              timezone: 'Asia/Kolkata',
              language: 'en',
              autoSave: true
            }
          }
        });

        // 5b. Create Brand Profile
        const brandSettings = workspaceData.settings || {};
        await tx.brandProfile.create({
          data: {
            workspaceId: workspace.id,
            brandName: workspaceData.brandName || workspaceData.name,
            description: workspaceData.description || brandSettings.brandDescription || '',
            industry: workspaceData.industry || '',
            targetAudience: brandSettings.targetAudience || 'General Public',
            brandTone: brandSettings.brandTone || 'professional',
            brandColors: {
              primary: brandSettings.brandColor || '#7c3aed',
              secondary: brandSettings.brandColorSecondary || '#2563eb',
              text: brandSettings.brandColorText || '#1f2937'
            },
            logoUrl: brandSettings.brandLogo || '',
            banners: brandSettings.brandBanners || [],
            marketingPitch: brandSettings.marketingPitch || '',
            criticalFixes: brandSettings.criticalFixes || [],
            contacts: brandSettings.contacts || { emails: [], phones: [] },
            socials: brandSettings.socials || [],
            rawScrapedText: brandSettings.rawText || ''
          }
        });

        // 6. Create Membership (User as Owner)
        await tx.membership.create({
          data: {
            userId: user.id,
            workspaceId: workspace.id,
            role: 'OWNER',
            joinedAt: new Date()
          }
        });

        // 7. Create Default AI Settings
        await tx.aISettings.create({
          data: {
            workspaceId: workspace.id,
            model: "gpt-4",
            maxTokens: 500,
            temperature: 0.7
          }
        });

        // 8. Update subscription usage
        if (subscription) {
          await tx.subscription.update({
            where: { id: subscription.id },
            data: { usedWorkspaces: { increment: 1 } }
          });
        }
      }

      return { user, subscription, workspace };
    });

    // Auto-login user after signup: sign JWT and set HTTP-only cookie
    const token = generateToken(result.user);
    setAuthCookie(res, token);

    return res.status(201).json({
      success: true,
      message: !plan ? 'Account created successfully' : plan.price === 0 ? 'Free account created successfully' : 'Account created and payment processed successfully',
      data: {
        user: { id: result.user.id, email: result.user.email, name: result.user.name },
        workspace: result.workspace,
        subscription: result.subscription
      }
    });

  } catch (error) {
    console.error('Signup controller error:', error);
    let errorMessage = error.message;
    let statusCode = 500;

    if (error.message.includes('Payment verification failed')) {
      statusCode = 402;
    }

    return res.status(statusCode).json({ success: false, error: errorMessage });
  }
}

/**
 * Controller for Email & Password Log In
 */
export async function login(req, res) {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() }
    });

    if (!user) {
      return res.status(401).json({ error: 'No account found with this email' });
    }

    if (!user.password) {
      return res.status(400).json({ error: 'Please sign in with your social account or reset your password' });
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({ error: 'Invalid password' });
    }

    if (user.status !== 'ACTIVE') {
      return res.status(403).json({ error: `Account is inactive: ${user.statusReason || 'Please contact support.'}` });
    }

    const token = generateToken(user);
    setAuthCookie(res, token);

    return res.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        image: user.image
      }
    });
  } catch (error) {
    console.error('Login controller error:', error);
    return res.status(500).json({ error: 'Internal Server Error during login' });
  }
}

/**
 * Controller for Log Out
 */
export async function logout(req, res) {
  clearAuthCookie(res);
  return res.json({ success: true, message: 'Logged out successfully' });
}

/**
 * Retrieves the currently logged-in user profile / session data.
 * Replaces the frontend's NextAuth useSession() and getServerSession() payloads.
 */
export async function me(req, res) {
  // If the user reached here, it means requireAuth middleware ran successfully
  // and attached the standard session payload to req.user.
  if (!req.user) {
    return res.status(401).json({ error: 'Unauthorized: Session missing' });
  }
  return res.json({
    user: {
      id: req.user.id,
      email: req.user.email,
      name: req.user.name,
      image: req.user.image,
      emailVerified: req.user.emailVerified,
      memberships: req.user.memberships,
      subscription: req.user.subscription,
      systemRoles: req.user.systemRoles,
      isSuperAdmin: req.user.isSuperAdmin
    }
  });
}

/**
 * Redirects user to Google OAuth consent screen
 */
export async function googleLogin(req, res) {
  try {
    const authorizeUrl = client.generateAuthUrl({
      access_type: 'offline',
      scope: [
        'https://www.googleapis.com/auth/userinfo.profile',
        'https://www.googleapis.com/auth/userinfo.email'
      ],
      prompt: 'consent'
    });
    return res.redirect(authorizeUrl);
  } catch (error) {
    console.error('Google OAuth URL generation error:', error);
    return res.status(500).json({ error: 'Failed to initiate Google sign in' });
  }
}

/**
 * Google OAuth Callback: exchanges auth code for profile info, creates or links account, sets cookie and redirects to frontend dashboard.
 */
export async function googleCallback(req, res) {
  try {
    const { code } = req.query;
    if (!code) {
      return res.status(400).redirect(`${config.frontendUrl}/auth/error?error=MissingAuthorizationCode`);
    }

    const { tokens } = await client.getToken(code);
    client.setCredentials(tokens);

    // Fetch user profile from google userinfo API
    const oauth2 = google.oauth2({ version: 'v2', auth: client });
    const userInfo = await oauth2.userinfo.get();
    const profile = userInfo.data;

    if (!profile.email) {
      return res.status(400).redirect(`${config.frontendUrl}/auth/error?error=NoEmailFromGoogle`);
    }

    const email = profile.email.toLowerCase();
    const googleId = profile.id;

    // Transaction to find/create user and links
    const user = await prisma.$transaction(async (tx) => {
      let existingUser = await tx.user.findUnique({
        where: { email }
      });

      if (existingUser) {
        // Link Google account if not linked
        const existingAccount = await tx.account.findUnique({
          where: {
            provider_providerAccountId: {
              provider: 'google',
              providerAccountId: googleId
            }
          }
        });

        if (!existingAccount) {
          await tx.account.create({
            data: {
              userId: existingUser.id,
              type: 'oauth',
              provider: 'google',
              providerAccountId: googleId,
              access_token: tokens.access_token,
              refresh_token: tokens.refresh_token,
              expires_at: tokens.expiry_date ? Math.floor(tokens.expiry_date / 1000) : null,
              scope: tokens.scope,
              token_type: tokens.token_type,
              id_token: tokens.id_token
            }
          });
        }

        // Update profile photo if not set or changed
        if (profile.picture && existingUser.image !== profile.picture) {
          existingUser = await tx.user.update({
            where: { id: existingUser.id },
            data: {
              image: profile.picture,
              emailVerified: existingUser.emailVerified || new Date()
            }
          });
        }

        return existingUser;
      } else {
        // Create user
        const newUser = await tx.user.create({
          data: {
            email,
            name: profile.name,
            image: profile.picture,
            emailVerified: new Date()
          }
        });

        // Link Google account
        await tx.account.create({
          data: {
            userId: newUser.id,
            type: 'oauth',
            provider: 'google',
            providerAccountId: googleId,
            access_token: tokens.access_token,
            refresh_token: tokens.refresh_token,
            expires_at: tokens.expiry_date ? Math.floor(tokens.expiry_date / 1000) : null,
            scope: tokens.scope,
            token_type: tokens.token_type,
            id_token: tokens.id_token
          }
        });

        return newUser;
      }
    });

    if (user.status !== 'ACTIVE') {
      return res.redirect(`${config.frontendUrl}/auth/error?error=UserSuspended`);
    }

    const token = generateToken(user);
    setAuthCookie(res, token);

    // Redirect to workspaces onboarding / page
    return res.redirect(`${config.frontendUrl}/workspaces`);

  } catch (error) {
    console.error('Google callback error:', error);
    return res.redirect(`${config.frontendUrl}/auth/error?error=OAuthCallbackFailed`);
  }
}

// Razorpay verification helper
function verifyRazorpayPaymentSignature(paymentData) {
  try {
    if (!paymentData) return true;
    const body = paymentData.razorpayOrderId + "|" + paymentData.razorpayPaymentId;
    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(body.toString())
      .digest('hex');

    return expectedSignature === paymentData.razorpaySignature;
  } catch (error) {
    console.error('Payment verification signature error:', error);
    return false;
  }
}

// Helper to generate unique slugs
function generateSlug(brandName) {
  return brandName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '')
    .substring(0, 50) + '-' + Date.now().toString(36);
}

/**
 * Lightweight check of membership count to bypass client-side cached redirects.
 */
export async function checkWorkspaces(req, res) {
  try {
    if (!req.user || !req.user.id) {
      return res.json({ hasWorkspaces: false, count: 0 });
    }
    const count = await prisma.membership.count({
      where: { userId: req.user.id }
    });
    return res.json({ hasWorkspaces: count > 0, count });
  } catch (err) {
    console.error("checkWorkspaces controller error:", err);
    return res.json({ hasWorkspaces: false, count: 0 });
  }
}

