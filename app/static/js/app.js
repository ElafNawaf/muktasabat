/**
 * Muktasbat — App shell + UX enhancements.
 * Sections:
 *   1. Sidebar (mobile drawer, desktop collapse)
 *   2. Flash auto-dismiss
 *   3. Button ripple effect
 *   4. Number count-up animation (IntersectionObserver)
 *   5. Scroll-reveal stagger (IntersectionObserver)
 *   6. Table-row stagger on first render
 *   7. Progress ring animated entrance
 *   8. Theme overlay flash for smoother switching
 *   9. Loading bar on navigation
 *  10. Toast helper (used by route JS)
 */
(function () {
    'use strict';

    /* ─── 1. Sidebar ────────────────────────────────────────────── */
    var KEY_COLLAPSED = 'muktasbat-sidebar-collapsed';
    var mqMobile = window.matchMedia('(max-width: 900px)');

    function isMobile() { return mqMobile.matches; }

    function loadCollapsedState() {
        if (isMobile()) {
            document.documentElement.classList.remove('sidebar-collapsed');
            return;
        }
        var saved = localStorage.getItem(KEY_COLLAPSED);
        document.documentElement.classList.toggle('sidebar-collapsed', saved === '1');
    }

    function syncButton() {
        var btn = document.getElementById('sidebarCollapseBtn');
        if (!btn) return;
        var collapsed = document.documentElement.classList.contains('sidebar-collapsed');
        btn.title = collapsed ? 'Expand' : 'Collapse';
    }

    function toggleCollapse() {
        if (isMobile()) return;
        var next = !document.documentElement.classList.contains('sidebar-collapsed');
        document.documentElement.classList.toggle('sidebar-collapsed', next);
        localStorage.setItem(KEY_COLLAPSED, next ? '1' : '0');
        syncButton();
    }

    function initMobileDrawer() {
        var toggle = document.getElementById('sidebarToggle');
        var backdrop = document.getElementById('sidebarBackdrop');
        function setOpen(open) {
            document.documentElement.classList.toggle('sidebar-open', open);
        }
        if (toggle) {
            toggle.addEventListener('click', function () {
                setOpen(!document.documentElement.classList.contains('sidebar-open'));
            });
        }
        if (backdrop) {
            backdrop.addEventListener('click', function () { setOpen(false); });
        }
    }

    /* ─── 2. Flash auto-dismiss ─────────────────────────────────── */
    function initFlashDismiss() {
        document.querySelectorAll('.alert-dismissible').forEach(function (alert) {
            setTimeout(function () {
                alert.style.transition = 'opacity 0.4s ease, transform 0.4s ease';
                alert.style.opacity = '0';
                alert.style.transform = 'translateY(-6px)';
                setTimeout(function () { alert.remove(); }, 420);
            }, 4800);
        });
    }

    /* ─── 3. Button ripple ──────────────────────────────────────── */
    function addRipple(e) {
        var el = e.currentTarget;
        var rect = el.getBoundingClientRect();
        var size = Math.max(rect.width, rect.height) * 1.4;
        var x = (e.clientX - rect.left) - size / 2;
        var y = (e.clientY - rect.top)  - size / 2;
        var wave = document.createElement('span');
        wave.className = 'ripple-wave';
        wave.style.cssText = 'width:' + size + 'px;height:' + size + 'px;left:' + x + 'px;top:' + y + 'px';
        el.appendChild(wave);
        wave.addEventListener('animationend', function () { wave.remove(); });
    }

    function initRipple() {
        var sel = '.btn-add,.plan-btn,.btn-sm,.row-btn,.btn-logout,.theme-toggle,.lang-toggle,.btn-primary';
        document.querySelectorAll(sel).forEach(function (btn) {
            btn.addEventListener('click', addRipple);
        });
        // Delegate future dynamically added buttons inside modals
        document.addEventListener('click', function (e) {
            var btn = e.target.closest(sel);
            if (btn && !btn._rippleInited) {
                btn._rippleInited = true;
                addRipple.call(null, { currentTarget: btn, clientX: e.clientX, clientY: e.clientY });
            }
        });
    }

    /* ─── 4. Number count-up ────────────────────────────────────── */
    function animateNumber(el) {
        var raw = el.textContent.replace(/,/g, '').trim();
        var num = parseFloat(raw);
        if (isNaN(num) || num === 0) return;

        var isFloat = raw.indexOf('.') !== -1;
        var decimalPlaces = isFloat ? (raw.split('.')[1] || '').length : 0;
        var suffix = el.dataset.suffix || '';
        var prefix = el.dataset.prefix || '';
        var duration = 900;
        var start = performance.now();
        var startVal = 0;

        el.classList.add('counting');

        function step(now) {
            var progress = Math.min((now - start) / duration, 1);
            // ease-out-expo
            var eased = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);
            var current = startVal + (num - startVal) * eased;
            var display = isFloat
                ? current.toFixed(decimalPlaces)
                : Math.floor(current).toLocaleString();
            el.textContent = prefix + display + suffix;
            if (progress < 1) requestAnimationFrame(step);
            else el.textContent = prefix + (isFloat ? num.toFixed(decimalPlaces) : num.toLocaleString()) + suffix;
        }
        requestAnimationFrame(step);
    }

    function initCountUp() {
        if (!('IntersectionObserver' in window)) return;
        var obs = new IntersectionObserver(function (entries) {
            entries.forEach(function (entry) {
                if (entry.isIntersecting) {
                    animateNumber(entry.target);
                    obs.unobserve(entry.target);
                }
            });
        }, { threshold: 0.3 });

        document.querySelectorAll('.animate-number').forEach(function (el) {
            obs.observe(el);
        });
    }

    /* ─── 5. Scroll-reveal stagger ──────────────────────────────── */
    function initReveal() {
        if (!('IntersectionObserver' in window)) {
            document.querySelectorAll('.reveal').forEach(function (el) {
                el.classList.add('is-visible');
            });
            return;
        }
        var obs = new IntersectionObserver(function (entries) {
            entries.forEach(function (entry) {
                if (entry.isIntersecting) {
                    entry.target.classList.add('is-visible');
                    obs.unobserve(entry.target);
                }
            });
        }, { threshold: 0.12 });
        document.querySelectorAll('.reveal').forEach(function (el) { obs.observe(el); });
    }

    /* ─── 6. Table row stagger ──────────────────────────────────── */
    function initTableRowStagger() {
        document.querySelectorAll('.data-tbl tbody tr').forEach(function (tr, i) {
            tr.style.animationDelay = (i * 0.035) + 's';
            tr.classList.add('row-reveal');
        });
    }

    /* ─── 7. Progress ring entrance ────────────────────────────── */
    function initProgressRings() {
        document.querySelectorAll('.progress-ring').forEach(function (ring) {
            ring.classList.add('is-animated');
        });
    }

    /* ─── 8. Theme overlay flash ────────────────────────────────── */
    function ensureOverlay() {
        if (document.getElementById('theme-overlay')) return;
        var div = document.createElement('div');
        div.id = 'theme-overlay';
        document.body.appendChild(div);
    }

    /* Patch the global toggleTheme to add the overlay flash */
    var _origToggleTheme = window.toggleTheme;
    window.toggleTheme = function () {
        var overlay = document.getElementById('theme-overlay');
        if (overlay) {
            overlay.classList.remove('flashing');
            void overlay.offsetWidth; // force reflow
            overlay.classList.add('flashing');
            overlay.addEventListener('animationend', function handler() {
                overlay.classList.remove('flashing');
                overlay.removeEventListener('animationend', handler);
            });
        }
        if (typeof _origToggleTheme === 'function') _origToggleTheme();
    };

    /* ─── 9. Navigation loading bar ─────────────────────────────── */
    function initLoadingBar() {
        var bar = document.createElement('div');
        bar.id = 'nprogress-bar';
        document.body.appendChild(bar);

        var links = document.querySelectorAll('a[href]:not([target="_blank"]):not([href^="#"]):not([href^="javascript"])');
        links.forEach(function (a) {
            a.addEventListener('click', function (e) {
                if (e.ctrlKey || e.metaKey || e.shiftKey) return;
                bar.classList.add('active');
                setTimeout(function () { bar.classList.remove('active'); }, 3000);
            });
        });
    }

    /* ─── 10. Toast helper ──────────────────────────────────────── */
    window.showToast = function (message, type) {
        var container = document.getElementById('toastContainer');
        if (!container) return;
        var toast = document.createElement('div');
        toast.className = 'toast toast-' + (type || 'success');
        toast.textContent = message;
        container.appendChild(toast);
        setTimeout(function () {
            toast.style.transition = 'opacity 0.35s ease, transform 0.35s ease';
            toast.style.opacity = '0';
            toast.style.transform = 'translateX(20px)';
            setTimeout(function () { toast.remove(); }, 370);
        }, 3600);
    };

    /* ─── Boot ──────────────────────────────────────────────────── */
    function init() {
        loadCollapsedState();
        syncButton();

        var collapseBtn = document.getElementById('sidebarCollapseBtn');
        if (collapseBtn) collapseBtn.addEventListener('click', toggleCollapse);

        initMobileDrawer();

        if (mqMobile.addEventListener) {
            mqMobile.addEventListener('change', function () {
                loadCollapsedState();
                syncButton();
                document.documentElement.classList.remove('sidebar-open');
            });
        }

        initFlashDismiss();
        initRipple();
        initCountUp();
        initReveal();
        initTableRowStagger();
        initProgressRings();
        ensureOverlay();
        initLoadingBar();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
