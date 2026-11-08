import {NextRequest} from 'next/server';
import {handleAdminVisitorPrivacyImpact} from '@/lib/adminVisitorPrivacyImpact';
export const runtime='nodejs';
export async function GET(request:NextRequest,context:{params:Promise<{siteId:string;memberId:string}>}){const{siteId,memberId}=await context.params;return handleAdminVisitorPrivacyImpact(request,siteId,memberId);}
