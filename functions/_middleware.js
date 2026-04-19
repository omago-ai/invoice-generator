const COUNTRY_MAP = {
  JP: '/jp',
  KR: '/kr',
  HK: '/ch',
  TW: '/ch',
  MO: '/ch',
  VN: '/vn',
  TH: '/th',
  ES: '/es',
  MX: '/es',
  AR: '/es',
  CO: '/es',
  CL: '/es',
  PE: '/es',
};

export async function onRequest(context) {
  const { request, next } = context;
  const url = new URL(request.url);

  // Only redirect on the root path
  if (url.pathname !== '/') {
    return next();
  }

  // Skip if user already chose a language (cookie set)
  const cookie = request.headers.get('cookie') || '';
  if (cookie.includes('lang_chosen=1')) {
    return next();
  }

  const country = request.headers.get('CF-IPCountry') || '';
  const target = COUNTRY_MAP[country];

  if (target) {
    const response = new Response(null, {
      status: 302,
      headers: {
        Location: target,
        'Set-Cookie': 'lang_chosen=1; Path=/; Max-Age=86400; SameSite=Lax',
      },
    });
    return response;
  }

  return next();
}
