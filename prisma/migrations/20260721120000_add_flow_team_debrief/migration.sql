-- Conversation: 공유 범위/익명/수정 이력/대화 종류 필드 추가
ALTER TABLE "Conversation" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'main';
ALTER TABLE "Conversation" ADD COLUMN "shareScope" TEXT NOT NULL DEFAULT 'full';
ALTER TABLE "Conversation" ADD COLUMN "isAnonymous" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Conversation" ADD COLUMN "revisions" JSONB;

-- TeamDocument: 세션당 1개의 공동 산출물 (동시 편집)
CREATE TABLE "TeamDocument" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "content" TEXT NOT NULL DEFAULT '',
    "version" INTEGER NOT NULL DEFAULT 0,
    "editors" JSONB,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TeamDocument_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TeamDocument_sessionId_key" ON "TeamDocument"("sessionId");

ALTER TABLE "TeamDocument" ADD CONSTRAINT "TeamDocument_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
