import { ContainerModule } from 'inversify';
import { ArenaRepository } from './repositories/ArenaRepository.js';
import { ArenaService } from './services/ArenaService.js';
import { BattleService } from './services/BattleService.js';
import { ArenaMonitorService } from './services/ArenaMonitorService.js';
import { ArenaController } from './controllers/ArenaController.js';
import { ArenaMonitorController } from './controllers/ArenaMonitorController.js';

export * from './classes/transformers/index.js';
export * from './repositories/ArenaRepository.js';
export * from './services/index.js';
export * from './controllers/index.js';
export * from './types.js';

export const arenaModuleControllers = [ArenaController, ArenaMonitorController];
export const arenaModuleValidators = [];

export const arenaContainerModules = [
  new ContainerModule((options) => {
    options.bind<ArenaRepository>('ArenaRepository').to(ArenaRepository).inSingletonScope();
    options.bind<ArenaService>('ArenaService').to(ArenaService).inSingletonScope();
    options.bind<BattleService>('BattleService').to(BattleService).inSingletonScope();
    options.bind<ArenaMonitorService>('ArenaMonitorService').to(ArenaMonitorService).inSingletonScope();
    options.bind<ArenaController>(ArenaController).toSelf().inSingletonScope();
    options.bind<ArenaMonitorController>(ArenaMonitorController).toSelf().inSingletonScope();
  }),
];

export const setupArenaContainer = async () => {};
