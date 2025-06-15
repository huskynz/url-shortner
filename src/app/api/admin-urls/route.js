import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { validateRequest } from '@/app/lib/authMiddleware';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function GET(req) {
  try {
    if (!await validateRequest(req)) {
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
  try {
    if (!await validateRequest(req)) {
      console.error('Unauthorized access attempt to POST /api/admin-urls');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    console.log('Received request body:', body);

    if (!body) {
      console.error('No body provided in POST /api/admin-urls');
      return NextResponse.json({ error: 'No body provided' }, { status: 400 });
    }

    const { 
      short_path, 
      redirect_url,
      password,
      schedule_start,
      schedule_end,
      usage_quota,
      custom_rules,
      private: is_private_db_field
    } = body;

    if (!short_path || !redirect_url) {
      console.error('Missing required fields:', { short_path, redirect_url });
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Only validate password if URL is private
    if (is_private_db_field && !password) {
      console.error('Password required for private URLs');
      return NextResponse.json({ error: 'Password required for private URLs' }, { status: 400 });
    }

    // Check if URL already exists
    const { data: existingUrl, error: checkError } = await supabase
      .from(process.env.SUPABASE_DB_NAME)
      .select('short_path')
      .eq('short_path', short_path)
      .single();

    if (checkError && checkError.code !== 'PGRST116') { // PGRST116 is "no rows returned"
      console.error('Error checking for existing URL:', checkError);
      throw checkError;
    }

    if (existingUrl) {
      console.error('URL already exists:', short_path);
      return NextResponse.json({ error: 'URL already exists' }, { status: 400 });
    }
    
    const { error: insertError } = await supabase
      .from(process.env.SUPABASE_DB_NAME)
      .insert([{ 
        short_path, 
        redirect_url,
        deprecated: false,
        private: is_private_db_field || false,
        ...(password && { password }), // Only include password if it exists
        ...(schedule_start && { schedule_start }),
        ...(schedule_end && { schedule_end }),
        ...(usage_quota && { usage_quota }),
        ...(custom_rules && { custom_rules })
      }]);

    if (insertError) {
      console.error('Error inserting URL:', insertError);
      throw insertError;
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error in POST /api/admin-urls:', error);
    return NextResponse.json({ 
      error: 'Failed to add URL',
      details: error.message 
    }, { status: 500 });
  }
}

export async function PUT(req) {
  if (!await validateRequest(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const {
      short_path,
      redirect_url,
      deprecated,
      password, // Incoming password value
      private: incoming_private_status // Incoming private status
    } = body;
    
    const updateData = {};
    
    if (deprecated !== undefined) updateData.deprecated = deprecated;
    if (redirect_url !== undefined) updateData.redirect_url = redirect_url;

    if (incoming_private_status !== undefined) {
      updateData.private = incoming_private_status;
      if (!incoming_private_status) {
        // If private is being turned off, explicitly set password to null
        updateData.password = null;
      } else if (password !== undefined) {
        // If private is on, and password is provided (could be empty string if cleared)
        updateData.password = password === '' ? null : password; 
      } else if (password === undefined && incoming_private_status === true) {
        // If private is true, but no password field was sent, it implies no change to password.
        // We don't touch password in this case.
      }
    } else if (password !== undefined) {
        // This case handles when only the password field is sent (private status unchanged).
        // If password is explicitly empty string, set to null in DB.
        updateData.password = password === '' ? null : password;
    }

    if (Object.keys(updateData).length > 0) {
      const { error } = await supabase
        .from(process.env.SUPABASE_DB_NAME)
        .update(updateData)
        .eq('short_path', short_path);

      if (error) throw error;
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to update URL' }, { status: 500 });
  }
}

export async function DELETE(req) {
  if (!await validateRequest(req)) {
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