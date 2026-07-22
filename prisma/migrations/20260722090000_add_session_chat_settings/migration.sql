-- Session: 학습자용 AI 대화 설정 (모델, 첫 질문, 시스템 프롬프트)
ALTER TABLE "Session" ADD COLUMN "chatModel" TEXT;
ALTER TABLE "Session" ADD COLUMN "chatFirstQuestion" TEXT;
ALTER TABLE "Session" ADD COLUMN "chatSystemPrompt" TEXT;
