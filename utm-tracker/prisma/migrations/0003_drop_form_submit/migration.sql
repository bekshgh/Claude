-- Submit-button presses are now counted as leads. Carry over recorded presses
-- as leads (one per click_id, skipping clicks that already have a lead), then
-- drop the FormSubmit table.
INSERT INTO "Lead" ("id", "trackingLinkId", "clickEventId", "clickId", "formName", "pageUrl",
                    "submittedAt", "sourcePayload", "attributionStatus", "dedupeKey", "createdAt")
SELECT fs."id", fs."trackingLinkId", fs."clickEventId", fs."clickId", fs."formName", fs."pageUrl",
       fs."submittedAt", jsonb_build_object('_source', 'form_submit_migration', 'click_id', fs."clickId"),
       'exact'::"AttributionStatus", 'ck:' || fs."clickId", CURRENT_TIMESTAMP
FROM "FormSubmit" fs
WHERE NOT EXISTS (SELECT 1 FROM "Lead" l WHERE l."dedupeKey" = 'ck:' || fs."clickId");

-- DropTable
DROP TABLE "FormSubmit";
