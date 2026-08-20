import { Router } from 'express';
import { requireAuth, requirePlanFeature } from '../middlewares/auth.middleware.js';

// Controller imports
import { 
  createWorkspace, 
  listWorkspaces, 
  getWorkspaceDetails, 
  updateWorkspace, 
  deleteWorkspace, 
  updateWorkspaceAddress, 
  getWorkspaceSettings, 
  updateWorkspaceSettings, 
  getWorkspaceStatusDetails, 
  updateBillingDetailsController, 
  getWorkspacePermissions,
  getLimits, 
  scrapeBrand, 
  onboarding 
} from '../controllers/workspace/workspace.controller.js';

import {
  listMembers,
  inviteMember,
  updateMember,
  removeMember,
  listRoles,
  createOrUpdateRole,
  deleteRole
} from '../controllers/workspace/member.controller.js';

import {
  listCategories,
  createCategory,
  deleteCategory,
  listPrompts,
  createPrompt,
  updatePrompt,
  deletePrompt,
  listTemplates,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  listContentPlans,
  createContentPlan,
  updateContentPlan,
  actionContentPlan,
  deleteContentPlan,
  runContentPlan,
  getContentPlanStats
} from '../controllers/workspace/content.controller.js';

import {
  listLeads,
  createLead,
  updateLead,
  deleteLead,
  importLeads,
  createLeadTask,
  updateLeadTask,
  deleteLeadTask,
  createLeadNote,
  updateLeadNote,
  deleteLeadNote,
  createLeadDeal,
  updateLeadDeal,
  deleteLeadDeal
} from '../controllers/workspace/crm.controller.js';

import {
  listCampaigns,
  createCampaign,
  updateCampaign,
  deleteCampaign,
  syncCampaigns
} from '../controllers/workspace/ads.controller.js';

import {
  listDomains,
  addDomain,
  verifyDomain,
  deleteDomain,
  listBlogs,
  createBlog,
  updateBlog,
  deleteBlog,
  generateBlog,
  updateWidgetConfig,
  getWebAnalytics,
  querySEO
} from '../controllers/workspace/web.controller.js';

import {
  listProfiles,
  disconnectProfile,
  updateProfileSettings,
  listCredentials,
  saveCredentials,
  deleteCredentials,
  runAutopilot
} from '../controllers/workspace/social.controller.js';

import {
  listForms,
  createForm,
  updateForm,
  deleteForm,
  listSubmissions,
  listFunnels,
  createFunnel,
  getFunnelStats,
  updateFunnel,
  deleteFunnel
} from '../controllers/workspace/funnel.controller.js';

import {
  listPosts,
  createPost,
  getPostDetails,
  updatePost,
  deletePost,
  deleteBulkGroup,
  publishPost,
  manageMedia,
  listGeneratedPosts,
  saveGeneratedPost,
  updateGeneratedPost,
  deleteGeneratedPost,
  approveGenerated,
  rejectGenerated
} from '../controllers/workspace/post.controller.js';

import {
  listComments,
  replyComment,
  listNotifications,
  updateNotifications,
  createNotification,
  listGlobalTemplates
} from '../controllers/workspace/misc.controller.js';

import {
  getStats,
  getAnalytics
} from '../controllers/workspace/analytics.controller.js';

const router = Router();

// Public routes (accessible during website audit, landing page demo, and onboarding setup)
router.post('/workspaces/scrape', scrapeBrand);

// Enforce authentication on protected workspace routes
router.use(requireAuth);

// ==========================================
// 1. CORE WORKSPACE ROUTING
// ==========================================
router.post('/workspaces', createWorkspace);
router.get('/workspaces', listWorkspaces);
router.get('/workspaces/limits', getLimits);
router.post('/workspaces/onboarding', onboarding);

router.get('/workspaces/:workspaceId', getWorkspaceDetails);
router.put('/workspaces/:workspaceId', updateWorkspace);
router.delete('/workspaces/:workspaceId', deleteWorkspace);

router.get('/workspaces/:workspaceId/settings', getWorkspaceSettings);
router.put('/workspaces/:workspaceId/settings', updateWorkspaceSettings);
router.put('/workspaces/:workspaceId/company-address', updateWorkspaceAddress);
router.get('/workspaces/:workspaceId/status', getWorkspaceStatusDetails);
router.patch('/workspaces/:workspaceId/billing-details', updateBillingDetailsController);
router.get('/workspaces/:workspaceId/permissions', getWorkspacePermissions);

// ==========================================
// 2. MEMBER & ROLE MANAGEMENT
// ==========================================
router.get('/workspaces/:workspaceId/members', listMembers);
router.post('/workspaces/:workspaceId/members', inviteMember);
router.put('/workspaces/:workspaceId/members', updateMember);
router.delete('/workspaces/:workspaceId/members', removeMember);

router.get('/workspaces/:workspaceId/roles', listRoles);
router.post('/workspaces/:workspaceId/roles', createOrUpdateRole);
router.delete('/workspaces/:workspaceId/roles', deleteRole);

// ==========================================
// 3. CONTENT PLANNING & ASSETS
// ==========================================
router.get('/workspaces/:workspaceId/content-categories', listCategories);
router.post('/workspaces/:workspaceId/content-categories', createCategory);
router.delete('/workspaces/:workspaceId/content-categories', deleteCategory);

router.get('/workspaces/:workspaceId/ai-prompts', listPrompts);
router.post('/workspaces/:workspaceId/ai-prompts', createPrompt);
router.put('/workspaces/:workspaceId/ai-prompts', updatePrompt);
router.delete('/workspaces/:workspaceId/ai-prompts', deletePrompt);

router.get('/workspaces/:workspaceId/post-templates', listTemplates);
router.post('/workspaces/:workspaceId/post-templates', createTemplate);
router.put('/workspaces/:workspaceId/post-templates', updateTemplate);
router.delete('/workspaces/:workspaceId/post-templates', deleteTemplate);

router.get('/workspaces/:workspaceId/content-plans', listContentPlans);
router.post('/workspaces/:workspaceId/content-plans', createContentPlan);
router.put('/workspaces/:workspaceId/content-plans', updateContentPlan);
router.delete('/workspaces/:workspaceId/content-plans', deleteContentPlan);
router.post('/workspaces/:workspaceId/content-plans/action', actionContentPlan);
router.post('/workspaces/:workspaceId/content-plans/:planId/run', runContentPlan);
router.get('/workspaces/:workspaceId/content-plans/:planId/stats', getContentPlanStats);

// ==========================================
// 4. CRM (LEADS, TASKS, NOTES, DEALS)
// ==========================================
router.get('/workspaces/:workspaceId/leads', listLeads);
router.post('/workspaces/:workspaceId/leads', createLead);
router.patch('/workspaces/:workspaceId/leads/:leadId', updateLead);
router.delete('/workspaces/:workspaceId/leads/:leadId', deleteLead);
router.post('/workspaces/:workspaceId/leads/import', importLeads);

router.post('/workspaces/:workspaceId/leads/:leadId/tasks', createLeadTask);
router.put('/workspaces/:workspaceId/leads/tasks/:taskId', updateLeadTask);
router.delete('/workspaces/:workspaceId/leads/tasks/:taskId', deleteLeadTask);

router.post('/workspaces/:workspaceId/leads/:leadId/notes', createLeadNote);
router.put('/workspaces/:workspaceId/leads/notes/:noteId', updateLeadNote);
router.delete('/workspaces/:workspaceId/leads/notes/:noteId', deleteLeadNote);

router.post('/workspaces/:workspaceId/leads/:leadId/deals', createLeadDeal);
router.put('/workspaces/:workspaceId/leads/deals/:dealId', updateLeadDeal);
router.delete('/workspaces/:workspaceId/leads/deals/:dealId', deleteLeadDeal);

// ==========================================
// 5. AD MANAGER
// ==========================================
router.get('/workspaces/:workspaceId/ad-campaigns', listCampaigns);
router.post('/workspaces/:workspaceId/ad-campaigns', createCampaign);
router.patch('/workspaces/:workspaceId/ad-campaigns/:campaignId', updateCampaign);
router.delete('/workspaces/:workspaceId/ad-campaigns/:campaignId', deleteCampaign);
router.post('/workspaces/:workspaceId/ad-campaigns/sync', syncCampaigns);

// ==========================================
// 6. WEBSITES, BLOGS & WEB FUNNELS
// ==========================================
router.use('/workspaces/:workspaceId/websites', requirePlanFeature('includeWebsiteManager'));
router.use('/workspaces/:workspaceId/forms', requirePlanFeature('includeWebsiteManager'));
router.use('/workspaces/:workspaceId/funnels', requirePlanFeature('includeWebsiteManager'));

router.get('/workspaces/:workspaceId/websites', listDomains);
router.post('/workspaces/:workspaceId/websites', addDomain);
router.delete('/workspaces/:workspaceId/websites/:domainId', deleteDomain);
router.post('/workspaces/:workspaceId/websites/verify', verifyDomain);

router.get('/workspaces/:workspaceId/websites/:domainId/blogs', listBlogs);
router.post('/workspaces/:workspaceId/websites/:domainId/blogs', createBlog);
router.put('/workspaces/:workspaceId/websites/:domainId/blogs/:blogId', updateBlog);
router.delete('/workspaces/:workspaceId/websites/:domainId/blogs/:blogId', deleteBlog);
router.post('/workspaces/:workspaceId/websites/:domainId/blogs/ai-generate', generateBlog);

router.put('/workspaces/:workspaceId/websites/:domainId/widget', updateWidgetConfig);
router.get('/workspaces/:workspaceId/websites/:domainId/analytics', getWebAnalytics);
router.post('/workspaces/:workspaceId/seo', querySEO);

// ==========================================
// 7. SOCIAL CHANNELS & CREDENTIALS
// ==========================================
router.get('/workspaces/:workspaceId/social', listProfiles);
router.delete('/workspaces/:workspaceId/social', disconnectProfile);
router.patch('/workspaces/:workspaceId/social/profiles/:profileId', updateProfileSettings);

router.get('/workspaces/:workspaceId/social/credentials', listCredentials);
router.post('/workspaces/:workspaceId/social/credentials', saveCredentials);
router.delete('/workspaces/:workspaceId/social/credentials', deleteCredentials);

router.post('/workspaces/:workspaceId/social/autopilot', runAutopilot);

// ==========================================
// 8. FORMS & FUNNELS
// ==========================================
router.get('/workspaces/:workspaceId/forms', listForms);
router.post('/workspaces/:workspaceId/forms', createForm);
router.put('/workspaces/:workspaceId/forms/:formId', updateForm);
router.delete('/workspaces/:workspaceId/forms/:formId', deleteForm);
router.get('/workspaces/:workspaceId/forms/:formId/submissions', listSubmissions);

router.get('/workspaces/:workspaceId/funnels', listFunnels);
router.post('/workspaces/:workspaceId/funnels', createFunnel);
router.get('/workspaces/:workspaceId/funnels/:funnelId', getFunnelStats);
router.put('/workspaces/:workspaceId/funnels/:funnelId', updateFunnel);
router.delete('/workspaces/:workspaceId/funnels/:funnelId', deleteFunnel);

// ==========================================
// 9. ACTIVE & BULK SOCIAL POSTS
// ==========================================
router.get('/workspaces/:workspaceId/posts', listPosts);
router.post('/workspaces/:workspaceId/posts', createPost);
router.get('/workspaces/:workspaceId/posts/:postId', getPostDetails);
router.put('/workspaces/:workspaceId/posts/:postId', updatePost);
router.delete('/workspaces/:workspaceId/posts/:postId', deletePost);
router.delete('/workspaces/:workspaceId/posts/bulk/:bulkId', deleteBulkGroup);
router.post('/workspaces/:workspaceId/posts/:postId/publish', publishPost);
router.put('/workspaces/:workspaceId/posts/:postId/manage-image', manageMedia);
router.delete('/workspaces/:workspaceId/posts/:postId/manage-image', manageMedia);

// ==========================================
// 10. AI GENERATED STUDIO POSTS
// ==========================================
router.get('/workspaces/:workspaceId/generated-posts', listGeneratedPosts);
router.post('/workspaces/:workspaceId/generated-posts', saveGeneratedPost);
router.put('/workspaces/:workspaceId/generated-posts', updateGeneratedPost);
router.delete('/workspaces/:workspaceId/generated-posts', deleteGeneratedPost);
router.patch('/workspaces/:workspaceId/generated-posts', (req, res) => {
  if (req.body.action === 'approve') return approveGenerated(req, res);
  if (req.body.action === 'reject') return rejectGenerated(req, res);
  return res.status(400).json({ error: "Invalid action" });
});

// ==========================================
// 11. INBOX COMMENTS & WORKSPACE NOTIFICATIONS
// ==========================================
router.get('/workspaces/:workspaceId/comments', listComments);
router.post('/workspaces/:workspaceId/comments', replyComment);

router.get('/workspaces/:workspaceId/notifications', listNotifications);
router.put('/workspaces/:workspaceId/notifications', updateNotifications);
router.post('/workspaces/:workspaceId/notifications', createNotification);

// ==========================================
// 12. GENERAL STATS & CORE ANALYTICS
// ==========================================
router.get('/workspaces/:workspaceId/stats', getStats);
router.get('/workspaces/:workspaceId/analytics', getAnalytics);

// ==========================================
// 13. GLOBAL CONTEXTS (TEMPLATE LIBRARY)
// ==========================================
router.get('/global-templates', listGlobalTemplates);

export default router;
