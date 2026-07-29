const TYPES = {
  // Services
  ClassroomService: Symbol.for('ClassroomService'),
  ClassroomLmsService: Symbol.for('ClassroomLmsService'),

  // Repositories
  ClassroomRepository: Symbol.for('ClassroomRepository'),
  AnnouncementRepository: Symbol.for('AnnouncementRepository'),
  AssignmentRepository: Symbol.for('AssignmentRepository'),
  SubmissionRepository: Symbol.for('SubmissionRepository'),
  JournalRepository: Symbol.for('JournalRepository'),
  JournalSubmissionRepository: Symbol.for('JournalSubmissionRepository'),
  NotificationRepository: Symbol.for('NotificationRepository'),
};

export { TYPES as CLASSROOM_TYPES };


