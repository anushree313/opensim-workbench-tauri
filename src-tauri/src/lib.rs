mod commands;

use app_engine::AppEngine;
use std::sync::Arc;

pub fn run() {
    let engine = Arc::new(AppEngine::new());

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(engine)
        .invoke_handler(tauri::generate_handler![
            commands::new_project,
            commands::open_project,
            commands::save_project,
            commands::get_schematic,
            commands::add_system,
            commands::remove_system,
            commands::connect_systems,
            commands::disconnect,
            commands::mark_dirty,
            commands::get_toolbox,
            commands::create_geometry,
            commands::add_primitive,
            commands::remove_body,
            commands::import_geometry,
            commands::get_geometry_view,
            commands::create_mesh,
            commands::generate_mesh,
            commands::get_mesh_view,
            commands::run_solver,
            commands::get_result_view,
            commands::create_design_study,
            commands::run_doe,
            commands::fit_response_surface,
            commands::run_optimization,
            commands::get_design_exploration_view,
            commands::run_thermal_solver,
            commands::run_pareto,
            commands::run_six_sigma,
            commands::run_chip_package_analysis,
            commands::run_dba_comparison,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
