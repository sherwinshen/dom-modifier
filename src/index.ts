import { v4 as uuidv4 } from 'uuid';

const elements: Map<Element, ElementRecord> = new Map(); // 元素-变更记录映射
const mutations: Set<Mutation> = new Set();

const nullController: MutationController = { revert: () => {} };
const isBrowser = typeof window !== 'undefined' && typeof document !== 'undefined';
const validAttributeName = /^[a-zA-Z:_][a-zA-Z0-9:_.-]*$/;

let transformContainer: HTMLDivElement;
let globalObserver: MutationObserver;
let paused: boolean = false;

const getTransformedHTML = (html: string = '', id?: string) => {
  if (!transformContainer) {
    transformContainer = document.createElement('div');
  }
  transformContainer.innerHTML = html;
  if (id) {
    transformContainer.setAttribute('id', id);
    transformContainer.style.display = 'contents';
    return transformContainer.outerHTML;
  }
  return transformContainer.innerHTML;
};

const getElementRecord = (el: Element): ElementRecord => {
  let record = elements.get(el);
  if (!record) {
    record = { el };
    elements.set(el, record);
  }
  return record;
};

const deleteWidgetContainers = (record: WidgetRecord) => {
  // 删除所有 widget 容器（包含所有 widget）
  widgetPositions.forEach(position => {
    document.querySelectorAll(`[widget-${position}-id="${record.id}"]`).forEach(dom => dom.remove());
  });
};
const deleteElementPropertyRecord = (el: Element, kind: string, record: ElementPropertyRecord<any, any>) => {
  const element = elements.get(el);
  if (!element) return;
  if (kind === 'widget') {
    element.widgets?.observer?.disconnect();
    delete element.widgets;
    deleteWidgetContainers(record);
  }
};

// 针对不同类型的监听内容
const getObserverInit = (attr: string, isGlobal?: boolean): MutationObserverInit => {
  if (isGlobal) {
    return { childList: true, subtree: true, attributes: false, characterData: false };
  }
  // 只监听父元素和当前元素的子元素变化
  if (attr === 'widget') {
    return { childList: true, subtree: false, attributes: false, characterData: false };
  }
  if (attr === 'position') {
    return { childList: true, subtree: true, attributes: false, characterData: false };
  }
  if (attr === 'html') {
    return { childList: true, subtree: true, attributes: true, characterData: true };
  }
  return { childList: false, subtree: false, attributes: true, attributeFilter: [attr] };
};

function createElementPropertyRecord(
  el: Element,
  attr: string,
  mutationRunner: (record: ElementPropertyRecord<any, any>) => void,
  getCurrentValue: (el: Element) => any
) {
  const currentValue = getCurrentValue(el);
  const record: ElementPropertyRecord<any, any> = {
    id: uuidv4(),
    el,
    attr,
    mutations: [],
    originalValue: currentValue,
    virtualValue: currentValue,
    // 监听当前元素变动，针对变更后对应内容出现变动
    observer: new MutationObserver(() => {
      if (paused) return;

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
      // 如果当前值和虚拟值相同，则不处理（widget 场景不适用）
      if (currentValue === record.virtualValue && attr !== 'widget') return;
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

/* ------------------------- 样式处理 ------------------------- */

/* ------------------------- 属性处理 ------------------------- */

/* ------------------------- 内容处理 ------------------------- */

/* ------------------------- 位置移动 ------------------------- */

/* ------------------------- 组件插入 ------------------------- */
const getWidgetValue = (_: Element) => null;
const setWidgetValue = (el: Element, id: string, value: InsertWidget, containerElement: Element | null) => {
  if (containerElement) {
    containerElement.insertAdjacentHTML('beforeend', value.content ?? '');
  } else {
    const dom = document.createElement('div');
    dom.setAttribute(`widget-${value.position}-id`, id);
    dom.style.display = 'contents';
    dom.innerHTML = value.content ?? '';
    el.insertAdjacentElement(value.position, dom);
  }
};
const widgetPositions = ['beforebegin', 'afterbegin', 'beforeend', 'afterend'];
/**
 * 检查 widget 的容器元素，如果位置不对则直接删除
 */

const checkWidgetContainer = (el: Element, id: string) => {
  widgetPositions.forEach(position => {
    const dom = document.querySelector(`[widget-${position}-id="${id}"]`);
    if (!dom) return;
    position === 'beforebegin' && dom.nextSibling !== el && dom.remove();
    position === 'afterbegin' && el.firstChild !== dom && dom.remove();
    position === 'beforeend' && el.lastChild !== dom && dom.remove();
    position === 'afterend' && dom.previousSibling !== el && dom.remove();
  });
};
const widgetMutationRunner = (record: WidgetRecord) => {
  checkWidgetContainer(record.el, record.id);
  record.mutations.forEach(mutation => {
    const insertWidget = mutation.mutate();
    insertWidget.content = getTransformedHTML(insertWidget.content ?? '', mutation.id);
    const containerElement = document.querySelector(`[widget-${insertWidget.position}-id="${record.id}"]`);
    const targetElement = document.getElementById(mutation.id);
    if (containerElement && targetElement && containerElement.contains(targetElement)) return;
    if (containerElement && targetElement && !containerElement.contains(targetElement)) {
      targetElement.remove();
    }
    setWidgetValue(record.el, record.id, insertWidget, containerElement);
  });
};

function getElementWidgetRecord(el: Element): WidgetRecord {
  const elementRecord = getElementRecord(el);
  if (!elementRecord.widgets) {
    elementRecord.widgets = createElementPropertyRecord(el, 'widget', widgetMutationRunner, getWidgetValue);
  }
  return elementRecord.widgets;
}

/* ------------------------- 公共处理 ------------------------- */
function startMutating(mutation: Mutation, element: Element) {
  let record: ElementPropertyRecord<any, any> | null = null;
  if (mutation.kind === 'widget') {
    record = getElementWidgetRecord(element);
  }
  if (!record) return;
  record.mutations.push(mutation);
  record.mutationRunner(record);
}

function applyMutation(mutation: Mutation) {
  const existingElements = new Set(mutation.elements);
  const matchingElements = document.querySelectorAll(mutation.selector);
  // 如果有多个匹配元素或者已经存在元素变更，则不执行变更
  if (['widget', 'position'].includes(mutation.kind) && (matchingElements.length > 1 || existingElements.size > 0)) {
    return;
  }
  matchingElements.forEach(element => {
    if (existingElements.has(element)) return;
    mutation.elements.add(element);
    startMutating(mutation, element);
  });
}

function applyAllMutations() {
  mutations.forEach(applyMutation);
}

function stopMutating(mutation: Mutation, element: Element) {
  let record: ElementPropertyRecord<any, any> | null = null;
  if (mutation.kind === 'widget') {
    document.getElementById(mutation.id)?.remove();
    record = getElementWidgetRecord(element);
  }
  if (!record) return;
  const index = record.mutations.indexOf(mutation);
  if (index !== -1) record.mutations.splice(index, 1);
  if (record.mutations.length === 0) {
    deleteElementPropertyRecord(element, mutation.kind, record);
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

export function widget(selector: WidgetMutation['selector'], mutate: WidgetMutation['mutate']) {
  return newMutation({
    id: uuidv4(),
    kind: 'widget',
    elements: new Set(),
    mutate,
    selector,
  });
}

connectGlobalObserver();
