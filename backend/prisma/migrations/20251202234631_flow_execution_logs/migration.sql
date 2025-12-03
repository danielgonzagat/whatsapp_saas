/*
  Warnings:

  - You are about to drop the column `isOnline` on the `Agent` table. All the data in the column will be lost.
  - You are about to drop the column `avatarUrl` on the `Contact` table. All the data in the column will be lost.
  - You are about to drop the column `description` on the `Flow` table. All the data in the column will be lost.
  - You are about to drop the column `triggerCondition` on the `Flow` table. All the data in the column will be lost.
  - You are about to drop the column `triggerType` on the `Flow` table. All the data in the column will be lost.
  - You are about to drop the column `isFull` on the `LaunchGroup` table. All the data in the column will be lost.
  - You are about to drop the column `jid` on the `LaunchGroup` table. All the data in the column will be lost.
  - You are about to drop the column `launchId` on the `LaunchGroup` table. All the data in the column will be lost.
  - You are about to drop the column `memberCount` on the `LaunchGroup` table. All the data in the column will be lost.
  - You are about to drop the column `voiceId` on the `VoiceJob` table. All the data in the column will be lost.
  - You are about to drop the column `jitterMax` on the `Workspace` table. All the data in the column will be lost.
  - You are about to drop the column `jitterMin` on the `Workspace` table. All the data in the column will be lost.
  - You are about to drop the column `providerSettings` on the `Workspace` table. All the data in the column will be lost.
  - You are about to drop the `Campaign` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `FlowExecution` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Launch` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Tag` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Variable` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `_ContactToTag` table. If the table is not empty, all the data it contains will be lost.
  - Added the required column `trigger` to the `Flow` table without a default value. This is not possible if the table is not empty.
  - Added the required column `launcherId` to the `LaunchGroup` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `LaunchGroup` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `Stage` table without a default value. This is not possible if the table is not empty.
  - Made the column `color` on table `Stage` required. This step will fail if there are existing NULL values in that column.
  - Added the required column `profileId` to the `VoiceJob` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "Campaign" DROP CONSTRAINT "Campaign_workspaceId_fkey";

-- DropForeignKey
ALTER TABLE "FlowExecution" DROP CONSTRAINT "FlowExecution_contactId_fkey";

-- DropForeignKey
ALTER TABLE "FlowExecution" DROP CONSTRAINT "FlowExecution_flowId_fkey";

-- DropForeignKey
ALTER TABLE "FlowExecution" DROP CONSTRAINT "FlowExecution_workspaceId_fkey";

-- DropForeignKey
ALTER TABLE "Launch" DROP CONSTRAINT "Launch_workspaceId_fkey";

-- DropForeignKey
ALTER TABLE "LaunchGroup" DROP CONSTRAINT "LaunchGroup_launchId_fkey";

-- DropForeignKey
ALTER TABLE "Tag" DROP CONSTRAINT "Tag_workspaceId_fkey";

-- DropForeignKey
ALTER TABLE "Variable" DROP CONSTRAINT "Variable_workspaceId_fkey";

-- DropForeignKey
ALTER TABLE "_ContactToTag" DROP CONSTRAINT "_ContactToTag_A_fkey";

-- DropForeignKey
ALTER TABLE "_ContactToTag" DROP CONSTRAINT "_ContactToTag_B_fkey";

-- AlterTable
ALTER TABLE "Agent" DROP COLUMN "isOnline";

-- AlterTable
ALTER TABLE "Contact" DROP COLUMN "avatarUrl",
ADD COLUMN     "tags" TEXT[],
ALTER COLUMN "customFields" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Deal" ADD COLUMN     "priority" TEXT NOT NULL DEFAULT 'MEDIUM',
ALTER COLUMN "status" SET DEFAULT 'OPEN';

-- AlterTable
ALTER TABLE "Flow" DROP COLUMN "description",
DROP COLUMN "triggerCondition",
DROP COLUMN "triggerType",
ADD COLUMN     "keywords" TEXT[],
ADD COLUMN     "trigger" TEXT NOT NULL,
ALTER COLUMN "isActive" SET DEFAULT false;

-- AlterTable
ALTER TABLE "LaunchGroup" DROP COLUMN "isFull",
DROP COLUMN "jid",
DROP COLUMN "launchId",
DROP COLUMN "memberCount",
ADD COLUMN     "capacity" INTEGER NOT NULL DEFAULT 1024,
ADD COLUMN     "current" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "launcherId" TEXT NOT NULL,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL;

-- AlterTable
ALTER TABLE "Pipeline" ADD COLUMN     "isDefault" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Stage" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL,
ALTER COLUMN "color" SET NOT NULL,
ALTER COLUMN "color" SET DEFAULT '#E5E7EB';

-- AlterTable
ALTER TABLE "VoiceJob" DROP COLUMN "voiceId",
ADD COLUMN     "duration" INTEGER,
ADD COLUMN     "profileId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "Workspace" DROP COLUMN "jitterMax",
DROP COLUMN "jitterMin",
DROP COLUMN "providerSettings";

-- DropTable
DROP TABLE "Campaign";

-- DropTable
DROP TABLE "FlowExecution";

-- DropTable
DROP TABLE "Launch";

-- DropTable
DROP TABLE "Tag";

-- DropTable
DROP TABLE "Variable";

-- DropTable
DROP TABLE "_ContactToTag";

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "name" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GroupLauncher" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "joins" INTEGER NOT NULL DEFAULT 0,
    "workspaceId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GroupLauncher_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MediaJob" (
    "id" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "inputUrl" TEXT NOT NULL,
    "prompt" TEXT,
    "outputUrl" TEXT,
    "workspaceId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MediaJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VoiceProfile" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "voiceId" TEXT NOT NULL,
    "sampleUrl" TEXT,
    "workspaceId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VoiceProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefreshToken" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "revoked" BOOLEAN NOT NULL DEFAULT false,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "agentId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_UserToWorkspace" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "GroupLauncher_slug_key" ON "GroupLauncher"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "RefreshToken_token_key" ON "RefreshToken"("token");

-- CreateIndex
CREATE UNIQUE INDEX "_UserToWorkspace_AB_unique" ON "_UserToWorkspace"("A", "B");

-- CreateIndex
CREATE INDEX "_UserToWorkspace_B_index" ON "_UserToWorkspace"("B");

-- AddForeignKey
ALTER TABLE "GroupLauncher" ADD CONSTRAINT "GroupLauncher_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LaunchGroup" ADD CONSTRAINT "LaunchGroup_launcherId_fkey" FOREIGN KEY ("launcherId") REFERENCES "GroupLauncher"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaJob" ADD CONSTRAINT "MediaJob_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VoiceProfile" ADD CONSTRAINT "VoiceProfile_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VoiceJob" ADD CONSTRAINT "VoiceJob_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "VoiceProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_UserToWorkspace" ADD CONSTRAINT "_UserToWorkspace_A_fkey" FOREIGN KEY ("A") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_UserToWorkspace" ADD CONSTRAINT "_UserToWorkspace_B_fkey" FOREIGN KEY ("B") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
