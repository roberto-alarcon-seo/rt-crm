export const brand = {
  name: 'Brokia24',
  shortName: 'Brokia',
  themeColor: '#141414',
  backgroundColor: '#141414',
  description: 'CRM inmobiliario con IA para brokers. Gestiona leads, campañas y seguimientos.',
  appleIcon: '/icons/brokia/ios/180.png',
  icons: [
    { src: '/icons/brokia/android/launchericon-192x192.png', sizes: '192x192', type: 'image/png' },
    { src: '/icons/brokia/android/launchericon-512x512.png', sizes: '512x512', type: 'image/png' },
    { src: '/icons/brokia/android/launchericon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' as const },
    { src: '/icons/brokia/ios/180.png', sizes: '180x180', type: 'image/png' },
  ],
} as const;
