'use client';

// GA4 + Meta Pixel (Revenue OS Phase 2, 2026-09-03).
//
// Renders nothing unless the corresponding NEXT_PUBLIC_* id is configured, so
// every environment without ids (dev, preview) stays script-free. Staff
// screens are excluded — ad-platform pixels measure the public funnel, and
// staff clicking around all day would poison every audience and conversion
// metric built on them.
import Script from 'next/script';
import { usePathname } from 'next/navigation';

const GA4_ID = process.env.NEXT_PUBLIC_GA4_ID;
const META_PIXEL_ID = process.env.NEXT_PUBLIC_META_PIXEL_ID;

// Staff route prefixes (mirrors middleware.ts config.matcher). Kept as a
// literal so this client component does not pull the auth module into the
// public bundle.
const STAFF_PREFIXES = [
  '/dashboard', '/registrations', '/payments', '/courses', '/users', '/tutors',
  '/attendance', '/course-feedback', '/calls', '/certificates', '/messaging',
  '/assistant', '/follow-up', '/corporate', '/editorial', '/coupons', '/leads',
  '/sales', '/campaigns', '/partners', '/sequences',
];

export function AnalyticsScripts() {
  const pathname = usePathname() ?? '/';
  if (STAFF_PREFIXES.some((prefix) => pathname.startsWith(prefix))) return null;
  if (!GA4_ID && !META_PIXEL_ID) return null;

  return (
    <>
      {GA4_ID && (
        <>
          <Script
            src={`https://www.googletagmanager.com/gtag/js?id=${GA4_ID}`}
            strategy="afterInteractive"
          />
          <Script id="ga4-init" strategy="afterInteractive">
            {`window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', '${GA4_ID}');`}
          </Script>
        </>
      )}
      {META_PIXEL_ID && (
        <Script id="meta-pixel-init" strategy="afterInteractive">
          {`!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;
n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,
document,'script','https://connect.facebook.net/en_US/fbevents.js');
fbq('init', '${META_PIXEL_ID}');
fbq('track', 'PageView');`}
        </Script>
      )}
    </>
  );
}
