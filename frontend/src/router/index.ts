import { createRouter, createWebHistory } from 'vue-router';
import { useAuthStore } from '@/stores/auth';

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/login',
      name: 'login',
      component: () => import('@/views/Login.vue'),
      meta: { guest: true },
    },
    {
      path: '/setup',
      name: 'setup',
      component: () => import('@/views/Setup.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/',
      component: () => import('@/views/Layout.vue'),
      meta: { requiresAuth: true },
      children: [
        {
          path: '',
          name: 'dashboard',
          component: () => import('@/views/Dashboard.vue'),
        },
        {
          path: 'inbox',
          name: 'inbox',
          component: () => import('@/views/Inbox.vue'),
        },
        {
          path: 'inbox/:id',
          name: 'email',
          component: () => import('@/views/EmailView.vue'),
        },
        {
          path: 'sent',
          name: 'sent',
          component: () => import('@/views/Sent.vue'),
        },
        {
          path: 'sent/:id',
          name: 'sent-email',
          component: () => import('@/views/EmailView.vue'),
        },
        {
          path: 'compose',
          name: 'compose',
          component: () => import('@/views/Compose.vue'),
        },
        {
          path: 'settings',
          name: 'settings',
          component: () => import('@/views/Settings.vue'),
        },
      ],
    },
  ],
});

router.beforeEach(async (to, _from, next) => {
  const authStore = useAuthStore();

  // Wait for auth check to complete
  if (authStore.isLoading) {
    await authStore.checkAuth();
  }

  // Handle setup page
  if (authStore.needsSetup && to.name !== 'login') {
    next({ name: 'login' });
    return;
  }

  // Handle guest routes (login)
  if (to.meta.guest) {
    if (authStore.isAuthenticated) {
      next({ name: 'dashboard' });
      return;
    }
    next();
    return;
  }

  // Handle protected routes
  if (to.meta.requiresAuth && !authStore.isAuthenticated) {
    next({ name: 'login' });
    return;
  }

  next();
});

export default router;
