-- CreateEnum
CREATE TYPE "ProjectStatus" AS ENUM ('planned', 'registration', 'done', 'archived');

-- CreateEnum
CREATE TYPE "ProjectFormat" AS ENUM ('offline', 'online', 'hybrid');

-- AlterTable
ALTER TABLE "Report" ADD COLUMN     "projectId" TEXT;

-- CreateTable
CREATE TABLE "ProjectType" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "typeId" TEXT NOT NULL,
    "format" "ProjectFormat",
    "status" "ProjectStatus" NOT NULL DEFAULT 'planned',
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "city" TEXT,
    "venue" TEXT,
    "ownerTeam" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "demo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectMetrics" (
    "projectId" TEXT NOT NULL,
    "registrants" INTEGER,
    "submissions" INTEGER,
    "campaignDays" INTEGER,
    "channelCount" INTEGER,
    "responses" INTEGER,
    "responseRate" DOUBLE PRECISION,
    "orgScore10" DOUBLE PRECISION,
    "nps" DOUBLE PRECISION,
    "composite10" DOUBLE PRECISION,
    "weakestZone" TEXT,
    "weakestZoneScore10" DOUBLE PRECISION,
    "strongestZone" TEXT,
    "strongestZoneScore10" DOUBLE PRECISION,
    "topPraiseTheme" TEXT,
    "topPainTheme" TEXT,
    "topChannelGroup" TEXT,
    "topChannelShare" DOUBLE PRECISION,
    "topChannel" TEXT,
    "topChannelOwnShare" DOUBLE PRECISION,
    "hhiGroups" DOUBLE PRECISION,
    "concentrationLevel" TEXT,
    "peakDayShare" DOUBLE PRECISION,
    "isBursty" BOOLEAN,
    "topUniversityName" TEXT,
    "topUniversityShare" DOUBLE PRECISION,
    "newToOrgShare" DOUBLE PRECISION,
    "internshipShare" DOUBLE PRECISION,
    "avgAge" DOUBLE PRECISION,
    "duplicateRate" DOUBLE PRECISION,
    "audienceStage" TEXT,
    "ageBand" TEXT,
    "hasRegistrationReport" BOOLEAN NOT NULL DEFAULT false,
    "hasFeedbackReport" BOOLEAN NOT NULL DEFAULT false,
    "hasWarnings" BOOLEAN NOT NULL DEFAULT false,
    "reportVisibilities" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "reportsUpdatedAt" TIMESTAMP(3),
    "metricsVersion" INTEGER NOT NULL,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectMetrics_pkey" PRIMARY KEY ("projectId")
);

-- CreateTable
CREATE TABLE "ThemeMapping" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "rawLabel" TEXT NOT NULL,
    "canonical" TEXT,
    "confirmed" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "ThemeMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppSetting" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppSetting_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "SavedView" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "query" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SavedView_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProjectType_key_key" ON "ProjectType"("key");

-- CreateIndex
CREATE UNIQUE INDEX "Project_slug_key" ON "Project"("slug");

-- CreateIndex
CREATE INDEX "Project_typeId_idx" ON "Project"("typeId");

-- CreateIndex
CREATE INDEX "Project_status_idx" ON "Project"("status");

-- CreateIndex
CREATE INDEX "Project_startDate_idx" ON "Project"("startDate");

-- CreateIndex
CREATE INDEX "ProjectMetrics_registrants_idx" ON "ProjectMetrics"("registrants");

-- CreateIndex
CREATE INDEX "ProjectMetrics_orgScore10_idx" ON "ProjectMetrics"("orgScore10");

-- CreateIndex
CREATE INDEX "ProjectMetrics_weakestZone_idx" ON "ProjectMetrics"("weakestZone");

-- CreateIndex
CREATE INDEX "ProjectMetrics_topChannelGroup_idx" ON "ProjectMetrics"("topChannelGroup");

-- CreateIndex
CREATE INDEX "ProjectMetrics_concentrationLevel_idx" ON "ProjectMetrics"("concentrationLevel");

-- CreateIndex
CREATE UNIQUE INDEX "ThemeMapping_reportId_kind_rawLabel_key" ON "ThemeMapping"("reportId", "kind", "rawLabel");

-- CreateIndex
CREATE INDEX "Report_projectId_idx" ON "Report"("projectId");

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_typeId_fkey" FOREIGN KEY ("typeId") REFERENCES "ProjectType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectMetrics" ADD CONSTRAINT "ProjectMetrics_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ThemeMapping" ADD CONSTRAINT "ThemeMapping_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "Report"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Starter project types (more can be added by an admin).
INSERT INTO "ProjectType" ("id", "key", "name", "sortOrder") VALUES
  ('ptype_forum', 'forum', 'Forum', 10),
  ('ptype_case', 'case_championship', 'Case championship', 20),
  ('ptype_hackathon', 'hackathon', 'Hackathon', 30)
ON CONFLICT ("key") DO NOTHING;
