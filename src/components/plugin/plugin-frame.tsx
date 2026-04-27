import { useEffect, useRef } from "react"
import type { PluginBridgeRequest } from "@/lib/plugin-bridge"
import {
  bridgeClosePopup,
  bridgeOpenExternal,
  pluginStorageGet,
  pluginStorageRemove,
  pluginStorageSet,
} from "@/lib/tauri-api"
import {
  isPluginBridgeRequest,
  postBridgeResponse,
} from "@/lib/plugin-bridge"

type PluginFrameProps = {
  pluginId: string
  entryUrl: string
  title: string
  className?: string
}

export function PluginFrame({
  pluginId,
  entryUrl,
  title,
  className,
}: PluginFrameProps) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null)

  useEffect(() => {
    const handleMessage = async (event: MessageEvent) => {
      const iframeWindow = iframeRef.current?.contentWindow

      if (!iframeWindow || event.source !== iframeWindow) {
        return
      }

      if (!isPluginBridgeRequest(event.data)) {
        return
      }

      const request = event.data

      if (request.pluginId !== pluginId) {
        return
      }

      try {
        const value = await dispatchBridgeRequest(request)
        postBridgeResponse(event.source, {
          source: "oh-my-select-host",
          id: request.id,
          ok: true,
          value,
        })
      } catch (error) {
        postBridgeResponse(event.source, {
          source: "oh-my-select-host",
          id: request.id,
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }

    window.addEventListener("message", handleMessage)

    return () => window.removeEventListener("message", handleMessage)
  }, [pluginId])

  return (
    <iframe
      ref={iframeRef}
      sandbox="allow-scripts allow-forms allow-popups"
      src={entryUrl}
      title={title}
      className={className}
    />
  )
}

function dispatchBridgeRequest(request: PluginBridgeRequest) {
  const [first, second] = request.args

  switch (request.method) {
    case "closePopup":
      return bridgeClosePopup()
    case "openExternal":
      return bridgeOpenExternal(request.pluginId, String(first))
    case "storage.get":
      return pluginStorageGet(request.pluginId, String(first))
    case "storage.set":
      return pluginStorageSet(request.pluginId, String(first), second)
    case "storage.remove":
      return pluginStorageRemove(request.pluginId, String(first))
  }
}
