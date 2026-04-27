import { useEffect, useState } from "react"
import { PluginFrame } from "./plugin-frame"
import type { PopupPayload } from "@/lib/tauri-api"
import { getPopupPayload } from "@/lib/tauri-api"

type PopupHostState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; payload: PopupPayload }

export function PopupHost({ selectionId }: { selectionId: string }) {
  const [state, setState] = useState<PopupHostState>({ status: "loading" })

  useEffect(() => {
    let ignore = false

    setState({ status: "loading" })

    getPopupPayload(selectionId)
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
  }, [selectionId])

  if (state.status === "loading") {
    return (
      <div className="flex h-svh w-screen items-center justify-center text-sm text-muted-foreground">
        Loading...
      </div>
    )
  }

  if (state.status === "error") {
    return (
      <div className="flex h-svh w-screen items-center justify-center p-4 text-sm text-destructive">
        {state.message}
      </div>
    )
  }

  return (
    <PluginFrame
      pluginId={state.payload.plugin.id}
      viewKind="popup"
      entryUrl={state.payload.entryUrl}
      title={state.payload.plugin.manifest.id}
      className="h-svh w-screen border-0"
    />
  )
}
