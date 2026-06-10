'use client'

import { Dialog, DialogPanel, DialogTitle } from '@headlessui/react'
import { XMarkIcon } from '@heroicons/react/24/outline'
import React, { useEffect } from 'react'

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
   * Render as a non-modal slide-over: no focus trap, scroll lock, inert
   * background, or outside-click close. The sidebar and header stay interactive,
   * so nav links navigate in a single click and the theme toggle does not close
   * the panel. Close via the X button, a Cancel action, or the Escape key.
   */
  readonly nonModal?: boolean
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
  nonModal = false,
}: DashboardDrawerProps) {
  // Modal Dialog handles Escape itself; the non-modal slide-over needs parity.
  useEffect(() => {
    if (!nonModal || !isOpen) return
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [nonModal, isOpen, onClose])

  const closeButton = (
    <button
      type="button"
      onClick={onClose}
      className="rounded-md text-zinc-400 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 transition-colors"
    >
      <span className="sr-only">Close panel</span>
      <XMarkIcon aria-hidden="true" className="size-6" />
    </button>
  )

  const content = unstyledContent ? (
    children
  ) : (
    <div className="h-full overflow-y-auto overflow-x-hidden no-scrollbar">
      {children}
    </div>
  )

  const contentWrapperClassName = `relative mt-6 flex-1 overflow-hidden flex flex-col${fullBleed ? '' : ' px-4 sm:px-6'}`

  // ---------------------------------------------------------------------------
  // Non-modal slide-over: chrome stays interactive (one-click nav, theme toggle
  // keeps the panel open). Only the panel itself captures pointer events.
  // ---------------------------------------------------------------------------
  if (nonModal) {
    return (
      <div
        aria-hidden={!isOpen}
        className="pointer-events-none fixed inset-0 z-30 overflow-hidden"
      >
        <div className="pointer-events-none fixed top-16 bottom-0 right-0 flex w-full lg:w-[calc(100vw-18rem)]">
          <div
            role="dialog"
            aria-label={typeof title === 'string' ? title : undefined}
            aria-modal="false"
            className={`pointer-events-auto w-full transform transition duration-500 ease-in-out sm:duration-700 ${
              isOpen ? 'translate-x-0' : 'translate-x-full'
            }`}
          >
            <div className="flex h-full flex-col overflow-y-auto bg-zinc-900 shadow-2xl py-6 lg:border-l lg:border-white/10">
              {/* Header */}
              <div className="px-4 sm:px-6">
                <div className="flex items-start justify-between">
                  <div>
                    <h2 className="text-lg font-semibold text-white">{title}</h2>
                    {description && (
                      <p className="mt-1 text-sm text-zinc-400">{description}</p>
                    )}
                  </div>
                  <div className="ml-3 flex h-7 items-center gap-4">
                    {actions}
                    {closeButton}
                  </div>
                </div>
              </div>

              {/* Content */}
              <div className={contentWrapperClassName}>{content}</div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ---------------------------------------------------------------------------
  // Default: modal Dialog (focus trap, scroll lock, outside-click + Escape close).
  // ---------------------------------------------------------------------------
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
              <div className="flex h-full flex-col overflow-y-auto bg-zinc-900 shadow-2xl py-6 lg:border-l lg:border-white/10">
                {/* Header */}
                <div className="px-4 sm:px-6">
                  <div className="flex items-start justify-between">
                    <div>
                      <DialogTitle className="text-lg font-semibold text-white">
                        {title}
                      </DialogTitle>
                      {description && (
                        <p className="mt-1 text-sm text-zinc-400">{description}</p>
                      )}
                    </div>
                    <div className="ml-3 flex h-7 items-center gap-4">
                      {actions}
                      {closeButton}
                    </div>
                  </div>
                </div>

                {/* Content */}
                <div className={contentWrapperClassName}>{content}</div>
              </div>
            </DialogPanel>
          </div>
        </div>
      </div>
    </Dialog>
  )
}
