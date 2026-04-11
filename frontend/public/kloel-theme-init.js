(function () {
  function themeColorFor(theme) {
    return theme === 'dark' ? '#0A0A0C' : '#FFFFFF';
  }

  function applyTheme(theme) {
    var meta = document.querySelector('meta[name="theme-color"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.setAttribute('name', 'theme-color');
      document.head.appendChild(meta);
    }

    document.documentElement.setAttribute('data-kloel-app-theme', theme);
    document.documentElement.style.colorScheme = theme;
    meta.setAttribute('content', themeColorFor(theme));
  }

  try {
    var stored = window.localStorage.getItem('kloel-app-theme');
    applyTheme(stored === 'dark' ? 'dark' : 'light');
  } catch (error) {
    applyTheme('light');
  }
})();
