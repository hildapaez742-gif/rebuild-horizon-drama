import { NextRequest, NextResponse } from 'next/server'
import { testConnection } from '@/lib/ai-client'

export async function POST(req: NextRequest) {
  const { engine, config } = await req.json()
  const result = await testConnection(engine, config)
  return NextResponse.json(result)
}
