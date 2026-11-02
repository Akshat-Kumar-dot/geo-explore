import type { DataAdapter } from './types';
import { mockAdapter } from './mock';
import { apiAdapter } from './api';

const SOURCE = import.meta.env.VITE_DATA_SOURCE ?? 'mock';

/** The single seam between the UI and its data. Nothing else imports mock/ or fixtures/. */
export const adapter: DataAdapter = SOURCE === 'api' ? apiAdapter : mockAdapter;

/** True while the app is running on generated data — drives the SYNTHETIC DATA badge. */
export const IS_SYNTHETIC = SOURCE !== 'api';

export type { DataAdapter, ScenarioInput } from './types';
