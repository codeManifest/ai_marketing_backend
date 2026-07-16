/*
  Warnings:

  - You are about to drop the column `userType` on the `users` table. All the data in the column will be lost.
  - Added the required column `Status` to the `workspaces` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE `users` DROP COLUMN `userType`;

-- AlterTable
ALTER TABLE `workspaces` ADD COLUMN `Status` ENUM('PENDING_PAYMENT', 'PAID_PAYMENT', 'FAILED_PAYMENT') NOT NULL;
