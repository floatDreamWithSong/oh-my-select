import { useEffect, useMemo, useRef } from "react"
import type { PluginBridgeRequest } from "@/lib/plugin-bridge"
import {
  bridgeClosePopup,
  bridgeOpenExternal,
  pluginStorageGet,
  pluginStorageRemove,
  pluginStorageSet,
} from "@/lib/tauri-api"
import {
  appendPluginBridgeSession,
  assertPopupBridgeRequest,
  getRequiredBridgeValueArg,
  getRequiredStringBridgeArg,
  isPluginBridgeRequest,
  postBridgeResponse,
} from "@/lib/plugin-bridge"

type PluginFrameViewKind = PluginBridgeRequest["viewKind"]

type PluginFrameProps = {
  pluginId: string
  viewKind: PluginFrameViewKind
  entryUrl: string
  title: string
  className?: string
}

export function PluginFrame({
  pluginId,
  viewKind,
  entryUrl,
  title,
  className,
}: PluginFrameProps) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null)
  const bridgeSession = useMemo(() => createBridgeSessionToken(), [entryUrl])
  const iframeSrc = useMemo(
    () => appendPluginBridgeSession(entryUrl, bridgeSession),
    [bridgeSession, entryUrl]
  )

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

      if (
        request.pluginId !== pluginId ||
        request.viewKind !== viewKind ||
        request.bridgeSession !== bridgeSession
      ) {
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
  }, [bridgeSession, pluginId, viewKind])

  return (
    <iframe
      ref={iframeRef}
      key={bridgeSession}
      sandbox="allow-scripts allow-forms"
      src={iframeSrc}
      title={title}
      className={className}
    />
  )
}

function createBridgeSessionToken() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID()
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function dispatchBridgeRequest(request: PluginBridgeRequest) {
  switch (request.method) {
    case "closePopup":
      assertPopupBridgeRequest(request)
      return bridgeClosePopup()
    case "openExternal":
      return bridgeOpenExternal(
        request.pluginId,
        getRequiredStringBridgeArg(request, 0)
      )
    case "storage.get":
      return pluginStorageGet(
        request.pluginId,
        getRequiredStringBridgeArg(request, 0)
      )
    case "storage.set":
      return pluginStorageSet(
        request.pluginId,
        getRequiredStringBridgeArg(request, 0),
        getRequiredBridgeValueArg(request, 1)
      )
    case "storage.remove":
      return pluginStorageRemove(
        request.pluginId,
        getRequiredStringBridgeArg(request, 0)
      )
  }
}
