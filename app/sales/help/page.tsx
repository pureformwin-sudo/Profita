'use client'

import { useState } from 'react'
import { 
  HelpCircle, 
  MessageCircle, 
  FileText, 
  Video,
  ChevronRight,
  ChevronDown,
  Phone,
  Mail,
  ExternalLink
} from 'lucide-react'
import { cn } from '@/lib/utils'

const FAQS = [
  {
    question: 'How do I add a new lead?',
    answer: 'Tap on the Map, then tap on any house to drop a pin. Fill in the lead details and tap Save. You can also add leads from the Leads page using the + button.',
  },
  {
    question: 'How do I schedule a follow-up?',
    answer: 'Open any lead, scroll to the bottom and tap "Schedule Follow Up". Select a date and time, and you\'ll receive a reminder when it\'s due.',
  },
  {
    question: 'How do I create a quote?',
    answer: 'Go to Quotes from the More menu, tap the + button, select a lead, add line items for services, and generate the quote. You can email or share it directly.',
  },
  {
    question: 'How does the leaderboard work?',
    answer: 'The leaderboard ranks sales reps by total leads, bookings, and revenue. Stats reset weekly on Monday. Top performers get badges and recognition.',
  },
  {
    question: 'Can I work offline?',
    answer: 'Yes! The map and your leads are cached for offline use. Any changes you make will sync automatically when you\'re back online.',
  },
  {
    question: 'How do I change my territory?',
    answer: 'Territory assignments are managed by your admin. Contact your manager or use the Help & Support chat to request a territory change.',
  },
]

export default function HelpPage() {
  const [expandedFaq, setExpandedFaq] = useState<number | null>(0)

  return (
    <div className="min-h-full bg-zinc-950 pb-24 lg:pb-6">
      <div className="p-4 lg:p-6 space-y-6 max-w-2xl mx-auto">
        {/* Quick Help */}
        <div className="space-y-2">
          <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider px-1">
            Get Help
          </h3>
          <div className="grid grid-cols-2 gap-3">
            <HelpCard
              icon={MessageCircle}
              label="Live Chat"
              description="Chat with support"
              color="bg-emerald-500/20 text-emerald-400"
            />
            <HelpCard
              icon={Phone}
              label="Call Us"
              description="1-800-PROFITA"
              color="bg-blue-500/20 text-blue-400"
            />
            <HelpCard
              icon={Mail}
              label="Email"
              description="support@profita.com"
              color="bg-purple-500/20 text-purple-400"
            />
            <HelpCard
              icon={Video}
              label="Video Guides"
              description="Watch tutorials"
              color="bg-amber-500/20 text-amber-400"
            />
          </div>
        </div>

        {/* FAQs */}
        <div className="space-y-2">
          <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider px-1">
            Frequently Asked Questions
          </h3>
          <div className="bg-zinc-900/50 rounded-2xl border border-zinc-800 divide-y divide-zinc-800 overflow-hidden">
            {FAQS.map((faq, index) => (
              <div key={index}>
                <button
                  onClick={() => setExpandedFaq(expandedFaq === index ? null : index)}
                  className="w-full flex items-center gap-3 p-4 text-left hover:bg-zinc-800/50 transition-colors"
                >
                  <div className="h-8 w-8 rounded-lg bg-zinc-800 flex items-center justify-center shrink-0">
                    <HelpCircle className="h-4 w-4 text-zinc-400" />
                  </div>
                  <span className="flex-1 font-medium text-white text-sm">
                    {faq.question}
                  </span>
                  <ChevronDown 
                    className={cn(
                      'h-5 w-5 text-zinc-500 transition-transform',
                      expandedFaq === index && 'rotate-180'
                    )} 
                  />
                </button>
                {expandedFaq === index && (
                  <div className="px-4 pb-4 pl-[60px]">
                    <p className="text-sm text-zinc-400 leading-relaxed">
                      {faq.answer}
                    </p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Resources */}
        <div className="space-y-2">
          <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider px-1">
            Resources
          </h3>
          <div className="bg-zinc-900/50 rounded-2xl border border-zinc-800 divide-y divide-zinc-800">
            <ResourceLink
              icon={FileText}
              label="User Guide"
              description="Complete documentation"
            />
            <ResourceLink
              icon={Video}
              label="Training Videos"
              description="Step-by-step tutorials"
            />
            <ResourceLink
              icon={ExternalLink}
              label="Release Notes"
              description="What's new in v1.0"
            />
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

function HelpCard({
  icon: Icon,
  label,
  description,
  color,
}: {
  icon: React.ElementType
  label: string
  description: string
  color: string
}) {
  return (
    <button className="bg-zinc-900/50 rounded-2xl border border-zinc-800 p-4 text-left hover:bg-zinc-800/50 transition-colors">
      <div className={cn('h-10 w-10 rounded-xl flex items-center justify-center mb-3', color)}>
        <Icon className="h-5 w-5" />
      </div>
      <p className="font-semibold text-white text-sm">{label}</p>
      <p className="text-xs text-zinc-500 mt-0.5">{description}</p>
    </button>
  )
}

function ResourceLink({
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
