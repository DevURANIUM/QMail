import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import router from './router';
import './style.css';

const savedTheme = localStorage.getItem('qmail_theme');
const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
document.documentElement.classList.toggle('dark', savedTheme === 'dark' || (!savedTheme && prefersDark));

const app = createApp(App);

app.use(createPinia());
app.use(router);

app.mount('#app');
