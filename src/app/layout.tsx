import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "よるログ - 今日の夕食レシピ提案＆食事記録",
  description: "毎日の夕食の献立提案と食事ログ収集・カレンダー管理を行えるモバイル特化PWA",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    title: "よるログ",
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: "/icons/icon-192.svg",
    apple: "/icons/icon-192.svg",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1.0,
  maximumScale: 1.0,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#090d16",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ja"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-slate-950 text-slate-100 select-none">
        {children}
        
        {/* PWA Service Worker Registration & Live Cache-Bust Monitor (Production only) */}
        {process.env.NODE_ENV === 'production' ? (
          <script
            dangerouslySetInnerHTML={{
              __html: `
                if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
                  window.addEventListener('load', function() {
                    const hadController = !!navigator.serviceWorker.controller;
                    
                    navigator.serviceWorker.register('/sw.js').then(
                      function(registration) {
                        console.log('ServiceWorker registration successful with scope: ', registration.scope);
                        
                        // Check for updates to the service worker
                        registration.addEventListener('updatefound', () => {
                          const newWorker = registration.installing;
                          if (newWorker) {
                            newWorker.addEventListener('statechange', () => {
                              if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                                console.log('Newer service worker installed! Triggering live reload...');
                                window.location.reload();
                              }
                            });
                          }
                        });
                      },
                      function(err) {
                        console.log('ServiceWorker registration failed: ', err);
                      }
                    );

                    // Detect when the service worker controller changes and reload the page
                    let refreshing = false;
                    navigator.serviceWorker.addEventListener('controllerchange', () => {
                      if (hadController && !refreshing) {
                        refreshing = true;
                        console.log('ServiceWorker controller changed. Reloading page...');
                        window.location.reload();
                      }
                    });
                  });
                }
              `,
            }}
          />
        ) : (
          /* Development helper: Force unregister Service Worker to prevent hot-reload cache freezes safely */
          <script
            dangerouslySetInnerHTML={{
              __html: `
                if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
                  navigator.serviceWorker.getRegistrations().then(function(registrations) {
                    if (registrations.length > 0) {
                      var promises = registrations.map(function(r) { return r.unregister(); });
                      Promise.all(promises).then(function() {
                        console.log('Development mode: active ServiceWorkers unregistered.');
                        if ('caches' in window) {
                          caches.keys().then(function(names) {
                            return Promise.all(names.map(function(name) { return caches.delete(name); }));
                          }).then(function() {
                            console.log('Development mode: Caches cleared.');
                            if (!sessionStorage.getItem('sw_cleared_reload')) {
                              sessionStorage.setItem('sw_cleared_reload', 'true');
                              console.log('First-time SW cleanup: Reloading page to apply updates...');
                              window.location.reload();
                            }
                          });
                        } else {
                          if (!sessionStorage.getItem('sw_cleared_reload')) {
                            sessionStorage.setItem('sw_cleared_reload', 'true');
                            console.log('First-time SW cleanup: Reloading page to apply updates...');
                            window.location.reload();
                          }
                        }
                      });
                    }
                  });
                }
              `,
            }}
          />
        )}
      </body>
    </html>
  );
}
