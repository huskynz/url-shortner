import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifyAuth } from '@/app/lib/auth';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function GET(req) {
  try {
    const isAuthorized = await verifyAuth(req);
    if (!isAuthorized) {
      console.warn('Unauthorized access attempt');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

   
    const { data, error } = await supabase
      .from(process.env.SUPABASE_DB_NAME)
      .select('*');

    if (error) throw error;
    return NextResponse.json(data || []);
  } catch (error) {
    console.error('Error in GET /api/admin-urls:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(req) {
  if (!await verifyAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json();
    if (!body) throw new Error('No body provided');

    const { short_path, redirect_url } = body;
    if (!short_path || !redirect_url) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }
    
    const { error } = await supabase
      .from(process.env.SUPABASE_DB_NAME)
      .insert([{ 
        short_path, 
        redirect_url,
        deprecated: false 
      }]);

    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to add URL' }, { status: 500 });
  }
}

export async function PUT(req) {
  if (!await verifyAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { short_path, redirect_url, deprecated } = body;
    
    if (deprecated !== undefined) {
      const { error } = await supabase
        .from(process.env.SUPABASE_DB_NAME)
        .update({ deprecated })
        .eq('short_path', short_path);

      if (error) throw error;
    } 
    else if (redirect_url) {
      const { error } = await supabase
        .from(process.env.SUPABASE_DB_NAME)
        .update({ redirect_url })
        .eq('short_path', short_path);

      if (error) throw error;
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to update URL' }, { status: 500 });
  }
}

export async function DELETE(req) {
  if (!await verifyAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { short_path } = await req.json();
    
    const { error } = await supabase
      .from(process.env.SUPABASE_DB_NAME)
      .delete()
      .eq('short_path', short_path);

    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to delete URL' }, { status: 500 });
  }
} 