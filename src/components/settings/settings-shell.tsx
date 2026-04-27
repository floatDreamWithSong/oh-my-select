import { Component } from "react"
import { Settings, SlidersHorizontal } from "lucide-react"
import { PluginSettingsHost } from "./plugin-settings-host"
import { SystemSettings } from "./system-settings"
import type { ReactNode } from "react"
import type { AppSettingsSnapshot } from "@/lib/tauri-api"
import { Button } from "@/components/ui/button"
import { localizedName, t } from "@/lib/i18n"
import { cn } from "@/lib/utils"

type SettingsRoute = { type: "system" } | { type: "plugin"; pluginId: string }

type SettingsShellProps = {
  initialSnapshot: AppSettingsSnapshot
}

type SettingsShellState = {
  snapshot: AppSettingsSnapshot
  activeRoute: SettingsRoute
}

export class SettingsShell extends Component<
  SettingsShellProps,
  SettingsShellState
> {
  state: SettingsShellState = {
    snapshot: this.props.initialSnapshot,
    activeRoute: { type: "system" },
  }

  setSnapshot = (snapshot: AppSettingsSnapshot) => {
    this.setState((state) => {
      const { activeRoute } = state

      return {
        snapshot,
        activeRoute:
          activeRoute.type === "plugin" &&
          !snapshot.plugins.some((plugin) => plugin.id === activeRoute.pluginId)
            ? { type: "system" }
            : activeRoute,
      }
    })
  }

  render() {
    const { activeRoute, snapshot } = this.state
    const activePlugin =
      activeRoute.type === "plugin"
        ? snapshot.plugins.find((plugin) => plugin.id === activeRoute.pluginId)
        : undefined

    return (
      <div
        data-ui-scroll-container
        className="flex min-h-svh flex-col bg-background text-foreground sm:grid sm:grid-cols-[240px_minmax(0,1fr)]"
      >
        <aside className="flex min-h-0 shrink-0 flex-col border-b border-sidebar-border bg-sidebar sm:border-r sm:border-b-0">
          <div className="border-b border-sidebar-border px-4 py-3">
            <div className="truncate text-sm font-semibold">oh-my-select</div>
            <div className="mt-1 truncate text-xs text-muted-foreground">
              {t(snapshot.locale, "version")} {snapshot.appVersion}
            </div>
          </div>

          <nav className="flex min-h-0 flex-1 gap-3 overflow-x-auto overflow-y-hidden p-3 sm:flex-col sm:gap-4 sm:overflow-x-hidden sm:overflow-y-auto">
            <div className="min-w-44 space-y-1 sm:min-w-0">
              <div className="px-2 text-[11px] font-medium text-muted-foreground uppercase">
                {t(snapshot.locale, "appGroup")}
              </div>
              <SidebarButton
                active={activeRoute.type === "system"}
                icon={<Settings />}
                label={t(snapshot.locale, "systemSettings")}
                onClick={() =>
                  this.setState({ activeRoute: { type: "system" } })
                }
              />
            </div>

            <div className="min-h-0 min-w-44 space-y-1 sm:min-w-0">
              <div className="px-2 text-[11px] font-medium text-muted-foreground uppercase">
                {t(snapshot.locale, "pluginGroup")}
              </div>
              {snapshot.plugins.length === 0 ? (
                <div className="px-2 py-2 text-xs text-muted-foreground">
                  {t(snapshot.locale, "noPlugins")}
                </div>
              ) : (
                snapshot.plugins.map((plugin) => (
                  <SidebarButton
                    key={plugin.id}
                    active={
                      activeRoute.type === "plugin" &&
                      activeRoute.pluginId === plugin.id
                    }
                    icon={<SlidersHorizontal />}
                    label={localizedName(snapshot.locale, plugin.manifest.name)}
                    meta={
                      !plugin.enabled ? t(snapshot.locale, "disabled") : null
                    }
                    onClick={() =>
                      this.setState({
                        activeRoute: { type: "plugin", pluginId: plugin.id },
                      })
                    }
                  />
                ))
              )}
            </div>
          </nav>
        </aside>

        <main className="min-w-0 overflow-y-auto">
          {activeRoute.type === "system" ? (
            <SystemSettings
              snapshot={snapshot}
              onSnapshotChange={this.setSnapshot}
            />
          ) : activePlugin ? (
            <PluginSettingsHost
              pluginId={activePlugin.id}
              snapshot={snapshot}
            />
          ) : null}
        </main>
      </div>
    )
  }
}

function SidebarButton({
  active,
  icon,
  label,
  meta,
  onClick,
}: {
  active: boolean
  icon: ReactNode
  label: string
  meta?: string | null
  onClick: () => void
}) {
  return (
    <Button
      type="button"
      variant={active ? "secondary" : "ghost"}
      className={cn(
        "h-auto w-full justify-start gap-2 px-2 py-2 text-left",
        active && "border-sidebar-border bg-sidebar-accent"
      )}
      onClick={onClick}
    >
      <span className="mt-0.5 text-muted-foreground [&_svg]:size-3.5">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate">{label}</span>
        {meta ? (
          <span className="block truncate text-[11px] font-normal text-muted-foreground">
            {meta}
          </span>
        ) : null}
      </span>
    </Button>
  )
}
