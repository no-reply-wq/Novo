'use client'

import React, { useState, FormEvent } from 'react'
import { useParams } from 'next/navigation'

interface FormField {
  key: string
  label: string
  type: 'text' | 'email' | 'number' | 'textarea'
  required?: boolean
  placeholder?: string
}

// Default fields shown when no config is passed via query param
const DEFAULT_FIELDS: FormField[] = [
  { key: 'name', label: 'Name', type: 'text', required: true, placeholder: 'Your name' },
  { key: 'email', label: 'Email', type: 'email', required: true, placeholder: 'your@email.com' },
  { key: 'message', label: 'Message', type: 'textarea', placeholder: 'Your message…' },
]

export default function PublicFormPage() {
  const params = useParams()
  const tenantSlug = params?.tenantSlug as string
  const formSlug = params?.formSlug as string

  const [formData, setFormData] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState('')
  const [successMessage, setSuccessMessage] = useState('Thank you for your submission!')

  const fields = DEFAULT_FIELDS

  function handleChange(key: string, value: string) {
    setFormData((prev) => ({ ...prev, [key]: value }))
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError('')
    setSubmitting(true)

    try {
      const res = await fetch(`/api/portal/${tenantSlug}/forms/${formSlug}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          data: formData,
          captchaToken: undefined, // reCAPTCHA-ready
        }),
      })

      const data = await res.json() as { success?: boolean; message?: string; error?: string }

      if (!res.ok) {
        setError(data.error ?? 'Submission failed')
        return
      }

      setSuccessMessage(data.message ?? 'Thank you for your submission!')
      setSubmitted(true)
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  if (submitted) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#f9fafb',
        fontFamily: 'Inter, system-ui, sans-serif',
        padding: 24,
      }}>
        <div style={{
          background: '#fff',
          borderRadius: 12,
          padding: '48px 32px',
          maxWidth: 420,
          width: '100%',
          textAlign: 'center',
          boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
          border: '1px solid #e5e7eb',
        }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>✓</div>
          <h2 style={{ margin: '0 0 8px', fontSize: 20, fontWeight: 700, color: '#111827' }}>
            Submitted!
          </h2>
          <p style={{ color: '#6b7280', fontSize: 14, margin: 0 }}>{successMessage}</p>
        </div>
      </div>
    )
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: '#f9fafb',
      fontFamily: 'Inter, system-ui, sans-serif',
      padding: 24,
    }}>
      <div style={{
        background: '#fff',
        borderRadius: 12,
        padding: '36px 32px',
        width: '100%',
        maxWidth: 480,
        boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
        border: '1px solid #e5e7eb',
      }}>
        <h1 style={{ margin: '0 0 6px', fontSize: 22, fontWeight: 700, color: '#111827' }}>
          {formSlug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
        </h1>
        <p style={{ margin: '0 0 28px', fontSize: 14, color: '#6b7280' }}>
          Fill in the form below to submit
        </p>

        <form onSubmit={handleSubmit} noValidate>
          {fields.map((field) => (
            <div key={field.key} style={{ marginBottom: 18 }}>
              <label
                htmlFor={field.key}
                style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#374151', marginBottom: 4 }}
              >
                {field.label}
                {field.required && <span style={{ color: '#dc2626', marginLeft: 2 }}>*</span>}
              </label>
              {field.type === 'textarea' ? (
                <textarea
                  id={field.key}
                  value={formData[field.key] ?? ''}
                  onChange={(e) => handleChange(field.key, e.target.value)}
                  required={field.required}
                  placeholder={field.placeholder}
                  rows={4}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    border: '1px solid #d1d5db',
                    borderRadius: 8,
                    fontSize: 14,
                    boxSizing: 'border-box',
                    color: '#111827',
                    resize: 'vertical',
                    outline: 'none',
                  }}
                />
              ) : (
                <input
                  id={field.key}
                  type={field.type}
                  value={formData[field.key] ?? ''}
                  onChange={(e) => handleChange(field.key, e.target.value)}
                  required={field.required}
                  placeholder={field.placeholder}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    border: '1px solid #d1d5db',
                    borderRadius: 8,
                    fontSize: 14,
                    boxSizing: 'border-box',
                    color: '#111827',
                    outline: 'none',
                  }}
                />
              )}
            </div>
          ))}

          {error && (
            <div style={{
              marginBottom: 16,
              padding: '10px 12px',
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
            disabled={submitting}
            style={{
              width: '100%',
              padding: '11px 16px',
              background: submitting ? '#93c5fd' : '#2563eb',
              color: '#fff',
              border: 'none',
              borderRadius: 8,
              fontSize: 14,
              fontWeight: 600,
              cursor: submitting ? 'not-allowed' : 'pointer',
            }}
          >
            {submitting ? 'Submitting…' : 'Submit'}
          </button>
        </form>
      </div>
    </div>
  )
}
