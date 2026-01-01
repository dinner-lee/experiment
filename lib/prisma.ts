import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

function getPrismaClient() {
  // DATABASE_URL이 있는지 확인
  if (!process.env.DATABASE_URL) {
    throw new Error(
      'DATABASE_URL 환경 변수가 설정되지 않았습니다. .env 파일을 확인해주세요.'
    )
  }

  // Prisma 7에서는 prisma.config.ts에서 설정한 DATABASE_URL을 자동으로 사용
  // 생성자에 특별한 옵션을 전달하지 않음
  return new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  })
}

export const prisma = globalForPrisma.prisma ?? getPrismaClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma

