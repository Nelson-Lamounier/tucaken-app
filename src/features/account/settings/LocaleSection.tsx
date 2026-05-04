// src/features/account/settings/LocaleSection.tsx
//
// Language, time zone, date and time format. Selects use a custom chevron
// background so they don't render the OS-native select chrome.

import type { LocaleSettings } from '../types'
import { Card, Field, Segmented, inputCls } from '../components/primitives'

interface Props {
  locale: LocaleSettings
  onChange: (patch: Partial<LocaleSettings>) => void
}

const SELECT_CHEVRON =
  "appearance-none bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2210%22 height=%226%22 viewBox=%220 0 10 6%22><path d=%22M1 1l4 4 4-4%22 stroke=%22%23a1a1aa%22 fill=%22none%22 stroke-width=%221.5%22 stroke-linecap=%22round%22/></svg>')] bg-no-repeat bg-[right_0.75rem_center] pr-9"

export function LocaleSection({ locale, onChange }: Props) {
  const selectCls = inputCls() + ' ' + SELECT_CHEVRON
  return (
    <Card>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Field label="Language">
          <select value={locale.language} onChange={(e) => onChange({ language: e.target.value })} className={selectCls}>
            <option value="en-US">English (US)</option>
            <option value="en-GB">English (UK)</option>
            <option value="es-ES">Español</option>
            <option value="fr-FR">Français</option>
            <option value="de-DE">Deutsch</option>
            <option value="ja-JP">日本語</option>
          </select>
        </Field>
        <Field label="Time zone">
          <select value={locale.timezone} onChange={(e) => onChange({ timezone: e.target.value })} className={selectCls}>
            <option value="America/Los_Angeles">Pacific (Los Angeles)</option>
            <option value="America/Denver">Mountain (Denver)</option>
            <option value="America/Chicago">Central (Chicago)</option>
            <option value="America/New_York">Eastern (New York)</option>
            <option value="Europe/London">London</option>
            <option value="Europe/Berlin">Berlin</option>
            <option value="Asia/Tokyo">Tokyo</option>
          </select>
        </Field>
        <Field label="Date format">
          <select value={locale.dateFormat} onChange={(e) => onChange({ dateFormat: e.target.value as LocaleSettings['dateFormat'] })} className={selectCls}>
            <option value="Mon DD, YYYY">May 4, 2025</option>
            <option value="DD/MM/YYYY">04/05/2025</option>
            <option value="MM/DD/YYYY">05/04/2025</option>
            <option value="YYYY-MM-DD">2025-05-04</option>
          </select>
        </Field>
        <Field label="Time format">
          <Segmented
            value={locale.timeFormat}
            onChange={(v) => onChange({ timeFormat: v })}
            options={[
              { value: '12h', label: '12-hour' },
              { value: '24h', label: '24-hour' },
            ]}
          />
        </Field>
      </div>
    </Card>
  )
}
