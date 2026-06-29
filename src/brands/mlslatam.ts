export const brand = {
  name: 'MLS LATAM',
  shortName: 'MLS',
  themeColor: '#141414',      // actualizar con el color primario real de MLS LATAM
  backgroundColor: '#141414',
  description: 'Plataforma MLS para el mercado inmobiliario latinoamericano.',
  appleIcon: '/icons/mlslatam/ios/180.png',
  icons: [
    { src: '/icons/mlslatam/android/launchericon-192x192.png', sizes: '192x192', type: 'image/png' },
    { src: '/icons/mlslatam/android/launchericon-512x512.png', sizes: '512x512', type: 'image/png' },
    { src: '/icons/mlslatam/android/launchericon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' as const },
    { src: '/icons/mlslatam/ios/180.png', sizes: '180x180', type: 'image/png' },
  ],
} as const;
