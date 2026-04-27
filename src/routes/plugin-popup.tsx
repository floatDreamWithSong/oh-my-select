import { createFileRoute } from "@tanstack/react-router"
import { PopupHost } from "@/components/plugin/popup-host"

export const Route = createFileRoute("/plugin-popup")({
  validateSearch: (search) => ({
    selectionId: String(search.selectionId ?? ""),
  }),
  component: PluginPopupRoute,
})

function PluginPopupRoute() {
  const { selectionId } = Route.useSearch()

  return <PopupHost selectionId={selectionId} />
}
