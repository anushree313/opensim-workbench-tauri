use anyhow::Result;
use app_engine::AppEngine;
use clap::{Parser, Subcommand};

#[derive(Parser)]
#[command(name = "opensim", about = "OpenSim Workbench CLI")]
struct Cli {
    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand)]
enum Commands {
    /// Create a new project
    New {
        /// Project name
        name: String,
        /// Output file path
        #[arg(short, long)]
        output: Option<String>,
    },
    /// Open and display project info
    Info {
        /// Project file path
        path: String,
    },
    /// List available system types
    ListSystems,
}

fn main() -> Result<()> {
    tracing_subscriber::fmt::init();

    let cli = Cli::parse();
    let engine = AppEngine::new();

    match cli.command {
        Commands::New { name, output } => {
            let schematic = engine.new_project(&name)?;
            println!("Created project: {}", schematic.project_name);
            println!("Project ID: {}", schematic.project_id);

            if let Some(path) = output {
                engine.save_project(Some(&path))?;
                println!("Saved to: {path}");
            }
        }
        Commands::Info { path } => {
            let schematic = engine.open_project(&path)?;
            println!("Project: {}", schematic.project_name);
            println!("ID: {}", schematic.project_id);
            println!("Systems: {}", schematic.nodes.len());
            println!("Connections: {}", schematic.connections.len());
            for node in &schematic.nodes {
                println!(
                    "  - {} ({:?}) [{:?}]",
                    node.name, node.kind, node.state
                );
            }
        }
        Commands::ListSystems => {
            let toolbox = engine.get_toolbox();
            println!("Available systems:");
            for entry in &toolbox {
                println!(
                    "  [{:?}] {}",
                    entry.category, entry.display_name
                );
            }
        }
    }

    Ok(())
}
