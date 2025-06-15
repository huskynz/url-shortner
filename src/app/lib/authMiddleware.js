import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifyAuth } from './auth';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function validateRequest(req) {
  try {
    const authHeader = req.headers.get('authorization');
    if (authHeader?.startsWith('Bearer ')) {
      const apiKey = authHeader.substring(7);
      
      const { data: keyData, error: keyError } = await supabase
        .from(process.env.APIKEY_DB)
        .select('*')
        .eq('key', apiKey)
        .eq('is_active', true)
        .single();

      if (keyError) {
        console.error('Error validating API key:', keyError);
        return false;
      }

      if (!keyData) {
        console.error('No valid API key found');
        return false;
      }

      if (keyData.expires_at && new Date(keyData.expires_at) < new Date()) {
        console.error('API key expired:', keyData.expires_at);
        return false;
      }

      return true;
    }

    const sessionValid = await verifyAuth(req);
    if (!sessionValid) {
      console.error('Session validation failed');
    }
    return sessionValid;
  } catch (error) {
    console.error('Error in validateRequest:', error);
    return false;
  }
}