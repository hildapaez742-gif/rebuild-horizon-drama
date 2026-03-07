import { NextResponse } from 'next/server'
import { fetchAllHotLists } from '@/lib/search'

export async function GET() {
  try {
    const data = await fetchAllHotLists()
    return NextResponse.json({ success: true, data })
  } catch {
    return NextResponse.json({ success: false, data: {} })
  }
}
