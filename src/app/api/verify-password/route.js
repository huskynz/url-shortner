import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function POST(req) {
  try {
    const { short_path, password } = await req.json();

    if (!short_path || !password) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Fetch the URL from the database
    const { data: urlData, error } = await supabase
      .from(process.env.SUPABASE_DB_NAME)
      .select('*, redirect_url')
      .eq('short_path', short_path)
      .single();

    if (error || !urlData) {
      return NextResponse.json(
        { error: 'URL not found' },
        { status: 404 }
      );
    }

    // Check if the URL is password protected
    if (!urlData.private) {
      return NextResponse.json(
        { error: 'URL is not password protected' },
        { status: 400 }
      );
    }

    // Verify the password
    if (urlData.password !== password) {
      return NextResponse.json(
        { error: 'Invalid password' },
        { status: 401 }
      );
    }

    // Return the actual redirect_url upon successful verification
    return NextResponse.json({ success: true, redirect_url: urlData.redirect_url });
  } catch (error) {
    console.error('Error verifying password:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
} 