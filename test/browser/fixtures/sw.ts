import { createEmrouteSW } from '@emkodev/emroute/sw';

createEmrouteSW({
  cacheName: 'emroute-test-v1',
  precache: [
    '/importmap.json',
    '/emroute.js',
    '/app.js',
    '/main.css',
  ],
  content: [
    '/routes.manifest.json',
    '/widgets.manifest.json',
    '/routes/index.page.js',
    '/routes/about.page.js',
  ],
  title: 'emroute test',
});
