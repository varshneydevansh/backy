import { NextRequest } from 'next/server';
import { handleAdminSiteBackup } from '@/lib/adminSiteBackup';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function POST(request:NextRequest,{params}:{params:Promise<{siteId:string;jobId:string}>}){const p=await params;return handleAdminSiteBackup(request,p.siteId,'retry',p.jobId);}
