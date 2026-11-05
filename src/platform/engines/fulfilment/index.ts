export type { FulfilmentLink, FulfilmentStatus } from './types';
export { FulfilmentError, OverFulfilmentError } from './errors';
export {
  createLink,
  getFulfilmentStatus,
  getLinkedTargets,
  syncFulfilmentStatus,
} from './linker';
