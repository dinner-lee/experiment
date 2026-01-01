import 'dotenv/config'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  try {
    console.log('🔌 데이터베이스 연결 시도 중...')
    await prisma.$connect()
    console.log('✅ 데이터베이스 연결 성공!')

    // 간단한 쿼리 테스트
    const sessionCount = await prisma.session.count()
    console.log(`📊 현재 세션 수: ${sessionCount}`)

    // 테이블 목록 확인
    const result = await prisma.$queryRaw`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
    `
    console.log('📋 생성된 테이블:', result)
  } catch (error: any) {
    console.error('❌ 데이터베이스 연결 실패:', error.message)
    if (error.code === 'P1001') {
      console.error('💡 해결 방법:')
      console.error('   1. Supabase/Neon 프로젝트가 활성화되어 있는지 확인')
      console.error('   2. .env 파일의 DATABASE_URL이 올바른지 확인')
      console.error('   3. 데이터베이스 비밀번호가 올바른지 확인')
    }
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

main()

