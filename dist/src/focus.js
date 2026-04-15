import { qsa } from './util.js';

export class FocusManager {
  constructor(root) {
    this.root = root;
    this.scope = root;
    this.elements = [];
    this.current = null;
  }

  refresh(scope = this.root, preferred = null) {
    this.scope = scope;
    this.elements = qsa('.selector:not([disabled])', scope).filter((element) => element.offsetParent !== null);
    this.elements.forEach((element) => element.classList.remove('is-focused'));
    const next = preferred && this.elements.includes(preferred) ? preferred : this.elements[0] || null;
    if (next) this.focus(next);
  }

  focus(element) {
    if (!element) return;
    if (this.current && this.current !== element) this.current.classList.remove('is-focused');
    this.current = element;
    element.classList.add('is-focused');
    element.focus({ preventScroll: true });
    element.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
  }

  click() {
    this.current?.click();
  }

  move(direction) {
    if (!this.current || !this.elements.length) return false;
    const currentRect = this.current.getBoundingClientRect();
    const candidates = this.elements.filter((element) => element !== this.current);
    if (!candidates.length) return false;
    const scored = candidates
      .map((element) => {
        const rect = element.getBoundingClientRect();
        const dx = rect.left - currentRect.left;
        const dy = rect.top - currentRect.top;
        if (direction === 'left' && dx >= 0) return null;
        if (direction === 'right' && dx <= 0) return null;
        if (direction === 'up' && dy >= 0) return null;
        if (direction === 'down' && dy <= 0) return null;
        const distance = Math.abs(dx) + Math.abs(dy) * 1.5;
        return { element, distance };
      })
      .filter(Boolean)
      .sort((a, b) => a.distance - b.distance);
    const next = scored[0]?.element;
    if (!next) return false;
    this.focus(next);
    return true;
  }
}
