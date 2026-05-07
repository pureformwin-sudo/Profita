'use client'

import { useEffect, useState, useRef } from 'react'

interface AnimatedNumberProps {
  value: number
  duration?: number
  prefix?: string
  suffix?: string
  decimals?: number
  className?: string
}

export function AnimatedNumber({
  value,
  duration = 1000,
  prefix = '',
  suffix = '',
  decimals = 0,
  className = '',
}: AnimatedNumberProps) {
  const [displayValue, setDisplayValue] = useState(0)
  const startTimeRef = useRef<number | null>(null)
  const startValueRef = useRef(0)
  const frameRef = useRef<number>()

  useEffect(() => {
    startValueRef.current = displayValue
    startTimeRef.current = null

    const animate = (currentTime: number) => {
      if (startTimeRef.current === null) {
        startTimeRef.current = currentTime
      }

      const elapsed = currentTime - startTimeRef.current
      const progress = Math.min(elapsed / duration, 1)

      // Easing function for smooth deceleration
      const easeOutQuart = 1 - Math.pow(1 - progress, 4)

      const currentValue = startValueRef.current + (value - startValueRef.current) * easeOutQuart
      setDisplayValue(currentValue)

      if (progress < 1) {
        frameRef.current = requestAnimationFrame(animate)
      }
    }

    frameRef.current = requestAnimationFrame(animate)

    return () => {
      if (frameRef.current) {
        cancelAnimationFrame(frameRef.current)
      }
    }
  }, [value, duration])

  const formattedValue = displayValue.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })

  return (
    <span className={className}>
      {prefix}{formattedValue}{suffix}
    </span>
  )
}
