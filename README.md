# 협업형 AI 챗봇

생성형 AI와 소크라테스식 대화를 나누고 동료들과 공유하는 Next.js 기반 서비스입니다.

## 기능

- PIN 코드 기반 그룹 세션 입장 (최대 4명)
- 소크라테스식 AI 대화
- 대화 로그 실시간 공유
- 관리자 대시보드 (PIN 관리, 로그 분석, CSV 다운로드)

## 시작하기

### 1. 의존성 설치

```bash
npm install
```

### 2. 환경 변수 설정

`.env` 파일을 생성하고 다음 변수를 설정하세요:

```env
DATABASE_URL="postgresql://postgres:password@localhost:5432/collaborative_ai_chat?schema=public"
OPENAI_API_KEY="your-openai-api-key"
```

**PostgreSQL 설정 방법은 [POSTGRESQL_SETUP.md](./POSTGRESQL_SETUP.md)를 참고하세요.**

### 3. 데이터베이스 마이그레이션

```bash
npx prisma generate
npx prisma migrate dev
```

### 4. 개발 서버 실행

```bash
npm run dev
```

브라우저에서 [http://localhost:3000](http://localhost:3000)을 열어 확인하세요.

## 프로젝트 구조

- `app/` - Next.js App Router 페이지 및 API 라우트
- `components/` - React 컴포넌트
- `prisma/` - Prisma 스키마 및 마이그레이션
- `lib/` - 유틸리티 함수

## 주요 페이지

- `/` - PIN 코드 입력 화면
- `/session/[sessionId]` - 메인 대화 화면
- `/conversation/[id]` - 대화 상세 화면
- `/admin` - 관리자 대시보드

## 기술 스택

- **Framework**: Next.js 16
- **Database**: PostgreSQL (Prisma ORM)
- **AI**: OpenAI GPT-4o-mini
- **Styling**: Tailwind CSS

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
