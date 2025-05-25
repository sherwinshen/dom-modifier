# DOM-Modifier

For those times you need to surgically manipulate third-party HTML while keeping your changes persistent—even when the DOM updates.

# Features

- **Diverse Operations**: Supports a wide range of operations, including HTML, class, style, and attribute changes, as well as element positioning and inserting new content based on elements.
- **TypeScript & 100% Test Coverage**: Built with TypeScript for robustness and reliability, backed by comprehensive tests.
- **Persistent Mutations**: Keeps mutations intact even if the underlying element is updated externally (e.g., by React).
- **Dynamic Element Support**: Automatically applies mutations to new matching elements added to the DOM.
- **Easy Mutation Removal**: Allows mutations to be easily removed at any time.

# Installation

```
npm i --save dom-modifier
```

# Usage

## Basic Usage

```typescript
import domModifier from 'dom-modifier';

const controllers = domModifier([schema1, schema2]);

// revert
controllers.forEach(({ revert }) => {
  revert?.();
});
```

## Atomic Methods

```typescript
import { declarative, attribute, widget, position, styles, classes, html } from 'dom-modifier';

const { revert } = declarative(OperateSchema);
const { revert } = attribute(selector, attribute, (oldAttributeValue: string | null) => string | null);
const { revert } = widget(selector, () => { position: InsertPosition; content?: string | null});
const { revert } = position(selector, () => { parentSelector: string; insertBeforeSelector?: string | null});
const { revert } = styles(selector, (oldStyleObj: Record<string, string>) => void);
const { revert } = classes(selector, (oldClassSet: Set<string>) => void);
const { revert } = html(selector, (oldInnerHTML: string) => string);
```

## Schema

```typescript
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
```

## Examples

```typescript
const htmlSchema = [
  { type: 'html', selector: '#id', action: 'append', value: 'hello world' },
  { type: 'html', selector: '#id', action: 'set', value: 'hello world' },
  { type: 'html', selector: '#id', action: 'remove', value: 'hello world' },
  { type: 'html', selector: '#id', action: 'custom', value: (oldInnerHTML: string) => oldInnerHTML.toUpperCase() },
];

const classesSchema = [
  { type: 'class', selector: '#id', action: 'append', value: 'text-14px text-red' },
  { type: 'class', selector: '#id', action: 'set', value: 'text-14px lh-22px' },
  { type: 'class', selector: '#id', action: 'remove', value: 'text-14px bg-green' },
  { type: 'class', selector: '#id', action: 'custom', value: (oldClasses: Set<string>) => oldClasses.add('text-14px') },
];

const styleSchema = [
  { type: 'style', selector: '#id', action: 'append', value: 'color: red; font-size: 14px;' },
  { type: 'style', selector: '#id', action: 'set', value: 'color: red; font-size: 14px;' },
  { type: 'style', selector: '#id', action: 'remove', value: 'color fontSize' },
  {
    type: 'style',
    selector: '#id',
    action: 'custom',
    value: (oldStyle: Record<string, string>) => (oldStyle.color = 'red'),
  },
];

const attributeSchema = [
  { type: 'attribute', selector: '#id', attribute: 'data-id', action: 'append', value: '123' },
  { type: 'attribute', selector: '#id', attribute: 'data-id', action: 'set', value: '123' },
  { type: 'attribute', selector: '#id', attribute: 'data-id', action: 'remove' },
  {
    type: 'attribute',
    selector: '#id',
    attribute: 'data-id',
    action: 'custom',
    value: (oldValue: string | null) => (oldValue ? oldValue + '123' : '123'),
  },
];

const positionSchema = [
  { type: 'position', selector: '#id', insertBeforeSelector: '#child', parentSelector: '#parent' },
];

const widgetSchema = [
  { type: 'widget', selector: '#id', widgetInsertPosition: 'beforebegin', value: '<div>hello world</div>' },
  { type: 'widget', selector: '#id', widgetInsertPosition: 'afterbegin', value: '<div>hello world</div>' },
  { type: 'widget', selector: '#id', widgetInsertPosition: 'beforeend', value: '<div>hello world</div>' },
  { type: 'widget', selector: '#id', widgetInsertPosition: 'afterend', value: '<div>hello world</div>' },
];
```
