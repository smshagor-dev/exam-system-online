type BrandBadgeProps = {
  name: string
  shortName: string
  logoUrl?: string | null
  subtitle?: string | null
  accentClassName?: string
  textClassName?: string
}

export default function BrandBadge({
  name,
  shortName,
  logoUrl,
  subtitle,
  accentClassName = 'bg-blue-600 text-white',
  textClassName = 'text-white',
}: BrandBadgeProps) {
  return (
    <div className="flex items-center gap-3">
      {logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logoUrl} alt={name} className="h-11 w-11 rounded-2xl object-cover shadow-lg ring-1 ring-white/10" />
      ) : (
        <div className={`flex h-11 w-11 items-center justify-center rounded-2xl text-sm font-semibold shadow-lg ${accentClassName}`}>
          {shortName.slice(0, 3).toUpperCase()}
        </div>
      )}
      <div>
        <p className={`font-semibold tracking-wide ${textClassName}`}>{name}</p>
        {subtitle ? <p className="text-xs text-slate-300">{subtitle}</p> : null}
      </div>
    </div>
  )
}
