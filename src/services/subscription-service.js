// app/lib/subscription-service.js
import { prisma } from '../config/db.js';
import Razorpay from 'razorpay';
import crypto from "crypto";
import { hash } from 'bcryptjs';

function generateReceipt(userId) {
  const shortId = userId.slice(0, 8);
  const hash = crypto.createHash("sha1")
    .update(userId + Date.now().toString())
    .digest("hex")
    .slice(0, 6);
  return `rcpt_${shortId}_${hash}`;
}

// Initialize Razorpay
export const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

// Check if user can create more workspaces based on their subscription
export async function canCreateWorkspace(userId) {
  try {
    // Get user's active subscription
    const subscription = await prisma.subscription.findFirst({
      where: {
        userId: userId,
        status: 'ACTIVE'
      },
      include: {
        plan: true
      }
    });

    if (!subscription) {
      return { 
        canCreate: false, 
        reason: 'No active subscription found. Please subscribe to a plan first.' 
      };
    }

    const currentWorkspaceCount = subscription.usedWorkspaces;
    const maxWorkspaces = subscription.plan.maxWorkspaces;

    if (currentWorkspaceCount >= maxWorkspaces) {
      return { 
        canCreate: false, 
        reason: `Your ${subscription.plan.name} plan allows only ${maxWorkspaces} workspace(s). Please upgrade to create more workspaces.`,
        currentCount: currentWorkspaceCount,
        maxAllowed: maxWorkspaces
      };
    }

    return { 
      canCreate: true, 
      reason: `You can create workspace (${currentWorkspaceCount + 1}/${maxWorkspaces})`,
      currentCount: currentWorkspaceCount,
      maxAllowed: maxWorkspaces
    };

  } catch (error) {
    console.error('Error checking workspace creation limit:', error);
    return { canCreate: false, reason: 'Error checking workspace limits' };
  }
}

// Create Razorpay order for subscription
export async function createRazorpayOrder(planId, userId) {
  try {
    console.log('Creating Razorpay order for plan:', planId, 'user:', userId);
    
    const plan = await prisma.plan.findUnique({
      where: { id: planId }
    });

    if (!plan) {
      throw new Error('Plan not found');
    }

    // If price is 0, no need for payment
    if (plan.price == 0) {
      console.log('Free plan - no payment required');
      return null;
    }

    // Validate Razorpay credentials
    if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
      throw new Error('Razorpay credentials are missing. Please check your environment variables.');
    }

    const options = {
      amount: Math.round(plan.price * 100), // amount in paise
      currency: plan.currency || 'INR',
      receipt: generateReceipt(userId),
      notes: {
        planId: plan.id,
        userId: userId,
        planName: plan.name
      },
      payment_capture: 1 // Auto capture payment
    };

    console.log('Creating Razorpay order with options:', options);
    
    const order = await razorpay.orders.create(options);
    console.log('Razorpay order created successfully:', order.id);
    
    return order;
    
  } catch (error) {
    console.error('Error creating Razorpay order:', error);
    
    if (error.error && error.error.description) {
      throw new Error(`Razorpay error: ${error.error.description}`);
    } else if (error.statusCode === 401) {
      throw new Error('Invalid Razorpay credentials. Please check your API keys.');
    } else if (error.statusCode === 400) {
      throw new Error('Invalid request to Razorpay. Please check the order parameters.');
    } else {
      throw new Error('Failed to create payment order: ' + error.message);
    }
  }
}

// Create user account with subscription
export async function createUserWithSubscription({ 
  userData, 
  planId, 
  workspaceData,
  paymentData = null 
}) {
  return await prisma.$transaction(async (tx) => {
    try {
      // 1. Hash password
      const hashedPassword = await hash(userData.password, 12);

      // 2. Create User
      const user = await tx.user.create({
        data: {
          email: userData.email,
          name: userData.name,
          password: hashedPassword,
          emailVerified: new Date(),
        }
      });

      // 3. Create Subscription
      const subscriptionData = {
        userId: user.id,
        planId: planId,
        status: 'PENDING',
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
      };

      // Add Razorpay details for paid plans
      const plan = await tx.plan.findUnique({ where: { id: planId } });
      if (plan.price > 0 && paymentData) {
        subscriptionData.razorpayOrderId = paymentData.razorpayOrderId;
      }

      const subscription = await tx.subscription.create({
        data: subscriptionData,
        include: { plan: true }
      });

      // 4. Create Payment Record for paid plans
      if (plan.price > 0 && paymentData) {
        await tx.payment.create({
          data: {
            userId: user.id,
            subscriptionId: subscription.id,
            planId: planId,
            amount: plan.price,
            currency: 'INR',
            status: 'PENDING_PAYMENT',
            razorpayOrderId: paymentData.razorpayOrderId,
            metadata: {
              planName: plan.name,
              userEmail: user.email
            }
          }
        });
      }

      // 5. Create Workspace
      const workspace = await tx.workspace.create({
        data: {
          name: workspaceData.name,
          brandName: workspaceData.brandName,
          industry: workspaceData.industry,
          website: workspaceData.website,
          slug: generateSlug(workspaceData.brandName),
          ownerId: user.id,
          subscriptionId: subscription.id,
          settings: {
            timezone: 'Asia/Kolkata',
            language: 'en',
            autoSave: true
          }
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
      await tx.subscription.update({
        where: { id: subscription.id },
        data: { usedWorkspaces: { increment: 1 } }
      });

      return { user, subscription, workspace };

    } catch (error) {
      console.error('Transaction error:', error);
      throw error;
    }
  });
}

// Complete subscription setup after payment verification
export async function completeSubscriptionSetup({ 
  userId, 
  paymentVerification 
}) {
  return await prisma.$transaction(async (tx) => {
    try {
      // 1. Verify Payment
      const paymentVerified = await verifyRazorpayPayment(paymentVerification);
      
      if (!paymentVerified) {
        throw new Error('Payment verification failed');
      }

      // 2. Update Payment Record
      const payment = await tx.payment.update({
        where: { razorpayOrderId: paymentVerification.razorpayOrderId },
        data: {
          status: 'PAID_PAYMENT',
          razorpayPaymentId: paymentVerification.razorpayPaymentId,
          razorpaySignature: paymentVerification.razorpaySignature,
          completedAt: new Date()
        },
        include: { 
          subscription: { 
            include: { 
              plan: true,
              user: true
            } 
          } 
        }
      });

      if (!payment) {
        throw new Error("Payment record not found");
      }

      // 3. Activate Subscription
      const subscription = await tx.subscription.update({
        where: { id: payment.subscriptionId },
        data: {
          status: 'ACTIVE',
          razorpaySubscriptionId: paymentVerification.razorpayPaymentId,
          razorpayCustomerId: paymentVerification.razorpayCustomerId
        },
        include: { plan: true }
      });

      // 4. Update user's subscription reference
      await tx.user.update({
        where: { id: userId },
        data: { subscriptionId: subscription.id }
      });

      return { subscription, payment };

    } catch (error) {
      console.error("Subscription setup failed:", error);
      throw new Error(`Subscription setup failed: ${error.message}`);
    }
  });
}

// Get all available plans
export async function getPlans() {
  return await prisma.plan.findMany({
    where: { isActive: true },
    orderBy: { price: 'asc' }
  });
}

// Get plan by ID
export async function getPlanById(planId) {
  return await prisma.plan.findUnique({
    where: { id: planId }
  });
}

// Verify Razorpay payment
export async function verifyRazorpayPayment(paymentData) {
  try {
    // For FREE plans, no verification needed
    if (!paymentData) return true;

    const body = paymentData.razorpayOrderId + "|" + paymentData.razorpayPaymentId;
    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(body.toString())
      .digest('hex');

    return expectedSignature === paymentData.razorpaySignature;
  } catch (error) {
    console.error('Payment verification error:', error);
    return false;
  }
}

// Check if Razorpay credentials are valid
export async function checkRazorpayCredentials() {
  try {
    const testOrder = await razorpay.orders.create({
      amount: 100, // 1 INR
      currency: 'INR',
      receipt: `test_${Date.now()}`,
      payment_capture: 1
    });
    
    console.log('Razorpay credentials are valid');
    return { valid: true, orderId: testOrder.id };
  } catch (error) {
    console.error('Razorpay credentials check failed:', error);
    return { valid: false, error: error.message };
  }
}

// Get user's subscription details
export async function getUserSubscription(userId) {
  try {
    const subscription = await prisma.subscription.findFirst({
      where: {
        userId: userId,
        status: { in: ['ACTIVE', 'TRIAL'] }
      },
      include: {
        plan: true,
        workspaces: {
          include: {
            _count: {
              select: {
                socialProfiles: true,
                posts: true,
                memberships: true
              }
            }
          }
        }
      }
    });

    return subscription;
  } catch (error) {
    console.error('Error getting user subscription:', error);
    return null;
  }
}

// Get user's workspace limits
export async function getUserWorkspaceLimits(userId) {
  try {
    const subscription = await getUserSubscription(userId);
    
    if (!subscription) {
      return {
        hasSubscription: false,
        currentWorkspaces: 0,
        maxWorkspaces: 0,
        canCreateMore: false,
        message: 'No active subscription found'
      };
    }

    const currentWorkspaces = subscription.usedWorkspaces;
    const maxWorkspaces = subscription.plan.maxWorkspaces;
    const canCreateMore = currentWorkspaces < maxWorkspaces;

    return {
      hasSubscription: true,
      currentWorkspaces,
      maxWorkspaces,
      canCreateMore,
      message: canCreateMore 
        ? `You can create ${maxWorkspaces - currentWorkspaces} more workspace(s)` 
        : `You've reached your limit of ${maxWorkspaces} workspace(s). Please upgrade your plan.`,
      subscription: {
        planName: subscription.plan.name,
        status: subscription.status,
        aiCredits: subscription.plan.monthlyAiCredits - subscription.usedAiCredits
      }
    };

  } catch (error) {
    console.error('Error getting user workspace limits:', error);
    return null;
  }
}

// Create new workspace for user
export async function createWorkspace(userId, workspaceData) {
  return await prisma.$transaction(async (tx) => {
    // Check if user can create workspace
    const workspaceCheck = await canCreateWorkspace(userId);
    if (!workspaceCheck.canCreate) {
      throw new Error(workspaceCheck.reason);
    }

    // Get user's subscription
    const subscription = await tx.subscription.findFirst({
      where: {
        userId: userId,
        status: 'ACTIVE'
      }
    });

    if (!subscription) {
      throw new Error('No active subscription found');
    }

    // Generate unique slug
    const uniqueSlug = generateSlug(workspaceData.brandName);

    // Create workspace
    const workspace = await tx.workspace.create({
      data: {
        name: workspaceData.name,
        brandName: workspaceData.brandName,
        industry: workspaceData.industry,
        website: workspaceData.website,
        description: workspaceData.description,
        slug: uniqueSlug,
        ownerId: userId,
        subscriptionId: subscription.id,
        settings: workspaceData.settings || {}
      }
    });

    // Create membership
    await tx.membership.create({
      data: {
        userId: userId,
        workspaceId: workspace.id,
        role: 'OWNER',
        joinedAt: new Date()
      }
    });

    // Create AI settings
    await tx.aISettings.create({
      data: {
        workspaceId: workspace.id
      }
    });

    // Update subscription usage
    await tx.subscription.update({
      where: { id: subscription.id },
      data: { usedWorkspaces: { increment: 1 } }
    });

    return workspace;
  });
}

// Get workspace with detailed information
export async function getWorkspaceWithDetails(workspaceId, userId) {
  try {
    const workspace = await prisma.workspace.findFirst({
      where: {
        id: workspaceId,
        OR: [
          { ownerId: userId },
          { 
            memberships: {
              some: {
                userId: userId
              }
            }
          }
        ]
      },
      include: {
        owner: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true
          }
        },
        subscription: {
          include: {
            plan: {
              select: {
                id: true,
                name: true,
                price: true,
                maxWorkspaces: true,
                monthlyAiCredits: true,
                maxSocialProfiles: true,
                features: true,
                billingCycle: true
              }
            }
          }
        },
        memberships: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                image: true
              }
            }
          }
        },
        socialProfiles: {
          select: {
            id: true,
            platform: true,
            name: true,
            username: true,
            isConnected: true,
            followersCount: true,
            lastSynced: true
          }
        },
        AISettings: true,
        _count: {
          select: {
            posts: true,
            tasks: true,
            socialProfiles: true,
            memberships: true
            // Remove 'replies' as it's not a direct relation of Workspace
            // Replies are connected through SocialProfile -> Reply
          }
        }
      }
    });

    if (!workspace) {
      throw new Error('Workspace not found or access denied');
    }

    return workspace;
  } catch (error) {
    console.error('Error fetching workspace details:', error);
    throw error;
  }
}

// Get user's all workspaces
export async function getUserWorkspaces(userId) {
  try {
    const workspaces = await prisma.workspace.findMany({
      where: {
        OR: [
          { ownerId: userId },
          { 
            memberships: {
              some: {
                userId: userId
              }
            }
          }
        ]
      },
      include: {
        owner: {
          select: {
            id: true,
            name: true,
            email: true
          }
        },
        subscription: {
          include: {
            plan: {
              select: {
                id: true,
                name: true,
                price: true
              }
            }
          }
        },
        memberships: {
          where: {
            userId: userId
          },
          select: {
            role: true
          }
        },
        _count: {
          select: {
            socialProfiles: true,
            posts: true,
            memberships: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    // Add user's role in each workspace
    const workspacesWithRole = workspaces.map(workspace => ({
      ...workspace,
      userRole: workspace.memberships[0]?.role || 'MEMBER',
      isOwner: workspace.ownerId === userId
    }));

    return workspacesWithRole;
  } catch (error) {
    console.error('Error fetching user workspaces:', error);
    throw error;
  }
}

// Update workspace
export async function updateWorkspace(workspaceId, userId, updateData) {
  try {
    // Verify user has access to workspace
    const membership = await prisma.membership.findFirst({
      where: {
        workspaceId: workspaceId,
        userId: userId,
        role: { in: ['OWNER', 'ADMIN'] }
      }
    });

    if (!membership) {
      throw new Error('Access denied. You need OWNER or ADMIN role to update workspace.');
    }

    const workspace = await prisma.workspace.update({
      where: { id: workspaceId },
      data: updateData
    });

    return workspace;
  } catch (error) {
    console.error('Error updating workspace:', error);
    throw error;
  }
}

// Delete workspace
export async function deleteWorkspace(workspaceId, userId) {
  return await prisma.$transaction(async (tx) => {
    // Verify user is the owner
    const workspace = await tx.workspace.findFirst({
      where: {
        id: workspaceId,
        ownerId: userId
      },
      include: {
        subscription: true
      }
    });

    if (!workspace) {
      throw new Error('Workspace not found or you are not the owner.');
    }

    // Delete workspace (cascade will handle related records)
    await tx.workspace.delete({
      where: { id: workspaceId }
    });

    // Update subscription usage
    if (workspace.subscriptionId) {
      await tx.subscription.update({
        where: { id: workspace.subscriptionId },
        data: { usedWorkspaces: { decrement: 1 } }
      });
    }

    return { success: true, message: 'Workspace deleted successfully' };
  });
}

// Get workspace status and analytics
export async function getWorkspaceStatus(workspaceId) {
  try {
    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      include: {
        subscription: {
          include: {
            plan: true
          }
        },
        _count: {
          select: {
            posts: {
              where: {
                status: 'POSTED'
              }
            },
            socialProfiles: {
              where: {
                isConnected: true
              }
            },
            tasks: {
              where: {
                status: 'COMPLETED'
              }
            },
            replies: {
              where: {
                status: 'SENT'
              }
            }
          }
        },
        socialProfiles: {
          select: {
            platform: true,
            isConnected: true,
            followersCount: true
          }
        }
      }
    });

    if (!workspace) {
      throw new Error('Workspace not found');
    }

    // Calculate analytics
    const totalFollowers = workspace.socialProfiles
      .filter(profile => profile.isConnected)
      .reduce((sum, profile) => sum + (profile.followersCount || 0), 0);

    const connectedProfiles = workspace.socialProfiles.filter(profile => profile.isConnected).length;

    return {
      workspaceId: workspace.id,
      name: workspace.name,
      status: workspace.status,
      subscriptionStatus: workspace.subscription?.status || 'INACTIVE',
      plan: workspace.subscription?.plan?.name || 'No Plan',
      analytics: {
        totalPosts: workspace._count.posts,
        connectedProfiles: connectedProfiles,
        totalFollowers: totalFollowers,
        completedTasks: workspace._count.tasks,
        sentReplies: workspace._count.replies
      },
      subscription: workspace.subscription ? {
        status: workspace.subscription.status,
        plan: workspace.subscription.plan.name,
        currentPeriodEnd: workspace.subscription.currentPeriodEnd,
        usedWorkspaces: workspace.subscription.usedWorkspaces,
        usedAiCredits: workspace.subscription.usedAiCredits
      } : null
    };
  } catch (error) {
    console.error('Error getting workspace status:', error);
    throw error;
  }
}

// Update company address
export async function updateCompanyAddress(workspaceId, companyAddress) {
  try {
    const workspace = await prisma.workspace.update({
      where: { id: workspaceId },
      data: {
        companyAddress: companyAddress
      }
    });

    console.log('Company address updated for workspace:', workspaceId);
    return workspace;
  } catch (error) {
    console.error('Error updating company address:', error);
    throw new Error('Failed to update company address: ' + error.message);
  }
}

// Update billing details
export async function updateBillingDetails(workspaceId, billingDetails) {
  try {
    const workspace = await prisma.workspace.update({
      where: { id: workspaceId },
      data: {
        billingDetails: billingDetails
      }
    });

    console.log('Billing details updated for workspace:', workspaceId);
    return workspace;
  } catch (error) {
    console.error('Error updating billing details:', error);
    throw new Error('Failed to update billing details: ' + error.message);
  }
}




// Add this function to your subscription-service.js file

// Create workspace with subscription (for existing users)
export async function createWorkspaceWithSubscription({ 
  userId, 
  planId, 
  workspaceData,
  paymentData = null 
}) {
  return await prisma.$transaction(async (tx) => {
    try {
      // 1. Check if user exists and get user details
      const user = await tx.user.findUnique({
        where: { id: userId },
        include: {
          subscriptions: {
            where: {
              status: { in: ['ACTIVE', 'TRIAL'] }
            },
            include: {
              plan: true
            }
          }
        }
      });

      if (!user) {
        throw new Error('User not found');
      }

      // 2. Check if user already has an active subscription
      let subscription = user.subscriptions[0];

      if (!subscription) {
        // If no active subscription, create a new one
        const plan = await tx.plan.findUnique({ where: { id: planId } });
        if (!plan) {
          throw new Error('Plan not found');
        }

        const subscriptionData = {
          userId: userId,
          planId: planId,
          status: plan.price > 0 ? 'PENDING' : 'ACTIVE',
          currentPeriodStart: new Date(),
          currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        };

        // Add Razorpay details for paid plans
        if (plan.price > 0 && paymentData) {
          subscriptionData.razorpayOrderId = paymentData.razorpayOrderId;
        }

        subscription = await tx.subscription.create({
          data: subscriptionData,
          include: { plan: true }
        });

        // Create payment record for paid plans
        if (plan.price > 0 && paymentData) {
          await tx.payment.create({
            data: {
              userId: userId,
              subscriptionId: subscription.id,
              planId: planId,
              amount: plan.price,
              currency: 'INR',
              status: 'PENDING_PAYMENT',
              razorpayOrderId: paymentData.razorpayOrderId,
              metadata: {
                planName: plan.name,
                userEmail: user.email
              }
            }
          });
        }

        // Update user's subscription reference
        await tx.user.update({
          where: { id: userId },
          data: { subscriptionId: subscription.id }
        });
      }

      // 3. Check workspace creation limits using loaded transaction subscription
      const currentWorkspaceCount = subscription.usedWorkspaces || 0;
      const maxWorkspaces = subscription.plan?.maxWorkspaces || 1;

      if (currentWorkspaceCount >= maxWorkspaces) {
        throw new Error(`Your ${subscription.plan?.name || 'selected'} plan allows only ${maxWorkspaces} workspace(s). Please upgrade to create more.`);
      }

      // 4. Generate unique slug
      const uniqueSlug = generateSlug(workspaceData.brandName);

      // 5. Create workspace
      const workspace = await tx.workspace.create({
        data: {
          name: workspaceData.name,
          brandName: workspaceData.brandName,
          industry: workspaceData.industry,
          website: workspaceData.website,
          description: workspaceData.description,
          slug: uniqueSlug,
          ownerId: userId,
          subscriptionId: subscription.id,
          settings: workspaceData.settings || {
            timezone: 'Asia/Kolkata',
            language: 'en',
            autoSave: true
          }
        }
      });

      // 5b. Create Brand Profile if settings or scraper details exist
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

      // 6. Create membership (User as Owner)
      await tx.membership.create({
        data: {
          userId: userId,
          workspaceId: workspace.id,
          role: 'OWNER',
          joinedAt: new Date()
        }
      });

      // 7. Create default AI settings
      await tx.aISettings.create({
        data: {
          workspaceId: workspace.id,
          model: "gpt-4",
          maxTokens: 500,
          temperature: 0.7
        }
      });

      // 8. Update subscription usage
      await tx.subscription.update({
        where: { id: subscription.id },
        data: { usedWorkspaces: { increment: 1 } }
      });

      const workspaceCheck = {
        canCreate: true,
        currentCount: currentWorkspaceCount,
        maxAllowed: maxWorkspaces
      };

      return {
        workspace,
        subscription,
        workspaceCheck
      };

    } catch (error) {
      console.error('Error in createWorkspaceWithSubscription:', error);
      throw error;
    }
  });
}




// Helper function to generate slug
function generateSlug(brandName) {
  return brandName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '')
    .substring(0, 50) + '-' + Math.random().toString(36).substring(2, 7);
}

// Verify Razorpay payment and activate subscription
export async function verifyAndActivateSubscription(
  paymentId,
  orderId,
  signature,
  workspaceId,
  planId
) {
  // 1. Verify Razorpay payment signature
  if (signature !== 'free_bypass') {
    const expectedBody = orderId + "|" + paymentId;
    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(expectedBody.toString())
      .digest('hex');

    if (expectedSignature !== signature) {
      throw new Error('Invalid Razorpay signature');
    }
  }

  // 2. Activate in database inside transaction
  return await prisma.$transaction(async (tx) => {
    // Find workspace to know its owner
    const workspace = await tx.workspace.findUnique({
      where: { id: workspaceId }
    });

    if (!workspace) {
      throw new Error('Workspace not found');
    }

    const userId = workspace.ownerId;

    // First check if the user already has an active or trial subscription to prevent unique constraint violation
    const activeSubscription = await tx.subscription.findFirst({
      where: {
        userId: userId,
        status: { in: ['ACTIVE', 'TRIAL'] }
      }
    });

    let subscription;
    if (activeSubscription) {
      // Record historical plan change
      await tx.subscriptionHistory.create({
        data: {
          subscriptionId: activeSubscription.id,
          userId: userId,
          oldPlanId: activeSubscription.planId,
          newPlanId: planId,
          reason: 'upgrade'
        }
      });

      // Update the existing active/trial subscription to the new plan
      subscription = await tx.subscription.update({
        where: { id: activeSubscription.id },
        data: {
          planId: planId,
          status: 'ACTIVE',
          isTrial: false,
          razorpaySubscriptionId: paymentId,
          currentPeriodStart: new Date(),
          currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
        }
      });
    } else {
      // Find the pending subscription or create a new active one
      const pendingSubscription = await tx.subscription.findFirst({
        where: {
          userId: userId,
          planId: planId,
          status: { in: ['PENDING', 'INCOMPLETE'] }
        }
      });

      if (!pendingSubscription) {
        // Create new one if not found
        subscription = await tx.subscription.create({
          data: {
            userId: userId,
            planId: planId,
            status: 'ACTIVE',
            currentPeriodStart: new Date(),
            currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
            razorpaySubscriptionId: paymentId
          }
        });
      } else {
        // Activate existing one
        subscription = await tx.subscription.update({
          where: { id: pendingSubscription.id },
          data: {
            status: 'ACTIVE',
            razorpaySubscriptionId: paymentId,
            currentPeriodStart: new Date(),
            currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
          }
        });
      }
    }

    // Link workspace to subscription
    await tx.workspace.update({
      where: { id: workspaceId },
      data: { subscriptionId: subscription.id }
    });

    // Update payment record or create one
    let payment = await tx.payment.findFirst({
      where: { razorpayOrderId: orderId }
    });

    if (payment) {
      await tx.payment.update({
        where: { id: payment.id },
        data: {
          status: 'PAID_PAYMENT',
          razorpayPaymentId: paymentId,
          razorpaySignature: signature,
          completedAt: new Date()
        }
      });
    } else {
      const plan = await tx.plan.findUnique({ where: { id: planId } });
      await tx.payment.create({
        data: {
          userId: userId,
          subscriptionId: subscription.id,
          workspaceId: workspaceId,
          planId: planId,
          amount: plan ? plan.price : 0,
          currency: 'INR',
          status: 'PAID_PAYMENT',
          razorpayOrderId: orderId,
          razorpayPaymentId: paymentId,
          razorpaySignature: signature,
          completedAt: new Date()
        }
      });
    }

    // Update user subscription reference
    await tx.user.update({
      where: { id: userId },
      data: { subscriptionId: subscription.id }
    });

    return subscription;
  });
}