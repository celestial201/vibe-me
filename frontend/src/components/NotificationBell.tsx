import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useAuthStore } from '@/store/auth-store';
import {
  useGetNotifications,
  useMarkNotificationRead,
  useNotificationsSocket,
} from '@/hooks/classroom-lms-hooks';
import { Button } from '@/components/ui/button';
import { Bell, Clock, BookOpen, MessageSquare, AlertCircle } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface NotificationBellProps {
  classroomId?: string;
}

export function NotificationBell({ classroomId }: NotificationBellProps = {}) {
  const { user } = useAuthStore();
  const userId = user?._id || user?.id;
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Socket listener for real-time unread updates
  useNotificationsSocket(userId);

  const { data: notifications = [] } = useGetNotifications(classroomId);
  const markReadMutation = useMarkNotificationRead();

  const unreadCount = notifications.length;

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleNotificationClick = async (id: string, link: string) => {
    setIsOpen(false);
    await markReadMutation.mutateAsync(id);
    if (link) {
      navigate({ to: link as any }).catch(() => {
        window.location.href = link;
      });
    }
  };

  const getIcon = (type: string) => {
    switch (type) {
      case 'new_assignment':
        return <BookOpen className="w-4 h-4 text-blue-500" />;
      case 'approval_request':
        return <AlertCircle className="w-4 h-4 text-amber-500" />;
      case 'new_announcement':
        return <MessageSquare className="w-4 h-4 text-emerald-500" />;
      default:
        return <Bell className="w-4 h-4 text-primary" />;
    }
  };

  return (
    <div className="relative inline-block" ref={containerRef}>
      <Button
        variant="ghost"
        size="icon"
        className="relative cursor-pointer"
        onClick={() => setIsOpen(!isOpen)}
      >
        <Bell className="w-5 h-5 text-muted-foreground hover:text-foreground transition-colors" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-destructive-foreground animate-pulse">
            {unreadCount > 9 ? '9+' : unreadCount}
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
              {unreadCount} unread
            </span>
          </div>

          <div className="max-h-80 overflow-y-auto divide-y divide-border/30">
            {notifications.length === 0 ? (
              <div className="p-8 text-center text-xs text-muted-foreground">
                No unread notifications
              </div>
            ) : (
              notifications.map((n) => (
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
