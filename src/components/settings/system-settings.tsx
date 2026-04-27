import { useState } from "react"
import { open } from "@tauri-apps/plugin-dialog"
import { ArrowDown, ArrowUp, FolderPlus, Power, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { localizedName, t } from "@/lib/i18n"
import {
  importPluginFolder,
  removePlugin,
  setLanguagePreference,
  setPluginEnabled,
  setPluginOrder,
} from "@/lib/tauri-api"
import type {
  AppSettingsSnapshot,
  InstalledPlugin,
  LanguagePreference,
} from "@/lib/tauri-api"

export function SystemSettings({
  snapshot,
  onSnapshotChange,
}: {
  snapshot: AppSettingsSnapshot
  onSnapshotChange: (snapshot: AppSettingsSnapshot) => void
}) {
  const [pendingAction, setPendingAction] = useState<string | null>(null)

  async function runAction(
    actionName: string,
    action: () => Promise<AppSettingsSnapshot | null>
  ) {
    setPendingAction(actionName)
    try {
      const nextSnapshot = await action()
      if (nextSnapshot) {
        onSnapshotChange(nextSnapshot)
      }
    } finally {
      setPendingAction(null)
    }
  }

  function movePlugin(index: number, direction: -1 | 1) {
    const nextIndex = index + direction
    if (nextIndex < 0 || nextIndex >= snapshot.plugins.length) {
      return
    }

    const pluginIds = snapshot.plugins.map((plugin) => plugin.id)
    const [pluginId] = pluginIds.splice(index, 1)
    if (!pluginId) {
      return
    }
    pluginIds.splice(nextIndex, 0, pluginId)

    void runAction(`order:${pluginId}`, () => setPluginOrder(pluginIds))
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 p-6">
      <section className="space-y-3">
        <div>
          <h1 className="text-base font-semibold">
            {t(snapshot.locale, "systemSettings")}
          </h1>
          <p className="mt-1 text-xs text-muted-foreground">
            oh-my-select {snapshot.appVersion}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 border-y border-border py-3">
          <label
            className="text-xs font-medium text-muted-foreground"
            htmlFor="language-preference"
          >
            {t(snapshot.locale, "language")}
          </label>
          <select
            id="language-preference"
            className="h-8 min-w-40 border border-input bg-background px-2 text-xs outline-none focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/50"
            value={snapshot.languagePreference}
            disabled={pendingAction === "language"}
            onChange={(event) => {
              const languagePreference = event.target
                .value as LanguagePreference
              void runAction("language", () =>
                setLanguagePreference(languagePreference)
              )
            }}
          >
            <option value="system">{t(snapshot.locale, "followSystem")}</option>
            <option value="zh-CN">{t(snapshot.locale, "chinese")}</option>
            <option value="en">{t(snapshot.locale, "english")}</option>
          </select>
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold">
            {t(snapshot.locale, "pluginGroup")}
          </h2>
          <Button
            type="button"
            size="sm"
            disabled={pendingAction === "import"}
            onClick={() => {
              void runAction("import", async () => {
                const selectedPath = await open({
                  directory: true,
                  multiple: false,
                })
                return typeof selectedPath === "string"
                  ? importPluginFolder(selectedPath)
                  : null
              })
            }}
          >
            <FolderPlus />
            <span>{t(snapshot.locale, "importPlugin")}</span>
          </Button>
        </div>

        {snapshot.plugins.length === 0 ? (
          <div className="border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
            {t(snapshot.locale, "noPlugins")}
          </div>
        ) : (
          <div className="divide-y divide-border border-y border-border">
            {snapshot.plugins.map((plugin, index) => (
              <PluginRow
                key={plugin.id}
                plugin={plugin}
                index={index}
                pluginCount={snapshot.plugins.length}
                snapshot={snapshot}
                pendingAction={pendingAction}
                onMove={movePlugin}
                onToggle={() => {
                  void runAction(`toggle:${plugin.id}`, () =>
                    setPluginEnabled(plugin.id, !plugin.enabled)
                  )
                }}
                onRemove={() => {
                  void runAction(`remove:${plugin.id}`, () =>
                    removePlugin(plugin.id)
                  )
                }}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

function PluginRow({
  plugin,
  index,
  pluginCount,
  snapshot,
  pendingAction,
  onMove,
  onToggle,
  onRemove,
}: {
  plugin: InstalledPlugin
  index: number
  pluginCount: number
  snapshot: AppSettingsSnapshot
  pendingAction: string | null
  onMove: (index: number, direction: -1 | 1) => void
  onToggle: () => void
  onRemove: () => void
}) {
  const statusText = plugin.enabled
    ? t(snapshot.locale, "enabled")
    : t(snapshot.locale, "disabled")
  const isBusy = pendingAction?.endsWith(`:${plugin.id}`) ?? false

  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 py-3">
      <div className="min-w-0 px-1">
        <div className="flex min-w-0 items-center gap-2">
          <div className="truncate text-sm font-medium">
            {localizedName(snapshot.locale, plugin.manifest.name)}
          </div>
          <span className="shrink-0 border border-border px-1.5 py-0.5 text-[11px] text-muted-foreground">
            {statusText}
          </span>
        </div>
        <div className="mt-1 flex min-w-0 flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span className="truncate">{plugin.id}</span>
          <span>v{plugin.manifest.version}</span>
        </div>
      </div>

      <div className="flex items-center gap-1">
        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          aria-label={t(snapshot.locale, "moveUp")}
          disabled={index === 0 || isBusy}
          onClick={() => onMove(index, -1)}
        >
          <ArrowUp />
        </Button>
        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          aria-label={t(snapshot.locale, "moveDown")}
          disabled={index === pluginCount - 1 || isBusy}
          onClick={() => onMove(index, 1)}
        >
          <ArrowDown />
        </Button>
        <Button
          type="button"
          variant={plugin.enabled ? "secondary" : "outline"}
          size="sm"
          disabled={isBusy}
          onClick={onToggle}
        >
          <Power />
          <span>{statusText}</span>
        </Button>
        <Button
          type="button"
          variant="destructive"
          size="icon-sm"
          aria-label={t(snapshot.locale, "remove")}
          disabled={isBusy}
          onClick={onRemove}
        >
          <Trash2 />
        </Button>
      </div>
    </div>
  )
}
