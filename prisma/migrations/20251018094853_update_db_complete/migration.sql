/*
  Warnings:

  - You are about to drop the column `MembershipId` on the `permissions` table. All the data in the column will be lost.
  - You are about to drop the column `descriptions` on the `permissions` table. All the data in the column will be lost.
  - You are about to drop the column `workspaceId` on the `subscription_history` table. All the data in the column will be lost.
  - You are about to drop the column `endAt` on the `subscriptions` table. All the data in the column will be lost.
  - You are about to drop the column `startAt` on the `subscriptions` table. All the data in the column will be lost.
  - You are about to drop the column `workspaceId` on the `subscriptions` table. All the data in the column will be lost.
  - You are about to drop the column `billingDetails` on the `workspaces` table. All the data in the column will be lost.
  - You are about to drop the column `companyAddress` on the `workspaces` table. All the data in the column will be lost.
  - You are about to drop the `Plan` table. If the table is not empty, all the data it contains will be lost.
  - A unique constraint covering the columns `[userId,status]` on the table `subscriptions` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `userId` to the `payments` table without a default value. This is not possible if the table is not empty.
  - Added the required column `membershipId` to the `permissions` table without a default value. This is not possible if the table is not empty.
  - Added the required column `userId` to the `subscription_history` table without a default value. This is not possible if the table is not empty.
  - Added the required column `userId` to the `subscriptions` table without a default value. This is not possible if the table is not empty.
  - Added the required column `ownerId` to the `workspaces` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE `payments` DROP FOREIGN KEY `payments_planId_fkey`;

-- DropForeignKey
ALTER TABLE `payments` DROP FOREIGN KEY `payments_workspaceId_fkey`;

-- DropForeignKey
ALTER TABLE `permissions` DROP FOREIGN KEY `permissions_MembershipId_fkey`;

-- DropForeignKey
ALTER TABLE `subscription_history` DROP FOREIGN KEY `subscription_history_workspaceId_fkey`;

-- DropForeignKey
ALTER TABLE `subscriptions` DROP FOREIGN KEY `subscriptions_planId_fkey`;

-- DropForeignKey
ALTER TABLE `subscriptions` DROP FOREIGN KEY `subscriptions_workspaceId_fkey`;

-- DropIndex
DROP INDEX `payments_planId_fkey` ON `payments`;

-- DropIndex
DROP INDEX `payments_razorpayOrderId_idx` ON `payments`;

-- DropIndex
DROP INDEX `payments_razorpayPaymentId_idx` ON `payments`;

-- DropIndex
DROP INDEX `payments_workspaceId_idx` ON `payments`;

-- DropIndex
DROP INDEX `permissions_MembershipId_fkey` ON `permissions`;

-- DropIndex
DROP INDEX `subscription_history_workspaceId_fkey` ON `subscription_history`;

-- DropIndex
DROP INDEX `subscriptions_planId_fkey` ON `subscriptions`;

-- DropIndex
DROP INDEX `subscriptions_workspaceId_key` ON `subscriptions`;

-- AlterTable
ALTER TABLE `payments` ADD COLUMN `subscriptionId` VARCHAR(191) NULL,
    ADD COLUMN `userId` VARCHAR(191) NOT NULL,
    MODIFY `workspaceId` VARCHAR(191) NULL,
    MODIFY `status` ENUM('PENDING_PAYMENT', 'PAID_PAYMENT', 'FAILED_PAYMENT', 'REFUND_PAYMENT', 'PARTIALLY_REFUNDED') NOT NULL DEFAULT 'PENDING_PAYMENT';

-- AlterTable
ALTER TABLE `permissions` DROP COLUMN `MembershipId`,
    DROP COLUMN `descriptions`,
    ADD COLUMN `description` VARCHAR(191) NULL,
    ADD COLUMN `membershipId` VARCHAR(191) NOT NULL;

-- AlterTable
ALTER TABLE `posts` MODIFY `platform` ENUM('FACEBOOK', 'INSTAGRAM', 'LINKEDIN', 'GOOGLE_MY_BUSINESS', 'TWITTER', 'TIKTOK', 'PINTEREST', 'YOUTUBE') NOT NULL;

-- AlterTable
ALTER TABLE `replies` MODIFY `platform` ENUM('FACEBOOK', 'INSTAGRAM', 'LINKEDIN', 'GOOGLE_MY_BUSINESS', 'TWITTER', 'TIKTOK', 'PINTEREST', 'YOUTUBE') NOT NULL;

-- AlterTable
ALTER TABLE `social_profiles` MODIFY `platform` ENUM('FACEBOOK', 'INSTAGRAM', 'LINKEDIN', 'GOOGLE_MY_BUSINESS', 'TWITTER', 'TIKTOK', 'PINTEREST', 'YOUTUBE') NOT NULL;

-- AlterTable
ALTER TABLE `subscription_history` DROP COLUMN `workspaceId`,
    ADD COLUMN `userId` VARCHAR(191) NOT NULL,
    MODIFY `oldPlanId` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `subscriptions` DROP COLUMN `endAt`,
    DROP COLUMN `startAt`,
    DROP COLUMN `workspaceId`,
    ADD COLUMN `currentPeriodEnd` DATETIME(3) NULL,
    ADD COLUMN `currentPeriodStart` DATETIME(3) NULL,
    ADD COLUMN `usedAiCredits` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `usedWorkspaces` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `userId` VARCHAR(191) NOT NULL,
    MODIFY `status` ENUM('ACTIVE', 'CANCELLED', 'PAST_DUE', 'TRIAL', 'INCOMPLETE', 'PENDING', 'EXPIRED') NOT NULL DEFAULT 'ACTIVE';

-- AlterTable
ALTER TABLE `users` ADD COLUMN `subscriptionId` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `workspaces` DROP COLUMN `billingDetails`,
    DROP COLUMN `companyAddress`,
    ADD COLUMN `ownerId` VARCHAR(191) NOT NULL,
    ADD COLUMN `subscriptionId` VARCHAR(191) NULL;

-- DropTable
DROP TABLE `Plan`;

-- CreateTable
CREATE TABLE `plans` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `price` DECIMAL(65, 30) NOT NULL,
    `maxWorkspaces` INTEGER NOT NULL DEFAULT 1,
    `monthlyAiCredits` INTEGER NOT NULL DEFAULT 100,
    `maxSocialProfiles` INTEGER NOT NULL DEFAULT 5,
    `currency` VARCHAR(191) NOT NULL DEFAULT 'INR',
    `billingCycle` ENUM('MONTHLY', 'YEARLY', 'LIFETIME') NOT NULL DEFAULT 'MONTHLY',
    `features` JSON NOT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `plans_name_key`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ai_usage` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `workspaceId` VARCHAR(191) NULL,
    `subscriptionId` VARCHAR(191) NULL,
    `feature` VARCHAR(191) NOT NULL,
    `creditsUsed` INTEGER NOT NULL,
    `inputTokens` INTEGER NULL,
    `outputTokens` INTEGER NULL,
    `cost` DECIMAL(65, 30) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ai_usage_userId_idx`(`userId`),
    INDEX `ai_usage_workspaceId_idx`(`workspaceId`),
    INDEX `ai_usage_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `payments_userId_idx` ON `payments`(`userId`);

-- CreateIndex
CREATE INDEX `payments_subscriptionId_idx` ON `payments`(`subscriptionId`);

-- CreateIndex
CREATE INDEX `subscriptions_status_idx` ON `subscriptions`(`status`);

-- CreateIndex
CREATE INDEX `subscriptions_currentPeriodEnd_idx` ON `subscriptions`(`currentPeriodEnd`);

-- CreateIndex
CREATE UNIQUE INDEX `active_subscription_per_user` ON `subscriptions`(`userId`, `status`);

-- AddForeignKey
ALTER TABLE `workspaces` ADD CONSTRAINT `workspaces_ownerId_fkey` FOREIGN KEY (`ownerId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `workspaces` ADD CONSTRAINT `workspaces_subscriptionId_fkey` FOREIGN KEY (`subscriptionId`) REFERENCES `subscriptions`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `payments` ADD CONSTRAINT `payments_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `payments` ADD CONSTRAINT `payments_subscriptionId_fkey` FOREIGN KEY (`subscriptionId`) REFERENCES `subscriptions`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `payments` ADD CONSTRAINT `payments_workspaceId_fkey` FOREIGN KEY (`workspaceId`) REFERENCES `workspaces`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `payments` ADD CONSTRAINT `payments_planId_fkey` FOREIGN KEY (`planId`) REFERENCES `plans`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `permissions` ADD CONSTRAINT `permissions_membershipId_fkey` FOREIGN KEY (`membershipId`) REFERENCES `memberships`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `subscriptions` ADD CONSTRAINT `subscriptions_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `subscriptions` ADD CONSTRAINT `subscriptions_planId_fkey` FOREIGN KEY (`planId`) REFERENCES `plans`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `subscription_history` ADD CONSTRAINT `subscription_history_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ai_usage` ADD CONSTRAINT `ai_usage_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ai_usage` ADD CONSTRAINT `ai_usage_workspaceId_fkey` FOREIGN KEY (`workspaceId`) REFERENCES `workspaces`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ai_usage` ADD CONSTRAINT `ai_usage_subscriptionId_fkey` FOREIGN KEY (`subscriptionId`) REFERENCES `subscriptions`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
