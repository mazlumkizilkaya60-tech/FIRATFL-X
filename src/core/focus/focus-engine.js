import { SpatialNavigator } from './spatial-navigator.js';
import { elementIsVisible, focusWithoutScroll, qsa, smoothScrollIntoView } from '../utils/dom.js';

export class FocusEngine {
  constructor(root = document) {
    this.root = root;
    this.scopeStack = [];
    this.currentScope = root;
    this.lastFocused = null;
    this.lastFocusedByScope = new Map();
    this.lastFocusTokenByScope = new Map();
    this.navigator = new SpatialNavigator();

    this.navigator.on('focus', ({ elem }) => {
      elem.classList.add('is-focused');
      this.lastFocused = elem;
      const scopeKey = this.scopeKey(this.currentScope);
      this.lastFocusedByScope.set(scopeKey, elem);
      this.lastFocusTokenByScope.set(scopeKey, this.focusToken(elem));
      focusWithoutScroll(elem);
      smoothScrollIntoView(elem);
      elem.dispatchEvent(new CustomEvent('tvfocus', { bubbles: true }));
    });

    this.navigator.on('unfocus', ({ elem }) => {
      elem.classList.remove('is-focused');
      elem.dispatchEvent(new CustomEvent('tvblur', { bubbles: true }));
    });
  }

  scopeKey(scope) {
    if (!scope || scope === document) return 'document';
    if (!scope.dataset.focusScopeId) {
      scope.dataset.focusScopeId = `scope-${Math.random().toString(36).slice(2, 9)}`;
    }
    return scope.dataset.focusScopeId;
  }

  focusToken(element) {
    if (!element) return '';

    if (element.dataset.focusId) {
      return element.dataset.focusId;
    }

    return [
      element.tagName,
      element.getAttribute('data-action') || '',
      element.getAttribute('data-value') || '',
      element.getAttribute('href') || '',
      element.getAttribute('name') || '',
      element.id || '',
      element.getAttribute('aria-label') || '',
      element.textContent?.trim().slice(0, 80) || ''
    ].join('|');
  }

  getSelectable(scope = this.currentScope) {
    return qsa('.selector', scope === document ? document : scope).filter(elementIsVisible);
  }

  refresh(scope = this.currentScope, preferred) {
    this.currentScope = scope;
    const nodes = this.getSelectable(scope);
    this.navigator.setCollection(nodes);
    const scopeKey = this.scopeKey(scope);
    const rememberedToken = this.lastFocusTokenByScope.get(scopeKey);
    const remembered =
      preferred ||
      this.lastFocusedByScope.get(scopeKey) ||
      nodes.find((node) => rememberedToken && this.focusToken(node) === rememberedToken) ||
      this.lastFocused ||
      nodes[0];

    if (remembered && nodes.includes(remembered)) {
      this.navigator.focus(remembered);
    } else if (nodes[0]) {
      this.navigator.focus(nodes[0]);
    }
  }

  pushScope(scope, preferred) {
    this.scopeStack.push({
      scope: this.currentScope,
      preferred: this.navigator.getFocusedElement()
    });
    this.refresh(scope, preferred);
  }

  popScope(fallback) {
    const previous = this.scopeStack.pop();
    if (!previous) {
      this.refresh(document, fallback);
      return;
    }
    this.refresh(previous.scope, fallback || previous.preferred);
  }

  move(direction) {
    return this.navigator.move(direction);
  }

  getFocusedElement() {
    return this.navigator.getFocusedElement();
  }

  clickFocused() {
    const focused = this.getFocusedElement();
    if (!focused) return false;
    focused.click();
    return true;
  }

  bindRemote(remoteControl) {
    return remoteControl.subscribe((action) => {
      if (['left', 'right', 'up', 'down'].includes(action)) {
        return this.move(action);
      }
      if (action === 'enter') {
        return this.clickFocused();
      }
      return false;
    });
  }
}
