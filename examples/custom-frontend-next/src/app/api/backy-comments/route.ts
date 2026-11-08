import { NextRequest } from 'next/server';
import { websiteComments } from '../../../lib/comments-bff';
export const dynamic = 'force-dynamic';
export async function GET(request: NextRequest) { return websiteComments(request); }
export async function POST(request: NextRequest) { return websiteComments(request); }
