import { NextResponse } from 'next/server';

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const ip = searchParams.get('ip');

  if (!ip) {
    return NextResponse.json({ error: 'IP address is required' }, { status: 400 });
  }

  const ipinfoApiToken = process.env.IPINFO_API_TOKEN;
  if (!ipinfoApiToken) {
    console.error('IPINFO_API_TOKEN environment variable is not set.');
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
  }

  try {
    const response = await fetch(`https://ipinfo.io/${ip}/json?token=${ipinfoApiToken}`);
    
    if (!response.ok) {
      const errorData = await response.json();
      console.error(`IPinfo.io API error for IP ${ip}:`, errorData);
      return NextResponse.json({ error: errorData.error || 'Failed to fetch IP info from external API' }, { status: response.status });
    }

    const data = await response.json();
    
    // You can customize what data you return based on your needs
    return NextResponse.json({
      ip: data.ip,
      country: data.country,
      city: data.city || null,
      region: data.region || null,
      loc: data.loc || null, // Latitude,Longitude
      org: data.org || null, // ISP organization
    });

  } catch (error) {
    console.error(`Error fetching IP info for IP ${ip}:`, error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
} 