-- AlterTable
ALTER TABLE `plans` ADD COLUMN `isTrial` BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE `subscriptions` ADD COLUMN `isTrial` BOOLEAN NOT NULL DEFAULT false;
