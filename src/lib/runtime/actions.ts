/**
 * Event action runner — executes a chain of actions triggered by UI events.
 */

import type { Action, ExpressionOrValue } from '@/types/runtime';
import type { BindingContext } from '@/types/runtime';
import { resolveValue } from './binding';

export interface ActionContext {
  tenantSlug: string;
  appSlug: string;
  bindingContext: BindingContext;
  navigate: (page: string, params?: Record<string, string>) => void;
  openModal: (modalId: string) => void;
  submitForm: (formId: string) => Promise<void>;
  refreshQuery: (queryId: string) => Promise<void>;
  setPageState: (key: string, value: unknown) => void;
  showToast: (message: string, variant: 'success' | 'error' | 'info') => void;
  runWorkflow: (workflowId: string, input: Record<string, unknown>) => Promise<void>;
}

export async function runActionChain(
  actions: Action[],
  context: ActionContext,
): Promise<void> {
  for (const action of actions) {
    await runSingleAction(action, context);
  }
}

async function runSingleAction(action: Action, context: ActionContext): Promise<void> {
  switch (action.type) {
    case 'navigate': {
      const resolvedParams: Record<string, string> = {};
      if (action.params) {
        for (const [k, v] of Object.entries(action.params)) {
          resolvedParams[k] = String(
            resolveValue(v as ExpressionOrValue, context.bindingContext) ?? '',
          );
        }
      }
      context.navigate(action.page, resolvedParams);
      break;
    }

    case 'openModal': {
      context.openModal(action.modalId);
      break;
    }

    case 'submitForm': {
      await context.submitForm(action.formId);
      break;
    }

    case 'refreshQuery': {
      await context.refreshQuery(action.queryId);
      break;
    }

    case 'setPageState': {
      const resolved = resolveValue(action.value, context.bindingContext);
      context.setPageState(action.key, resolved);
      break;
    }

    case 'showToast': {
      const message = String(
        resolveValue(action.message, context.bindingContext) ?? action.message,
      );
      context.showToast(message, action.variant);
      break;
    }

    case 'runWorkflow': {
      const resolvedInput: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(action.input)) {
        resolvedInput[k] = resolveValue(v as ExpressionOrValue, context.bindingContext);
      }
      await context.runWorkflow(action.workflowId, resolvedInput);
      break;
    }

    default: {
      const exhaustive: never = action;
      console.warn('[actions] Unknown action type:', (exhaustive as Action).type);
    }
  }
}
