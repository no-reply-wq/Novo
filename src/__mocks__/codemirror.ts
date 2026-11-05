// Mock for all @codemirror/* and @lezer/* packages in test environment
// CodeMirror requires a real DOM with canvas support which Jest/node doesn't provide

// Use plain objects instead of jest.fn() to avoid issues with jest not being available
// at module-load time in some configurations

function noop() { return {}; }

export const EditorState = {
  create: noop,
  readOnly: { of: noop },
};

class EditorViewMock {
  constructor({ parent }: { parent?: HTMLElement } = {}) {
    if (parent) parent.setAttribute('data-cm-mock', 'true');
  }
  destroy() { return; }
  dispatch() { return; }
  get state() { return { doc: { toString: () => '' } }; }
  static theme(spec: unknown) { return { _spec: spec }; }
  static get updateListener() { return { of: noop }; }
  static get editable() { return { of: noop }; }
  static get lineWrapping() { return {}; }
}

export { EditorViewMock as EditorView };

export const keymap = { of: noop };
export const lineNumbers = noop;
export const highlightActiveLine = noop;

export const history = noop;
export const defaultKeymap: unknown[] = [];
export const historyKeymap: unknown[] = [];

export const autocompletion = noop;
export const completionKeymap: unknown[] = [];

export const HighlightStyle = { define: (defs: unknown) => ({ _mock: true, _defs: defs }) };
export const syntaxHighlighting = (hs: unknown) => ({ _mock: true, _hs: hs });
// tags.function is a callable that returns a tag modifier
const functionTag = (inner: unknown) => ({ _tag: 'function', inner });
(functionTag as unknown as Record<string, unknown>)._tag = 'function';

export const tags = new Proxy({} as Record<string, unknown>, {
  get(_t, k) {
    if (k === 'function') return functionTag;
    return { _tag: String(k) };
  },
});

export const javascript = noop;
export const oneDark = { _mock: true };

const codemirrorMock = {};
export default codemirrorMock;
