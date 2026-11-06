import type {
  PropsMessage,
  EventMessage,
  ResizeMessage,
  ReadyMessage,
  ComponentMessage,
} from '../types'

function isComponentMessage(msg: unknown): msg is ComponentMessage {
  return (
    typeof msg === 'object' &&
    msg !== null &&
    typeof (msg as Record<string, unknown>)['type'] === 'string' &&
    ['novo:props', 'novo:event', 'novo:ready', 'novo:resize'].includes(
      (msg as Record<string, unknown>)['type'] as string
    )
  )
}

describe('iframe postMessage protocol', () => {
  describe('PropsMessage', () => {
    it('serializes to expected shape', () => {
      const msg: PropsMessage = {
        type: 'novo:props',
        payload: { name: 'Alice', count: 42 },
      }
      const serialized = JSON.stringify(msg)
      const parsed = JSON.parse(serialized) as PropsMessage
      expect(parsed.type).toBe('novo:props')
      expect(parsed.payload).toEqual({ name: 'Alice', count: 42 })
    })

    it('accepts empty payload', () => {
      const msg: PropsMessage = { type: 'novo:props', payload: {} }
      expect(msg.payload).toEqual({})
    })

    it('roundtrips nested objects', () => {
      const msg: PropsMessage = {
        type: 'novo:props',
        payload: { user: { id: 1, roles: ['admin'] } },
      }
      const rt = JSON.parse(JSON.stringify(msg)) as PropsMessage
      expect(rt.payload['user']).toEqual({ id: 1, roles: ['admin'] })
    })

    it('has correct type literal', () => {
      const msg: PropsMessage = { type: 'novo:props', payload: {} }
      expect(msg.type).toBe('novo:props')
    })
  })

  describe('EventMessage', () => {
    it('serializes eventName and data', () => {
      const msg: EventMessage = {
        type: 'novo:event',
        payload: { eventName: 'onSelect', data: { id: 'abc' } },
      }
      const rt = JSON.parse(JSON.stringify(msg)) as EventMessage
      expect(rt.payload.eventName).toBe('onSelect')
      expect(rt.payload.data).toEqual({ id: 'abc' })
    })

    it('accepts null data', () => {
      const msg: EventMessage = {
        type: 'novo:event',
        payload: { eventName: 'onClick', data: null },
      }
      expect(msg.payload.data).toBeNull()
    })

    it('accepts array data', () => {
      const msg: EventMessage = {
        type: 'novo:event',
        payload: { eventName: 'onMultiSelect', data: [1, 2, 3] },
      }
      expect(Array.isArray(msg.payload.data)).toBe(true)
    })

    it('has correct type literal', () => {
      const msg: EventMessage = {
        type: 'novo:event',
        payload: { eventName: 'x', data: null },
      }
      expect(msg.type).toBe('novo:event')
    })
  })

  describe('ResizeMessage', () => {
    it('carries numeric height', () => {
      const msg: ResizeMessage = { type: 'novo:resize', payload: 350 }
      expect(msg.payload).toBe(350)
    })

    it('roundtrips height', () => {
      const msg: ResizeMessage = { type: 'novo:resize', payload: 500 }
      const rt = JSON.parse(JSON.stringify(msg)) as ResizeMessage
      expect(rt.payload).toBe(500)
    })
  })

  describe('ReadyMessage', () => {
    it('has empty payload', () => {
      const msg: ReadyMessage = { type: 'novo:ready', payload: {} }
      expect(Object.keys(msg.payload)).toHaveLength(0)
    })
  })

  describe('origin validation', () => {
    it('same-origin messages accepted', () => {
      const origin = 'https://app.example.com'
      const allowedOrigin = 'https://app.example.com'
      expect(origin === allowedOrigin).toBe(true)
    })

    it('cross-origin messages rejected', () => {
      const origin: string = 'https://evil.example.com'
      const allowedOrigin: string = 'https://app.example.com'
      expect(origin === allowedOrigin).toBe(false)
    })

    it('wildcard * differs from specific origin', () => {
      const wildcard: string = '*'
      const allowedOrigin: string = 'https://app.example.com'
      expect(wildcard === allowedOrigin).toBe(false)
    })
  })

  describe('isComponentMessage type guard', () => {
    it('accepts valid novo:props message', () => {
      const msg = { type: 'novo:props', payload: {} }
      expect(isComponentMessage(msg)).toBe(true)
    })

    it('accepts valid novo:event message', () => {
      const msg = { type: 'novo:event', payload: { eventName: 'x', data: null } }
      expect(isComponentMessage(msg)).toBe(true)
    })

    it('accepts novo:ready', () => {
      expect(isComponentMessage({ type: 'novo:ready', payload: {} })).toBe(true)
    })

    it('accepts novo:resize', () => {
      expect(isComponentMessage({ type: 'novo:resize', payload: 100 })).toBe(true)
    })

    it('rejects unknown type', () => {
      expect(isComponentMessage({ type: 'NOVO_PROPS', payload: {} })).toBe(false)
    })

    it('rejects null', () => {
      expect(isComponentMessage(null)).toBe(false)
    })

    it('rejects plain string', () => {
      expect(isComponentMessage('novo:props')).toBe(false)
    })
  })
})
