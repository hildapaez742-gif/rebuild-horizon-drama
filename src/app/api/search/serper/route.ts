import { NextRequest, NextResponse } from 'next/server'
import { serperSearch } from '@/lib/search'

export async function POST(req: NextRequest) {
  const { query } = await req.json()
  const results = await serperSearch(query || '')
  return NextResponse.json({ results })
}
