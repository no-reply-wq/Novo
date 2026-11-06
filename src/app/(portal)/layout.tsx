import React from 'react'

/** Portal layout — no session guard. Portals have their own auth. */
export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
