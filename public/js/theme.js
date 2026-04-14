/* ═══════════════════════════════════════════
   Theme Toggle — Dark/Light Mode
   Persists preference via localStorage
   ═══════════════════════════════════════════ */

(function () {
    const STORAGE_KEY = 'iotech-theme';

    // Apply saved theme ASAP (prevents flash)
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
        document.documentElement.setAttribute('data-theme', saved);
    } else {
        document.documentElement.setAttribute('data-theme', 'dark');
    }

    document.addEventListener('DOMContentLoaded', () => {
        const toggleBtn = document.getElementById('theme-toggle');
        if (!toggleBtn) return;

        toggleBtn.addEventListener('click', () => {
            const current = document.documentElement.getAttribute('data-theme') || 'dark';
            const next = current === 'dark' ? 'light' : 'dark';

            document.documentElement.setAttribute('data-theme', next);
            localStorage.setItem(STORAGE_KEY, next);

            // Small rotation animation
            toggleBtn.style.transform = 'rotate(360deg)';
            setTimeout(() => { toggleBtn.style.transform = ''; }, 400);
        });
    });
})();
