// Small JS helpers used by the public site (clipboard + localStorage favorites).
window.urlShortener = {
  copyText: async function (text) {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch (e) { /* fall through */ }
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.left = '-9999px';
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    document.body.removeChild(textArea);
    return ok;
  },
  getFavorites: function () {
    try {
      const saved = localStorage.getItem('urlFavorites');
      return saved ? JSON.parse(saved) : [];
    } catch (e) { return []; }
  },
  setFavorites: function (list) {
    try { localStorage.setItem('urlFavorites', JSON.stringify(list)); } catch (e) { /* ignore */ }
  },
  origin: function () { return window.location.origin; },
  toggleNavigation: function (button) {
    const workspace = button.closest('.admin-workspace');
    const expanded = button.getAttribute('aria-expanded') !== 'true';
    button.setAttribute('aria-expanded', String(expanded));
    workspace.classList.toggle('navigation-open', expanded);
  },
  dialogFocus: new Map(),
  openDialog: function (dialog, id) {
    this.dialogFocus.set(id, document.activeElement);
    dialog.removeAttribute('open');
    dialog.showModal();
    dialog.addEventListener('cancel', event => {
      event.preventDefault();
      dialog.querySelector('[data-dialog-close]:not(:disabled)')?.click();
    });
    dialog.addEventListener('keydown', event => {
      if (event.key !== 'Tab') return;
      const focusable = [...dialog.querySelectorAll('a[href], button:not(:disabled), input:not(:disabled):not([type="hidden"]), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]')]
        .filter(element => element.getClientRects().length > 0);
      const first = focusable[0], last = focusable[focusable.length - 1];
      if (!first) { event.preventDefault(); return; }
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    });
    (dialog.querySelector('input:not(:disabled), select:not(:disabled), [data-dialog-close]'))?.focus();
  },
  restoreDialogFocus: function (id) {
    const previous = this.dialogFocus.get(id);
    this.dialogFocus.delete(id);
    if (previous?.isConnected) previous.focus();
  }
};
