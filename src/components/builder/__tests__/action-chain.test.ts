/**
 * Action chain builder-side logic tests. No execution — purely the builder data-model logic.
 */

import type { ActionChain, ActionStep, ActionStepType } from '@/platform/ui/canvas/types';

function makeStep(id: string, type: ActionStepType, config: Record<string,unknown> = {}): ActionStep {
  return { id, type, config };
}
function makeChain(...steps: ActionStep[]): ActionChain { return { steps }; }
function addStep(chain: ActionChain, step: ActionStep): ActionChain { return { steps: [...chain.steps, step] }; }
function removeStep(chain: ActionChain, id: string): ActionChain { return { steps: chain.steps.filter((s) => s.id !== id) }; }
function updateStep(chain: ActionChain, updated: ActionStep): ActionChain { return { steps: chain.steps.map((s) => s.id === updated.id ? updated : s) }; }
function moveStep(chain: ActionChain, from: number, to: number): ActionChain {
  const steps = [...chain.steps]; const [item] = steps.splice(from, 1); steps.splice(to, 0, item); return { steps };
}

describe('ActionChain builder logic', () => {
  describe('addStep', () => {
    it('adds a step to an empty chain', () => {
      const result = addStep(makeChain(), makeStep('s1', 'navigate', { url: '/home' }));
      expect(result.steps).toHaveLength(1);
      expect(result.steps[0].type).toBe('navigate');
    });
    it('appends steps in order', () => {
      let chain = makeChain();
      chain = addStep(chain, makeStep('s1', 'navigate'));
      chain = addStep(chain, makeStep('s2', 'showToast', { message: 'Done' }));
      chain = addStep(chain, makeStep('s3', 'setPageState'));
      expect(chain.steps.map((s) => s.id)).toEqual(['s1', 's2', 's3']);
    });
    it('does not mutate the original chain', () => {
      const chain = makeChain();
      addStep(chain, makeStep('s1', 'navigate'));
      expect(chain.steps.length).toBe(0);
    });
  });

  describe('removeStep', () => {
    it('removes a step by id', () => {
      const chain = makeChain(makeStep('s1', 'navigate'), makeStep('s2', 'showToast'));
      expect(removeStep(chain, 's1').steps[0].id).toBe('s2');
    });
    it('leaves chain unchanged if id not found', () => {
      const chain = makeChain(makeStep('s1', 'navigate'));
      expect(removeStep(chain, 'nonexistent').steps).toHaveLength(1);
    });
    it('returns empty steps when removing the only step', () => {
      expect(removeStep(makeChain(makeStep('s1', 'navigate')), 's1').steps).toHaveLength(0);
    });
  });

  describe('updateStep', () => {
    it('replaces a step config', () => {
      const chain = makeChain(makeStep('s1', 'navigate', { url: '/old' }));
      expect(updateStep(chain, makeStep('s1', 'navigate', { url: '/new' })).steps[0].config.url).toBe('/new');
    });
    it('does not change sibling steps', () => {
      const chain = makeChain(makeStep('s1', 'navigate', { url: '/home' }), makeStep('s2', 'showToast', { message: 'Hi' }));
      expect(updateStep(chain, makeStep('s1', 'navigate', { url: '/other' })).steps[1].config.message).toBe('Hi');
    });
  });

  describe('moveStep', () => {
    it('moves a step from index 0 to 2', () => {
      const chain = makeChain(makeStep('s1','navigate'), makeStep('s2','showToast'), makeStep('s3','setPageState'));
      expect(moveStep(chain, 0, 2).steps.map((s) => s.id)).toEqual(['s2','s3','s1']);
    });
    it('moves a step from index 2 to 0', () => {
      const chain = makeChain(makeStep('s1','navigate'), makeStep('s2','showToast'), makeStep('s3','setPageState'));
      expect(moveStep(chain, 2, 0).steps.map((s) => s.id)).toEqual(['s3','s1','s2']);
    });
    it('no-op move preserves order', () => {
      const chain = makeChain(makeStep('s1','navigate'), makeStep('s2','showToast'));
      expect(moveStep(chain, 1, 1).steps.map((s) => s.id)).toEqual(['s1','s2']);
    });
  });

  describe('step config shapes', () => {
    it('navigate step holds a url', () => { expect(makeStep('s1','navigate',{url:'/orders'}).config.url).toBe('/orders'); });
    it('showToast step holds message and type', () => {
      const step = makeStep('s2','showToast',{message:'Saved!',type:'success'});
      expect(step.config.message).toBe('Saved!'); expect(step.config.type).toBe('success');
    });
    it('setPageState step holds variable and value', () => {
      const step = makeStep('s3','setPageState',{variable:'pageState.count',value:'{{ count + 1 }}'});
      expect(step.config.variable).toBe('pageState.count');
    });
    it('openModal step holds modalId', () => { expect(makeStep('s4','openModal',{modalId:'confirm-modal'}).config.modalId).toBe('confirm-modal'); });
    it('runWorkflow step holds workflowId', () => { expect(makeStep('s5','runWorkflow',{workflowId:'wf-abc123'}).config.workflowId).toBe('wf-abc123'); });
  });

  describe('chain composition', () => {
    it('a full sequence: navigate → showToast → setPageState', () => {
      let chain = makeChain();
      chain = addStep(chain, makeStep('s1','navigate',{url:'/home'}));
      chain = addStep(chain, makeStep('s2','showToast',{message:'Welcome',type:'success'}));
      chain = addStep(chain, makeStep('s3','setPageState',{variable:'pageState.loaded',value:'true'}));
      expect(chain.steps).toHaveLength(3);
      expect(chain.steps[0].type).toBe('navigate');
      expect(chain.steps[2].type).toBe('setPageState');
    });
  });
});
