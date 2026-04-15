export class SpatialNavigator {
  constructor() {
    this._focus = null;
    this._previous = null;
    this._collection = [];
    this.straightOnly = true;
    this.straightOverlapThreshold = 0.5;
    this.ignoreHiddenElement = true;
    this.rememberSource = true;
    this.navigableFilter = null;
    this.silent = false;
    this._listeners = {};
  }

  on(type, listener) {
    this._listeners[type] ??= [];
    if (!this._listeners[type].includes(listener)) {
      this._listeners[type].push(listener);
    }
  }

  emit(type, payload) {
    (this._listeners[type] ?? []).forEach((listener) =>
      listener({
        ...payload,
        target: this
      })
    );
  }

  setCollection(collection) {
    this.unfocus();
    this._collection = [];
    this.multiAdd(collection);
  }

  multiAdd(elements = []) {
    Array.from(elements).forEach((element) => {
      if (element && !this._collection.includes(element)) {
        this._collection.push(element);
      }
    });
  }

  focus(element) {
    const target = element ?? this._collection.find((item) => this._isNavigable(item));
    if (!target || !this._collection.includes(target) || !this._isNavigable(target)) {
      return false;
    }

    this.unfocus();
    this._focus = target;
    if (!this.silent) {
      this.emit('focus', { elem: target });
    }
    return true;
  }

  unfocus() {
    if (!this._focus) return true;
    const element = this._focus;
    this._focus = null;
    if (!this.silent) {
      this.emit('unfocus', { elem: element });
    }
    return true;
  }

  getFocusedElement() {
    return this._focus;
  }

  canmove(direction) {
    if (!this._focus) return false;
    return this.navigate(this._focus, direction);
  }

  move(direction) {
    if (!this._focus) {
      return this.focus();
    }

    const destination = this.navigate(this._focus, direction);
    if (!destination) return false;

    const reverse = {
      left: 'right',
      right: 'left',
      up: 'down',
      down: 'up'
    };

    if (this.rememberSource) {
      this._previous = {
        source: this._focus,
        destination,
        reverse: reverse[direction]
      };
    }

    this.focus(destination);
    return true;
  }

  navigate(target, direction) {
    if (!target || !direction || !this._collection.length) return null;
    const targetRect = this._getRect(target);
    if (!targetRect) return null;

    const rects = this._getAllRects(target);
    if (!rects.length) return null;

    const distance = this._getDistanceFunctions(targetRect);
    const groups = this._partition(rects, targetRect);
    const inside = this._partition(groups[4], targetRect.center);
    const priorities = this._buildPriorities(direction.toLowerCase(), groups, inside, distance);
    if (!priorities) return null;
    const preferred = this._prioritize(priorities, target, direction.toLowerCase());
    return preferred?.element ?? null;
  }

  _buildPriorities(direction, groups, inside, distance) {
    switch (direction) {
      case 'left':
        return [
          { group: inside[0].concat(inside[3], inside[6]), distance: [distance.nearPlumbLine, distance.top] },
          { group: groups[3], distance: [distance.nearPlumbLine, distance.top] },
          { group: groups[0].concat(groups[6]), distance: [distance.nearHorizon, distance.right, distance.nearTargetTop] }
        ];
      case 'right':
        return [
          { group: inside[2].concat(inside[5], inside[8]), distance: [distance.nearPlumbLine, distance.top] },
          { group: groups[5], distance: [distance.nearPlumbLine, distance.top] },
          { group: groups[2].concat(groups[8]), distance: [distance.nearHorizon, distance.left, distance.nearTargetTop] }
        ];
      case 'up':
        return [
          { group: inside[0].concat(inside[1], inside[2]), distance: [distance.nearHorizon, distance.left] },
          { group: groups[1], distance: [distance.nearHorizon, distance.left] },
          { group: groups[0].concat(groups[2]), distance: [distance.nearPlumbLine, distance.bottom, distance.nearTargetLeft] }
        ];
      case 'down':
        return [
          { group: inside[6].concat(inside[7], inside[8]), distance: [distance.nearHorizon, distance.left] },
          { group: groups[7], distance: [distance.nearHorizon, distance.left] },
          { group: groups[6].concat(groups[8]), distance: [distance.nearPlumbLine, distance.top, distance.nearTargetLeft] }
        ];
      default:
        return null;
    }
  }

  _prioritize(priorities, target, direction) {
    const candidates = this.straightOnly ? priorities.slice(0, 2) : priorities;
    const choice = candidates.find((priority) => priority.group.length);
    if (!choice) return null;

    if (
      this.rememberSource &&
      this._previous &&
      target === this._previous.destination &&
      direction === this._previous.reverse
    ) {
      const remembered = choice.group.find((item) => item.element === this._previous.source);
      if (remembered) return remembered;
    }

    choice.group.sort((left, right) =>
      choice.distance.reduce((answer, getter) => answer || getter(left) - getter(right), 0)
    );

    return choice.group[0];
  }

  _isNavigable(element) {
    if (!element) return false;
    if (this.navigableFilter && !this.navigableFilter(element)) return false;

    if (this.ignoreHiddenElement && element instanceof HTMLElement) {
      const styles = window.getComputedStyle(element);
      if (
        (element.offsetWidth <= 0 && element.offsetHeight <= 0) ||
        styles.visibility === 'hidden' ||
        styles.display === 'none' ||
        element.hasAttribute('aria-hidden')
      ) {
        return false;
      }
    }

    return true;
  }

  _getRect(element) {
    if (!this._isNavigable(element)) return null;
    const rect = element.getBoundingClientRect();
    return {
      element,
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,
      right: rect.left + rect.width,
      bottom: rect.top + rect.height,
      center: {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2
      }
    };
  }

  _getAllRects(excludedElement) {
    return this._collection
      .filter((element) => element !== excludedElement)
      .map((element) => this._getRect(element))
      .filter(Boolean);
  }

  _partition(rects, targetRect) {
    const threshold = Math.max(0, Math.min(1, this.straightOverlapThreshold));
    const groups = [[], [], [], [], [], [], [], [], []];

    rects.forEach((rect) => {
      const center = rect.center;
      const x = center.x < targetRect.left ? 0 : center.x <= targetRect.right ? 1 : 2;
      const y = center.y < targetRect.top ? 0 : center.y <= targetRect.bottom ? 1 : 2;
      const groupId = y * 3 + x;

      groups[groupId].push(rect);

      if ([0, 2, 6, 8].includes(groupId)) {
        if (rect.left <= targetRect.right - targetRect.width * threshold) {
          if (groupId === 2) groups[1].push(rect);
          if (groupId === 8) groups[7].push(rect);
        }

        if (rect.right >= targetRect.left + targetRect.width * threshold) {
          if (groupId === 0) groups[1].push(rect);
          if (groupId === 6) groups[7].push(rect);
        }

        if (rect.top <= targetRect.bottom - targetRect.height * threshold) {
          if (groupId === 6) groups[3].push(rect);
          if (groupId === 8) groups[5].push(rect);
        }

        if (rect.bottom >= targetRect.top + targetRect.height * threshold) {
          if (groupId === 0) groups[3].push(rect);
          if (groupId === 2) groups[5].push(rect);
        }
      }
    });

    return groups;
  }

  _getDistanceFunctions(targetRect) {
    return {
      nearPlumbLine: (rect) =>
        Math.max(
          0,
          rect.center.x < targetRect.center.x ? targetRect.center.x - rect.right : rect.left - targetRect.center.x
        ),
      nearHorizon: (rect) =>
        Math.max(
          0,
          rect.center.y < targetRect.center.y ? targetRect.center.y - rect.bottom : rect.top - targetRect.center.y
        ),
      nearTargetLeft: (rect) =>
        Math.max(0, rect.center.x < targetRect.center.x ? targetRect.left - rect.right : rect.left - targetRect.left),
      nearTargetTop: (rect) =>
        Math.max(0, rect.center.y < targetRect.center.y ? targetRect.top - rect.bottom : rect.top - targetRect.top),
      top: (rect) => rect.top,
      bottom: (rect) => -rect.bottom,
      left: (rect) => rect.left,
      right: (rect) => -rect.right
    };
  }
}
