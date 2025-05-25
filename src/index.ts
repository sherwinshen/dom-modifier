import { v4 as uuidv4 } from 'uuid';

const elements: Map<Element, ElementRecord> = new Map(); // 元素-变更记录映射
const mutations: Set<Mutation> = new Set();

const nullController: MutationController = { revert: () => {} };
const isBrowser = typeof window !== 'undefined' && typeof document !== 'undefined';
const validAttributeName = /^[a-zA-Z:_][a-zA-Z0-9:_.-]*$/;
const widgetPositions = ['beforebegin', 'afterbegin', 'beforeend', 'afterend'];

// 针对不同类型的监听内容
const getObserverInit = (attr: string, isGlobal?: boolean): MutationObserverInit => {
  if (isGlobal) {
    return { childList: true, subtree: true, attributes: false, characterData: false };
  }
  // 只监听父元素和当前元素的子元素变化
  if (attr === 'widget') {
    return { childList: true, subtree: false, attributes: false, characterData: false };
  }
  // 只监听父元素的子元素变化
  if (attr === 'position') {
    return { childList: true, subtree: true, attributes: false, characterData: false };
  }
  if (attr === 'html') {
    return { childList: true, subtree: true, attributes: true, characterData: true };
  }
  return { childList: false, subtree: false, attributes: true, attributeFilter: [attr] };
};

const getTransformedHTML = (html: string = '', id?: string) => {
  const transformContainer = document.createElement('div');
  transformContainer.innerHTML = html;
  if (id) {
    transformContainer.setAttribute('id', id);
    transformContainer.style.display = 'contents';
    return transformContainer.outerHTML;
  }
  return transformContainer.innerHTML;
};

// 样式对象与样式字符串之间的转换
const styleStringToObject = (styleStr: string): Record<string, string> => {
  if (!styleStr) return {};
  return styleStr
    .split(';')
    .filter(rule => rule.trim() !== '')
    .reduce((styleObj, rule) => {
      const [key, value] = rule.split(':').map(item => item.trim());
      if (key && value) {
        // 转换 CSS 属性名到 JS 格式（如 font-size → fontSize）
        const jsKey = key.replace(/-([a-z])/g, (_, p1) => p1.toUpperCase());
        styleObj[jsKey] = value;
      }
      return styleObj;
    }, {} as Record<string, string>);
};
const styleObjectToString = (styleObj: Record<string, string>): string => {
  if (!styleObj || typeof styleObj !== 'object') return '';
  return Object.entries(styleObj)
    .map(([key, value]) => {
      // 转换 JS 属性名到 CSS 格式（如 fontSize → font-size）
      const cssKey = key.replace(/[A-Z]/g, match => `-${match.toLowerCase()}`);
      return `${cssKey}: ${value};`;
    })
    .join(' ')
    .trim();
};

// 类名集合与类名字符串之间的转换
const classNameSetToString = (set: Set<string>): string =>
  Array.from(set)
    .filter(Boolean)
    .join(' ');
const classNameStringToSet = (val: string): Set<string> => new Set(val.split(/\s+/).filter(Boolean));

const checkPositionSame = (currentVal: ElementPositionWithNode | null, newVal: ElementPositionWithNode | null) => {
  return currentVal?.parentNode === newVal?.parentNode && currentVal?.insertBeforeNode === newVal?.insertBeforeNode;
};

/* ------------------------- 元素记录 ------------------------- */
const getElementRecord = (el: Element): ElementRecord => {
  let record = elements.get(el);
  if (!record) {
    record = { el };
    elements.set(el, record);
  }
  return record;
};
const createElementPropertyRecord = (
  el: Element,
  attr: string,
  mutationRunner: (record: ElementPropertyRecord<any, any>) => void,
  getCurrentValue: (el: Element) => any
) => {
  const currentValue = getCurrentValue(el); // 获取当前值
  const record: ElementPropertyRecord<any, any> = {
    elementId: uuidv4(),
    el,
    attr,
    mutations: [],
    originalValue: currentValue,
    virtualValue: currentValue,
    // 监听当前元素变动，针对变更后对应内容出现变动
    observer: new MutationObserver(() => {
      if (paused) return; // 暂停监听

      // 如果监听元素被删除
      if (!document.body.contains(el)) {
        deleteElementPropertyRecord(el, attr, record);
        elements.delete(el);
        record.mutations.forEach(mutation => {
          mutation.elements.delete(el);
        });
        return;
      }

      const currentValue = getCurrentValue(el);
      // 1. position 场景，位置一致则不处理
      if (attr === 'position' && checkPositionSame(currentValue, record.virtualValue)) return;
      // 2. 其他场景，如果当前值和虚拟值相同，则不处理（widget 场景不适用）
      if (currentValue === record.virtualValue && attr !== 'widget') return;
      record.originalValue = currentValue;
      mutationRunner(record);
    }),
    mutationRunner,
    getCurrentValue,
  };
  // 开启元素监听
  if (attr === 'widget') {
    record.observer.observe(el, getObserverInit(attr));
    el.parentNode && record.observer.observe(el.parentNode, getObserverInit(attr));
  } else {
    const target = attr === 'position' && el.parentNode ? el.parentNode : el;
    record.observer.observe(target, getObserverInit(attr));
  }
  return record;
};

const deleteWidgetContainers = (elementId: string) => {
  // 删除所有 widget 容器（包含所有 widget）
  widgetPositions.forEach(position => {
    document.querySelectorAll(`[widget-${position}-id="${elementId}"]`).forEach(dom => dom.remove());
  });
};
const deleteElementPropertyRecord = (el: Element, attr: string, record: ElementPropertyRecord<any, any>) => {
  const elementRecord = elements.get(el);
  if (!elementRecord) return;
  if (attr === 'html') {
    elementRecord.html?.observer?.disconnect();
    delete elementRecord.html;
    setHTMLValue(el, record.originalValue);
    return;
  }
  if (attr === 'class') {
    elementRecord.classes?.observer?.disconnect();
    delete elementRecord.classes;
    setClassNameValue(el, record.originalValue);
    return;
  }
  if (attr === 'style') {
    elementRecord.styles?.observer?.disconnect();
    delete elementRecord.styles;
    setStyleValue(el, record.originalValue);
    return;
  }
  if (attr === 'widget') {
    elementRecord.widgets?.observer?.disconnect();
    delete elementRecord.widgets;
    deleteWidgetContainers(record.elementId);
  }
  if (attr === 'position') {
    elementRecord.position?.observer?.disconnect();
    delete elementRecord.position;
    setElementPosition(el, record.originalValue);
  }
  elementRecord.attributes?.[attr]?.observer?.disconnect();
  delete elementRecord.attributes?.[attr];
  setAttrValue(el, attr, record.originalValue);
};

/* ------------------------- 类名处理 ------------------------- */
const getClassNameValue = (el: Element) => el.className;
const setClassNameValue = (el: Element, val: string) => (val ? (el.className = val) : el.removeAttribute('class'));
const classMutationRunner = (record: ClassnameRecord) => {
  const val = classNameStringToSet(record.originalValue);
  record.mutations.forEach(m => m.mutate(val));
  const newClassName = classNameSetToString(val);
  if (newClassName !== record.getCurrentValue(record.el)) {
    setClassNameValue(record.el, newClassName);
  }
  record.virtualValue = newClassName;
};
const getElementClassRecord = (el: Element): ClassnameRecord => {
  const elementRecord = getElementRecord(el);
  if (!elementRecord.classes) {
    elementRecord.classes = createElementPropertyRecord(el, 'class', classMutationRunner, getClassNameValue);
  }
  return elementRecord.classes;
};

/* ------------------------- 样式处理 ------------------------- */
const getStyleValue = (el: Element) => el.getAttribute('style') || '';
const setStyleValue = (el: Element, val: string) => (val ? el.setAttribute('style', val) : el.removeAttribute('style'));
const styleMutationRunner = (record: StyleRecord) => {
  const val = styleStringToObject(record.originalValue);
  record.mutations.forEach(m => m.mutate(val));
  const newStyle = styleObjectToString(val);
  if (newStyle !== record.getCurrentValue(record.el)) {
    setStyleValue(record.el, newStyle);
  }
  record.virtualValue = newStyle;
};
const getElementStyleRecord = (el: Element): StyleRecord => {
  const elementRecord = getElementRecord(el);
  if (!elementRecord.styles) {
    elementRecord.styles = createElementPropertyRecord(el, 'style', styleMutationRunner, getStyleValue);
  }
  return elementRecord.styles;
};

/* ------------------------- 属性处理 ------------------------- */
const getAttrValue = (attr: string) => (el: Element) => el.getAttribute(attr);
const setAttrValue = (el: Element, attrName: string, val: string | null) =>
  val !== null && attrName ? el.setAttribute(attrName, val) : el.removeAttribute(attrName);
const attrMutationRunner = (record: AttributeRecord) => {
  let val = record.originalValue;
  record.mutations.forEach(m => (val = m.mutate(val)));
  if (val !== record.getCurrentValue(record.el)) {
    setAttrValue(record.el, record.attr, val);
  }
  record.virtualValue = val;
};
const getElementAttributeRecord = (el: Element, attr: string): AttributeRecord => {
  const elementRecord = getElementRecord(el);
  if (!elementRecord.attributes) {
    elementRecord.attributes = {};
  }
  if (!elementRecord.attributes[attr]) {
    elementRecord.attributes[attr] = createElementPropertyRecord(el, attr, attrMutationRunner, getAttrValue(attr));
  }
  return elementRecord.attributes[attr];
};

/* ------------------------- 内容处理 ------------------------- */
const getHTMLValue = (el: Element) => el.innerHTML;
const setHTMLValue = (el: Element, value: string) => (el.innerHTML = value);
const htmlMutationRunner = (record: HtmlRecord) => {
  let val = record.originalValue;
  record.mutations.forEach(m => (val = m.mutate(val)));
  val = getTransformedHTML(val);
  if (val !== record.getCurrentValue(record.el)) {
    setHTMLValue(record.el, val);
  }
  record.virtualValue = val;
};
const getElementHTMLRecord = (el: Element): HtmlRecord => {
  const elementRecord = getElementRecord(el);
  if (!elementRecord.html) {
    elementRecord.html = createElementPropertyRecord(el, 'html', htmlMutationRunner, getHTMLValue);
  }
  return elementRecord.html;
};

/* ------------------------- 位置移动 ------------------------- */
const getElementPosition = (el: Element) =>
  ({
    parentNode: el.parentElement,
    insertBeforeNode: el.nextElementSibling,
  } as ElementPositionWithNode);
const setElementPosition = (el: Element, value: ElementPositionWithNode) => {
  if (!value || !value.parentNode) {
    return;
  }
  if (value.insertBeforeNode && !value.parentNode.contains(value.insertBeforeNode)) {
    return;
  }
  value.parentNode.insertBefore(el, value.insertBeforeNode);
};
const getPositionNodeFromSelector = ({
  parentSelector,
  insertBeforeSelector,
}: ElementMove): ElementPositionWithNode | null => {
  const parentNode = document.querySelector<HTMLElement>(parentSelector);
  if (!parentNode) return null;
  const insertBeforeNode = insertBeforeSelector ? document.querySelector<HTMLElement>(insertBeforeSelector) : null;
  if (insertBeforeSelector && !insertBeforeNode) return null;
  return { parentNode, insertBeforeNode };
};
const positionMutationRunner = (record: PositionRecord) => {
  let val = record.originalValue;
  // 只生效最后一次的变更
  record.mutations.forEach(m => {
    const selectors = m.mutate();
    val = getPositionNodeFromSelector(selectors) || val;
  });
  const currentVal = record.getCurrentValue(record.el);
  if (val && !checkPositionSame(currentVal, val)) {
    setElementPosition(record.el, val);
  }
  record.virtualValue = val;
};
const getElementPositionRecord = (el: Element): PositionRecord => {
  const elementRecord = getElementRecord(el);
  if (!elementRecord.position) {
    elementRecord.position = createElementPropertyRecord(el, 'position', positionMutationRunner, getElementPosition);
  }
  return elementRecord.position;
};

/* ------------------------- 组件插入 ------------------------- */
const getWidgetValue = (_: Element) => null;
const setWidgetValue = (el: Element, elementId: string, value: InsertWidget, containerElement: Element | null) => {
  if (containerElement) {
    containerElement.insertAdjacentHTML('beforeend', value.content ?? '');
  } else {
    const dom = document.createElement('div');
    dom.setAttribute(`widget-${value.position}-id`, elementId);
    dom.style.display = 'contents';
    dom.innerHTML = value.content ?? '';
    el.insertAdjacentElement(value.position, dom);
  }
};
// 检查 widget 的容器元素，如果位置不对则直接删除
const checkWidgetContainer = (el: Element, elementId: string) => {
  widgetPositions.forEach(position => {
    const dom = document.querySelector(`[widget-${position}-id="${elementId}"]`);
    if (!dom) return;
    position === 'beforebegin' && dom.nextSibling !== el && dom.remove();
    position === 'afterbegin' && el.firstChild !== dom && dom.remove();
    position === 'beforeend' && el.lastChild !== dom && dom.remove();
    position === 'afterend' && dom.previousSibling !== el && dom.remove();
  });
};
const widgetMutationRunner = (record: WidgetRecord) => {
  checkWidgetContainer(record.el, record.elementId);
  record.mutations.forEach(mutation => {
    const insertWidget = mutation.mutate();
    insertWidget.content = getTransformedHTML(insertWidget.content ?? '', mutation.mutationId);
    const containerElement = document.querySelector(`[widget-${insertWidget.position}-id="${record.elementId}"]`);
    const targetElement = document.getElementById(mutation.mutationId);
    if (containerElement && targetElement && containerElement.contains(targetElement)) return;
    if (containerElement && targetElement && !containerElement.contains(targetElement)) {
      targetElement.remove();
    }
    setWidgetValue(record.el, record.elementId, insertWidget, containerElement);
  });
};
const getElementWidgetRecord = (el: Element): WidgetRecord => {
  const elementRecord = getElementRecord(el);
  if (!elementRecord.widgets) {
    elementRecord.widgets = createElementPropertyRecord(el, 'widget', widgetMutationRunner, getWidgetValue);
  }
  return elementRecord.widgets;
};

/* ------------------------- 公共处理 ------------------------- */
const startMutating = (mutation: Mutation, element: Element) => {
  let record: ElementPropertyRecord<any, any> | null = null;
  if (mutation.kind === 'widget') {
    record = getElementWidgetRecord(element);
  } else if (mutation.kind === 'position') {
    record = getElementPositionRecord(element);
  } else if (mutation.kind === 'class') {
    record = getElementClassRecord(element);
  } else if (mutation.kind === 'style') {
    record = getElementStyleRecord(element);
  } else if (mutation.kind === 'html') {
    record = getElementHTMLRecord(element);
  } else if (mutation.kind === 'attribute') {
    record = getElementAttributeRecord(element, mutation.attribute);
  }
  if (!record) return;
  record.mutations.push(mutation);
  record.mutationRunner(record);
};
const applyMutation = (mutation: Mutation) => {
  const existingElements = new Set(mutation.elements);
  const matchingElements = document.querySelectorAll(mutation.selector);
  // widget 和 position 类型变更，如果匹配到多个元素，则不执行变更
  if (['widget', 'position'].includes(mutation.kind) && (matchingElements.length > 1 || existingElements.size > 0)) {
    return;
  }
  matchingElements.forEach(element => {
    if (existingElements.has(element)) return;
    mutation.elements.add(element);
    startMutating(mutation, element);
  });
};
const applyAllMutations = () => {
  mutations.forEach(applyMutation);
};

const stopMutating = (mutation: Mutation, element: Element) => {
  let record: ElementPropertyRecord<any, any> | null = null;
  if (mutation.kind === 'html') {
    record = getElementHTMLRecord(element);
  } else if (mutation.kind === 'class') {
    record = getElementClassRecord(element);
  } else if (mutation.kind === 'style') {
    record = getElementStyleRecord(element);
  } else if (mutation.kind === 'attribute') {
    record = getElementAttributeRecord(element, mutation.attribute);
  } else if (mutation.kind === 'position') {
    record = getElementPositionRecord(element);
  } else if (mutation.kind === 'widget') {
    record = getElementWidgetRecord(element);
  }
  if (!record) return;
  const index = record.mutations.indexOf(mutation);
  if (index !== -1) record.mutations.splice(index, 1);
  if (record.mutations.length === 0) {
    const attr = mutation.kind === 'attribute' ? (mutation as AttributeMutation).attribute : mutation.kind;
    deleteElementPropertyRecord(element, attr, record);
  } else {
    record.mutationRunner(record);
  }
};
const revertMutation = (mutation: Mutation) => {
  mutation.elements.forEach(el => stopMutating(mutation, el));
  mutation.elements.clear();
  mutations.delete(mutation);
};

const newMutation = (m: Mutation): MutationController => {
  if (!isBrowser) return nullController;
  mutations.add(m);
  applyMutation(m);
  return {
    revert: () => {
      revertMutation(m);
    },
  };
};

/* ------------------------- 全局监听 ------------------------- */
let globalObserver: MutationObserver; // 全局监听器
let paused: boolean = false; // 是否暂停监听
function debounce<T extends (...args: any[]) => any>(func: T, wait: number, immediate: boolean = false) {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  let lastArgs: Parameters<T> | null = null;
  let lastThis: any;

  return function(this: any, ...args: Parameters<T>) {
    lastArgs = args;
    lastThis = this;
    if (immediate && !timeoutId) {
      func.apply(lastThis, lastArgs);
    }
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    timeoutId = setTimeout(() => {
      if (!immediate) {
        func.apply(lastThis, lastArgs!);
      }
      timeoutId = null;
      lastArgs = null;
      lastThis = null;
    }, wait);
  };
}
const debouncedApplyAllMutations = debounce(applyAllMutations, 100);
export function connectGlobalObserver() {
  if (!isBrowser) return;
  if (!globalObserver) {
    globalObserver = new MutationObserver(() => {
      debouncedApplyAllMutations();
    });
  }
  applyAllMutations();
  globalObserver.observe(document.documentElement, getObserverInit('', true));
}
export function disconnectGlobalObserver() {
  globalObserver && globalObserver.disconnect();
}
export function pauseGlobalObserver() {
  paused = true;
}
export function isGlobalObserverPaused() {
  return paused;
}
export function resumeGlobalObserver() {
  paused = false;
  applyAllMutations();
}

/* ------------------------- 执行函数 ------------------------- */
export const html = (selector: HtmlMutation['selector'], mutate: HtmlMutation['mutate']) => {
  return newMutation({ mutationId: uuidv4(), kind: 'html', elements: new Set(), mutate, selector });
};
export const classes = (selector: ClassnameMutation['selector'], mutate: ClassnameMutation['mutate']) => {
  return newMutation({ mutationId: uuidv4(), kind: 'class', elements: new Set(), mutate, selector });
};
export const styles = (selector: StyleMutation['selector'], mutate: StyleMutation['mutate']) => {
  return newMutation({ mutationId: uuidv4(), kind: 'style', elements: new Set(), mutate, selector });
};
export const position = (selector: PositionMutation['selector'], mutate: PositionMutation['mutate']) => {
  return newMutation({ mutationId: uuidv4(), kind: 'position', elements: new Set(), mutate, selector });
};
export const widget = (selector: WidgetMutation['selector'], mutate: WidgetMutation['mutate']) => {
  return newMutation({ mutationId: uuidv4(), kind: 'widget', elements: new Set(), mutate, selector });
};
export const attribute = (
  selector: AttributeMutation['selector'],
  attribute: AttributeMutation['attribute'],
  mutate: AttributeMutation['mutate']
) => {
  if (!validAttributeName.test(attribute)) return nullController;
  if (attribute === 'class' || attribute === 'className') {
    return classes(selector, (classnames => {
      const mutatedClassnames = mutate(Array.from(classnames).join(' '));
      classnames.clear();
      if (!mutatedClassnames) return;
      mutatedClassnames
        .split(/\s+/g)
        .filter(Boolean)
        .forEach(c => classnames.add(c));
    }) as ClassnameMutation['mutate']);
  }
  return newMutation({ mutationId: uuidv4(), kind: 'attribute', elements: new Set(), attribute, mutate, selector });
};
export const declarative = (schema: OperateSchema): MutationController => {
  const { selector } = schema;
  if (schema.type === 'html') {
    if (schema.action === 'remove') {
      return html(selector, () => '');
    } else if (schema.action === 'set') {
      return html(selector, () => schema.value ?? '');
    } else if (schema.action === 'append') {
      return html(selector, (val: string) => val + (schema.value ?? ''));
    } else if (schema.action === 'custom') {
      return html(selector, schema.value);
    }
  } else if (schema.type === 'class') {
    if (schema.action === 'remove') {
      return classes(selector, (val: Set<string>) => {
        if (schema.value) {
          const classNameSet = classNameStringToSet(schema.value);
          classNameSet.forEach(item => val.delete(item));
        } else {
          val.clear();
        }
      });
    } else if (schema.action === 'set') {
      return classes(selector, (val: Set<string>) => {
        val.clear();
        if (schema.value) val.add(schema.value);
      });
    } else if (schema.action === 'append') {
      return classes(selector, (val: Set<string>) => {
        if (schema.value) {
          const classNameSet = classNameStringToSet(schema.value);
          classNameSet.forEach(item => val.add(item));
        }
      });
    } else if (schema.action === 'custom') {
      return classes(selector, schema.value);
    }
  } else if (schema.type === 'style') {
    if (schema.action === 'remove') {
      return styles(selector, (styleObj: Record<string, string>) => {
        if (schema.value) {
          const styleAttrs = (schema.value ?? '').split(/\s+/).filter(Boolean);
          styleAttrs.forEach(attr => delete styleObj[attr]);
        } else {
          Object.keys(styleObj).forEach(key => delete styleObj[key]);
        }
      });
    } else if (schema.action === 'set') {
      return styles(selector, (styleObj: Record<string, string>) => {
        const newStyleObj = styleStringToObject(schema.value ?? '');
        Object.keys(styleObj).forEach(key => delete styleObj[key]);
        Object.assign(styleObj, newStyleObj);
      });
    } else if (schema.action === 'append') {
      return styles(selector, (styleObj: Record<string, string>) => {
        const newStyleObj = styleStringToObject(schema.value ?? '');
        Object.assign(styleObj, newStyleObj);
      });
    } else if (schema.action === 'custom') {
      return styles(selector, schema.value);
    }
  } else if (schema.type === 'attribute') {
    const { attribute: attr } = schema;
    if (schema.action === 'remove') {
      return attribute(selector, attr, () => null);
    } else if (schema.action === 'set') {
      return attribute(selector, attr, () => schema.value ?? '');
    } else if (schema.action === 'append') {
      return attribute(selector, attr, (val: string | null) =>
        val !== null ? val + (schema.value ?? '') : schema.value ?? ''
      );
    } else if (schema.action === 'custom') {
      return attribute(selector, attr, schema.value);
    }
  } else if (schema.type === 'position') {
    const { insertBeforeSelector, parentSelector } = schema;
    if (parentSelector) {
      return position(selector, () => ({
        insertBeforeSelector,
        parentSelector,
      }));
    }
  } else if (schema.type === 'widget') {
    const { value, widgetInsertPosition } = schema;
    if (widgetInsertPosition && value) {
      return widget(selector, () => ({
        position: widgetInsertPosition,
        content: value,
      }));
    }
  }

  return nullController;
};

const domModifier = (schemas: OperateSchema[]): MutationController[] => {
  const mutationControllers = [] as MutationController[];
  (schemas || []).forEach(schema => {
    mutationControllers.push(declarative(schema));
  });
  return mutationControllers;
};

connectGlobalObserver();

export default domModifier;
