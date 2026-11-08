import { NextRequest } from 'next/server';
import { reconcileDeliveryAttempt } from '@/lib/deliveryReconciliationHandler';
export const runtime = 'nodejs';
export async function POST(request: NextRequest, { params }: { params: Promise<{ siteId: string; formId: string; submissionId: string; attemptId: string }> }) {
  return reconcileDeliveryAttempt(request, { ...await params, kind: 'form' });
}
