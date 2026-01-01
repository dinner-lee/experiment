# Supabase PostgreSQL 연결 설정 가이드

이 가이드는 Next.js 프로젝트에서 Supabase PostgreSQL 데이터베이스를 연결하는 방법을 단계별로 설명합니다.

## 📋 목차
1. [Supabase 프로젝트 생성](#1-supabase-프로젝트-생성)
2. [연결 정보 확인](#2-연결-정보-확인)
3. [환경 변수 설정](#3-환경-변수-설정)
4. [Prisma 설정 확인](#4-prisma-설정-확인)
5. [데이터베이스 마이그레이션](#5-데이터베이스-마이그레이션)
6. [연결 테스트](#6-연결-테스트)
7. [문제 해결](#7-문제-해결)

---

## 1. Supabase 프로젝트 생성

### 1.1 Supabase 계정 생성 및 로그인
1. [Supabase 웹사이트](https://supabase.com)에 접속
2. **Sign Up** 또는 **Sign In** 클릭하여 계정 생성/로그인

### 1.2 새 프로젝트 생성
1. 대시보드에서 **New Project** 클릭
2. 다음 정보 입력:
   - **Name**: 프로젝트 이름 (예: `collaborative-ai-chat`)
   - **Database Password**: 강력한 비밀번호 설정 (⚠️ **반드시 기록해두세요!**)
   - **Region**: 가장 가까운 리전 선택 (예: `Northeast Asia (Seoul)`)
3. **Create new project** 클릭
4. 프로젝트 생성 완료까지 1-2분 대기

---

## 2. 연결 정보 확인

### 2.1 프로젝트 참조 ID 확인
1. Supabase 대시보드에서 프로젝트 선택
2. **Settings** (왼쪽 사이드바) → **General** 클릭
3. **Reference ID** 확인 (예: `lkyfwxxwqfypuwjomxll`)
   - 이 ID는 연결 문자열에 사용됩니다

**현재 프로젝트 정보:**
- **Project ID**: `lkyfwxxwqfypuwjomxll`
- **Project URL**: `https://lkyfwxxwqfypuwjomxll.supabase.co`

### 2.2 데이터베이스 비밀번호 확인
1. **Settings** → **Database** 메뉴로 이동
2. **Database password** 섹션에서 비밀번호 확인
   - 비밀번호를 잊었다면 **Reset database password** 클릭하여 재설정

### 2.3 연결 문자열 가져오기
1. **Settings** → **Database** 메뉴로 이동
2. **Connection string** 섹션으로 스크롤
3. **URI** 탭 선택
4. 연결 문자열 복사

#### 연결 문자열 옵션

**옵션 1: 직접 연결 (Direct connection) - 개발용**
```
postgresql://postgres:[YOUR-PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres?sslmode=require
```

**옵션 2: 연결 풀러 (Connection Pooler) - 프로덕션 권장**
```
postgresql://postgres.[PROJECT-REF]:[YOUR-PASSWORD]@aws-0-[REGION].pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1
```

**옵션 3: Transaction 모드 (권장)**
```
postgresql://postgres.[PROJECT-REF]:[YOUR-PASSWORD]@aws-0-[REGION].pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1
```

**참고사항:**
- `[YOUR-PASSWORD]`: 1.2에서 설정한 데이터베이스 비밀번호
- `[PROJECT-REF]`: 2.1에서 확인한 Reference ID
- `[REGION]`: 프로젝트 생성 시 선택한 리전 (예: `ap-northeast-2`)

---

## 3. 환경 변수 설정

### 3.1 .env 파일 생성/수정
프로젝트 루트 디렉토리에 `.env` 파일을 생성하거나 수정합니다:

```bash
# 프로젝트 루트에서
touch .env
```

### 3.2 DATABASE_URL 설정
`.env` 파일에 다음 내용을 추가합니다:

```env
# Supabase PostgreSQL 연결 문자열
DATABASE_URL="postgresql://postgres:[YOUR-PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres?schema=public&sslmode=require"

# 현재 프로젝트 설정 (비밀번호: yENdvJPjQNpK7Aj4)
# DATABASE_URL="postgresql://postgres:yENdvJPjQNpK7Aj4@db.lkyfwxxwqfypuwjomxll.supabase.co:5432/postgres?schema=public&sslmode=require"
```

### 3.3 Supabase API 키 설정 (선택사항)
Supabase 클라이언트를 사용하는 경우, 다음 키들을 `.env` 파일에 추가할 수 있습니다:

```env
# Supabase API Keys (선택사항)
NEXT_PUBLIC_SUPABASE_URL="https://lkyfwxxwqfypuwjomxll.supabase.co"
NEXT_PUBLIC_SUPABASE_ANON_KEY="sb_publishable_ZNbVHav6D5sYsXAf6FymMg_lljq20gi"
SUPABASE_SERVICE_ROLE_KEY="sb_secret_ON_hR60Ic_k9zILZauAhjg_dJ-2_Y7f"

# Legacy anon key (필요한 경우)
SUPABASE_LEGACY_ANON_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxreWZ3eHh3cWZ5cHV3am9teGxsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY4MDA3ODUsImV4cCI6MjA4MjM3Njc4NX0.juhcEmU5Sar-5fjuVsdmbpiHVQRY_pO7gZEPSsSkBWU"
```

**참고:**
- `NEXT_PUBLIC_` 접두사가 붙은 변수는 클라이언트 사이드에서 접근 가능합니다
- `SUPABASE_SERVICE_ROLE_KEY`는 서버 사이드에서만 사용하고, 절대 클라이언트에 노출하지 마세요
- 현재는 Prisma를 사용하므로 이 키들은 선택사항입니다

**중요:**
- `[YOUR-PASSWORD]`를 실제 비밀번호로 교체
- `[PROJECT-REF]`를 실제 프로젝트 참조 ID로 교체
- 비밀번호에 특수문자가 포함된 경우 URL 인코딩 필요 (예: `@` → `%40`, `#` → `%23`)

### 3.4 .env 파일 보안 확인
`.env` 파일이 `.gitignore`에 포함되어 있는지 확인:

```bash
# .gitignore 파일 확인
cat .gitignore | grep .env
```

만약 `.env`가 `.gitignore`에 없다면 추가하세요:
```
.env
.env.local
.env*.local
```

---

## 4. Prisma 설정 확인

### 4.1 schema.prisma 확인
`prisma/schema.prisma` 파일에서 `datasource`가 `postgresql`로 설정되어 있는지 확인:

```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
```

✅ 이미 `postgresql`로 설정되어 있습니다.

### 4.2 필요한 패키지 확인
다음 패키지가 설치되어 있는지 확인:

```bash
npm list pg @types/pg @prisma/client prisma
```

설치되어 있지 않다면:
```bash
npm install pg @types/pg
npm install -D prisma
```

✅ 이미 설치되어 있습니다.

---

## 5. 데이터베이스 마이그레이션

### 5.1 Prisma 클라이언트 재생성
```bash
npx prisma generate
```

### 5.2 마이그레이션 실행
```bash
# 개발 환경
npx prisma migrate dev --name init_supabase
```

이 명령은:
- Prisma 스키마를 기반으로 마이그레이션 파일 생성
- Supabase 데이터베이스에 테이블 생성
- Prisma Client 재생성

### 5.3 프로덕션 환경 (선택사항)
프로덕션 환경에서는:
```bash
npx prisma migrate deploy
```

---

## 6. 연결 테스트

### 6.1 Prisma Studio로 확인
```bash
npx prisma studio
```

브라우저에서 `http://localhost:5555`가 열리면:
- 데이터베이스 연결 성공 ✅
- 테이블 목록 확인 가능
- 데이터 조회/수정 가능

### 6.2 간단한 연결 테스트 스크립트
`test-connection.ts` 파일 생성:

```typescript
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  try {
    await prisma.$connect()
    console.log('✅ Supabase 연결 성공!')
    
    // 간단한 쿼리 테스트
    const sessionCount = await prisma.session.count()
    console.log(`현재 세션 수: ${sessionCount}`)
  } catch (error) {
    console.error('❌ 연결 실패:', error)
  } finally {
    await prisma.$disconnect()
  }
}

main()
```

실행:
```bash
npx tsx test-connection.ts
```

### 6.3 애플리케이션 실행 테스트
```bash
npm run dev
```

애플리케이션이 정상적으로 실행되고 데이터베이스 작업이 오류 없이 수행되면 연결 성공입니다.

---

## 7. 문제 해결

### 7.1 연결 오류: "password authentication failed"
**원인**: 비밀번호가 잘못되었거나 변경됨

**해결 방법:**
1. Supabase 대시보드 → Settings → Database에서 비밀번호 확인
2. `.env` 파일의 `DATABASE_URL` 업데이트
3. 비밀번호에 특수문자가 있으면 URL 인코딩 확인

### 7.2 연결 오류: "Can't reach database server" 또는 "P1001"
**원인:**
- 프로젝트가 일시 중지(paused)됨 ⚠️ **가장 흔한 원인**
- 네트워크 문제
- 잘못된 호스트/포트
- 방화벽이나 보안 설정

**해결 방법:**

**1단계: Supabase 프로젝트 상태 확인 (가장 중요!)**
1. [Supabase 대시보드](https://supabase.com/dashboard)에 로그인
2. 프로젝트 `lkyfwxxwqfypuwjomxll` 선택
3. 프로젝트 상태 확인:
   - **Active** (초록색) → 정상
   - **Paused** (회색) → **Resume** 버튼 클릭하여 재개
   - 프로젝트가 일시 중지되어 있으면 데이터베이스에 연결할 수 없습니다

**2단계: 연결 문자열 재확인**
1. Settings → Database → Connection string
2. **URI** 탭에서 연결 문자열 복사
3. 비밀번호가 올바른지 확인

**3단계: 연결 풀러(Connection Pooler) 사용 시도**
직접 연결이 안 될 때는 연결 풀러를 사용해보세요:

```env
# 연결 풀러 사용 (Transaction 모드)
DATABASE_URL="postgresql://postgres.lkyfwxxwqfypuwjomxll:[YOUR-PASSWORD]@aws-0-ap-northeast-2.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1"
```

**참고:** `[REGION]`은 프로젝트 리전에 맞게 변경하세요 (예: `ap-northeast-2`, `us-east-1` 등)

**4단계: 네트워크 확인**
- VPN 사용 시 일시적으로 해제하여 테스트
- 방화벽이 5432 포트를 차단하지 않는지 확인
- 회사/학교 네트워크에서 차단될 수 있음

**5단계: Supabase 대시보드에서 직접 연결 테스트**
1. Supabase 대시보드 → **SQL Editor**
2. 간단한 쿼리 실행: `SELECT 1;`
3. 쿼리가 실행되면 데이터베이스는 정상 작동 중입니다

### 7.3 연결 오류: "SSL required"
**원인**: `sslmode=require` 파라미터 누락

**해결 방법:**
연결 문자열 끝에 `?sslmode=require` 추가:
```
postgresql://postgres:password@host:5432/postgres?sslmode=require
```

### 7.4 연결 풀러 사용 시 주의사항
연결 풀러(Pooler)를 사용할 때:
- `pgbouncer=true` 파라미터 필수
- `connection_limit=1` 권장 (Prisma 사용 시)
- Transaction 모드 사용 권장

### 7.5 마이그레이션 오류
**원인**: 기존 테이블과 충돌

**해결 방법:**
```bash
# 마이그레이션 상태 확인
npx prisma migrate status

# 마이그레이션 리셋 (⚠️ 데이터 삭제됨)
npx prisma migrate reset

# 새로 마이그레이션
npx prisma migrate dev
```

### 7.6 Supabase 대시보드에서 테이블 확인
1. Supabase 대시보드 → **Table Editor** 메뉴
2. 생성된 테이블 확인:
   - `Session`
   - `User`
   - `Conversation`
   - `UserLog`
   - `ViewLog`

---

## 📝 체크리스트

연결 완료를 확인하기 위한 체크리스트:

- [ ] Supabase 프로젝트 생성 완료
- [ ] Reference ID 확인 (`lkyfwxxwqfypuwjomxll`)
- [ ] 데이터베이스 비밀번호 확인
- [ ] `.env` 파일에 `DATABASE_URL` 설정
- [ ] `prisma/schema.prisma`에서 `provider = "postgresql"` 확인
- [ ] `npx prisma generate` 실행 성공
- [ ] `npx prisma migrate dev` 실행 성공
- [ ] `npx prisma studio`로 연결 확인
- [ ] 애플리케이션 실행 및 데이터베이스 작업 테스트 성공

## 📌 현재 프로젝트 정보

**프로젝트 설정:**
- **Project ID**: `lkyfwxxwqfypuwjomxll`
- **Project URL**: `https://lkyfwxxwqfypuwjomxll.supabase.co`
- **Database Host**: `db.lkyfwxxwqfypuwjomxll.supabase.co:5432`
- **Publishable Key**: `sb_publishable_ZNbVHav6D5sYsXAf6FymMg_lljq20gi`
- **Secret Key**: `sb_secret_ON_hR60Ic_k9zILZauAhjg_dJ-2_Y7f`

**연결 문자열 형식:**
```
postgresql://postgres:[YOUR-PASSWORD]@db.lkyfwxxwqfypuwjomxll.supabase.co:5432/postgres?schema=public&sslmode=require
```

⚠️ **중요**: 비밀번호(`[YOUR-PASSWORD]`)는 실제 데이터베이스 비밀번호로 교체해야 합니다.

---

## 🔗 유용한 링크

- [Supabase 공식 문서](https://supabase.com/docs)
- [Prisma PostgreSQL 가이드](https://www.prisma.io/docs/concepts/database-connectors/postgresql)
- [Supabase 연결 문자열 가이드](https://supabase.com/docs/guides/database/connecting-to-postgres)

---

## 💡 추가 팁

### 연결 풀러 vs 직접 연결
- **직접 연결**: 개발 환경, 간단한 테스트에 적합
- **연결 풀러**: 프로덕션 환경, 높은 동시성 요구 시 권장

### 환경별 설정
개발/프로덕션 환경을 분리하려면:
- `.env.local` (로컬 개발)
- `.env.production` (프로덕션)

Next.js는 자동으로 적절한 환경 변수를 로드합니다.

### Supabase 무료 플랜 제한
- 500MB 데이터베이스 용량
- 2GB 대역폭
- 프로젝트 2개까지

프로덕션 환경에서는 유료 플랜 고려를 권장합니다.

