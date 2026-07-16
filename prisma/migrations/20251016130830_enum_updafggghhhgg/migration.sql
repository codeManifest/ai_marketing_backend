/*
  Warnings:

  - You are about to drop the column `Status` on the `workspaces` table. All the data in the column will be lost.
  - Added the required column `status` to the `workspaces` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE `workspaces` DROP COLUMN `Status`,
    ADD COLUMN `status` ENUM('PENDING_PAYMENT', 'PAID_PAYMENT', 'FAILED_PAYMENT') NOT NULL;
