'use client';

import React, { createContext, useContext, useReducer, useCallback } from 'react';
import {
  BuilderState, PageLayoutConfig, CanvasBlock, BlockType, BlockStyles,
  ResponsiveStyles, Breakpoint, BlockProps, createBlock, emptyLayout,
  generateBlockId,
} from './types';

// ─── Actions ─────────────────────────────────────────────────────────────────

type BuilderAction =
  | { type: 'SET_LAYOUT'; layout: PageLayoutConfig }
  | { type: 'SELECT_BLOCK'; id: string | null }
  | { type: 'SET_BREAKPOINT'; breakpoint: Breakpoint }
  | { type: 'ADD_BLOCK'; blockType: BlockType; parentId: string | null; insertIndex?: number }
  | { type: 'DELETE_BLOCK'; id: string }
  | { type: 'DUPLICATE_BLOCK'; id: string }
  | { type: 'MOVE_BLOCK'; id: string; newParentId: string | null; insertIndex: number }
  | { type: 'UPDATE_PROPS'; id: string; props: Partial<BlockProps> }
  | { type: 'UPDATE_STYLES'; id: string; breakpoint: Breakpoint; styles: Partial<BlockStyles> }
  | { type: 'TOGGLE_HIDDEN'; id: string }
  | { type: 'UNDO' }
  | { type: 'REDO' }
  | { type: 'COPY_BLOCK'; id: string }
  | { type: 'PASTE_BLOCK'; parentId: string | null };

// ─── Initial State ───────────────────────────────────────────────────────────

const initialState: BuilderState = {
  layout: emptyLayout('dashboard'),
  selectedBlockId: null,
  breakpoint: 'desktop',
  isDragging: false,
  dragSourceId: null,
  dropTargetId: null,
  dropPosition: null,
  history: [],
  historyIndex: -1,
  clipboard: null,
};

// ─── Layout Mutation Helpers ──────────────────────────────────────────────────

function removeFromParent(layout: PageLayoutConfig, blockId: string): PageLayoutConfig {
  const block = layout.blocks[blockId];
  if (!block) return layout;
  const newLayout = { ...layout, blocks: { ...layout.blocks } };
  if (block.parentId) {
    const parent = newLayout.blocks[block.parentId];
    if (parent) {
      newLayout.blocks[block.parentId] = { ...parent, children: parent.children.filter(id => id !== blockId) };
    }
  } else {
    newLayout.rootIds = newLayout.rootIds.filter(id => id !== blockId);
  }
  return newLayout;
}

function insertIntoParent(layout: PageLayoutConfig, blockId: string, parentId: string | null, index: number): PageLayoutConfig {
  const newLayout = { ...layout, blocks: { ...layout.blocks } };
  if (parentId) {
    const parent = newLayout.blocks[parentId];
    if (parent) {
      const children = [...parent.children];
      const safeIndex = Math.min(index, children.length);
      children.splice(safeIndex, 0, blockId);
      newLayout.blocks[parentId] = { ...parent, children };
    }
  } else {
    const roots = [...newLayout.rootIds];
    const safeIndex = Math.min(index, roots.length);
    roots.splice(safeIndex, 0, blockId);
    newLayout.rootIds = roots;
  }
  return newLayout;
}

function deleteBlockTree(layout: PageLayoutConfig, blockId: string): PageLayoutConfig {
  const block = layout.blocks[blockId];
  if (!block) return layout;
  let newLayout = removeFromParent(layout, blockId);
  // Recursively delete children
  const toDelete = [...block.children];
  while (toDelete.length > 0) {
    const childId = toDelete.pop()!;
    const child = newLayout.blocks[childId];
    if (child) toDelete.push(...child.children);
    const { [childId]: _, ...rest } = newLayout.blocks;
    newLayout = { ...newLayout, blocks: rest };
  }
  const { [blockId]: _, ...rest } = newLayout.blocks;
  return { ...newLayout, blocks: rest };
}

function cloneBlockTree(layout: PageLayoutConfig, blockId: string, newParentId: string | null): { layout: PageLayoutConfig; newRootId: string } {
  const idMap: Record<string, string> = {};
  const block = layout.blocks[blockId];
  if (!block) return { layout, newRootId: blockId };

  function cloneBlock(b: CanvasBlock, parentId: string | null): { id: string; blocks: Record<string, CanvasBlock> } {
    const newId = generateBlockId();
    idMap[b.id] = newId;
    const clonedChildren: string[] = [];
    let childBlocks: Record<string, CanvasBlock> = {};
    for (const childId of b.children) {
      const child = layout.blocks[childId];
      if (child) {
        const { id: cId, blocks: cBlocks } = cloneBlock(child, newId);
        clonedChildren.push(cId);
        childBlocks = { ...childBlocks, ...cBlocks };
      }
    }
    const cloned: CanvasBlock = {
      ...b,
      id: newId,
      parentId,
      children: clonedChildren,
      props: JSON.parse(JSON.stringify(b.props)),
      styles: JSON.parse(JSON.stringify(b.styles)),
    };
    return { id: newId, blocks: { ...childBlocks, [newId]: cloned } };
  }

  const { id: newRootId, blocks: newBlocks } = cloneBlock(block, newParentId);
  return { layout: { ...layout, blocks: { ...layout.blocks, ...newBlocks } }, newRootId };
}

function pushHistory(state: BuilderState, layout: PageLayoutConfig): BuilderState {
  const newHistory = state.history.slice(0, state.historyIndex + 1);
  newHistory.push(layout);
  return {
    ...state,
    history: newHistory.slice(-50), // keep last 50
    historyIndex: Math.min(newHistory.length - 1, 49),
  };
}

function withHistory(state: BuilderState, newLayout: PageLayoutConfig): BuilderState {
  const withH = pushHistory(state, state.layout);
  return { ...withH, layout: newLayout };
}

// ─── Reducer ─────────────────────────────────────────────────────────────────

function builderReducer(state: BuilderState, action: BuilderAction): BuilderState {
  switch (action.type) {
    case 'SET_LAYOUT':
      return { ...state, layout: action.layout, selectedBlockId: null, history: [], historyIndex: -1 };

    case 'SELECT_BLOCK':
      return { ...state, selectedBlockId: action.id };

    case 'SET_BREAKPOINT':
      return { ...state, breakpoint: action.breakpoint };

    case 'ADD_BLOCK': {
      const block = createBlock(action.blockType, action.parentId);
      let newLayout = { ...state.layout, blocks: { ...state.layout.blocks, [block.id]: block } };
      newLayout = insertIntoParent(newLayout, block.id, action.parentId, action.insertIndex ?? 999);
      return { ...withHistory(state, newLayout), selectedBlockId: block.id };
    }

    case 'DELETE_BLOCK': {
      const newLayout = deleteBlockTree(state.layout, action.id);
      const newSelected = state.selectedBlockId === action.id ? null : state.selectedBlockId;
      return { ...withHistory(state, newLayout), selectedBlockId: newSelected };
    }

    case 'DUPLICATE_BLOCK': {
      const block = state.layout.blocks[action.id];
      if (!block) return state;
      const { layout: withClone, newRootId } = cloneBlockTree(state.layout, action.id, block.parentId);
      // Insert right after original
      const parentChildren = block.parentId
        ? state.layout.blocks[block.parentId]?.children ?? []
        : state.layout.rootIds;
      const originalIndex = parentChildren.indexOf(action.id);
      const newLayout = insertIntoParent(withClone, newRootId, block.parentId, originalIndex + 1);
      return { ...withHistory(state, newLayout), selectedBlockId: newRootId };
    }

    case 'MOVE_BLOCK': {
      const block = state.layout.blocks[action.id];
      if (!block) return state;
      let newLayout = removeFromParent(state.layout, action.id);
      newLayout = { ...newLayout, blocks: { ...newLayout.blocks, [action.id]: { ...block, parentId: action.newParentId } } };
      newLayout = insertIntoParent(newLayout, action.id, action.newParentId, action.insertIndex);
      return withHistory(state, newLayout);
    }

    case 'UPDATE_PROPS': {
      const block = state.layout.blocks[action.id];
      if (!block) return state;
      const newBlock = { ...block, props: { ...block.props, ...action.props } };
      return withHistory(state, { ...state.layout, blocks: { ...state.layout.blocks, [action.id]: newBlock } });
    }

    case 'UPDATE_STYLES': {
      const block = state.layout.blocks[action.id];
      if (!block) return state;
      const currentBreakpointStyles = block.styles[action.breakpoint] ?? {};
      const newBlock = {
        ...block,
        styles: {
          ...block.styles,
          [action.breakpoint]: { ...currentBreakpointStyles, ...action.styles },
        },
      };
      return withHistory(state, { ...state.layout, blocks: { ...state.layout.blocks, [action.id]: newBlock } });
    }

    case 'TOGGLE_HIDDEN': {
      const block = state.layout.blocks[action.id];
      if (!block) return state;
      return withHistory(state, {
        ...state.layout,
        blocks: { ...state.layout.blocks, [action.id]: { ...block, hidden: !block.hidden } },
      });
    }

    case 'UNDO': {
      if (state.historyIndex < 0) return state;
      const newIndex = state.historyIndex - 1;
      const layout = newIndex >= 0 ? state.history[newIndex] : state.history[0];
      if (!layout) return state;
      return { ...state, layout, historyIndex: newIndex };
    }

    case 'REDO': {
      if (state.historyIndex >= state.history.length - 1) return state;
      const newIndex = state.historyIndex + 1;
      return { ...state, layout: state.history[newIndex], historyIndex: newIndex };
    }

    case 'COPY_BLOCK': {
      const block = state.layout.blocks[action.id];
      if (!block) return state;
      return { ...state, clipboard: JSON.parse(JSON.stringify(block)) };
    }

    case 'PASTE_BLOCK': {
      if (!state.clipboard) return state;
      const { layout: withClone, newRootId } = cloneBlockTree(state.layout, state.clipboard.id, action.parentId);
      // The clipboard block itself may not exist in layout, need to add it first
      const clipboardInLayout = { ...withClone, blocks: { ...withClone.blocks, [state.clipboard.id]: { ...state.clipboard, parentId: action.parentId } } };
      const { layout: withClone2, newRootId: finalId } = cloneBlockTree(clipboardInLayout, state.clipboard.id, action.parentId);
      const newLayout = insertIntoParent(withClone2, finalId, action.parentId, 999);
      return { ...withHistory(state, newLayout), selectedBlockId: finalId };
    }

    default:
      return state;
  }
}

// ─── Context ─────────────────────────────────────────────────────────────────

interface BuilderContextValue {
  state: BuilderState;
  dispatch: React.Dispatch<BuilderAction>;
  // Convenience helpers
  selectBlock: (id: string | null) => void;
  addBlock: (type: BlockType, parentId?: string | null, index?: number) => void;
  deleteBlock: (id: string) => void;
  duplicateBlock: (id: string) => void;
  moveBlock: (id: string, newParentId: string | null, index: number) => void;
  updateProps: (id: string, props: Partial<BlockProps>) => void;
  updateStyles: (id: string, styles: Partial<BlockStyles>) => void;
  setBreakpoint: (bp: Breakpoint) => void;
  setLayout: (layout: PageLayoutConfig) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

const BuilderContext = createContext<BuilderContextValue | null>(null);

export function BuilderProvider({ children, initialLayout }: { children: React.ReactNode; initialLayout?: PageLayoutConfig }) {
  const [state, dispatch] = useReducer(builderReducer, {
    ...initialState,
    layout: initialLayout ?? emptyLayout('dashboard'),
  });

  const selectBlock = useCallback((id: string | null) => dispatch({ type: 'SELECT_BLOCK', id }), []);
  const addBlock = useCallback((type: BlockType, parentId: string | null = null, index?: number) => dispatch({ type: 'ADD_BLOCK', blockType: type, parentId, insertIndex: index }), []);
  const deleteBlock = useCallback((id: string) => dispatch({ type: 'DELETE_BLOCK', id }), []);
  const duplicateBlock = useCallback((id: string) => dispatch({ type: 'DUPLICATE_BLOCK', id }), []);
  const moveBlock = useCallback((id: string, newParentId: string | null, index: number) => dispatch({ type: 'MOVE_BLOCK', id, newParentId, insertIndex: index }), []);
  const updateProps = useCallback((id: string, props: Partial<BlockProps>) => dispatch({ type: 'UPDATE_PROPS', id, props }), []);
  const updateStyles = useCallback((id: string, styles: Partial<BlockStyles>) => dispatch({ type: 'UPDATE_STYLES', id, breakpoint: state.breakpoint, styles }), [state.breakpoint]);
  const setBreakpoint = useCallback((breakpoint: Breakpoint) => dispatch({ type: 'SET_BREAKPOINT', breakpoint }), []);
  const setLayout = useCallback((layout: PageLayoutConfig) => dispatch({ type: 'SET_LAYOUT', layout }), []);
  const undo = useCallback(() => dispatch({ type: 'UNDO' }), []);
  const redo = useCallback(() => dispatch({ type: 'REDO' }), []);

  return (
    <BuilderContext.Provider value={{
      state, dispatch,
      selectBlock, addBlock, deleteBlock, duplicateBlock, moveBlock,
      updateProps, updateStyles, setBreakpoint, setLayout, undo, redo,
      canUndo: state.historyIndex > 0,
      canRedo: state.historyIndex < state.history.length - 1,
    }}>
      {children}
    </BuilderContext.Provider>
  );
}

export function useBuilder() {
  const ctx = useContext(BuilderContext);
  if (!ctx) throw new Error('useBuilder must be used within BuilderProvider');
  return ctx;
}

export function useSelectedBlock() {
  const { state } = useBuilder();
  if (!state.selectedBlockId) return null;
  return state.layout.blocks[state.selectedBlockId] ?? null;
}
