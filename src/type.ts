/**
 * 小组件数据
 */
interface WidgetData {
  position: InsertPosition;
  content?: string;
}

/**
 * 元素移动数据
 */
interface ElementPosition {
  parentSelector: string;
  insertBeforeSelector?: null | string;
}
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
type ClassnameMutate = (oldClassList: Set<string>) => void;
type StyleMutate = (oldStyleObj: Record<string, string>) => void;
type HtmlMutate = (oldInnerHTML: string) => string;
type AttributeMutate = (oldValue: string | null) => string | null;
type WidgetMutate = () => WidgetData;
type PositionMutate = () => ElementPosition;

/**
 * 变体数据（一个变更对应多个元素）
 */
interface BaseMutation {
  selector: string;
  elements: Set<Element>;
}
interface ClassnameMutation extends BaseMutation {
  kind: 'class';
  mutate: ClassnameMutate;
}
interface StyleMutation extends BaseMutation {
  kind: 'style';
  mutate: StyleMutate;
}
interface HtmlMutation extends BaseMutation {
  kind: 'html';
  mutate: HtmlMutate;
}
interface AttributeMutation extends BaseMutation {
  kind: 'attribute';
  attribute: string;
  mutate: AttributeMutate;
}
interface WidgetMutation extends BaseMutation {
  kind: 'widget';
  mutate: WidgetMutate;
  id: string; // 组件的唯一标识，用于撤销的时候查找
}
interface PositionMutation extends BaseMutation {
  kind: 'position';
  mutate: PositionMutate;
}
type Mutation = ClassnameMutation | StyleMutation | HtmlMutation | AttributeMutation | WidgetMutation | PositionMutation;

/**
 * 元素变异记录（一个元素对应多个变体）
 */
interface ElementPropertyRecord<T, V> {
  el: Element; // 元素
  attr: string; // 属性名
  mutations: T[]; // 变体数据
  observer: MutationObserver; // 观察器
  originalValue: V; // 原始数据
  virtualValue: V; // 当前数据（变更后数据）
  rateLimitCount: number; // 限速计数（每秒执行MutationObserver10次）
  _domChangeTimeout: NodeJS.Timeout | null; // 变更延迟计数
  mutationRunner: (record: ElementPropertyRecord<T, V>, mutation?: T[]) => void; // 变更执行
  getCurrentValue: (el: Element) => V; // 获取当前数据
}
type ClassnameRecord = ElementPropertyRecord<ClassnameMutation, string>;
type StyleRecord = ElementPropertyRecord<StyleMutation, string>;
type HtmlRecord = ElementPropertyRecord<HtmlMutation, string>;
type AttributeRecord = ElementPropertyRecord<AttributeMutation, string | null>;
type WidgetRecord = ElementPropertyRecord<WidgetMutation, null>;
type PositionRecord = ElementPropertyRecord<PositionMutation, ElementPositionWithNode | null>;
type ElementRecord = {
  el: Element;
  classes?: ClassnameRecord;
  styles?: StyleRecord;
  html?: HtmlRecord;
  attributes?: {
    [key in string]: AttributeRecord;
  };
  widgets?: {
    [key in string]: WidgetRecord;
  };
  position?: PositionRecord;
};
