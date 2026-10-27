import './pwa';
import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import router from './router';
import '@fontsource-variable/vazirmatn';
import './style.css';

const app = createApp(App);

app.use(createPinia());
app.use(router);

app.mount('#app');

// PWA: service worker powers push notifications and installability
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch((error) => {
    console.warn('Service worker registration failed:', error);
  });
}
