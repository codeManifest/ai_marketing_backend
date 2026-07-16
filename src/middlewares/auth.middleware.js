import { verifyToken } from '../utils/auth-helpers.js';
import { prisma } from '../config/db.js';

/**
 * Authentication Middleware: Enforces that the user has a valid session token.
 * Populates req.user with user details, memberships, system roles, and active subscription.
 */
export async function requireAuth(req, res, next) {
  try {
    const token = req.cookies?.token || (req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.split(' ')[1] : null);

    if (!token) {
      return res.status(401).json({ error: 'Unauthorized: Session token missing' });
    }

    const decoded = verifyToken(token);
    if (!decoded || !decoded.id) {
      return res.status(401).json({ error: 'Unauthorized: Session invalid or expired' });
    }

    // Load full user details to match NextAuth session payload structure
    const user = await prisma.user.findUnique({
      where: { id: decoded.id },
      select: {
        id: true,
        email: true,
        name: true,
        image: true,
        emailVerified: true
      }
    });

    if (!user) {
      return res.status(401).json({ error: 'Unauthorized: User account not found' });
    }

    // Get active subscriptions
    const subscription = await prisma.subscription.findFirst({
      where: {
        userId: user.id,
        status: { in: ['ACTIVE', 'TRIAL', 'EXPIRED', 'CANCELLED'] }
      },
      include: {
        plan: true,
        workspaces: {
          include: {
            memberships: {
              where: { userId: user.id }
            }
          }
        }
      }
    });

    // Get system roles
    const userSysRoles = await prisma.userSystemRole.findMany({
      where: { userId: user.id },
      include: {
        role: {
          include: {
            permissions: {
              include: { permission: true }
            }
          }
        }
      }
    });
    const systemRoles = userSysRoles.map(sr => sr.role.name);
    const isSuperAdmin = systemRoles.includes('SUPER_ADMIN');

    // Get memberships
    const membershipsData = await prisma.membership.findMany({
      where: { userId: user.id },
      include: {
        workspace: {
          select: {
            id: true,
            name: true,
            brandName: true,
            ownerId: true,
            slug: true
          }
        }
      }
    });

    const memberships = membershipsData.map(m => ({
      workspaceId: m.workspaceId,
      workspaceName: m.workspace.name,
      brandName: m.workspace.brandName,
      workspaceSlug: m.workspace.slug,
      role: m.role,
      isOwner: m.workspace.ownerId === user.id
    }));

    // Attach complete user context to req.user
    req.user = {
      ...user,
      subscription,
      systemRoles,
      isSuperAdmin,
      memberships
    };

    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    res.status(500).json({ error: 'Internal Server Error during authentication' });
  }
}

/**
 * Authorization Middleware: Enforces that the user has a sufficient role in the workspace.
 * Requires requireAuth to have run first.
 * 
 * @param {string} requiredRole - Minimum required role (VIEWER, MEMBER, ADMIN, OWNER)
 */
export function requireWorkspaceRole(requiredRole) {
  return (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Unauthorized: Session required' });
      }

      if (req.user.isSuperAdmin) {
        return next(); // Super Admins bypass all workspace role checks
      }

      const workspaceId = req.params.workspaceId || req.query.workspaceId || req.body.workspaceId;
      if (!workspaceId) {
        return res.status(400).json({ error: 'Bad Request: Workspace ID is required' });
      }

      const membership = req.user.memberships.find(m => m.workspaceId === workspaceId);
      if (!membership) {
        return res.status(403).json({ error: 'Forbidden: You are not a member of this workspace' });
      }

      const roleHierarchy = {
        VIEWER: 0,
        MEMBER: 1,
        ADMIN: 2,
        OWNER: 3
      };

      if (roleHierarchy[membership.role] === undefined || roleHierarchy[membership.role] < roleHierarchy[requiredRole]) {
        return res.status(403).json({ error: 'Forbidden: Insufficient permissions inside this workspace' });
      }

      req.workspaceRole = membership.role;
      next();
    } catch (error) {
      console.error('Workspace authorization error:', error);
      res.status(500).json({ error: 'Internal Server Error during authorization' });
    }
  };
}

/**
 * Authorization Middleware: Enforces that the user is a system-level Super Admin.
 * Requires requireAuth to have run first.
 */
export function requireSuperAdmin(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'Unauthorized: Session required' });
  }

  if (!req.user.isSuperAdmin) {
    return res.status(403).json({ error: 'Forbidden: Super Admin privileges required' });
  }

  next();
}

/**
 * Authorization Middleware: Enforces that the user's plan includes a specific feature.
 * Requires requireAuth to have run first.
 * 
 * @param {string} featureKey - The plan feature flag to check (e.g. 'includeWebsiteManager')
 */
export function requirePlanFeature(featureKey) {
  return async (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Unauthorized: Session required' });
      }

      if (req.user.isSuperAdmin) {
        return next(); // Super Admins bypass all paywalls
      }

      // Check user's subscription from req.user context
      let plan = req.user.subscription?.plan;

      // If not attached, load from database
      if (!plan) {
        const sub = await prisma.subscription.findFirst({
          where: {
            userId: req.user.id,
            status: { in: ['ACTIVE', 'TRIAL'] }
          },
          include: { plan: true }
        });
        if (sub) plan = sub.plan;
      }

      // Fallback: If no subscription exists, check the default FREE plan features
      if (!plan) {
        plan = await prisma.plan.findFirst({
          where: { name: { in: ['FREE', 'Free'] } }
        });
      }

      // If still no plan found or feature is locked
      if (!plan || !plan[featureKey]) {
        return res.status(403).json({
          error: `Forbidden: Upgrade plan to access this feature`,
          featureLocked: featureKey
        });
      }

      next();
    } catch (error) {
      console.error('Plan feature validation error:', error);
      res.status(500).json({ error: 'Internal Server Error during paywall check' });
    }
  };
}
