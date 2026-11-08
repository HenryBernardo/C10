import type { NextConfig } from 'next';
import { ONLY_CITY } from './lib/cities';

const isDev = process.env.NODE_ENV === 'development';

// Política de segurança de conteúdo: só scripts do próprio site, mapa do Google em iframe,
// e o site não pode ser aberto dentro de outro (clickjacking).
// 'unsafe-inline' em script-src é necessário para os scripts de inicialização do Next sem nonce.
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self'",
  'frame-src https://maps.google.com https://www.google.com',
  "form-action 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "object-src 'none'",
].join('; ');

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  poweredByHeader: false,
  experimental: {
    globalNotFound: true,
  },
  // Com uma cidade só, quem entra no site vai direto para ela.
  async redirects() {
    return ONLY_CITY ? [{ source: '/', destination: `/${ONLY_CITY}`, permanent: false }] : [];
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: csp },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          ...(isDev ? [] : [{ key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' }]),
        ],
      },
    ];
  },
};

export default nextConfig;
