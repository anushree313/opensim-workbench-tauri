use thiserror::Error;

#[derive(Debug, Error)]
pub enum ScriptError {
    #[error("Script execution error: {0}")]
    Execution(String),
    #[error("Script parse error: {0}")]
    Parse(String),
}

/// Placeholder for Rhai scripting integration.
/// Will expose project operations, parametric runs, and custom post-processing.
pub struct ScriptEngine {
    engine: rhai::Engine,
}

impl ScriptEngine {
    pub fn new() -> Self {
        let engine = rhai::Engine::new();
        Self { engine }
    }

    pub fn eval_expression(&self, script: &str) -> Result<String, ScriptError> {
        let result = self
            .engine
            .eval_expression::<rhai::Dynamic>(script)
            .map_err(|e| ScriptError::Execution(e.to_string()))?;
        Ok(format!("{result}"))
    }
}

impl Default for ScriptEngine {
    fn default() -> Self {
        Self::new()
    }
}
