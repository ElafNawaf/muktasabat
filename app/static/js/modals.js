/**
 * Muktasbat — Bootstrap modal tracing (browser console).
 * Look for [Muktasbat modal] and correlate with server logs [req …].
 *
 * Reparents .modal roots to document.body so position:fixed is not affected by
 * ancestor transforms (page animations) or overflow — fixes clipped/hidden footers.
 */
(function () {
    var PREFIX = '[Muktasbat modal]';

    function reparentModalsToBody() {
        document.querySelectorAll('.modal').forEach(function (el) {
            if (el.parentNode !== document.body) {
                document.body.appendChild(el);
            }
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', reparentModalsToBody);
    } else {
        reparentModalsToBody();
    }

    function log() {
        if (typeof console === 'undefined' || !console.info) return;
        var args = [PREFIX].concat(Array.prototype.slice.call(arguments));
        console.info.apply(console, args);
    }

    document.addEventListener('show.bs.modal', function (e) {
        log('show', e.target && e.target.id, e.target && e.target.className);
    });
    document.addEventListener('shown.bs.modal', function (e) {
        log('shown', e.target && e.target.id);
    });
    document.addEventListener('hide.bs.modal', function (e) {
        log('hide', e.target && e.target.id);
    });
    document.addEventListener('hidden.bs.modal', function (e) {
        log('hidden', e.target && e.target.id);
    });

    document.addEventListener('submit', function (ev) {
        var form = ev.target;
        if (!form || form.tagName !== 'FORM') return;
        if (!form.closest || !form.closest('.modal')) return;
        var action = form.getAttribute('action') || '';
        var method = (form.getAttribute('method') || 'GET').toUpperCase();
        log('form submit', method, action);
    }, true);

    document.addEventListener('click', function (ev) {
        var t = ev.target;
        if (!t || !t.closest) return;
        var dismiss = t.closest('[data-bs-dismiss="modal"]');
        if (dismiss) log('dismiss click', dismiss.className);
    }, true);
})();
