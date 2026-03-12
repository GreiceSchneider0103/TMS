import { runRbacTests } from './rbac.test.js';
import { runFreightValidationTests } from './freightValidation.test.js';
import { runTenantIsolationTests } from './tenantIsolation.test.js';
import { runWorkerPolicyTests } from './workerPolicy.test.js';
import { runTinyClientTests } from './tinyClient.test.js';

runRbacTests();
runFreightValidationTests();
runTenantIsolationTests();
runWorkerPolicyTests();
runTinyClientTests();

console.log('ok');
