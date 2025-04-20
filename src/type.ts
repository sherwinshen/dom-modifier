/**
 * 插入元素
 */
interface InsertWidget {
  position: InsertPosition;
  content?: string | null;
}

/**
 * 移动元素
 */
interface ElementMove {
  parentSelector: string;
  insertBeforeSelector?: string | null;
}

/**
 * 元素定位
 */
interface ElementPositionWithNode {
  parentNode: Element;
  insertBeforeNode: Element | null;
}

/**
 * 变更控制器（用于撤销变更）
 */
type MutationController = { revert: () => void };

/**
 * 变更执行函数（不直接更改dom，获取变更值）
 */
type WidgetMutate = () => InsertWidget;

/**
 * 变体数据（一个变更对应多个元素）
 */
interface BaseMutation {
  id: string; // 唯一标识，可用于撤销 Widget 变更时查找插入元素
  selector: string;
  elements: Set<Element>;
}
interface WidgetMutation extends BaseMutation {
  kind: 'widget';
  mutate: WidgetMutate;
}
type Mutation = WidgetMutation;

/**
 * 元素变异记录（一个元素对应多个变体）
 */
interface ElementPropertyRecord<T, V> {
  id: string; // 唯一标识
  el: Element; // 元素
  attr: string; // 属性名
  mutations: T[]; // 变体数据
  observer: MutationObserver; // 观察器
  originalValue: V; // 原始数据
  virtualValue: V; // 当前数据（变更后数据）
  mutationRunner: (record: ElementPropertyRecord<T, V>, mutation?: T[]) => void; // 变更执行
  getCurrentValue: (el: Element) => V; // 获取当前数据
}
type WidgetRecord = ElementPropertyRecord<WidgetMutation, ElementPositionWithNode | null>;
type ElementRecord = {
  el: Element;
  widgets?: WidgetRecord;
};
