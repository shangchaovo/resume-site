/**
 * support.js — 支持与反馈页：外链、邮件与一键复制。
 */
(function () {
  'use strict';

  var CONFIG = {
    bmc: 'https://buymeacoffee.com/chasetse',
    email: 'shangchaoxie888@gmail.com'
  };

  function copy(value, done) {
    function fallback() {
      var input = document.createElement('textarea');
      input.value = value;
      input.setAttribute('readonly', '');
      input.style.cssText = 'position:fixed;opacity:0;pointer-events:none;';
      document.body.appendChild(input);
      input.select();
      try { document.execCommand('copy'); } catch (e) {}
      input.remove();
      done();
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(value).then(done).catch(fallback);
    } else fallback();
  }

  function announce(message) {
    if (window.App && window.App.toast) window.App.toast(message);
  }

  function wire() {
    var copyLink = document.getElementById('btn-copy-support-link');
    var copyEmail = document.getElementById('btn-copy-support-email');
    if (copyLink) copyLink.addEventListener('click', function () {
      copy(CONFIG.bmc, function () { announce('已复制 Buy Me a Coffee 支持链接'); });
    });
    if (copyEmail) copyEmail.addEventListener('click', function () {
      copy(CONFIG.email, function () { announce('已复制反馈邮箱：<span class="mono">' + CONFIG.email + '</span>'); });
    });
  }

  window.Support = { config: CONFIG, wire: wire };
})();
