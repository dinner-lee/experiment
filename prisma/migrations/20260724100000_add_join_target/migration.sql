-- Session: PIN 입장 대상 세션 지정 플래그
ALTER TABLE "Session" ADD COLUMN "isJoinTarget" BOOLEAN NOT NULL DEFAULT false;

-- 기존 데이터: 각 PIN의 가장 최근 활성 세션을 입장 대상으로 지정 (기존 입장 규칙과 동일)
UPDATE "Session" s
SET "isJoinTarget" = true
WHERE s."isActive" = true
  AND s."id" = (
    SELECT s2."id" FROM "Session" s2
    WHERE s2."pinCode" = s."pinCode" AND s2."isActive" = true
    ORDER BY s2."createdAt" DESC
    LIMIT 1
  );
