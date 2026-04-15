export const qs = (selector, root = document) => root.querySelector(selector);
export const qsa = (selector, root = document) => Array.from(root.querySelectorAll(selector));

export function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function createNode(tagName, options = {}) {
  const element = document.createElement(tagName);
  const { className, text, html, attrs = {}, dataset = {} } = options;

  if (className) {
    element.className = className;
  }

  if (text != null) {
    element.textContent = text;
  }

  if (html != null) {
    element.innerHTML = html;
  }

  Object.entries(attrs).forEach(([key, value]) => {
    if (value == null) return;
    element.setAttribute(key, String(value));
  });

  Object.entries(dataset).forEach(([key, value]) => {
    if (value == null) return;
    element.dataset[key] = String(value);
  });

  return element;
}

export function setImageFallback(image, fallback = './images/poster-fallback.svg') {
  if (!image) return;

  image.addEventListener(
    'error',
    () => {
      image.onerror = null;
      image.src = fallback;
    },
    { once: true }
  );
}

export function focusWithoutScroll(element) {
  if (!element || typeof element.focus !== 'function') return;

  try {
    element.focus({ preventScroll: true });
  } catch (error) {
    element.focus();
  }
}

export function smoothScrollIntoView(element) {
  if (!element?.scrollIntoView) return;

  try {
    element.scrollIntoView({
      block: 'nearest',
      inline: 'nearest',
      behavior: 'smooth'
    });
  } catch (error) {
    element.scrollIntoView();
  }
}

export function isTypingElement(element) {
  return Boolean(
    element &&
      (element.tagName === 'INPUT' ||
        element.tagName === 'TEXTAREA' ||
        element.tagName === 'SELECT' ||
        element.isContentEditable)
  );
}

export function elementIsVisible(element) {
  if (!element || !(element instanceof HTMLElement)) return false;

  const styles = window.getComputedStyle(element);

  return (
    !element.hidden &&
    element.offsetParent !== null &&
    styles.visibility !== 'hidden' &&
    styles.display !== 'none' &&
    styles.pointerEvents !== 'none'
  );
}
