import { NextRequest } from 'next/server';
import { siteMailboxAttachmentRoute } from '@/lib/siteMailboxAttachments';
export async function POST(request:NextRequest,context:{params:Promise<{siteId:string;bindingId:string;uid:string;attachmentId:string}>}){
  const {siteId,bindingId,uid,attachmentId}=await context.params;
  return siteMailboxAttachmentRoute(request,siteId,bindingId,uid,attachmentId);
}
