import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifyAuth } from '@/app/lib/auth';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function DELETE(req, { params }) {
    // 1. Direct token check
    const authHeader = req.headers.get('authorization');
    const token = authHeader?.split(' ')[1];
    
    const { data: authData } = await supabase
        .from(process.env.APIKEY_DB)
        .select('*')
        .eq('key', token)
        .single();

    // 2. Fallback to verifyAuth if direct check fails
    if (!authData && !await verifyAuth(req)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const { error } = await supabase
            .from(process.env.APIKEY_DB)
            .delete()
            .eq('id', params.id);

        if (error) throw error;
        return NextResponse.json({ success: true });
    } catch (error) {
        return NextResponse.json({ error: 'Failed to delete API key' }, { status: 500 });
    }
}