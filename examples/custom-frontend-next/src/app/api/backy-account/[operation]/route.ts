import { NextRequest } from 'next/server';
import { handleWebsiteAccount } from '../../../../lib/visitor-bff';
export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ operation: string }> };
export async function GET(request: NextRequest, context: Context) { return handleWebsiteAccount(request, (await context.params).operation); }
export async function POST(request: NextRequest, context: Context) { return handleWebsiteAccount(request, (await context.params).operation); }

export async function PATCH(request: NextRequest, context: Context) { return handleWebsiteAccount(request, (await context.params).operation); }
