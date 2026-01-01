# PostgreSQL 데이터베이스 설정 가이드

## 1. PostgreSQL 클라이언트 라이브러리 설치

이미 설치되었습니다:
```bash
npm install pg @types/pg
```

## 2. Prisma 스키마 변경

`prisma/schema.prisma` 파일의 `datasource` provider가 이미 `postgresql`로 변경되었습니다.

## 3. 환경 변수 설정

`.env` 파일에 PostgreSQL 연결 문자열을 추가하세요:

```env
DATABASE_URL="postgresql://[user]:[password]@[host]:[port]/[database]?schema=public"
OPENAI_API_KEY="your-openai-api-key"
```

### 연결 문자열 예시

#### 로컬 PostgreSQL
```env
DATABASE_URL="postgresql://postgres:password@localhost:5432/collaborative_ai_chat?schema=public"
```

#### Supabase
```env
DATABASE_URL="postgresql://postgres:[YOUR-PASSWORD]@db.[YOUR-PROJECT-REF].supabase.co:5432/postgres?schema=public"
```

#### Neon
```env
DATABASE_URL="postgresql://[user]:[password]@[host]/[database]?sslmode=require"
```

#### Railway
```env
DATABASE_URL="postgresql://postgres:[password]@[host]:[port]/railway?schema=public"
```

#### Vercel Postgres
```env
DATABASE_URL="postgres://[user]:[password]@[host]:[port]/[database]?sslmode=require"
```

## 4. 데이터베이스 생성

로컬 PostgreSQL을 사용하는 경우:

```bash
# PostgreSQL에 접속
psql -U postgres

# 데이터베이스 생성
CREATE DATABASE collaborative_ai_chat;

# 종료
\q
```

## 5. 마이그레이션 실행

```bash
# Prisma 클라이언트 재생성
npx prisma generate

# 마이그레이션 실행 (기존 SQLite 데이터는 마이그레이션되지 않습니다)
npx prisma migrate dev --name init_postgresql
```

또는 프로덕션 환경의 경우:

```bash
npx prisma migrate deploy
```

## 6. 데이터베이스 확인

Prisma Studio로 데이터베이스를 확인할 수 있습니다:

```bash
npx prisma studio
```

## 주의사항

- SQLite에서 PostgreSQL로 전환할 때 기존 데이터는 자동으로 마이그레이션되지 않습니다.
- 기존 데이터가 있는 경우, 데이터 마이그레이션 스크립트를 별도로 작성해야 합니다.
- 프로덕션 환경에서는 `prisma migrate deploy`를 사용하세요.

