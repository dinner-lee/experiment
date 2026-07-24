-- 동일 PIN 아래 여러 세션(회차) 허용: 유니크 제약을 일반 인덱스로 교체
DROP INDEX "Session_pinCode_key";
CREATE INDEX "Session_pinCode_idx" ON "Session"("pinCode");
