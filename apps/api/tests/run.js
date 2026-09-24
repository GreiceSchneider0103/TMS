import { runRbacTests } from './rbac.test.js';
import { runFreightValidationTests } from './freightValidation.test.js';
import { runTenantIsolationTests } from './tenantIsolation.test.js';
import { runWorkerPolicyTests } from './workerPolicy.test.js';
import { runTinyClientTests } from './tinyClient.test.js';
import { runFreightWorkbookCompatibilityTests } from './freightWorkbookCompatibility.test.js';
import { runCteAuditTests } from './cteAudit.test.js';
import { runAnalyticsTests } from './analytics.test.js';
import { runFreightExportTests } from './freightExport.test.js';
import { runTinyV3Tests } from './tinyV3.test.js';

runRbacTests();
runFreightValidationTests();
runTenantIsolationTests();
runWorkerPolicyTests();
runTinyClientTests();
runFreightWorkbookCompatibilityTests();
runCteAuditTests();
runAnalyticsTests();
runFreightExportTests();
await runTinyV3Tests();

console.log('ok');
