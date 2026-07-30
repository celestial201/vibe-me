import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';

let io: Server | null = null;

export function initSocketServer(server: HttpServer): Server {
  io = new Server(server, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
      credentials: true,
    },
  });

  io.on('connection', (socket: Socket) => {
    socket.on('join_classroom', (classroomId: string) => {
      if (classroomId) {
        socket.join(`classroom_${classroomId}`);
      }
    });

    socket.on('leave_classroom', (classroomId: string) => {
      if (classroomId) {
        socket.leave(`classroom_${classroomId}`);
      }
    });

    socket.on('join_user_room', (userId: string) => {
      if (userId) {
        socket.join(`user_${userId}`);
      }
    });

    socket.on('leave_user_room', (userId: string) => {
      if (userId) {
        socket.leave(`user_${userId}`);
      }
    });
  });

  return io;
}

export function getSocketIO(): Server | null {
  return io;
}

export function emitNewAnnouncement(classroomId: string, data: any) {
  if (io && classroomId) {
    io.to(`classroom_${classroomId}`).emit('new_announcement', data);
  }
}

export function emitStreamUpdated(classroomId: string, data: any) {
  if (io && classroomId) {
    io.to(`classroom_${classroomId}`).emit('stream_updated', data);
  }
}

export function emitNewAssignment(classroomId: string, data: any) {
  if (io && classroomId) {
    io.to(`classroom_${classroomId}`).emit('new_assignment', data);
  }
}

export function emitSubmissionStatusChanged(classroomId: string, data: any) {
  if (io && classroomId) {
    io.to(`classroom_${classroomId}`).emit('submission_status_changed', data);
  }
}

export function emitNewNotification(userId: string, data: any) {
  if (io && userId) {
    io.to(`user_${userId}`).emit('new_notification', data);
  }
}

export function emitCoursePushed(classroomId: string, memberIds: string[], data: any) {
  if (io) {
    if (classroomId) {
      io.to(`classroom_${classroomId}`).emit('course_pushed', data);
    }
    if (Array.isArray(memberIds)) {
      memberIds.forEach((studentId) => {
        if (studentId) {
          io.to(`user_${studentId}`).emit('course_pushed', data);
        }
      });
    }
  }
}

export function emitEnrollmentAccepted(classroomId: string, studentId: string, courseId: string) {
  if (io && classroomId) {
    io.to(`classroom_${classroomId}`).emit('enrollment_accepted', { studentId, courseId });
  }
}

