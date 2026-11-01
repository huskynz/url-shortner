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
  origin: function () { return window.location.origin; }
};
