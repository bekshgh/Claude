-- CreateTable
CREATE TABLE "FormSubmit" (
    "id" TEXT NOT NULL,
    "trackingLinkId" TEXT NOT NULL,
    "clickEventId" TEXT NOT NULL,
    "clickId" TEXT NOT NULL,
    "formName" TEXT,
    "pageUrl" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 1,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FormSubmit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FormSubmit_clickEventId_key" ON "FormSubmit"("clickEventId");

-- CreateIndex
CREATE INDEX "FormSubmit_trackingLinkId_idx" ON "FormSubmit"("trackingLinkId");

-- CreateIndex
CREATE INDEX "FormSubmit_submittedAt_idx" ON "FormSubmit"("submittedAt");

-- AddForeignKey
ALTER TABLE "FormSubmit" ADD CONSTRAINT "FormSubmit_trackingLinkId_fkey" FOREIGN KEY ("trackingLinkId") REFERENCES "TrackingLink"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormSubmit" ADD CONSTRAINT "FormSubmit_clickEventId_fkey" FOREIGN KEY ("clickEventId") REFERENCES "ClickEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
