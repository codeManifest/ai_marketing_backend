-- CreateTable
CREATE TABLE `content_categories` (
    `id` VARCHAR(191) NOT NULL,
    `workspaceId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `description` VARCHAR(191) NULL,
    `color` VARCHAR(191) NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ai_prompts` (
    `id` VARCHAR(191) NOT NULL,
    `workspaceId` VARCHAR(191) NOT NULL,
    `categoryId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `prompt` TEXT NOT NULL,
    `description` VARCHAR(191) NULL,
    `exampleOutput` TEXT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `temperature` DOUBLE NOT NULL DEFAULT 0.7,
    `maxTokens` INTEGER NOT NULL DEFAULT 1000,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `post_templates` (
    `id` VARCHAR(191) NOT NULL,
    `workspaceId` VARCHAR(191) NOT NULL,
    `categoryId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `template` TEXT NOT NULL,
    `description` VARCHAR(191) NULL,
    `variables` JSON NULL,
    `example` TEXT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `content_plans` (
    `id` VARCHAR(191) NOT NULL,
    `workspaceId` VARCHAR(191) NOT NULL,
    `categoryId` VARCHAR(191) NOT NULL,
    `promptId` VARCHAR(191) NULL,
    `templateId` VARCHAR(191) NULL,
    `name` VARCHAR(191) NOT NULL,
    `description` VARCHAR(191) NULL,
    `topics` TEXT NOT NULL,
    `tone` VARCHAR(191) NULL,
    `language` VARCHAR(191) NOT NULL DEFAULT 'en',
    `frequency` ENUM('DAILY', 'WEEKLY', 'MONTHLY', 'CUSTOM') NOT NULL,
    `postsPerWeek` INTEGER NOT NULL DEFAULT 1,
    `preferredDays` JSON NULL,
    `preferredTimes` JSON NULL,
    `timezone` VARCHAR(191) NOT NULL DEFAULT 'UTC',
    `platforms` JSON NOT NULL,
    `socialProfileIds` JSON NULL,
    `autoGenerate` BOOLEAN NOT NULL DEFAULT true,
    `requireApproval` BOOLEAN NOT NULL DEFAULT false,
    `autoPost` BOOLEAN NOT NULL DEFAULT false,
    `status` ENUM('ACTIVE', 'PAUSED', 'COMPLETED', 'CANCELLED') NOT NULL DEFAULT 'ACTIVE',
    `lastGeneratedAt` DATETIME(3) NULL,
    `maxPostsPerMonth` INTEGER NULL,
    `postsGenerated` INTEGER NOT NULL DEFAULT 0,
    `postsPosted` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `generated_posts` (
    `id` VARCHAR(191) NOT NULL,
    `contentPlanId` VARCHAR(191) NOT NULL,
    `workspaceId` VARCHAR(191) NOT NULL,
    `socialProfileId` VARCHAR(191) NULL,
    `title` VARCHAR(191) NULL,
    `content` TEXT NOT NULL,
    `mediaUrls` JSON NULL,
    `hashtags` TEXT NULL,
    `topics` JSON NULL,
    `scheduledFor` DATETIME(3) NULL,
    `postedAt` DATETIME(3) NULL,
    `status` ENUM('DRAFT', 'GENERATED', 'APPROVED', 'REJECTED', 'SCHEDULED', 'POSTED', 'FAILED') NOT NULL DEFAULT 'DRAFT',
    `aiPrompt` TEXT NULL,
    `aiModel` VARCHAR(191) NULL,
    `promptTokens` INTEGER NULL,
    `completionTokens` INTEGER NULL,
    `requiresApproval` BOOLEAN NOT NULL DEFAULT false,
    `approvedBy` VARCHAR(191) NULL,
    `approvedAt` DATETIME(3) NULL,
    `rejectionReason` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `postId` VARCHAR(191) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `bulk_content_sessions` (
    `id` VARCHAR(191) NOT NULL,
    `workspaceId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `description` VARCHAR(191) NULL,
    `categories` JSON NULL,
    `totalPosts` INTEGER NOT NULL,
    `timeframeDays` INTEGER NOT NULL,
    `platforms` JSON NOT NULL,
    `status` ENUM('PENDING', 'GENERATING', 'COMPLETED', 'FAILED', 'CANCELLED') NOT NULL DEFAULT 'PENDING',
    `progress` DOUBLE NOT NULL DEFAULT 0,
    `postsGenerated` INTEGER NOT NULL DEFAULT 0,
    `generatedPosts` JSON NULL,
    `startedAt` DATETIME(3) NULL,
    `completedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `content_calendar` (
    `id` VARCHAR(191) NOT NULL,
    `workspaceId` VARCHAR(191) NOT NULL,
    `date` DATETIME(3) NOT NULL,
    `posts` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `content_calendar_workspaceId_date_key`(`workspaceId`, `date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `content_categories` ADD CONSTRAINT `content_categories_workspaceId_fkey` FOREIGN KEY (`workspaceId`) REFERENCES `workspaces`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ai_prompts` ADD CONSTRAINT `ai_prompts_workspaceId_fkey` FOREIGN KEY (`workspaceId`) REFERENCES `workspaces`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ai_prompts` ADD CONSTRAINT `ai_prompts_categoryId_fkey` FOREIGN KEY (`categoryId`) REFERENCES `content_categories`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `post_templates` ADD CONSTRAINT `post_templates_workspaceId_fkey` FOREIGN KEY (`workspaceId`) REFERENCES `workspaces`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `post_templates` ADD CONSTRAINT `post_templates_categoryId_fkey` FOREIGN KEY (`categoryId`) REFERENCES `content_categories`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `content_plans` ADD CONSTRAINT `content_plans_workspaceId_fkey` FOREIGN KEY (`workspaceId`) REFERENCES `workspaces`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `content_plans` ADD CONSTRAINT `content_plans_categoryId_fkey` FOREIGN KEY (`categoryId`) REFERENCES `content_categories`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `content_plans` ADD CONSTRAINT `content_plans_promptId_fkey` FOREIGN KEY (`promptId`) REFERENCES `ai_prompts`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `content_plans` ADD CONSTRAINT `content_plans_templateId_fkey` FOREIGN KEY (`templateId`) REFERENCES `post_templates`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `generated_posts` ADD CONSTRAINT `generated_posts_contentPlanId_fkey` FOREIGN KEY (`contentPlanId`) REFERENCES `content_plans`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `generated_posts` ADD CONSTRAINT `generated_posts_workspaceId_fkey` FOREIGN KEY (`workspaceId`) REFERENCES `workspaces`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `generated_posts` ADD CONSTRAINT `generated_posts_socialProfileId_fkey` FOREIGN KEY (`socialProfileId`) REFERENCES `social_profiles`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `generated_posts` ADD CONSTRAINT `generated_posts_postId_fkey` FOREIGN KEY (`postId`) REFERENCES `posts`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `bulk_content_sessions` ADD CONSTRAINT `bulk_content_sessions_workspaceId_fkey` FOREIGN KEY (`workspaceId`) REFERENCES `workspaces`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `content_calendar` ADD CONSTRAINT `content_calendar_workspaceId_fkey` FOREIGN KEY (`workspaceId`) REFERENCES `workspaces`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
