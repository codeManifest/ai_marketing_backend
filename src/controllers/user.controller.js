import { prisma } from '../config/db.js';

/**
 * GET /api/user/subscription
 * Retrieves the logged-in user's subscription, workspace counts, AI credits used, and payment invoices.
 */
export async function getUserSubscription(req, res) {
  try {
    const userId = req.user.id;

    // Get user's active subscription with plan details
    const subscription = await prisma.subscription.findFirst({
      where: {
        userId: userId,
        status: {
          in: ['ACTIVE', 'TRIAL'] // Include both active and trial subscriptions
        }
      },
      include: {
        plan: true,
        workspaces: {
          select: {
            id: true,
            name: true,
            brandName: true
          }
        },
        _count: {
          select: {
            workspaces: true,
            AIUsage: {
              where: {
                createdAt: {
                  gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1) // Current month
                }
              }
            }
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    // If no active subscription found, check for any subscription (including expired/cancelled)
    let userSubscription = subscription;
    if (!userSubscription) {
      userSubscription = await prisma.subscription.findFirst({
        where: {
          userId: userId
        },
        include: {
          plan: true,
          workspaces: {
            select: {
              id: true,
              name: true,
              brandName: true
            }
          },
          _count: {
            select: {
              workspaces: true,
              AIUsage: {
                where: {
                  createdAt: {
                    gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1) // Current month
                  }
                }
              }
            }
          }
        },
        orderBy: {
          createdAt: 'desc'
        }
      });
    }

    // If no subscription exists at all, create a default free plan response
    if (!userSubscription) {
      const defaultPlan = await prisma.plan.findFirst({
        where: {
          name: { in: ['FREE', 'Free'] }
        }
      });

      if (!defaultPlan) {
        // Create default free plan if it doesn't exist
        const freePlan = await prisma.plan.create({
          data: {
            name: 'FREE',
            price: 0,
            maxWorkspaces: 1,
            monthlyAiCredits: 50,
            maxSocialProfiles: 3,
            currency: 'INR',
            isTrial: false,
            billingCycle: 'MONTHLY',
            features: {
              workspaces: 1,
              aiCredits: 50,
              socialProfiles: 3,
              analytics: 'basic',
              support: 'community'
            },
            isActive: true
          }
        });

        return res.json({
          id: null,
          status: 'TRIAL',
          isTrial: true,
          plan: freePlan,
          usedWorkspaces: 0,
          usedAiCredits: 0,
          currentPeriodStart: new Date(),
          currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
          workspaces: []
        });
      }

      return res.json({
        id: null,
        status: 'TRIAL',
        isTrial: true,
        plan: defaultPlan,
        usedWorkspaces: 0,
        usedAiCredits: 0,
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
        workspaces: []
      });
    }

    // Calculate current month AI usage
    const currentMonthAIUsage = await prisma.aIUsage.aggregate({
      where: {
        userId: userId,
        createdAt: {
          gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1) // Start of current month
        }
      },
      _sum: {
        creditsUsed: true
      }
    });

    // Get total workspace count for this user (across all subscriptions)
    const totalWorkspaces = await prisma.membership.count({
      where: {
        userId: userId
      }
    });

    // Fetch user's successful payments for invoice history
    const payments = await prisma.payment.findMany({
      where: {
        userId: userId,
        status: 'PAID_PAYMENT'
      },
      include: {
        plan: true
      },
      orderBy: {
        completedAt: 'desc'
      }
    });

    const invoices = payments.map(payment => ({
      id: `INV-${payment.id.substring(payment.id.length - 8).toUpperCase()}`,
      date: payment.completedAt ? new Date(payment.completedAt).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      }) : new Date(payment.createdAt).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      }),
      amount: `${payment.currency === 'INR' ? '₹' : '$'}${payment.amount.toFixed(2)}`,
      status: 'Paid'
    }));

    // Transform the subscription data to match the expected format
    const subscriptionData = {
      id: userSubscription.id,
      status: userSubscription.status,
      isTrial: userSubscription.isTrial,
      plan: userSubscription.plan,
      usedWorkspaces: totalWorkspaces,
      usedAiCredits: currentMonthAIUsage._sum.creditsUsed || 0,
      currentPeriodStart: userSubscription.currentPeriodStart,
      currentPeriodEnd: userSubscription.currentPeriodEnd,
      cancelAtPeriodEnd: userSubscription.cancelAtPeriodEnd,
      razorpaySubscriptionId: userSubscription.razorpaySubscriptionId,
      razorpayCustomerId: userSubscription.razorpayCustomerId,
      createdAt: userSubscription.createdAt,
      updatedAt: userSubscription.updatedAt,
      workspaces: userSubscription.workspaces,
      invoices
    };

    console.log('📊 Subscription API Response:', {
      userId,
      subscriptionId: subscriptionData.id,
      status: subscriptionData.status,
      plan: subscriptionData.plan.name,
      usedWorkspaces: subscriptionData.usedWorkspaces,
      usedAiCredits: subscriptionData.usedAiCredits,
      maxWorkspaces: subscriptionData.plan.maxWorkspaces,
      monthlyAiCredits: subscriptionData.plan.monthlyAiCredits,
      invoicesCount: invoices.length
    });

    return res.json(subscriptionData);

  } catch (error) {
    console.error('❌ Error fetching subscription:', error);
    return res.status(500).json({ 
      error: 'Failed to fetch subscription',
      details: error.message 
    });
  }
}
