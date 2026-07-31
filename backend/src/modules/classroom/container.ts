import { ContainerModule } from 'inversify';
import { CLASSROOM_TYPES } from './types.js';
import {
  ClassroomRepository,
  AnnouncementRepository,
  AssignmentRepository,
  SubmissionRepository,
  JournalRepository,
  JournalSubmissionRepository,
  NotificationRepository,
  VaultRepository,
} from './repositories/providers/mongodb/index.js';
import { ClassroomService } from './services/ClassroomService.js';
import { ClassroomLmsService } from './services/ClassroomLmsService.js';
import { VaultService } from './services/VaultService.js';
import { ClassroomController } from './controllers/ClassroomController.js';
import { ClassroomLmsController } from './controllers/ClassroomLmsController.js';
import { NotificationController } from './controllers/NotificationController.js';
import { VaultController } from './controllers/VaultController.js';

export const classroomContainerModule = new ContainerModule((options) => {
  options.bind(CLASSROOM_TYPES.ClassroomRepository).to(ClassroomRepository).inSingletonScope();
  options.bind(CLASSROOM_TYPES.AnnouncementRepository).to(AnnouncementRepository).inSingletonScope();
  options.bind(CLASSROOM_TYPES.AssignmentRepository).to(AssignmentRepository).inSingletonScope();
  options.bind(CLASSROOM_TYPES.SubmissionRepository).to(SubmissionRepository).inSingletonScope();
  options.bind(CLASSROOM_TYPES.JournalRepository).to(JournalRepository).inSingletonScope();
  options.bind(CLASSROOM_TYPES.JournalSubmissionRepository).to(JournalSubmissionRepository).inSingletonScope();
  options.bind(CLASSROOM_TYPES.NotificationRepository).to(NotificationRepository).inSingletonScope();
  options.bind(CLASSROOM_TYPES.VaultRepository).to(VaultRepository).inSingletonScope();

  options.bind(CLASSROOM_TYPES.ClassroomService).to(ClassroomService).inSingletonScope();
  options.bind(CLASSROOM_TYPES.ClassroomLmsService).to(ClassroomLmsService).inSingletonScope();
  options.bind(CLASSROOM_TYPES.VaultService).to(VaultService).inSingletonScope();

  options.bind(ClassroomController).toSelf().inSingletonScope();
  options.bind(ClassroomLmsController).toSelf().inSingletonScope();
  options.bind(NotificationController).toSelf().inSingletonScope();
  options.bind(VaultController).toSelf().inSingletonScope();
});
