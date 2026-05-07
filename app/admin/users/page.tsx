'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Check, X, Shield, Users, Clock, UserCheck } from 'lucide-react'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'

interface Profile {
  id: string
  email: string
  name: string
  status: 'pending' | 'approved' | 'rejected'
  is_admin: boolean
  created_at: string
}

export default function AdminUsersPage() {
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [currentUser, setCurrentUser] = useState<Profile | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const router = useRouter()

  useEffect(() => {
    loadUsers()
  }, [])

  async function loadUsers() {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      router.push('/login')
      return
    }

    // Get current user's profile
    const { data: currentProfile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single()

    if (!currentProfile?.is_admin) {
      toast.error('Access denied - Admin only')
      router.push('/')
      return
    }

    setCurrentUser(currentProfile)

    // Get all profiles
    const { data: allProfiles, error } = await supabase
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      toast.error('Failed to load users')
      return
    }

    setProfiles(allProfiles || [])
    setIsLoading(false)
  }

  async function updateUserStatus(userId: string, status: 'approved' | 'rejected') {
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    
    const res = await fetch('/api/admin/approve', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session?.access_token}`
      },
      body: JSON.stringify({ userId, action: status === 'approved' ? 'approve' : 'reject' })
    })

    const data = await res.json()
    if (!res.ok) {
      toast.error(`Failed: ${data.error}`)
      return
    }

    toast.success(status === 'approved' ? 'User approved!' : 'User rejected')
    loadUsers()
  }

  async function toggleAdmin(userId: string, isAdmin: boolean) {
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    
    const res = await fetch('/api/admin/approve', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session?.access_token}`
      },
      body: JSON.stringify({ userId, action: 'toggleAdmin', isAdmin })
    })

    const data = await res.json()
    if (!res.ok) {
      toast.error(`Failed: ${data.error}`)
      return
    }

    toast.success(isAdmin ? 'Admin access granted' : 'Admin access removed')
    loadUsers()
  }

  if (isLoading) {
    return (
      <div className="p-8 flex items-center justify-center">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    )
  }

  const pendingUsers = profiles.filter(p => p.status === 'pending')
  const approvedUsers = profiles.filter(p => p.status === 'approved')
  const rejectedUsers = profiles.filter(p => p.status === 'rejected')

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">User Management</h1>
        <p className="text-muted-foreground">Approve or reject sign-up requests</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-amber-500/10 flex items-center justify-center">
                <Clock className="h-5 w-5 text-amber-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{pendingUsers.length}</p>
                <p className="text-xs text-muted-foreground">Pending</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-green-500/10 flex items-center justify-center">
                <UserCheck className="h-5 w-5 text-green-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{approvedUsers.length}</p>
                <p className="text-xs text-muted-foreground">Approved</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-red-500/10 flex items-center justify-center">
                <X className="h-5 w-5 text-red-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{rejectedUsers.length}</p>
                <p className="text-xs text-muted-foreground">Rejected</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Pending Users */}
      {pendingUsers.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-amber-500" />
              Pending Approval
            </CardTitle>
            <CardDescription>Users waiting for your approval</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {pendingUsers.map(user => (
              <div key={user.id} className="flex items-center justify-between p-4 rounded-lg border border-amber-500/30 bg-amber-500/5">
                <div>
                  <p className="font-medium">{user.name || 'No name'}</p>
                  <p className="text-sm text-muted-foreground">{user.email}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Signed up {new Date(user.created_at).toLocaleDateString()}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button 
                    size="sm" 
                    variant="outline"
                    className="text-red-500 border-red-500/30 hover:bg-red-500/10"
                    onClick={() => updateUserStatus(user.id, 'rejected')}
                  >
                    <X className="h-4 w-4 mr-1" />
                    Reject
                  </Button>
                  <Button 
                    size="sm"
                    className="bg-green-600 hover:bg-green-700"
                    onClick={() => updateUserStatus(user.id, 'approved')}
                  >
                    <Check className="h-4 w-4 mr-1" />
                    Approve
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Approved Users */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Approved Users
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {approvedUsers.length === 0 ? (
            <p className="text-muted-foreground text-center py-4">No approved users yet</p>
          ) : (
            approvedUsers.map(user => (
              <div key={user.id} className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-secondary/30 transition-colors">
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center">
                    <span className="text-sm font-semibold">
                      {(user.name || user.email || '?')[0].toUpperCase()}
                    </span>
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-medium">{user.name || 'No name'}</p>
                      {user.is_admin && (
                        <Badge variant="secondary" className="text-[10px] h-5">
                          <Shield className="h-3 w-3 mr-1" />
                          Admin
                        </Badge>
                      )}
                      {user.id === currentUser?.id && (
                        <Badge variant="outline" className="text-[10px] h-5">You</Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">{user.email}</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  {user.id !== currentUser?.id && (
                    <>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => toggleAdmin(user.id, !user.is_admin)}
                      >
                        <Shield className={`h-4 w-4 ${user.is_admin ? 'text-primary' : 'text-muted-foreground'}`} />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-red-500"
                        onClick={() => updateUserStatus(user.id, 'rejected')}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </>
                  )}
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {/* Rejected Users */}
      {rejectedUsers.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-red-500">Rejected Users</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {rejectedUsers.map(user => (
              <div key={user.id} className="flex items-center justify-between p-3 rounded-lg border border-red-500/20 bg-red-500/5">
                <div>
                  <p className="font-medium">{user.name || 'No name'}</p>
                  <p className="text-sm text-muted-foreground">{user.email}</p>
                </div>
                <Button 
                  size="sm" 
                  variant="outline"
                  onClick={() => updateUserStatus(user.id, 'approved')}
                >
                  Approve
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
