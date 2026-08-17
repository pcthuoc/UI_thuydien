export * from './client';
export * from './stations';
export * from './watersheds';
export * from './weather';
export * from './operations';
export * from './transmissions';
export * from './alerts';

import { api } from './client';
import { stationsApi } from './stations';
import { watershedsApi } from './watersheds';
import { weatherApi } from './weather';
import { transmissionsApi } from './transmissions';
import { alertsApi } from './alerts';

// Extend base API object with modular namespaces
(api as any).stations = stationsApi;
(api as any).watersheds = watershedsApi;
(api as any).weather = weatherApi;
(api as any).transmissions = transmissionsApi;
(api as any).alerts = alertsApi;

export default api;

