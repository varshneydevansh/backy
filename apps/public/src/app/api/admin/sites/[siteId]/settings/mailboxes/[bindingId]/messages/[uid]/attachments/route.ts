import { NextRequest } from 'next/server';
import { siteMailboxAttachmentRoute } from '@/lib/siteMailboxAttachments';
export async function GET(request:NextRequest,context:{params:Promise<{siteId:string;bindingId:string;uid:string}>}){
  const {siteId,bindingId,uid}=await context.params;
  return siteMailboxAttachmentRoute(request,siteId,bindingId,uid);
}
