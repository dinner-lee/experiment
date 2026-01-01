# Supabase 연결 문제 해결 가이드

## 🔴 현재 오류: "Can't reach database server" (P1001)

이 오류는 데이터베이스 서버에 연결할 수 없다는 의미입니다.

## ✅ 즉시 확인해야 할 사항

### 1. Supabase 프로젝트 상태 확인 (가장 중요!)

**Supabase 프로젝트가 일시 중지(paused)되어 있을 가능성이 높습니다.**

1. [Supabase 대시보드](https://supabase.com/dashboard)에 로그인
2. 프로젝트 `lkyfwxxwqfypuwjomxll` 선택
3. 프로젝트 상태 확인:
   - ✅ **Active** (초록색) → 정상
   - ⚠️ **Paused** (회색) → **Resume** 버튼 클릭하여 재개

**프로젝트가 일시 중지되어 있으면 데이터베이스에 연결할 수 없습니다!**

### 2. Supabase SQL Editor로 데이터베이스 확인

1. Supabase 대시보드 → **SQL Editor** 메뉴
2. 간단한 쿼리 실행:
   ```sql
   SELECT 1;
   ```
3. 쿼리가 실행되면 → 데이터베이스는 정상 작동 중
4. 쿼리가 실행되지 않으면 → 프로젝트가 일시 중지되었을 가능성 높음

### 3. 연결 문자열 재확인

1. Supabase 대시보드 → **Settings** → **Database**
2. **Connection string** 섹션으로 스크롤
3. **URI** 탭 선택
4. 연결 문자열 복사하여 `.env` 파일과 비교

## 🔧 해결 방법

### 방법 1: 연결 풀러(Connection Pooler) 사용

직접 연결이 안 될 때는 연결 풀러를 사용해보세요:

1. Supabase 대시보드 → **Settings** → **Database**
2. **Connection string** → **Connection Pooling** 탭 선택
3. **Transaction** 모드 연결 문자열 복사
4. `.env` 파일의 `DATABASE_URL` 업데이트

**연결 풀러 형식 예시:**
```env
DATABASE_URL="postgresql://postgres.lkyfwxxwqfypuwjomxll:[YOUR-PASSWORD]@aws-0-[REGION].pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1"
```

**리전 확인:**
- 프로젝트 생성 시 선택한 리전을 확인하세요
- 예: `ap-northeast-2` (서울), `us-east-1` (미국 동부) 등
- Supabase 대시보드 → Settings → General에서 확인 가능

### 방법 2: 비밀번호 재설정

비밀번호가 잘못되었을 수 있습니다:

1. Supabase 대시보드 → **Settings** → **Database**
2. **Database password** 섹션에서 **Reset database password** 클릭
3. 새 비밀번호 설정
4. `.env` 파일의 `DATABASE_URL` 업데이트

**주의:** 비밀번호에 특수문자가 있으면 URL 인코딩 필요:
- `@` → `%40`
- `#` → `%23`
- `%` → `%25`
- `&` → `%26`

### 방법 3: 네트워크 확인

1. **VPN 해제**: VPN을 사용 중이라면 일시적으로 해제하여 테스트
2. **방화벽 확인**: 회사/학교 네트워크에서 5432 포트가 차단될 수 있음
3. **다른 네트워크에서 테스트**: 모바일 핫스팟 등으로 시도

### 방법 4: Supabase 지원팀 문의

위 방법들이 모두 실패하면:
1. Supabase 대시보드 → **Support** 메뉴
2. 프로젝트 상태와 연결 오류 메시지 포함하여 문의

## 📝 체크리스트

연결 문제 해결을 위한 체크리스트:

- [ ] Supabase 대시보드에서 프로젝트 상태 확인 (Active여야 함)
- [ ] SQL Editor에서 쿼리 실행 테스트
- [ ] 연결 문자열을 Supabase 대시보드에서 다시 복사
- [ ] 비밀번호가 올바른지 확인
- [ ] 연결 풀러 사용 시도
- [ ] VPN 해제 후 재시도
- [ ] 다른 네트워크에서 테스트

## 🔗 유용한 링크

- [Supabase 연결 문제 해결](https://supabase.com/docs/guides/database/troubleshooting)
- [Supabase 연결 문자열 가이드](https://supabase.com/docs/guides/database/connecting-to-postgres)
- [Prisma 연결 오류 해결](https://www.prisma.io/docs/reference/api-reference/error-reference#p1001)

