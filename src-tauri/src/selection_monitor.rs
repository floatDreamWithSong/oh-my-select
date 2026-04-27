use crate::app_state::AppState;
use crate::plugin_engine::{build_view_context, PluginEngine};
use crate::plugin_registry::PluginRegistry;
use crate::popup_manager::{
    close_selection_popup, next_selection_id, selection_popup_hit_test, show_selection_popup,
    PopupSelection, SelectionPopupHitTest,
};
use monio::{Button, Event, EventType};
use std::sync::{Arc, Condvar, Mutex};
use std::thread;
use std::time::Duration;
use tauri::{AppHandle, Manager};

const MIN_DRAG_DISTANCE_PX: f64 = 5.0;
const SELECTION_STABILIZE_DELAY_MS: u64 = 50;

#[derive(Debug, Default)]
struct SelectionMonitorState {
    is_dragging: bool,
    drag_start_x: f64,
    drag_start_y: f64,
    generation: u64,
}

#[derive(Debug, Clone, Copy)]
struct SelectionJob {
    generation: u64,
}

#[derive(Clone)]
struct SelectionJobQueue {
    inner: Arc<SelectionJobQueueInner>,
}

struct SelectionJobQueueInner {
    pending: Mutex<Option<SelectionJob>>,
    available: Condvar,
}

impl SelectionJobQueue {
    fn new() -> Self {
        Self {
            inner: Arc::new(SelectionJobQueueInner {
                pending: Mutex::new(None),
                available: Condvar::new(),
            }),
        }
    }

    fn enqueue_latest(&self, job: SelectionJob) {
        let mut pending = match self.inner.pending.lock() {
            Ok(pending) => pending,
            Err(error) => {
                eprintln!("Selection job queue lock failed while enqueueing: {error}");
                return;
            }
        };
        *pending = Some(job);
        self.inner.available.notify_one();
    }

    fn wait_for_job(&self) -> Option<SelectionJob> {
        let mut pending = match self.inner.pending.lock() {
            Ok(pending) => pending,
            Err(error) => {
                eprintln!("Selection job queue lock failed while waiting: {error}");
                return None;
            }
        };

        loop {
            if let Some(job) = pending.take() {
                return Some(job);
            }

            pending = match self.inner.available.wait(pending) {
                Ok(pending) => pending,
                Err(error) => {
                    eprintln!("Selection job queue wait failed: {error}");
                    return None;
                }
            };
        }
    }
}

pub fn start_input_monitoring(app: AppHandle) {
    let monitor_state = Arc::new(Mutex::new(SelectionMonitorState::default()));
    let job_queue = SelectionJobQueue::new();

    let worker_app = app.clone();
    let worker_state = Arc::clone(&monitor_state);
    let worker_queue = job_queue.clone();
    if let Err(error) = thread::Builder::new()
        .name("oh-my-select-selection-worker".to_string())
        .spawn(move || run_selection_worker(worker_app, worker_state, worker_queue))
    {
        eprintln!("Failed to start selection worker: {error}");
    }

    let spawn_result = thread::Builder::new()
        .name("oh-my-select-selection-monitor".to_string())
        .spawn(move || {
            let result = monio::listen({
                let monitor_state = Arc::clone(&monitor_state);
                let job_queue = job_queue.clone();
                move |event| handle_input_event(&app, &monitor_state, &job_queue, event)
            });

            if let Err(error) = result {
                eprintln!("Selection monitor stopped: {error}");
            }
        });

    if let Err(error) = spawn_result {
        eprintln!("Failed to start selection monitor: {error}");
    }
}

fn handle_input_event(
    app: &AppHandle,
    monitor_state: &Arc<Mutex<SelectionMonitorState>>,
    job_queue: &SelectionJobQueue,
    event: &Event,
) {
    match event.event_type {
        EventType::MousePressed => handle_mouse_pressed(app, monitor_state, event),
        EventType::MouseReleased => handle_mouse_released(monitor_state, job_queue, event),
        _ => {}
    }
}

fn handle_mouse_pressed(
    app: &AppHandle,
    monitor_state: &Arc<Mutex<SelectionMonitorState>>,
    event: &Event,
) {
    let Some((x, y)) = left_mouse_position(event) else {
        return;
    };

    match selection_popup_hit_test(app, x, y) {
        SelectionPopupHitTest::Inside | SelectionPopupHitTest::Unknown => return,
        SelectionPopupHitTest::NoPopup | SelectionPopupHitTest::Outside => {}
    }

    close_selection_popup(app);
    clear_popup_state(app);

    let mut state = match monitor_state.lock() {
        Ok(state) => state,
        Err(error) => {
            eprintln!("Selection monitor state lock failed on mouse press: {error}");
            return;
        }
    };
    state.generation = state.generation.wrapping_add(1);
    state.is_dragging = true;
    state.drag_start_x = x;
    state.drag_start_y = y;
}

fn handle_mouse_released(
    monitor_state: &Arc<Mutex<SelectionMonitorState>>,
    job_queue: &SelectionJobQueue,
    event: &Event,
) {
    let Some((x, y)) = left_mouse_position(event) else {
        return;
    };

    let job = {
        let mut state = match monitor_state.lock() {
            Ok(state) => state,
            Err(error) => {
                eprintln!("Selection monitor state lock failed on mouse release: {error}");
                return;
            }
        };

        if !state.is_dragging {
            return;
        }

        state.is_dragging = false;
        if drag_exceeds_threshold(state.drag_start_x, state.drag_start_y, x, y) {
            Some(SelectionJob {
                generation: state.generation,
            })
        } else {
            None
        }
    };

    if let Some(job) = job {
        job_queue.enqueue_latest(job);
    }
}

fn run_selection_worker(
    app: AppHandle,
    monitor_state: Arc<Mutex<SelectionMonitorState>>,
    job_queue: SelectionJobQueue,
) {
    while let Some(job) = job_queue.wait_for_job() {
        process_selection_job(&app, &monitor_state, job);
    }
}

fn process_selection_job(
    app: &AppHandle,
    monitor_state: &Arc<Mutex<SelectionMonitorState>>,
    job: SelectionJob,
) {
    thread::sleep(Duration::from_millis(SELECTION_STABILIZE_DELAY_MS));
    if !is_current_selection_job(monitor_state, job.generation) {
        return;
    }

    handle_selection(app, monitor_state, job.generation);
}

fn handle_selection(
    app: &AppHandle,
    monitor_state: &Arc<Mutex<SelectionMonitorState>>,
    generation: u64,
) {
    let selected_text = selection::get_text().trim().to_string();
    if selected_text.is_empty() || !is_current_selection_job(monitor_state, generation) {
        return;
    }

    let (mouse_x, mouse_y) = monio::mouse_position().unwrap_or((0.0, 0.0));
    let app_state = match app.try_state::<AppState>() {
        Some(state) => state,
        None => {
            eprintln!("Selection monitor could not find AppState");
            return;
        }
    };
    let settings = app_state.settings.clone();
    let popup_state = Arc::clone(&app_state.popup);

    let registry = PluginRegistry::new(settings.clone());
    let config = match settings.load_config() {
        Ok(config) => config,
        Err(error) => {
            eprintln!("Failed to load settings for selection popup: {error}");
            return;
        }
    };
    let locale = registry.resolve_locale(config.language_preference);
    let plugins = match registry.list_plugins() {
        Ok(plugins) => plugins,
        Err(error) => {
            eprintln!("Failed to list plugins for selection popup: {error}");
            return;
        }
    };
    let engine = PluginEngine::new(settings.plugins_dir());
    let matched = match engine.match_first(&plugins, &selected_text, &locale) {
        Ok(Some(matched)) => matched,
        Ok(None) => return,
        Err(error) => {
            eprintln!("Failed to match selection against plugins: {error}");
            return;
        }
    };
    if !is_current_selection_job(monitor_state, generation) {
        return;
    }

    let selection_id = next_selection_id();
    let context = build_view_context(
        &matched.plugin,
        Some(matched.selected_text.clone()),
        matched.locale.clone(),
        config.language_preference,
        app.package_info().version.to_string(),
    );
    let selection = PopupSelection {
        selection_id: selection_id.clone(),
        plugin: matched.plugin.clone(),
        context,
    };

    if let Err(error) = insert_popup_selection(&popup_state, selection) {
        eprintln!("Failed to store popup selection: {error}");
        return;
    }

    if !is_current_selection_job(monitor_state, generation) {
        remove_popup_selection(&popup_state, &selection_id);
        return;
    }

    if let Err(error) = show_selection_popup(app, &selection_id, &matched.plugin, mouse_x, mouse_y)
    {
        eprintln!("Failed to show selection popup: {error}");
        remove_popup_selection(&popup_state, &selection_id);
    }
}

fn left_mouse_position(event: &Event) -> Option<(f64, f64)> {
    let mouse = event.mouse.as_ref()?;
    if mouse.button == Some(Button::Left) {
        Some((mouse.x, mouse.y))
    } else {
        None
    }
}

fn drag_exceeds_threshold(start_x: f64, start_y: f64, end_x: f64, end_y: f64) -> bool {
    let dx = end_x - start_x;
    let dy = end_y - start_y;
    (dx * dx + dy * dy).sqrt() > MIN_DRAG_DISTANCE_PX
}

fn should_process_selection_job(job_generation: u64, current_generation: u64) -> bool {
    job_generation == current_generation
}

fn is_current_selection_job(
    monitor_state: &Arc<Mutex<SelectionMonitorState>>,
    job_generation: u64,
) -> bool {
    match monitor_state.lock() {
        Ok(state) => should_process_selection_job(job_generation, state.generation),
        Err(error) => {
            eprintln!("Selection monitor state lock failed during generation check: {error}");
            false
        }
    }
}

fn clear_popup_state(app: &AppHandle) {
    let Some(app_state) = app.try_state::<AppState>() else {
        return;
    };
    let popup_state = Arc::clone(&app_state.popup);

    match popup_state.lock() {
        Ok(mut popup) => popup.clear(),
        Err(error) => eprintln!("Popup state lock failed while clearing selection: {error}"),
    };
}

fn insert_popup_selection(
    popup_state: &Arc<Mutex<crate::popup_manager::PopupRuntimeState>>,
    selection: PopupSelection,
) -> Result<(), &'static str> {
    let mut popup = popup_state.lock().map_err(|_| "popup state lock failed")?;
    popup.insert(selection);
    Ok(())
}

fn remove_popup_selection(
    popup_state: &Arc<Mutex<crate::popup_manager::PopupRuntimeState>>,
    selection_id: &str,
) {
    match popup_state.lock() {
        Ok(mut popup) => {
            popup.remove(selection_id);
        }
        Err(error) => eprintln!("Popup state lock failed while removing selection: {error}"),
    };
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn drag_distance_must_exceed_five_pixels() {
        assert!(!drag_exceeds_threshold(10.0, 10.0, 13.0, 14.0));
        assert!(drag_exceeds_threshold(10.0, 10.0, 16.0, 10.0));
    }

    #[test]
    fn selection_job_must_match_current_generation() {
        assert!(should_process_selection_job(7, 7));
        assert!(!should_process_selection_job(6, 7));
    }

    #[test]
    fn job_queue_keeps_only_latest_pending_selection() {
        let queue = SelectionJobQueue::new();

        queue.enqueue_latest(SelectionJob { generation: 1 });
        queue.enqueue_latest(SelectionJob { generation: 2 });

        assert_eq!(queue.wait_for_job().unwrap().generation, 2);
    }
}
