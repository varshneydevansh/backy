import { NextRequest } from 'next/server';
import { websiteFormDefinition, websiteFormSubmission } from '../../../lib/form-bff';
export const dynamic = 'force-dynamic';
export async function GET(request: NextRequest) { return websiteFormDefinition(request); }
export async function POST(request: NextRequest) { return websiteFormSubmission(request); }
