import { t } from "@/lib/i18n"
import type { AppSettingsSnapshot } from "@/lib/tauri-api"

export function PluginSettingsHost({
  snapshot,
}: {
  pluginId: string
  snapshot: AppSettingsSnapshot
}) {
  return (
    <div className="flex min-h-svh items-center justify-center p-8 text-sm text-muted-foreground">
      {t(snapshot.locale, "pluginSettingsEmpty")}
    </div>
  )
}
