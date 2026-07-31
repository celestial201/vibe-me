import { ContainerModule } from 'inversify';
import { classroomContainerModule } from './container.js';
import { ClassroomController } from './controllers/ClassroomController.js';
import { ClassroomLmsController } from './controllers/ClassroomLmsController.js';
import { NotificationController } from './controllers/NotificationController.js';
import { VaultController } from './controllers/VaultController.js';
import { authorizationChecker, HttpErrorHandler } from '#root/shared/index.js';
import { RoutingControllersOptions } from 'routing-controllers';

export const classroomContainerModules: ContainerModule[] = [classroomContainerModule];

export const classroomModuleControllers: Function[] = [
  ClassroomController,
  ClassroomLmsController,
  NotificationController,
  VaultController,
];

export const classroomModuleOptions: RoutingControllersOptions = {
  controllers: classroomModuleControllers,
  middlewares: [HttpErrorHandler],
  defaultErrorHandler: false,
  authorizationChecker,
  validation: true,
};
