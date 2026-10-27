// Runs before first paint (classic blocking script, CSP 'self' compatible).
// Stamps .dark or .light on <html> from the saved preference or the OS setting.
(function () {
  try {
    var saved = localStorage.getItem('qmail_theme');
    var dark = saved === 'dark' ||
      (saved !== 'light' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    var cls = document.documentElement.classList;
    cls.add(dark ? 'dark' : 'light');
    cls.remove(dark ? 'light' : 'dark');
  } catch (e) {
    /* no-op */
  }
})();
