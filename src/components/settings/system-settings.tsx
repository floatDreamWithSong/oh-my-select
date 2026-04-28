import { open } from "@tauri-apps/plugin-dialog"
import {
  ArrowDown,
  ArrowUp,
  FolderPlus,
  PackagePlus,
  Power,
  Trash2,
} from "lucide-react"
import { Component } from "react"
import type {
  AppSettingsSnapshot,
  BundledPlugin,
  InstalledPlugin,
  LanguagePreference,
} from "@/lib/tauri-api"
import { Button } from "@/components/ui/button"
import { localizedName, t } from "@/lib/i18n"
import {
  importBundledPlugins,
  importPluginFolder,
  listBundledPlugins,
  removePlugin,
  setLanguagePreference,
  setPluginEnabled,
  setPluginOrder,
} from "@/lib/tauri-api"

type SystemSettingsProps = {
  snapshot: AppSettingsSnapshot
  onSnapshotChange: (snapshot: AppSettingsSnapshot) => void
}

type SystemSettingsState = {
  errorMessage: string | null
  pendingAction: string | null
  bundledDialogOpen: boolean
  bundledPlugins: Array<BundledPlugin>
  selectedBundledPluginIds: Array<string>
}

export class SystemSettings extends Component<
  SystemSettingsProps,
  SystemSettingsState
> {
  private activeAction: string | null = null

  state: SystemSettingsState = {
    errorMessage: null,
    pendingAction: null,
    bundledDialogOpen: false,
    bundledPlugins: [],
    selectedBundledPluginIds: [],
  }

  runAction = async (
    actionName: string,
    action: () => Promise<AppSettingsSnapshot | null>
  ) => {
    if (this.activeAction) {
      return
    }

    this.activeAction = actionName
    this.setState({ errorMessage: null, pendingAction: actionName })
    try {
      const nextSnapshot = await action()
      if (nextSnapshot) {
        this.props.onSnapshotChange(nextSnapshot)
      }
      this.setState({ errorMessage: null })
    } catch (error) {
      this.setState({ errorMessage: errorToMessage(error) })
    } finally {
      this.activeAction = null
      this.setState({ pendingAction: null })
    }
  }

  movePlugin = (index: number, direction: -1 | 1) => {
    const { snapshot } = this.props
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

    void this.runAction(`order:${pluginId}`, () => setPluginOrder(pluginIds))
  }

  openBundledPluginDialog = () => {
    void this.runAction("list-bundled", async () => {
      const bundledPlugins = await listBundledPlugins()
      this.setState({
        bundledDialogOpen: true,
        bundledPlugins,
        selectedBundledPluginIds: [],
      })
      return null
    })
  }

  toggleBundledPlugin = (pluginId: string) => {
    this.setState((state) => ({
      selectedBundledPluginIds: state.selectedBundledPluginIds.includes(
        pluginId
      )
        ? state.selectedBundledPluginIds.filter((id) => id !== pluginId)
        : [...state.selectedBundledPluginIds, pluginId],
    }))
  }

  importSelectedBundledPlugins = () => {
    const pluginIds = this.state.selectedBundledPluginIds
    if (pluginIds.length === 0) {
      return
    }

    void this.runAction("import-bundled", async () => {
      const nextSnapshot = await importBundledPlugins(pluginIds)
      this.setState({
        bundledDialogOpen: false,
        bundledPlugins: [],
        selectedBundledPluginIds: [],
      })
      return nextSnapshot
    })
  }

  render() {
    const { snapshot } = this.props
    const { errorMessage, pendingAction } = this.state
    const isPending = pendingAction !== null

    return (
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 p-4 sm:p-6">
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
              className="h-8 min-w-40 border border-input bg-background px-2 text-xs outline-none focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/50 disabled:opacity-50"
              value={snapshot.languagePreference}
              disabled={isPending}
              onChange={(event) => {
                const languagePreference = event.target
                  .value as LanguagePreference
                void this.runAction("language", () =>
                  setLanguagePreference(languagePreference)
                )
              }}
            >
              <option value="system">
                {t(snapshot.locale, "followSystem")}
              </option>
              <option value="zh-CN">{t(snapshot.locale, "chinese")}</option>
              <option value="en">{t(snapshot.locale, "english")}</option>
            </select>
          </div>

          {errorMessage ? (
            <div
              role="alert"
              className="border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive"
            >
              {errorMessage}
            </div>
          ) : null}
        </section>

        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-sm font-semibold">
              {t(snapshot.locale, "pluginGroup")}
            </h2>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={isPending}
                onClick={this.openBundledPluginDialog}
              >
                <PackagePlus />
                <span>{t(snapshot.locale, "importBundledPlugin")}</span>
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={isPending}
                onClick={() => {
                  void this.runAction("import", async () => {
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
                <span>{t(snapshot.locale, "importCustomPlugin")}</span>
              </Button>
            </div>
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
                  isPending={isPending}
                  pendingAction={pendingAction}
                  pluginCount={snapshot.plugins.length}
                  snapshot={snapshot}
                  onMove={this.movePlugin}
                  onToggle={() => {
                    void this.runAction(`toggle:${plugin.id}`, () =>
                      setPluginEnabled(plugin.id, !plugin.enabled)
                    )
                  }}
                  onRemove={() => {
                    void this.runAction(`remove:${plugin.id}`, () =>
                      removePlugin(plugin.id)
                    )
                  }}
                />
              ))}
            </div>
          )}
        </section>

        {this.state.bundledDialogOpen ? (
          <BundledPluginDialog
            snapshot={snapshot}
            plugins={this.state.bundledPlugins}
            selectedPluginIds={this.state.selectedBundledPluginIds}
            isPending={isPending}
            onToggle={this.toggleBundledPlugin}
            onCancel={() => {
              this.setState({
                bundledDialogOpen: false,
                bundledPlugins: [],
                selectedBundledPluginIds: [],
              })
            }}
            onImport={this.importSelectedBundledPlugins}
          />
        ) : null}
      </div>
    )
  }
}

function errorToMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message
  }

  return String(error)
}

function PluginRow({
  plugin,
  index,
  isPending,
  pluginCount,
  snapshot,
  pendingAction,
  onMove,
  onToggle,
  onRemove,
}: {
  plugin: InstalledPlugin
  index: number
  isPending: boolean
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
    <div className="flex flex-wrap items-center justify-between gap-3 py-3">
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

      <div className="flex flex-wrap items-center gap-1">
        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          aria-label={t(snapshot.locale, "moveUp")}
          disabled={isPending || index === 0 || isBusy}
          onClick={() => onMove(index, -1)}
        >
          <ArrowUp />
        </Button>
        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          aria-label={t(snapshot.locale, "moveDown")}
          disabled={isPending || index === pluginCount - 1 || isBusy}
          onClick={() => onMove(index, 1)}
        >
          <ArrowDown />
        </Button>
        <Button
          type="button"
          variant={plugin.enabled ? "secondary" : "outline"}
          size="sm"
          disabled={isPending || isBusy}
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
          disabled={isPending || isBusy}
          onClick={onRemove}
        >
          <Trash2 />
        </Button>
      </div>
    </div>
  )
}

function BundledPluginDialog({
  snapshot,
  plugins,
  selectedPluginIds,
  isPending,
  onToggle,
  onCancel,
  onImport,
}: {
  snapshot: AppSettingsSnapshot
  plugins: Array<BundledPlugin>
  selectedPluginIds: Array<string>
  isPending: boolean
  onToggle: (pluginId: string) => void
  onCancel: () => void
  onImport: () => void
}) {
  const installedPluginIds = new Set(snapshot.plugins.map((plugin) => plugin.id))
  const canImport = selectedPluginIds.length > 0 && !isPending

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="bundled-plugin-dialog-title"
        className="flex max-h-[min(520px,calc(100vh-2rem))] w-full max-w-xl flex-col border border-border bg-background shadow-lg"
      >
        <div className="border-b border-border px-4 py-3">
          <h3 id="bundled-plugin-dialog-title" className="text-sm font-semibold">
            {t(snapshot.locale, "importBundledPluginDialogTitle")}
          </h3>
        </div>

        <div className="min-h-0 overflow-y-auto">
          {plugins.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">
              {t(snapshot.locale, "noBundledPlugins")}
            </div>
          ) : (
            <div className="divide-y divide-border">
              {plugins.map((plugin) => {
                const installed = installedPluginIds.has(plugin.id)
                const checked = selectedPluginIds.includes(plugin.id)
                const inputId = `bundled-plugin-${plugin.id}`
                const name = localizedName(snapshot.locale, plugin.manifest.name)

                return (
                  <label
                    key={plugin.id}
                    htmlFor={inputId}
                    className="flex cursor-pointer items-start gap-3 px-4 py-3 has-disabled:cursor-default has-disabled:opacity-60"
                  >
                    <input
                      id={inputId}
                      aria-label={name}
                      type="checkbox"
                      className="mt-1 size-4 accent-primary"
                      checked={checked}
                      disabled={installed || isPending}
                      onChange={() => onToggle(plugin.id)}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex min-w-0 flex-wrap items-center gap-2">
                        <span className="truncate text-sm font-medium">
                          {name}
                        </span>
                        {installed ? (
                          <span className="border border-border px-1.5 py-0.5 text-[11px] text-muted-foreground">
                            {t(snapshot.locale, "installed")}
                          </span>
                        ) : null}
                      </span>
                      <span className="mt-1 flex min-w-0 flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        <span className="truncate">{plugin.id}</span>
                        <span>v{plugin.manifest.version}</span>
                      </span>
                    </span>
                  </label>
                )
              })}
            </div>
          )}
        </div>

        <div className="flex flex-wrap justify-end gap-2 border-t border-border px-4 py-3">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={isPending}
            onClick={onCancel}
          >
            {t(snapshot.locale, "cancel")}
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={!canImport}
            onClick={onImport}
          >
            <PackagePlus />
            <span>{t(snapshot.locale, "importSelected")}</span>
          </Button>
        </div>
      </div>
    </div>
  )
}
