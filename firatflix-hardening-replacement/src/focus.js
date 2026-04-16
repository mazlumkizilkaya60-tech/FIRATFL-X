import { qsa } from './util.js';

function isVisible(element) {
  return Boolean(element && element.offsetParent !== null);
}

function scoreTarget(currentRect, nextRect, direction) {
  const dx = nextRect.left - currentRect.left;
  const dy = nextRect.top - currentRect.top;

  if (direction === 'left' && dx >= 0) return null;
  if (direction === 'right' && dx <= 0) return null;
  if (direction === 'up' && dy >= 0) return null;
  if (direction === 'down' && dy <= 0) return null;

  const primary = direction === 'left' || direction === 'right' ? Math.abs(dx) : Math.abs(dy);
  const secondary = direction === 'left' || direction === 'right' ? Math.abs(dy) : Math.abs(dx);

  return primary * 10 + secondary;
}

export class FocusManager {
  constructor(root) {
    this.root = root;
    this.scope = root;
    this.elements = [];
    this.current = null;
  }

  setScope(scope) {
    this.scope = scope || this.root;
    this.refresh(this.scope, this.current && this.scope.contains(this.current) ? this.current : null);
  }

  refresh(scope = this.scope || this.root, preferred = null) {
    this.scope = scope || this.root;
    this.elements = qsa('.selector:not([disabled])', this.scope).filter(isVisible);

    for (const element of this.elements) {
      element.classList.remove('is-focused');
    }

    const next =
      (preferred && this.elements.includes(preferred) && preferred) ||
      this.elements.find((element) => element.dataset.preferredFocus === 'true') ||
      this.elements[0] ||
      null;

    if (next) {
      this.focus(next);
    } else {
      this.current = null;
    }
  }

  focus(element) {
    if (!element) {
      return;
    }

    if (this.current && this.current !== element) {
      this.current.classList.remove('is-focused');
    }

    this.current = element;
    element.classList.add('is-focused');

    try {
      element.focus({ preventScroll: true });
      element.scrollIntoView({
        block: 'nearest',
        inline: 'nearest',
        behavior: 'smooth',
      });
    } catch {}
  }

  click() {
    this.current?.click?.();
  }

  move(direction) {
    if (!this.current || !this.elements.length) {
      return false;
    }

    const currentRect = this.current.getBoundingClientRect();
    const candidates = this.elements
      .filter((element) => element !== this.current)
      .map((element) => {
        const score = scoreTarget(currentRect, element.getBoundingClientRect(), direction);
        return score == null ? null : { element, score };
      })
      .filter(Boolean)
      .sort((left, right) => left.score - right.score);

    const next = candidates[0]?.element;

    if (!next) {
      return false;
    }

    this.focus(next);
    return true;
  }
}
