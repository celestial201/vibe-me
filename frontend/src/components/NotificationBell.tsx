import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/store/auth-store';
import {
  useGetNotifications,
  useMarkNotificationRead,
  useMarkAllNotificationsRead,
  useNotificationsSocket,
  getSocketClient,
  LMS_CK,
} from '@/hooks/classroom-lms-hooks';
import { NotificationDTO } from '@/services/classroom-lms-api';
import { Button } from '@/components/ui/button';
import { Bell, Clock, BookOpen, MessageSquare, AlertCircle, Sparkles } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface NotificationBellProps {
  classroomId?: string;
}

export function NotificationBell({ classroomId }: NotificationBellProps = {}) {
  const { user } = useAuthStore();
  const userId = user?._id || user?.id;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [isOpen, setIsOpen] = useState(false);
  const [hasUnreadSocket, setHasUnreadSocket] = useState(false);
  const [displayedNotifications, setDisplayedNotifications] = useState<NotificationDTO[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);

  // Socket listener for real-time unread updates
  useNotificationsSocket(userId);

  const { data: notifications = [] } = useGetNotifications(classroomId);
  const markReadMutation = useMarkNotificationRead();
  const markAllReadMutation = useMarkAllNotificationsRead();

  const unreadCount = notifications.length;
  const showUnreadBadge = unreadCount > 0 || hasUnreadSocket;

  // Socket listener for classroom stream & course push events
  useEffect(() => {
    const socket = getSocketClient();

    if (classroomId) {
      socket.emit('join_classroom', classroomId);
    }
    if (userId) {
      socket.emit('join_user_room', userId);
    }

    const handleRealtimeUpdate = () => {
      setHasUnreadSocket(true);
      if (classroomId) {
        queryClient.invalidateQueries({ queryKey: LMS_CK.notifications(classroomId) });
        queryClient.invalidateQueries({ queryKey: LMS_CK.announcements(classroomId) });
      }
      queryClient.invalidateQueries({ queryKey: LMS_CK.notifications() });
      queryClient.invalidateQueries({ queryKey: ['enrollments'] });
      queryClient.invalidateQueries({ queryKey: ['classroom-courses'] });
    };

    socket.on('course_pushed', handleRealtimeUpdate);
    socket.on('stream_updated', handleRealtimeUpdate);
    socket.on('new_announcement', handleRealtimeUpdate);
    socket.on('new_notification', handleRealtimeUpdate);

    return () => {
      socket.off('course_pushed', handleRealtimeUpdate);
      socket.off('stream_updated', handleRealtimeUpdate);
      socket.off('new_announcement', handleRealtimeUpdate);
      socket.off('new_notification', handleRealtimeUpdate);
      if (classroomId) {
        socket.emit('leave_classroom', classroomId);
      }
    };
  }, [classroomId, userId, queryClient]);

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setDisplayedNotifications([]);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Sync displayed notifications & mark as read when notifications arrive while open
  useEffect(() => {
    if (isOpen && notifications.length > 0) {
      setDisplayedNotifications((prev) => {
        const existingIds = new Set(prev.map((n) => n._id));
        const newItems = notifications.filter((n) => !existingIds.has(n._id));
        if (newItems.length > 0) {
          markAllReadMutation.mutate(classroomId);
          return [...newItems, ...prev];
        }
        return prev;
      });
    }
  }, [isOpen, notifications, classroomId]);

  const handleNotificationClick = async (id: string, link: string) => {
    setIsOpen(false);
    setHasUnreadSocket(false);
    setDisplayedNotifications([]);
    await markReadMutation.mutateAsync(id);
    if (link) {
      navigate({ to: link as any }).catch(() => {
        window.location.href = link;
      });
    }
  };

  const handleToggleOpen = () => {
    setIsOpen((prev) => {
      const nextOpen = !prev;
      if (nextOpen) {
        if (notifications.length > 0) {
          setDisplayedNotifications(notifications);
          markAllReadMutation.mutate(classroomId);
        }
        setHasUnreadSocket(false);
      } else {
        setDisplayedNotifications([]);
      }
      return nextOpen;
    });
  };

  const getIcon = (type: string) => {
    switch (type) {
      case 'new_assignment':
        return <BookOpen className="w-4 h-4 text-blue-500" />;
      case 'approval_request':
        return <AlertCircle className="w-4 h-4 text-amber-500" />;
      case 'new_announcement':
        return <MessageSquare className="w-4 h-4 text-emerald-500" />;
      case 'course_pushed':
      case 'course_invitation':
        return <Sparkles className="w-4 h-4 text-amber-500" />;
      default:
        return <Bell className="w-4 h-4 text-primary" />;
    }
  };

  const listToRender = isOpen && displayedNotifications.length > 0 ? displayedNotifications : notifications;

  return (
    <div className="relative inline-block" ref={containerRef}>
      <Button
        variant="ghost"
        size="icon"
        className="relative cursor-pointer"
        onClick={handleToggleOpen}
      >
        <Bell className="w-5 h-5 text-muted-foreground hover:text-foreground transition-colors" />
        {showUnreadBadge && (
          <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-destructive-foreground animate-pulse">
            {unreadCount > 9 ? '9+' : unreadCount > 0 ? unreadCount : '•'}
          </span>
        )}
      </Button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 bg-popover text-popover-foreground border border-border rounded-lg shadow-lg z-50 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border/50 bg-muted/30">
            <div className="flex items-center gap-2">
              <Bell className="w-4 h-4 text-primary" />
              <h4 className="font-semibold text-sm">Notifications</h4>
            </div>
            <span className="text-xs text-muted-foreground font-medium">
              {listToRender.length > 0 ? `${listToRender.length} unread` : '0 unread'}
            </span>
          </div>

          <div className="max-h-80 overflow-y-auto divide-y divide-border/30">
            {listToRender.length === 0 ? (
              <div className="p-8 text-center text-xs text-muted-foreground">
                No unread notifications
              </div>
            ) : (
              listToRender.map((n) => (
                <button
                  key={n._id}
                  type="button"
                  onClick={() => handleNotificationClick(n._id, n.link)}
                  className="w-full text-left p-3 hover:bg-accent/50 transition-colors flex items-start gap-3 cursor-pointer"
                >
                  <div className="p-1.5 rounded-lg bg-muted/60 shrink-0 mt-0.5">
                    {getIcon(n.type)}
                  </div>
                  <div className="flex-1 space-y-1 overflow-hidden">
                    <p className="text-xs font-medium text-foreground line-clamp-2 leading-snug">
                      {n.message}
                    </p>
                    <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {n.createdAt
                        ? formatDistanceToNow(new Date(n.createdAt), { addSuffix: true })
                        : 'Just now'}
                    </p>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
