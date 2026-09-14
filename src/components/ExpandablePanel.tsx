import { useState, useEffect, useRef, type ReactNode } from 'react'

const ExpandIcon = () => (
  <svg
    width="15"
    height="15"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <polyline points="15 3 21 3 21 9" />
    <polyline points="9 21 3 21 3 15" />
    <line x1="21" y1="3" x2="14" y2="10" />
    <line x1="3" y1="21" x2="10" y2="14" />
  </svg>
)

const CollapseIcon = () => (
  <svg
    width="15"
    height="15"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <polyline points="4 14 10 14 10 20" />
    <polyline points="20 10 14 10 14 4" />
    <line x1="10" y1="14" x2="3" y2="21" />
    <line x1="21" y1="3" x2="14" y2="10" />
  </svg>
)

const ArrowLeftIcon = () => (
  <svg
    width="15"
    height="15"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <line x1="19" y1="12" x2="5" y2="12" />
    <polyline points="12 19 5 12 12 5" />
  </svg>
)

interface ExpandablePanelProps {
  children: ReactNode | ((isFullscreen: boolean) => ReactNode)
  /** Classes applied in normal (non-fullscreen) mode. Defaults to the standard card style. */
  className?: string
  /** Extra classes applied inside the fullscreen overlay content area. */
  fullscreenContentClass?: string
  /** Optional position to bottom */
  positionToBottom?: boolean
}

export const ExpandablePanel = ({
  children,
  className = 'relative border rounded-lg p-4',
  fullscreenContentClass = '',
  positionToBottom = false,
}: ExpandablePanelProps) => {
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [visible, setVisible] = useState(false)
  const closeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const overlayRef = useRef<HTMLDivElement>(null)

  const resolve = (fs: boolean): ReactNode =>
    typeof children === 'function' ? children(fs) : children

  // Body overflow lock + fade-in trigger
  useEffect(() => {
    let rafId: number
    if (isFullscreen) {
      rafId = requestAnimationFrame(() => setVisible(true))
      document.body.style.overflow = 'hidden'
    } else {
      setVisible(false)
      document.body.style.overflow = ''
    }
    // Always restore overflow on cleanup (handles unmount-while-fullscreen)
    return () => {
      cancelAnimationFrame(rafId)
      document.body.style.overflow = ''
    }
  }, [isFullscreen])

  // Escape key closes the overlay
  useEffect(() => {
    if (!isFullscreen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [isFullscreen]) // eslint-disable-line react-hooks/exhaustive-deps

  // Focus the overlay div when it becomes visible so keyboard users can interact
  useEffect(() => {
    if (visible) overlayRef.current?.focus()
  }, [visible])

  // Clear any pending close timeout on unmount
  useEffect(() => {
    return () => {
      if (closeTimeoutRef.current !== null) clearTimeout(closeTimeoutRef.current)
    }
  }, [])

  const handleClose = () => {
    setVisible(false)
    if (closeTimeoutRef.current !== null) clearTimeout(closeTimeoutRef.current)
    closeTimeoutRef.current = setTimeout(() => {
      setIsFullscreen(false)
      closeTimeoutRef.current = null
    }, 200)
  }

  return (
    <>
      {/* Normal card — children only rendered when not fullscreen to avoid double-mounting */}
      <div className={`${className} relative`}>
        <button
          type="button"
          onClick={() => setIsFullscreen(true)}
          className={`absolute top-3 right-3 z-10 p-1.5 rounded-md bg-white border border-gray-200 text-gray-400 hover:text-gray-700 hover:border-gray-400 transition-colors shadow-sm ${
            positionToBottom ? 'bottom-3 top-auto' : ''
          }`}
          title="Ver en pantalla completa"
          aria-label="Expandir a pantalla completa"
        >
          <ExpandIcon />
        </button>
        {!isFullscreen && resolve(false)}
      </div>

      {/* Fullscreen overlay — rendered exclusively when fullscreen, so children mount only once */}
      {isFullscreen && (
        <div
          ref={overlayRef}
          role="dialog"
          aria-modal="true"
          tabIndex={-1}
          className="fixed inset-0 flex flex-col bg-white outline-none"
          style={{
            zIndex: 9999,
            opacity: visible ? 1 : 0,
            transform: visible ? 'scale(1)' : 'scale(0.98)',
            transition: 'opacity 0.2s ease, transform 0.2s ease',
          }}
        >
          {/* Top bar */}
          <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200 bg-white shrink-0">
            <button
              type="button"
              onClick={handleClose}
              className="flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 hover:border-gray-400 transition-colors"
            >
              <ArrowLeftIcon />
              Volver
            </button>
            <button
              type="button"
              onClick={handleClose}
              className="p-1.5 rounded-md border border-gray-200 text-gray-400 hover:text-gray-700 hover:border-gray-400 transition-colors"
              title="Salir de pantalla completa (Esc)"
              aria-label="Salir de pantalla completa"
            >
              <CollapseIcon />
            </button>
          </div>

          {/* Content */}
          <div className={`flex-1 overflow-auto p-6 ${fullscreenContentClass}`}>
            {resolve(true)}
          </div>
        </div>
      )}
    </>
  )
}
