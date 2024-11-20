import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifyAuth } from '@/app/lib/auth';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function GET(req) {
  if (!await verifyAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { data, error } = await supabase
      .from('shortened_urls')
      .select('*');

    if (error) throw error;
    return NextResponse.json(data || []);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch URLs' }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const { short_path, redirect_url } = body;
    
    const { error } = await supabase
      .from('shortened_urls')
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

export async function PUT(request) {
  try {
    const body = await request.json();
    const { short_path, redirect_url, deprecated } = body;
    
    // If deprecated is provided, it's a deprecation toggle
    if (deprecated !== undefined) {
      const { error } = await supabase
        .from('shortened_urls')
        .update({ deprecated })
        .eq('short_path', short_path);

      if (error) throw error;
    } 
    // If redirect_url is provided, it's an edit
    else if (redirect_url) {
      const { error } = await supabase
        .from('shortened_urls')
        .update({ redirect_url })
        .eq('short_path', short_path);

      if (error) throw error;
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to update URL' }, { status: 500 });
  }
}

export async function DELETE(request) {
  try {
    const body = await request.json();
    const { short_path } = body;
    
    const { error } = await supabase
      .from('shortened_urls')
      .delete()
      .eq('short_path', short_path);

    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to delete URL' }, { status: 500 });
  }
} 