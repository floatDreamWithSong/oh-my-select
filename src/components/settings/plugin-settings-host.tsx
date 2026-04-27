import { useEffect, useState } from "react"
import type {
  AppSettingsSnapshot,
  PluginSettingsPayload,
} from "@/lib/tauri-api"
import { PluginFrame } from "@/components/plugin/plugin-frame"
import { getPluginSettingsPayload } from "@/lib/tauri-api"
import { t } from "@/lib/i18n"

type PluginSettingsHostState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; payload: PluginSettingsPayload }

export function PluginSettingsHost({
  pluginId,
  snapshot,
}: {
  pluginId: string
  snapshot: AppSettingsSnapshot
}) {
  const [state, setState] = useState<PluginSettingsHostState>({
    status: "loading",
  })

  useEffect(() => {
    let ignore = false

    setState({ status: "loading" })

    getPluginSettingsPayload(pluginId)
      .then((payload) => {
        if (!ignore) {
          setState({ status: "ready", payload })
        }
      })
      .catch((error: unknown) => {
        if (!ignore) {
          setState({
            status: "error",
            message: error instanceof Error ? error.message : String(error),
          })
        }
      })

    return () => {
      ignore = true
    }
  }, [pluginId])

  if (state.status === "loading") {
    return (
      <div className="flex min-h-svh items-center justify-center p-8 text-sm text-muted-foreground">
        Loading...
      </div>
    )
  }

  if (state.status === "error") {
    return (
      <div className="flex min-h-svh items-center justify-center p-8 text-sm text-destructive">
        {state.message}
      </div>
    )
  }

  if (!state.payload.entryUrl) {
    return (
      <div className="flex min-h-svh items-center justify-center p-8 text-sm text-muted-foreground">
        {t(snapshot.locale, "pluginSettingsEmpty")}
      </div>
    )
  }

  return (
    <PluginFrame
      pluginId={state.payload.plugin.id}
      viewKind="settings"
      entryUrl={state.payload.entryUrl}
      title={state.payload.plugin.manifest.id}
      className="min-h-svh w-full border-0"
    />
  )
}
