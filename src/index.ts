import { v4 as uuidv4 } from 'uuid';

const elements: Map<Element, ElementRecord> = new Map(); // 元素-变更记录映射
const mutations: Set<Mutation> = new Set();

const nullController: MutationController = { revert: () => {} };
const isBrowser = typeof window !== 'undefined' && typeof document !== 'undefined';
const validAttributeName = /^[a-zA-Z:_][a-zA-Z0-9:_.-]*$/;

let transformContainer: HTMLDivElement;
let globalObserver: MutationObserver;
let paused: boolean = false;

function getTransformedHTML(html: string, widgetId?: string) {
  if (!transformContainer) {
    transformContainer = document.createElement('div');
  }
  transformContainer.innerHTML = html;
  if (widgetId) {
    transformContainer.setAttribute('id', widgetId);
    transformContainer.style.display = 'contents';
    return transformContainer.outerHTML;
  }
  return transformContainer.innerHTML;
}

function checkPositionSame(currentVal: ElementPositionWithNode, newVal: ElementPositionWithNode) {
  return currentVal && newVal && currentVal.parentNode === newVal.parentNode && currentVal.insertBeforeNode === newVal.insertBeforeNode;
}

// 检测 widgetData 元素是否已经在预期的位置了
function checkWidgetReady(
  el: Element,
  widgetData: WidgetData,
  id: string
): {
  isInsert: boolean; // 是否已经插入了预期内容
  isReady: boolean; // 插入内容是否位置正确
} {
  let isInsert = false;
  let isReady = false;
  const dom = document.getElementById(id);
  if (dom) {
    isInsert = true; // 已经插入了
    if (
      (widgetData.position === 'beforebegin' && el.previousElementSibling === dom) ||
      (widgetData.position === 'afterbegin' && el.firstElementChild === dom) ||
      (widgetData.position === 'beforeend' && el.lastElementChild === dom) ||
      (widgetData.position === 'afterend' && el.nextElementSibling === dom)
    ) {
      isReady = true; // 位置正确
    }
  }
  return {
    isInsert,
    isReady,
  };
}

function getElementRecord(el: Element): ElementRecord {
  let record = elements.get(el);
  if (!record) {
    record = { el };
    elements.set(el, record);
  }
  return record;
}

// 针对不同类型的监听内容
function getObserverInit(attr: string, isGlobal?: boolean): MutationObserverInit {
  if (isGlobal) {
    return {
      childList: true,
      subtree: true,
      attributes: false,
      characterData: false,
    };
  }
  // 只监听父元素和当前元素的子元素变化
  if (attr === 'widget') {
    return {
      childList: true,
      subtree: false,
      attributes: false,
      characterData: false,
    };
  }
  if (attr === 'position') {
    return {
      childList: true,
      subtree: true,
      attributes: false,
      characterData: false,
    };
  }
  if (attr === 'html') {
    return {
      childList: true,
      subtree: true,
      attributes: true,
      characterData: true,
    };
  }
  return {
    childList: false,
    subtree: false,
    attributes: true,
    attributeFilter: [attr],
  };
}

function createElementPropertyRecord(el: Element, attr: string, mutationRunner: (record: ElementPropertyRecord<any, any>) => void, getCurrentValue: (el: Element) => any) {
  const currentValue = getCurrentValue(el);
  const record: ElementPropertyRecord<any, any> = {
    el,
    attr,
    mutations: [],
    originalValue: currentValue,
    virtualValue: currentValue,
    rateLimitCount: 0,
    _domChangeTimeout: null,
    // 监听当前元素变动，针对变更后对应内容出现变动
    observer: new MutationObserver(() => {
      if (paused) return;

      // rate limit to 10 mutations per second
      if (record.rateLimitCount >= 10) {
        return;
      }
      record.rateLimitCount++;
      setTimeout(() => {
        record.rateLimitCount = record.rateLimitCount - 1;
        if (record.rateLimitCount <= 0) {
          record.rateLimitCount = 0;
        }
      }, 1000);

      if (attr === 'position' || attr === 'widget') {
        if (record._domChangeTimeout) {
          return;
        } else {
          record._domChangeTimeout = setTimeout(() => {
            record._domChangeTimeout = null;
          }, 1000);
        }
      }

      const currentValue = getCurrentValue(el);

      // widget 会在 mutationRunner 中判断是否需要更新
      if (attr !== 'widget') {
        if (attr === 'position') {
          if (checkPositionSame(currentValue, record.virtualValue)) {
            return;
          }
        }
        if (currentValue === record.virtualValue) return; // 如果当前值和虚拟值相同，则不处理
      }
      record.originalValue = currentValue;
      mutationRunner(record);
    }),
    mutationRunner,
    getCurrentValue,
  };
  if (attr === 'widget') {
    record.observer.observe(el, getObserverInit(attr));
    el.parentNode && record.observer.observe(el.parentNode, getObserverInit(attr));
  } else {
    const target = attr === 'position' && el.parentNode ? el.parentNode : el;
    record.observer.observe(target, getObserverInit(attr));
  }

  return record;
}

/* ------------------------- 类名处理 ------------------------- */
// 类名集合与类名字符串之间的转换
const classNameSetToString = (set: Set<string>): string => {
  return Array.from(set)
    .filter(Boolean)
    .join(' ');
};
const classNameStringToSet = (val: string): Set<string> => {
  return new Set(val.split(/\s+/).filter(Boolean));
};
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
function getElementClassRecord(el: Element): ClassnameRecord {
  const elementRecord = getElementRecord(el);
  if (!elementRecord.classes) {
    elementRecord.classes = createElementPropertyRecord(el, 'class', classMutationRunner, getClassNameValue);
  }
  return elementRecord.classes;
}

/* ------------------------- 样式处理 ------------------------- */
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
function getElementStyleRecord(el: Element): StyleRecord {
  const elementRecord = getElementRecord(el);
  if (!elementRecord.styles) {
    elementRecord.styles = createElementPropertyRecord(el, 'style', styleMutationRunner, getStyleValue);
  }
  return elementRecord.styles;
}

/* ------------------------- 属性处理 ------------------------- */
const getAttrValue = (attr: string) => (el: Element) => el.getAttribute(attr) ?? '';
const setAttrValue = (el: Element, attrName: string, val: string | null) => (val !== null && attrName ? el.setAttribute(attrName, val) : el.removeAttribute(attrName));
const attrMutationRunner = (record: AttributeRecord) => {
  let val = record.originalValue;
  record.mutations.forEach(m => (val = m.mutate(val)));
  if (val !== record.getCurrentValue(record.el)) {
    setAttrValue(record.el, record.attr, val);
  }
  record.virtualValue = val;
};
function getElementAttributeRecord(el: Element, attr: string): AttributeRecord {
  const elementRecord = getElementRecord(el);
  if (!elementRecord.attributes) {
    elementRecord.attributes = {};
  }
  if (!elementRecord.attributes[attr]) {
    elementRecord.attributes[attr] = createElementPropertyRecord(el, attr, attrMutationRunner, getAttrValue(attr));
  }
  return elementRecord.attributes[attr];
}

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
function getElementHTMLRecord(el: Element): HtmlRecord {
  const elementRecord = getElementRecord(el);
  if (!elementRecord.html) {
    elementRecord.html = createElementPropertyRecord(el, 'html', htmlMutationRunner, getHTMLValue);
  }
  return elementRecord.html;
}

/* ------------------------- 位置移动 ------------------------- */

const getElementPosition = (el: Element) => ({ parentNode: el.parentElement, insertBeforeNode: el.nextElementSibling } as ElementPositionWithNode);
const setElementPosition = (el: Element, value: ElementPositionWithNode) => {
  if (value.insertBeforeNode && !value.parentNode.contains(value.insertBeforeNode)) {
    return;
  }
  value.parentNode.insertBefore(el, value.insertBeforeNode);
};
const getPositionNodeFromSelector = ({ parentSelector, insertBeforeSelector }: ElementPosition): ElementPositionWithNode | null => {
  const parentNode = document.querySelector<HTMLElement>(parentSelector);
  if (!parentNode) return null;
  const insertBeforeNode = insertBeforeSelector ? document.querySelector<HTMLElement>(insertBeforeSelector) : null;
  if (insertBeforeSelector && !insertBeforeNode) return null;
  return {
    parentNode,
    insertBeforeNode,
  };
};
const positionMutationRunner = (record: PositionRecord) => {
  let val = record.originalValue;
  // 只生效最后一次的变更
  record.mutations.forEach(m => {
    const selectors = m.mutate();
    const newNodes = getPositionNodeFromSelector(selectors);
    val = newNodes;
  });
  const currentVal = record.getCurrentValue(record.el);
  if (val && currentVal && !checkPositionSame(currentVal, val)) {
    setElementPosition(record.el, val);
  }
  record.virtualValue = val;
};
function getElementPositionRecord(el: Element): PositionRecord {
  const elementRecord = getElementRecord(el);
  if (!elementRecord.position) {
    elementRecord.position = createElementPropertyRecord(el, 'position', positionMutationRunner, getElementPosition);
  }
  return elementRecord.position;
}

/* ------------------------- 组件插入 ------------------------- */
const getWidgetValue = () => null;
const setWidgetValue = (el: Element, value: WidgetData) => el.insertAdjacentHTML(value.position, value.content ?? '');
const widgetMutationRunner = (record: WidgetRecord) => {
  record.mutations.forEach(m => {
    const widgetData = m.mutate();
    widgetData.content = getTransformedHTML(widgetData.content ?? '', m.id);
    const { isInsert, isReady } = checkWidgetReady(record.el, widgetData, m.id);
    // 已插入但位置不对，则重新插入
    if (isInsert && !isReady) {
      // 删除原来的内容
      document.getElementById(m.id)?.remove();
      setWidgetValue(record.el, widgetData);
    }
    // 未插入内容
    if (!isInsert) {
      setWidgetValue(record.el, widgetData);
    }
  });
};
function getElementWidgetRecord(el: Element, id: string): WidgetRecord {
  const elementRecord = getElementRecord(el);
  if (!elementRecord.widgets) {
    elementRecord.widgets = {};
  }
  if (!elementRecord.widgets[id]) {
    elementRecord.widgets[id] = createElementPropertyRecord(el, 'widget', widgetMutationRunner, getWidgetValue);
  }
  return elementRecord.widgets[id];
}

/* ------------------------- 公共处理 ------------------------- */
function startMutating(mutation: Mutation, element: Element) {
  let record: ElementPropertyRecord<any, any> | null = null;
  if (mutation.kind === 'class') {
    record = getElementClassRecord(element);
  } else if (mutation.kind === 'style') {
    record = getElementStyleRecord(element);
  } else if (mutation.kind === 'html') {
    record = getElementHTMLRecord(element);
  } else if (mutation.kind === 'attribute') {
    record = getElementAttributeRecord(element, mutation.attribute);
  } else if (mutation.kind === 'position') {
    record = getElementPositionRecord(element);
  } else if (mutation.kind === 'widget') {
    record = getElementWidgetRecord(element, mutation.id);
  }
  if (!record) return;
  record.mutations.push(mutation);
  record.mutationRunner(record);
}
function applyMutation(mutation: Mutation) {
  const existingElements = new Set(mutation.elements);
  // 位置变更和元素插入场景，只允许更改一个元素
  if (mutation.kind === 'position' || mutation.kind === 'widget') {
    const matchingElements = document.querySelectorAll(mutation.selector);
    if (matchingElements.length > 1 || existingElements.size > 1) {
      console.warn('position and widget mutation only support one element');
      return;
    }
  }
  const matchingElements = document.querySelectorAll(mutation.selector);
  matchingElements.forEach(el => {
    if (!existingElements.has(el)) {
      mutation.elements.add(el);
      startMutating(mutation, el);
    }
  });
}
function applyAllMutations() {
  mutations.forEach(applyMutation);
}

function deleteElementPropertyRecord(el: Element, kind: string, attr: string, id: string) {
  const element = elements.get(el);
  if (!element) return;
  if (attr === 'html') {
    element.html?.observer?.disconnect();
    delete element.html;
  } else if (attr === 'class') {
    element.classes?.observer?.disconnect();
    delete element.classes;
  } else if (attr === 'style') {
    element.styles?.observer?.disconnect();
    delete element.styles;
  } else if (attr === 'position') {
    element.position?.observer?.disconnect();
    delete element.position;
  } else if (kind === 'widget') {
    element.widgets?.[id]?.observer?.disconnect();
    delete element.widgets?.[id];
  } else {
    element.attributes?.[attr]?.observer?.disconnect();
    delete element.attributes?.[attr];
  }
}
function stopMutating(mutation: Mutation, element: Element) {
  let record: ElementPropertyRecord<any, any> | null = null;
  if (mutation.kind === 'widget') {
    document.getElementById(mutation.id)?.remove();
    record = getElementWidgetRecord(element, mutation.id);
  } else if (mutation.kind === 'html') {
    record = getElementHTMLRecord(element);
  } else if (mutation.kind === 'class') {
    record = getElementClassRecord(element);
  } else if (mutation.kind === 'style') {
    record = getElementStyleRecord(element);
  } else if (mutation.kind === 'attribute') {
    record = getElementAttributeRecord(element, mutation.attribute);
  } else if (mutation.kind === 'position') {
    record = getElementPositionRecord(element);
  }
  if (!record) return;
  const index = record.mutations.indexOf(mutation);
  if (index !== -1) record.mutations.splice(index, 1);
  if (record.mutations.length === 0) {
    deleteElementPropertyRecord(element, mutation.kind, (mutation as AttributeMutation)?.attribute, (mutation as WidgetMutation)?.id);
  } else {
    record.mutationRunner(record);
  }
}
function revertMutation(mutation: Mutation) {
  mutation.elements.forEach(el => stopMutating(mutation, el));
  mutation.elements.clear();
  mutations.delete(mutation);
}

function newMutation(m: Mutation): MutationController {
  if (!isBrowser) return nullController;
  mutations.add(m);
  applyMutation(m);
  return {
    revert: () => {
      revertMutation(m);
    },
  };
}

/* ------------------------- 全局监听 ------------------------- */
export function connectGlobalObserver() {
  if (!isBrowser) return;
  if (!globalObserver) {
    globalObserver = new MutationObserver(() => {
      applyAllMutations();
    });
  }
  applyAllMutations();
  globalObserver.observe(document.documentElement, getObserverInit('', true));
}
export function disconnectGlobalObserver() {
  globalObserver && globalObserver.disconnect();
}

/* ------------------------- 执行函数 ------------------------- */
export function classes(selector: ClassnameMutation['selector'], mutate: ClassnameMutation['mutate']) {
  return newMutation({
    kind: 'class',
    elements: new Set(),
    mutate,
    selector,
  });
}

export function styles(selector: StyleMutation['selector'], mutate: StyleMutation['mutate']) {
  return newMutation({
    kind: 'style',
    elements: new Set(),
    mutate,
    selector,
  });
}

export function html(selector: HtmlMutation['selector'], mutate: HtmlMutation['mutate']) {
  return newMutation({
    kind: 'html',
    elements: new Set(),
    mutate,
    selector,
  });
}

export function attribute(selector: AttributeMutation['selector'], attribute: AttributeMutation['attribute'], mutate: AttributeMutation['mutate']) {
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
  return newMutation({
    kind: 'attribute',
    elements: new Set(),
    attribute,
    mutate,
    selector,
  });
}

export function position(selector: PositionMutation['selector'], mutate: PositionMutation['mutate']) {
  return newMutation({
    kind: 'position',
    elements: new Set(),
    mutate,
    selector,
  });
}

export function widget(selector: WidgetMutation['selector'], mutate: WidgetMutation['mutate']) {
  return newMutation({
    kind: 'widget',
    elements: new Set(),
    mutate,
    selector,
    id: uuidv4(), // 用于撤销操作时识别元素
  });
}

connectGlobalObserver();
