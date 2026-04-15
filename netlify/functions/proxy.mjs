function detectPlaylistKind(targetUrl, contentType = '') {
  const normalizedUrl = String(targetUrl).toLowerCase();
  const normalizedType = String(contentType).toLowerCase();

  if (/\.m3u8(\?|$)/i.test(targetUrl) || /application\/vnd\.apple\.mpegurl|application\/x-mpegurl/i.test(contentType)) {
    return 'hls';
  }

  if (
    /\.m3u(\?|$)/i.test(targetUrl) ||
    normalizedUrl.includes('type=m3u') ||
    normalizedUrl.includes('type=m3u_plus') ||
    (normalizedUrl.includes('get.php') && (normalizedType.includes('text/plain') || normalizedType.includes('audio/x-mpegurl')))
  ) {
    return 'm3u';
  }

  return null;
}

function rewritePlaylistBody(body, targetUrl, requestUrl) {
  const baseTarget = new URL(targetUrl);
  const baseProxy = new URL(requestUrl, 'http://localhost');

  return body
    .split(/\r?\n/)
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return line;

      if (trimmed.startsWith('#')) {
        return line.replace(/URI="([^"]+)"/g, (_match, value) => {
          const resolved = new URL(value, baseTarget).toString();
          const next = new URL(baseProxy);
          next.searchParams.set('url', resolved);
          return `URI="${next.toString()}"`;
        });
      }

      const resolved = new URL(trimmed, baseTarget).toString();
      const next = new URL(baseProxy);
      next.searchParams.set('url', resolved);
      return next.toString();
    })
    .join('\n');
}

function createForwardHeaders(event) {
  const headers = new Headers();
  const eventHeaders = event.headers || {};
  for (const name of ['accept', 'accept-language', 'content-type', 'range', 'user-agent', 'referer', 'authorization', 'cookie', 'x-xtream-user', 'x-xtream-pass']) {
    const value = eventHeaders[name];
    if (value) headers.set(name, value);
  }
  return headers;
}

function createResponseHeaders(upstreamHeaders) {
  const headers = new Headers();
  headers.set('Access-Control-Allow-Origin', '*');
  headers.set('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  headers.set('Access-Control-Allow-Headers', 'Content-Type, Accept, Range');
  
  const headersToForward = ['content-type', 'cache-control', 'accept-ranges', 'content-range', 'etag', 'last-modified'];
  for (const name of headersToForward) {
    const value = upstreamHeaders.get ? upstreamHeaders.get(name) : upstreamHeaders[name];
    if (value) headers.set(name, value);
  }
  return headers;
}

export const handler = async (event) => {
  try {
    console.log('Proxy request:', event.httpMethod, event.path);

    // Handle OPTIONS
    if (event.httpMethod === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, HEAD, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Accept, Range, Authorization, Cookie, X-Xtream-User, X-Xtream-Pass',
          'Access-Control-Max-Age': '86400'
        }
      });
    }

    // Parse query parameters
    const params = event.queryStringParameters || {};
    const targetUrl = params.url;
    const username = params.username;
    const password = params.password;

    if (!targetUrl) {
      return new Response(JSON.stringify({ error: 'Missing "url" query parameter.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    let parsedTarget;
    try {
      parsedTarget = new URL(targetUrl);
    } catch (e) {
      console.error('Invalid URL:', targetUrl, e.message);
      return new Response(JSON.stringify({ error: 'Invalid target URL.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (!['http:', 'https:'].includes(parsedTarget.protocol)) {
      return new Response(JSON.stringify({ error: 'Only HTTP(S) upstream URLs are supported.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Add credentials to URL path for Xtream
    if (username && password && parsedTarget.pathname.includes('/stream/')) {
      parsedTarget.pathname = parsedTarget.pathname.replace('/stream/', `/${username}/${password}/`);
    }

    const forwardHeaders = createForwardHeaders(event);
    if (username) forwardHeaders.set('x-xtream-user', username);
    if (password) forwardHeaders.set('x-xtream-pass', password);
    
    // Add required headers for Xtream API and other endpoints
    if (!forwardHeaders.has('user-agent')) {
      forwardHeaders.set('user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
    }
    if (!forwardHeaders.has('accept')) {
      forwardHeaders.set('accept', 'application/json, text/plain, */*');
    }

    console.log('Fetching:', parsedTarget.toString(), 'Headers:', Object.fromEntries(forwardHeaders));

    // Fetch with extended timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 35000);

    try {
      const upstreamResponse = await fetch(parsedTarget.toString(), {
        method: event.httpMethod || 'GET',
        headers: forwardHeaders,
        redirect: 'follow',
        signal: controller.signal
      });

      clearTimeout(timeoutId);
      console.log('Upstream response:', upstreamResponse.status);

      // For HEAD requests, return just headers
      if (event.httpMethod === 'HEAD') {
        return new Response(null, {
          status: upstreamResponse.status,
          headers: createResponseHeaders(upstreamResponse.headers)
        });
      }

      const contentType = upstreamResponse.headers.get('content-type') || '';
      
      // For playlists, process and return as text
      const playlistKind = detectPlaylistKind(parsedTarget.toString(), contentType);
      if (playlistKind === 'hls') {
        const textBody = await upstreamResponse.text();
        const rewritten = rewritePlaylistBody(textBody, parsedTarget.toString(), event.path || '/api/proxy');
        return new Response(rewritten, {
          status: 200,
          headers: createResponseHeaders(upstreamResponse.headers)
        });
      }

      if (playlistKind === 'm3u') {
        const textBody = await upstreamResponse.text();
        return new Response(textBody, {
          status: upstreamResponse.status,
          headers: createResponseHeaders(upstreamResponse.headers)
        });
      }

      // For binary content (video files)
      const arrayBuffer = await upstreamResponse.arrayBuffer();
      return new Response(arrayBuffer, {
        status: upstreamResponse.status,
        headers: createResponseHeaders(upstreamResponse.headers)
      });
    } catch (fetchError) {
      clearTimeout(timeoutId);
      console.error('Fetch error:', fetchError.message, fetchError.code, 'URL:', parsedTarget.toString());
      
      if (fetchError.name === 'AbortError') {
        return new Response(JSON.stringify({ error: 'Upstream request timeout (35s)' }), {
          status: 504,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      
      // Network error or unreachable endpoint
      return new Response(JSON.stringify({ 
        error: `Cannot reach upstream server: ${fetchError.message}`,
        details: `Trying to access: ${parsedTarget.toString()}`,
        hint: 'Some Xtream servers use non-standard ports (2095, 8080) which may not be accessible from Netlify. Try HTTPS endpoints if available.'
      }), {
        status: 502,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  } catch (error) {
    console.error('Proxy handler error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
