-- ADDITIVE: enforce one enrollment per (workspaceId, memberAreaId, studentEmail).
-- Idempotency guard for concurrent enrollment webhooks — the member-enrollments
-- controller catches Prisma P2002 on this constraint and treats the duplicate as
-- already-enrolled (no double-enroll). Verified 0 existing duplicate rows in
-- RAC_MemberEnrollment before adding, so this is deploy-safe and non-destructive.
CREATE UNIQUE INDEX "RAC_MemberEnrollment_workspaceId_memberAreaId_studentEmail_key" ON "RAC_MemberEnrollment"("workspaceId", "memberAreaId", "studentEmail");
