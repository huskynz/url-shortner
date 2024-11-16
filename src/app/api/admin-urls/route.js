import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function GET() {
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
    const { short_path, deprecated } = body;
    
    if (typeof short_path !== 'string' || typeof deprecated !== 'boolean') {
      return NextResponse.json(
        { error: 'Invalid input data' }, 
        { status: 400 }
      );
    }

    const { error } = await supabase
      .from('shortened_urls')
      .update({ deprecated })
      .eq('short_path', short_path);

    if (error) {
      console.error('Supabase error:', error);
      throw error;
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Update error:', error);
    return NextResponse.json(
      { error: 'Failed to update URL' }, 
      { status: 500 }
    );
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