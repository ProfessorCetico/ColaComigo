import { format, isValid, parseISO } from 'date-fns'
import { formatInTimeZone, fromZonedTime } from 'date-fns-tz'
import { ptBR } from 'date-fns/locale'

export function formatDate(
  value: string | Date,
  pattern = "dd 'de' MMMM",
  timezone?: string,
): string {
  const date = typeof value === 'string' ? parseISO(value) : value
  if (!isValid(date)) return 'Data inválida'
  return timezone
    ? formatInTimeZone(date, timezone, pattern, { locale: ptBR })
    : format(date, pattern, { locale: ptBR })
}

export function dateKey(value: string | Date, timezone = 'America/Sao_Paulo'): string {
  const date = typeof value === 'string' ? parseISO(value) : value
  return isValid(date) ? formatInTimeZone(date, timezone, 'yyyy-MM-dd') : ''
}

export function zonedTimeToIso(day: string, time: string, timezone = 'America/Sao_Paulo'): string {
  const date = fromZonedTime(`${day}T${time}:00`, timezone)
  return isValid(date) ? date.toISOString() : ''
}

export function toDateTimeLocal(value: Date): string {
  const offset = value.getTimezoneOffset() * 60_000
  return new Date(value.getTime() - offset).toISOString().slice(0, 16)
}
