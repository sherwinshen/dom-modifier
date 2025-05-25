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
type PositionMutate = () => ElementMove;
type ClassnameMutate = (oldClassSet: Set<string>) => void;
type StyleMutate = (oldStyleObj: Record<string, string>) => void;
type HtmlMutate = (oldInnerHTML: string) => string;
type AttributeMutate = (oldAttributeValue: string | null) => string | null;

/**
 * 变体数据（一个变更对应多个元素）
 */
interface BaseMutation {
  mutationId: string;
  selector: string;
  elements: Set<Element>;
}
interface WidgetMutation extends BaseMutation {
  kind: 'widget';
  mutate: WidgetMutate;
}
interface PositionMutation extends BaseMutation {
  kind: 'position';
  mutate: PositionMutate;
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
type Mutation =
  | WidgetMutation
  | PositionMutation
  | ClassnameMutation
  | StyleMutation
  | HtmlMutation
  | AttributeMutation;

/**
 * 元素变异记录（一个元素对应多个变体）
 */
interface ElementPropertyRecord<T, V> {
  elementId: string; // 元素id
  el: Element; // 元素
  attr: string; // 属性名
  mutations: T[]; // 变体数据
  observer: MutationObserver; // 观察器
  originalValue: V; // 原始数据
  virtualValue: V; // 当前数据（变更后数据）
  mutationRunner: (record: ElementPropertyRecord<T, V>, mutation?: T[]) => void; // 变更执行
  getCurrentValue: (el: Element) => V; // 获取当前数据
}
type WidgetRecord = ElementPropertyRecord<WidgetMutation, null>;
type PositionRecord = ElementPropertyRecord<PositionMutation, ElementPositionWithNode | null>;
type ClassnameRecord = ElementPropertyRecord<ClassnameMutation, string>;
type StyleRecord = ElementPropertyRecord<StyleMutation, string>;
type HtmlRecord = ElementPropertyRecord<HtmlMutation, string>;
type AttributeRecord = ElementPropertyRecord<AttributeMutation, string | null>;
type ElementRecord = {
  el: Element;
  widgets?: WidgetRecord;
  position?: PositionRecord;
  classes?: ClassnameRecord;
  styles?: StyleRecord;
  html?: HtmlRecord;
  attributes?: {
    [key in string]: AttributeRecord;
  };
};

/**
 * 变更协议
 */
type HtmlSchema =
  | { type: 'html'; selector: string; action: 'append' | 'set'; value: string }
  | { type: 'html'; selector: string; action: 'remove' }
  | { type: 'html'; selector: string; action: 'custom'; value: HtmlMutate };
type ClassSchema =
  | { type: 'class'; selector: string; action: 'append' | 'remove' | 'set'; value: string }
  | { type: 'class'; selector: string; action: 'custom'; value: ClassnameMutate };
type StyleSchema =
  | { type: 'style'; selector: string; action: 'append' | 'remove' | 'set'; value: string }
  | { type: 'style'; selector: string; action: 'custom'; value: StyleMutate };
type AttributeSchema =
  | { type: 'attribute'; selector: string; attribute: string; action: 'append' | 'set'; value: string }
  | { type: 'attribute'; selector: string; attribute: string; action: 'remove' }
  | { type: 'attribute'; selector: string; attribute: string; action: 'custom'; value: AttributeMutate };
type WidgetSchema = {
  type: 'widget';
  selector: string;
  value: string;
  widgetInsertPosition: InsertPosition;
};
type PositionSchema = {
  type: 'position';
  selector: string;
  parentSelector: string;
  insertBeforeSelector?: string | null;
};
type OperateSchema = HtmlSchema | ClassSchema | StyleSchema | WidgetSchema | PositionSchema | AttributeSchema;
