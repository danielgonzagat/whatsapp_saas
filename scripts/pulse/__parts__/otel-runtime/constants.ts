const RUNTIME_TRACES_ARTIFACT = 'PULSE_RUNTIME_TRACES.json';
const TRACE_DIFF_ARTIFACT = 'PULSE_TRACE_DIFF.json';

const NESTJS_DECORATOR_NAMES = [
  'Controller',
  'Get',
  'Post',
  'Put',
  'Delete',
  'Patch',
  'Injectable',
  'Module',
  'Cron',
  'Interval',
  'Timeout',
  'MessagePattern',
  'EventPattern',
  'WebSocketGateway',
];

const PRISMA_METHODS = [
  'findUnique',
  'findFirst',
  'findMany',
  'create',
  'createMany',
  'update',
  'updateMany',
  'delete',
  'deleteMany',
  'upsert',
  'count',
  'aggregate',
  'groupBy',
  'findRaw',
  'executeRaw',
  'queryRaw',
  'runCommandRaw',
  '$transaction',
  '$queryRaw',
  '$executeRaw',
  '$runCommandRaw',
];

const BULLMQ_PATTERNS = [
  'add',
  'addBulk',
  'getJob',
  'getJobs',
  'getActive',
  'getWaiting',
  'getDelayed',
  'getCompleted',
  'getFailed',
  'pause',
  'resume',
  'close',
  'removeJobs',
  'drain',
  'obliterate',
  'trimEvents',
  'process',
  'processJob',
];

const AXIOS_METHODS = [
  'get',
  'post',
  'put',
  'patch',
  'delete',
  'head',
  'options',
  'request',
  'create',
];

export { AXIOS_METHODS, BULLMQ_PATTERNS, NESTJS_DECORATOR_NAMES, PRISMA_METHODS, RUNTIME_TRACES_ARTIFACT, TRACE_DIFF_ARTIFACT };
