'use client'

import { useState } from 'react'
import { 
  User, 
  Bell, 
  MapPin, 
  Moon, 
  Shield,
  Smartphone,
  ChevronRight,
  Check,
  LogOut
} from 'lucide-react'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'

export default function SettingsPage() {
  const [notifications, setNotifications] = useState(true)
  const [locationTracking, setLocationTracking] = useState(true)
  const [darkMode, setDarkMode] = useState(true)
  const [haptics, setHaptics] = useState(true)

  return (
    <div className="min-h-full bg-zinc-950 pb-24 lg:pb-6">
      <div className="p-4 lg:p-6 space-y-6 max-w-2xl mx-auto">
        {/* Profile Section */}
        <div className="bg-zinc-900/50 rounded-2xl border border-zinc-800 p-4">
          <div className="flex items-center gap-4">
            <div className="h-16 w-16 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-2xl font-bold text-white">
              JD
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-lg font-bold text-white truncate">John Doe</h2>
              <p className="text-sm text-zinc-400">Sales Representative</p>
              <p className="text-xs text-zinc-500 mt-0.5">john.doe@company.com</p>
            </div>
            <ChevronRight className="h-5 w-5 text-zinc-600 shrink-0" />
          </div>
        </div>

        {/* Preferences */}
        <div className="space-y-2">
          <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider px-1">
            Preferences
          </h3>
          <div className="bg-zinc-900/50 rounded-2xl border border-zinc-800 divide-y divide-zinc-800">
            <SettingToggle
              icon={Bell}
              label="Push Notifications"
              description="Alerts for new leads & follow-ups"
              checked={notifications}
              onCheckedChange={setNotifications}
            />
            <SettingToggle
              icon={MapPin}
              label="Location Tracking"
              description="Track knocked doors automatically"
              checked={locationTracking}
              onCheckedChange={setLocationTracking}
            />
            <SettingToggle
              icon={Moon}
              label="Dark Mode"
              description="Always use dark theme"
              checked={darkMode}
              onCheckedChange={setDarkMode}
            />
            <SettingToggle
              icon={Smartphone}
              label="Haptic Feedback"
              description="Vibration on actions"
              checked={haptics}
              onCheckedChange={setHaptics}
            />
          </div>
        </div>

        {/* Account */}
        <div className="space-y-2">
          <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider px-1">
            Account
          </h3>
          <div className="bg-zinc-900/50 rounded-2xl border border-zinc-800 divide-y divide-zinc-800">
            <SettingLink
              icon={User}
              label="Edit Profile"
              description="Name, photo, contact info"
            />
            <SettingLink
              icon={Shield}
              label="Privacy & Security"
              description="Password, 2FA, data"
            />
          </div>
        </div>

        {/* Danger Zone */}
        <div className="space-y-2">
          <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider px-1">
            Session
          </h3>
          <div className="bg-zinc-900/50 rounded-2xl border border-zinc-800">
            <button className="w-full flex items-center gap-4 p-4 text-red-400 hover:bg-red-500/10 transition-colors rounded-2xl">
              <div className="h-10 w-10 rounded-xl bg-red-500/20 flex items-center justify-center">
                <LogOut className="h-5 w-5 text-red-400" />
              </div>
              <div className="flex-1 text-left">
                <p className="font-semibold">Sign Out</p>
                <p className="text-xs text-red-400/70">Log out of SalesHub</p>
              </div>
            </button>
          </div>
        </div>

        {/* Version */}
        <p className="text-center text-xs text-zinc-600 pt-4">
          Profita SalesHub v1.0.0
        </p>
      </div>
    </div>
  )
}

function SettingToggle({
  icon: Icon,
  label,
  description,
  checked,
  onCheckedChange,
}: {
  icon: React.ElementType
  label: string
  description: string
  checked: boolean
  onCheckedChange: (checked: boolean) => void
}) {
  return (
    <div className="flex items-center gap-4 p-4">
      <div className="h-10 w-10 rounded-xl bg-zinc-800 flex items-center justify-center shrink-0">
        <Icon className="h-5 w-5 text-zinc-400" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-medium text-white">{label}</p>
        <p className="text-xs text-zinc-500 truncate">{description}</p>
      </div>
      <Switch
        checked={checked}
        onCheckedChange={onCheckedChange}
        className="shrink-0"
      />
    </div>
  )
}

function SettingLink({
  icon: Icon,
  label,
  description,
}: {
  icon: React.ElementType
  label: string
  description: string
}) {
  return (
    <button className="w-full flex items-center gap-4 p-4 hover:bg-zinc-800/50 transition-colors">
      <div className="h-10 w-10 rounded-xl bg-zinc-800 flex items-center justify-center shrink-0">
        <Icon className="h-5 w-5 text-zinc-400" />
      </div>
      <div className="flex-1 min-w-0 text-left">
        <p className="font-medium text-white">{label}</p>
        <p className="text-xs text-zinc-500 truncate">{description}</p>
      </div>
      <ChevronRight className="h-5 w-5 text-zinc-600 shrink-0" />
    </button>
  )
}
