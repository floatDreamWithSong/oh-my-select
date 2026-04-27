export type PluginBridgeRequest = {
  source: "oh-my-select-plugin"
  id: string
  pluginId: string
  viewKind: "popup" | "settings"
  bridgeSession: string
  method:
    | "closePopup"
    | "openExternal"
    | "storage.get"
    | "storage.set"
    | "storage.remove"
  args: Array<unknown>
}

export type PluginBridgeResponse = {
  source: "oh-my-select-host"
  id: string
  ok: boolean
  value?: unknown
  error?: string
}

const bridgeMethods = new Set<PluginBridgeRequest["method"]>([
  "closePopup",
  "openExternal",
  "storage.get",
  "storage.set",
  "storage.remove",
])

const viewKinds = new Set<PluginBridgeRequest["viewKind"]>([
  "popup",
  "settings",
])

export function isPluginBridgeRequest(
  value: unknown
): value is PluginBridgeRequest {
  if (!value || typeof value !== "object") {
    return false
  }

  const candidate = value as Record<string, unknown>

  return (
    candidate.source === "oh-my-select-plugin" &&
    typeof candidate.id === "string" &&
    typeof candidate.pluginId === "string" &&
    typeof candidate.method === "string" &&
    typeof candidate.viewKind === "string" &&
    typeof candidate.bridgeSession === "string" &&
    bridgeMethods.has(candidate.method as PluginBridgeRequest["method"]) &&
    viewKinds.has(candidate.viewKind as PluginBridgeRequest["viewKind"]) &&
    Array.isArray(candidate.args)
  )
}

export function postBridgeResponse(
  target: Window,
  response: PluginBridgeResponse
) {
  target.postMessage(response, "*")
}

export function getRequiredStringBridgeArg(
  request: PluginBridgeRequest,
  index: number
) {
  const value = request.args[index]

  if (typeof value !== "string") {
    throw new Error(
      `Invalid bridge args for ${request.method}: expected string at args[${index}]`
    )
  }

  return value
}

export function getRequiredBridgeValueArg(
  request: PluginBridgeRequest,
  index: number
) {
  if (request.args.length <= index) {
    throw new Error(
      `Invalid bridge args for ${request.method}: expected value at args[${index}]`
    )
  }

  return request.args[index]
}

export function assertPopupBridgeRequest(request: PluginBridgeRequest) {
  if (request.viewKind !== "popup") {
    throw new Error("closePopup is only available from popup views")
  }
}

export function appendPluginBridgeSession(
  entryUrl: string,
  bridgeSession: string
) {
  try {
    const url = new URL(entryUrl)
    if (url.protocol !== "oms-plugin:") {
      throw new Error("Plugin iframe entry URL must use oms-plugin:")
    }

    url.searchParams.set("bridgeSession", bridgeSession)
    return url.toString()
  } catch {
    throw new Error("Plugin iframe entry URL must use oms-plugin:")
  }
}
