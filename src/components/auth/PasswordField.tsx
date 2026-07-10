'use client'

import { forwardRef, useId, useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'

type PasswordFieldProps = {
  autoComplete?: string
  className: string
  error?: string
  label: string
  minLength?: number
  name?: string
  onBlur?: React.FocusEventHandler<HTMLInputElement>
  onChange?: React.ChangeEventHandler<HTMLInputElement>
  placeholder?: string
  required?: boolean
  value?: string
}

export const PasswordField = forwardRef<HTMLInputElement, PasswordFieldProps>(function PasswordField({
  autoComplete,
  className,
  error,
  label,
  minLength,
  name,
  onBlur,
  onChange,
  placeholder,
  required,
  value,
}, ref) {
  const [showPassword, setShowPassword] = useState(false)
  const inputId = useId()

  return (
    <div>
      <label htmlFor={inputId} className="block text-sm font-medium text-gray-700 mb-1">
        {label}
      </label>
      <div className="relative">
        <input
          id={inputId}
          ref={ref}
          name={name}
          type={showPassword ? 'text' : 'password'}
          value={value}
          onBlur={onBlur}
          onChange={onChange}
          className={`${className} pr-12`}
          placeholder={placeholder}
          autoComplete={autoComplete}
          required={required}
          minLength={minLength}
        />
        <button
          type="button"
          onClick={() => setShowPassword((current) => !current)}
          className="absolute inset-y-0 right-0 flex w-12 items-center justify-center text-gray-400 transition hover:text-gray-600"
          aria-label={showPassword ? 'Hide password' : 'Show password'}
          aria-pressed={showPassword}
        >
          {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
        </button>
      </div>
      {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
    </div>
  )
})
