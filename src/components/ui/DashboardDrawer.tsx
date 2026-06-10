'use client'

import { Dialog, DialogPanel, DialogTitle } from '@headlessui/react'
import { XMarkIcon } from '@heroicons/react/24/outline'
import React, { useEffect, useState } from 'react'

export interface DashboardDrawerProps {
  readonly isOpen: boolean
  readonly onClose: () => void
  readonly title: React.ReactNode
  readonly description?: React.ReactNode
  readonly children: React.ReactNode
  readonly actions?: React.ReactNode
  readonly unstyledContent?: boolean
  readonly fullBleed?: boolean
  /**
   * When false, the drawer is NON-MODAL: it does not trap focus, does not mark
   * the rest of the page inert, and does not close on outside click — so the
   * surrounding chrome (header nav, theme toggle) stays fully interactive while
   * the drawer is open. Closes only via the X button. Default true (modal Dialog).
   */
  readonly modal?: boolean
}

export function DashboardDrawer({
  isOpen,
  onClose,
  title,
  description,
  children,
  actions,
  unstyledContent = false,
  fullBleed = false,
  modal = true,
}: DashboardDrawerProps) {
  // Shared panel body — `Title` is DialogTitle (modal) or a plain h2 (non-modal).
  const panelBody = (Title: typeof DialogTitle | 'h2') => (
    <div className="flex h-full flex-col overflow-y-auto bg-white py-6 shadow-2xl lg:border-l lg:border-zinc-200 dark:bg-zinc-900 dark:lg:border-white/10">
      {/* Header */}
      <div className="px-4 sm:px-6">
        <div className="flex items-start justify-between">
          <div>
            <Title className="text-lg font-semibold text-zinc-900 dark:text-white">{title}</Title>
            {description && (
              <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{description}</p>
            )}
          </div>
          <div className="ml-3 flex h-7 items-center gap-4">
            {actions}
            <button
              type="button"
              onClick={onClose}
              className="rounded-md text-zinc-500 transition-colors hover:text-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:text-zinc-400 dark:hover:text-white"
            >
              <span className="sr-only">Close panel</span>
              <XMarkIcon aria-hidden="true" className="size-6" />
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className={`relative mt-6 flex-1 overflow-hidden flex flex-col${fullBleed ? '' : ' px-4 sm:px-6'}`}>
        {unstyledContent ? (
          children
        ) : (
          <div className="h-full overflow-y-auto overflow-x-hidden no-scrollbar">{children}</div>
        )}
      </div>
    </div>
  )

  if (!modal) {
    return <NonModalDrawer isOpen={isOpen}>{panelBody('h2')}</NonModalDrawer>
  }

  return (
    <Dialog open={isOpen} onClose={onClose} className="relative z-30" unmount>
      {/* Backdrop — pointer-events-none keeps it invisible to clicks */}
      <div aria-hidden="true" className="fixed inset-0 bg-black/80 backdrop-blur-sm transition-opacity pointer-events-none" />

      <div className="fixed inset-0 overflow-hidden">
        <div className="absolute inset-0 overflow-hidden">
          {/* On lg screens: width is 100vw minus sidebar (18rem). On all screens: top-16 clears the 64px header nav */}
          <div className="pointer-events-none fixed top-16 bottom-0 right-0 flex w-full lg:w-[calc(100vw-18rem)]">
            <DialogPanel
              transition
              className="pointer-events-auto w-full transform transition duration-500 ease-in-out data-closed:translate-x-full sm:duration-700"
            >
              {panelBody(DialogTitle)}
            </DialogPanel>
          </div>
        </div>
      </div>
    </Dialog>
  )
}

/**
 * Non-modal slide-over: plain DOM (no Headless UI Dialog), so the rest of the
 * page is NOT made inert and stays interactive. No focus trap, no outside-click
 * close. The dimming backdrop is pointer-events-none so chrome clicks pass through.
 */
function NonModalDrawer({ isOpen, children }: { readonly isOpen: boolean; readonly children: React.ReactNode }) {
  const [entered, setEntered] = useState(false)
  useEffect(() => {
    if (!isOpen) { setEntered(false); return }
    // Next frame so the translate-x transition runs on open.
    const id = requestAnimationFrame(() => setEntered(true))
    return () => cancelAnimationFrame(id)
  }, [isOpen])

  if (!isOpen) return null

  return (
    <div className="relative z-30">
      <div aria-hidden="true" className="fixed inset-0 bg-black/80 backdrop-blur-sm pointer-events-none" />
      <div className="pointer-events-none fixed top-16 bottom-0 right-0 flex w-full lg:w-[calc(100vw-18rem)]">
        <div
          className={`pointer-events-auto w-full transform transition-transform duration-500 ease-in-out sm:duration-700 ${entered ? 'translate-x-0' : 'translate-x-full'}`}
        >
          {children}
        </div>
      </div>
    </div>
  )
}
