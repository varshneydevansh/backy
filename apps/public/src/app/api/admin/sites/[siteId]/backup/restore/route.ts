import { NextRequest } from 'next/server';
import { handleAdminSiteBackup } from '@/lib/adminSiteBackup';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function POST(request:NextRequest,{params}:{params:Promise<{siteId:string}>}){return handleAdminSiteBackup(request,(await params).siteId,'restore');}
