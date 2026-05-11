'use client'

import { useState } from 'react'
import { 
  Bell, 
  BellOff,
  User,
  Calendar,
  MessageSquare,
  Star,
  Clock,
  Check,
  Trash2
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

type Notification = {
  id: string
  type: 'lead' | 'followup' | 'booking' | 'message' | 'achievement'
  title: string
  description: string
  time: string
  read: boolean
}

const MOCK_NOTIFICATIONS: Notification[] = [
  {
    id: '1',
    type: 'lead',
    title: 'New lead assigned',
    description: 'John Smith at 123 Oak Street has been assigned to you',
    time: '5 min ago',
    read: false,
  },
  {
    id: '2',
    type: 'followup',
    title: 'Follow-up reminder',
    description: 'Call back Sarah Johnson - scheduled for today at 2:00 PM',
    time: '1 hour ago',
    read: false,
  },
  {
    id: '3',
    type: 'booking',
    title: 'Appointment confirmed',
    description: 'Demo with Mike Wilson confirmed for tomorrow at 10:00 AM',
    time: '2 hours ago',
    read: true,
  },
  {
    id: '4',
    type: 'achievement',
    title: 'Achievement unlocked!',
    description: 'You reached 50 leads this month - keep it up!',
    time: 'Yesterday',
    read: true,
  },
  {
    id: '5',
    type: 'message',
    title: 'Team announcement',
    description: 'New territory assignments have been posted',
    time: '2 days ago',
    read: true,
  },
]

const TYPE_CONFIG = {
  lead: { icon: User, color: 'bg-blue-500/20 text-blue-400' },
  followup: { icon: Clock, color: 'bg-amber-500/20 text-amber-400' },
  booking: { icon: Calendar, color: 'bg-emerald-500/20 text-emerald-400' },
  message: { icon: MessageSquare, color: 'bg-purple-500/20 text-purple-400' },
  achievement: { icon: Star, color: 'bg-yellow-500/20 text-yellow-400' },
}

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState(MOCK_NOTIFICATIONS)
  
  const unreadCount = notifications.filter(n => !n.read).length
  
  const markAllRead = () => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })))
  }
  
  const markAsRead = (id: string) => {
    setNotifications(prev => prev.map(n => 
      n.id === id ? { ...n, read: true } : n
    ))
  }
  
  const deleteNotification = (id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id))
  }
  
  const clearAll = () => {
    setNotifications([])
  }

  return (
    <div className="min-h-full bg-zinc-950 pb-24 lg:pb-6">
      <div className="p-4 lg:p-6 space-y-4 max-w-2xl mx-auto">
        {/* Header Actions */}
        {notifications.length > 0 && (
          <div className="flex items-center justify-between">
            <p className="text-sm text-zinc-400">
              {unreadCount > 0 ? `${unreadCount} unread` : 'All caught up!'}
            </p>
            <div className="flex gap-2">
              {unreadCount > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={markAllRead}
                  className="text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10"
                >
                  <Check className="h-4 w-4 mr-1" />
                  Mark all read
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={clearAll}
                className="text-zinc-400 hover:text-zinc-300"
              >
                <Trash2 className="h-4 w-4 mr-1" />
                Clear all
              </Button>
            </div>
          </div>
        )}

        {/* Notifications List */}
        {notifications.length > 0 ? (
          <div className="space-y-2">
            {notifications.map((notification) => {
              const config = TYPE_CONFIG[notification.type]
              const Icon = config.icon
              
              return (
                <div
                  key={notification.id}
                  onClick={() => markAsRead(notification.id)}
                  className={cn(
                    'bg-zinc-900/50 rounded-2xl border p-4 transition-colors cursor-pointer',
                    notification.read 
                      ? 'border-zinc-800/50 opacity-60' 
                      : 'border-zinc-700 bg-zinc-900'
                  )}
                >
                  <div className="flex gap-3">
                    <div className={cn(
                      'h-10 w-10 rounded-xl flex items-center justify-center shrink-0',
                      config.color
                    )}>
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <p className={cn(
                          'font-semibold truncate',
                          notification.read ? 'text-zinc-400' : 'text-white'
                        )}>
                          {notification.title}
                        </p>
                        {!notification.read && (
                          <div className="h-2 w-2 rounded-full bg-emerald-500 shrink-0 mt-2" />
                        )}
                      </div>
                      <p className="text-sm text-zinc-500 line-clamp-2 mt-0.5">
                        {notification.description}
                      </p>
                      <p className="text-xs text-zinc-600 mt-1">
                        {notification.time}
                      </p>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="h-16 w-16 rounded-2xl bg-zinc-800/50 flex items-center justify-center mb-4">
              <BellOff className="h-8 w-8 text-zinc-600" />
            </div>
            <h3 className="text-lg font-semibold text-white mb-1">
              No notifications
            </h3>
            <p className="text-sm text-zinc-500 max-w-[240px]">
              You&apos;re all caught up! New notifications will appear here.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
