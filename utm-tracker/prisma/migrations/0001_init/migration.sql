-- CreateEnum
CREATE TYPE "AttributionStatus" AS ENUM ('exact', 'estimated', 'unknown');

-- CreateEnum
CREATE TYPE "WebhookStatus" AS ENUM ('success', 'failed', 'missing_click_id', 'duplicated', 'unauthorized');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Campaign" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "name" TEXT NOT NULL,
    "label" TEXT,
    "description" TEXT,
    "funnel" TEXT,
    "season" TEXT,
    "type" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Campaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrackingLink" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "campaignId" TEXT,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "destinationUrl" TEXT NOT NULL,
    "utmSource" TEXT,
    "utmMedium" TEXT,
    "utmCampaign" TEXT,
    "utmContent" TEXT,
    "utmTerm" TEXT,
    "customParams" JSONB,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrackingLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClickEvent" (
    "id" TEXT NOT NULL,
    "trackingLinkId" TEXT NOT NULL,
    "clickId" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userAgent" TEXT,
    "ipHash" TEXT,
    "referrer" TEXT,
    "country" TEXT,
    "city" TEXT,
    "device" TEXT,
    "browser" TEXT,
    "os" TEXT,
    "isUnique" BOOLEAN NOT NULL DEFAULT true,
    "rawParams" JSONB,

    CONSTRAINT "ClickEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Lead" (
    "id" TEXT NOT NULL,
    "trackingLinkId" TEXT,
    "clickEventId" TEXT,
    "clickId" TEXT,
    "name" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "formName" TEXT,
    "pageUrl" TEXT,
    "utmSource" TEXT,
    "utmMedium" TEXT,
    "utmCampaign" TEXT,
    "utmContent" TEXT,
    "utmTerm" TEXT,
    "submittedAt" TIMESTAMP(3) NOT NULL,
    "sourcePayload" JSONB NOT NULL,
    "attributionStatus" "AttributionStatus" NOT NULL DEFAULT 'unknown',
    "dedupeKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Lead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookLog" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'tilda',
    "payload" JSONB NOT NULL,
    "status" "WebhookStatus" NOT NULL,
    "message" TEXT,
    "leadId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebhookLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "Campaign_userId_idx" ON "Campaign"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "TrackingLink_slug_key" ON "TrackingLink"("slug");

-- CreateIndex
CREATE INDEX "TrackingLink_userId_idx" ON "TrackingLink"("userId");

-- CreateIndex
CREATE INDEX "TrackingLink_campaignId_idx" ON "TrackingLink"("campaignId");

-- CreateIndex
CREATE INDEX "TrackingLink_slug_idx" ON "TrackingLink"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "ClickEvent_clickId_key" ON "ClickEvent"("clickId");

-- CreateIndex
CREATE INDEX "ClickEvent_trackingLinkId_idx" ON "ClickEvent"("trackingLinkId");

-- CreateIndex
CREATE INDEX "ClickEvent_clickId_idx" ON "ClickEvent"("clickId");

-- CreateIndex
CREATE INDEX "ClickEvent_timestamp_idx" ON "ClickEvent"("timestamp");

-- CreateIndex
CREATE INDEX "ClickEvent_ipHash_idx" ON "ClickEvent"("ipHash");

-- CreateIndex
CREATE UNIQUE INDEX "Lead_dedupeKey_key" ON "Lead"("dedupeKey");

-- CreateIndex
CREATE INDEX "Lead_trackingLinkId_idx" ON "Lead"("trackingLinkId");

-- CreateIndex
CREATE INDEX "Lead_clickEventId_idx" ON "Lead"("clickEventId");

-- CreateIndex
CREATE INDEX "Lead_clickId_idx" ON "Lead"("clickId");

-- CreateIndex
CREATE INDEX "Lead_submittedAt_idx" ON "Lead"("submittedAt");

-- CreateIndex
CREATE INDEX "WebhookLog_createdAt_idx" ON "WebhookLog"("createdAt");

-- CreateIndex
CREATE INDEX "WebhookLog_status_idx" ON "WebhookLog"("status");

-- AddForeignKey
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrackingLink" ADD CONSTRAINT "TrackingLink_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrackingLink" ADD CONSTRAINT "TrackingLink_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClickEvent" ADD CONSTRAINT "ClickEvent_trackingLinkId_fkey" FOREIGN KEY ("trackingLinkId") REFERENCES "TrackingLink"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_trackingLinkId_fkey" FOREIGN KEY ("trackingLinkId") REFERENCES "TrackingLink"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_clickEventId_fkey" FOREIGN KEY ("clickEventId") REFERENCES "ClickEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

