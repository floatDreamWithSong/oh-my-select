import { createFileRoute } from "@tanstack/react-router"
import { useEffect, useState } from "react"
import type { AppSettingsSnapshot } from "@/lib/tauri-api"
import { SettingsShell } from "@/components/settings/settings-shell"
import { getSettingsSnapshot } from "@/lib/tauri-api"

export const Route = createFileRoute("/")({ component: App })

function App() {
  const [snapshot, setSnapshot] = useState<AppSettingsSnapshot | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let ignore = false

    async function loadSettings() {
      try {
        const nextSnapshot = await getSettingsSnapshot()
        if (!ignore) {
          setSnapshot(nextSnapshot)
        }
      } catch (caughtError) {
        if (!ignore) {
          setError(
            caughtError instanceof Error
              ? caughtError.message
              : String(caughtError)
          )
        }
      }
    }

    void loadSettings()

    return () => {
      ignore = true
    }
  }, [])

  if (error) {
    return (
      <div
        data-ui-scroll-container
        className="flex min-h-svh items-center justify-center p-6 text-sm text-destructive"
      >
        {error}
      </div>
    )
  }

  if (!snapshot) {
    return (
      <div
        data-ui-scroll-container
        className="flex min-h-svh items-center justify-center p-6 text-sm text-muted-foreground"
      >
        Loading settings...
      </div>
    )
  }

  return (
    <SettingsShell
      key={`${snapshot.locale}:${snapshot.languagePreference}`}
      initialSnapshot={snapshot}
    />
  )
}
