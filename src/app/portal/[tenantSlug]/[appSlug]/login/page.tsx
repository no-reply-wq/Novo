'use client'

import React, { useState, FormEvent } from 'react'
import { useParams, useRouter } from 'next/navigation'

export default function PortalLoginPage() {
  const params = useParams()
  const router = useRouter()
  const tenantSlug = params?.tenantSlug as string
  const appSlug = params?.appSlug as string

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const res = await fetch(`/api/portal2/${tenantSlug}/${appSlug}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })

      if (!res.ok) {
        const data = await res.json() as { error?: string }
        setError(data.error ?? 'Login failed')
        return
      }

      // Cookie is set by server — just redirect
      router.push(`/portal/${tenantSlug}/${appSlug}`)
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'linear-gradient(135deg, #009A8A 0%, #00786B 100%)',
      fontFamily: 'Inter, system-ui, sans-serif',
    }}>
      <div style={{
        background: '#fff',
        borderRadius: 16,
        padding: '40px 36px',
        width: '100%',
        maxWidth: 420,
        boxShadow: '0 20px 60px rgba(0,0,0,0.15)',
      }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{
            width: 56, height: 56, borderRadius: 14,
            background: 'linear-gradient(135deg, #009A8A, #00786B)',
            margin: '0 auto 16px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <svg width="28" height="28" fill="none" viewBox="0 0 24 24">
              <rect x="2" y="3" width="20" height="14" rx="2" stroke="white" strokeWidth="2"/>
              <path d="M8 21h8M12 17v4" stroke="white" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </div>
          <h1 style={{ margin: '0 0 4px', fontSize: 24, fontWeight: 700, color: '#111827' }}>
            {appSlug ? appSlug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : 'Portal'}
          </h1>
          <p style={{ margin: 0, fontSize: 14, color: '#6b7280' }}>Sign in to your account</p>
        </div>

        <form onSubmit={handleSubmit} noValidate>
          <div style={{ marginBottom: 16 }}>
            <label htmlFor="email" style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6 }}>
              Email Address
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              style={{
                width: '100%',
                padding: '11px 14px',
                border: '1.5px solid #e5e7eb',
                borderRadius: 10,
                fontSize: 14,
                boxSizing: 'border-box',
                color: '#111827',
                outline: 'none',
              }}
              placeholder="you@company.com"
              onFocus={(e) => { e.target.style.borderColor = '#009A8A' }}
              onBlur={(e) => { e.target.style.borderColor = '#e5e7eb' }}
            />
          </div>

          <div style={{ marginBottom: 24 }}>
            <label htmlFor="password" style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6 }}>
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              style={{
                width: '100%',
                padding: '11px 14px',
                border: '1.5px solid #e5e7eb',
                borderRadius: 10,
                fontSize: 14,
                boxSizing: 'border-box',
                color: '#111827',
                outline: 'none',
              }}
              placeholder="••••••••"
              onFocus={(e) => { e.target.style.borderColor = '#009A8A' }}
              onBlur={(e) => { e.target.style.borderColor = '#e5e7eb' }}
            />
          </div>

          {error && (
            <div style={{
              marginBottom: 16,
              padding: '10px 14px',
              background: '#fef2f2',
              border: '1px solid #fecaca',
              borderRadius: 8,
              color: '#dc2626',
              fontSize: 13,
            }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%',
              padding: '12px 16px',
              background: loading ? '#7ec9c3' : '#009A8A',
              color: '#fff',
              border: 'none',
              borderRadius: 10,
              fontSize: 15,
              fontWeight: 600,
              cursor: loading ? 'not-allowed' : 'pointer',
            }}
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  )
}
